import type { CSSProperties } from 'react';
import styles from './MakeItLoader.module.css';

export interface MakeItLoaderProps {
  /** Pixel size of the wordmark text. M scales to `size * 0.72`. Default 56. */
  size?: number;
  /** Force dark scheme. If omitted, inherits `color` from parent. */
  dark?: boolean;
  /** Override accent color. Default `var(--mk-brand-600)` → `#2563EB`. */
  accent?: string;
  /** Center self in parent via flex. */
  center?: boolean;
  /** className passthrough. */
  className?: string;
}

const M_BRICKS = [
  'M 0 48 L 0 0 L 10 0 L 10 48 Z',
  'M 9 16 L 10 0 L 26 24 L 25 38 Z',
  'M 27 38 L 26 24 L 42 0 L 43 16 Z',
  'M 43 48 L 43 0 L 52 0 L 52 48 Z',
];

/**
 * Animated MakeIT lockup loader.
 * 4 geometric bricks drop into an "M", followed by "ake IT" typing in,
 * then a blinking blue caret. 3.6s loop. CSS-only, no JS timer.
 */
export function MakeItLoader({
  size = 56,
  dark,
  accent = 'var(--mk-primary-active)',
  center = false,
  className,
}: MakeItLoaderProps) {
  const mHeight = size * 0.72;
  const mWidth = mHeight * (52 / 48);
  const caretWidth = size * 0.06;
  const caretGap = size * 0.08;
  const mGap = size * 0.05;

  const rootStyle: CSSProperties = {
    fontSize: size,
    color: dark === true ? '#FFFFFF' : dark === false ? 'var(--mk-ink-900)' : undefined,
    ['--ml-accent' as string]: accent,
    ['--ml-caret-w' as string]: `${caretWidth}px`,
    ['--ml-caret-gap' as string]: `${caretGap}px`,
    ['--ml-caret-y' as string]: `${size * 0.04}px`,
    ['--ml-m-gap' as string]: `${mGap}px`,
  };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Загрузка"
      className={[
        styles.root,
        center ? styles.center : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
      style={rootStyle}
    >
      <svg
        className={styles.m}
        width={mWidth}
        height={mHeight}
        viewBox="0 0 52 48"
        aria-hidden="true"
      >
        {M_BRICKS.map((d, i) => (
          <path
            key={i}
            className={styles.brick}
            d={d}
            fill="currentColor"
            style={{ animationDelay: `${i * 0.13}s` }}
          />
        ))}
      </svg>

      <span className={styles.ake}>
        {['a', 'k', 'e'].map((c, i) => (
          <span
            key={i}
            className={styles.ch}
            style={{ animationDelay: `${0.7 + i * 0.07}s` }}
          >
            {c}
          </span>
        ))}
      </span>

      <span className={styles.it}>
        {['I', 'T'].map((c, i) => (
          <span
            key={i}
            className={styles.ch}
            style={{ animationDelay: `${0.95 + i * 0.07}s` }}
          >
            {c}
          </span>
        ))}
      </span>

      <span className={styles.caret} aria-hidden="true" />
    </div>
  );
}

export default MakeItLoader;
