import type { HealthLayer, HealthReport } from "../../../types/health";
import { LAYER_NAMES } from "../../../types/health";
import { Icon } from "./Icon";

interface Props {
  report: HealthReport;
}

const LAYERS: HealthLayer[] = [1, 2, 3, 4];

export function LayerStrip({ report }: Props) {
  return (
    <section className="ph-layer-strip">
      <div className="ph-layer-strip-h">
        <div className="ph-layer-strip-t">
          <Icon name="layers" /> Покрытие по слоям
        </div>
        <div className="ph-layer-legend">
          <span><i className="ph-dot ph-dot--pass" /> прошли</span>
          <span><i className="ph-dot ph-dot--fail" /> нарушения</span>
          <span><i className="ph-dot ph-dot--unknown" /> ждут drift</span>
          <span><i className="ph-dot ph-dot--skipped" /> не применимо</span>
        </div>
      </div>
      <div className="ph-layer-rows">
        {LAYERS.map((id, i) => {
          const L = report.by_layer[id];
          const allTotal = L.pass + L.fail + L.unknown + L.skipped;
          const pct = (n: number) => (allTotal > 0 ? (n / allTotal) * 100 : 0);
          return (
            <div className="ph-layer-row" key={id} style={{ animationDelay: `${i * 70}ms` }}>
              <div className="ph-layer-row-l">
                <span className="ph-layer-row-num v4-mono">L{id}</span>
                <span className="ph-layer-row-name">{LAYER_NAMES[id]}</span>
              </div>
              <div className="ph-layer-row-track">
                {L.pass > 0 && (
                  <div className="ph-layer-row-seg ph-layer-row-seg--pass" style={{ width: `${pct(L.pass)}%` }} title={`pass ${L.pass}`} />
                )}
                {L.fail > 0 && (
                  <div className="ph-layer-row-seg ph-layer-row-seg--fail" style={{ width: `${pct(L.fail)}%` }} title={`fail ${L.fail}`} />
                )}
                {L.unknown > 0 && (
                  <div className="ph-layer-row-seg ph-layer-row-seg--unknown" style={{ width: `${pct(L.unknown)}%` }} title={`unknown ${L.unknown}`} />
                )}
                {L.skipped > 0 && (
                  <div className="ph-layer-row-seg ph-layer-row-seg--skipped" style={{ width: `${pct(L.skipped)}%` }} title={`skipped ${L.skipped}`} />
                )}
              </div>
              <div className="ph-layer-row-counts v4-mono">
                <span className="ph-c-pass">{L.pass}</span>
                <span className="ph-c-sep">·</span>
                <span className={L.fail > 0 ? "ph-c-fail" : "ph-c-muted"}>{L.fail}</span>
                <span className="ph-c-sep">·</span>
                <span className={L.unknown > 0 ? "ph-c-unknown" : "ph-c-muted"}>{L.unknown}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
