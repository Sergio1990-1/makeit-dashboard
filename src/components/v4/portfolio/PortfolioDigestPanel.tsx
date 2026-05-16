/**
 * PortfolioDigestPanel — weekly cross-portfolio digest preview
 * (Epic-010 Task-05, #347).
 *
 * One tile in the Portfolio Surface 2×2 widget grid. Shows a preview
 * (first ~12 markdown lines) of the latest portfolio-wide weekly digest:
 *
 *   1. Reads `digests/{YYYY-WW}-portfolio.md` from the dashboard repo
 *      itself via the shared `github-contents.readFile` Contents-API
 *      client (auth/base64 handled there — no second HTTP path here).
 *   2. Renders the preview through `renderMarkdownHtml`
 *      (transcript-markdown's DOMPurify+marked pipeline) — the digest
 *      markdown is LLM-generated, so it MUST stay routed through that
 *      sanitiser, never raw. There is no second markdown/sanitise path.
 *   3. «Открыть полностью» → modal rendering the full sanitised markdown.
 *   4. «Сгенерировать новый» → the real Epic-012 Task-02 generator
 *      `generatePortfolioDigest(week, { force: true })`, which rebuilds
 *      and re-persists `digests/{YYYY-WW}-portfolio.md`. On success the
 *      preview refreshes in place (no page reload) and the sessionStorage
 *      cache is overwritten from the returned entry.
 *
 * Week selection: the current ISO week key (`currentWeekKey()` reused
 * from the generator — ISO-8601, Thursday rule, UTC; not reimplemented).
 * No file for the week → empty state «Дайджест за эту неделю ещё не
 * сгенерирован» + an active «Сгенерировать» CTA.
 *
 * Cache: sessionStorage `makeit_portfolio_digest_{week}`, TTL until the
 * end of that ISO week (Sunday 23:59:59.999 UTC). A re-open in the same
 * week serves the cached markdown and makes NO network request. A past
 * week is immutable so a cached value there never expires (mirrors the
 * generator's own readCache semantics).
 *
 * Failure model: every external call (Contents read, generator) is
 * wrapped. A failure degrades to a readable error / empty state — the
 * widget never crashes the Portfolio surface.
 *
 * Mounting note: standalone widget. Portfolio Surface assembly that
 * drops this into the grid is Epic-010 Task-06 (#348); this file does
 * not touch ProjectsView / ProjectCardV4.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderMarkdownHtml } from "../../../utils/transcript-markdown";
import {
  currentWeekKey,
  generatePortfolioDigest,
} from "../../../utils/weeklyDigestGenerator";
import { readFile } from "../../../utils/github-contents";

/** Dashboard repo that physically stores the digest files (FR-36). */
const DIGEST_REPO = "makeit-dashboard";

/** sessionStorage key prefix for the portfolio digest preview cache. */
const CACHE_PREFIX = "makeit_portfolio_digest";

/** How many leading markdown lines the preview renders (issue: ~12). */
const PREVIEW_LINES = 12;

/** Path of the cross-portfolio digest file for an ISO week key. */
function portfolioDigestPath(weekKey: string): string {
  return `digests/${weekKey}-portfolio.md`;
}

function cacheKey(weekKey: string): string {
  return `${CACHE_PREFIX}_${weekKey}`;
}

/**
 * Epoch ms at which a cached digest for `weekKey` stops being
 * authoritative: the end (Sunday 23:59:59.999 UTC) of that ISO week.
 *
 * Identical algorithm to the generator's internal `weekEndMs` (which is
 * not exported): ISO week 1 is the week containing Jan 4th; Monday of
 * week N is `week1Monday + (N-1)*7`; the week ends end-of-Sunday. A past
 * week's timestamp is already in the past, but the cache reader keeps a
 * cached past-week value anyway (the underlying activity is frozen).
 */
function weekEndMs(weekKey: string): number {
  const m = weekKey.match(/^(\d{4})-(\d{2})$/);
  if (!m) return 0;
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // Sun=7
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const weekMonday = new Date(week1Monday);
  weekMonday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  const weekSundayEnd = new Date(weekMonday);
  weekSundayEnd.setUTCDate(weekMonday.getUTCDate() + 6);
  weekSundayEnd.setUTCHours(23, 59, 59, 999);
  return weekSundayEnd.getTime();
}

interface CachedDigest {
  markdown: string;
  /** Epoch ms when this cache entry stops being authoritative. */
  expiresAt: number;
}

/**
 * Read the cached digest markdown for `weekKey`. `null` when absent,
 * corrupt, or expired for the *current* week. For a closed (past) week
 * a cached value never expires — the activity can no longer change.
 */
function readCache(weekKey: string, currentWeek: string): string | null {
  if (typeof sessionStorage === "undefined") return null;
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(cacheKey(weekKey));
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CachedDigest>;
    if (typeof parsed.markdown !== "string") return null;
    const expiresAt =
      typeof parsed.expiresAt === "number" ? parsed.expiresAt : 0;
    if (weekKey === currentWeek && Date.now() > expiresAt) return null;
    return parsed.markdown;
  } catch {
    return null;
  }
}

function writeCache(weekKey: string, markdown: string): void {
  if (typeof sessionStorage === "undefined") return;
  const payload: CachedDigest = { markdown, expiresAt: weekEndMs(weekKey) };
  try {
    sessionStorage.setItem(cacheKey(weekKey), JSON.stringify(payload));
  } catch {
    // Quota / disabled storage / private mode — non-fatal: the preview
    // still renders, only the cross-open cache is skipped.
  }
}

/** First `PREVIEW_LINES` non-trailing lines of the digest markdown. */
function previewMarkdown(markdown: string): string {
  return markdown.split("\n").slice(0, PREVIEW_LINES).join("\n").trim();
}

/** Loaded markdown, or `null` once we know the week has no digest file. */
type LoadState = "loading" | "ready" | "error";

interface Props {
  /**
   * Optional override of the ISO week (`YYYY-WW`) the panel targets.
   * Defaults to the current ISO week. The Portfolio Surface (Task-06)
   * does not need to pass this; it exists so a parent / test can pin a
   * specific week.
   */
  week?: string;
}

export function PortfolioDigestPanel({ week }: Props) {
  // Resolve the target week once at mount. `currentWeekKey()` reads the
  // clock, so it's captured in a lazy initializer (the sanctioned way to
  // keep a render-time impure call out of `useMemo`).
  const [weekKey] = useState(() => week ?? currentWeekKey());
  const [currentWeek] = useState(() => currentWeekKey());

  const [markdown, setMarkdown] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [open, setOpen] = useState(false);

  // Only the latest request may commit its result (guards against a
  // stale load racing a regenerate, and setState-after-unmount).
  const reqRef = useRef(0);

  const applyMarkdown = useCallback((md: string) => {
    setMarkdown(md);
    setState("ready");
    setErrMsg(null);
  }, []);

  const load = useCallback(async () => {
    const reqId = ++reqRef.current;

    const cached = readCache(weekKey, currentWeek);
    if (cached !== null) {
      // Cache hit → zero network requests this week (issue criterion).
      if (reqRef.current === reqId) applyMarkdown(cached);
      return;
    }

    setState("loading");
    setErrMsg(null);
    try {
      const file = await readFile(
        DIGEST_REPO,
        portfolioDigestPath(weekKey),
      );
      if (reqRef.current !== reqId) return; // superseded
      if (file === null) {
        // 404 → no digest for the week yet (empty-state + CTA).
        setMarkdown(null);
        setState("ready");
        return;
      }
      writeCache(weekKey, file.content);
      applyMarkdown(file.content);
    } catch (e) {
      if (reqRef.current !== reqId) return;
      setMarkdown(null);
      setState("error");
      setErrMsg(e instanceof Error ? e.message : String(e));
    }
  }, [weekKey, currentWeek, applyMarkdown]);

  useEffect(() => {
    void load();
  }, [load]);

  const regenerate = useCallback(async () => {
    setGenerating(true);
    setErrMsg(null);
    const reqId = ++reqRef.current;
    try {
      // The real Epic-012 Task-02 generator: rebuilds + re-persists
      // `digests/{weekKey}-portfolio.md` and returns the entry. `force`
      // bypasses the generator's own per-project cache.
      const entry = await generatePortfolioDigest(weekKey, { force: true });
      if (reqRef.current !== reqId) return;
      // Refresh preview in place (no page reload) and overwrite the
      // sessionStorage cache so a re-open serves the fresh markdown.
      writeCache(weekKey, entry.markdown);
      applyMarkdown(entry.markdown);
    } catch (e) {
      if (reqRef.current !== reqId) return;
      setState("error");
      setErrMsg(e instanceof Error ? e.message : String(e));
    } finally {
      if (reqRef.current === reqId) setGenerating(false);
    }
  }, [weekKey, applyMarkdown]);

  // Close the modal on Escape (same pattern as the generic V4 modal).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const previewHtml = useMemo(
    () =>
      markdown !== null
        ? renderMarkdownHtml(previewMarkdown(markdown))
        : "",
    [markdown],
  );
  const fullHtml = useMemo(
    () => (markdown !== null ? renderMarkdownHtml(markdown) : ""),
    [markdown],
  );

  const hasDigest = state === "ready" && markdown !== null;
  const showEmpty = state === "ready" && markdown === null;
  const showError = state === "error";
  const showLoading = state === "loading";

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
            <path d="M4 4h16v16H4z" />
            <path d="M8 9h8M8 13h8M8 17h5" />
          </svg>
          Дайджест портфеля
          <span className="v4-tag">{weekKey}</span>
          {generating && <span className="v4-tag">генерация…</span>}
        </div>
        <div className="v4-panel-actions">
          {hasDigest && (
            <button
              type="button"
              className="v4-btn v4-ai-btn"
              onClick={() => setOpen(true)}
              disabled={generating}
            >
              Открыть полностью
            </button>
          )}
          <button
            type="button"
            className="v4-btn v4-ai-btn"
            onClick={() => void regenerate()}
            disabled={generating}
            title="Пересобрать кросс-портфельный дайджест за неделю"
          >
            {generating
              ? "Генерация…"
              : hasDigest
                ? "Сгенерировать новый"
                : "Сгенерировать"}
          </button>
        </div>
      </div>

      <div className="v4-pdigest-body">
        {showError ? (
          <div
            className="v4-empty v4-ai-empty v4-pdigest-error"
            role="alert"
          >
            <div className="v4-pdigest-error-t">
              Не удалось загрузить дайджест
            </div>
            {errMsg && (
              <div className="v4-pdigest-error-m">{errMsg}</div>
            )}
          </div>
        ) : showLoading ? (
          <div className="v4-empty v4-ai-empty">Загрузка дайджеста…</div>
        ) : showEmpty ? (
          <div className="v4-empty v4-ai-empty v4-pdigest-empty">
            Дайджест за эту неделю ещё не сгенерирован
          </div>
        ) : (
          <div
            className="v4-pdigest-md"
            // Sanitised by `renderMarkdownHtml` (DOMPurify) — same
            // pipeline as the transcript brief / Hub DigestViewer. The
            // digest markdown is LLM-generated, so this MUST stay routed
            // through that helper, never raw.
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        )}
      </div>

      {open && markdown !== null && (
        <div
          className="v4-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="v4-modal v4-pdigest-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Дайджест портфеля за неделю ${weekKey}`}
          >
            <div className="v4-modal-h">
              <h3 className="v4-modal-t">
                Дайджест портфеля · {weekKey}
              </h3>
              <button
                type="button"
                className="v4-modal-close"
                onClick={() => setOpen(false)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="v4-modal-body">
              <div
                className="v4-pdigest-md"
                // Same DOMPurify-sanitised pipeline as the preview.
                dangerouslySetInnerHTML={{ __html: fullHtml }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PortfolioDigestPanel;
