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
`/opt/apps/nginx-proxy/conf.d/makeit.conf`:

```nginx
location /api/annotations {
    # Strip /api so FastAPI sees the bare path (/, /<id>).
    rewrite ^/api/annotations(/.*)?$ $1 break;
    if ($uri = "") { set $uri "/"; }

    proxy_pass http://makeit-annotations-api:8080;
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
```

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
