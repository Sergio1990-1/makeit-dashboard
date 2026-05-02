import { createContext, useContext } from "react";

export type ToastKind = "success" | "error" | "info";

export interface ToastInput {
  title: string;
  description?: string;
  kind?: ToastKind;
  /** Auto-dismiss delay in ms; 0 disables. Defaults to 3500. */
  duration?: number;
}

export interface ToastContextValue {
  push: (toast: ToastInput) => void;
}

export const ToastCtx = createContext<ToastContextValue | null>(null);

/**
 * Read the toast pushrouter. Outside a `<ToastHost>` provider this returns a
 * no-op so callers don't need to guard — useful for hot-swapping the host
 * during tests or refactors.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastCtx);
  if (!ctx) {
    return { push: () => undefined };
  }
  return ctx;
}
