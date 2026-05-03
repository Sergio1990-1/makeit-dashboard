import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { ToastCtx } from "./toastContext";
import type { ToastAction, ToastContextValue, ToastInput, ToastKind } from "./toastContext";

interface Toast extends Required<Omit<ToastInput, "description" | "action">> {
  id: number;
  description?: string | { text: string; url: string };
  action?: ToastAction;
  leaving: boolean;
}

const ICONS: Record<ToastKind, ReactNode> = {
  success: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <line x1="12" y1="16.5" x2="12.01" y2="16.5" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="8.01" />
      <line x1="12" y1="11" x2="12" y2="16" />
    </svg>
  ),
};

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    const t = timersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 220);
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = ++idRef.current;
      const toast: Toast = {
        id,
        title: input.title,
        description: input.description,
        kind: input.kind ?? "info",
        duration: input.duration ?? 3500,
        action: input.action,
        leaving: false,
      };
      setToasts((prev) => [...prev, toast]);
      if (toast.duration > 0) {
        const handle = setTimeout(() => remove(id), toast.duration);
        timersRef.current.set(id, handle);
      }
    },
    [remove]
  );

  useEffect(() => {
    // Capture the Map identity at mount; the ref's `.current` could in theory
    // be reassigned later, but in this hook it never is. Lint just wants the
    // cleanup to close over a stable reference.
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const ctx = useMemo<ToastContextValue>(() => ({ push }), [push]);

  return (
    <ToastCtx.Provider value={ctx}>
      {children}
      <div className="wow-toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`wow-toast wow-toast--${t.kind} ${t.leaving ? "is-leaving" : ""}`}
          >
            <span className="wow-toast-ic">{ICONS[t.kind]}</span>
            <div className="wow-toast-body">
              <b>{t.title}</b>
              {t.description &&
                (typeof t.description === "string" ? (
                  <span>{t.description}</span>
                ) : (
                  <span>
                    <a
                      href={t.description.url}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {t.description.text}
                    </a>
                  </span>
                ))}
              {t.action && (
                <button
                  type="button"
                  className="wow-toast-action"
                  onClick={() => {
                    // Run action first so the click is honoured even if a
                    // re-render races the removal animation.
                    t.action?.onClick();
                    remove(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              className="wow-toast-close"
              aria-label="Закрыть уведомление"
              onClick={() => remove(t.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
