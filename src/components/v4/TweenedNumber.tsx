import { useMemo } from "react";
import { useTween } from "../../hooks/useTween";

interface Props {
  value: number;
  /** Decimal digits to display (default 0). */
  decimals?: number;
  /** Tween duration ms. */
  duration?: number;
  /** Override locale formatting; falls back to `ru-RU`. */
  locale?: string;
  /** Replace decimal separator (e.g. "." → ",") for compact custom formats. */
  decimalSeparator?: string;
  /** Optional className passthrough. */
  className?: string;
}

/**
 * Renders a number that smoothly tweens to its current value when updated.
 * Pure visual sugar — semantics (aria-live default off) preserved.
 */
export function TweenedNumber({
  value,
  decimals = 0,
  duration = 700,
  locale = "ru-RU",
  decimalSeparator,
  className,
}: Props) {
  const tweened = useTween(value, { duration });
  const formatted = useMemo(() => {
    const safe = Number.isFinite(tweened) ? tweened : value;
    const opts: Intl.NumberFormatOptions = {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    };
    let s = safe.toLocaleString(locale, opts);
    if (decimalSeparator && decimalSeparator !== ",") {
      s = s.replace(",", decimalSeparator);
    }
    return s;
  }, [tweened, decimals, locale, decimalSeparator, value]);
  return <span className={className}>{formatted}</span>;
}
