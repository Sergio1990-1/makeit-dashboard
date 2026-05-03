import { useEffect, useState } from "react";
import type { ProjectData } from "../../../types";
import { useProjectHealth } from "../../../hooks/useProjectHealth";
import { loadChecklist } from "../../../utils/checklist";
import { getToken } from "../../../utils/config";
import { Hero } from "./Hero";
import { LayerStrip } from "./LayerStrip";
import { FindingsBoard } from "./FindingsBoard";
import { Sidebar } from "./Sidebar";
import { ClassificationMissing, ErrorState, LoadingState } from "./States";
import { Icon } from "./Icon";

interface Props {
  repo: string;
  project?: ProjectData;
  onBack: () => void;
}

// Top-level page. Decides between the 7 visual states described in the
// design handoff:
//   loading-initial / loading-refresh / error / classification-missing /
//   grace-period / report-clean / report-warn / report-critical
// Most of these collapse to "render the report with banners on top".

export function ProjectHealthPage({ repo, project, onBack }: Props) {
  const { report, loading, error, refresh } = useProjectHealth(repo);

  // Load the rules count for the hero "N правил · makeit-knowledge" link.
  // Fire once when the page opens; the value is cached by loadChecklist.
  const [rulesCount, setRulesCount] = useState<number>(0);
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    loadChecklist(token)
      .then((doc) => {
        if (!cancelled) setRulesCount(doc.rules.length);
      })
      .catch(() => {
        /* if the checklist fails we still render — Hero will show 0 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Edge states first ─────────────────────────────────────────────
  if (error) {
    // Classification-missing surfaces as an error message from the engine.
    if (error.includes("not in project_classification")) {
      return (
        <div className="v4-content">
          <PageHeaderForState repo={repo} onBack={onBack} />
          <div className="ph-page">
            <div className="ph-main">
              <ClassificationMissing repo={repo} onRetry={refresh} />
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="v4-content">
        <PageHeaderForState repo={repo} onBack={onBack} />
        <div className="ph-page">
          <div className="ph-main">
            <ErrorState message={error} onRetry={refresh} />
          </div>
        </div>
      </div>
    );
  }

  if (loading && !report) {
    return (
      <div className="v4-content">
        <PageHeaderForState repo={repo} onBack={onBack} />
        <div className="ph-page">
          <div className="ph-main">
            <LoadingState repo={repo} />
          </div>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="v4-content">
        <PageHeaderForState repo={repo} onBack={onBack} />
        <div className="ph-page">
          <div className="ph-main">
            <LoadingState repo={repo} />
          </div>
        </div>
      </div>
    );
  }

  // ─── Report rendered ───────────────────────────────────────────────
  const refreshing = loading;
  return (
    <div className="v4-content">
      <Hero
        report={report}
        onBack={onBack}
        onRescan={refresh}
        refreshing={refreshing}
        rulesCount={rulesCount}
      />
      <div className="ph-page">
        <div className="ph-main">
          {refreshing && (
            <div className="ph-refresh-banner">
              <span className="ph-refresh-spin" />
              Пересканирую {report.repo}… отчёт обновится через несколько секунд.
            </div>
          )}
          {report.in_grace_period && (
            <div className="ph-grace-banner">
              <Icon name="seedling" />
              <span>
                <b>Льготный период.</b> Проект младше 3 дней — нарушения отображаются, но не штрафуют (кроме критических).
              </span>
            </div>
          )}
          <LayerStrip report={report} />
          <FindingsBoard report={report} />
        </div>
        <Sidebar report={report} project={project} />
      </div>
    </div>
  );
}

// Minimal header during edge states — just a back-button so the user is
// never trapped on a loading/error screen.
function PageHeaderForState({ repo, onBack }: { repo: string; onBack: () => void }) {
  return (
    <section className="ph-hero-block">
      <div className="ph-hero-top">
        <button type="button" className="v4-btn ph-back" onClick={onBack}>
          <Icon name="arrow-left" />
          Все проекты
        </button>
        <div className="ph-hero-id">
          <div className="ph-hero-titlerow">
            <h1>
              <span className="v4-mono">{repo}</span>
            </h1>
          </div>
          <div className="ph-hero-sub">
            <span><Icon name="shield" /> Health</span>
          </div>
        </div>
      </div>
    </section>
  );
}
