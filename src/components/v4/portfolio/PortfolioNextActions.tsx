/**
 * PortfolioNextActions — top-5 ranked next-best-actions across the whole
 * portfolio (Epic-010 Task-02, #344).
 *
 * This is an EXTENSION of the `AIInsightsPanel` pattern, not a duplicate:
 * AIInsightsPanel surfaces portfolio health (audit fails), this surfaces
 * action-oriented recommendations from the NBA engine. The shared fetch
 * layer lives in `usePortfolioNba`; the visual shell reuses the existing
 * `.v4-panel` / `.v4-ai-*` classes (theme-aware custom properties, no new
 * CSS) so it matches AIInsightsPanel side-by-side in the 2×2 grid.
 *
 * Mounting note: the widget is not wired into a surface yet — Portfolio
 * Surface assembly is Task-06. Until then `onOpenProject` is supplied by
 * whoever mounts it; if absent we fall back to a self-contained URL
 * navigation (`?tab=projects&repo=X&subtab=overview` + pushState +
 * popstate) so a standalone mount still works. `repo` is validated against
 * the known project list before it ever touches the URL — an action from a
 * malformed engine row can't inject an arbitrary query value.
 */

import { useCallback } from "react";
import type { HealthSeverity } from "../../../types/health";
import { PROJECTS } from "../../../utils/config";
import type { NbaAction, NbaResult } from "../../../utils/nextBestActionEngine";
import { usePortfolioNba } from "../../../hooks/usePortfolioNba";

interface Props {
  /**
   * Per-project `NbaResult[]` the caller already computed. The engine
   * aggregates these locally (pure-injectable). Undefined/empty → graceful
   * empty state. Full live cross-portfolio collection is Epic-012 Task-09
   * (#367, not done), deliberately out of scope here.
   */
  perProjectActions: NbaResult[] | undefined;
  /**
   * Opens the Project Hub Overview for `repo`. Supplied by the mounting
   * surface (Task-06). When omitted, the component navigates via the URL
   * itself (see file header).
   */
  onOpenProject?: (repo: string) => void;
}

// Whole row is one visual line; the rationale clamps to 1-2 lines in CSS
// (.v4-ai-row-ds is -webkit-line-clamp). 90 chars keeps the title to one
// line at the narrowest portfolio column — same budget as AIInsightsPanel.
const TITLE_TRUNCATE = 90;

// Set of valid repos — guards URL navigation against an injected value.
const VALID_REPOS = new Set(PROJECTS.map((p) => p.repo));

// Truncate by code-point so we never slice a multi-byte glyph in half
// (mirrors AIInsightsPanel.truncate).
function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return chars.slice(0, max).join("").trimEnd() + "…";
}

// Russian plural for "дн|день|дня" — "0 дней", "1 день", "2 дня", "5 дней".
function daysLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${n} дня`;
  }
  return `${n} дней`;
}

// Self-contained navigation used only when no `onOpenProject` is injected.
// Builds the canonical deep link and notifies the SPA routers (ProjectsView
// / ProjectHubPage both listen on `popstate` and re-read the URL).
function navigateToProjectOverview(repo: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("tab", "projects");
  url.searchParams.set("repo", repo);
  url.searchParams.set("subtab", "overview");
  window.history.pushState(
    { repo, subtab: "overview" },
    "",
    url.pathname + url.search,
  );
  // Routers sync off popstate, not pushState — dispatch one so the SPA
  // reacts to the programmatic navigation.
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function PortfolioNextActions({
  perProjectActions,
  onOpenProject,
}: Props) {
  const { actions, loading, error, ageDays, hasCache, budgetFallback, regenerate } =
    usePortfolioNba(perProjectActions);

  // Regenerate invalidates the cache *before* recomputing, so firing it with
  // no per-project input would compute an empty result and silently wipe the
  // actions currently on screen. Until live cross-portfolio collection lands
  // (Epic-012 Task-09, #367) the mounting surface passes `undefined` — keep
  // the button disabled in that state rather than letting it erase the cache.
  const canRegenerate = !!perProjectActions?.length;

  const openProject = useCallback(
    (repo: string | undefined) => {
      // Engine rows carry an optional `repo`; ignore anything we can't map
      // to a real project so we never push a bogus `?repo=` into the URL.
      if (!repo || !VALID_REPOS.has(repo)) return;
      if (onOpenProject) {
        onOpenProject(repo);
        return;
      }
      navigateToProjectOverview(repo);
    },
    [onOpenProject],
  );

  // Cache age label: «Сгенерирован N дней назад» when a fresh cache exists
  // and we are not mid-regenerate. Distinguishes "0 days" → "сегодня".
  const freshnessLabel =
    hasCache && ageDays !== null
      ? ageDays === 0
        ? "Сгенерирован сегодня"
        : `Сгенерирован ${daysLabel(ageDays)} назад`
      : null;

  // Loading shows for the regenerate request only — the initial render is
  // synchronous from cache (or empty), there is no cold fetch here.
  const showError = !!error && actions.length === 0 && !loading;
  const showEmpty = !loading && !error && actions.length === 0;

  return (
    <div className="v4-panel">
      <div className="v4-panel-h">
        <div className="v4-panel-t">
          <svg
            style={{ width: 14, height: 14, color: "var(--v4-accent-600)" }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
          </svg>
          Что делать дальше
          <span className="v4-tag">{actions.length}</span>
          {loading && <span className="v4-tag">обновляется…</span>}
          {budgetFallback && (
            <span
              className="v4-tag v4-tag--warn"
              role="status"
              title="Модель понижена Sonnet → Haiku из-за бюджета Claude"
            >
              бюджет
            </span>
          )}
        </div>
        <div className="v4-panel-actions">
          {freshnessLabel && !loading && (
            <span className="v4-panel-meta">{freshnessLabel}</span>
          )}
          <button
            type="button"
            className="v4-btn v4-ai-btn"
            onClick={regenerate}
            disabled={loading || !canRegenerate}
            title={
              canRegenerate
                ? "Сбросить кэш и пересчитать действия по портфелю"
                : "Нет данных по проектам для пересчёта — кэш не трогаем"
            }
          >
            {loading ? "Генерация…" : "Регенерировать"}
          </button>
        </div>
      </div>

      <div className="v4-ai-list">
        {showError ? (
          <div
            className="v4-empty v4-ai-empty v4-orphan-error"
            role="alert"
          >
            <div className="v4-orphan-error-t">
              Не удалось сгенерировать действия
            </div>
            <div className="v4-orphan-error-m">{error}</div>
          </div>
        ) : showEmpty ? (
          <div className="v4-empty v4-ai-empty">Действия не требуются</div>
        ) : (
          actions.map((action) => (
            <ActionRow
              key={action.id}
              action={action}
              onOpen={openProject}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface RowProps {
  action: NbaAction;
  onOpen: (repo: string | undefined) => void;
}

function ActionRow({ action, onOpen }: RowProps) {
  const { title, rationale, severity, repo } = action;
  // Only repos we can actually open are clickable — a row whose repo we
  // can't resolve still renders (the recommendation is useful) but isn't a
  // dead-end button.
  const navigable = !!repo && VALID_REPOS.has(repo);

  const content = (
    <>
      <span className={`v4-ai-sev v4-ai-sev--${sevClass(severity)}`}>
        <span className="v4-ai-sev-dot" />
        {severity}
      </span>
      <span className="v4-ai-row-main">
        <span className="v4-ai-row-ttl">
          <span className="v4-ai-row-title">
            {truncate(title, TITLE_TRUNCATE)}
          </span>
          {repo && <span className="v4-ai-repo v4-mono">{repo}</span>}
        </span>
        {rationale && <span className="v4-ai-row-ds">{rationale}</span>}
      </span>
      {navigable && (
        <span className="v4-ai-row-arrow" aria-hidden>
          ↗
        </span>
      )}
    </>
  );

  if (!navigable) {
    return <div className="v4-ai-row">{content}</div>;
  }
  return (
    <button
      type="button"
      className="v4-ai-row"
      onClick={() => onOpen(repo)}
      title={`Открыть ${repo} → Обзор`}
    >
      {content}
    </button>
  );
}

// Coerce to a known CSS modifier so an unexpected severity can't produce a
// dangling `.v4-ai-sev--undefined` class (engine already coerces, this is
// defence in depth).
function sevClass(s: HealthSeverity): HealthSeverity {
  return s === "critical" || s === "high" || s === "medium" || s === "low"
    ? s
    : "medium";
}
