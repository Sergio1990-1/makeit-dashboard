# makeit-settings

Encrypted bearer-auth secret store for the MakeIT dashboard. Replaces the
`/settings/*` endpoints that previously lived in `makeit-pipeline`.

## Endpoints

- `GET  /settings/keys`     → `["github_token", ...]`
- `GET  /settings`          → `[{key, masked_value}, ...]`
- `GET  /settings/{key}`    → `{key, value}`
- `PUT  /settings/{key}`    body `{value}` → 204
- `DELETE /settings/{key}`  → 204
- `GET  /health`            → 200

All `/settings/*` routes require `Authorization: Bearer <PIPELINE_SETTINGS_TOKEN>`.

## Local development

```bash
cp .env.example .env
# fill in PIPELINE_SETTINGS_TOKEN and PIPELINE_SETTINGS_ENCRYPTION_KEY
pip install -e ".[dev]"
PIPELINE_SETTINGS_TOKEN=dev PIPELINE_SETTINGS_ENCRYPTION_KEY=$(openssl rand -base64 32) \
    uvicorn makeit_settings.app:app --port 8768 --reload
```

## Testing

```bash
pytest
```

## Deploy

Built and run on VPS via `/opt/apps/makeit-stack/docker-compose.yml`
(service `makeit_settings`).
