import { useState, useMemo } from "react";
import type { QualityPayload, PeriodMode } from "../../types/quality";
import { PROJECTS } from "../../utils/config";
import { QualityProjectCard } from "./QualityProjectCard";

interface Props {
  data: QualityPayload;
  mode: PeriodMode;
}

type SortKey = "dirty" | "alpha" | "p1";

function totals(data: QualityPayload, repo: string, mode: PeriodMode) {
  const r = data.buckets[mode].per_repo[repo];
  if (!r) return { total: 0, p0: 0, p1: 0, p2: 0 };
  return r.buckets.reduce(
    (acc, b) => ({
      total: acc.total + b.total_pr,
      p0: acc.p0 + b.with_p0,
      p1: acc.p1 + b.with_p1_only,
      p2: acc.p2 + b.with_p2_only,
    }),
    { total: 0, p0: 0, p1: 0, p2: 0 },
  );
}

function dirtyPct(data: QualityPayload, repo: string, mode: PeriodMode) {
  const { total, p0, p1, p2 } = totals(data, repo, mode);
  return total ? ((p0 + p1 + p2) / total) * 100 : 0;
}

function p1Pct(data: QualityPayload, repo: string, mode: PeriodMode) {
  const { total, p1 } = totals(data, repo, mode);
  return total ? (p1 / total) * 100 : 0;
}

export function QualityProjectGrid({ data, mode }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("dirty");

  const sorted = useMemo(() => {
    return [...PROJECTS].sort((a, b) => {
      if (sortKey === "alpha") return a.repo.localeCompare(b.repo);
      if (sortKey === "p1") return p1Pct(data, b.repo, mode) - p1Pct(data, a.repo, mode);
      return dirtyPct(data, b.repo, mode) - dirtyPct(data, a.repo, mode);
    });
  }, [data, mode, sortKey]);

  return (
    <>
      <div className="sect">
        <h2>По проектам</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="meta">Сортировка:</span>
          <div className="sort">
            <button className={sortKey === "dirty" ? "active" : ""} onClick={() => setSortKey("dirty")}>
              по «грязи»
            </button>
            <button className={sortKey === "alpha" ? "active" : ""} onClick={() => setSortKey("alpha")}>
              по алфавиту
            </button>
            <button className={sortKey === "p1" ? "active" : ""} onClick={() => setSortKey("p1")}>
              по P1
            </button>
          </div>
        </div>
      </div>
      <div className="grid">
        {sorted.map((p, idx) => (
          <QualityProjectCard
            key={p.repo}
            repo={p.repo}
            client={p.client}
            data={data}
            mode={mode}
            index={idx}
          />
        ))}
      </div>
    </>
  );
}
