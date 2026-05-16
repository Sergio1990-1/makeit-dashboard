import { useEffect, useRef } from "react";

/**
 * Accessibility behaviour every `aria-modal="true"` dialog must back up
 * with real focus management. A dialog that claims `aria-modal` but lets
 * Tab walk into the obscured page and ignores Escape is broken for
 * keyboard / assistive-tech users — this hook makes the promise true:
 *
 *   - **Focus trap** — Tab / Shift+Tab wrap within the dialog; focus
 *     can't escape into the inert background.
 *   - **Escape** — closes the dialog via `onClose` (mapped by the
 *     caller to its cancel / dismiss handler).
 *   - **Focus restore** — on unmount, focus returns to the element that
 *     was focused when the dialog opened (the initiator), so keyboard
 *     context isn't lost.
 *
 * Self-contained (no deps). Mirrors the established pattern in
 * `PendingChangePreviewV4`. Attach the returned ref to the dialog's
 * focusable container (the panel, not the backdrop).
 *
 * `onClose` is read through a ref so an unstable inline callback from
 * the parent doesn't re-bind the key listener or restage initial focus
 * on every render — the effect mounts once per dialog open.
 */
export function useModalA11y<T extends HTMLElement = HTMLDivElement>(
  onClose: () => void,
): React.RefObject<T | null> {
  const modalRef = useRef<T | null>(null);
  // Keep the latest `onClose` in a ref so the keydown/focus effect can
  // mount exactly once per dialog open even when the parent passes a
  // fresh inline callback every render. Synced in an effect (not during
  // render) to satisfy react-hooks/refs.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    // Remember who opened the dialog so focus can be handed back on
    // close. `document.activeElement` is the initiator at mount time.
    const initiator =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const FOCUSABLE =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const focusables = (): HTMLElement[] =>
      modalRef.current
        ? Array.from(
            modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
          ).filter((el) => !el.hasAttribute("aria-hidden"))
        : [];

    // Pull initial focus inside the dialog (first focusable, else the
    // container itself) so the very next Tab is already trapped.
    const items = focusables();
    if (items.length > 0) {
      items[0].focus();
    } else {
      modalRef.current?.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !modalRef.current) return;
      const list = focusables();
      if (list.length === 0) {
        // Nothing focusable — keep focus pinned to the dialog itself.
        e.preventDefault();
        modalRef.current.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (
        e.shiftKey &&
        (active === first || !modalRef.current.contains(active))
      ) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // Restore focus to the initiator if it's still in the document.
      if (initiator && initiator.isConnected) initiator.focus();
    };
  }, []);

  return modalRef;
}
