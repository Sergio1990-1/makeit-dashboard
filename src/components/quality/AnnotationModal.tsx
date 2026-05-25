import { useState } from "react";
import type { AnnotationCreatePayload, AnnotationCategory } from "../../types/quality";
import {
  getDeviceHint,
  setDeviceHint,
  DEVICE_HINT_MAX_LEN,
} from "../../utils/device-hint";

interface Props {
  onSubmit: (p: AnnotationCreatePayload) => Promise<void>;
  onClose: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "var(--mk-overlay)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 8,
  boxShadow: "var(--mk-shadow-md)",
  padding: 20,
  width: "100%",
  maxWidth: 480,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 14,
};

const labelTextStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--mk-ink-500)",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const inputStyle: React.CSSProperties = {
  fontSize: 14,
  padding: "6px 8px",
  border: "1px solid var(--mk-line)",
  borderRadius: 4,
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 4,
};

export function AnnotationModal({ onSubmit, onClose }: Props) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<AnnotationCategory>("skill");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  // Device hint is prefilled from localStorage so returning users never
  // re-type it. Empty string is a valid choice — user can clear it once
  // and we'll stop annotating their events with a device label. See
  // `src/utils/device-hint.ts` for why this is just a UX label, not auth.
  const [deviceHint, setDeviceHintState] = useState(() => getDeviceHint());
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const occurredAt = new Date(date + "T00:00:00Z").toISOString();
      const trimmedHint = deviceHint.trim().slice(0, DEVICE_HINT_MAX_LEN);
      // Persist whatever the user typed (including empty — that's how they
      // opt out). Done before the network call so even if the POST fails
      // their preference sticks for the next attempt.
      setDeviceHint(trimmedHint);
      await onSubmit({
        occurred_at: occurredAt,
        category,
        scope: "global",
        title: title.trim(),
        desc: desc.trim(),
        ...(trimmedHint ? { device_hint: trimmedHint } : {}),
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-bd" style={overlayStyle} onClick={onClose}>
      <form
        className="modal"
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h3 style={{ margin: 0 }}>Добавить событие</h3>
        <label style={labelStyle}>
          <span style={labelTextStyle}>Дата (UTC)</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          <span style={labelTextStyle}>Категория</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as AnnotationCategory)}
            style={inputStyle}
          >
            <option value="skill">skill — обновление скилла разработки</option>
            <option value="deploy">deploy — деплой инфраструктуры</option>
            <option value="manual">manual — pair-сессия, ad-hoc</option>
          </select>
        </label>
        <label style={labelStyle}>
          <span style={labelTextStyle}>Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            required
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          <span style={labelTextStyle}>Описание</span>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            maxLength={600}
            rows={3}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          <span style={labelTextStyle}>
            Устройство (опционально, для атрибуции)
          </span>
          <input
            value={deviceHint}
            onChange={(e) => setDeviceHintState(e.target.value)}
            maxLength={DEVICE_HINT_MAX_LEN}
            placeholder="Mac Sergey"
            aria-label="Устройство"
            style={inputStyle}
          />
        </label>
        {errorMsg && (
          <div
            role="alert"
            style={{
              padding: "8px 10px",
              background: "var(--mk-danger-soft)",
              border: "1px solid var(--mk-danger-100)",
              borderRadius: 4,
              color: "var(--mk-danger-strong)",
              fontSize: 12,
            }}
          >
            Не удалось сохранить: {errorMsg}
          </div>
        )}
        <div className="modal-actions" style={actionsStyle}>
          <button type="button" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" disabled={submitting}>
            Сохранить
          </button>
        </div>
      </form>
    </div>
  );
}
