/**
 * Phase-0.7 (TD-architect, 2026-04-30) — operator-facing banners on the
 * Pipeline tab.
 *
 * Two independent signals:
 *
 * 1. ``lastAbort`` — surfaces the structured reason from the previous
 *    ``/pipeline/start`` if it bounced before any dev work.  When it
 *    carries a ``retry_after_ts`` (graphql_rate_limit), we show a live
 *    countdown so the operator knows when retrying is safe.  Auto-clears
 *    when the deadline passes (no longer actionable).
 *
 * 2. ``githubLimits`` — proactive warning when the GraphQL bucket is
 *    below the pre-batch headroom threshold (500), since the next
 *    ``/pipeline/start`` would abort regardless.  Displayed even when
 *    pipeline is idle so the operator sees it BEFORE clicking Start.
 *
 * Pure-presentational; no fetching here — App.tsx owns the polling.
 */

import { useEffect, useState, type ReactElement } from "react";
import type {
  GitHubRateLimitBucket,
  PipelineAbortReason,
  PipelineLimits,
} from "../../../utils/pipeline";

interface Props {
  githubLimits?: PipelineLimits["github"];
  lastAbort?: PipelineAbortReason | null;
}

/** Mirrors ``batch_coordinator._GH_MIN_GRAPHQL_REMAINING`` on the pipeline side. */
const GH_GRAPHQL_HEADROOM_REQUIRED = 500;

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "сейчас";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} сек`;
  if (m < 60) return `${m} мин ${s.toString().padStart(2, "0")} сек`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h} ч ${rem.toString().padStart(2, "0")} мин`;
}

/**
 * Live tick — re-renders every second so countdowns advance smoothly.
 * Local to the component so other parts of the page don't pay the cost.
 */
function useNowSeconds(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

interface BannerProps {
  kind: "warn" | "info";
  title: string;
  detail?: string;
}

function Banner({ kind, title, detail }: BannerProps) {
  // Inline styles avoid coupling to v4 stylesheet quirks; banner is rare so
  // the cost of re-parsing per render is negligible.
  const bg = kind === "warn" ? "rgba(247, 144, 9, 0.10)" : "rgba(96, 165, 250, 0.10)";
  const border = kind === "warn" ? "rgba(247, 144, 9, 0.45)" : "rgba(96, 165, 250, 0.45)";
  const accent = kind === "warn" ? "var(--v4-warn-500, #f79009)" : "var(--v4-accent-500, #60a5fa)";
  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "10px 14px",
        marginBottom: 10,
        borderRadius: 8,
        background: bg,
        border: `1px solid ${border}`,
        fontSize: 14,
        lineHeight: 1.45,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          marginTop: 6,
          background: accent,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{title}</div>
        {detail && (
          <div style={{ marginTop: 2, color: "var(--v4-ink-500, #94a3b8)" }}>{detail}</div>
        )}
      </div>
    </div>
  );
}

function pickGraphqlBucket(
  githubLimits: PipelineLimits["github"]
): GitHubRateLimitBucket | null {
  if (!githubLimits) return null;
  return githubLimits.graphql ?? null;
}

export function PipelineStatusBanners({ githubLimits, lastAbort }: Props) {
  const nowSec = useNowSeconds();

  const banners: ReactElement[] = [];

  // ── Banner 1: previous-run abort with a known recovery time ───────────
  if (
    lastAbort &&
    lastAbort.category === "graphql_rate_limit" &&
    lastAbort.retry_after_ts !== null &&
    lastAbort.retry_after_ts > nowSec
  ) {
    const remainingSec = lastAbort.retry_after_ts - nowSec;
    banners.push(
      <Banner
        key="abort-graphql"
        kind="warn"
        title="Прошлый запуск прерван — GitHub GraphQL лимит исчерпан"
        detail={`Следующая попытка возможна через ${formatCountdown(remainingSec)} (после восстановления квоты).`}
      />
    );
  }

  // ── Banner 2: proactive GraphQL low warning even before user clicks Start ─
  const graphql = pickGraphqlBucket(githubLimits);
  if (
    graphql &&
    graphql.remaining < GH_GRAPHQL_HEADROOM_REQUIRED &&
    graphql.reset_seconds > 0
  ) {
    banners.push(
      <Banner
        key="graphql-low"
        kind="warn"
        title={`GitHub GraphQL лимит низок (${graphql.remaining} / ${GH_GRAPHQL_HEADROOM_REQUIRED} нужно)`}
        detail={`Запуск pipeline сейчас будет прерван pre-batch проверкой. Восстановится через ${formatCountdown(graphql.reset_seconds)}.`}
      />
    );
  }

  if (banners.length === 0) return null;
  return <div>{banners}</div>;
}
