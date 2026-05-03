import type { HealthFinding, HealthLayer } from "../../../types/health";

const SEVERITY_RANK: Record<HealthFinding["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function sortFindings(arr: HealthFinding[]): HealthFinding[] {
  return [...arr].sort((a, b) => {
    const sa = SEVERITY_RANK[a.severity] ?? 9;
    const sb = SEVERITY_RANK[b.severity] ?? 9;
    if (sa !== sb) return sa - sb;
    return a.layer - b.layer;
  });
}

export function groupByLayer(arr: HealthFinding[]): Record<HealthLayer, HealthFinding[]> {
  const out: Record<HealthLayer, HealthFinding[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const f of arr) out[f.layer].push(f);
  return out;
}

// ru-RU pluralization. n=1 → one, n=2..4 → few, остальное → many. С учётом 11..14.
export function pluralize(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function formatScanTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    if (sameDay) return `сегодня ${hh}:${mm}`;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      d.getFullYear() === yesterday.getFullYear() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getDate() === yesterday.getDate();
    if (isYesterday) return `вчера ${hh}:${mm}`;
    return d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

// Count-up shim. Anim was unstable across StrictMode double-mount in the
// preview env (numbers stuck at 0). Keeping the same hook signature so
// callers don't change; just returns the target value directly. Re-introduce
// the easing later when the animation primitive is bullet-proof.
export function useCountUp(target: number, _dur = 900, _delay = 100): number {
  void _dur;
  void _delay;
  return Number.isFinite(target) ? target : 0;
}
