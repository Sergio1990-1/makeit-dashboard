/**
 * Device-hint (optional debug/UX attribution for shared events).
 *
 * Not identity, not auth. The mini-API behind /api/annotations only knows
 * "shared-basic-auth" — we have no per-user accounts. This is just a label
 * the user types once ("Mac Sergey", "office iPad") so that later you can
 * eyeball "which device added this annotation" without grepping logs.
 *
 * Persisted in localStorage. If absent, AnnotationModal shows an extra
 * "Устройство" input prefilled with the empty string and we save whatever
 * the user types. Hard cap: 40 chars (rendered as a small grey badge —
 * longer strings just clutter the timeline).
 */

const KEY = "makeit_device_hint";
export const DEVICE_HINT_MAX_LEN = 40;

export function getDeviceHint(): string {
  try {
    const raw = localStorage.getItem(KEY) ?? "";
    return raw.slice(0, DEVICE_HINT_MAX_LEN);
  } catch {
    return "";
  }
}

export function setDeviceHint(value: string): void {
  const trimmed = value.trim().slice(0, DEVICE_HINT_MAX_LEN);
  try {
    if (trimmed) {
      localStorage.setItem(KEY, trimmed);
    } else {
      localStorage.removeItem(KEY);
    }
  } catch {
    // localStorage unavailable (private mode etc.) — silently no-op.
    // Annotations still work, the next session just re-prompts.
  }
}
