import { useEffect, useState } from "react";
import type { Commitment } from "../../../types/hub";
import {
  extractCommitments,
  isOverdue,
  persistedStatus,
  toCommitmentsYaml,
  type CommitmentsYaml,
} from "../../../utils/commitmentsExtractor";
import {
  ConflictError,
  readMarkdown,
  readYaml,
  writeYaml,
} from "../../../utils/github-contents";

/**
 * Commitments CRUD table (Epic-011 Task-02, FR-27, FR-31).
 *
 * Data model:
 *   - Read: BRIEF.md `## Commitments` section MERGED with
 *     `docs/commitments.yaml` (yaml wins on `text+client` dupes) via
 *     `extractCommitments`.
 *   - Write: the **whole list** is serialised back to
 *     `docs/commitments.yaml` through the Contents API. Only entries
 *     the user touches are kept editable, but the file is rewritten
 *     wholesale (the Contents API has no partial-patch).
 *
 * Batched CRUD: add / edit / delete mutate local `rows` only. Nothing
 * hits GitHub until the user presses **Save** — that produces a single
 * `chore(hub): update commitments` commit with the aggregated diff
 * (Epic-011: minimise commits).
 *
 * Conflict safety: the sha read at load time is sent on write. If the
 * file changed underneath us GitHub returns 409 → `ConflictError` →
 * we surface a "file changed, reload" banner instead of silently
 * clobbering the other writer's edits (no force-overwrite here).
 *
 * Not mounted yet: the four-section assembly is Epic-011 Task-08.
 * This component is self-contained and takes only `repo`.
 */

const COMMITMENTS_PATH = "docs/commitments.yaml";
const BRIEF_PATH = "docs/BRIEF.md";
const COMMIT_MESSAGE = "chore(hub): update commitments";

interface Props {
  /** Repo slug (`owner/repo` or bare name → dashboard owner). */
  repo: string;
  /**
   * Optional observer for the rendered row count. Fired with the
   * number of commitment rows currently in the table (after load and
   * on every local add/delete) so a parent (DecisionsRisksTab) can
   * show an accurate section counter from the SAME data this table
   * renders — no divergent second fetch.
   */
  onCount?: (count: number) => void;
}

/** A row plus a stable client-side key (Commitment has no id). */
interface Row extends Commitment {
  /** Local-only React key — never persisted. */
  _key: string;
}

type LoadState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready" };

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `c${keySeq}`;
}

function toRows(commitments: Commitment[]): Row[] {
  return commitments.map((c) => ({ ...c, _key: nextKey() }));
}

/** Strip the local key + derived `overdue` before persisting. */
function toCommitments(rows: Row[]): Commitment[] {
  return rows.map(({ text, due, client, status }) => ({
    text,
    due,
    client,
    // Persisted status is open/done only; `overdue` is recomputed on
    // next read. Single normalisation point shared with the extractor's
    // yaml serialiser so the invariant has exactly one owner.
    status: persistedStatus(status),
  }));
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso; // show the raw bad value, don't hide it
  return new Date(t).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusLabel(s: Commitment["status"]): string {
  switch (s) {
    case "done":
      return "Выполнено";
    case "overdue":
      return "Просрочено";
    default:
      return "Открыто";
  }
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 8px",
  fontSize: 13,
  border: "1px solid var(--v4-border, rgba(0,0,0,0.15))",
  borderRadius: 6,
  background: "var(--v4-surface, transparent)",
  color: "var(--v4-ink-900, inherit)",
};

const cellStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 13,
  borderBottom: "1px solid var(--v4-border, rgba(0,0,0,0.06))",
  verticalAlign: "top",
};

const btnStyle: React.CSSProperties = {
  fontSize: 12,
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid var(--v4-border, rgba(0,0,0,0.15))",
  background: "var(--v4-surface, transparent)",
  color: "var(--v4-ink-700, inherit)",
  cursor: "pointer",
};

const primaryBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: "var(--v4-accent-500, #2563EB)",
  borderColor: "var(--v4-accent-500, #2563EB)",
  color: "#fff",
};

interface DraftFormProps {
  initial: { text: string; due: string; client: string };
  submitLabel: string;
  onSubmit: (v: { text: string; due: string; client: string }) => void;
  onCancel: () => void;
}

/**
 * Shared add / edit form. Local controlled state; validates that
 * `text` is non-empty and `due` (if filled) is a parseable date
 * before letting the user commit the row to the local list.
 */
function DraftForm({ initial, submitLabel, onSubmit, onCancel }: DraftFormProps) {
  const [text, setText] = useState(initial.text);
  const [due, setDue] = useState(initial.due);
  const [client, setClient] = useState(initial.client);

  const trimmedText = text.trim();
  const dueInvalid = due.trim().length > 0 && Number.isNaN(Date.parse(due));
  const canSubmit = trimmedText.length > 0 && !dueInvalid;

  return (
    <>
      <td style={cellStyle}>
        <input
          style={inputStyle}
          value={text}
          placeholder="Что обещано"
          aria-label="Текст обещания"
          onChange={(e) => setText(e.target.value)}
        />
      </td>
      <td style={cellStyle}>
        <input
          style={{
            ...inputStyle,
            ...(dueInvalid
              ? { border: "1px solid var(--v4-danger-500, #EF4444)" }
              : null),
          }}
          value={due}
          placeholder="YYYY-MM-DD"
          aria-label="Срок (ISO-дата)"
          onChange={(e) => setDue(e.target.value)}
        />
      </td>
      <td style={cellStyle}>
        <input
          style={inputStyle}
          value={client}
          placeholder="Клиент"
          aria-label="Клиент"
          onChange={(e) => setClient(e.target.value)}
        />
      </td>
      <td style={cellStyle} colSpan={2}>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            style={{
              ...primaryBtnStyle,
              opacity: canSubmit ? 1 : 0.5,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                text: trimmedText,
                due: due.trim(),
                client: client.trim(),
              })
            }
          >
            {submitLabel}
          </button>
          <button type="button" style={btnStyle} onClick={onCancel}>
            Отмена
          </button>
        </div>
      </td>
    </>
  );
}

export function CommitmentsTable({ repo, onCount }: Props) {
  const [load, setLoad] = useState<LoadState>({ phase: "loading" });
  const [rows, setRows] = useState<Row[]>([]);
  /** sha of docs/commitments.yaml at load; undefined ⇒ file absent. */
  const [yamlSha, setYamlSha] = useState<string | undefined>(undefined);
  const [fileExists, setFileExists] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [addingNew, setAddingNew] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  // `reloadToken` is bumped to force a fresh fetch (initial mount,
  // manual reload after a conflict). The effect owns all I/O.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoad({ phase: "loading" });
    setConflict(false);
    setSaveError(null);

    (async () => {
      try {
        // BRIEF.md is optional context; a missing/failed read must not
        // block the yaml-backed CRUD table.
        let briefMd: string | null = null;
        try {
          const brief = await readMarkdown(repo, BRIEF_PATH);
          briefMd = brief?.content ?? null;
        } catch {
          briefMd = null;
        }

        const yamlRes = await readYaml<CommitmentsYaml>(
          repo,
          COMMITMENTS_PATH,
        );
        if (cancelled) return;

        const merged = extractCommitments(
          briefMd,
          yamlRes?.data ?? null,
        );
        setRows(toRows(merged));
        setYamlSha(yamlRes?.sha);
        setFileExists(yamlRes !== null);
        setDirty(false);
        setLoad({ phase: "ready" });
      } catch (e) {
        if (cancelled) return;
        const message =
          e instanceof Error ? e.message : "Не удалось загрузить обещания";
        setLoad({ phase: "error", message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [repo, reloadToken]);

  // Derive the overdue badge at render time. No useMemo: the input is
  // `Date.now()`, fresh every render, so a memo would never hit — and
  // the map is cheap. Mirrors the deliberate no-hook choice in
  // OverviewTab's filterUrgentCommitments.
  const now = Date.now();
  const decorated = rows.map((r) =>
    r.status !== "done" && isOverdue(r, now)
      ? { ...r, status: "overdue" as const }
      : r,
  );

  // Report the rendered row count to an interested parent. Effect (not
  // render) so it's a parent notification, not a synchronous local
  // setState — fires after commit, only when the count or callback
  // identity changes. `decorated` is a 1:1 map of `rows`, so
  // `rows.length` is exactly what the table renders. Callers pass a
  // stable `useCallback` per the standard effect-dependency contract.
  useEffect(() => {
    onCount?.(rows.length);
  }, [rows.length, onCount]);

  function mutate(next: Row[]) {
    setRows(next);
    setDirty(true);
  }

  function handleAdd(v: { text: string; due: string; client: string }) {
    mutate([
      ...rows,
      { ...v, status: "open", _key: nextKey() },
    ]);
    setAddingNew(false);
  }

  function handleEdit(
    key: string,
    v: { text: string; due: string; client: string },
  ) {
    mutate(
      rows.map((r) =>
        r._key === key
          ? {
              ...r,
              ...v,
              // Editing never resurrects a derived `overdue` — keep the
              // persisted intent (done stays done, else open).
              status: r.status === "done" ? "done" : "open",
            }
          : r,
      ),
    );
    setEditingKey(null);
  }

  function handleToggleDone(key: string) {
    mutate(
      rows.map((r) =>
        r._key === key
          ? { ...r, status: r.status === "done" ? "open" : "done" }
          : r,
      ),
    );
  }

  function handleDelete(key: string) {
    mutate(rows.filter((r) => r._key !== key));
    setConfirmDeleteKey(null);
  }

  /**
   * Reload after a conflict re-merges from the repo, which replaces the
   * local `rows` and silently drops any unsaved edits. Only force-reload
   * without asking when the table is clean; if there are unsaved changes
   * require an explicit confirm so the user can't lose work by reflex.
   */
  function requestConflictReload() {
    if (
      dirty &&
      !window.confirm(
        "Несохранённые правки будут потеряны при перезагрузке. Продолжить?",
      )
    ) {
      return;
    }
    setReloadToken((t) => t + 1);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setConflict(false);
    try {
      const payload = toCommitmentsYaml(toCommitments(rows));
      const { sha } = await writeYaml<CommitmentsYaml>(
        repo,
        COMMITMENTS_PATH,
        payload,
        COMMIT_MESSAGE,
        yamlSha,
      );
      setYamlSha(sha);
      setFileExists(true);
      setDirty(false);
    } catch (e) {
      if (e instanceof ConflictError) {
        // Do NOT force-overwrite: another writer changed the file.
        // The user must reload (re-merge) before saving again.
        setConflict(true);
      } else {
        setSaveError(
          e instanceof Error ? e.message : "Не удалось сохранить",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  if (load.phase === "loading") {
    return (
      <div
        style={{
          padding: 16,
          color: "var(--v4-ink-500)",
          fontSize: 13,
        }}
      >
        Загрузка обещаний…
      </div>
    );
  }

  if (load.phase === "error") {
    return (
      <div
        style={{
          padding: 16,
          border: "1px solid var(--v4-danger-500, #EF4444)",
          borderRadius: 10,
          color: "var(--v4-danger-700, #B91C1C)",
          fontSize: 13,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <span>Ошибка загрузки: {load.message}</span>
        <button
          type="button"
          style={btnStyle}
          onClick={() => setReloadToken((t) => t + 1)}
        >
          Повторить
        </button>
      </div>
    );
  }

  // Empty state: no yaml file AND no BRIEF-derived rows → offer to
  // bootstrap the file. (A BRIEF-only list still shows the table so
  // the user can promote bullets into the editable yaml via Save.)
  if (!fileExists && rows.length === 0 && !addingNew) {
    return (
      <div
        style={{
          padding: 20,
          border: "1px dashed var(--v4-border, rgba(0,0,0,0.15))",
          borderRadius: 10,
          color: "var(--v4-ink-500)",
          fontSize: 13,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <span>
          Обещаний пока нет. Файл <code>{COMMITMENTS_PATH}</code> ещё не
          создан в репозитории.
        </span>
        <button
          type="button"
          style={primaryBtnStyle}
          onClick={() => setAddingNew(true)}
        >
          Создать {COMMITMENTS_PATH}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {conflict && (
        <div
          role="alert"
          style={{
            padding: 12,
            border: "1px solid var(--v4-danger-500, #EF4444)",
            borderRadius: 8,
            background: "var(--v4-danger-50, #FEF2F2)",
            color: "var(--v4-danger-700, #B91C1C)",
            fontSize: 13,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span>
            Файл <code>{COMMITMENTS_PATH}</code> изменён в репозитории.
            Перезагрузите, чтобы не потерять чужие правки.
            {dirty && (
              <>
                {" "}
                <strong>
                  Внимание: ваши несохранённые правки будут потеряны при
                  перезагрузке.
                </strong>
              </>
            )}
          </span>
          <button
            type="button"
            style={btnStyle}
            onClick={requestConflictReload}
          >
            Перезагрузить
          </button>
        </div>
      )}

      {saveError && (
        <div
          role="alert"
          style={{
            padding: 12,
            border: "1px solid var(--v4-danger-500, #EF4444)",
            borderRadius: 8,
            color: "var(--v4-danger-700, #B91C1C)",
            fontSize: 13,
          }}
        >
          Не удалось сохранить: {saveError}
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <thead>
            <tr>
              {["Обещание", "Срок", "Клиент", "Статус", ""].map((h, i) => (
                <th
                  key={h || `col${i}`}
                  style={{
                    textAlign: "left",
                    padding: "8px 10px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--v4-ink-500)",
                    borderBottom:
                      "1px solid var(--v4-border, rgba(0,0,0,0.12))",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {decorated.map((r) =>
              editingKey === r._key ? (
                <tr key={r._key}>
                  <DraftForm
                    initial={{ text: r.text, due: r.due, client: r.client }}
                    submitLabel="Сохранить строку"
                    onSubmit={(v) => handleEdit(r._key, v)}
                    onCancel={() => setEditingKey(null)}
                  />
                </tr>
              ) : (
                <tr key={r._key}>
                  <td style={cellStyle}>{r.text}</td>
                  <td
                    style={{
                      ...cellStyle,
                      color:
                        r.status === "overdue"
                          ? "var(--v4-danger-700, #B91C1C)"
                          : undefined,
                      fontWeight: r.status === "overdue" ? 600 : undefined,
                    }}
                  >
                    {formatDate(r.due)}
                  </td>
                  <td style={cellStyle}>{r.client || "—"}</td>
                  <td style={cellStyle}>
                    <span
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 999,
                        whiteSpace: "nowrap",
                        background:
                          r.status === "overdue"
                            ? "var(--v4-danger-100, #FEE4E2)"
                            : "var(--v4-border, rgba(0,0,0,0.08))",
                        color:
                          r.status === "overdue"
                            ? "var(--v4-danger-700, #B91C1C)"
                            : "var(--v4-ink-700)",
                      }}
                    >
                      {statusLabel(r.status)}
                    </span>
                  </td>
                  <td style={cellStyle}>
                    {confirmDeleteKey === r._key ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          style={{
                            ...btnStyle,
                            borderColor: "var(--v4-danger-500, #EF4444)",
                            color: "var(--v4-danger-700, #B91C1C)",
                          }}
                          onClick={() => handleDelete(r._key)}
                        >
                          Удалить
                        </button>
                        <button
                          type="button"
                          style={btnStyle}
                          onClick={() => setConfirmDeleteKey(null)}
                        >
                          Отмена
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          style={btnStyle}
                          onClick={() => handleToggleDone(r._key)}
                        >
                          {r.status === "done" ? "Открыть" : "Готово"}
                        </button>
                        <button
                          type="button"
                          style={btnStyle}
                          onClick={() => {
                            setEditingKey(r._key);
                            setConfirmDeleteKey(null);
                          }}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          style={btnStyle}
                          onClick={() => {
                            setConfirmDeleteKey(r._key);
                            setEditingKey(null);
                          }}
                        >
                          Удалить
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ),
            )}

            {addingNew && (
              <tr>
                <DraftForm
                  initial={{ text: "", due: "", client: "" }}
                  submitLabel="Добавить"
                  onSubmit={handleAdd}
                  onCancel={() => setAddingNew(false)}
                />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {!addingNew && (
          <button
            type="button"
            style={btnStyle}
            onClick={() => setAddingNew(true)}
          >
            + Добавить обещание
          </button>
        )}
        <button
          type="button"
          style={{
            ...primaryBtnStyle,
            opacity: dirty && !saving ? 1 : 0.5,
            cursor: dirty && !saving ? "pointer" : "not-allowed",
          }}
          disabled={!dirty || saving}
          onClick={handleSave}
        >
          {saving ? "Сохранение…" : "Сохранить изменения"}
        </button>
        {dirty && !saving && (
          <span style={{ fontSize: 12, color: "var(--v4-ink-500)" }}>
            Несохранённые изменения
          </span>
        )}
      </div>
    </div>
  );
}

export default CommitmentsTable;
