#!/bin/bash
# VPS deploy script for makeit-stack (89.167.17.79).
# Source of truth: this file. On the server it lives at
# /opt/apps/makeit-stack/deploy.sh and is updated by copying from this repo.
set -euo pipefail
cd /opt/apps/makeit-stack

echo "=== Pulling dashboard ==="
cd makeit-dashboard
git fetch origin main
git reset --hard origin/main
git log -1 --oneline
cd ..

echo "=== Pulling auditor ==="
cd makeit-auditor
git fetch origin main
git reset --hard origin/main
git log -1 --oneline
cd ..

echo "=== Building and starting ==="
docker compose build
docker compose up -d

# Validate every conf.d/*.conf BEFORE touching the running nginx. A sibling
# stack's broken config (missing cert, bad upstream) would otherwise crash
# the whole proxy on restart and take every site on this host down.
echo "=== Validating nginx config ==="
if ! docker exec nginx_proxy nginx -t; then
  echo "❌ nginx config invalid — НЕ перезагружаю прокси."
  echo "Дамп conf.d:"
  docker exec nginx_proxy ls -la /etc/nginx/conf.d/
  exit 1
fi

# Graceful reload — no downtime. `docker restart` is only needed when
# docker-compose itself changed, not for conf.d edits.
echo "=== Reloading nginx proxy ==="
docker exec nginx_proxy nginx -s reload

# Containers may be Up but still booting (cache, dashboard) — retry instead
# of one-shot curl so a slow start doesn't surface as a false FAIL.
check_with_retry() {
  local name="$1"
  local cmd="$2"
  local max_tries=6
  local delay=5
  for i in $(seq 1 $max_tries); do
    if eval "$cmd" >/dev/null 2>&1; then
      echo "$name: OK (try $i)"
      return 0
    fi
    sleep $delay
  done
  echo "$name: FAIL after $max_tries tries"
  return 1
}

echo "=== Verifying ==="
EXIT=0
check_with_retry "Dashboard"       "docker exec nginx_proxy curl -sf http://makeit_dashboard:80/" || EXIT=1
check_with_retry "Auditor"         "docker exec makeit_auditor curl -sf http://localhost:8765/api/projects" || EXIT=1
check_with_retry "Cache"           "docker exec nginx_proxy curl -sf http://makeit_cache:8767/health" || EXIT=1
check_with_retry "Pipeline tunnel" "curl -sf http://127.0.0.1:8766/health" || EXIT=1

echo "=== Done ==="
docker ps --filter name=makeit --format "table {{.Names}}\t{{.Status}}"

exit $EXIT
