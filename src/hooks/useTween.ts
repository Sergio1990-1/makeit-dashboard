import { useEffect, useRef, useState } from "react";

const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

interface Options {
  duration?: number;
  /** Skip the animation when the absolute delta is below this threshold. */
  minDelta?: number;
}

/**
 * Tween a numeric value when it changes. Returns the currently displayed value.
 * Uses rAF, eases with easeOutExpo, respects prefers-reduced-motion.
 *
 * The live tween value is tracked in a ref (`displayRef`) so a new tween
 * starting mid-animation continues from the actual on-screen value, not from
 * the last React-committed value (which would otherwise stutter).
 */
export function useTween(target: number, opts: Options = {}): number {
  const { duration = 700, minDelta = 0 } = opts;
  const [value, setValue] = useState(target);
  const displayRef = useRef(target);
  const fromRef = useRef(target);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Snap to target if non-finite, below threshold, or user prefers
    // reduced motion. A single setValue runs only when needed (committed
    // value differs), avoiding the lint warning about cascading renders.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const shouldSnap =
      !Number.isFinite(target) ||
      Math.abs(target - displayRef.current) <= minDelta ||
      reduced;
    if (shouldSnap) {
      displayRef.current = target;
      // Sync React state to the new target. Functional updater is a no-op
      // when already equal, so the lint guard against cascading renders is
      // disabled for this controlled, single-shot snap.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue((current) => (current === target ? current : target));
      return;
    }

    fromRef.current = displayRef.current;
    startRef.current = null;

    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOutExpo(t);
      const next = fromRef.current + (target - fromRef.current) * eased;
      displayRef.current = next;
      setValue(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, minDelta]);

  return value;
}
