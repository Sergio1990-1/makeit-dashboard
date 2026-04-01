import { useState } from "react";
import { useAudit } from "../hooks/useAudit";
import { AuditProjectCard } from "./AuditProjectCard";
import { AuditConfirmDialog } from "./AuditConfirmDialog";
import { AuditIssuesDialog } from "./AuditIssuesDialog";
import { postAuditMeta } from "../utils/auditor";
import type { AuditProjectStatus, ProjectData } from "../types";

interface Props {
  dashboardProjects?: ProjectData[];
}

export function AuditTab({ dashboardProjects = [] }: Props) {
  const { projects, runStatuses, auditorAvailable, loading, refresh, startRun, cancelRun } = useAudit();
  const [confirmingProject, setConfirmingProject] = useState<AuditProjectStatus | null>(null);
  const [issuesDialogProject, setIssuesDialogProject] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="bento-panel span-12 panel-projects audit-loading">
        <div className="audit-spinner" />
        Загрузка конфигурации из makeit-auditor...
      </div>
    );
  }

  if (auditorAvailable === false) {
    return (
      <div className="bento-panel span-12 panel-projects audit-offline">
        <div className="audit-offline-card">
          <h2 className="audit-offline-title">⚡ Локальный сервер недоступен</h2>
          <p className="audit-offline-desc">
            Вкладка «Аудит» общается с системной утилитой <code>makeit-auditor</code> по локальной сети через порт <code>8765</code>.
            Запустите её в терминале, чтобы продолжить:
          </p>
          <pre className="audit-offline-code">{`cd ~/Desktop/makeit-auditor\nsource .venv/bin/activate\nmakeit-audit serve`}</pre>
          <button className="btn btn-primary audit-offline-btn" onClick={refresh}>
            Сервер запущен (Обновить)
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bento-panel span-12 panel-projects">
        <div className="bento-panel-title">
          <div>
            Аудит Кода
            <span className="audit-header-sub">Локальная интеграция LLM-аудитора</span>
          </div>
          <button className="btn btn-sm audit-refresh-btn" onClick={refresh}>
            ↻ Обновить
          </button>
        </div>

        <section className="projects-grid">
          {projects.map((p) => {
            const dashProject = dashboardProjects.find(
              (dp) => dp.repo.toLowerCase() === (p.repo.split("/")[1] || p.repo).toLowerCase(),
            );
            const auditIssues = dashProject?.issues.filter((i) =>
              i.labels.some((l) => l.toLowerCase() === "audit"),
            ) ?? [];
            const auditIssueProgress =
              auditIssues.length > 0
                ? {
                    total: auditIssues.length,
                    closed: auditIssues.filter((i) => i.closedAt !== null).length,
                  }
                : undefined;

            return (
              <AuditProjectCard
                key={p.name}
                project={p}
                status={runStatuses[p.name]}
                auditIssueProgress={auditIssueProgress}
                onRun={() => setConfirmingProject(p)}
                onCancel={() => cancelRun(p.name)}
                onCreateIssues={() => setIssuesDialogProject(p.name)}
              />
            );
          })}
        </section>
      </div>

      {confirmingProject && (
        <AuditConfirmDialog
          projectName={confirmingProject.name}
          maxPrice={confirmingProject.gpu_config.max_price_per_hour}
          timeoutHours={confirmingProject.gpu_config.timeout_hours}
          onCancel={() => setConfirmingProject(null)}
          onConfirm={async () => {
            const name = confirmingProject.name;
            setConfirmingProject(null);
            await startRun(name);
          }}
        />
      )}

      {issuesDialogProject && (() => {
        const dialogProject = projects.find((p) => p.name === issuesDialogProject);
        if (!dialogProject) return null;
        return (
          <AuditIssuesDialog
            project={dialogProject}
            onClose={() => setIssuesDialogProject(null)}
            onComplete={async (issuesCreated, issueUrls) => {
              try {
                await postAuditMeta(issuesDialogProject, issuesCreated, issueUrls);
              } catch {
                // Non-critical: meta save failure doesn't block the user
              }
              setIssuesDialogProject(null);
              refresh();
            }}
          />
        );
      })()}
    </>
  );
}
