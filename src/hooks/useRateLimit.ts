import { useState, useEffect } from "react";
import { getToken } from "../utils/config";
import { dispatchExternalAuthLost } from "../utils/external-auth-events";

const GITHUB_REST = "https://api.github.com";
const POLL_INTERVAL_MS = 60 * 1000;

/** One rate-limit bucket as GitHub reports it. `reset` is unix epoch (s). */
export interface RateBucket {
  limit: number;
  remaining: number;
  reset: number;
}

export interface RateLimitState {
  /** REST bucket (`resources.core`). */
  rest: RateBucket;
  /** GraphQL bucket (`resources.graphql`) — separate 5000-point pool. */
  graphql: RateBucket;
}

interface RateLimitResponse {
  resources: {
    core: RateBucket;
    graphql: RateBucket;
  };
}

/**
 * Poll GitHub's REST + GraphQL remaining quota. Polling itself is free:
 * GitHub explicitly exempts `GET /rate_limit` from rate limiting, so this
 * widget never eats into the very budget it reports. Best-effort — no
 * token or any failure keeps the last good value (the pill renders
 * nothing until the first success); a rejected fetch is swallowed so the
 * header never errors over a metric. The fetch lives in an inline effect
 * closure committing state only after the await (same pattern as
 * `useProjectHub`) — no synchronous setState-in-effect.
 */
export function useRateLimit(): RateLimitState | null {
  const [state, setState] = useState<RateLimitState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const token = getToken();
      if (!token) return;
      try {
        const res = await fetch(`${GITHUB_REST}/rate_limit`, {
          headers: {
            Authorization: `bearer ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        });
        // A 401 here means the PAT is revoked/stale. Match the app-wide
        // convention (github.ts / github-contents.ts) so App.tsx can
        // surface the "rotate token" prompt — a 60s poll is an early
        // detector we shouldn't discard.
        if (res.status === 401) dispatchExternalAuthLost("github");
        if (!res.ok) return;
        const body = (await res.json()) as RateLimitResponse;
        if (cancelled) return;
        setState({
          rest: body.resources.core,
          graphql: body.resources.graphql,
        });
      } catch {
        /* keep the last good value rather than blanking on a transient blip */
      }
    };
    void run();
    const id = setInterval(() => void run(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return state;
}
