/**
 * PortfolioRenewals — cross-project upcoming-renewals aggregator
 * (Epic-010 Task-04, #346).
 *
 * Surfaces the top-5 nearest expiries across the whole portfolio: SSL /
 * domain / contract / license dates from each repo's `docs/renewals.yaml`
 * plus deprecated-dependency findings auto-scanned from `package.json`.
 * The full per-project list lives in the Hub Decisions & Risks tab; this
 * widget is the "what expires soonest, everywhere" glance.
 *
 * Data flow: `usePortfolioRenewals` fans out over the config `PROJECTS`
 * list (no hardcoded repo list), reads each repo's renewals yaml +
 * package.json through github-contents, merges via `scanRenewals`, and
 * caches the result in sessionStorage for 1 hour. This widget is pure
 * presentation: sort by expiry ascending → take top-5 → render with an
 * urgency dot + an explicit "через Nд" label (colour is never the only
 * carrier of meaning — WCAG 1.4.1).
 *
 * Mounting note: not wired into a surface yet — Portfolio Surface
 * assembly is Epic-010 Task-06 (#348). Until then `onOpenProject` is
 * supplied by whoever mounts it; absent → self-contained URL navigation
 * (`?tab=projects&repo=X&subtab=decisions#renewals` + pushState +
 * popstate), mirroring PortfolioPromiseTracker. `repo` is validated
 * against the known project list before it ever touches the URL — a
 * renewal from a malformed repo string can't inject an arbitrary query
 * value.
 */

import { useCallback, useMemo, useState } from "react";
import { PROJECTS } from "../../../utils/config";
import {
  usePortfolioRenewals,
  type PortfolioRenewal,
} from "../../../hooks/usePortfolioRenewals";
import type { RenewalType } from "../../../types/hub";

interface Props {
  /**
   * Opens the project's Hub Decisions & Risks tab for `repo`. Supplied by
   * the mounting surface (Task-06). When omitted, the component navigates
   * via the URL itself (see file header).
   */
  onOpenProject?: (repo: string) => void;
}

const DAY_MS = 86_400_000;
/** Top of the urgency ladder: ≤7 days out is red. */
const URGENT_DAYS = 7;
/** Mid rung: ≤30 days out is amber. Beyond that is gray. */
const SOON_DAYS = 30;
/** How many rows the widget shows (issue spec: top-5 nearest). */
const MAX_ROWS = 5;

// Guards URL navigation against an injected `?repo=` value — only repos we
// actually know about are ever pushed.
const VALID_REPOS = new Set(PROJECTS.map((p) => p.repo));

/** Urgency bucket — also the CSS modifier suffix and the dot/label class. */
type Urgency = "red" | "yellow" | "gray";

/** Human label per renewal type (Russian UI). */
const TYPE_LABEL: Record<RenewalType, string> = {
  ssl: "SSL",
  domain: "Домен",
  contract: "Контракт",
  license: "Лицензия",
  dep: "Зависимость",
};

/** UTC midnight of `now` — date-only comparison, no time-of-day drift. */
function startOfTodayUtc(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Whole-day signed delta between an expiry date and today (both at UTC
 * midnight). `null` when the date is missing or unparseable — those rows
 * are undated (typically auto-scan deps) and sort to the bottom.
 */
function daysUntil(expiresAt: string | null, todayUtc: number): number | null {
  if (!expiresAt) return null;
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return null;
  return Math.round((startOfTodayUtc(t) - todayUtc) / DAY_MS);
}

/**
 * Map a day-delta to an urgency bucket. An already-expired date (negative
 * delta) is the most urgent — it stays red. Undated rows are gray (no
 * deadline pressure, surfaced only so a deprecated dep stays visible).
 */
function urgencyOf(diffDays: number | null): Urgency {
  if (diffDays === null) return "gray";
  if (diffDays <= URGENT_DAYS) return "red";
  if (diffDays <= SOON_DAYS) return "yellow";
  return "gray";
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
 * Explicit textual urgency — the colour is decorative only, this text
 * carries the meaning (WCAG 1.4.1, "in Nд" from the issue spec).
 * Expired → «истекло N дней назад», future → «через N дней» / «сегодня» /
 * «завтра», undated → «без срока».
 */
function expiryLabel(diffDays: number | null): string {
  if (diffDays === null) return "без срока";
  if (diffDays < 0) return `истекло ${daysLabel(-diffDays)} назад`;
  if (diffDays === 0) return "истекает сегодня";
  if (diffDays === 1) return "истекает завтра";
  return `через ${daysLabel(diffDays)}`;
}

// Self-contained navigation used only when no `onOpenProject` is injected.
// Deep-links to the project's Hub Decisions & Risks tab; the `#renewals`
// anchor is the canonical link target from the issue spec (harmless if no
// element consumes it yet). Routers sync off popstate.
function navigateToRenewals(repo: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("tab", "projects");
  url.searchParams.set("repo", repo);
  url.searchParams.set("subtab", "decisions");
  window.history.pushState(
    { repo, subtab: "decisions" },
    "",
    `${url.pathname}${url.search}#renewals`,
  );
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** A renewal decorated with its computed day-delta for render + sort. */
interface RankedRenewal extends PortfolioRenewal {
  diffDays: number | null;
}

/**
 * Sort by expiry ascending (soonest first), top-5. Undated rows
 * (`diffDays === null`) sink below every dated one. Stable tie-break by
 * repo then name so render order is deterministic across reloads.
 */
function rankTop(
  items: PortfolioRenewal[],
  todayUtc: number,
): RankedRenewal[] {
  const ranked: RankedRenewal[] = items.map((r) => ({
    ...r,
    diffDays: daysUntil(r.expires_at, todayUtc),
  }));
  ranked.sort((a, b) => {
    const aHas = a.diffDays !== null;
    const bHas = b.diffDays !== null;
    if (aHas && bHas) {
      if (a.diffDays !== b.diffDays) {
        return (a.diffDays as number) - (b.diffDays as number);
      }
    } else if (aHas !== bHas) {
      return aHas ? -1 : 1;
    }
    return (
      a.repo.localeCompare(b.repo, "en") ||
      a.name.localeCompare(b.name, "ru")
    );
  });
  return ranked.slice(0, MAX_ROWS);
}

export function PortfolioRenewals({ onOpenProject }: Props) {
  const { items, loading, error, refresh } = usePortfolioRenewals();

  // Today's UTC-midnight baseline, captured once at mount via a lazy
  // state initializer (the linter forbids an impure `Date.now()` inside a
  // render-time `useMemo`; a one-shot initializer is the sanctioned way).
  // Date-only granularity means a session crossing midnight keeps the
  // original baseline until a refresh — acceptable for a 1h-cached,
  // day-resolution widget.
  const [todayUtc] = useState(() => startOfTodayUtc(Date.now()));
  const top = useMemo(
    () => rankTop(items, todayUtc),
    [items, todayUtc],
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
      navigateToRenewals(repo);
    },
    [onOpenProject],
  );

  const showError = !!error && top.length === 0 && !loading;
  const showSkeleton = loading && top.length === 0;
  const showEmpty = !loading && !error && top.length === 0;

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
            <path d="M12 8v4l3 3" />
            <circle cx="12" cy="12" r="9" />
          </svg>
          Продления (SSL / домен / контракт / лицензии)
          {top.length > 0 && <span className="v4-tag">{top.length}</span>}
          {loading && top.length > 0 && (
            <span className="v4-tag">обновляется…</span>
          )}
        </div>
        <div className="v4-panel-actions">
          <button
            type="button"
            className="v4-btn v4-ai-btn"
            onClick={refresh}
            disabled={loading}
            title="Сбросить кэш и перечитать продления по всем репо"
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
              Не удалось загрузить продления
            </div>
            <div className="v4-orphan-error-m">{error}</div>
          </div>
        ) : showSkeleton ? (
          <RenewalsSkeleton />
        ) : showEmpty ? (
          <div className="v4-empty v4-ai-empty v4-promise-empty">
            Ближайших продлений нет
          </div>
        ) : (
          top.map((r) => (
            <RenewalRow
              key={`${r.repo}:${r.type}:${r.name}:${r.expires_at ?? "-"}`}
              r={r}
              onOpen={openProject}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface RowProps {
  r: RankedRenewal;
  onOpen: (repo: string) => void;
}

/** Inline type icon — paired with a text label so it's not icon-only. */
function TypeIcon({ type }: { type: RenewalType }) {
  const common = {
    width: 13,
    height: 13,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    "aria-hidden": true,
  } as const;
  switch (type) {
    case "ssl":
      return (
        <svg {...common}>
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      );
    case "domain":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      );
    case "contract":
      return (
        <svg {...common}>
          <path d="M7 3h7l5 5v13H7z" />
          <path d="M14 3v5h5M10 14h6M10 17h6" />
        </svg>
      );
    case "license":
      return (
        <svg {...common}>
          <circle cx="12" cy="9" r="5" />
          <path d="M9 13l-2 8 5-3 5 3-2-8" />
        </svg>
      );
    case "dep":
    default:
      return (
        <svg {...common}>
          <path d="M21 16V8l-9-5-9 5v8l9 5z" />
          <path d="M3.3 7L12 12l8.7-5M12 12v9" />
        </svg>
      );
  }
}

function RenewalRow({ r, onOpen }: RowProps) {
  const navigable = VALID_REPOS.has(r.repo);
  const urgency: Urgency = urgencyOf(r.diffDays);
  const label = expiryLabel(r.diffDays);
  const typeLabel = TYPE_LABEL[r.type];

  // All user/repo strings render as JSX text nodes (React auto-escapes) —
  // no dangerouslySetInnerHTML anywhere, so no XSS surface.
  const content = (
    <>
      <span
        className={`v4-renewal-icon v4-renewal-icon--${urgency}`}
        title={typeLabel}
      >
        <TypeIcon type={r.type} />
      </span>
      <span className="v4-promise-main">
        <span className="v4-promise-text">
          <span className="v4-renewal-type">{typeLabel}</span>
          {" · "}
          {r.name}
        </span>
        <span className="v4-promise-meta">
          <span className="v4-promise-repo v4-mono">{r.repo}</span>
          <span className="v4-renewal-client">{r.client}</span>
          <span className={`v4-promise-due v4-renewal-due--${urgency}`}>
            {label}
          </span>
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
    return (
      <div className="v4-ai-row v4-promise-row v4-renewals-row">
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="v4-ai-row v4-promise-row v4-renewals-row"
      onClick={() => onOpen(r.repo)}
      title={`Открыть ${r.repo} → Decisions & Risks`}
    >
      {content}
    </button>
  );
}

/** Loading placeholder while the 12-repo fan-out is in flight. */
function RenewalsSkeleton() {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
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
