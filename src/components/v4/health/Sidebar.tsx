import type { HealthReport } from "../../../types/health";
import type { ProjectData } from "../../../types";
import { Icon } from "./Icon";
import { FancySpark } from "./FancySpark";
import { GITHUB_OWNER } from "../../../utils/config";

interface Props {
  report: HealthReport;
  project?: ProjectData;
}

const PHASE_LABEL: Record<string, string> = {
  development: "Development",
  "pre-dev": "Pre-dev",
  support: "Support",
};

// Right rail — trend history mini-card, project meta (when available),
// and a link to the rules source. Sticky on wide viewports.
export function Sidebar({ report, project }: Props) {
  const oldest = report.trend.points[0] ?? report.score.raw;
  const repoUrl = `https://github.com/${GITHUB_OWNER}/${report.repo}`;
  return (
    <aside className="ph-side">
      <section className="ph-side-card ph-side-card--accent">
        <div className="ph-side-h"><Icon name="trend" /> История health-score</div>
        <div className="ph-side-body">
          <FancySpark trend={report.trend} />
          <div className="ph-side-spark-meta">
            <div>
              <span className="ph-side-meta-l">первый скан</span>
              <span className="v4-mono">{oldest}</span>
            </div>
            <div>
              <span className="ph-side-meta-l">сейчас</span>
              <span className="v4-mono ph-side-meta-now">{report.score.raw}</span>
            </div>
          </div>
          <div className="ph-side-future v4-mono">
            История накапливается между сканами — каждый rescan добавляет точку
          </div>
        </div>
      </section>
      {project && (
        <section className="ph-side-card">
          <div className="ph-side-h"><Icon name="folder" /> Проект</div>
          <div className="ph-side-meta">
            <div>
              <span className="ph-side-meta-l">Клиент</span>
              <span>{project.client}</span>
            </div>
            <div>
              <span className="ph-side-meta-l">Фаза</span>
              <span>{PHASE_LABEL[project.phase] ?? project.phase}</span>
            </div>
            <div>
              <span className="ph-side-meta-l">Закрыто / открыто</span>
              <span className="v4-mono">{project.doneCount} / {project.openCount}</span>
            </div>
            <div>
              <span className="ph-side-meta-l">Velocity 7д</span>
              <span className="v4-mono">{project.velocity7d.toFixed(1)}/день</span>
            </div>
            {project.lastCommitDate && (
              <div>
                <span className="ph-side-meta-l">Последний коммит</span>
                <span className="v4-mono">
                  {new Date(project.lastCommitDate).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                </span>
              </div>
            )}
          </div>
          <div className="ph-side-foot">
            <a className="v4-linkbtn" href={repoUrl} target="_blank" rel="noreferrer">
              Открыть в GitHub <Icon name="ext" />
            </a>
          </div>
        </section>
      )}
      <section className="ph-side-card">
        <div className="ph-side-h"><Icon name="book" /> Источник правил</div>
        <div className="ph-side-body ph-side-body--rules">
          <p>
            Чек-лист — формализация стандартов MakeIT из{" "}
            <a
              href="https://github.com/Sergio1990-1/makeit-knowledge"
              target="_blank"
              rel="noreferrer"
              className="ph-link"
            >
              makeit-knowledge
            </a>.
          </p>
          <ul className="ph-rule-tree">
            <li><span className="v4-mono">L1</span> Гигиена · GLOBAL_CLAUDE.md</li>
            <li><span className="v4-mono">L2</span> Документация · SKILLMakeIT Init</li>
            <li><span className="v4-mono">L3</span> Свежесть · ops/freshness</li>
            <li><span className="v4-mono">L4</span> Drift (AI) · LLM-проверки</li>
          </ul>
        </div>
      </section>
    </aside>
  );
}
