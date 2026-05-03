import type { Monitor, MonitorStatus } from "../types";
import { dispatchExternalAuthLost } from "./external-auth-events";

interface BetterStackMonitor {
  id: string;
  attributes: {
    url: string;
    pronounceable_name: string;
    status: string;
    availability: number | null;
    last_checked_at: string | null;
  };
}

interface BetterStackResponse {
  data: BetterStackMonitor[];
}

function mapStatus(raw: string): MonitorStatus {
  if (raw === "up") return "up";
  if (raw === "down") return "down";
  if (raw === "paused") return "paused";
  return "pending";
}

export async function fetchMonitors(workerUrl: string): Promise<Monitor[]> {
  const res = await fetch(workerUrl);

  if (res.status === 401 || res.status === 403) {
    // FR-8: BetterStack token was rejected (forwarded by the worker proxy).
    // Notify App.tsx so it can prompt the user via SettingsPanel.
    dispatchExternalAuthLost("betterstack");
  }

  if (!res.ok) {
    throw new Error(`Proxy error: ${res.status}`);
  }

  const json: BetterStackResponse = await res.json();

  return json.data.map((m) => ({
    id: m.id,
    name: m.attributes.pronounceable_name,
    url: m.attributes.url,
    status: mapStatus(m.attributes.status),
    uptimePct: m.attributes.availability,
    lastCheckedAt: m.attributes.last_checked_at,
  }));
}
