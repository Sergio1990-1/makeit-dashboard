import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Milestone } from "../../../types";
import { getToken } from "../../../utils/config";
import { formatShortDate } from "../../../utils/date";
import {
  commitStartChange,
  parseMilestoneUrl,
  patchMilestoneDueOn,
  setDueOverride,
  triggerCacheSync,
} from "../../../utils/milestoneEdit";
import { useToast } from "../toastContext";
import { stripEpicPrefix } from "./utils";

export interface PendingChange {
  milestone: Milestone;
  /** Original (pre-drag) start ISO date (YYYY-MM-DD), or null if heuristic. */
  oldStart: string | null;
  /** Original due ISO timestamp, or null. */
  oldDue: string | null;
  /** New start ISO date (YYYY-MM-DD) — local-only, never sent to GitHub. */
  newStart: string;
  /** New due ISO timestamp, or null to clear. */
  newDue: string | null;
}

interface Props {
  change: PendingChange;
  onClose: () => void;
  onSaved: () => void;
}

function fmtDateMaybe(iso: string | null): string {
  if (!iso) return "не задан";
  return formatShortDate(iso);
}

export function MilestoneEditConfirm({ change, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const ref = parseMilestoneUrl(change.milestone.url);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const startChanged = change.oldStart !== change.newStart;
  const dueChanged =
    (change.oldDue ? change.oldDue.slice(0, 10) : null) !==
    (change.newDue ? change.newDue.slice(0, 10) : null);

  const save = async () => {
    if (!ref) {
      toast.push({ title: "Не удалось распарсить URL milestone", kind: "error" });
      return;
    }
    const token = getToken();
    if ((dueChanged || startChanged) && !token) {
      toast.push({
        title: "Нет GitHub-токена",
        description: "Добавь PAT в настройках, чтобы изменить сроки.",
        kind: "error",
      });
      return;
    }
    setSaving(true);

    if (dueChanged) {
      const result = await patchMilestoneDueOn(token!, ref, change.newDue);
      if (!result) {
        toast.push({
          title: "GitHub отклонил запрос (дедлайн)",
          description: "Дедлайн не сохранён. Проверь права токена.",
          kind: "error",
        });
        setSaving(false);
        return;
      }
      setDueOverride(change.milestone.url, change.newDue);
    }

    if (startChanged) {
      const ok = await commitStartChange(token!, change.milestone, change.newStart);
      if (!ok) {
        toast.push({
          title: "GitHub отклонил запрос (старт)",
          description:
            "Стартовая дата хранится в description milestone. Проверь права токена.",
          kind: "error",
        });
        setSaving(false);
        return;
      }
    }

    if (dueChanged || startChanged) triggerCacheSync();

    toast.push({
      title: "Сроки обновлены",
      description:
        dueChanged && startChanged
          ? "Дедлайн и старт ушли в GitHub."
          : dueChanged
            ? "Дедлайн ушёл в GitHub."
            : "Старт записан в description milestone (виден всем устройствам).",
      kind: "success",
    });
    setSaving(false);
    onSaved();
    onClose();
  };

  return createPortal(
    <div
      className="v4-mspopup-bd"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="v4-mspopup v4-mscconfirm"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="v4-mspopup-h">
          <div className="v4-mspopup-h-text">
            <div className="v4-mspopup-repo">{change.milestone.repo}</div>
            <h2 className="v4-mspopup-title">
              {stripEpicPrefix(change.milestone.title) || change.milestone.title}
            </h2>
          </div>
          <button
            type="button"
            className="v4-mspopup-close"
            aria-label="Закрыть"
            onClick={onClose}
            disabled={saving}
          >
            ×
          </button>
        </header>

        <div className="v4-mscconfirm-body">
          <p className="v4-mscconfirm-lead">Сохранить новые сроки?</p>
          <table className="v4-mscconfirm-tbl">
            <thead>
              <tr>
                <th></th>
                <th>Было</th>
                <th>Стало</th>
              </tr>
            </thead>
            <tbody>
              <tr className={startChanged ? "is-changed" : ""}>
                <th scope="row">
                  Старт <span className="v4-mscconfirm-tag v4-mscconfirm-tag--gh">GitHub</span>
                </th>
                <td>{fmtDateMaybe(change.oldStart)}</td>
                <td>{fmtDateMaybe(change.newStart)}</td>
              </tr>
              <tr className={dueChanged ? "is-changed" : ""}>
                <th scope="row">
                  Дедлайн <span className="v4-mscconfirm-tag v4-mscconfirm-tag--gh">GitHub</span>
                </th>
                <td>{fmtDateMaybe(change.oldDue)}</td>
                <td>{fmtDateMaybe(change.newDue)}</td>
              </tr>
            </tbody>
          </table>
          {(dueChanged || startChanged) && (
            <div className="v4-mscconfirm-note">
              Изменения уйдут в GitHub и будут видны всей команде.
              {startChanged && !dueChanged && (
                <>
                  {" "}
                  Старт хранится как тег в description milestone (
                  <code>{`<!-- makeit-start: … -->`}</code>) — невидимо в GitHub UI.
                </>
              )}
            </div>
          )}
        </div>

        <footer className="v4-mscconfirm-foot">
          <button
            type="button"
            className="v4-mspopup-edit-cancel"
            onClick={onClose}
            disabled={saving}
          >
            Отмена
          </button>
          <button
            type="button"
            className="v4-mspopup-edit-save"
            onClick={save}
            disabled={saving || (!dueChanged && !startChanged)}
          >
            {saving ? "Сохраняю..." : "Сохранить"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
