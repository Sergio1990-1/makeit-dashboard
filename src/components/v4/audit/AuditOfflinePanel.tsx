interface Props {
  onRetry: () => void;
}

/** Shared offline banner shown by both Code and UX sub-views when the
 * makeit-auditor server is unreachable. */
export function AuditOfflinePanel({ onRetry }: Props) {
  return (
    <div className="v4-panel">
      <div className="v4-empty">
        Сервер аудита недоступен. Проверьте, что makeit-auditor запущен локально или на VPS.
      </div>
      <pre className="v4-au-offline-cmd">
{`# Локально:
cd ~/Desktop/makeit-auditor
source .venv/bin/activate
makeit-audit serve

# На VPS:
ssh root@89.167.17.79 "docker ps | grep makeit_auditor"`}
      </pre>
      <div className="v4-au-offline-actions">
        <button type="button" className="v4-btn v4-btn--pri" onClick={onRetry}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-6.22-8.56" />
            <path d="M21 3v6h-6" />
          </svg>
          Подключиться
        </button>
      </div>
    </div>
  );
}
