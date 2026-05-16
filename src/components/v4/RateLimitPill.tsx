import { useRateLimit, type RateBucket } from "../../hooks/useRateLimit";

/** 4920 → "4.9k", 5000 → "5k", 850 → "850", 0 → "0". */
function compact(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
}

/** Tier by remaining share: ≥50% ok, ≥10% warn, else critical. */
function tier(b: RateBucket): "ok" | "warn" | "crit" {
  const ratio = b.limit > 0 ? b.remaining / b.limit : 0;
  if (ratio >= 0.5) return "ok";
  if (ratio >= 0.1) return "warn";
  return "crit";
}

function resetAt(epochSec: number): string {
  return new Date(epochSec * 1000).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Time left until `epochSec`, minute-granular: "42м", "1ч 5м", "<1м". */
function untilReset(epochSec: number): string {
  const ms = epochSec * 1000 - Date.now();
  if (ms <= 0) return "<1м";
  const totalMin = Math.ceil(ms / 60000);
  if (totalMin < 60) return `${totalMin}м`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}ч` : `${h}ч ${m}м`;
}

/**
 * Header widget showing remaining GitHub REST + GraphQL quota. Self-
 * contained: owns its own polling hook so the Topbar stays presentational
 * and App.tsx needs no new prop. Renders nothing until the first poll
 * resolves (no token / pre-load) so it never reserves empty header space.
 */
export function RateLimitPill() {
  const data = useRateLimit();
  if (!data) return null;

  const { rest, graphql } = data;
  // Earliest of the two independent reset windows — the next time any
  // quota refreshes, which is the number worth surfacing.
  const nearestReset = Math.min(rest.reset, graphql.reset);
  const title =
    `GitHub API лимит (опрос не тратит лимит)\n` +
    `REST: ${rest.remaining}/${rest.limit}, сброс ${resetAt(rest.reset)}\n` +
    `GraphQL: ${graphql.remaining}/${graphql.limit}, сброс ${resetAt(graphql.reset)}`;

  return (
    <span className="v4-ratelimit" title={title} aria-label={title}>
      <span className={`v4-ratelimit-seg v4-ratelimit-seg--${tier(rest)}`}>
        REST {compact(rest.remaining)}
      </span>
      <span className="v4-ratelimit-sep">·</span>
      <span className={`v4-ratelimit-seg v4-ratelimit-seg--${tier(graphql)}`}>
        GQL {compact(graphql.remaining)}
      </span>
      <span className="v4-ratelimit-sep">·</span>
      <span className="v4-ratelimit-reset">↻ {untilReset(nearestReset)}</span>
    </span>
  );
}
