FROM python:3.12-slim AS build
WORKDIR /app
COPY pyproject.toml ./
COPY src/ ./src/
RUN pip install --no-cache-dir .

FROM python:3.12-slim
WORKDIR /app
RUN useradd --system --uid 1001 settings && \
    mkdir -p /data && chown -R settings:settings /data
COPY --from=build /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=build /usr/local/bin /usr/local/bin
COPY src/ ./src/
USER settings
ENV PYTHONPATH=/app/src \
    MAKEIT_SETTINGS_DB_PATH=/data/settings.db
EXPOSE 8768
CMD ["uvicorn", "makeit_settings.app:app", "--host", "0.0.0.0", "--port", "8768"]
