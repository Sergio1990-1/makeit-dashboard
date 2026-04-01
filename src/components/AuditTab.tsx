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
      <div className="bento-panel span-12 panel-projects" style={{ minHeight: "300px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--color-text-muted)" }}>
        <div className="spinner" style={{ width: "24px", height: "24px", border: "2px solid var(--color-primary)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite", marginBottom: "16px" }} />
        Загрузка конфигурации из makeit-auditor...
      </div>
    );
  }

  // Offline State (Server not running)
  if (auditorAvailable === false) {
    return (
      <div className="bento-panel span-12 panel-projects" style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "var(--sp-8)" }}>
        <div style={{ maxWidth: "560px", padding: "32px", background: "var(--color-bg)", borderRadius: "var(--radius-xl)", border: "1px solid var(--color-border)", boxShadow: "var(--shadow-md)" }}>
          <h2 style={{ fontSize: "18px", marginBottom: "16px", color: "var(--color-text)", fontWeight: 700 }}>
            ⚡ Локальный сервер недоступен
          </h2>
          <p style={{ color: "var(--color-text-muted)", marginBottom: "24px", fontSize: "14px", lineHeight: 1.5 }}>
            Вкладка «Аудит» общается с системной утилитой <code>makeit-auditor</code> по локальной сети через порт <code>8765</code>. 
            Запустите её в терминале, чтобы продолжить:
          </p>
          <pre style={{ background: "var(--color-surface-hover)", padding: "16px", borderRadius: "8px", fontSize: "13px", color: "var(--color-text)", fontFamily: "var(--font-mono)", marginBottom: "24px", border: "1px solid var(--color-border)", textAlign: "left" }}>
{`cd ~/Desktop/makeit-auditor
source .venv/bin/activate
makeit-audit serve`}
          </pre>
          <button 
            className="btn btn-primary" 
            onClick={refresh}
            style={{ width: "100%", padding: "12px", borderRadius: "8px", fontWeight: 600 }}
          >
            Сервер запущен (Обновить)
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bento-panel span-12 panel-projects">
        <div className="bento-panel-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            Аудит Кода
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)", marginLeft: "12px", fontWeight: "normal", textTransform: "none" }}>
              Локальная интеграция LLM-аудитора
            </span>
          </div>
          <button 
            className="btn btn-sm" 
            onClick={refresh}
            style={{ padding: "4px 8px", minHeight: "28px" }}
          >
            ↻ Обновить
          </button>
        </div>
        
        <section className="projects-grid">
          {projects.map((p) => {
            // Match audit project to dashboard project by repo (case-insensitive)
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

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
