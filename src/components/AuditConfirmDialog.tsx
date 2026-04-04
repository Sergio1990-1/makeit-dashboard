interface Props {
  projectName: string;
  maxPrice: number;
  timeoutHours: number;
  lastRunCost: number | null;
  lastRunDuration: number | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AuditConfirmDialog({ projectName, maxPrice, timeoutHours, lastRunCost, lastRunDuration, onConfirm, onCancel }: Props) {
  let estimatedMin: string;
  let estimatedMax: string;
  let estimatedTime: string;

  if (lastRunCost != null && lastRunCost > 0 && lastRunDuration != null && lastRunDuration > 0) {
    // Based on real data: ±30% range around last run
    const min = lastRunCost * 0.7;
    const max = lastRunCost * 1.3;
    estimatedMin = min.toFixed(2);
    estimatedMax = max.toFixed(2);
    const mins = Math.round(lastRunDuration / 60);
    estimatedTime = `~${mins} мин`;
  } else {
    // No history — conservative estimate based on GPU config
    estimatedMin = (maxPrice * 0.3).toFixed(2);
    estimatedMax = (maxPrice * 1.5).toFixed(2);
    estimatedTime = `до ${timeoutHours} ч.`;
  }

  return (
    <div className="modal-overlay">
      <div className="bento-panel modal-panel">
        <h2 className="modal-title">Запустить аудит «{projectName}»?</h2>

        <p className="modal-desc">
          Будет развернута выделенная GPU-инстанция для проведения глубокого анализа кода с помощью LLM.
        </p>

        <div className="modal-info-block">
          <div className="modal-info-row">
            <span className="modal-info-label">Ожидаемая стоимость</span>
            <span style={{ fontWeight: 600, color: 'var(--color-caution)' }}>~${estimatedMin} – ${estimatedMax}</span>
          </div>
          <div className="modal-info-row">
            <span className="modal-info-label">Ожидаемое время</span>
            <span style={{ fontWeight: 600 }}>{estimatedTime}</span>
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
