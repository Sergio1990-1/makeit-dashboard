import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderMarkdownHtml } from "../../../utils/transcript-markdown";
import type { DigestEntry, DigestInput } from "../../../types/hub";
import {
  currentWeekKey,
  estimateDigestCost,
  generateDigest,
  loadDigest,
  recentWeekKeys,
} from "../../../utils/weeklyDigestGenerator";

/**
 * Weekly Project Digest viewer (Epic-012 Task-02, FR-36).
 *
 * Renders a project's weekly digest markdown (sanitised via the shared
 * `renderMarkdownHtml` — same DOMPurify pipeline as the transcript
 * brief) and offers:
 *   - a history dropdown of the last 12 ISO weeks; selecting one loads
 *     & renders that digest (cache → committed file);
 *   - a Regenerate button that first shows an estimated-cost preview
 *     (tokens × tariff) and requires an explicit confirm before it
 *     spends Claude budget;
 *   - a "budget fallback" badge when the digest ran on Haiku because
 *     the monthly Claude cap crossed the fallback threshold.
 *
 * Presentation-only w.r.t. data sources: the activity `input` for
 * (re)generation is injected by the parent (Task-08 DeliveryTab /
 * Task-09 `useProjectHub`). When no input is supplied the Regenerate
 * control is hidden — read-only history browsing still works.
 *
 * Not yet mounted in the Hub layout (DeliveryTab assembly is Task-08);
 * until then it is exercised by type-check / lint / build only.
 */

interface Props {
  repo: string;
  /**
   * Activity for the *current* week, used when the user regenerates.
   * Omit for a read-only viewer (history browsing still works).
   */
  input?: DigestInput;
}

type LoadState = "idle" | "loading" | "error";

/** Human label for an ISO week key (`2026-18` → `Неделя 18, 2026`). */
function weekLabel(weekKey: string): string {
  const m = weekKey.match(/^(\d{4})-(\d{2})$/);
  if (!m) return weekKey;
  return `Неделя ${Number(m[2])}, ${m[1]}`;
}

const cardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const badgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  background: "var(--v4-warning-50, rgba(234,179,8,0.12))",
  color: "var(--v4-warning-700, #b45309)",
  border: "1px solid var(--v4-warning-200, rgba(234,179,8,0.4))",
};

const btnStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid var(--v4-border, rgba(0,0,0,0.12))",
  background: "var(--v4-card, #fff)",
  color: "var(--v4-ink-900)",
  cursor: "pointer",
};

const selectStyle: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid var(--v4-border, rgba(0,0,0,0.12))",
  background: "var(--v4-card, #fff)",
  color: "var(--v4-ink-900)",
};

export function DigestViewer({ repo, input }: Props) {
  const weeks = useMemo(() => recentWeekKeys(12), []);
  const [selectedWeek, setSelectedWeek] = useState<string>(() =>
    currentWeekKey(),
  );
  const [entry, setEntry] = useState<DigestEntry | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Guard against setState after unmount / stale week selection: only
  // the latest requested week is allowed to commit its result.
  const reqRef = useRef(0);

  const load = useCallback(
    async (week: string) => {
      const reqId = ++reqRef.current;
      setState("loading");
      setErrMsg(null);
      try {
        const d = await loadDigest(repo, week);
        if (reqRef.current !== reqId) return; // superseded
        setEntry(d);
        setState("idle");
      } catch (e) {
        if (reqRef.current !== reqId) return;
        setEntry(null);
        setState("error");
        setErrMsg(e instanceof Error ? e.message : String(e));
      }
    },
    [repo],
  );

  useEffect(() => {
    void load(selectedWeek);
  }, [load, selectedWeek]);

  // Cost preview is recomputed lazily when the confirm dialog opens so
  // it reflects the live budget-fallback state at click time.
  const costPreview = useMemo(() => {
    if (!confirming || !input) return null;
    try {
      return estimateDigestCost(repo, selectedWeek, input);
    } catch {
      return null;
    }
  }, [confirming, input, repo, selectedWeek]);

  const canRegenerate = Boolean(input) && selectedWeek === currentWeekKey();

  const doRegenerate = useCallback(async () => {
    if (!input) return;
    setConfirming(false);
    setBusy(true);
    setErrMsg(null);
    const reqId = ++reqRef.current;
    try {
      const d = await generateDigest(repo, selectedWeek, input, {
        force: true,
      });
      if (reqRef.current !== reqId) return;
      setEntry(d);
      setState("idle");
    } catch (e) {
      if (reqRef.current !== reqId) return;
      setState("error");
      setErrMsg(e instanceof Error ? e.message : String(e));
    } finally {
      if (reqRef.current === reqId) setBusy(false);
    }
  }, [input, repo, selectedWeek]);

  const html = useMemo(
    () => (entry ? renderMarkdownHtml(entry.markdown) : ""),
    [entry],
  );

  return (
    <section
      aria-labelledby="v4-hub-digest-title"
      style={cardStyle}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <h3
            id="v4-hub-digest-title"
            style={{ fontSize: 14, fontWeight: 600, margin: 0 }}
          >
            Недельный дайджест
          </h3>
          {entry?.budgetFallback ? (
            <span
              style={badgeStyle}
              title="Дайджест сгенерирован на Haiku из-за превышения бюджета Claude"
            >
              бюджет исчерпан
            </span>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label
            htmlFor="v4-hub-digest-week"
            style={{ fontSize: 12, color: "var(--v4-ink-500)" }}
          >
            История
          </label>
          <select
            id="v4-hub-digest-week"
            aria-label="Выбрать неделю дайджеста"
            style={selectStyle}
            value={selectedWeek}
            disabled={busy}
            onChange={(e) => setSelectedWeek(e.target.value)}
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                {weekLabel(w)}
                {w === currentWeekKey() ? " (текущая)" : ""}
              </option>
            ))}
          </select>
          {canRegenerate ? (
            <button
              type="button"
              style={{
                ...btnStyle,
                opacity: busy ? 0.6 : 1,
                cursor: busy ? "not-allowed" : "pointer",
              }}
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              {busy ? "Генерация…" : "Перегенерировать"}
            </button>
          ) : null}
        </div>
      </header>

      {confirming && costPreview ? (
        <div
          role="alertdialog"
          aria-label="Подтверждение регенерации дайджеста"
          style={{
            border: "1px solid var(--v4-border, rgba(0,0,0,0.12))",
            borderRadius: 10,
            padding: 12,
            background: "var(--v4-bg-soft, rgba(0,0,0,0.03))",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: "var(--v4-ink-900)" }}>
            Регенерация запросит Claude ({costPreview.model}). Оценочная
            стоимость:{" "}
            <strong>${costPreview.usd.toFixed(4)}</strong>
            {costPreview.budgetFallback
              ? " — модель понижена до Haiku (budget fallback)."
              : "."}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              style={{
                ...btnStyle,
                background: "var(--v4-accent-600, #2563eb)",
                color: "#fff",
                borderColor: "var(--v4-accent-600, #2563eb)",
              }}
              onClick={() => void doRegenerate()}
            >
              Подтвердить
            </button>
            <button
              type="button"
              style={btnStyle}
              onClick={() => setConfirming(false)}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}

      {state === "loading" ? (
        <div
          style={{
            padding: 16,
            color: "var(--v4-ink-500)",
            fontSize: 13,
          }}
        >
          Загрузка дайджеста…
        </div>
      ) : state === "error" ? (
        <div
          style={{
            padding: 16,
            border: "1px solid var(--v4-danger-200, rgba(220,38,38,0.3))",
            borderRadius: 10,
            color: "var(--v4-danger-600, #dc2626)",
            fontSize: 13,
          }}
        >
          Не удалось загрузить дайджест{errMsg ? `: ${errMsg}` : "."}
        </div>
      ) : entry ? (
        <div
          className="v4-hub-digest-md"
          // Sanitised by `renderMarkdownHtml` (DOMPurify) — same
          // pipeline as the transcript brief. `entry.markdown` is
          // LLM-generated, so this MUST stay routed through that
          // helper, never raw.
          dangerouslySetInnerHTML={{ __html: html }}
          style={{
            fontSize: 13,
            lineHeight: 1.55,
            color: "var(--v4-ink-900)",
          }}
        />
      ) : (
        <div
          style={{
            padding: 16,
            border: "1px dashed var(--v4-border, rgba(0,0,0,0.12))",
            borderRadius: 10,
            color: "var(--v4-ink-500)",
            fontSize: 13,
          }}
        >
          {selectedWeek === currentWeekKey() && canRegenerate
            ? "Дайджест за эту неделю ещё не сгенерирован. Нажмите «Regenerate»."
            : "Дайджеста за выбранную неделю нет."}
        </div>
      )}
    </section>
  );
}

export default DigestViewer;
