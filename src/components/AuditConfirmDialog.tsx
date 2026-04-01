import React from "react";

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
    <div className="modal-overlay" style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 'var(--sp-4)'
    }}>
      <div className="bento-panel" style={{
        maxWidth: '480px',
        width: '100%',
        padding: 'var(--sp-6)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
        animation: 'modalSlideUp 0.3s ease-out'
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: 'var(--sp-2)', color: 'var(--color-text)' }}>
          Запустить аудит «{projectName}»?
        </h2>
        
        <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--sp-6)', fontSize: '14px', lineHeight: 1.5 }}>
          Будет развернута выделенная GPU-инстанция для проведения глубокого анализа кода с помощью LLM.
        </p>

        <div style={{ 
          background: 'var(--color-bg)', 
          borderRadius: 'var(--radius-lg)', 
          padding: 'var(--sp-4)', 
          marginBottom: 'var(--sp-6)',
          border: '1px solid var(--color-border)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-3)' }}>
            <span style={{ color: 'var(--color-text-faint)', fontSize: '12px', textTransform: 'uppercase' }}>Лимит стоимости</span>
            <span style={{ fontWeight: 600, color: 'var(--color-caution)' }}>~${estimatedMin} – ${estimatedMax}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-3)' }}>
            <span style={{ color: 'var(--color-text-faint)', fontSize: '12px', textTransform: 'uppercase' }}>Макс. время</span>
            <span style={{ fontWeight: 600 }}>{timeoutHours} ч.</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--color-text-faint)', fontSize: '12px', textTransform: 'uppercase' }}>Уведомления</span>
            <span style={{ fontWeight: 500, color: 'var(--color-primary)' }}>Telegram</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
          <button className="btn" onClick={onCancel} style={{ flex: 1 }}>
            Отмена
          </button>
          <button className="btn btn-primary" onClick={onConfirm} style={{ flex: 2 }}>
            ▶ Запустить аудит
          </button>
        </div>
      </div>

      <style>{`
        @keyframes modalSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
