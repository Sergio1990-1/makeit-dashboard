import type { Annotation, PeriodMode } from "../../types/quality";
import { annotationPositionPct } from "../../utils/quality-position";

interface Props {
  annotations: Annotation[];
  mode: PeriodMode;
  bucketCount: number;
}

export function QualityAnnotations({ annotations, mode, bucketCount }: Props) {
  const today = new Date();
  return (
    <>
      {annotations.map((a) => {
        const pct = annotationPositionPct(new Date(a.occurred_at), mode, today, bucketCount);
        if (pct === null) return null;
        return (
          <div key={a.id} className={`annot is-${a.category}`} style={{ left: `${pct}%` }}>
            <div className="annot-dot" />
            <div className="annot-tip">
              <span className="annot-tip-cat">{a.category}</span>
              <br />
              <b>{a.title}</b>
              <br />
              <span style={{ opacity: 0.8, whiteSpace: "normal" }}>{a.desc}</span>
              <div className="annot-tip-date">
                {new Date(a.occurred_at).toLocaleDateString("ru")}
                {a.device_hint && (
                  <span className="annot-tip-device" title="устройство, с которого добавлено">
                    {" · "}
                    {a.device_hint}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
