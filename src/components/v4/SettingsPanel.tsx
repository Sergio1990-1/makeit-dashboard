/**
 * SettingsPanel — Epic-004 Task-04 (issue #134).
 *
 * UI for managing the secrets stored in the Pipeline settings store
 * (`getSetting/setSetting/deleteSetting`). Renders as a modal portal.
 *
 * Lifecycle:
 *  - On mount: fetch declared keys via `listSettingsKeys()`, then render a
 *    masked row per key. Values come from the in-memory cache populated by
 *    `useSettings()` at app boot — we never re-fetch full values here, so
 *    closing the panel is cheap.
 *  - "Изменить" expands an inline password input → `setSetting()` updates
 *    both the server and the cache atomically (handled by settings.ts).
 *  - "Очистить" prompts for confirmation → `deleteSetting()`.
 *  - "Сменить bootstrap-токен" wipes the local bootstrap token and reloads
 *    so SettingsBootstrap re-renders.
 *  - "Опасная зона" iterates `deleteSetting()` over every key.
 *
 * Masking: we only ever display the last 4 characters (or `••••` if shorter)
 * — the full value never leaves the SettingsPanel without an explicit "Show"
 * click. Following the Self-review checklist: there is currently no "Show"
 * affordance because the panel only needs to confirm-which-secret-is-set,
 * not display it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  clearBootstrapToken,
  deleteSetting,
  getSetting,
  listSettingsKeys,
  setSetting,
} from "../../utils/settings";
import { useToast } from "./toastContext";
import { SettingsBudgetPanel } from "./SettingsBudgetPanel";

/** Friendly RU labels for the well-known managed keys. */
const KEY_LABELS: Record<string, string> = {
  github_token: "GitHub PAT",
  anthropic_api_key: "Claude API key",
  betterstack_worker_url: "BetterStack Worker URL",
};

const KEY_HINTS: Record<string, string> = {
  github_token: "Personal Access Token с правами repo, read:project",
  anthropic_api_key: "API key с https://console.anthropic.com/settings/keys",
  betterstack_worker_url:
    "Cloudflare Worker URL (proxies BetterStack API to bypass CORS)",
};

interface Props {
  onClose: () => void;
  /**
   * Notifies the host that the bootstrap token was cleared and the app should
   * be reloaded into the SettingsBootstrap screen. App.tsx wires this to a
   * `window.location.reload()` so the entire useSettings tree resets.
   */
  onBootstrapCleared?: () => void;
}

interface RowState {
  /** Last cached full value for masking. Cleared on delete. */
  value: string | null;
  /** Inline-edit mode: when set, holds the in-progress new value. */
  editing: string | null;
  /** "saving" — PUT in flight; "deleting" — DELETE in flight. */
  inflight: "saving" | "deleting" | null;
  /** Per-row error message (network / server). Cleared on next attempt. */
  error: string | null;
}

const initialRow = (value: string | null): RowState => ({
  value,
  editing: null,
  inflight: null,
  error: null,
});

/** Render `••••••XXXX` (or `(не задан)` / `(пусто)`). */
function maskValue(v: string | null): string {
  if (v === null) return "(не задан)";
  if (v.length === 0) return "(пусто)";
  if (v.length <= 4) return "••••";
  return `••••••${v.slice(-4)}`;
}

export function SettingsPanel({ onClose, onBootstrapCleared }: Props) {
  const toast = useToast();
  // Declared keys come from the server. Falls back to the well-known list if
  // the keys endpoint fails (still useful — user can rotate known secrets).
  const [keys, setKeys] = useState<string[] | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [listError, setListError] = useState<string | null>(null);
  const [confirmAllDelete, setConfirmAllDelete] = useState(false);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Bootstrap fetch of declared keys + initial cache snapshot.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const list = await listSettingsKeys();
        if (cancelled) return;
        // Merge with the well-known set so the panel stays useful even when
        // the server hasn't yet had any keys written (fresh install).
        const merged = Array.from(
          new Set([...Object.keys(KEY_LABELS), ...list]),
        );
        setKeys(merged);
        const next: Record<string, RowState> = {};
        for (const k of merged) {
          next[k] = initialRow(getSetting(k));
        }
        setRows(next);
      } catch (e) {
        if (cancelled) return;
        // Failures here are non-fatal — fall back to the well-known list so
        // the user can still rotate known secrets without a working
        // /settings/keys endpoint.
        const known = Object.keys(KEY_LABELS);
        setKeys(known);
        const next: Record<string, RowState> = {};
        for (const k of known) next[k] = initialRow(getSetting(k));
        setRows(next);
        setListError(
          `Не удалось загрузить список ключей: ${(e as Error)?.message ?? "неизвестная ошибка"}`,
        );
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Esc closes (only when nothing destructive is in flight).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !bulkDeleting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, bulkDeleting]);

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const updateRow = useCallback(
    (key: string, patch: Partial<RowState>) => {
      setRows((prev) => ({
        ...prev,
        [key]: { ...prev[key], ...patch },
      }));
    },
    [],
  );

  const handleStartEdit = useCallback(
    (key: string) => {
      updateRow(key, { editing: "", error: null });
    },
    [updateRow],
  );

  const handleCancelEdit = useCallback(
    (key: string) => {
      updateRow(key, { editing: null, error: null });
    },
    [updateRow],
  );

  const handleSave = useCallback(
    async (key: string) => {
      const next = rows[key]?.editing?.trim() ?? "";
      if (!next) {
        updateRow(key, { error: "Значение не может быть пустым" });
        return;
      }
      updateRow(key, { inflight: "saving", error: null });
      try {
        await setSetting(key, next);
        // Refresh from cache so any normalisation server-side is reflected.
        updateRow(key, {
          value: getSetting(key),
          editing: null,
          inflight: null,
          error: null,
        });
        toast.push({ kind: "success", title: `${KEY_LABELS[key] ?? key} обновлён` });
      } catch (e) {
        updateRow(key, {
          inflight: null,
          error: `Не удалось сохранить: ${(e as Error)?.message ?? "ошибка"}`,
        });
      }
    },
    [rows, toast, updateRow],
  );

  const handleDelete = useCallback(
    async (key: string) => {
      updateRow(key, { inflight: "deleting", error: null });
      try {
        await deleteSetting(key);
        updateRow(key, {
          value: null,
          editing: null,
          inflight: null,
          error: null,
        });
        toast.push({ kind: "info", title: `${KEY_LABELS[key] ?? key} очищен` });
      } catch (e) {
        updateRow(key, {
          inflight: null,
          error: `Не удалось очистить: ${(e as Error)?.message ?? "ошибка"}`,
        });
      } finally {
        setConfirmDeleteKey((cur) => (cur === key ? null : cur));
      }
    },
    [toast, updateRow],
  );

  const handleClearAll = useCallback(async () => {
    if (!keys || bulkDeleting) return;
    setBulkDeleting(true);
    let errors = 0;
    let cleared = 0;
    for (const k of keys) {
      try {
        await deleteSetting(k);
        cleared++;
        updateRow(k, { value: null, editing: null, inflight: null, error: null });
      } catch {
        errors++;
        updateRow(k, {
          inflight: null,
          error: "не удалось очистить (см. сетевые ошибки)",
        });
      }
    }
    setBulkDeleting(false);
    setConfirmAllDelete(false);
    toast.push({
      kind: errors === 0 ? "info" : "error",
      title: `Очищено ${cleared} из ${keys.length}`,
      description: errors > 0 ? `Ошибок: ${errors}` : undefined,
    });
  }, [keys, bulkDeleting, toast, updateRow]);

  const handleClearBootstrap = useCallback(() => {
    clearBootstrapToken();
    onBootstrapCleared?.();
  }, [onBootstrapCleared]);

  const sortedKeys = useMemo(() => {
    if (!keys) return [];
    // Well-known keys first (in declared order), then any extras alphabetically.
    const known = Object.keys(KEY_LABELS);
    const rest = keys.filter((k) => !known.includes(k)).sort();
    return [...known.filter((k) => keys.includes(k)), ...rest];
  }, [keys]);

  return createPortal(
    <div
      className="v4-mspopup-bd"
      onClick={(e) => {
        if (e.target === e.currentTarget && !bulkDeleting) onClose();
      }}
      style={{ zIndex: 1100 }}
    >
      <div
        className="v4-mspopup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-panel-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 640 }}
      >
        <header className="v4-mspopup-h">
          <div className="v4-mspopup-h-text">
            <div className="v4-mspopup-repo">Pipeline · settings store</div>
            <h2 id="settings-panel-title" className="v4-mspopup-title">
              Управление секретами
            </h2>
          </div>
          <button
            type="button"
            className="v4-mspopup-close"
            aria-label="Закрыть"
            onClick={onClose}
            disabled={bulkDeleting}
          >
            ×
          </button>
        </header>

        <div style={{ padding: "16px 20px 8px", display: "flex", flexDirection: "column", gap: 14 }}>
          {keys === null && <div className="v4-loading">Загрузка ключей…</div>}

          {listError && (
            <div
              role="alert"
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: "var(--v4-warn-50, rgba(234,179,8,0.08))",
                border: "1px solid var(--v4-warn-100, rgba(234,179,8,0.25))",
                color: "var(--v4-ink-700, #92400e)",
                fontSize: 12,
                lineHeight: 1.4,
              }}
            >
              {listError}
            </div>
          )}

          {keys !== null &&
            sortedKeys.map((key) => {
              const row = rows[key] ?? initialRow(null);
              const label = KEY_LABELS[key] ?? key;
              const hint = KEY_HINTS[key];
              const editing = row.editing !== null;
              const busy = row.inflight !== null;
              const confirmingDelete = confirmDeleteKey === key;
              return (
                <div
                  key={key}
                  style={{
                    border: "1px solid var(--v4-border, rgba(0,0,0,0.08))",
                    borderRadius: 10,
                    padding: 12,
                    background: "var(--v4-card, transparent)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
                      <div
                        className="v4-mono"
                        style={{ color: "var(--v4-ink-500)", fontSize: 11 }}
                      >
                        {key}
                      </div>
                      {hint && (
                        <div
                          style={{
                            color: "var(--v4-ink-500)",
                            fontSize: 11,
                            marginTop: 2,
                          }}
                        >
                          {hint}
                        </div>
                      )}
                    </div>
                    <div
                      className="v4-mono"
                      style={{
                        whiteSpace: "nowrap",
                        fontSize: 12,
                        color: row.value ? "var(--v4-ink-900)" : "var(--v4-ink-500)",
                      }}
                      aria-label={`Текущее значение ${label}: ${maskValue(row.value)}`}
                    >
                      {maskValue(row.value)}
                    </div>
                  </div>

                  {editing ? (
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      <input
                        type="password"
                        autoFocus
                        className="input"
                        value={row.editing ?? ""}
                        onChange={(e) =>
                          updateRow(key, { editing: e.target.value, error: null })
                        }
                        placeholder={`Новый ${label}`}
                        disabled={busy || bulkDeleting}
                        autoComplete="off"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleSave(key);
                          if (e.key === "Escape") {
                            e.stopPropagation();
                            handleCancelEdit(key);
                          }
                        }}
                      />
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="v4-btn"
                          onClick={() => handleCancelEdit(key)}
                          disabled={busy || bulkDeleting}
                        >
                          Отмена
                        </button>
                        <button
                          type="button"
                          className="v4-btn v4-btn--pri"
                          onClick={() => void handleSave(key)}
                          disabled={busy || bulkDeleting || !row.editing?.trim()}
                        >
                          {row.inflight === "saving" ? "Сохранение…" : "Сохранить"}
                        </button>
                      </div>
                    </div>
                  ) : confirmingDelete ? (
                    <div
                      style={{
                        marginTop: 10,
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        justifyContent: "flex-end",
                      }}
                    >
                      <span style={{ fontSize: 12, color: "var(--v4-ink-700)" }}>
                        Подтвердите очистку:
                      </span>
                      <button
                        type="button"
                        className="v4-btn"
                        onClick={() => setConfirmDeleteKey(null)}
                        disabled={busy || bulkDeleting}
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        className="v4-btn"
                        style={{ color: "var(--v4-danger-700, #b91c1c)" }}
                        onClick={() => void handleDelete(key)}
                        disabled={busy || bulkDeleting}
                      >
                        {row.inflight === "deleting" ? "Очистка…" : "Очистить"}
                      </button>
                    </div>
                  ) : (
                    <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="v4-btn"
                        onClick={() => setConfirmDeleteKey(key)}
                        disabled={busy || bulkDeleting || row.value === null}
                        title={row.value === null ? "Значение не задано" : "Удалить значение"}
                      >
                        Очистить
                      </button>
                      <button
                        type="button"
                        className="v4-btn v4-btn--pri"
                        onClick={() => handleStartEdit(key)}
                        disabled={busy || bulkDeleting}
                      >
                        {row.value === null ? "Задать" : "Изменить"}
                      </button>
                    </div>
                  )}

                  {row.error && (
                    <div
                      role="alert"
                      style={{
                        marginTop: 8,
                        fontSize: 12,
                        color: "var(--v4-danger-700, #b91c1c)",
                      }}
                    >
                      {row.error}
                    </div>
                  )}
                </div>
              );
            })}

          <div
            style={{
              marginTop: 4,
              padding: 12,
              border: "1px dashed var(--v4-border, rgba(0,0,0,0.1))",
              borderRadius: 10,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
              Подключение
            </div>
            <div style={{ color: "var(--v4-ink-500)", fontSize: 12, marginBottom: 10 }}>
              Bootstrap-токен авторизует этот браузер для чтения секретов из Pipeline.
              Сменить — если подменили токен на сервере.
            </div>
            <button
              type="button"
              className="v4-btn"
              onClick={handleClearBootstrap}
              disabled={bulkDeleting}
            >
              Сменить bootstrap-токен
            </button>
          </div>

          <SettingsBudgetPanel />

          <div
            style={{
              marginTop: 4,
              padding: 12,
              border: "1px solid var(--v4-danger-100, rgba(239,68,68,0.25))",
              borderRadius: 10,
              background: "var(--v4-danger-50, rgba(239,68,68,0.04))",
            }}
          >
            <div
              style={{
                fontWeight: 600,
                fontSize: 13,
                marginBottom: 4,
                color: "var(--v4-danger-700, #b91c1c)",
              }}
            >
              Опасная зона
            </div>
            <div style={{ color: "var(--v4-ink-500)", fontSize: 12, marginBottom: 10 }}>
              Удалить все секреты из server-side store. Действие необратимо — после этого
              dashboard перестанет видеть GitHub / Claude / BetterStack пока вы не введёте
              их заново.
            </div>
            {confirmAllDelete ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "var(--v4-ink-700)" }}>
                  Точно очистить все {keys?.length ?? 0} ключей?
                </span>
                <button
                  type="button"
                  className="v4-btn"
                  onClick={() => setConfirmAllDelete(false)}
                  disabled={bulkDeleting}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className="v4-btn"
                  style={{ color: "var(--v4-danger-700, #b91c1c)" }}
                  onClick={() => void handleClearAll()}
                  disabled={bulkDeleting}
                >
                  {bulkDeleting ? "Очистка…" : "Подтвердить очистку"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="v4-btn"
                style={{ color: "var(--v4-danger-700, #b91c1c)" }}
                onClick={() => setConfirmAllDelete(true)}
                disabled={!keys || keys.length === 0}
              >
                Очистить все секреты на сервере
              </button>
            )}
          </div>
        </div>

        <footer
          style={{
            display: "flex",
            justifyContent: "flex-end",
            padding: "12px 20px 16px",
            borderTop: "1px solid var(--v4-border, rgba(0,0,0,0.06))",
            marginTop: 8,
          }}
        >
          <button
            type="button"
            className="v4-btn"
            onClick={onClose}
            disabled={bulkDeleting}
          >
            Закрыть
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
