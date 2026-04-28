import { useEffect, useRef, useState } from "react";
import type { AuditFinding, AuditProjectStatus, VerificationReport } from "../types";
import { fetchAuditFindings, fetchAuditVerification, postAuditVerification } from "../utils/auditor";
import { verifyFindings, buildSkippedVerification, type VerifyProgress } from "../utils/verification";
import { getToken, getClaudeKey, GITHUB_OWNER } from "../utils/config";

interface Props {
  project: AuditProjectStatus;
  onClose: () => void;
  onComplete: () => void;
}

type DialogState =
  | "verifying"
  | "preview"
  | "saving"
  | "error"
  | "skip-confirm"
  | "error-rate-warning";

type VerdictTab = "CONFIRMED" | "UNCERTAIN" | "FALSE_POSITIVE" | "NOT_A_BUG";

const VERDICT_COLOR: Record<string, string> = {
  CONFIRMED: "var(--color-danger)",
  FALSE_POSITIVE: "var(--color-success)",
  UNCERTAIN: "var(--color-warning)",
  NOT_A_BUG: "var(--color-text-muted)",
};

const VERDICT_LABEL: Record<string, string> = {
  CONFIRMED: "Confirmed",
  FALSE_POSITIVE: "False positive",
  UNCERTAIN: "Uncertain",
  NOT_A_BUG: "Not a bug",
};

const ERROR_RATE_THRESHOLD = 0.15;

export function AuditVerifyDialog({ project, onClose, onComplete }: Props) {
  const [state, setState] = useState<DialogState>("verifying");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<VerifyProgress | null>(null);
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [activeTab, setActiveTab] = useState<VerdictTab>("CONFIRMED");
  // Cache the findings loaded for this dialog so handleSkip / handleRetryFailed
  // operate on the exact set the user saw verified — not a fresh re-fetch
  // which can drift if the audit re-runs in the background.
  const [loadedFindings, setLoadedFindings] = useState<{
    findings: AuditFinding[];
    timestamp: string;
  } | null>(null);
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
        setLoadedFindings({ findings: findings.findings, timestamp: findings.timestamp });

        // Reuse verdicts from a prior verification run if one exists.
        let priorReport: VerificationReport | null = null;
        try {
          priorReport = await fetchAuditVerification(project.name);
        } catch {
          // No prior verification — proceed without cache.
        }
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
          5,
          priorReport,
        );
        if (cancelled) return;

        setReport(result);
        // If verifier errored on >15% of findings, route through warning flow
        // before the user saves — retry-failed is often cheaper than re-running
        // the whole batch.
        const errRate = result.total_findings > 0 ? result.error_count / result.total_findings : 0;
        if (errRate > ERROR_RATE_THRESHOLD) {
          setState("error-rate-warning");
        } else {
          setState("preview");
        }
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
      // Prefer the findings we already loaded so total_findings on the
      // saved report matches the count the user just confirmed they want
      // to skip. Fall back to a fresh fetch if for some reason we never
      // populated state (shouldn't happen, but defensive).
      const cached = loadedFindings;
      const findings = cached
        ? { findings: cached.findings, timestamp: cached.timestamp }
        : await fetchAuditFindings(project.name);
      const skipped = buildSkippedVerification(findings.findings, project.name, findings.timestamp);
      setState("saving");
      await postAuditVerification(project.name, stripProject(skipped));
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }

  async function handleRetryFailed() {
    if (!report) return;
    const ghToken = getToken();
    const claudeKey = getClaudeKey();
    if (!ghToken || !claudeKey) {
      setError("Токены не настроены.");
      setState("error");
      return;
    }
    // Abort any still-running batch from a previous run before kicking off
    // a fresh one. Without this, two concurrent verifyFindings() calls
    // can race and the slower one's postAuditVerification overwrites the
    // newer report.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState("verifying");
    setProgress(null);
    try {
      // Reuse the findings we loaded in the initial run rather than
      // re-fetching — keeps total_findings consistent and avoids races
      // with a fresh audit produced in the background.
      let findings: { findings: AuditFinding[]; timestamp: string };
      if (loadedFindings) {
        findings = loadedFindings;
      } else {
        const f = await fetchAuditFindings(project.name);
        findings = { findings: f.findings, timestamp: f.timestamp };
      }
      // Build a synthetic priorReport seeded with ONLY the non-error results
      // so verifyFindings will re-run the error cases and reuse the rest.
      const priorReport: VerificationReport = {
        ...report,
        results: report.results.filter((r) => !r.error),
      };
      const next = await verifyFindings(
        findings.findings,
        repoOwner,
        repoName,
        findings.timestamp,
        ghToken,
        claudeKey,
        project.name,
        (p) => setProgress(p),
        controller.signal,
        5,
        priorReport,
      );
      setReport(next);
      const errRate = next.total_findings > 0 ? next.error_count / next.total_findings : 0;
      setState(errRate > ERROR_RATE_THRESHOLD ? "error-rate-warning" : "preview");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }

  function handleClose() {
    abortRef.current?.abort();
    onClose();
  }

  const tabResults = report?.results.filter((r) => r.verdict === activeTab) ?? [];
  const notABugCount = report?.not_a_bug_count ?? 0;
  const errorRatePct = report && report.total_findings > 0
    ? Math.round((report.error_count / report.total_findings) * 100)
    : 0;

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
            {state === "error-rate-warning" && "Высокая ошибка верификации"}
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
                    {" · "}
                    <span style={{ color: "var(--color-text-muted)" }}>◦ {progress.notABug} not-a-bug</span>
                    {progress.errors > 0 && <> · <span style={{ color: "var(--color-text-muted)" }}>⚠ {progress.errors} errors</span></>}
                  </p>
                  {(progress.skippedAsNoise > 0 || progress.cacheHits > 0 || progress.inferredFromGroup > 0) && (
                    <p className="dialog-hint" style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>
                      {progress.skippedAsNoise > 0 && <>skipped as noise: {progress.skippedAsNoise}</>}
                      {progress.cacheHits > 0 && <> · cached: {progress.cacheHits}</>}
                      {progress.inferredFromGroup > 0 && <> · inferred from group: {progress.inferredFromGroup}</>}
                    </p>
                  )}
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
                <div className="verify-summary-item" style={{ color: VERDICT_COLOR.NOT_A_BUG }}>
                  <div className="verify-summary-count">{notABugCount}</div>
                  <div className="verify-summary-label">Not a bug</div>
                </div>
                {report.error_count > 0 && (
                  <div className="verify-summary-item" style={{ color: "var(--color-text-muted)" }}>
                    <div className="verify-summary-count">{report.error_count}</div>
                    <div className="verify-summary-label">Errors</div>
                  </div>
                )}
              </div>

              <div className="verify-tabs">
                {(["CONFIRMED", "UNCERTAIN", "FALSE_POSITIVE", "NOT_A_BUG"] as const).map((tab) => {
                  const count = tab === "CONFIRMED" ? report.confirmed_count
                    : tab === "FALSE_POSITIVE" ? report.false_positive_count
                    : tab === "UNCERTAIN" ? report.uncertain_count
                    : notABugCount;
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

          {state === "error-rate-warning" && report && (
            <div>
              <div className="dialog-error" style={{ marginBottom: 12 }}>
                <strong>⚠ {errorRatePct}% findings не верифицированы корректно</strong> ({report.error_count} / {report.total_findings}).
                Рекомендуется повторить верификацию только для ошибочных, либо запустить заново.
              </div>
              <p className="dialog-hint">
                Что делать:<br />
                • <strong>Retry failed only</strong> — перепроверить только {report.error_count} сбойных, остальные переиспользуются<br />
                • <strong>Продолжить</strong> — сохранить как есть, сбойные findings пойдут в UNCERTAIN<br />
                • <strong>Отмена</strong> — закрыть без сохранения
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

        {state === "error-rate-warning" && (
          <div className="dialog-footer">
            <button className="btn btn-sm" onClick={handleClose}>Отмена</button>
            <div style={{ flex: 1 }} />
            <button className="btn btn-sm" onClick={() => setState("preview")}>
              Продолжить всё равно
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleRetryFailed}>
              Retry failed only
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
