/**
 * PortfolioPromiseTracker — cross-project commitments aggregator
 * (Epic-010 Task-03, #345).
 *
 * Surfaces only the commitments that need attention NOW across the whole
 * portfolio: OVERDUE (due < today, red, top) and DUE THIS WEEK (due ≤
 * today+7d, amber). Everything else lives in the per-project Hub
 * Decisions & Risks tab and is deliberately not repeated here.
 *
 * Data flow: `usePortfolioPromises` fans out over the config `PROJECTS`
 * list (no hardcoded repo list), reads each repo's BRIEF.md +
 * docs/commitments.yaml through github-contents, merges via
 * `extractCommitments`, and caches the open subset in sessionStorage for
 * 5 min. This widget is pure presentation: filter → group by client →
 * sort → render.
 *
 * Mounting note: not wired into a surface yet — Portfolio Surface
 * assembly is Epic-010 Task-06 (#348). Until then `onOpenProject` is
 * supplied by whoever mounts it; absent → self-contained URL navigation
 * (`?tab=projects&repo=X&subtab=decisions#commitments` + pushState +
 * popstate), mirroring PortfolioNextActions. `repo` is validated against
 * the known project list before it ever touches the URL — a commitment
 * from a malformed repo string can't inject an arbitrary query value.
 */

import { useCallback, useMemo, useState } from "react";
import { PROJECTS } from "../../../utils/config";
import {
  usePortfolioPromises,
  type PortfolioCommitment,
} from "../../../hooks/usePortfolioPromises";

interface Props {
  /**
   * Opens the project's Hub Decisions & Risks tab for `repo`. Supplied by
   * the mounting surface (Task-06). When omitted, the component navigates
   * via the URL itself (see file header).
   */
  onOpenProject?: (repo: string) => void;
}

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

// Guards URL navigation against an injected `?repo=` value — only repos we
// actually know about are ever pushed.
const VALID_REPOS = new Set(PROJECTS.map((p) => p.repo));

/** Which attention bucket a commitment falls into (open subset only). */
type Bucket = "overdue" | "due-week";

/** UTC midnight of `now` — date-only comparison, no time-of-day drift. */
function startOfTodayUtc(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Classify by due date. Returns null when the commitment is undated /
 * malformed or simply not due within the week — those are intentionally
 * not surfaced here (the full list is in the per-project Hub).
 */
function bucketOf(due: string, todayUtc: number): Bucket | null {
  const t = Date.parse(due);
  if (Number.isNaN(t)) return null;
  // Normalize to UTC midnight (same as relativeDue) so a due with a
  // time-of-day component classifies on the date, not the timestamp —
  // otherwise the bucket and the relative-due label can disagree on
  // the day boundary.
  const dueUtc = startOfTodayUtc(t);
  if (dueUtc < todayUtc) return "overdue";
  if (dueUtc <= todayUtc + WEEK_MS) return "due-week";
  return null;
}

// Russian plural for days — "1 день", "2 дня", "5 дней".
function daysLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${n} дня`;
  }
  return `${n} дней`;
}

/**
 * Human relative-due label. Overdue → «просрочено N дней», future →
 * «через N дней» / «сегодня» / «завтра». Date-only (UTC midnight) so a
 * commitment due "today" never shows as overdue from a time-of-day delta.
 */
function relativeDue(due: string, todayUtc: number): string {
  const t = Date.parse(due);
  if (Number.isNaN(t)) return "";
  const dueUtc = startOfTodayUtc(t);
  const diffDays = Math.round((dueUtc - todayUtc) / DAY_MS);
  if (diffDays < 0) return `просрочено ${daysLabel(-diffDays)}`;
  if (diffDays === 0) return "сегодня";
  if (diffDays === 1) return "завтра";
  return `через ${daysLabel(diffDays)}`;
}

// Self-contained navigation used only when no `onOpenProject` is injected.
// Deep-links to the project's Hub Decisions & Risks tab; the `#commitments`
// anchor is the canonical link target from the issue spec (harmless if no
// element consumes it yet). Routers sync off popstate.
function navigateToDecisions(repo: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("tab", "projects");
  url.searchParams.set("repo", repo);
  url.searchParams.set("subtab", "decisions");
  window.history.pushState(
    { repo, subtab: "decisions" },
    "",
    `${url.pathname}${url.search}#commitments`,
  );
  window.dispatchEvent(new PopStateEvent("popstate"));
}

interface GroupedClient {
  client: string;
  overdue: PortfolioCommitment[];
  dueWeek: PortfolioCommitment[];
}

/**
 * Filter to overdue + due-this-week, group by client, stable-sort:
 * clients with any overdue first (then alphabetically), and within a
 * client overdue rows before due-week rows, each by due date ascending.
 */
function groupByClient(
  items: PortfolioCommitment[],
  todayUtc: number,
): GroupedClient[] {
  const byClient = new Map<string, GroupedClient>();

  for (const c of items) {
    const bucket = bucketOf(c.due, todayUtc);
    if (bucket === null) continue;
    const clientName = c.client.trim() || "Без клиента";
    let g = byClient.get(clientName);
    if (g === undefined) {
      g = { client: clientName, overdue: [], dueWeek: [] };
      byClient.set(clientName, g);
    }
    if (bucket === "overdue") g.overdue.push(c);
    else g.dueWeek.push(c);
  }

  const byDueAsc = (a: PortfolioCommitment, b: PortfolioCommitment) => {
    const ad = Date.parse(a.due);
    const bd = Date.parse(b.due);
    if (ad !== bd) return ad - bd;
    // Tie-break on repo then text so the order is fully deterministic.
    return (
      a.repo.localeCompare(b.repo, "en") ||
      a.text.localeCompare(b.text, "ru")
    );
  };

  const groups = Array.from(byClient.values());
  for (const g of groups) {
    g.overdue.sort(byDueAsc);
    g.dueWeek.sort(byDueAsc);
  }
  // Clients carrying overdue work bubble up; ties broken alphabetically
  // (ru collation) for a stable, locale-correct order.
  groups.sort((a, b) => {
    const ao = a.overdue.length > 0 ? 0 : 1;
    const bo = b.overdue.length > 0 ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return a.client.localeCompare(b.client, "ru");
  });
  return groups;
}

export function PortfolioPromiseTracker({ onOpenProject }: Props) {
  const { items, loading, error, refresh } = usePortfolioPromises();

  // Today's UTC-midnight baseline, captured once at mount via a lazy
  // state initializer (the linter forbids an impure `Date.now()` inside a
  // render-time `useMemo`; a one-shot initializer is the sanctioned way).
  // Date-only granularity means a session crossing midnight keeps the
  // original baseline until a refresh — acceptable for a 5-min-cached,
  // day-resolution widget.
  const [todayUtc] = useState(() => startOfTodayUtc(Date.now()));
  const groups = useMemo(
    () => groupByClient(items, todayUtc),
    [items, todayUtc],
  );

  const totalShown = useMemo(
    () =>
      groups.reduce(
        (n, g) => n + g.overdue.length + g.dueWeek.length,
        0,
      ),
    [groups],
  );

  const openProject = useCallback(
    (repo: string) => {
      // Only repos we can map to a real project ever reach navigation —
      // never push a bogus `?repo=` into the URL.
      if (!VALID_REPOS.has(repo)) return;
      if (onOpenProject) {
        onOpenProject(repo);
        return;
      }
      navigateToDecisions(repo);
    },
    [onOpenProject],
  );

  const showError = !!error && totalShown === 0 && !loading;
  const showSkeleton = loading && totalShown === 0;
  const showEmpty = !loading && !error && totalShown === 0;

  return (
    <div className="v4-panel">
      <div className="v4-panel-h">
        <div className="v4-panel-t">
          <svg
            style={{ width: 14, height: 14, color: "var(--mk-brand-600)" }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          Обещания клиентам
          {totalShown > 0 && <span className="v4-tag">{totalShown}</span>}
          {loading && totalShown > 0 && (
            <span className="v4-tag">обновляется…</span>
          )}
        </div>
        <div className="v4-panel-actions">
          <button
            type="button"
            className="v4-btn v4-ai-btn"
            onClick={refresh}
            disabled={loading}
            title="Сбросить кэш и перечитать обещания по всем репо"
          >
            {loading ? "Загрузка…" : "Обновить"}
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
              Не удалось загрузить обещания
            </div>
            <div className="v4-orphan-error-m">{error}</div>
          </div>
        ) : showSkeleton ? (
          <PromiseSkeleton />
        ) : showEmpty ? (
          <div className="v4-empty v4-ai-empty v4-promise-empty">
            Все обещания в срок ✓
          </div>
        ) : (
          groups.map((g) => (
            <div className="v4-promise-grp" key={g.client}>
              <div className="v4-promise-grp-h">{g.client}</div>
              {g.overdue.map((c) => (
                <PromiseRow
                  key={`o:${c.repo}:${c.text}:${c.due}`}
                  c={c}
                  bucket="overdue"
                  todayUtc={todayUtc}
                  onOpen={openProject}
                />
              ))}
              {g.dueWeek.map((c) => (
                <PromiseRow
                  key={`w:${c.repo}:${c.text}:${c.due}`}
                  c={c}
                  bucket="due-week"
                  todayUtc={todayUtc}
                  onOpen={openProject}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

interface RowProps {
  c: PortfolioCommitment;
  bucket: Bucket;
  todayUtc: number;
  onOpen: (repo: string) => void;
}

function PromiseRow({ c, bucket, todayUtc, onOpen }: RowProps) {
  const navigable = VALID_REPOS.has(c.repo);
  const rel = relativeDue(c.due, todayUtc);

  // All user/repo strings render as JSX text nodes (React auto-escapes) —
  // no dangerouslySetInnerHTML anywhere, so no XSS surface.
  const content = (
    <>
      <span
        className={`v4-promise-dot v4-promise-dot--${bucket}`}
        aria-hidden
      />
      <span className="v4-promise-main">
        <span className="v4-promise-text">{c.text}</span>
        <span className="v4-promise-meta">
          <span className="v4-promise-repo v4-mono">{c.repo}</span>
          {rel && (
            <span className={`v4-promise-due v4-promise-due--${bucket}`}>
              {rel}
            </span>
          )}
        </span>
      </span>
      {navigable && (
        <span className="v4-ai-row-arrow" aria-hidden>
          ↗
        </span>
      )}
    </>
  );

  if (!navigable) {
    return <div className="v4-ai-row v4-promise-row">{content}</div>;
  }
  return (
    <button
      type="button"
      className="v4-ai-row v4-promise-row"
      onClick={() => onOpen(c.repo)}
      title={`Открыть ${c.repo} → Decisions & Risks`}
    >
      {content}
    </button>
  );
}

/** Loading placeholder while the 12-repo fan-out is in flight. */
function PromiseSkeleton() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <div className="v4-ai-row v4-ai-skel" key={i}>
          <span className="v4-ai-skel-sev" />
          <span className="v4-ai-row-main">
            <span className="v4-ai-skel-line v4-ai-skel-line--ttl" />
            <span className="v4-ai-skel-line v4-ai-skel-line--ds" />
          </span>
          <span className="v4-ai-skel-meta" />
        </div>
      ))}
    </>
  );
}
