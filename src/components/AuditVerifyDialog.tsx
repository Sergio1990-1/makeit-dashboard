import { useEffect, useRef, useState } from "react";
import type { AuditProjectStatus, VerificationReport } from "../types";
import { fetchAuditFindings, postAuditVerification } from "../utils/auditor";
import { verifyFindings, buildSkippedVerification, type VerifyProgress } from "../utils/verification";
import { getToken, getClaudeKey, GITHUB_OWNER } from "../utils/config";

interface Props {
  project: AuditProjectStatus;
  onClose: () => void;
  onComplete: () => void;
}

type DialogState = "verifying" | "preview" | "saving" | "error" | "skip-confirm";

const VERDICT_COLOR: Record<string, string> = {
  CONFIRMED: "var(--color-danger)",
  FALSE_POSITIVE: "var(--color-success)",
  UNCERTAIN: "var(--color-warning)",
};

const VERDICT_LABEL: Record<string, string> = {
  CONFIRMED: "Confirmed",
  FALSE_POSITIVE: "False positive",
  UNCERTAIN: "Uncertain",
};

export function AuditVerifyDialog({ project, onClose, onComplete }: Props) {
  const [state, setState] = useState<DialogState>("verifying");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<VerifyProgress | null>(null);
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [activeTab, setActiveTab] = useState<"CONFIRMED" | "UNCERTAIN" | "FALSE_POSITIVE">("CONFIRMED");
  const abortRef = useRef<AbortController | null>(null);

  const repoOwner = project.repo.split("/")[0] || GITHUB_OWNER;
  const repoName = project.repo.split("/")[1] || project.name;

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    let cancelled = false;

    async function run() {
      try {
        const claudeKey = getClaudeKey();
        if (!claudeKey) throw new Error("Claude API key не настроен.");
        const ghToken = getToken();
        if (!ghToken) throw new Error("GitHub token не настроен.");

        const findings = await fetchAuditFindings(project.name);
        if (cancelled) return;

        const result = await verifyFindings(
          findings.findings,
          repoOwner,
          repoName,
          findings.timestamp,
          ghToken,
          claudeKey,
          project.name,
          (p) => { if (!cancelled) setProgress(p); },
          controller.signal,
        );
        if (cancelled) return;

        setReport(result);
        setState("preview");
      } catch (e) {
        if (cancelled) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : String(e));
        setState("error");
      }
    }

    run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [project.name, repoOwner, repoName]);

  function stripProject<T extends { project: string }>(r: T): Omit<T, "project"> {
    const copy = { ...r };
    delete (copy as Partial<T>).project;
    return copy;
  }

  async function handleSave() {
    if (!report) return;
    setState("saving");
    try {
      await postAuditVerification(project.name, stripProject(report));
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }

  async function handleSkip() {
    try {
      const findings = await fetchAuditFindings(project.name);
      const skipped = buildSkippedVerification(findings.findings, project.name, findings.timestamp);
      setState("saving");
      await postAuditVerification(project.name, stripProject(skipped));
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }

  function handleClose() {
    abortRef.current?.abort();
    onClose();
  }

  const tabResults = report?.results.filter((r) => r.verdict === activeTab) ?? [];

  return (
    <div
      className="dialog-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="dialog">
        <div className="dialog-header">
          <h3 className="dialog-title">
            {state === "verifying" && `Верификация ${project.name}...`}
            {state === "preview" && `Результаты верификации: ${project.name}`}
            {state === "saving" && "Сохраняю результаты..."}
            {state === "error" && "Ошибка верификации"}
            {state === "skip-confirm" && "Пропустить верификацию?"}
          </h3>
          <button className="dialog-close" onClick={handleClose}>✕</button>
        </div>

        <div className="dialog-body">
          {state === "verifying" && (
            <div className="dialog-spinner-wrap">
              <div className="dialog-spinner" />
              {progress ? (
                <>
                  <p className="dialog-hint">
                    Проверяется {progress.current} / {progress.total}: <code>{progress.currentFile}{progress.currentLine ? `:${progress.currentLine}` : ""}</code>
                  </p>
                  <div className="dialog-progress-track" style={{ marginTop: 8 }}>
                    <div
                      className="dialog-progress-fill"
                      style={{ width: `${(progress.current / Math.max(progress.total, 1)) * 100}%` }}
                    />
                  </div>
                  <p className="dialog-hint" style={{ marginTop: 12, fontSize: 13 }}>
                    <span style={{ color: "var(--color-danger)" }}>✓ {progress.confirmed} confirmed</span>
                    {" · "}
                    <span style={{ color: "var(--color-success)" }}>✗ {progress.falsePositive} FP</span>
                    {" · "}
                    <span style={{ color: "var(--color-warning)" }}>? {progress.uncertain} uncertain</span>
                    {progress.errors > 0 && <> · <span style={{ color: "var(--color-text-muted)" }}>⚠ {progress.errors} errors</span></>}
                  </p>
                </>
              ) : (
                <p className="dialog-hint">Подготовка findings...</p>
              )}
            </div>
          )}

          {state === "preview" && report && (
            <div>
              <div className="verify-summary">
                <div className="verify-summary-item" style={{ color: VERDICT_COLOR.CONFIRMED }}>
                  <div className="verify-summary-count">{report.confirmed_count}</div>
                  <div className="verify-summary-label">Confirmed</div>
                </div>
                <div className="verify-summary-item" style={{ color: VERDICT_COLOR.FALSE_POSITIVE }}>
                  <div className="verify-summary-count">{report.false_positive_count}</div>
                  <div className="verify-summary-label">False positive</div>
                </div>
                <div className="verify-summary-item" style={{ color: VERDICT_COLOR.UNCERTAIN }}>
                  <div className="verify-summary-count">{report.uncertain_count}</div>
                  <div className="verify-summary-label">Uncertain</div>
                </div>
                {report.error_count > 0 && (
                  <div className="verify-summary-item" style={{ color: "var(--color-text-muted)" }}>
                    <div className="verify-summary-count">{report.error_count}</div>
                    <div className="verify-summary-label">Errors</div>
                  </div>
                )}
              </div>

              <div className="verify-tabs">
                {(["CONFIRMED", "UNCERTAIN", "FALSE_POSITIVE"] as const).map((tab) => {
                  const count = tab === "CONFIRMED" ? report.confirmed_count
                    : tab === "FALSE_POSITIVE" ? report.false_positive_count
                    : report.uncertain_count;
                  return (
                    <button
                      key={tab}
                      className={`verify-tab ${activeTab === tab ? "verify-tab--active" : ""}`}
                      onClick={() => setActiveTab(tab)}
                      style={activeTab === tab ? { borderBottomColor: VERDICT_COLOR[tab] } : undefined}
                    >
                      {VERDICT_LABEL[tab]} ({count})
                    </button>
                  );
                })}
              </div>

              <div className="verify-results">
                {tabResults.length === 0 ? (
                  <p className="dialog-hint">Нет findings в этой категории.</p>
                ) : (
                  tabResults.map((r) => (
                    <details key={r.finding_index} className="verify-result">
                      <summary>
                        <code>{r.file}{r.line ? `:${r.line}` : ""}</code>
                        <span className="verify-result-reason"> — {r.reason}</span>
                      </summary>
                      {r.code_snippet && (
                        <pre className="verify-result-code">{r.code_snippet}</pre>
                      )}
                    </details>
                  ))
                )}
              </div>
            </div>
          )}

          {state === "saving" && (
            <div className="dialog-spinner-wrap">
              <div className="dialog-spinner" />
              <p className="dialog-hint">Сохраняю результаты на сервер...</p>
            </div>
          )}

          {state === "error" && (
            <div className="dialog-error">
              <strong>Ошибка:</strong> {error}
            </div>
          )}

          {state === "skip-confirm" && (
            <div>
              <p className="dialog-hint">
                Вы уверены? Все findings будут помечены как UNCERTAIN и создадут issues с лейблом <code>needs-human</code>.
                Это безопасный режим — ни один finding не будет отброшен, но и false positives не отфильтруются.
              </p>
            </div>
          )}
        </div>

        {state === "preview" && (
          <div className="dialog-footer">
            <button className="btn btn-sm" onClick={() => setState("skip-confirm")}>
              Пропустить верификацию
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn btn-sm" onClick={handleClose}>Отмена</button>
            <button className="btn btn-primary btn-sm" onClick={handleSave}>
              Сохранить
            </button>
          </div>
        )}

        {state === "error" && (
          <div className="dialog-footer dialog-footer--end">
            <button className="btn btn-sm" onClick={handleClose}>Закрыть</button>
          </div>
        )}

        {state === "skip-confirm" && (
          <div className="dialog-footer dialog-footer--end">
            <button className="btn btn-sm" onClick={() => setState("preview")}>Назад</button>
            <button className="btn btn-warning btn-sm" onClick={handleSkip}>
              Да, пропустить
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
