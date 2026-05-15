import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ConflictError,
  readYaml,
  writeYaml,
} from "../../../utils/github-contents";
import type {
  Risk,
  RiskProbability,
  RiskSeverity,
  RiskSource,
  RiskStatus,
} from "../../../types/hub";

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

const RISKS_PATH = "docs/risks.yaml";

/** On-disk shape of `docs/risks.yaml`: `{ risks: Risk[] }`. */
interface RisksFile {
  risks: Risk[];
}

const SEVERITIES: RiskSeverity[] = ["low", "med", "high", "critical"];
const PROBABILITIES: RiskProbability[] = ["low", "med", "high"];
const STATUSES: RiskStatus[] = ["open", "mitigated", "accepted", "closed"];
const SOURCES: RiskSource[] = [
  "manual",
  "transcript-extracted",
  "audit-promoted",
];

/** Worst→best ordering so the default sort puts critical on top. */
const SEVERITY_RANK: Record<RiskSeverity, number> = {
  critical: 3,
  high: 2,
  med: 1,
  low: 0,
};

const SEVERITY_LABEL: Record<RiskSeverity, string> = {
  low: "Low",
  med: "Medium",
  high: "High",
  critical: "Critical",
};

const PROBABILITY_LABEL: Record<RiskProbability, string> = {
  low: "Low",
  med: "Medium",
  high: "High",
};

const STATUS_LABEL: Record<RiskStatus, string> = {
  open: "Открыт",
  mitigated: "Снижен",
  accepted: "Принят",
  closed: "Закрыт",
};

const SOURCE_LABEL: Record<RiskSource, string> = {
  manual: "Manual",
  "transcript-extracted": "Transcript",
  "audit-promoted": "Audit",
};

/** Coerce an arbitrary yaml value to a valid member of `allowed`. */
function coerceEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** Trim to a string, tolerating `null`/`number`/missing yaml values. */
function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

/**
 * Normalise one raw yaml row into a valid `Risk`. A hand-edited or
 * extractor-produced file can carry an invalid `severity`, a missing
 * `owner`, a numeric `due`, etc. — we never trust it, we repair it so
 * the table can't crash on bad input.
 */
function normaliseRisk(raw: unknown, index: number): Risk {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = asString(r.id).trim() || `risk-${index + 1}`;
  const dueRaw = asString(r.due).trim();
  return {
    id,
    title: asString(r.title).trim(),
    severity: coerceEnum<RiskSeverity>(r.severity, SEVERITIES, "med"),
    probability: coerceEnum<RiskProbability>(
      r.probability,
      PROBABILITIES,
      "med",
    ),
    mitigation: asString(r.mitigation).trim(),
    owner: asString(r.owner).trim(),
    due: dueRaw === "" ? null : dueRaw,
    status: coerceEnum<RiskStatus>(r.status, STATUSES, "open"),
    source: coerceEnum<RiskSource>(r.source, SOURCES, "manual"),
  };
}

/** Pull a `Risk[]` out of whatever `readYaml` returned. */
function parseRisksFile(data: unknown): Risk[] {
  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as RisksFile | null)?.risks)
      ? (data as RisksFile).risks
      : [];
  return list.map(normaliseRisk);
}

/** Stable severity-desc sort (tie-break by id) for deterministic rows. */
function sortBySeverityDesc(risks: Risk[]): Risk[] {
  return [...risks].sort((a, b) => {
    const d = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

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
  borderBottom: "1px solid var(--v4-border, rgba(0,0,0,0.08))",
  fontSize: 13,
  verticalAlign: "top",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "4px 6px",
  fontSize: 13,
  border: "1px solid var(--v4-border, rgba(0,0,0,0.15))",
  borderRadius: 6,
  background: "var(--v4-surface, transparent)",
  color: "var(--v4-ink-900, inherit)",
};

const pillStyle: React.CSSProperties = {
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
  background: "var(--v4-border, rgba(0,0,0,0.08))",
  color: "var(--v4-ink-700)",
  whiteSpace: "nowrap",
};

const btn: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid var(--v4-border, rgba(0,0,0,0.15))",
  background: "var(--v4-surface, transparent)",
  color: "var(--v4-ink-900, inherit)",
  cursor: "pointer",
};

const btnPrimary: React.CSSProperties = {
  ...btn,
  background: "var(--v4-accent, #2563eb)",
  borderColor: "var(--v4-accent, #2563eb)",
  color: "#fff",
};

interface Props {
  repo: string;
}

type Phase = "loading" | "ready" | "error";

export function RiskRegisterTable({ repo }: Props) {
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
    const next = risks.filter((x) => x.id !== r.id);
    await persist(next, `chore(hub): delete risk "${r.title}" from risks.yaml`);
  };

  const createFile = async () => {
    await persist([], "chore(hub): create docs/risks.yaml");
  };

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
          border: "1px solid var(--v4-danger, #dc2626)",
          borderRadius: 10,
          color: "var(--v4-danger, #dc2626)",
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
          border: "1px dashed var(--v4-border, rgba(0,0,0,0.1))",
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
          <span style={{ color: "var(--v4-danger, #dc2626)" }}>
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
        <button
          type="button"
          style={btnPrimary}
          disabled={busy || adding || editingId !== null}
          onClick={startAdd}
        >
          + Добавить риск
        </button>
      </div>

      {writeError && (
        <div
          role="alert"
          style={{
            fontSize: 12,
            padding: "8px 10px",
            borderRadius: 8,
            background: "var(--v4-danger-bg, rgba(220,38,38,0.1))",
            color: "var(--v4-danger, #dc2626)",
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
            background: "var(--v4-surface-3, rgba(0,0,0,0.04))",
            color: "var(--v4-ink-700, #374151)",
          }}
        >
          {infoNotice}
        </div>
      )}

      {risks.length === 0 ? (
        <div
          style={{
            padding: 16,
            border: "1px dashed var(--v4-border, rgba(0,0,0,0.1))",
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
                <th style={{ ...cellStyle, fontWeight: 600 }}>Severity</th>
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
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          style={btn}
                          disabled={busy || adding || editingId !== null}
                          onClick={() => startEdit(r)}
                        >
                          Изм.
                        </button>
                        <button
                          type="button"
                          style={btn}
                          disabled={busy || adding || editingId !== null}
                          onClick={() => void deleteRisk(r)}
                        >
                          Удал.
                        </button>
                      </div>
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

// ─── severity colour (shared scale) ─────────────────────────────────────

function severityBg(s: RiskSeverity): string {
  switch (s) {
    case "critical":
      return "var(--v4-danger, #dc2626)";
    case "high":
      return "var(--v4-warning, #ea580c)";
    case "med":
      return "var(--v4-caution, #ca8a04)";
    case "low":
      return "var(--v4-ink-500, #6b7280)";
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
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Добавить риск"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
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
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Конфликт версий risks.yaml"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        padding: 16,
      }}
    >
      <div
        style={{
          background: "var(--v4-surface, #fff)",
          color: "var(--v4-ink-900, inherit)",
          borderRadius: 12,
          padding: 20,
          width: "min(440px, 100%)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
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
