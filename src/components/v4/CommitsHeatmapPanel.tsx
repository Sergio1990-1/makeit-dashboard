import { useMemo } from "react";
import type { ProjectData } from "../../types";
import { getLastNDays } from "../../utils/dashboardMetrics";

interface Props {
  projects: ProjectData[];
}

const DAYS = 28;

function bucket(count: number): string | undefined {
  if (count === 0) return undefined;
  if (count === 1) return "1";
  if (count <= 3) return "2";
  if (count <= 6) return "3";
  return "4";
}

export function CommitsHeatmapPanel({ projects }: Props) {
  const days = useMemo(() => getLastNDays(DAYS), []);

  // Pick top-N projects by 28d total commits, but show at least all projects with any activity
  const rows = useMemo(() => {
    const enriched = projects.map((p) => {
      const cells = days.map((d) => p.commitActivity?.byDate?.[d] ?? 0);
      const total = cells.reduce((s, n) => s + n, 0);
      return { repo: p.repo, cells, total };
    });
    return enriched
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [projects, days]);

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="v4-panel">
      <div className="v4-panel-h">
        <div className="v4-panel-t">
          Активность · коммиты по дням <span className="v4-tag">{DAYS} дней</span>
        </div>
        <div className="v4-panel-meta">всего {grandTotal} коммит{grandTotal === 1 ? "" : "ов"}</div>
      </div>
      <div className="v4-heat-strip">
        {rows.length === 0 || grandTotal === 0 ? (
          <div className="v4-empty">Нет активности за {DAYS} дней</div>
        ) : (
          rows.map((row) => (
            <div key={row.repo} className="v4-commit-row">
              <span className="v4-nm">{row.repo}</span>
              <div className="v4-commit-cells">
                {row.cells.map((count, i) => {
                  const v = bucket(count);
                  return (
                    <div
                      key={i}
                      className="v4-cc"
                      data-v={v}
                      title={`${days[i]}: ${count} коммит${count === 1 ? "" : count >= 2 && count <= 4 ? "а" : "ов"}`}
                    />
                  );
                })}
              </div>
              <span className="v4-tot">{row.total}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
