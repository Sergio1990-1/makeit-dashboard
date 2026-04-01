interface Props {
  projectName: string;
  maxPrice: number;
  timeoutHours: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AuditConfirmDialog({ projectName, maxPrice, timeoutHours, onConfirm, onCancel }: Props) {
  const estimatedMin = (maxPrice * 0.5).toFixed(2);
  const estimatedMax = (maxPrice * timeoutHours).toFixed(2);

  return (
    <div className="modal-overlay">
      <div className="bento-panel modal-panel">
        <h2 className="modal-title">Запустить аудит «{projectName}»?</h2>

        <p className="modal-desc">
          Будет развернута выделенная GPU-инстанция для проведения глубокого анализа кода с помощью LLM.
        </p>

        <div className="modal-info-block">
          <div className="modal-info-row">
            <span className="modal-info-label">Лимит стоимости</span>
            <span style={{ fontWeight: 600, color: 'var(--color-caution)' }}>~${estimatedMin} – ${estimatedMax}</span>
          </div>
          <div className="modal-info-row">
            <span className="modal-info-label">Макс. время</span>
            <span style={{ fontWeight: 600 }}>{timeoutHours} ч.</span>
          </div>
          <div className="modal-info-row">
            <span className="modal-info-label">Уведомления</span>
            <span style={{ fontWeight: 500, color: 'var(--color-primary)' }}>Telegram</span>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onCancel} style={{ flex: 1 }}>
            Отмена
          </button>
          <button className="btn btn-primary modal-btn-primary" onClick={onConfirm}>
            ▶ Запустить аудит
          </button>
        </div>
      </div>
    </div>
  );
}
