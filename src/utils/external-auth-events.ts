/**
 * Cross-cutting "external API rejected my token" signal (Epic-004 Task-04, FR-8).
 *
 * The fetch wrappers in `github.ts`, `claude.ts`, and `betterstack.ts` dispatch
 * this when the upstream service answers 401 — meaning the secret in the
 * Pipeline settings store is stale/wrong. App.tsx listens and surfaces a toast
 * with an "Открыть Настройки" action so the user can rotate the secret.
 *
 * This is distinct from `settings:auth-lost` (Task-03), which fires when the
 * *bootstrap* token to the Pipeline settings API itself is rejected — that
 * one bounces the user back to the bootstrap screen instead.
 *
 * Why a window event vs. a React-side pub/sub:
 *  - These detectors live in `utils/*` (no React context available)
 *  - Multiple call sites can produce the signal; a single listener in App.tsx
 *    debounces it for the user
 *  - Zero prop-drilling
 */

export const EXTERNAL_AUTH_LOST_EVENT = "external-api:auth-lost";

export type ExternalAuthService = "github" | "claude" | "betterstack";

export interface ExternalAuthLostDetail {
  service: ExternalAuthService;
}

/** Dispatch the event. Safe to call from any utility — no-op outside the browser. */
export function dispatchExternalAuthLost(service: ExternalAuthService): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ExternalAuthLostDetail>(EXTERNAL_AUTH_LOST_EVENT, {
      detail: { service },
    }),
  );
}

/**
 * Inspect a thrown error and dispatch the auth-lost signal if it represents
 * a 401/403 from the upstream service.
 *
 * Use this in the catch path around SDK calls (Anthropic SDK, fetch wrappers
 * that re-throw) so we don't have to thread status codes through the call
 * stack manually. Returns the error untouched so callers can `throw maybeDispatchAuthLost(...)`.
 */
export function maybeDispatchAuthLostFromError(
  service: ExternalAuthService,
  err: unknown,
): unknown {
  // Anthropic SDK errors expose `status`; fetch errors that we wrapped above
  // already dispatched directly. Best-effort introspection — never throw from
  // the introspection itself.
  try {
    const status =
      err && typeof err === "object" && "status" in err
        ? (err as { status?: unknown }).status
        : undefined;
    if (status === 401 || status === 403) {
      dispatchExternalAuthLost(service);
    }
  } catch {
    // ignore
  }
  return err;
}
