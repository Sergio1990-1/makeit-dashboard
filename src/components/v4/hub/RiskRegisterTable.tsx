import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useModalA11y } from "../../../hooks/useModalA11y";
import {
  ConflictError,
  readYaml,
  writeYaml,
} from "../../../utils/github-contents";
import {
  extractRisks,
  type ExtractFailureReason,
  type ProposedRisk,
} from "../../../utils/extractRisksFromTranscripts";
import type {
  Risk,
  RiskProbability,
  RiskSeverity,
  RiskSource,
  RiskStatus,
} from "../../../types/hub";
import {
  PROBABILITIES,
  parseRisksFile,
  RISKS_PATH,
  type RisksFile,
  SEVERITIES,
  SOURCES,
  sortBySeverityDesc,
  STATUSES,
} from "../../../utils/risksRegister";

/**
 * Risk Register CRUD table over `docs/risks.yaml` (Epic-011 Task-03,
 * FR-29). Self-contained: owns its own read/write lifecycle via the
 * GitHub Contents API and resolves the inevitable concurrent-edit
 * conflict (last-writer-wins is unacceptable for a register) with an
 * explicit Reload-remote / Overwrite dialog.
 *
 * Not yet mounted — the DecisionsRisksTab four-section assembly is
 * Epic-011 Task-08. Until then this component is exercised only by
 * type-check / lint / build.
 *
 * Security: every risk field is rendered as a React text node (auto
 * HTML-escaped) and serialised through `js-yaml.dump` inside
 * `writeYaml`, so a title like `<img onerror>` or a yaml control
 * sequence is inert both on screen and on disk.
 */

const SEVERITY_LABEL: Record<RiskSeverity, string> = {
  low: "Низкая",
  med: "Средняя",
  high: "Высокая",
  critical: "Критическая",
};

const PROBABILITY_LABEL: Record<RiskProbability, string> = {
  low: "Низкая",
  med: "Средняя",
  high: "Высокая",
};

const STATUS_LABEL: Record<RiskStatus, string> = {
  open: "Открыт",
  mitigated: "Снижен",
  accepted: "Принят",
  closed: "Закрыт",
};

const SOURCE_LABEL: Record<RiskSource, string> = {
  manual: "Вручную",
  "transcript-extracted": "Транскрипт",
  "audit-promoted": "Аудит",
};

/**
 * Russian copy for each extraction failure. `empty` is intentionally
 * absent: a project with no usable transcripts is shown in the review
 * modal's empty state, not as a red error banner.
 */
const EXTRACT_ERROR_MESSAGE: Record<
  Exclude<ExtractFailureReason, "empty">,
  string
> = {
  "no-key":
    "Не настроен Claude API ключ. Добавьте ключ в настройках, чтобы извлекать риски из транскриптов.",
  "fetch-failed":
    "Не удалось получить список транскриптов (сервис недоступен). Попробуйте позже.",
  "budget-stopped":
    "Достигнут месячный лимит расходов Claude API — извлечение временно недоступно.",
  "claude-failed":
    "Не удалось обратиться к Claude API (сеть, ключ или ответ модели). Попробуйте ещё раз.",
};

/** A new blank risk seeded with a collision-resistant id. */
function blankRisk(): Risk {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return {
    id: `risk-${Date.now().toString(36)}-${rand}`,
    title: "",
    severity: "med",
    probability: "med",
    mitigation: "",
    owner: "",
    due: null,
    status: "open",
    source: "manual",
  };
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ─── styling tokens (shared with DecisionLog / v4 hub) ──────────────────

const cellStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid var(--mk-line-soft)",
  fontSize: 13,
  verticalAlign: "top",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "4px 6px",
  fontSize: 13,
  border: "1px solid var(--mk-line)",
  borderRadius: 6,
  background: "var(--v4-surface, transparent)",
  color: "var(--v4-ink-900, inherit)",
};

const pillStyle: React.CSSProperties = {
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
  background: "var(--mk-line-soft)",
  color: "var(--v4-ink-700)",
  whiteSpace: "nowrap",
};

const btn: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid var(--mk-line)",
  background: "var(--v4-surface, transparent)",
  color: "var(--v4-ink-900, inherit)",
  cursor: "pointer",
};

const btnPrimary: React.CSSProperties = {
  ...btn,
  background: "var(--mk-primary)",
  borderColor: "var(--mk-primary)",
  color: "#fff",
};

interface Props {
  repo: string;
  /**
   * Optional observer for the rendered record count. Fired with
   * `risks.length` whenever it changes (after load / CRUD). Lets a
   * parent (DecisionsRisksTab) show an accurate section counter from
   * the SAME data this table renders — no divergent second fetch.
   */
  onCount?: (count: number) => void;
}

type Phase = "loading" | "ready" | "error";

export function RiskRegisterTable({ repo, onCount }: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  /** `null` ⇒ file does not exist yet (empty-state with "create"). */
  const [fileExists, setFileExists] = useState(false);
  const [risks, setRisks] = useState<Risk[]>([]);
  /** Last sha seen from GitHub — the ETag we send back on write. */
  const sha = useRef<string | undefined>(undefined);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Risk | null>(null);
  const [adding, setAdding] = useState(false);
  // Two-step delete (mirrors CommitmentsTable): the first click arms the
  // confirm, the second persists+commits. `null` ⇒ nothing armed.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  // Neutral (non-error) feedback, e.g. the post-reload merge notice.
  // Kept separate from writeError so success isn't styled/announced as
  // an error (red role="alert").
  const [infoNotice, setInfoNotice] = useState<string | null>(null);

  /**
   * Pending conflict: we hold the local list we tried to persist so the
   * dialog's two actions can either re-apply it on top of fresh remote
   * (overwrite) or merge it under fresh remote (reload).
   */
  const [conflict, setConflict] = useState<{ attempted: Risk[] } | null>(null);

  const load = useCallback(async () => {
    setPhase("loading");
    setLoadError(null);
    try {
      const res = await readYaml<RisksFile>(repo, RISKS_PATH);
      if (res === null) {
        setFileExists(false);
        setRisks([]);
        sha.current = undefined;
      } else {
        setFileExists(true);
        setRisks(parseRisksFile(res.data));
        sha.current = res.sha;
      }
      setPhase("ready");
    } catch (e) {
      setLoadError(errorMessage(e));
      setPhase("error");
    }
  }, [repo]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(() => sortBySeverityDesc(risks), [risks]);

  // Report the rendered count to an interested parent. Effect (not
  // render) so it's a parent notification, not a synchronous local
  // setState — fires after commit, only when the count or callback
  // identity changes. Callers pass a stable `useCallback` per the
  // standard effect-dependency contract.
  useEffect(() => {
    onCount?.(risks.length);
  }, [risks.length, onCount]);

  /**
   * Persist `next` to the repo. On a sha conflict we DON'T silently
   * retry (that would clobber the other writer) — we surface the
   * dialog and keep `next` so the user picks the resolution.
   */
  const persist = useCallback(
    async (next: Risk[], commitMsg: string): Promise<boolean> => {
      setBusy(true);
      setWriteError(null);
      setInfoNotice(null);
      try {
        const { sha: newSha } = await writeYaml<RisksFile>(
          repo,
          RISKS_PATH,
          { risks: next },
          commitMsg,
          sha.current,
        );
        sha.current = newSha;
        setFileExists(true);
        setRisks(next);
        return true;
      } catch (e) {
        if (e instanceof ConflictError) {
          setConflict({ attempted: next });
        } else {
          setWriteError(errorMessage(e));
        }
        return false;
      } finally {
        setBusy(false);
      }
    },
    [repo],
  );

  // ── conflict resolution ───────────────────────────────────────────

  /** Overwrite: re-read only to refresh the sha, then force our list. */
  const resolveOverwrite = useCallback(async () => {
    if (!conflict) return;
    setBusy(true);
    setWriteError(null);
    setInfoNotice(null);
    try {
      const fresh = await readYaml<RisksFile>(repo, RISKS_PATH);
      sha.current = fresh?.sha;
      const { sha: newSha } = await writeYaml<RisksFile>(
        repo,
        RISKS_PATH,
        { risks: conflict.attempted },
        "chore(hub): overwrite risks.yaml (resolved conflict)",
        sha.current,
      );
      sha.current = newSha;
      setRisks(conflict.attempted);
      setFileExists(true);
      setConflict(null);
    } catch (e) {
      setWriteError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [conflict, repo]);

  /**
   * Reload: take the fresh remote list as the base, then re-apply our
   * local edits on top — keyed by id so a risk the other writer also
   * touched gets OUR version (the edits we were trying to save win at
   * field level), brand-new remote risks survive, and our additions
   * are appended. This is the documented "merge local over fresh sha".
   */
  const resolveReload = useCallback(async () => {
    if (!conflict) return;
    setBusy(true);
    setWriteError(null);
    setInfoNotice(null);
    try {
      const fresh = await readYaml<RisksFile>(repo, RISKS_PATH);
      sha.current = fresh?.sha;
      const remote = fresh ? parseRisksFile(fresh.data) : [];
      const localById = new Map(conflict.attempted.map((r) => [r.id, r]));
      const merged: Risk[] = [];
      const seen = new Set<string>();
      for (const r of remote) {
        merged.push(localById.get(r.id) ?? r);
        seen.add(r.id);
      }
      for (const r of conflict.attempted) {
        if (!seen.has(r.id)) merged.push(r);
      }
      setRisks(merged);
      setFileExists(Boolean(fresh));
      setConflict(null);
      // Surface the merged result for review rather than auto-writing —
      // the user explicitly asked to see remote before clobbering it.
      // NOTE: merge is keyed by id. A risk deleted locally but still
      // present in fresh remote is re-added (resurrection), since a
      // local deletion is an absence, not a tombstone — we favour
      // resurrection over silent data loss. Flagged to the user below.
      const reloadHadDeletions =
        conflict.attempted.length < remote.length &&
        remote.some((r) => !localById.has(r.id));
      setInfoNotice(
        reloadHadDeletions
          ? "Загружена свежая версия, ваши правки применены поверх. Внимание: удалённые вами риски могли вернуться (есть в свежей версии). Проверьте и сохраните снова."
          : "Загружена свежая версия и применены ваши правки поверх. Проверьте и сохраните снова.",
      );
    } catch (e) {
      setWriteError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [conflict, repo]);

  // ── mutations ─────────────────────────────────────────────────────

  const startAdd = () => {
    setDraft(blankRisk());
    setAdding(true);
  };

  const startEdit = (r: Risk) => {
    setEditingId(r.id);
    setDraft({ ...r });
  };

  const cancelDraft = () => {
    setEditingId(null);
    setDraft(null);
    setAdding(false);
  };

  const saveDraft = async () => {
    if (!draft) return;
    const title = draft.title.trim();
    if (title === "") {
      setWriteError("Название риска обязательно");
      return;
    }
    const clean: Risk = { ...draft, title };
    const next = adding
      ? [...risks, clean]
      : risks.map((r) => (r.id === clean.id ? clean : r));
    const ok = await persist(
      next,
      adding
        ? `chore(hub): add risk "${title}" to risks.yaml`
        : `chore(hub): update risk "${title}" in risks.yaml`,
    );
    if (ok) cancelDraft();
  };

  const deleteRisk = async (r: Risk) => {
    setConfirmDeleteId(null);
    const next = risks.filter((x) => x.id !== r.id);
    await persist(next, `chore(hub): delete risk "${r.title}" from risks.yaml`);
  };

  const createFile = async () => {
    await persist([], "chore(hub): create docs/risks.yaml");
  };

  // ── risk extraction from transcripts (Epic-011 Task-09) ────────────

  /**
   * Extraction lifecycle. `idle` ⇒ no modal. While `extracting` we show
   * a loading state on the button. `done` opens the review modal with
   * `proposals` (possibly empty → "nothing found" state inside modal).
   */
  const [extractPhase, setExtractPhase] = useState<
    "idle" | "extracting" | "done"
  >("idle");
  const [proposals, setProposals] = useState<ProposedRisk[]>([]);
  const [extractError, setExtractError] = useState<string | null>(null);

  const runExtraction = useCallback(async () => {
    setExtractPhase("extracting");
    setExtractError(null);
    setProposals([]);
    try {
      const res = await extractRisks(repo);
      if (res.ok) {
        // Genuine result (possibly empty → modal's "nothing found"
        // state). The error banner stays cleared.
        setProposals(res.risks);
        setExtractPhase("done");
      } else if (res.reason === "empty") {
        // No usable transcripts: not an operator-actionable error —
        // surface it inside the review modal's empty state.
        setProposals([]);
        setExtractPhase("done");
      } else {
        // Operational failure (no key / service down / budget / Claude
        // error) → route to the error banner, keep the modal closed.
        setExtractError(EXTRACT_ERROR_MESSAGE[res.reason]);
        setExtractPhase("idle");
      }
    } catch (e) {
      // extractRisks is contracted never to throw, but stay defensive
      // so a future regression can't wedge the button in "extracting".
      setExtractError(`Не удалось извлечь риски: ${errorMessage(e)}`);
      setExtractPhase("idle");
    }
  }, [repo]);

  const closeExtraction = () => {
    setExtractPhase("idle");
    setProposals([]);
  };

  /**
   * Approve one proposed risk: convert it to a real `Risk` (forcing
   * `source: 'transcript-extracted'`) and append it through the
   * component's EXISTING `persist()` path — same sha/ConflictError flow
   * as manual add, so there is exactly one writer to risks.yaml. On a
   * successful write the row is dropped from the modal list; on conflict
   * the standard ConflictDialog takes over (the proposal stays in the
   * list so it can be retried after the user resolves the conflict).
   */
  const approveProposal = useCallback(
    async (p: ProposedRisk): Promise<void> => {
      const rand =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID().slice(0, 8)
          : Math.random().toString(36).slice(2, 10);
      const risk: Risk = {
        id: `risk-${Date.now().toString(36)}-${rand}`,
        title: p.title.trim(),
        severity: p.severity,
        probability: p.probability,
        mitigation: p.mitigation.trim(),
        owner: "",
        due: null,
        status: "open",
        source: "transcript-extracted",
      };
      const ok = await persist(
        [...risks, risk],
        `chore(hub): add risk "${risk.title}" from transcript to risks.yaml`,
      );
      if (ok) {
        setProposals((prev) => prev.filter((x) => x !== p));
      }
    },
    [persist, risks],
  );

  const rejectProposal = useCallback((p: ProposedRisk) => {
    // Reject = forget it. Nothing is written to risks.yaml.
    setProposals((prev) => prev.filter((x) => x !== p));
  }, []);

  /** Replace a proposal in-place after an inline edit (no write yet). */
  const editProposal = useCallback(
    (index: number, next: ProposedRisk) => {
      setProposals((prev) =>
        prev.map((x, i) => (i === index ? next : x)),
      );
    },
    [],
  );

  // ── render ────────────────────────────────────────────────────────

  if (phase === "loading") {
    return (
      <div style={{ ...pillStyle, display: "inline-block", padding: 12 }}>
        Загрузка рисков…
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div
        style={{
          padding: 16,
          border: "1px solid var(--mk-danger)",
          borderRadius: 10,
          color: "var(--mk-danger)",
          fontSize: 13,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <span>Не удалось загрузить risks.yaml: {loadError}</span>
        <button type="button" style={btn} onClick={() => void load()}>
          Повторить
        </button>
      </div>
    );
  }

  if (!fileExists) {
    return (
      <div
        style={{
          padding: 16,
          border: "1px dashed var(--mk-line)",
          borderRadius: 10,
          color: "var(--v4-ink-500)",
          fontSize: 13,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        <span>
          В репозитории нет <code>docs/risks.yaml</code>. Создайте файл, чтобы
          начать вести реестр рисков.
        </span>
        {writeError && (
          <span style={{ color: "var(--mk-danger)" }}>
            {writeError}
          </span>
        )}
        <button
          type="button"
          style={btnPrimary}
          disabled={busy}
          onClick={() => void createFile()}
        >
          {busy ? "Создание…" : "Создать docs/risks.yaml"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 12, color: "var(--v4-ink-500)" }}>
          {risks.length}{" "}
          {risks.length === 1 ? "риск" : "рисков"} · сортировка по severity
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            style={btn}
            disabled={
              busy ||
              adding ||
              editingId !== null ||
              extractPhase === "extracting"
            }
            onClick={() => void runExtraction()}
          >
            {extractPhase === "extracting"
              ? "Извлечение…"
              : "Извлечь из транскриптов"}
          </button>
          <button
            type="button"
            style={btnPrimary}
            disabled={busy || adding || editingId !== null}
            onClick={startAdd}
          >
            + Добавить риск
          </button>
        </div>
      </div>

      {extractError && (
        <div
          role="alert"
          style={{
            fontSize: 12,
            padding: "8px 10px",
            borderRadius: 8,
            background: "var(--mk-danger-soft)",
            color: "var(--mk-danger)",
          }}
        >
          {extractError}
        </div>
      )}

      {writeError && (
        <div
          role="alert"
          style={{
            fontSize: 12,
            padding: "8px 10px",
            borderRadius: 8,
            background: "var(--mk-danger-soft)",
            color: "var(--mk-danger)",
          }}
        >
          {writeError}
        </div>
      )}

      {infoNotice && (
        <div
          role="status"
          style={{
            fontSize: 12,
            padding: "8px 10px",
            borderRadius: 8,
            background: "var(--mk-surface-3)",
            color: "var(--mk-ink-700)",
          }}
        >
          {infoNotice}
        </div>
      )}

      {risks.length === 0 ? (
        <div
          style={{
            padding: 16,
            border: "1px dashed var(--mk-line)",
            borderRadius: 10,
            color: "var(--v4-ink-500)",
            fontSize: 13,
          }}
        >
          Рисков пока нет. Нажмите «Добавить риск».
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr style={{ textAlign: "left", color: "var(--v4-ink-500)" }}>
                <th style={{ ...cellStyle, fontWeight: 600 }}>Серьёзность</th>
                <th style={{ ...cellStyle, fontWeight: 600 }}>Риск</th>
                <th style={{ ...cellStyle, fontWeight: 600 }}>Вероятность</th>
                <th style={{ ...cellStyle, fontWeight: 600 }}>Митигация</th>
                <th style={{ ...cellStyle, fontWeight: 600 }}>Владелец</th>
                <th style={{ ...cellStyle, fontWeight: 600 }}>Срок</th>
                <th style={{ ...cellStyle, fontWeight: 600 }}>Статус</th>
                <th style={{ ...cellStyle, fontWeight: 600 }}>Источник</th>
                <th style={{ ...cellStyle, fontWeight: 600 }} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const isEditing = editingId === r.id && draft;
                if (isEditing && draft) {
                  return (
                    <RiskEditRow
                      key={r.id}
                      draft={draft}
                      busy={busy}
                      onChange={setDraft}
                      onSave={() => void saveDraft()}
                      onCancel={cancelDraft}
                    />
                  );
                }
                return (
                  <tr key={r.id}>
                    <td style={cellStyle}>
                      <span
                        style={{
                          ...pillStyle,
                          background: severityBg(r.severity),
                          color: "#fff",
                        }}
                      >
                        {SEVERITY_LABEL[r.severity]}
                      </span>
                    </td>
                    <td style={{ ...cellStyle, fontWeight: 600 }}>
                      {r.title || "—"}
                    </td>
                    <td style={cellStyle}>{PROBABILITY_LABEL[r.probability]}</td>
                    <td style={cellStyle}>{r.mitigation || "—"}</td>
                    <td style={cellStyle}>{r.owner ? `@${r.owner}` : "—"}</td>
                    <td
                      style={{
                        ...cellStyle,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatDate(r.due)}
                    </td>
                    <td style={cellStyle}>
                      <span style={pillStyle}>{STATUS_LABEL[r.status]}</span>
                    </td>
                    <td style={cellStyle}>
                      <span style={pillStyle}>{SOURCE_LABEL[r.source]}</span>
                    </td>
                    <td style={cellStyle}>
                      {confirmDeleteId === r.id ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            style={{
                              ...btn,
                              borderColor: "var(--mk-danger)",
                              color: "var(--mk-danger)",
                            }}
                            disabled={busy}
                            onClick={() => void deleteRisk(r)}
                          >
                            Удалить
                          </button>
                          <button
                            type="button"
                            style={btn}
                            disabled={busy}
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Отмена
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            style={btn}
                            disabled={busy || adding || editingId !== null}
                            onClick={() => {
                              setConfirmDeleteId(null);
                              startEdit(r);
                            }}
                          >
                            Изм.
                          </button>
                          <button
                            type="button"
                            style={btn}
                            disabled={busy || adding || editingId !== null}
                            onClick={() => setConfirmDeleteId(r.id)}
                          >
                            Удал.
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {adding && draft && (
        <RiskFormModal
          draft={draft}
          busy={busy}
          onChange={setDraft}
          onSave={() => void saveDraft()}
          onCancel={cancelDraft}
        />
      )}

      {extractPhase === "done" && (
        <ExtractReviewModal
          proposals={proposals}
          busy={busy}
          onApprove={(p) => void approveProposal(p)}
          onReject={rejectProposal}
          onEdit={editProposal}
          onClose={closeExtraction}
        />
      )}

      {conflict && (
        <ConflictDialog
          busy={busy}
          onReload={() => void resolveReload()}
          onOverwrite={() => void resolveOverwrite()}
          onDismiss={() => setConflict(null)}
        />
      )}
    </div>
  );
}

// ─── transcript-extraction review modal ─────────────────────────────────

interface ExtractReviewProps {
  proposals: ProposedRisk[];
  busy: boolean;
  onApprove: (p: ProposedRisk) => void;
  onReject: (p: ProposedRisk) => void;
  onEdit: (index: number, next: ProposedRisk) => void;
  onClose: () => void;
}

function ExtractReviewModal({
  proposals,
  busy,
  onApprove,
  onReject,
  onEdit,
  onClose,
}: ExtractReviewProps) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  // The proposals array is index-keyed for the edit toggle. When a row
  // is approved/rejected the array shifts, so a stale `editingIdx`
  // would attach the edit form to the wrong card. Reset it during
  // render (the React-recommended "adjust state on prop change"
  // pattern) whenever the list length changes — no effect needed.
  const count = proposals.length;
  const [seenCount, setSeenCount] = useState(count);
  if (seenCount !== count) {
    setSeenCount(count);
    setEditingIdx(null);
  }

  // a11y: focus-trap + Escape→close + focus-restore (the dialog promises
  // aria-modal="true"). Escape maps to onClose (the explicit dismiss).
  const modalRef = useModalA11y<HTMLDivElement>(onClose);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Риски из транскриптов"
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--mk-overlay)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        style={{
          background: "var(--v4-surface, #fff)",
          color: "var(--v4-ink-900, inherit)",
          borderRadius: 12,
          padding: 20,
          width: "min(640px, 100%)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          maxHeight: "90vh",
          overflowY: "auto",
          outline: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16 }}>Риски из транскриптов</h3>
          <button type="button" style={btn} onClick={onClose}>
            Закрыть
          </button>
        </div>

        {proposals.length === 0 ? (
          <div
            style={{
              padding: 16,
              border: "1px dashed var(--mk-line)",
              borderRadius: 10,
              color: "var(--v4-ink-500)",
              fontSize: 13,
            }}
          >
            В последних транскриптах проекта риски не найдены (или нет
            обработанных транскриптов). Закройте это окно.
          </div>
        ) : (
          <>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: "var(--v4-ink-500)",
              }}
            >
              {proposals.length}{" "}
              {proposals.length === 1
                ? "предложенный риск"
                : "предложенных рисков"}
              . «Одобрить» добавит риск в risks.yaml (источник: Transcript).
              «Отклонить» ничего не записывает.
            </p>
            <div
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              {proposals.map((p, idx) => {
                const isEditing = editingIdx === idx;
                return (
                  <div
                    key={`${p.source}-${idx}`}
                    style={{
                      border:
                        "1px solid var(--mk-line)",
                      borderRadius: 10,
                      padding: 12,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {isEditing ? (
                      <ProposalEditForm
                        value={p}
                        onChange={(next) => onEdit(idx, next)}
                      />
                    ) : (
                      <>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                          {p.title || "—"}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              ...pillStyle,
                              background: severityBg(p.severity),
                              color: "#fff",
                            }}
                          >
                            {SEVERITY_LABEL[p.severity]}
                          </span>
                          <span style={pillStyle}>
                            Вероятность:{" "}
                            {PROBABILITY_LABEL[p.probability]}
                          </span>
                        </div>
                        {p.mitigation && (
                          <div
                            style={{
                              fontSize: 13,
                              color: "var(--v4-ink-700)",
                            }}
                          >
                            Митигация: {p.mitigation}
                          </div>
                        )}
                      </>
                    )}
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        justifyContent: "flex-end",
                        flexWrap: "wrap",
                      }}
                    >
                      {isEditing ? (
                        <button
                          type="button"
                          style={btn}
                          disabled={busy}
                          onClick={() => setEditingIdx(null)}
                        >
                          Готово
                        </button>
                      ) : (
                        <button
                          type="button"
                          style={btn}
                          disabled={busy}
                          onClick={() => setEditingIdx(idx)}
                        >
                          Изм.
                        </button>
                      )}
                      <button
                        type="button"
                        style={btn}
                        disabled={busy}
                        onClick={() => onReject(p)}
                      >
                        Отклонить
                      </button>
                      <button
                        type="button"
                        style={btnPrimary}
                        disabled={busy || p.title.trim() === ""}
                        onClick={() => onApprove(p)}
                      >
                        {busy ? "…" : "Одобрить"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface ProposalEditFormProps {
  value: ProposedRisk;
  onChange: (next: ProposedRisk) => void;
}

function ProposalEditForm({ value, onChange }: ProposalEditFormProps) {
  const field: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 12,
    color: "var(--v4-ink-500)",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={field}>
        Название
        <input
          aria-label="Название риска"
          style={inputStyle}
          value={value.title}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
        />
      </label>
      <div style={{ display: "flex", gap: 12 }}>
        <label style={{ ...field, flex: 1 }}>
          Серьёзность
          <select
            aria-label="Серьёзность"
            style={inputStyle}
            value={value.severity}
            onChange={(e) =>
              onChange({
                ...value,
                severity: e.target.value as RiskSeverity,
              })
            }
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {SEVERITY_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label style={{ ...field, flex: 1 }}>
          Вероятность
          <select
            aria-label="Вероятность"
            style={inputStyle}
            value={value.probability}
            onChange={(e) =>
              onChange({
                ...value,
                probability: e.target.value as RiskProbability,
              })
            }
          >
            {PROBABILITIES.map((pr) => (
              <option key={pr} value={pr}>
                {PROBABILITY_LABEL[pr]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label style={field}>
        Митигация
        <input
          aria-label="Митигация"
          style={inputStyle}
          value={value.mitigation}
          onChange={(e) =>
            onChange({ ...value, mitigation: e.target.value })
          }
        />
      </label>
    </div>
  );
}

// ─── severity colour (shared scale) ─────────────────────────────────────

function severityBg(s: RiskSeverity): string {
  switch (s) {
    case "critical":
      return "var(--mk-danger)";
    case "high":
      return "var(--mk-warn)";
    case "med":
      return "var(--mk-severity-medium)";
    case "low":
      return "var(--mk-ink-500)";
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── inline edit row ────────────────────────────────────────────────────

interface EditProps {
  draft: Risk;
  busy: boolean;
  onChange: (r: Risk) => void;
  onSave: () => void;
  onCancel: () => void;
}

function RiskEditRow({ draft, busy, onChange, onSave, onCancel }: EditProps) {
  return (
    <tr>
      <td style={cellStyle}>
        <select
          aria-label="Severity"
          style={inputStyle}
          value={draft.severity}
          onChange={(e) =>
            onChange({ ...draft, severity: e.target.value as RiskSeverity })
          }
        >
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {SEVERITY_LABEL[s]}
            </option>
          ))}
        </select>
      </td>
      <td style={cellStyle}>
        <input
          aria-label="Название риска"
          style={inputStyle}
          value={draft.title}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
        />
      </td>
      <td style={cellStyle}>
        <select
          aria-label="Вероятность"
          style={inputStyle}
          value={draft.probability}
          onChange={(e) =>
            onChange({
              ...draft,
              probability: e.target.value as RiskProbability,
            })
          }
        >
          {PROBABILITIES.map((p) => (
            <option key={p} value={p}>
              {PROBABILITY_LABEL[p]}
            </option>
          ))}
        </select>
      </td>
      <td style={cellStyle}>
        <input
          aria-label="Митигация"
          style={inputStyle}
          value={draft.mitigation}
          onChange={(e) => onChange({ ...draft, mitigation: e.target.value })}
        />
      </td>
      <td style={cellStyle}>
        <input
          aria-label="Владелец"
          style={inputStyle}
          value={draft.owner}
          onChange={(e) => onChange({ ...draft, owner: e.target.value })}
        />
      </td>
      <td style={cellStyle}>
        <input
          aria-label="Срок"
          type="date"
          style={inputStyle}
          value={draft.due ?? ""}
          onChange={(e) =>
            onChange({ ...draft, due: e.target.value || null })
          }
        />
      </td>
      <td style={cellStyle}>
        <select
          aria-label="Статус"
          style={inputStyle}
          value={draft.status}
          onChange={(e) =>
            onChange({ ...draft, status: e.target.value as RiskStatus })
          }
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </td>
      <td style={cellStyle}>
        <select
          aria-label="Источник"
          style={inputStyle}
          value={draft.source}
          onChange={(e) =>
            onChange({ ...draft, source: e.target.value as RiskSource })
          }
        >
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
      </td>
      <td style={cellStyle}>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            style={btnPrimary}
            disabled={busy}
            onClick={onSave}
          >
            {busy ? "…" : "OK"}
          </button>
          <button
            type="button"
            style={btn}
            disabled={busy}
            onClick={onCancel}
          >
            Отмена
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── add modal ──────────────────────────────────────────────────────────

function RiskFormModal({ draft, busy, onChange, onSave, onCancel }: EditProps) {
  const field: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 12,
    color: "var(--v4-ink-500)",
  };
  // a11y: focus-trap + Escape→cancel + focus-restore (this dialog
  // promises aria-modal="true"). Escape maps to onCancel.
  const modalRef = useModalA11y<HTMLDivElement>(onCancel);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Добавить риск"
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--mk-overlay)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        style={{
          background: "var(--v4-surface, #fff)",
          color: "var(--v4-ink-900, inherit)",
          borderRadius: 12,
          padding: 20,
          width: "min(520px, 100%)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          maxHeight: "90vh",
          overflowY: "auto",
          outline: "none",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16 }}>Новый риск</h3>
        <label style={field}>
          Название
          <input
            autoFocus
            style={inputStyle}
            value={draft.title}
            onChange={(e) => onChange({ ...draft, title: e.target.value })}
          />
        </label>
        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ ...field, flex: 1 }}>
            Severity
            <select
              style={inputStyle}
              value={draft.severity}
              onChange={(e) =>
                onChange({
                  ...draft,
                  severity: e.target.value as RiskSeverity,
                })
              }
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label style={{ ...field, flex: 1 }}>
            Вероятность
            <select
              style={inputStyle}
              value={draft.probability}
              onChange={(e) =>
                onChange({
                  ...draft,
                  probability: e.target.value as RiskProbability,
                })
              }
            >
              {PROBABILITIES.map((p) => (
                <option key={p} value={p}>
                  {PROBABILITY_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label style={field}>
          Митигация
          <input
            style={inputStyle}
            value={draft.mitigation}
            onChange={(e) =>
              onChange({ ...draft, mitigation: e.target.value })
            }
          />
        </label>
        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ ...field, flex: 1 }}>
            Владелец
            <input
              style={inputStyle}
              value={draft.owner}
              onChange={(e) => onChange({ ...draft, owner: e.target.value })}
            />
          </label>
          <label style={{ ...field, flex: 1 }}>
            Срок
            <input
              type="date"
              style={inputStyle}
              value={draft.due ?? ""}
              onChange={(e) =>
                onChange({ ...draft, due: e.target.value || null })
              }
            />
          </label>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ ...field, flex: 1 }}>
            Статус
            <select
              style={inputStyle}
              value={draft.status}
              onChange={(e) =>
                onChange({ ...draft, status: e.target.value as RiskStatus })
              }
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label style={{ ...field, flex: 1 }}>
            Источник
            <select
              style={inputStyle}
              value={draft.source}
              onChange={(e) =>
                onChange({ ...draft, source: e.target.value as RiskSource })
              }
            >
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 4,
          }}
        >
          <button
            type="button"
            style={btn}
            disabled={busy}
            onClick={onCancel}
          >
            Отмена
          </button>
          <button
            type="button"
            style={btnPrimary}
            disabled={busy}
            onClick={onSave}
          >
            {busy ? "Сохранение…" : "Добавить"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ETag conflict dialog ───────────────────────────────────────────────

interface ConflictProps {
  busy: boolean;
  onReload: () => void;
  onOverwrite: () => void;
  onDismiss: () => void;
}

function ConflictDialog({
  busy,
  onReload,
  onOverwrite,
  onDismiss,
}: ConflictProps) {
  // a11y: focus-trap + Escape→dismiss + focus-restore (this alertdialog
  // promises aria-modal="true"). Escape maps to onDismiss (cancel).
  const modalRef = useModalA11y<HTMLDivElement>(onDismiss);
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Конфликт версий risks.yaml"
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--mk-overlay)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        padding: 16,
      }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        style={{
          background: "var(--v4-surface, #fff)",
          color: "var(--v4-ink-900, inherit)",
          borderRadius: 12,
          padding: 20,
          width: "min(440px, 100%)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          outline: "none",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16 }}>Конфликт версий</h3>
        <p style={{ margin: 0, fontSize: 13, color: "var(--v4-ink-700)" }}>
          Кто-то изменил <code>risks.yaml</code> после того, как вы открыли
          реестр. Перезагрузите свежую версию (ваши правки наложатся поверх) или
          перезапишите её своими данными.
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            style={btn}
            disabled={busy}
            onClick={onDismiss}
          >
            Отмена
          </button>
          <button
            type="button"
            style={btn}
            disabled={busy}
            onClick={onReload}
          >
            {busy ? "…" : "Перезагрузить"}
          </button>
          <button
            type="button"
            style={btnPrimary}
            disabled={busy}
            onClick={onOverwrite}
          >
            {busy ? "…" : "Перезаписать"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RiskRegisterTable;
