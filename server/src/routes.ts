import { Router } from "express";
import { getData, getStatus, isSyncing, syncAndWait } from "./cache";
import { SYNC_API_KEY } from "./config";

export const router = Router();

// Health check
router.get("/health", (_req, res) => {
  const status = getStatus();
  res.json({
    status: status.error ? "degraded" : "ok",
    ...status,
  });
});

// Main endpoint: get all project data
router.get("/api/projects", (_req, res) => {
  const status = getStatus();
  const data = getData();

  if (data.length === 0 && !status.syncing) {
    res.status(503).json({ error: "No data yet. Sync in progress or failed.", lastSync: status.lastSync, syncing: status.syncing });
    return;
  }

  res.json({
    data,
    lastSync: status.lastSync,
    syncDuration: status.syncDuration,
  });
});

// Trigger manual sync (blocking — waits for completion)
// Protected by API key to prevent abuse
router.post("/api/sync", async (req, res) => {
  // Auth check: require API key if configured
  if (SYNC_API_KEY) {
    const key = req.headers["x-api-key"];
    if (key !== SYNC_API_KEY) {
      res.status(401).json({ error: "Invalid or missing X-Api-Key" });
      return;
    }
  }

  try {
    await syncAndWait();
    const status = getStatus();
    res.json({ status: "completed", lastSync: status.lastSync, syncDuration: status.syncDuration });
  } catch (err) {
    res.status(500).json({ status: "failed", error: err instanceof Error ? err.message : String(err) });
  }
});
