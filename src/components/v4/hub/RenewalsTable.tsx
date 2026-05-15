import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ConflictError,
  readMarkdown,
  readYaml,
  writeYaml,
} from "../../../utils/github-contents";
import {
  parseRenewalsYaml,
  scanRenewals,
  sortByExpiry,
  toRenewalsYaml,
  type RenewalsYaml,
} from "../../../utils/renewalsScanner";
import type { Renewal, RenewalType } from "../../../types/hub";

/**
 * Renewals CRUD table over `docs/renewals.yaml` + a virtual auto-scan
 * of deprecated `package.json` deps (Epic-011 Task-04, FR-32).
 *
 * Manual rows (`source === "manual"`) are full CRUD and persisted back
 * through the GitHub Contents API. Auto-scan rows are read-only — they
 * are derived from `package.json` every load, never written to the
 * yaml, and carry a tooltip pointing the user at the real fix
 * (bumping the dependency).
 *
 * Concurrent-edit safety mirrors RiskRegisterTable: the load-time sha
 * is sent on write; a 409 surfaces an explicit Reload / Overwrite
 * dialog rather than silently clobbering the other writer (last-
 * writer-wins is unacceptable for a tracked register).
 *
 * Not yet mounted — the DecisionsRisksTab four-section assembly is
 * Epic-011 Task-08. Until then this is exercised only by
 * type-check / lint / build.
 *
 * Security: every field renders as a React text node (auto
 * HTML-escaped) and is serialised through `js-yaml.dump` inside
 * `writeYaml`, so a `name` like `<img onerror>` or a yaml control
 * sequence is inert both on screen and on disk.
 */

const RENEWALS_PATH = "docs/renewals.yaml";
const PACKAGE_JSON_PATH = "package.json";

const TYPES: readonly RenewalType[] = [
  "ssl",
  "domain",
  "contract",
  "license",
  "dep",
];

const TYPE_LABEL: Record<RenewalType, string> = {
  ssl: "SSL",
  domain: "Домен",
  contract: "Контракт",
  license: "Лицензия",
  dep: "Зависимость",
};

/** "Soon" threshold: expiries within 30 days are highlighted amber. */
const SOON_MS = 30 * 24 * 60 * 60 * 1000;

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso; // surface the raw bad value, don't hide it
  return new Date(t).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type Urgency = "expired" | "soon" | "ok" | "none";

/** Classify an expiry relative to `now` for row colouring. */
function urgencyOf(iso: string | null, now: number): Urgency {
  if (!iso) return "none";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "none";
  if (t < now) return "expired";
  if (t - now <= SOON_MS) return "soon";
  return "ok";
}

/** A new blank manual renewal. */
function blankRenewal(): Renewal {
  return {
    type: "ssl",
    name: "",
    expires_at: null,
    notes: "",
    source: "manual",
  };
}

// ─── styling tokens (shared with RiskRegisterTable / v4 hub) ────────────

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
  /** Repo slug (`owner/repo` or bare name → dashboard owner). */
  repo: string;
}

type Phase = "loading" | "ready" | "error";
type TypeFilter = RenewalType | "all";

export function RenewalsTable({ repo }: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  /** `false` ⇒ docs/renewals.yaml does not exist yet (empty-state). */
  const [fileExists, setFileExists] = useState(false);
  /** Manual entries only — the auto-scan rows are derived separately. */
  const [manual, setManual] = useState<Renewal[]>([]);
  /** Virtual auto-scan rows from package.json — never persisted. */
  const [autoScan, setAutoScan] = useState<Renewal[]>([]);
  /** Last sha seen for renewals.yaml — the ETag we send back. */
  const sha = useRef<string | undefined>(undefined);

  const [filter, setFilter] = useState<TypeFilter>("all");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<Renewal | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);

  /** Pending conflict: holds the manual list we tried to persist. */
  const [conflict, setConflict] = useState<{ attempted: Renewal[] } | null>(
    null,
  );

  const load = useCallback(async () => {
    setPhase("loading");
    setLoadError(null);
    try {
      // package.json is optional context for the auto-scan; a missing
      // or unreadable manifest must not block the yaml-backed CRUD.
      let pkgRaw: string | null = null;
      try {
        const pkg = await readMarkdown(repo, PACKAGE_JSON_PATH);
        pkgRaw = pkg?.content ?? null;
      } catch {
        pkgRaw = null;
      }

      const res = await readYaml<RenewalsYaml>(repo, RENEWALS_PATH);
      if (res === null) {
        setFileExists(false);
        setManual([]);
        sha.current = undefined;
      } else {
        setFileExists(true);
        setManual(parseRenewalsYaml(res.data));
        sha.current = res.sha;
      }
      // scanRenewals merges, but here we only need the auto-scan slice
      // (manual is tracked separately so CRUD never touches virtuals).
      const merged = scanRenewals(repo, res?.data ?? null, pkgRaw);
      setAutoScan(merged.filter((r) => r.source === "auto-scan"));
      setPhase("ready");
    } catch (e) {
      setLoadError(errorMessage(e));
      setPhase("error");
    }
  }, [repo]);

  useEffect(() => {
    void load();
  }, [load]);

  // Merge for display: manual + non-shadowed auto-scan, sorted by
  // expiry. `now` is read fresh every render (urgency colouring) — no
  // memo: the input changes every tick so a memo would never hit.
  const now = Date.now();
  const visible = useMemo(() => {
    const manualKeys = new Set(
      manual.map((r) => `${r.type}::${r.name.trim().toLowerCase()}`),
    );
    const merged = [
      ...manual,
      ...autoScan.filter(
        (r) => !manualKeys.has(`${r.type}::${r.name.trim().toLowerCase()}`),
      ),
    ];
    const sorted = sortByExpiry(merged);
    return filter === "all"
      ? sorted
      : sorted.filter((r) => r.type === filter);
  }, [manual, autoScan, filter]);

  /**
   * Persist `next` manual list to renewals.yaml. Auto-scan rows are
   * never included (toRenewalsYaml filters to `source === "manual"`),
   * so a virtual dep row can't leak into the file. On a sha conflict
   * we do NOT silently retry — surface the dialog, keep `next`.
   */
  const persist = useCallback(
    async (next: Renewal[], commitMsg: string): Promise<boolean> => {
      setBusy(true);
      setWriteError(null);
      setInfoNotice(null);
      try {
        const { sha: newSha } = await writeYaml<RenewalsYaml>(
          repo,
          RENEWALS_PATH,
          toRenewalsYaml(next),
          commitMsg,
          sha.current,
        );
        sha.current = newSha;
        setFileExists(true);
        setManual(next);
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
      const fresh = await readYaml<RenewalsYaml>(repo, RENEWALS_PATH);
      sha.current = fresh?.sha;
      const { sha: newSha } = await writeYaml<RenewalsYaml>(
        repo,
        RENEWALS_PATH,
        toRenewalsYaml(conflict.attempted),
        "chore(hub): overwrite renewals.yaml (resolved conflict)",
        sha.current,
      );
      sha.current = newSha;
      setManual(conflict.attempted);
      setFileExists(true);
      setConflict(null);
    } catch (e) {
      setWriteError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [conflict, repo]);

  /**
   * Reload: take fresh remote manual list as the base, then re-apply
   * our local edits on top — keyed by `type + name` (Renewal has no
   * id) so a row both writers touched gets OUR version, brand-new
   * remote rows survive, and our additions append. Documented "merge
   * local over fresh sha"; a row deleted locally but still present in
   * fresh remote is re-added (resurrection over silent data loss) and
   * flagged to the user.
   */
  const resolveReload = useCallback(async () => {
    if (!conflict) return;
    setBusy(true);
    setWriteError(null);
    setInfoNotice(null);
    try {
      const fresh = await readYaml<RenewalsYaml>(repo, RENEWALS_PATH);
      sha.current = fresh?.sha;
      const remote = fresh ? parseRenewalsYaml(fresh.data) : [];
      const keyOf = (r: Renewal) =>
        `${r.type}::${r.name.trim().toLowerCase()}`;
      const localByKey = new Map(conflict.attempted.map((r) => [keyOf(r), r]));
      const merged: Renewal[] = [];
      const seen = new Set<string>();
      for (const r of remote) {
        const k = keyOf(r);
        merged.push(localByKey.get(k) ?? r);
        seen.add(k);
      }
      for (const r of conflict.attempted) {
        if (!seen.has(keyOf(r))) merged.push(r);
      }
      setManual(merged);
      setFileExists(Boolean(fresh));
      setConflict(null);
      const reloadHadDeletions =
        conflict.attempted.length < remote.length &&
        remote.some((r) => !localByKey.has(keyOf(r)));
      setInfoNotice(
        reloadHadDeletions
          ? "Загружена свежая версия, ваши правки применены поверх. Внимание: удалённые вами записи могли вернуться (есть в свежей версии). Проверьте и сохраните снова."
          : "Загружена свежая версия и применены ваши правки поверх. Проверьте и сохраните снова.",
      );
    } catch (e) {
      setWriteError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [conflict, repo]);

  // ── mutations (manual only) ───────────────────────────────────────

  const startAdd = () => {
    setDraft(blankRenewal());
    setAdding(true);
  };

  /** Edit by manual-array index — Renewal has no stable id field. */
  const startEdit = (index: number) => {
    const r = manual[index];
    if (!r) return;
    setEditingIndex(index);
    setDraft({ ...r });
  };

  const cancelDraft = () => {
    setEditingIndex(null);
    setDraft(null);
    setAdding(false);
  };

  const saveDraft = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (name === "") {
      setWriteError("Название обязательно");
      return;
    }
    const expires = draft.expires_at?.trim() ?? "";
    if (expires !== "" && Number.isNaN(Date.parse(expires))) {
      setWriteError("Некорректная дата (ожидается ISO, напр. 2026-12-31)");
      return;
    }
    const clean: Renewal = {
      type: draft.type,
      name,
      expires_at: expires === "" ? null : expires,
      notes: draft.notes.trim(),
      source: "manual",
    };
    const next =
      adding || editingIndex === null
        ? [...manual, clean]
        : manual.map((r, i) => (i === editingIndex ? clean : r));
    const ok = await persist(
      next,
      adding
        ? `chore(hub): add renewal "${name}" to renewals.yaml`
        : `chore(hub): update renewal "${name}" in renewals.yaml`,
    );
    if (ok) cancelDraft();
  };

  const deleteRenewal = async (index: number) => {
    const r = manual[index];
    if (!r) return;
    const next = manual.filter((_, i) => i !== index);
    await persist(
      next,
      `chore(hub): delete renewal "${r.name}" from renewals.yaml`,
    );
  };

  const createFile = async () => {
    await persist([], "chore(hub): create docs/renewals.yaml");
  };

  // ── render ────────────────────────────────────────────────────────

  if (phase === "loading") {
    return (
      <div style={{ ...pillStyle, display: "inline-block", padding: 12 }}>
        Загрузка продлений…
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
        <span>Не удалось загрузить renewals.yaml: {loadError}</span>
        <button type="button" style={btn} onClick={() => void load()}>
          Повторить
        </button>
      </div>
    );
  }

  // Empty-state: no yaml file AND no auto-scan rows → offer bootstrap.
  // (Auto-scan-only still shows the table so deprecated deps surface.)
  if (!fileExists && autoScan.length === 0) {
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
          В репозитории нет <code>docs/renewals.yaml</code>. Создайте файл,
          чтобы отслеживать сроки продлений (SSL, домены, контракты, лицензии).
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
          {busy ? "Создание…" : "Создать docs/renewals.yaml"}
        </button>
      </div>
    );
  }

  const editingDisabled = busy || adding || editingIndex !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label
            htmlFor="renewals-type-filter"
            style={{ fontSize: 12, color: "var(--v4-ink-500)" }}
          >
            Тип:
          </label>
          <select
            id="renewals-type-filter"
            style={{ ...inputStyle, width: "auto" }}
            value={filter}
            onChange={(e) => setFilter(e.target.value as TypeFilter)}
          >
            <option value="all">Все</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 12, color: "var(--v4-ink-500)" }}>
            {visible.length} · сортировка по сроку
          </span>
        </div>
        <button
          type="button"
          style={btnPrimary}
          disabled={editingDisabled}
          onClick={startAdd}
        >
          + Добавить продление
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

      {visible.length === 0 ? (
        <div
          style={{
            padding: 16,
            border: "1px dashed var(--v4-border, rgba(0,0,0,0.1))",
            borderRadius: 10,
            color: "var(--v4-ink-500)",
            fontSize: 13,
          }}
        >
          {filter === "all"
            ? "Продлений пока нет. Нажмите «Добавить продление»."
            : "Нет продлений выбранного типа."}
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
                <th style={{ ...cellStyle, fontWeight: 600 }}>Тип</th>
                <th style={{ ...cellStyle, fontWeight: 600 }}>Название</th>
                <th style={{ ...cellStyle, fontWeight: 600 }}>Истекает</th>
                <th style={{ ...cellStyle, fontWeight: 600 }}>Заметки</th>
                <th style={{ ...cellStyle, fontWeight: 600 }}>Источник</th>
                <th style={{ ...cellStyle, fontWeight: 600 }} />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const manualIndex =
                  r.source === "manual" ? manual.indexOf(r) : -1;
                const isEditing =
                  manualIndex !== -1 &&
                  editingIndex === manualIndex &&
                  draft;
                if (isEditing && draft) {
                  return (
                    <RenewalEditRow
                      key={`edit-${manualIndex}`}
                      draft={draft}
                      busy={busy}
                      onChange={setDraft}
                      onSave={() => void saveDraft()}
                      onCancel={cancelDraft}
                    />
                  );
                }
                const urg = urgencyOf(r.expires_at, now);
                const dateColor =
                  urg === "expired"
                    ? "var(--v4-danger, #dc2626)"
                    : urg === "soon"
                      ? "var(--v4-caution, #ca8a04)"
                      : undefined;
                const isAuto = r.source === "auto-scan";
                return (
                  <tr
                    key={`${r.source}-${r.type}-${r.name}`}
                    title={
                      isAuto
                        ? "Auto-detected, fix in package.json"
                        : undefined
                    }
                  >
                    <td style={cellStyle}>
                      <span style={pillStyle}>{TYPE_LABEL[r.type]}</span>
                    </td>
                    <td style={{ ...cellStyle, fontWeight: 600 }}>
                      {r.name || "—"}
                    </td>
                    <td
                      style={{
                        ...cellStyle,
                        fontVariantNumeric: "tabular-nums",
                        color: dateColor,
                        fontWeight:
                          urg === "expired" || urg === "soon"
                            ? 600
                            : undefined,
                      }}
                    >
                      {formatDate(r.expires_at)}
                    </td>
                    <td style={cellStyle}>{r.notes || "—"}</td>
                    <td style={cellStyle}>
                      <span style={pillStyle}>
                        {isAuto ? "Auto-scan" : "Manual"}
                      </span>
                    </td>
                    <td style={cellStyle}>
                      {isAuto ? (
                        <span
                          style={{ fontSize: 12, color: "var(--v4-ink-500)" }}
                          title="Auto-detected, fix in package.json"
                        >
                          read-only
                        </span>
                      ) : (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            style={btn}
                            disabled={editingDisabled}
                            onClick={() => startEdit(manualIndex)}
                          >
                            Изм.
                          </button>
                          <button
                            type="button"
                            style={btn}
                            disabled={editingDisabled}
                            onClick={() => void deleteRenewal(manualIndex)}
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
        <RenewalFormModal
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

// ─── inline edit row ────────────────────────────────────────────────────

interface EditProps {
  draft: Renewal;
  busy: boolean;
  onChange: (r: Renewal) => void;
  onSave: () => void;
  onCancel: () => void;
}

function RenewalEditRow({
  draft,
  busy,
  onChange,
  onSave,
  onCancel,
}: EditProps) {
  return (
    <tr>
      <td style={cellStyle}>
        <select
          aria-label="Тип"
          style={inputStyle}
          value={draft.type}
          onChange={(e) =>
            onChange({ ...draft, type: e.target.value as RenewalType })
          }
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </td>
      <td style={cellStyle}>
        <input
          aria-label="Название"
          style={inputStyle}
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
      </td>
      <td style={cellStyle}>
        <input
          aria-label="Дата истечения"
          type="date"
          style={inputStyle}
          value={draft.expires_at ?? ""}
          onChange={(e) =>
            onChange({ ...draft, expires_at: e.target.value || null })
          }
        />
      </td>
      <td style={cellStyle}>
        <input
          aria-label="Заметки"
          style={inputStyle}
          value={draft.notes}
          onChange={(e) => onChange({ ...draft, notes: e.target.value })}
        />
      </td>
      <td style={cellStyle}>
        <span style={pillStyle}>Manual</span>
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
          <button type="button" style={btn} disabled={busy} onClick={onCancel}>
            Отмена
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── add modal ──────────────────────────────────────────────────────────

function RenewalFormModal({
  draft,
  busy,
  onChange,
  onSave,
  onCancel,
}: EditProps) {
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
      aria-label="Добавить продление"
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
        <h3 style={{ margin: 0, fontSize: 16 }}>Новое продление</h3>
        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ ...field, flex: 1 }}>
            Тип
            <select
              style={inputStyle}
              value={draft.type}
              onChange={(e) =>
                onChange({ ...draft, type: e.target.value as RenewalType })
              }
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label style={{ ...field, flex: 1 }}>
            Истекает
            <input
              type="date"
              style={inputStyle}
              value={draft.expires_at ?? ""}
              onChange={(e) =>
                onChange({ ...draft, expires_at: e.target.value || null })
              }
            />
          </label>
        </div>
        <label style={field}>
          Название
          <input
            autoFocus
            style={inputStyle}
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
          />
        </label>
        <label style={field}>
          Заметки
          <input
            style={inputStyle}
            value={draft.notes}
            onChange={(e) => onChange({ ...draft, notes: e.target.value })}
          />
        </label>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 4,
          }}
        >
          <button type="button" style={btn} disabled={busy} onClick={onCancel}>
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
      aria-label="Конфликт версий renewals.yaml"
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
          Кто-то изменил <code>renewals.yaml</code> после того, как вы открыли
          список. Перезагрузите свежую версию (ваши правки наложатся поверх)
          или перезапишите её своими данными.
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <button type="button" style={btn} disabled={busy} onClick={onDismiss}>
            Отмена
          </button>
          <button type="button" style={btn} disabled={busy} onClick={onReload}>
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

export default RenewalsTable;
