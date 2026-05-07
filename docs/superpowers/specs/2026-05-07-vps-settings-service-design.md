# VPS Settings Service — Design

**Date:** 2026-05-07
**Status:** Approved (verbal, three sections + risk audit)
**Owner:** sergey
**Related:** fixes follow-up to commits `98f0c4f` (degraded mode mount) and `eb70b35` (cold-start splash lift without token).

---

## Problem

The dashboard's settings store (`/settings/*` — bearer-auth secrets) lives inside the makeit-pipeline service on a separate Mac (`sergeymakarov`), reachable from the VPS via SSH reverse tunnel on port 8766. When that Mac is offline, the dashboard cannot load any secret from the server-side store. Combined with Task-05 migration that wipes `localStorage.github_token` after a successful `PUT /settings/{key}`, users who already migrated end up with **no token at all** and can only recover by re-pasting it manually.

The Pipeline Mac is also the compute node for audits, transcripts, and the pipeline batch runner. Coupling secret storage to that runtime makes the Mac a SPOF for things that have nothing to do with batch execution.

## Goal

Decouple the settings store from the Pipeline runtime by hosting `/settings/*` on the VPS itself (89.167.17.79). After this change:

- Pipeline Mac offline → only Pipeline tab, audit, transcripts degrade (their own state).
- Dashboard, monitoring, milestones, settings panel, and secret loading all keep working.
- Pipeline Mac becomes a pure compute node; config tier lives on the VPS next to the dashboard.

## Non-goals

- No change to the encryption scheme, schema, or API surface (1-to-1 migration).
- No change to client behaviour — `useSettings()`, `loadAllSettings()`, `getSetting()` work identically.
- No multi-user — single `username = "default"` stays the default for now.
- No re-encryption — the existing AES-GCM-256 master key is reused.

## Architecture

```
┌─────────────────────┐                ┌──────────────────────────────┐
│ Browser (dashboard) │                │ VPS 89.167.17.79             │
│                     │ HTTPS          │ ┌──────────────────────────┐ │
│  settings.ts ─────────────────────────►│ nginx_proxy /api/settings/│ │
│                     │                │ │     ↓                    │ │
│  pipeline.ts ─────────────────────────►│ nginx_proxy /api/pipeline/│ │
│                     │                │ │     ↓                    │ │
└─────────────────────┘                │ │ makeit_settings:8768     │ │
                                       │ │   FastAPI + SQLite       │ │
                                       │ │   /data/settings.db      │ │
                                       │ │   AES-GCM-256            │ │
                                       │ └──────────────────────────┘ │
                                       │             ┃                │
                                       │   /api/pipeline/* still      │
                                       │   tunnels to Pipeline Mac    │
                                       └──────────────────────────────┘
```

Two services on the VPS, served by the same shared `nginx_proxy`. They share nothing — different containers, different routes, independent failure domains.

## Components

### `services/settings/` (in makeit-dashboard repo)

```
services/settings/
  src/makeit_settings/
    __init__.py
    settings_store.py    # verbatim copy from makeit-pipeline (200 lines)
    app.py               # FastAPI: 4 endpoints + bearer auth + /health (~120 lines)
  tests/
    test_api.py          # adapted from makeit-pipeline tests/test_settings_api.py
  Dockerfile             # python:3.12-slim + uv
  pyproject.toml
  README.md
  .env.example
```

### Endpoints (1-to-1 with current Pipeline impl)

- `GET /settings/keys` → `["github_token", ...]`
- `GET /settings` → `[{key, masked_value}, ...]`
- `GET /settings/{key}` → `{key, value}`
- `PUT /settings/{key}` (body: `{value}`) → 204
- `DELETE /settings/{key}` → 204
- `GET /health` → 200 (for nginx upstream check)

Auth: `Authorization: Bearer <PIPELINE_SETTINGS_TOKEN>` on every `/settings/*` request, constant-time compared. Unauthorized → 401, never leaks whether the token env was set.

### Storage

- SQLite at `/data/settings.db` inside container.
- Volume mounted from `/opt/apps/makeit-stack/settings-data/settings.db` on host.
- Encryption: AES-GCM-256, master key from env `PIPELINE_SETTINGS_ENCRYPTION_KEY` (base64 32 bytes).
- AAD = `f"{username}|{key}".encode()` — moving rows breaks decryption.

### VPS Docker entry

```yaml
makeit_settings:
  build:
    context: ./makeit-dashboard/services/settings
  container_name: makeit_settings
  restart: unless-stopped
  env_file:
    - ./settings.env
  volumes:
    - ./settings-data:/data
  expose:
    - "8768"
  networks:
    - proxy_network
```

`./settings.env` (root-only, not committed) carries `PIPELINE_SETTINGS_TOKEN` and `PIPELINE_SETTINGS_ENCRYPTION_KEY`.

### Nginx route

Append to `/opt/apps/nginx-proxy/conf.d/makeit.conf`:

```nginx
location /api/settings/ {
    rewrite ^/api/settings(/.*) $1 break;
    proxy_pass http://makeit_settings:8768;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
    proxy_send_timeout 60s;
}
```

### Dashboard frontend changes

- `public/config.js` — add `SETTINGS_URL: "/api/settings"` next to `PIPELINE_URL`.
- `src/utils/config.ts` — expose `SETTINGS_BASE_URL`, falling back to `PIPELINE_BASE_URL` for backwards compatibility (covers local dev where Pipeline still serves /settings).
- `src/utils/settings.ts` — replace `PIPELINE_BASE_URL` with `SETTINGS_BASE_URL`.
- Type def: `window.__MAKEIT_CONFIG__.SETTINGS_URL?: string`.

`pipeline.ts`, `quality.ts`, `debate.ts`, `transcript.ts` — unchanged, still hit `PIPELINE_BASE_URL`.

## Migration sequence

Zero downtime. Pipeline `/settings/*` keeps working until step 5.

1. **Code & local test** — write service + tests, run `pytest`, lint dashboard.
2. **PR & merge** — branch → review → merge to main (with explicit user approval).
3. **VPS data prep** — `mkdir settings-data/`, scp the SQLite snapshot from Pipeline Mac, create `settings.env` (root 0600, not committed).
4. **VPS service up** — backup `docker-compose.yml`, edit, `docker compose config` validate, `docker compose up -d --no-deps makeit_settings`.
5. **Smoke test container** — `docker exec nginx_proxy curl -sf -H "Bearer $TOKEN" http://makeit_settings:8768/settings/keys` — expect identical key list to current Pipeline.
6. **Nginx route** — backup `makeit.conf`, append `/api/settings/` block, `nginx -t` validate, `nginx -s reload` only if valid.
7. **Public smoke test** — `curl -sf -H "Bearer $TOKEN" http://localhost/api/settings/keys` from VPS.
8. **Flip dashboard** — backup `config.js`, add `SETTINGS_URL: "/api/settings"`, refresh browser, verify `loadAllSettings()` succeeds via Network tab.
9. **Pipeline cleanup** (separate PR, T+1-2 days after stable) — remove `/settings/*` from `api.py`, delete `settings_store.py`, drop `tests/test_settings_api.py`, drop `PIPELINE_SETTINGS_*` from `.env`, delete `~/.makeit-pipeline/settings.db` on the Pipeline Mac.

## Failure handling and rollback

| Failure point | Rollback |
|---|---|
| Container build fails | No effect — `makeit_settings` not started, others untouched. |
| Container starts but `/settings/keys` returns wrong data | `docker compose stop makeit_settings`, investigate. Pipeline `/settings/*` still serves dashboard. |
| Nginx config invalid | `cp makeit.conf.bak.<ts> makeit.conf`, do not reload. Existing nginx keeps running with old config. |
| Nginx route misroutes | `cp makeit.conf.bak.<ts> makeit.conf && docker exec nginx_proxy nginx -s reload` (~5 sec). |
| Dashboard breaks after `config.js` flip | `cp config.js.bak.<ts> config.js`, browser refresh. Dashboard uses Pipeline `/settings/*` again. |
| Encryption key wrong on VPS | All `GET /settings/{key}` raise `InvalidTag` → 500. Container starts but data inaccessible. Fix env, restart container. Pipeline DB on Mac untouched. |

## Risk to other VPS services

`nginx_proxy` is shared by 7+ sites (beer-bot, beer-bot-staging, moliyakg, sewing-erp, mankassa-disabled, uchet via dashboard, mymoney). A broken `nginx -s reload` would crash all of them.

**Mitigations enforced for every VPS edit:**
- `cp X X.bak.$(date +%Y%m%d-%H%M%S)` before any modification.
- `docker compose config` before `up -d`.
- `docker exec nginx_proxy nginx -t` before `nginx -s reload`. Skip reload on failure.
- `docker compose up -d --no-deps makeit_settings` — never restart neighbour services.
- No `down`, no `rm -f`, no `network prune`, no `nginx stop`.

Pipeline Mac is not touched at all by this change. The user manually snapshots the DB and provides credentials. After cleanup PR, Pipeline still runs as a compute node.

## Testing

Service:
- `pytest` covers all 5 endpoints + auth failure cases.
- Manual: `curl -H "Bearer fake" http://localhost:8768/settings/keys` returns 401.
- Manual: `curl -H "Bearer $TOKEN" http://localhost:8768/settings/keys` returns same list as current Pipeline.

Dashboard:
- `npm run lint` clean.
- `npx tsc --noEmit` clean.
- Manual browser test in dev: localStorage has bootstrap token, `loadAllSettings()` succeeds.

VPS:
- After step 6: `curl -sf -H "Bearer $TOKEN" http://localhost/api/settings/keys` from VPS shell.
- After step 8: open dashboard in incognito browser, dev tools Network tab — verify request goes to `/api/settings/...` and returns 200.

## What NOT to do

- Don't generate a new encryption key — reuse the existing one (avoids re-encrypt loop and keeps client transparent).
- Don't change endpoint shapes — Phase-1.5 already standardised them; clients depend on the current array shape.
- Don't fold settings into the auditor or cache containers — distinct failure domain matters.
- Don't bind port 8768 to the host — only `expose:` so it stays inside the docker network.
