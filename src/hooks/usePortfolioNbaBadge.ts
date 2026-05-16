/**
 * usePortfolioNbaBadge — passive sidebar badge count for the «Проекты» nav
 * item (Epic-010 Task-07, #349, FR-10).
 *
 * Reads ONLY the cache `PortfolioNextActions` already wrote
 * (`localStorage[PORTFOLIO_NBA_CACHE_KEY]`); it never computes or calls
 * Claude just to feed a badge. Returns `undefined` (badge hidden) when there
 * is no cache or the cached portfolio has zero actions; otherwise the action
 * count. Refreshes on cross-tab `storage` events and whenever the user
 * switches to the «Проекты» tab (same-document writes emit no storage event,
 * so the tab switch is the in-tab refresh trigger).
 */

import { useEffect, useState } from "react";
import type { TabId } from "../types";
import { PORTFOLIO_NBA_CACHE_KEY, readPortfolioNbaCount } from "./usePortfolioNba";

export function usePortfolioNbaBadge(activeTab: TabId): number | undefined {
  const [count, setCount] = useState<number | null>(() =>
    readPortfolioNbaCount(),
  );

  // Re-read when the user lands on «Проекты». A same-document cache write
  // (PortfolioNextActions regenerate) fires no `storage` event, so the tab
  // switch is the in-tab refresh point. This is React's documented "adjust
  // state during render when a prop changes" pattern (prev-value in state +
  // setState during render) — it re-renders before commit with no effect /
  // cascading-render cost, and unlike a ref-guard it satisfies the strict
  // react-hooks lint rules.
  const [prevTab, setPrevTab] = useState(activeTab);
  if (prevTab !== activeTab) {
    setPrevTab(activeTab);
    if (activeTab === "projects") {
      setCount(readPortfolioNbaCount());
    }
  }

  // Subscribe to cross-tab cache writes (another browser tab regenerated).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      // e.key === null → localStorage.clear(); re-read in that case too.
      if (e.key === null || e.key === PORTFOLIO_NBA_CACHE_KEY) {
        setCount(readPortfolioNbaCount());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return count !== null && count > 0 ? count : undefined;
}
