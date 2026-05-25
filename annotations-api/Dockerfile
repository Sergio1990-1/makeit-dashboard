# Mini-API for /api/annotations — sits behind nginx Basic Auth on the VPS.
#
# Image is intentionally small and obvious: pinned python + 4 deps. If
# this Dockerfile starts collecting build steps you're probably putting
# too much in here — move shared logic into a sibling service instead.

FROM python:3.12-slim

# Non-root runtime account. Container writes the JSON into a volume
# (/data) so we don't need root for that, and not running as root limits
# blast radius if FastAPI ever has an RCE in our pinned versions.
RUN useradd --create-home --uid 10001 app

WORKDIR /app

# Install deps first so the layer caches across code changes.
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY main.py /app/main.py

# /data is the JSON volume mount-point. We pre-create it so first boot
# doesn't fail with "permission denied" if the host bind-mount is empty.
RUN mkdir -p /data && chown -R app:app /data /app
USER app
ENV ANNOT_FILE=/data/annotations.json \
    ANNOT_LOCK=/data/annotations.json.lock \
    ANNOT_BACKUPS=/data/annotations.backups

EXPOSE 8080

# Healthcheck via stdlib urllib (no curl in slim image, and adding
# curl would bloat the layer). 30s interval matches typical
# docker-compose / orchestrator expectations; 5s timeout is generous
# for a /healthz that does not touch disk. After 3 consecutive failures
# the container is marked unhealthy and `restart: unless-stopped`
# (compose) will recycle it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request, sys; \
sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=3).status == 200 else 1)" \
  || exit 1

# `--proxy-headers` so X-Forwarded-* from nginx are honoured (we log the
# real client IP, not the nginx loopback). One worker is enough for this
# write-light service — the FileLock would serialise extra workers anyway.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers", "--workers", "1"]
