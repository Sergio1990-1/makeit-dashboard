import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Milestone } from "../../../types";
import { formatShortDate } from "../../../utils/date";
import { getToken } from "../../../utils/config";
import {
  deleteMilestone,
  parseMilestoneUrl,
  patchMilestoneDueOn,
  patchMilestoneTitle,
  setDeletedOverride,
  setDueOverride,
  setTitleOverride,
  triggerCacheSync,
} from "../../../utils/milestoneEdit";
import { useToast } from "../toastContext";
import { MilestoneIssueRow } from "./MilestoneIssueRow";
import { repoGlyphColor, stripEpicPrefix } from "./utils";

interface Props {
  milestone: Milestone;
  onClose: () => void;
  /** Called after a successful edit so the parent can re-read overrides. */
  onEdited?: () => void;
}

type Tab = "all" | "open" | "closed";

/** "2026-05-09T00:00:00Z" → "2026-05-09" for <input type=date> binding. */
function dueOnInputValue(iso: string | null): string {
  if (!iso) return "";
  // GitHub stores due_on as a date at 08:00 UTC; show the local-equivalent day.
  return iso.slice(0, 10);
}

/** "2026-05-09" → "2026-05-09T00:00:00Z" — the format GitHub accepts. */
function dueDateToIso(yyyymmdd: string): string {
  return `${yyyymmdd}T00:00:00Z`;
}

export function MilestoneIssuesPopup({ milestone, onClose, onEdited }: Props) {
  const [tab, setTab] = useState<Tab>("all");
  const [editing, setEditing] = useState(false);
  const [draftDate, setDraftDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  const ref = useMemo(() => parseMilestoneUrl(milestone.url), [milestone.url]);
  const canEdit = ref !== null;

  const renameTitle = async () => {
    if (!ref) return;
    const trimmed = draftTitle.trim();
    if (!trimmed || trimmed === milestone.title) {
      setEditingTitle(false);
      return;
    }
    const token = getToken();
    if (!token) {
      toast.push({
        title: "Нет GitHub-токена",
        description: "Добавь PAT в настройках, чтобы переименовать milestone.",
        kind: "error",
      });
      return;
    }
    setSavingTitle(true);
    const result = await patchMilestoneTitle(token, ref, trimmed);
    setSavingTitle(false);
    if (!result) {
      toast.push({
        title: "Не удалось переименовать",
        description: "GitHub отклонил запрос. Проверь права токена.",
        kind: "error",
      });
      return;
    }
    setTitleOverride(milestone.url, trimmed);
    triggerCacheSync();
    toast.push({ title: "Milestone переименован", kind: "success" });
    setEditingTitle(false);
    onEdited?.();
  };

  const performDelete = async () => {
    if (!ref) return;
    const token = getToken();
    if (!token) {
      toast.push({
        title: "Нет GitHub-токена",
        description: "Добавь PAT в настройках, чтобы удалить milestone.",
        kind: "error",
      });
      return;
    }
    setDeleting(true);
    const ok = await deleteMilestone(token, ref);
    setDeleting(false);
    if (!ok) {
      toast.push({
        title: "Не удалось удалить",
        description: "GitHub отклонил запрос. Проверь права токена.",
        kind: "error",
      });
      return;
    }
    setDeletedOverride(milestone.url);
    triggerCacheSync();
    toast.push({
      title: "Milestone удалён",
      description: "Issues остались в репо — у них просто снят milestone.",
      kind: "success",
    });
    onEdited?.();
    onClose();
  };

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock background scroll while popup is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const issues = useMemo(() => milestone.issues ?? [], [milestone.issues]);
  const openIssues = useMemo(
    () => issues.filter((i) => i.state === "OPEN"),
    [issues],
  );
  const closedIssues = useMemo(
    () => issues.filter((i) => i.state === "CLOSED"),
    [issues],
  );

  const visible = useMemo(() => {
    if (tab === "open") return openIssues;
    if (tab === "closed") return closedIssues;
    // "all": open first (sorted by number desc), then closed (sorted by closedAt desc)
    const openSorted = [...openIssues].sort((a, b) => b.number - a.number);
    const closedSorted = [...closedIssues].sort((a, b) => {
      if (!a.closedAt && !b.closedAt) return b.number - a.number;
      if (!a.closedAt) return 1;
      if (!b.closedAt) return -1;
      return new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime();
    });
    return [...openSorted, ...closedSorted];
  }, [tab, openIssues, closedIssues]);

  const total = openIssues.length + closedIssues.length;
  const declaredTotal = milestone.openIssues + milestone.closedIssues;
  const pct = declaredTotal > 0 ? Math.round((milestone.closedIssues / declaredTotal) * 100) : 0;
  const truncated = total < declaredTotal;

  return createPortal(
    <div className="v4-mspopup-bd" onClick={onClose}>
      <div
        className="v4-mspopup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="v4-mspopup-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="v4-mspopup-h">
          <span
            className="v4-mspopup-glyph"
            style={{ background: repoGlyphColor(milestone.repo) }}
            aria-hidden="true"
          />
          <div className="v4-mspopup-h-text">
            <div className="v4-mspopup-repo">{milestone.repo}</div>
            {editingTitle ? (
              <form
                className="v4-mspopup-title-edit"
                onSubmit={(e) => {
                  e.preventDefault();
                  void renameTitle();
                }}
              >
                <input
                  type="text"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  disabled={savingTitle}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditingTitle(false);
                    }
                  }}
                  aria-label="Название milestone"
                />
                <button
                  type="submit"
                  className="v4-mspopup-edit-save"
                  disabled={savingTitle || !draftTitle.trim()}
                >
                  {savingTitle ? "..." : "OK"}
                </button>
                <button
                  type="button"
                  className="v4-mspopup-edit-cancel"
                  disabled={savingTitle}
                  onClick={() => setEditingTitle(false)}
                >
                  Отмена
                </button>
              </form>
            ) : (
              <h2 id="v4-mspopup-title" className="v4-mspopup-title">
                {stripEpicPrefix(milestone.title) || milestone.title}
                {canEdit && (
                  <button
                    type="button"
                    className="v4-mspopup-edit-btn"
                    title="Переименовать milestone"
                    onClick={() => {
                      setDraftTitle(milestone.title);
                      setEditingTitle(true);
                    }}
                  >
                    ✎
                  </button>
                )}
              </h2>
            )}
          </div>
          <button
            type="button"
            className="v4-mspopup-close"
            aria-label="Закрыть"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="v4-mspopup-meta">
          <div className="v4-mspopup-progress">
            <div className="v4-mspopup-progress-bar">
              <div
                className="v4-mspopup-progress-fill"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="num">
              {milestone.closedIssues}/{declaredTotal} · {pct}%
            </span>
          </div>
          <div className="v4-mspopup-meta-row">
            {editing ? (
              <form
                className="v4-mspopup-edit"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!ref) return;
                  const token = getToken();
                  if (!token) {
                    toast.push({
                      title: "Нет GitHub-токена",
                      description: "Добавь PAT в настройках, чтобы редактировать milestone.",
                      kind: "error",
                    });
                    return;
                  }
                  setSaving(true);
                  const dueOn = draftDate ? dueDateToIso(draftDate) : null;
                  const result = await patchMilestoneDueOn(token, ref, dueOn);
                  setSaving(false);
                  if (!result) {
                    toast.push({
                      title: "Не удалось сохранить",
                      description: "GitHub отклонил запрос. Проверь права токена.",
                      kind: "error",
                    });
                    return;
                  }
                  setDueOverride(milestone.url, dueOn);
                  triggerCacheSync();
                  toast.push({
                    title: dueOn ? "Дедлайн обновлён" : "Дедлайн снят",
                    kind: "success",
                  });
                  setEditing(false);
                  onEdited?.();
                }}
              >
                <input
                  type="date"
                  value={draftDate}
                  onChange={(e) => setDraftDate(e.target.value)}
                  disabled={saving}
                  aria-label="Дата дедлайна"
                />
                <button
                  type="submit"
                  className="v4-mspopup-edit-save"
                  disabled={saving}
                >
                  {saving ? "..." : "Сохранить"}
                </button>
                {milestone.dueOn && (
                  <button
                    type="button"
                    className="v4-mspopup-edit-clear"
                    disabled={saving}
                    onClick={async () => {
                      if (!ref) return;
                      const token = getToken();
                      if (!token) return;
                      setSaving(true);
                      const result = await patchMilestoneDueOn(token, ref, null);
                      setSaving(false);
                      if (!result) {
                        toast.push({ title: "Не удалось снять дедлайн", kind: "error" });
                        return;
                      }
                      setDueOverride(milestone.url, null);
                      triggerCacheSync();
                      toast.push({ title: "Дедлайн снят", kind: "success" });
                      setEditing(false);
                      onEdited?.();
                    }}
                  >
                    Снять
                  </button>
                )}
                <button
                  type="button"
                  className="v4-mspopup-edit-cancel"
                  disabled={saving}
                  onClick={() => setEditing(false)}
                >
                  Отмена
                </button>
              </form>
            ) : (
              <>
                <span>
                  Дедлайн:{" "}
                  <b>
                    {milestone.dueOn ? formatShortDate(milestone.dueOn) : "не задан"}
                  </b>
                  {canEdit && (
                    <button
                      type="button"
                      className="v4-mspopup-edit-btn"
                      title="Изменить дедлайн"
                      onClick={() => {
                        setDraftDate(dueOnInputValue(milestone.dueOn));
                        setEditing(true);
                      }}
                    >
                      ✎
                    </button>
                  )}
                </span>
                {milestone.state === "CLOSED" && milestone.closedAt && (
                  <span>
                    Закрыт: <b>{formatShortDate(milestone.closedAt)}</b>
                  </span>
                )}
                <a
                  href={milestone.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="v4-mspopup-ghlink"
                >
                  Открыть на GitHub →
                </a>
              </>
            )}
          </div>
          {canEdit && !editing && (
            <div className="v4-mspopup-danger-row">
              {confirmDelete ? (
                <>
                  <span className="v4-mspopup-danger-prompt">
                    Удалить milestone «{stripEpicPrefix(milestone.title) || milestone.title}»?
                    Issues останутся в репо, но потеряют привязку к milestone.
                  </span>
                  <button
                    type="button"
                    className="v4-mspopup-danger-confirm"
                    onClick={performDelete}
                    disabled={deleting}
                  >
                    {deleting ? "Удаляю..." : "Да, удалить"}
                  </button>
                  <button
                    type="button"
                    className="v4-mspopup-edit-cancel"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                  >
                    Отмена
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="v4-mspopup-danger-btn"
                  onClick={() => setConfirmDelete(true)}
                  title="Удалить milestone на GitHub"
                >
                  Удалить milestone
                </button>
              )}
            </div>
          )}
        </div>

        <div className="v4-mspopup-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "all"}
            className={tab === "all" ? "is-active" : ""}
            onClick={() => setTab("all")}
          >
            Все <span className="num">{total}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "open"}
            className={tab === "open" ? "is-active" : ""}
            onClick={() => setTab("open")}
          >
            Открытые <span className="num">{openIssues.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "closed"}
            className={tab === "closed" ? "is-active" : ""}
            onClick={() => setTab("closed")}
          >
            Закрытые <span className="num">{closedIssues.length}</span>
          </button>
        </div>

        <div className="v4-mspopup-body">
          {visible.length === 0 ? (
            <div className="v4-mspopup-empty">
              {tab === "open"
                ? "Открытых issues нет"
                : tab === "closed"
                  ? "Закрытых issues нет"
                  : "Issues отсутствуют"}
            </div>
          ) : (
            <ul className="v4-mspopup-list">
              {visible.map((issue) => (
                <MilestoneIssueRow key={issue.url} issue={issue} />
              ))}
            </ul>
          )}
          {truncated && tab === "all" && (
            <div className="v4-mspopup-trunc">
              Показано {total} из {declaredTotal} issues. Полный список —{" "}
              <a href={milestone.url} target="_blank" rel="noopener noreferrer">
                на GitHub
              </a>
              .
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
