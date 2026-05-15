import { useEffect, useRef, useState } from "react";
import {
  loadProjectNorm,
  type ProjectNorm,
  type ProjectTier,
} from "../utils/driftNorm";

/**
 * React wrapper around `loadProjectNorm` (Epic-012 #06, `src/utils/driftNorm.ts`).
 *
 * `loadProjectNorm(repo, tier)` is an async *function*, not a hook — it reads
 * the per-project `docs/project_norm.yaml` override (24h-cached in
 * localStorage) and falls back to the tier default. This hook drives it from
 * an effect so a component (e.g. `DriftDots` inside `ProjectScorecard`) can
 * consume `{ norm, loading }` declaratively.
 *
 * The util never throws (it degrades to the tier default on any failure), so
 * the only failure mode we surface is "still resolving" → `loading`. `norm`
 * is `null` until the first resolution lands.
 *
 * The resolved norm is stored together with the `repo`+`tier` it belongs to.
 * The returned `{ norm, loading }` is *derived* from that store at render
 * time — so a `repo` change (or a `null` repo) immediately reads as
 * "loading / no norm" without a setState-in-effect (which the lint rule
 * `react-hooks/set-state-in-effect` forbids; cf. the same idle-derivation
 * trick in `useProjectHealth.ts`). The async effect only commits a *resolved*
 * value, never the synchronous reset.
 *
 * A monotonic request id discards a slower earlier promise if the inputs
 * change mid-flight; a mounted-flag prevents a setState after the consumer
 * unmounts (portfolio navigation tear-down).
 */

interface Resolved {
  repo: string;
  tier: ProjectTier;
  norm: ProjectNorm;
}

export function useDriftNorm(
  repo: string | null,
  tier: ProjectTier,
): { norm: ProjectNorm | null; loading: boolean } {
  const [resolved, setResolved] = useState<Resolved | null>(null);
  // Monotonic request id — only the latest in-flight call may commit.
  const reqId = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!repo) return;

    const myReq = ++reqId.current;

    loadProjectNorm(repo, tier)
      .then((norm) => {
        if (!mounted.current || myReq !== reqId.current) return;
        setResolved({ repo, tier, norm });
      })
      .catch(() => {
        // `loadProjectNorm` is contractually no-throw; this catch is
        // belt-and-braces so a future regression can't wedge the hook
        // forever-loading. The store keeps its last value; `loading`
        // derives from the repo/tier mismatch, so it stays true here.
      });
  }, [repo, tier]);

  // Derive the public shape: a stored norm only counts if it was resolved
  // for *these* exact inputs. Otherwise (no repo, repo changed, not yet
  // resolved) → loading with no norm. No setState on the synchronous path.
  const isFresh =
    resolved !== null && resolved.repo === repo && resolved.tier === tier;

  if (!repo) {
    return { norm: null, loading: false };
  }
  return {
    norm: isFresh ? resolved.norm : null,
    loading: !isFresh,
  };
}
