import { useEffect, useState } from "react";
import type { AuditProjectStatus, GeneratedIssue } from "../types";
import { fetchAuditFindings } from "../utils/auditor";
import { generateIssuesFromFindings } from "../utils/claude";
import { createIssue } from "../utils/github-actions";
import { getToken, getClaudeKey, GITHUB_OWNER } from "../utils/config";

interface Props {
  project: AuditProjectStatus;
  onClose: () => void;
  onComplete: (issuesCreated: number, issueUrls: string[]) => void;
}

type DialogState = "generating" | "preview" | "creating" | "error";

export function AuditIssuesDialog({ project, onClose, onComplete }: Props) {
  const [state, setState] = useState<DialogState>("generating");
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<GeneratedIssue[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [creatingIndex, setCreatingIndex] = useState(0);
  const [creatingTitle, setCreatingTitle] = useState("");

  const repoOwner = project.repo.split("/")[0] || GITHUB_OWNER;
  const repoName = project.repo.split("/")[1] || project.name;

  // Step 1: On mount — fetch findings and generate issues via Claude
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

        const generated = await generateIssuesFromFindings(
          findings.findings,
          repoName,
          claudeKey,
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
      } catch {
        // Continue on individual errors — don't abort the whole batch
        urls.push("");
      }
      // Rate limit: 200ms between requests
      if (i < selectedIssues.length - 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    const successUrls = urls.filter(Boolean);
    onComplete(successUrls.length, successUrls);
  }

  const severityBadge: Record<string, string> = {
    critical: "var(--color-danger)",
    high: "var(--color-warning)",
    medium: "var(--color-primary)",
    low: "var(--color-text-muted)",
  };

  const severityLabel: Record<string, string> = {
    critical: "CRIT",
    high: "HIGH",
    medium: "MED",
    low: "LOW",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-lg)",
          width: "100%",
          maxWidth: "640px",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>
            {state === "generating" && `Генерирую issues для ${project.name}...`}
            {state === "preview" && `Создать ${issues.length} issues в ${project.repo}`}
            {state === "creating" && "Создаю issues..."}
            {state === "error" && "Ошибка"}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--color-text-muted)",
              fontSize: "18px",
              lineHeight: 1,
              padding: "4px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>

          {/* State 1: Generating */}
          {state === "generating" && (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  border: "3px solid var(--color-primary)",
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                  margin: "0 auto 16px",
                }}
              />
              <p style={{ color: "var(--color-text-muted)", fontSize: "14px" }}>
                Claude анализирует findings и генерирует issues...
              </p>
            </div>
          )}

          {/* State 2: Preview */}
          {state === "preview" && (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "12px",
                }}
              >
                <span style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>
                  Выбрано: {selected.size} / {issues.length}
                </span>
                <button
                  onClick={toggleAll}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--color-primary)",
                    fontSize: "12px",
                    padding: "2px 6px",
                  }}
                >
                  {selected.size === issues.length ? "Снять все" : "Выбрать все"}
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {issues.map((issue, idx) => (
                  <label
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "8px",
                      padding: "8px 10px",
                      borderRadius: "var(--radius-md)",
                      cursor: "pointer",
                      background: selected.has(idx)
                        ? "var(--color-surface-hover)"
                        : "transparent",
                      border: "1px solid var(--color-border)",
                      transition: "background 0.15s",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(idx)}
                      onChange={() => toggleIssue(idx)}
                      style={{ marginTop: "2px", flexShrink: 0 }}
                    />
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        color: severityBadge[issue.severity] || "var(--color-text-muted)",
                        fontFamily: "var(--font-mono)",
                        flexShrink: 0,
                        minWidth: "34px",
                      }}
                    >
                      {severityLabel[issue.severity] || issue.severity.toUpperCase()}
                    </span>
                    <span
                      style={{
                        fontSize: "13px",
                        color: "var(--color-text)",
                        lineHeight: 1.4,
                        wordBreak: "break-word",
                      }}
                    >
                      {issue.title}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* State 3: Creating */}
          {state === "creating" && (
            <div style={{ padding: "20px 0" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "8px",
                  fontSize: "13px",
                }}
              >
                <span style={{ color: "var(--color-text-muted)" }}>Создаю issues...</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                  {creatingIndex + 1} / {selected.size}
                </span>
              </div>
              <div
                style={{
                  height: "8px",
                  background: "var(--color-border)",
                  borderRadius: "var(--radius-full)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${((creatingIndex + 1) / Math.max(selected.size, 1)) * 100}%`,
                    background: "var(--color-primary)",
                    borderRadius: "var(--radius-full)",
                    transition: "width 0.3s ease-out",
                  }}
                />
              </div>
              <div
                style={{
                  marginTop: "12px",
                  fontSize: "11px",
                  color: "var(--color-text-muted)",
                  fontFamily: "var(--font-mono)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {creatingTitle}
              </div>
            </div>
          )}

          {/* State: Error */}
          {state === "error" && (
            <div style={{ color: "var(--color-danger)", fontSize: "13px", lineHeight: 1.5 }}>
              <strong>Ошибка:</strong> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        {state === "preview" && (
          <div
            style={{
              padding: "12px 20px",
              borderTop: "1px solid var(--color-border)",
              display: "flex",
              gap: "8px",
              justifyContent: "flex-end",
            }}
          >
            <button className="btn btn-sm" onClick={onClose}>
              Отмена
            </button>
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
          <div
            style={{
              padding: "12px 20px",
              borderTop: "1px solid var(--color-border)",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <button className="btn btn-sm" onClick={onClose}>
              Закрыть
            </button>
          </div>
        )}

        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
