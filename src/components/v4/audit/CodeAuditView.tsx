import { useEffect, useMemo, useState } from "react";
import { useAudit } from "../../../hooks/useAudit";
import { postAuditMeta } from "../../../utils/auditor";
import type { AuditProjectStatus, ProjectData } from "../../../types";
import { AuditConfirmDialog } from "../../AuditConfirmDialog";
import { AuditIssuesDialog } from "../../AuditIssuesDialog";
import { AuditVerifyDialog } from "../../AuditVerifyDialog";
import { AuditHero } from "./AuditHero";
import { AuditKpiStrip } from "./AuditKpiStrip";
import { AuditOfflinePanel } from "./AuditOfflinePanel";
import { AuditProjectCardV4 } from "./AuditProjectCardV4";
import {
  applyFilter,
  applySearch,
  AUDIT_FILTERS,
  sortProjects,
  type AuditFilter,
} from "./utils";

interface Props {
  dashboardProjects?: ProjectData[];
}

const STORAGE_FILTER = "v4au:filter";

function readFilter(): AuditFilter {
  try {
    const v = localStorage.getItem(STORAGE_FILTER);
    if (v === "all" || v === "critical" || v === "needsVerify" || v === "verified" || v === "notAudited" || v === "stale") {
      return v;
    }
  } catch {
    /* ignore */
  }
  return "all";
}

export function CodeAuditView({ dashboardProjects = [] }: Props) {
  const { projects, runStatuses, auditorAvailable, loading, refresh, startRun, cancelRun } = useAudit();
  // Store the full project object for each open dialog so a background
  // refresh() that drops/replaces a project can't silently close the
  // dialog mid-render via a failed lookup.
  const [confirmingProject, setConfirmingProject] = useState<AuditProjectStatus | null>(null);
  const [issuesDialogProject, setIssuesDialogProject] = useState<AuditProjectStatus | null>(null);
  const [verifyDialogProject, setVerifyDialogProject] = useState<AuditProjectStatus | null>(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AuditFilter>(() => readFilter());

  useEffect(() => {
    try { localStorage.setItem(STORAGE_FILTER, filter); } catch { /* ignore */ }
  }, [filter]);

  // Frozen "now" — refreshed on data change + every 30s — for stable
  // relative timestamps. Microtask defer satisfies react-hooks/set-state-in-effect.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setNowMs(Date.now());
    });
    return () => { cancelled = true; };
  }, [projects]);

  const visible = useMemo(() => {
    return sortProjects(applySearch(applyFilter(projects, filter, nowMs), search));
  }, [projects, filter, search, nowMs]);

  if (loading && projects.length === 0) {
    return (
      <div className="v4-empty" style={{ marginTop: 14 }}>Подключаемся к серверу аудита…</div>
    );
  }

  if (auditorAvailable === false) {
    return (
      <div style={{ marginTop: 14 }}>
        <AuditOfflinePanel onRetry={refresh} />
      </div>
    );
  }

  return (
    <>
      <AuditHero projects={projects} loading={loading} onRefresh={refresh} />

      <AuditKpiStrip projects={projects} />

      <div className="v4-au-toolbar">
        <div className="v4-mon-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            aria-label="Поиск по проектам"
            placeholder="Поиск по имени проекта…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="v4-pillgrp">
          {AUDIT_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={filter === key ? "is-active" : ""}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="v4-panel">
          <div className="v4-empty">
            По текущим фильтрам ничего не найдено
            {search && (
              <>
                {" "}для запроса <span className="v4-pl-mono">«{search}»</span>
              </>
            )}
            .
          </div>
        </div>
      ) : (
        <div className="v4-au-grid">
          {visible.map((p) => {
            // dashboardProjects[].repo is "owner/name"; auditor's p.repo is
            // also "owner/name" but legacy callers used to compare against
            // just the name segment. Compare slug-to-slug on both sides so
            // the lookup actually matches.
            const auditRepoName = (p.repo.split("/")[1] ?? p.repo).toLowerCase();
            const dashProject = dashboardProjects.find(
              (dp) => (dp.repo.split("/")[1] ?? dp.repo).toLowerCase() === auditRepoName,
            );
            const currentIssueUrls = p.last_run?.issue_urls ?? [];
            const auditIssues = currentIssueUrls.length > 0
              ? (dashProject?.issues.filter((i) => currentIssueUrls.includes(i.url)) ?? [])
              : [];
            const auditIssueProgress = auditIssues.length > 0
              ? {
                  total: auditIssues.length,
                  closed: auditIssues.filter((i) => i.closedAt !== null).length,
                }
              : undefined;

            return (
              <AuditProjectCardV4
                key={p.name}
                project={p}
                status={runStatuses[p.name]}
                auditIssueProgress={auditIssueProgress}
                nowMs={nowMs}
                onRun={() => setConfirmingProject(p)}
                onCancel={() => cancelRun(p.name)}
                onVerify={() => setVerifyDialogProject(p)}
                onCreateIssues={() => setIssuesDialogProject(p)}
              />
            );
          })}
        </div>
      )}

      {/* Dialogs reused from legacy — they own their own modal styling and
          implement complex multi-state flows that aren't worth reskinning
          for this PR. */}
      {confirmingProject && (
        <AuditConfirmDialog
          projectName={confirmingProject.name}
          maxPrice={confirmingProject.gpu_config.max_price_per_hour}
          lastRunCost={confirmingProject.last_run?.cost_usd ?? null}
          lastRunDuration={confirmingProject.last_run?.duration_seconds ?? null}
          timeoutHours={confirmingProject.gpu_config.timeout_hours}
          onCancel={() => setConfirmingProject(null)}
          onConfirm={async () => {
            const name = confirmingProject.name;
            setConfirmingProject(null);
            await startRun(name);
          }}
        />
      )}

      {verifyDialogProject && (
        <AuditVerifyDialog
          project={verifyDialogProject}
          onClose={() => setVerifyDialogProject(null)}
          onComplete={() => {
            setVerifyDialogProject(null);
            refresh();
          }}
        />
      )}

      {issuesDialogProject && (
        <AuditIssuesDialog
          project={issuesDialogProject}
          onClose={() => setIssuesDialogProject(null)}
          onComplete={async (issuesCreated, issueUrls) => {
            const projectName = issuesDialogProject.name;
            try {
              await postAuditMeta(projectName, issuesCreated, issueUrls);
            } catch (e) {
              console.error("Failed to save audit meta (issues still exist in GitHub):", e);
            }
            setIssuesDialogProject(null);
            refresh();
          }}
        />
      )}
    </>
  );
}
