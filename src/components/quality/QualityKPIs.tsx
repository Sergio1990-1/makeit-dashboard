import type { CSSProperties } from "react";
import type { QualityPayload, PeriodMode } from "../../types/quality";
import type { FocusMode } from "./QualityChart";

interface Props {
  data: QualityPayload;
  mode: PeriodMode;
  focus?: FocusMode;
  /** Toggle handler — клик по уже активной плитке снимает фильтр. */
  onToggleFocus?: (mode: FocusMode) => void;
}

export function QualityKPIs({ data, mode, focus = "all", onToggleFocus }: Props) {
  const buckets = data.buckets[mode].summary;
  const total = buckets.reduce((a, b) => a + b.total_pr, 0);
  const totalP0 = buckets.reduce((a, b) => a + b.with_p0, 0);
  const totalP1 = buckets.reduce((a, b) => a + b.with_p1_only, 0);
  const totalP2 = buckets.reduce((a, b) => a + b.with_p2_only, 0);
  // Новая метрика «грязный»: только P0+P1 (нит-P2 — фон, не блокирует ship).
  const dirty = totalP0 + totalP1;
  const dirtyPct = total ? Math.round((dirty / total) * 100) : 0;
  const p1Pct = total ? Math.round((totalP1 / total) * 100) : 0;
  const p2Pct = total ? Math.round((totalP2 / total) * 100) : 0;
  const avgPerPeriod = buckets.length ? Math.round(total / buckets.length) : 0;
  const periodLabel = mode === "12w" ? "за 12 нед." : "за 30 дней";
  const avgLabel = mode === "12w" ? "среднем за неделю" : "среднем за день";

  const kpiStyle = (i: number, active: boolean): CSSProperties =>
    ({
      ["--i" as string]: i,
      // Active state — рамка цветом метрики + лёгкий лифт. Не трогаем CSS-файл,
      // чтобы не плодить -active классы по всем темам.
      ...(active
        ? {
            outline: "2px solid currentColor",
            outlineOffset: -2,
            boxShadow: "0 4px 12px color-mix(in srgb, var(--mk-ink-900) 8%, transparent)",
          }
        : null),
    }) as CSSProperties;

  const tileButtonProps = (m: FocusMode) =>
    onToggleFocus
      ? {
          role: "button" as const,
          tabIndex: 0,
          onClick: () => onToggleFocus(m),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onToggleFocus(m);
            }
          },
          "aria-pressed": focus === m,
          style: { cursor: "pointer" as const },
        }
      : {};

  // Извлечено в const — иначе spread + style-override вызывают tileButtonProps
  // дважды, что хрупко: добавив в props функцию с эффектом мы её задвоим.
  const p0Props = tileButtonProps("p0");

  return (
    <div className="kpis">
      {totalP0 > 0 && (
        <div
          className="kpi-p0-alert"
          title="Блокирующие баги от Codex. Клик — отфильтровать чарт по P0."
          {...p0Props}
          style={{
            ...p0Props.style,
            ...(focus === "p0"
              ? { outline: "2px solid white", outlineOffset: -3 }
              : null),
          }}
        >
          <span className="kpi-p0-icon">🔴</span>
          <div className="kpi-p0-text">
            <b>P0: {totalP0}</b>
            <span>БЛОКЕРЫ {periodLabel}</span>
          </div>
        </div>
      )}
      <div
        className="kpi"
        style={kpiStyle(0, focus === "dirty")}
        title="PR с P0 или P1 находкой codex (P2-нит не считается). Клик — фильтр чарта."
        {...tileButtonProps("dirty")}
      >
        <div className="kpi-lbl">% грязных PR · {periodLabel}</div>
        <div className="kpi-v" style={focus === "dirty" ? { color: "var(--mk-danger-100)" } : undefined}>
          {dirtyPct}%
        </div>
        <div className="kpi-sub">{dirty} из {total} PR · только P0/P1</div>
      </div>
      <div
        className="kpi"
        style={{
          ...kpiStyle(1, focus === "p1"),
          color: focus === "p1" ? "var(--mk-quality-p1)" : undefined,
        }}
        title="Доля PR с хотя бы одной P1 находкой codex. Клик — фильтр чарта."
        {...tileButtonProps("p1")}
      >
        <div className="kpi-lbl">% P1 · {periodLabel}</div>
        <div className="kpi-v" style={{ color: "var(--mk-quality-p1-text)" }}>{p1Pct}%</div>
      </div>
      <div
        className="kpi"
        style={{
          ...kpiStyle(2, focus === "p2"),
          color: focus === "p2" ? "var(--mk-quality-p2)" : undefined,
        }}
        title="Фоновый шум — стиль, нейминг, мелкие нитпики. Клик — фильтр чарта."
        {...tileButtonProps("p2")}
      >
        <div className="kpi-lbl">% P2 · {periodLabel} <span style={{ opacity: 0.6 }}>· фон</span></div>
        <div className="kpi-v" style={{ color: "var(--mk-quality-p2-text)" }}>{p2Pct}%</div>
      </div>
      <div className="kpi" style={kpiStyle(3, false)}>
        <div className="kpi-lbl">PR {periodLabel}</div>
        <div className="kpi-v">{total}</div>
        <div className="kpi-sub">{avgPerPeriod} в {avgLabel}</div>
      </div>
    </div>
  );
}
