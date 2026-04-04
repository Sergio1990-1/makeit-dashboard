import { useEffect, useState } from "react";
import type { AuditProjectStatus, AuditFinding, GeneratedIssue, Verdict } from "../types";
import { fetchAuditFindings, fetchAuditVerification } from "../utils/auditor";
import { generateIssuesFromFindings } from "../utils/claude";
import { createIssue, addIssueToProject } from "../utils/github-actions";
import { getToken, getClaudeKey, GITHUB_OWNER, GITHUB_PROJECT_NUMBER } from "../utils/config";

interface Props {
  project: AuditProjectStatus;
  onClose: () => void;
  onComplete: (issuesCreated: number, issueUrls: string[]) => void;
}

type DialogState = "generating" | "preview" | "creating" | "error";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "var(--color-danger)",
  high: "var(--color-warning)",
  medium: "var(--color-primary)",
  low: "var(--color-text-muted)",
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "CRIT",
  high: "HIGH",
  medium: "MED",
  low: "LOW",
};

export function AuditIssuesDialog({ project, onClose, onComplete }: Props) {
  const [state, setState] = useState<DialogState>("generating");
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<GeneratedIssue[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [creatingIndex, setCreatingIndex] = useState(0);
  const [creatingTitle, setCreatingTitle] = useState("");
  const [genProgress, setGenProgress] = useState<{ current: number; total: number; label: string } | null>(null);

  const repoOwner = project.repo.split("/")[0] || GITHUB_OWNER;
  const repoName = project.repo.split("/")[1] || project.name;

  useEffect(() => {
    let cancelled = false;

    async function generate() {
      try {
        const claudeKey = getClaudeKey();
        if (!claudeKey) {
          throw new Error("Claude API key не настроен. Добавьте его в настройках.");
        }

        const findings = await fetchAuditFindings(project.name);
        if (cancelled) return;

        // Load verification and filter out FALSE_POSITIVE findings
        let filteredFindings: AuditFinding[] = findings.findings;
        const verdictByFinding = new Map<AuditFinding, Verdict>();
        try {
          const verification = await fetchAuditVerification(project.name);
          if (cancelled) return;
          const verdictByIdx = new Map(verification.results.map((r) => [r.finding_index, r.verdict]));
          filteredFindings = findings.findings.filter((_, idx) => {
            const verdict = verdictByIdx.get(idx);
            return verdict !== "FALSE_POSITIVE";
          });
          for (let i = 0; i < findings.findings.length; i++) {
            const v = verdictByIdx.get(i);
            if (v) verdictByFinding.set(findings.findings[i], v);
          }
        } catch {
          // No verification available — proceed with all findings (backward compat)
        }

        const generated = await generateIssuesFromFindings(
          filteredFindings,
          repoName,
          claudeKey,
          (current, total, label) => {
            if (!cancelled) setGenProgress({ current, total, label });
          },
          verdictByFinding,
        );
        if (cancelled) return;

        setIssues(generated);
        setSelected(new Set(generated.map((_, i) => i)));
        setState("preview");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setState("error");
        }
      }
    }

    generate();
    return () => { cancelled = true; };
  }, [project.name, repoName]);

  function toggleIssue(idx: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === issues.length) setSelected(new Set());
    else setSelected(new Set(issues.map((_, i) => i)));
  }

  async function handleCreate() {
    const token = getToken();
    if (!token) {
      setError("GitHub token не настроен.");
      setState("error");
      return;
    }

    const selectedIssues = issues.filter((_, i) => selected.has(i));
    setState("creating");
    setCreatingIndex(0);

    const urls: string[] = [];
    for (let i = 0; i < selectedIssues.length; i++) {
      const issue = selectedIssues[i];
      setCreatingIndex(i);
      setCreatingTitle(issue.title);
      try {
        const created = await createIssue(
          token,
          repoOwner,
          repoName,
          issue.title,
          issue.body,
          issue.labels,
        );
        urls.push(created.url);
        try {
          await addIssueToProject(token, repoOwner, repoName, created.number, GITHUB_PROJECT_NUMBER);
        } catch { /* non-fatal — issue exists even if project board add fails */ }
      } catch {
        urls.push("");
      }
      if (i < selectedIssues.length - 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    const successUrls = urls.filter(Boolean);
    onComplete(successUrls.length, successUrls);
  }

  return (
    <div
      className="dialog-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="dialog">
        {/* Header */}
        <div className="dialog-header">
          <h3 className="dialog-title">
            {state === "generating" && `Генерирую issues для ${project.name}...`}
            {state === "preview" && `Создать ${issues.length} issues в ${project.repo}`}
            {state === "creating" && "Создаю issues..."}
            {state === "error" && "Ошибка"}
          </h3>
          <button className="dialog-close" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className="dialog-body">
          {state === "generating" && (
            <div className="dialog-spinner-wrap">
              <div className="dialog-spinner" />
              {genProgress ? (
                <>
                  <p className="dialog-hint">
                    Группа {genProgress.current} / {genProgress.total}: {genProgress.label}
                  </p>
                  <div className="dialog-progress-track" style={{ marginTop: 8 }}>
                    <div
                      className="dialog-progress-fill"
                      style={{ width: `${(genProgress.current / genProgress.total) * 100}%` }}
                    />
                  </div>
                </>
              ) : (
                <p className="dialog-hint">Группирую findings по темам...</p>
              )}
            </div>
          )}

          {state === "preview" && (
            <div>
              <div className="issues-meta">
                <span className="issues-meta-count">Выбрано: {selected.size} / {issues.length}</span>
                <button className="issues-toggle-all" onClick={toggleAll}>
                  {selected.size === issues.length ? "Снять все" : "Выбрать все"}
                </button>
              </div>
              <div className="issues-list">
                {issues.map((issue, idx) => (
                  <label
                    key={idx}
                    className={`issue-row ${selected.has(idx) ? 'issue-row--selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(idx)}
                      onChange={() => toggleIssue(idx)}
                    />
                    <span
                      className="issue-severity"
                      style={{ color: SEVERITY_COLOR[issue.severity] || "var(--color-text-muted)" }}
                    >
                      {SEVERITY_LABEL[issue.severity] || issue.severity.toUpperCase()}
                    </span>
                    <span className="issue-title">{issue.title}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {state === "creating" && (
            <div className="dialog-progress-wrap">
              <div className="dialog-progress-header">
                <span className="dialog-progress-label">Создаю issues...</span>
                <span className="dialog-progress-count">{creatingIndex + 1} / {selected.size}</span>
              </div>
              <div className="dialog-progress-track">
                <div
                  className="dialog-progress-fill"
                  style={{ width: `${((creatingIndex + 1) / Math.max(selected.size, 1)) * 100}%` }}
                />
              </div>
              <div className="dialog-progress-title">{creatingTitle}</div>
            </div>
          )}

          {state === "error" && (
            <div className="dialog-error">
              <strong>Ошибка:</strong> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        {state === "preview" && (
          <div className="dialog-footer dialog-footer--end">
            <button className="btn btn-sm" onClick={onClose}>Отмена</button>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleCreate}
              disabled={selected.size === 0}
            >
              Создать выбранные ({selected.size})
            </button>
          </div>
        )}

        {state === "error" && (
          <div className="dialog-footer dialog-footer--end">
            <button className="btn btn-sm" onClick={onClose}>Закрыть</button>
          </div>
        )}
      </div>
    </div>
  );
}
