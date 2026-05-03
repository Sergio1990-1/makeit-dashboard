import { useEffect, useMemo, useState } from "react";
import type { HealthFinding, HealthReport, HealthSeverity } from "../../types/health";

interface Props {
  reports: HealthReport[];
  loading: boolean;
  /** Timestamp of the most recent successful scan; null while we have no data yet. */
  lastUpdated: Date | null;
  /** Switches to the Projects tab and opens the Project Health drilldown for `repo`. */
  onOpenHealth: (repo: string) => void;
}

// Sorting / filtering knobs — single source of truth so a designer tweak is
// one edit instead of grep-and-replace through the file.
const MAX_CARDS = 5;
const MIN_SEVERITY: HealthSeverity = "medium";
// 90 chars keeps each card to one visual line on the dashboard column at the
// narrowest layout width (~480px). Longer content is truncated with «…».
const TRUNCATE_LEN = 90;
// Skeleton placeholder count during a cold load (no cached reports yet).
const SKELETON_COUNT = 4;

// Sorted by descending priority so we can compare-by-index and drop anything
// below MIN_SEVERITY.
const SEVERITY_ORDER: HealthSeverity[] = ["critical", "high", "medium", "low"];

// Local weights for sort priority. The checklist YAML has its own
// `severity_weights` for the score deduction (different domain — score math
// vs. card sorting), so these two intentionally don't share a constant.
const SEVERITY_WEIGHT: Record<HealthSeverity, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0.5,
};

interface RankedFail {
  finding: HealthFinding;
  repo: string;
  generatedAt: string;
  score: number;
}

// One day in ms — used for the age-factor calculation. age_factor caps at
// 2 (after 7 days) so very old findings can't dominate forever.
const DAY_MS = 86_400_000;

function severityAtLeast(s: HealthSeverity, min: HealthSeverity): boolean {
  const idx = SEVERITY_ORDER.indexOf(s);
  if (idx === -1) return false; // unknown severity → drop
  return idx <= SEVERITY_ORDER.indexOf(min);
}

// How often the "обновлено N мин назад" label refreshes. 30s keeps the
// "0 сек назад" → "30 сек назад" → "1 мин назад" transitions snappy without
// flooding React with re-renders.
const META_TICK_MS = 30_000;

// Truncate by code-point (Array.from splits surrogate pairs correctly) so
// we never slice through the middle of a multi-byte glyph.
function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return chars.slice(0, max).join("").trimEnd() + "…";
}

// "обновлено N мин назад". For lastUpdated=null returns null so the caller
// can omit the meta line entirely. Times under a minute show seconds.
function formatRelativeTime(d: Date | null, now: number): string | null {
  if (!d) return null;
  const diffMs = now - d.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "только что";
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `обновлено ${sec} сек назад`;
  const min = Math.round(sec / 60);
  if (min < 60) return `обновлено ${min} мин назад`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `обновлено ${hr} ч назад`;
  const days = Math.round(hr / 24);
  return `обновлено ${days} д назад`;
}

// Collect every fail across reports, score by severity × age, and return the
// top-N. Tie-break by repo name so the order is stable across renders.
//
// TODO(epic-006): swap `days_since_first_seen` for an actual "first seen" lookup
// once we persist finding history. For MVP we approximate with the report
// generation timestamp, which means a fresh scan resets the age factor — fine
// while findings tend to repeat across scans.
function rankFails(reports: HealthReport[], nowMs: number): RankedFail[] {
  const out: RankedFail[] = [];
  for (const report of reports) {
    const generatedAtMs = new Date(report.generated_at).getTime();
    const ageDays = Number.isFinite(generatedAtMs)
      ? Math.max(0, (nowMs - generatedAtMs) / DAY_MS)
      : 0;
    const ageFactor = 1 + Math.min(7, ageDays) / 7;
    for (const finding of report.findings) {
      if (finding.status !== "fail") continue;
      if (!severityAtLeast(finding.severity, MIN_SEVERITY)) continue;
      const weight = SEVERITY_WEIGHT[finding.severity] ?? 0;
      out.push({
        finding,
        repo: report.repo,
        generatedAt: report.generated_at,
        score: weight * ageFactor,
      });
    }
  }
  // Stable-by-name tie-break — important for visual continuity across
  // refreshes when two findings tie on score.
  return out
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.repo !== b.repo) return a.repo.localeCompare(b.repo);
      return a.finding.rule_id.localeCompare(b.finding.rule_id);
    })
    .slice(0, MAX_CARDS);
}

export function AIInsightsPanel({ reports, loading, lastUpdated, onOpenHealth }: Props) {
  // We freeze the "now" used for *scoring* at lastUpdated so cards don't
  // reorder on every parent re-render. Without lastUpdated we fall back to
  // 0 — ageDays then clamps to 0 and ageFactor collapses to 1× uniformly,
  // so sort order reduces to severity × name (intended behaviour for the
  // "no data yet" state).
  const sortNowMs = useMemo(
    () => (lastUpdated ? lastUpdated.getTime() : 0),
    [lastUpdated],
  );

  const top = useMemo(() => rankFails(reports, sortNowMs), [reports, sortNowMs]);

  // The meta label needs a *live* clock — using sortNowMs would render
  // "обновлено 0 сек назад" forever. We tick a state every 30s while
  // mounted. On a fresh `lastUpdated` the diff momentarily goes negative
  // → formatRelativeTime falls back to "только что", which is correct UX
  // until the next tick aligns.
  const [metaTickMs, setMetaTickMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setMetaTickMs(Date.now()), META_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const meta = formatRelativeTime(lastUpdated, metaTickMs);

  // Cold load: no cached data yet → show skeleton rows.
  // Warm load (loading + we already have something to show) → render data
  // with a small "обновляется" indicator so the user knows it isn't stale.
  const showSkeleton = loading && reports.length === 0;
  const showRefreshing = loading && reports.length > 0;

  return (
    <div className="v4-panel">
      <div className="v4-panel-h">
        <div className="v4-panel-t">
          <svg
            style={{ width: 14, height: 14, color: "var(--v4-purple-500)" }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 2a3 3 0 00-3 3v1.27A4 4 0 005 10v1.5a3.5 3.5 0 00-1 6.66V20a2 2 0 002 2h12a2 2 0 002-2v-1.84a3.5 3.5 0 00-1-6.66V10a4 4 0 00-4-3.73V5a3 3 0 00-3-3z" />
          </svg>
          AI-инсайты по портфелю
          <span className="v4-tag">health · top-{MAX_CARDS}</span>
          {showRefreshing && <span className="v4-tag">обновляется…</span>}
        </div>
        {meta && <div className="v4-panel-meta">{meta}</div>}
      </div>

      <div className="v4-ai-list">
        {showSkeleton ? (
          <SkeletonList count={SKELETON_COUNT} />
        ) : top.length === 0 ? (
          <EmptyState hasReports={reports.length > 0} />
        ) : (
          top.map((entry) => (
            <InsightCard
              // rule_id alone isn't unique across repos (same rule can fail
              // in many projects), so the composite key keeps React happy
              // and avoids a remount-on-reorder.
              key={`${entry.repo}::${entry.finding.rule_id}`}
              entry={entry}
              onOpenHealth={onOpenHealth}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface CardProps {
  entry: RankedFail;
  onOpenHealth: (repo: string) => void;
}

function InsightCard({ entry, onOpenHealth }: CardProps) {
  const { finding, repo } = entry;
  // Detail is optional in the type; fall back to remediation to avoid an
  // empty grey strip under the title for findings that only ship a fix.
  const rawDetail = finding.detail ?? finding.remediation ?? "";
  const detail = truncate(rawDetail, TRUNCATE_LEN);

  return (
    <div className="v4-ai-item v4-ai-fail">
      <div className={`v4-ai-sev v4-ai-sev--${finding.severity}`}>
        <span className="v4-ai-sev-dot" />
        {finding.severity}
      </div>
      <div className="v4-ai-body">
        <div className="v4-ai-item-ttl">
          <span>{finding.title}</span>
          <span className="v4-ai-repo v4-mono">{repo}</span>
        </div>
        {detail && <div className="v4-ai-item-ds">{detail}</div>}
        <div className="v4-ai-actions">
          <button
            type="button"
            className="v4-btn v4-btn--pri v4-ai-btn"
            // Defensive: even though `repo` always comes from the report,
            // keep the closure explicit so a future refactor can't pass
            // undefined accidentally.
            onClick={() => onOpenHealth(repo)}
          >
            Открыть Health
          </button>
          <button
            type="button"
            className="v4-btn v4-ai-btn"
            disabled
            title="Доступно после Epic-006"
          >
            → issue
          </button>
        </div>
      </div>
      <div className="v4-ai-item-meta">
        <span className="v4-mono">{finding.rule_id}</span>
        <br />L{finding.layer}
      </div>
    </div>
  );
}

function SkeletonList({ count }: { count: number }) {
  // `useMemo` would be overkill — Array.from is cheap, the render is rare,
  // and the array doesn't escape the component.
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="v4-ai-item v4-ai-skel" aria-hidden>
          <div className="v4-ai-skel-sev" />
          <div className="v4-ai-body">
            <div className="v4-ai-skel-line v4-ai-skel-line--ttl" />
            <div className="v4-ai-skel-line v4-ai-skel-line--ds" />
          </div>
          <div className="v4-ai-skel-meta" />
        </div>
      ))}
    </>
  );
}

function EmptyState({ hasReports }: { hasReports: boolean }) {
  // Two distinct empty cases:
  //  - we have reports but no qualifying fails → portfolio is clean
  //  - we have no reports at all (no token, scan failed entirely) → silent;
  //    the parent surface already shows the error banner, so we keep this
  //    inline copy minimal.
  return (
    <div className="v4-empty v4-ai-empty">
      {hasReports
        ? `Нет фейлов severity ≥ ${MIN_SEVERITY}. Портфель в зелёной зоне.`
        : "Нет данных health-сканирования."}
    </div>
  );
}
