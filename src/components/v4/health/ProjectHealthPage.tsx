import { useCallback, useEffect, useState } from "react";
import type { ProjectData } from "../../../types";
import type { HealthFinding } from "../../../types/health";
import { useProjectHealth } from "../../../hooks/useProjectHealth";
import { loadChecklist } from "../../../utils/checklist";
import { GITHUB_OWNER, GITHUB_PROJECT_NUMBER, getClaudeKey, getToken } from "../../../utils/config";
import {
  addIssueToProject,
  createIssue,
  findOpenIssueByTitle,
} from "../../../utils/github-actions";
import {
  buildIssueBody,
  buildIssueLabels,
  buildIssueTitle,
} from "../../../utils/health-issue";
import { useToast } from "../toastContext";
import { BulkCreateModal } from "./BulkCreateModal";
import { Hero } from "./Hero";
import { LayerStrip } from "./LayerStrip";
import { FindingsBoard, type FindingActionState } from "./FindingsBoard";
import { Sidebar } from "./Sidebar";
import { ClassificationMissing, ErrorState, LoadingState } from "./States";
import { Icon } from "./Icon";

interface Props {
  repo: string;
  project?: ProjectData;
}

// Top-level page. Decides between the 7 visual states described in the
// design handoff:
//   loading-initial / loading-refresh / error / classification-missing /
//   grace-period / report-clean / report-warn / report-critical
// Most of these collapse to "render the report with banners on top".

export function ProjectHealthPage({ repo, project }: Props) {
  const {
    report,
    loading,
    error,
    classificationMissing,
    refresh,
    scanDrift,
    driftScanning,
    driftProgress,
  } = useProjectHealth(repo);
  const toast = useToast();

  // Re-read Claude key on each render — settings may change mid-session
  // (SettingsPanel emits an event but we don't subscribe here; the simplest
  // correct behaviour is "ask localStorage every time we render Hero").
  const hasClaudeKey = !!getClaudeKey();

  const handleScanDrift = useCallback(async () => {
    const outcome = await scanDrift();
    switch (outcome.kind) {
      case "ok": {
        if (outcome.total === 0) {
          toast.push({
            kind: "info",
            title: "Drift-скан: нечего проверять",
            description: "Для этого проекта нет применимых Layer-4 правил.",
          });
        } else {
          toast.push({
            kind: "success",
            title: `Drift-скан: +${outcome.addedFails} fails, ${outcome.cachedHits} cached`,
            description: `Проверено ${outcome.total} правил.`,
          });
        }
        break;
      }
      case "no-key":
        toast.push({
          kind: "error",
          title: "Нет Claude API key",
          description: "Настрой ключ в шапке, чтобы запускать drift-сканы.",
        });
        break;
      case "no-token":
        toast.push({
          kind: "error",
          title: "Нет GitHub токена",
          description: "Добавьте токен в настройках.",
        });
        break;
      case "no-report":
        toast.push({
          kind: "error",
          title: "Нет отчёта",
          description: "Сначала запусти базовый скан.",
        });
        break;
      case "error":
        toast.push({
          kind: "error",
          title: "Drift-скан упал",
          description: outcome.message,
        });
        break;
    }
  }, [scanDrift, toast]);

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

  // ─── Per-finding «→ issue» action state ─────────────────────────────
  // Map<rule_id, FindingActionState>. rule_id is unique inside a single
  // health report (one repo per page) so we don't need to namespace by repo.
  // We always create a NEW Map on update so React notices the change instead
  // of mutating in-place (which would skip re-renders of FindingsBoard).
  const [actionStates, setActionStates] = useState<Map<string, FindingActionState>>(
    () => new Map(),
  );

  const setActionState = useCallback((ruleId: string, next: FindingActionState) => {
    setActionStates((prev) => {
      const m = new Map(prev);
      m.set(ruleId, next);
      return m;
    });
  }, []);

  // ─── Bulk-create modal toggle ──────────────────────────────────────
  // Lives here (not in Hero) so the modal can read `report` and write into
  // the shared `actionStates` map.
  const [bulkOpen, setBulkOpen] = useState(false);

  // Friendly text for the most common failure modes. The raw error message
  // from rest() is intentionally short ("GitHub API 422") because we don't
  // want raw GitHub bodies bubbling into the UI.
  const friendlyError = (err: unknown): string => {
    if (err instanceof Error) return err.message;
    return "Не удалось создать issue. Попробуйте ещё раз.";
  };

  const handleCreateIssue = useCallback(
    async (finding: HealthFinding) => {
      if (!report) return;
      const token = getToken();
      if (!token) {
        // The button is disabled in this case, but defend in depth.
        toast.push({
          kind: "error",
          title: "Нет GitHub токена",
          description: "Добавьте токен в настройках, чтобы создавать issue.",
        });
        return;
      }

      // Race-safe transition idle/error → creating: do the guard inside
      // the functional updater so a rapid double-click can't both pass
      // a stale "idle" snapshot and fire two parallel create requests.
      // `transitioned` is captured from the updater so we know whether
      // *this* call won the race.
      let transitioned = false;
      setActionStates((prev) => {
        const current = prev.get(finding.rule_id) ?? { kind: "idle" };
        if (
          current.kind === "creating" ||
          current.kind === "created" ||
          current.kind === "duplicate"
        ) {
          return prev;
        }
        transitioned = true;
        const m = new Map(prev);
        m.set(finding.rule_id, { kind: "creating" });
        return m;
      });
      if (!transitioned) return;

      const title = buildIssueTitle(finding);
      const labels = buildIssueLabels(finding);
      const body = buildIssueBody(
        finding,
        repo,
        report.classification,
        report.generated_at,
      );

      try {
        const existing = await findOpenIssueByTitle(token, GITHUB_OWNER, repo, title);
        if (existing) {
          setActionState(finding.rule_id, {
            kind: "duplicate",
            number: existing.number,
            url: existing.url,
          });
          toast.push({
            kind: "info",
            title: `Уже есть #${existing.number}`,
            description: { text: "Открыть issue", url: existing.url },
          });
          return;
        }

        const created = await createIssue(token, GITHUB_OWNER, repo, title, body, labels);

        // Best-effort: add to MakeIT Tracker (Project v2 #1). If this fails
        // the issue is already on GitHub, so we surface it as a warning toast
        // and keep the «created» state — the user shouldn't think the whole
        // operation failed.
        try {
          await addIssueToProject(token, GITHUB_OWNER, repo, created.number, GITHUB_PROJECT_NUMBER);
        } catch (projErr) {
          if (import.meta.env.DEV) {
            console.warn("[health] addIssueToProject failed:", projErr);
          }
          toast.push({
            kind: "info",
            title: `Issue #${created.number} создан, но не попал в трекер`,
            description: friendlyError(projErr),
          });
        }

        setActionState(finding.rule_id, {
          kind: "created",
          number: created.number,
          url: created.url,
        });
        toast.push({
          kind: "success",
          title: `Создан #${created.number}`,
          description: { text: "Открыть issue", url: created.url },
        });
      } catch (err) {
        const message = friendlyError(err);
        setActionState(finding.rule_id, { kind: "error", message });
        toast.push({
          kind: "error",
          title: "Не удалось создать issue",
          description: message,
        });
      }
    },
    // No `actionStates` here — the race guard reads via setActionStates(prev)
    // so the callback identity stays stable and FindingsBoard doesn't
    // re-render on every per-finding state mutation.
    [report, repo, setActionState, toast],
  );

  // ─── Edge states first ─────────────────────────────────────────────
  if (classificationMissing) {
    return (
      <div className="v4-content">
        <PageHeaderForState repo={repo} />
        <div className="ph-page">
          <div className="ph-main">
            <ClassificationMissing repo={repo} onRetry={refresh} />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="v4-content">
        <PageHeaderForState repo={repo} />
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
        <PageHeaderForState repo={repo} />
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
        <PageHeaderForState repo={repo} />
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
        onRescan={refresh}
        refreshing={refreshing}
        rulesCount={rulesCount}
        onBulkCreate={() => setBulkOpen(true)}
        onScanDrift={handleScanDrift}
        driftScanning={driftScanning}
        driftProgress={driftProgress}
        hasClaudeKey={hasClaudeKey}
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
                <b>Льготный период.</b> Проект младше {report.grace_period_days}{" "}
                {report.grace_period_days === 1
                  ? "дня"
                  : report.grace_period_days < 5
                    ? "дней"
                    : "дней"}{" "}
                — нарушения отображаются, но не штрафуют (кроме критических).
              </span>
            </div>
          )}
          <LayerStrip report={report} />
          <FindingsBoard
            report={report}
            actionStates={actionStates}
            onCreateIssue={handleCreateIssue}
            hasToken={!!getToken()}
          />
        </div>
        <Sidebar report={report} project={project} />
      </div>
      {bulkOpen && (
        <BulkCreateModal
          report={report}
          repo={repo}
          onClose={() => setBulkOpen(false)}
          onActionStateChange={setActionState}
        />
      )}
    </div>
  );
}

// Minimal header during edge states — repo name + Health label. Navigation
// back to the projects list is handled by the topbar breadcrumb.
function PageHeaderForState({ repo }: { repo: string }) {
  return (
    <section className="ph-hero-block">
      <div className="ph-hero-top">
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
