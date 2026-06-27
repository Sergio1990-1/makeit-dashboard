export type BatchFileStatus = "pending" | "uploading" | "processing" | "done" | "error";

export interface BatchFile {
  id: string;
  file: File;
  status: BatchFileStatus;
  taskId?: string;
  error?: string;
  /** Upload progress 0–100 while status === "uploading". */
  uploadPct?: number;
}

interface Props {
  files: BatchFile[];
  active: boolean;
  onCancel: () => void;
  onClose: () => void;
}

const STATUS_LABEL: Record<BatchFileStatus, string> = {
  pending: "Ожидание",
  uploading: "Загрузка…",
  processing: "Обработка…",
  done: "Готово",
  error: "Ошибка",
};

const STATUS_ICON: Record<BatchFileStatus, string> = {
  pending: "○",
  uploading: "↑",
  processing: "⟳",
  done: "✓",
  error: "✗",
};

export function BatchProgressV4({ files, active, onCancel, onClose }: Props) {
  if (files.length === 0) return null;

  const total = files.length;
  const done = files.filter((f) => f.status === "done").length;
  const errors = files.filter((f) => f.status === "error").length;
  const finished = files.every((f) => f.status === "done" || f.status === "error");
  const pct = ((done + errors) / total) * 100;

  return (
    <div className="v4-panel v4-tpc-batch-panel">
      <div className="v4-panel-h">
        <div className="v4-panel-t">
          Пакетная загрузка <span className="v4-tag">{done}/{total}</span>
          {errors > 0 && (
            <span className="v4-tag v4-tag--danger">{errors} ошиб.</span>
          )}
        </div>
        <div className="v4-panel-actions">
          {active && (
            <button type="button" className="v4-btn" onClick={onCancel}>
              Остановить
            </button>
          )}
          {finished && (
            <button type="button" className="v4-btn v4-btn--pri" onClick={onClose}>
              Закрыть
            </button>
          )}
        </div>
      </div>

      <div className="v4-tpc-batch-bar">
        <div className="v4-ptrack" style={{ height: 6 }}>
          <div
            className="v4-pfill"
            style={{
              width: `${pct}%`,
              background: errors > 0 ? "var(--mk-warn)" : "var(--mk-brand-500)",
            }}
          />
        </div>
      </div>

      <div className="v4-tpc-batch-list">
        {files.map((bf) => (
          <div key={bf.id} className={`v4-tpc-batch-row v4-tpc-batch-row--${bf.status}`}>
            <span
              className={`v4-tpc-batch-icon v4-tpc-batch-icon--${bf.status}`}
              aria-hidden="true"
            >
              {STATUS_ICON[bf.status]}
            </span>
            <span className="v4-tpc-batch-name" title={bf.file.name}>
              {bf.file.name}
            </span>
            <span className={`v4-tpc-batch-status v4-tpc-batch-status--${bf.status}`}>
              {bf.status === "error" && bf.error
                ? bf.error
                : bf.status === "uploading" && typeof bf.uploadPct === "number"
                  ? `Загрузка… ${bf.uploadPct}%`
                  : STATUS_LABEL[bf.status]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
