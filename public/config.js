// Runtime configuration — override per deployment.
// On VPS this file is replaced via Docker volume mount.
window.__MAKEIT_CONFIG__ = {
  AUDITOR_URL: "http://127.0.0.1:8765",
  PIPELINE_URL: "http://127.0.0.1:8766",
  // SETTINGS_URL: "http://127.0.0.1:8768",  // override only when running makeit-settings locally; else PIPELINE_URL is used
  CACHE_URL: "http://127.0.0.1:8767",
};
