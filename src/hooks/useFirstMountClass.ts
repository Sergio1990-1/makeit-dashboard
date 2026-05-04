import { useEffect, useState } from "react";

/**
 * Tracks whether a given tab/view has been mounted at least once in this
 * browser session. Returns the className to apply on the view's root —
 * empty on the very first mount (so entrance animations play), and
 * `v4-tab--no-entrance` on every subsequent re-mount so the staggered
 * fades in v4.css and the WOW layer don't replay (and visibly stutter)
 * when the user switches tabs.
 *
 * Module-level state intentionally — each tab key has exactly one
 * "first mount" per page lifetime, regardless of how many React
 * remounts happen.
 */
const seenViews = new Set<string>();

export function useFirstMountClass(key: string): string {
  // Capture once at component init via lazy initializer; subsequent renders
  // reuse the same value. Using state (not ref) so we can safely read during
  // render — the value never changes after mount, so React won't re-run.
  const [isFirst] = useState(() => !seenViews.has(key));

  useEffect(() => {
    seenViews.add(key);
  }, [key]);

  return isFirst ? "" : "v4-tab--no-entrance";
}
