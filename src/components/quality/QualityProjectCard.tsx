import type { CSSProperties } from "react";
import type { QualityPayload, PeriodMode, RepoStatusEntry } from "../../types/quality";
import { QualityChart } from "./QualityChart";

interface Props {
  repo: string;
  client: string;
  data: QualityPayload;
  mode: PeriodMode;
  index: number;
}

function severityBadge(dirtyPct: number): { label: string; cls: string } | null {
  if (dirtyPct === 0 || Number.isNaN(dirtyPct)) return null;
  if (dirtyPct >= 25) return { label: "высокий риск", cls: "tag-bad" };
  if (dirtyPct >= 12) return { label: "средний", cls: "tag-warn" };
  return { label: "чисто", cls: "tag-good" };
}

const cardStyle = (i: number): CSSProperties => ({ ["--i" as string]: i } as CSSProperties);

export function QualityProjectCard({ repo, client, data, mode, index }: Props) {
  const status: RepoStatusEntry | undefined = data.repo_status[repo];
  const repoData = data.buckets[mode].per_repo[repo];
  const labels = data.buckets[mode].labels;

  if (status?.status === "error") {
    return (
      <div className="card" style={cardStyle(index)}>
        <div className="card-h">
          <div>
            <div className="card-name">{repo}</div>
            <div className="card-client">{client}</div>
          </div>
          <span className="tag tag-bad">ошибка fetch</span>
        </div>
        <div className="card-empty">
          <b>{status.code || "ERROR"}</b>
          {status.message || "Sweep не смог получить данные"}
        </div>
      </div>
    );
  }

  if (!repoData) {
    return (
      <div className="card" style={cardStyle(index)}>
        <div className="card-h">
          <div className="card-name">{repo}</div>
        </div>
        <div className="card-empty">нет данных</div>
      </div>
    );
  }

  const totalPR = repoData.buckets.reduce((a, b) => a + b.total_pr, 0);
  const totalP0 = repoData.buckets.reduce((a, b) => a + b.with_p0, 0);
  const totalP1 = repoData.buckets.reduce((a, b) => a + b.with_p1_only, 0);
  const totalP2 = repoData.buckets.reduce((a, b) => a + b.with_p2_only, 0);
  const totalDirty = totalP0 + totalP1 + totalP2;

  if (totalPR < 3) {
    return (
      <div className="card" style={cardStyle(index)}>
        <div className="card-h">
          <div>
            <div className="card-name">{repo}</div>
            <div className="card-client">{client}</div>
          </div>
          <span className="tag">мало данных</span>
        </div>
        <div className="card-empty">
          <b>{totalPR} PR за период</b>
          Нужно ≥3 для расчёта
        </div>
      </div>
    );
  }

  const dirtyPct = (totalDirty / totalPR) * 100;
  const p1Pct = (totalP1 / totalPR) * 100;
  const p2Pct = (totalP2 / totalPR) * 100;
  const badge = severityBadge(dirtyPct);
  const coverage = repoData.codex_coverage_pct;
  const lowCoverage = coverage < 50;

  return (
    <div className="card" style={cardStyle(index)}>
      <div className="card-h">
        <div>
          <div className="card-name">{repo}</div>
          <div className="card-client">{client}</div>
        </div>
        <div>
          <div className="card-now">{dirtyPct.toFixed(0)}%</div>
          <div className="card-now-sub">{totalDirty}/{totalPR} PR</div>
        </div>
      </div>
      <QualityChart buckets={repoData.buckets} labels={labels} compact />
      <div className="card-foot">
        <div className="nums">
          {totalP0 > 0 && (
            <span className="num-p0" title="БЛОКЕР">
              <b
                style={{
                  color: "var(--mk-quality-p0-text)",
                  background: "color-mix(in srgb, var(--mk-danger) 12%, transparent)",
                  padding: "1px 6px",
                  borderRadius: 3,
                  fontWeight: 700,
                }}
              >
                🔴 P0: {totalP0}
              </b>
            </span>
          )}
          <span className="num-p1">P1 <b>{p1Pct.toFixed(0)}%</b></span>
          <span className="num-p2">P2 <b>{p2Pct.toFixed(0)}%</b></span>
          {lowCoverage && (
            <span className="tag tag-warn" title="Codex ревьюил меньше половины PR">
              Codex: {coverage}%
            </span>
          )}
        </div>
        {badge && <span className={`tag ${badge.cls}`}>{badge.label}</span>}
      </div>
    </div>
  );
}
