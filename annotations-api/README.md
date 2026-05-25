# annotations-api

Tiny FastAPI service backing `/api/annotations` for the «Качество кода»
dashboard tab. List/create/delete manually-authored timeline events
(skill updates, deploys, ad-hoc notes).

See [`main.py`](./main.py) header docstring for design rationale.

## Local dev

```bash
cd annotations-api
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt pytest httpx
ANNOT_FILE=/tmp/annot.json uvicorn main:app --reload --port 8080

# In another terminal:
curl http://localhost:8080/healthz
curl http://localhost:8080/
curl -X POST http://localhost:8080/ \
  -H 'Content-Type: application/json' \
  -d '{"occurred_at":"2026-05-22T00:00:00Z","category":"deploy","scope":"global","title":"manual test"}'
```

Tests:

```bash
pytest annotations-api/test_main.py -v
```

## Production deploy (VPS)

The service runs as a container in the `makeit-stack` docker-compose on
the VPS. It needs:

1. A **shared volume** for the JSON file. The web container reads it
   under `/data/annotations.json` (served via the SPA fallback for
   legacy clients); the api container reads and writes it under
   `/data/annotations.json` (this service's `$ANNOT_FILE`).
2. An **nginx route** that maps `/api/annotations` and
   `/api/annotations/*` to this container.

### 1. docker-compose snippet

Add to `/opt/apps/makeit-stack/docker-compose.yml`:

```yaml
services:
  annotations-api:
    build: /opt/apps/makeit-dashboard/annotations-api
    container_name: makeit-annotations-api
    restart: unless-stopped
    volumes:
      - /opt/apps/makeit-stack/web/data:/data
    networks:
      - makeit-net  # same network as nginx-proxy
    # No ports: — nginx-proxy reaches it on the internal docker network.
    environment:
      ANNOT_FILE: /data/annotations.json
      ANNOT_LOCK: /data/annotations.json.lock
      ANNOT_BACKUPS: /data/annotations.backups
```

`build: /opt/apps/makeit-dashboard/annotations-api` reuses the
`makeit-dashboard` checkout that `deploy.sh` already `git pull`s — no
new repo to clone.

After editing the compose file, on the VPS:

```bash
cd /opt/apps/makeit-stack
docker compose build annotations-api
docker compose up -d annotations-api
docker compose logs -f annotations-api  # confirm it's listening on 8080
```

### 2. nginx snippet

Add inside the dashboard `server { }` block in
`/opt/apps/nginx-proxy/conf.d/makeit.conf`. Two location blocks — one
for the exact `/api/annotations` (list + create), one for
`/api/annotations/<id>` (delete). The trailing `/` on `proxy_pass` is
the bit that tells nginx to strip the matched location prefix and
forward the rest as the upstream path — without it, FastAPI sees
`/api/annotations` instead of `/`.

```nginx
# Exact path: GET (list) and POST (create) — both hit FastAPI's "/" route.
location = /api/annotations {
    proxy_pass http://makeit-annotations-api:8080/;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # 4KB cap matches the in-process MAX_BODY_BYTES — nginx rejects huge
    # bodies before they ever reach the app.
    client_max_body_size 4k;

    # Basic Auth is inherited from the parent `server { auth_basic … }`
    # block — DO NOT add `auth_basic off;` here or the mini-API becomes
    # write-open to the internet.
}

# Sub-paths: DELETE /api/annotations/<id> → FastAPI's "/<id>" route.
# Note both location AND proxy_pass have trailing slashes — that pair
# is what strips the prefix correctly.
location /api/annotations/ {
    proxy_pass http://makeit-annotations-api:8080/;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 4k;
}
```

> **Why not the simpler `rewrite ^/api/annotations(/.*)?$ $1 break;`?**
> When the path is exactly `/api/annotations` (no trailing slash), the
> optional `(/.*)?` captures nothing, so `$1` becomes empty and the
> upstream receives an empty path — invalid HTTP/1.1, returns
> 400/500. The `if ($uri = "")` trick doesn't help because `$uri` is
> read-only at proxy time. Two explicit location blocks are clearer
> and don't have this edge case.

Reload nginx after editing:

```bash
docker compose exec nginx-proxy nginx -t
docker compose exec nginx-proxy nginx -s reload
```

### 3. Smoke test

```bash
USER='admin'; PASS='<from .htpasswd>'
HOST='https://your-vps-hostname'

curl -u "$USER:$PASS" "$HOST/api/annotations"
# → []  (or existing events)

curl -u "$USER:$PASS" -X POST "$HOST/api/annotations" \
  -H 'Content-Type: application/json' \
  -d '{"occurred_at":"2026-05-22T00:00:00Z","category":"manual","scope":"global","title":"smoke"}'
# → 201 + JSON of the new event
```

### Volume layout on the VPS

```
/opt/apps/makeit-stack/web/data/
├── codex-quality.json          ← published by GitHub Actions sweep
├── annotations.json            ← owned by annotations-api
├── annotations.json.lock       ← FileLock sentinel
└── annotations.backups/
    ├── annotations-20260522-031712-1700000000000000000.json
    └── …                       ← rolling 100 most-recent snapshots
```

The dashboard container mounts the same dir read-only so the legacy
`/data/*.json` URLs keep working during the cutover window.

## Disaster recovery

If `annotations.json` ever ends up corrupted:

```bash
# On the VPS:
cd /opt/apps/makeit-stack/web/data
ls -t annotations.backups/ | head -5      # pick the latest healthy one
cp annotations.backups/annotations-XXXX.json annotations.json.tmp
mv annotations.json.tmp annotations.json  # atomic
docker compose restart annotations-api    # only needed if it was looping
```

The mini-API will resume from whatever it finds on next request.
