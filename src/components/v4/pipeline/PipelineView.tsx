import { useEffect, useMemo, useRef, useState } from "react";
import { usePipeline } from "../../../hooks/usePipeline";
import { GITHUB_OWNER } from "../../../utils/config";
import {
  classifyIssues,
  type ClassifyProgress,
  type ClassifyResponse,
  type ComplexityFilter,
  type PipelineResult,
} from "../../../utils/pipeline";
import type { ProjectData } from "../../../types";
import { IssueTimeline } from "../../IssueTimeline";
import { QualityPanel } from "../../QualityPanel";
import { ConfigPanel, type LabelOption } from "./ConfigPanel";
import { PipelineHero } from "./PipelineHero";
import { PipelineKpiStrip } from "./PipelineKpiStrip";
import { PipelineActiveTasksBlock } from "../../PipelineActiveTasksBlock";
import { PipelineResults } from "./PipelineResults";
import { PipelineComplexityPanel } from "./PipelineComplexityPanel";
import { PipelineClosedChartV4 } from "./PipelineClosedChartV4";
import { ClassifyDialog } from "./ClassifyDialog";
import { sumCost } from "./utils";

interface Props {
  projects: ProjectData[];
  lastUpdated: Date | null;
}

const STORAGE = {
  project: "pipeline_project",
  labels: "pipeline_labels",
  limit: "pipeline_limit",
  complexity: "pipeline_complexity",
  configOpen: "pipeline_v4_config_open",
};

export function PipelineView({ projects, lastUpdated }: Props) {
  const {
    available,
    status,
    stats,
    error,
    starting,
    stopping,
    start,
    stop,
    refresh,
    loadStats,
  } = usePipeline();

  const [selectedProject, setSelectedProject] = useState<string>(
    () => localStorage.getItem(STORAGE.project) || `${GITHUB_OWNER}/moliyakg`
  );
  const [selectedLabels, setSelectedLabels] = useState<LabelOption[]>(() => {
    try {
      const s = localStorage.getItem(STORAGE.labels);
      if (s) return JSON.parse(s) as LabelOption[];
    } catch {
      /* ignore */
    }
    return ["P1-critical", "P2-high"];
  });
  const [limit, setLimit] = useState<number>(() => Number(localStorage.getItem(STORAGE.limit)) || 4);
  const [complexityFilter, setComplexityFilter] = useState<ComplexityFilter>(() => {
    const stored = localStorage.getItem(STORAGE.complexity);
    const valid: ComplexityFilter[] = ["auto", "assisted", "all"];
    return stored && valid.includes(stored as ComplexityFilter)
      ? (stored as ComplexityFilter)
      : "all";
  });
  const [configOpen, setConfigOpen] = useState<boolean>(() => {
    const s = localStorage.getItem(STORAGE.configOpen);
    return s === null ? true : s === "1";
  });

  useEffect(() => { localStorage.setItem(STORAGE.project, selectedProject); }, [selectedProject]);
  useEffect(() => { localStorage.setItem(STORAGE.labels, JSON.stringify(selectedLabels)); }, [selectedLabels]);
  useEffect(() => { localStorage.setItem(STORAGE.limit, String(limit)); }, [limit]);
  useEffect(() => { localStorage.setItem(STORAGE.complexity, complexityFilter); }, [complexityFilter]);
  useEffect(() => { localStorage.setItem(STORAGE.configOpen, configOpen ? "1" : "0"); }, [configOpen]);

  function toggleLabel(label: LabelOption) {
    setSelectedLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  }

  // Stats loading
  useEffect(() => {
    if (available && selectedProject) void loadStats(selectedProject);
  }, [available, selectedProject, loadStats]);

  const running = status?.running ?? false;
  useEffect(() => {
    if (!selectedProject) return;
    const interval = running ? 10_000 : 30_000;
    const id = setInterval(() => void loadStats(selectedProject), interval);
    return () => clearInterval(id);
  }, [running, selectedProject, loadStats]);

  // Run tracking — wall-clock timestamp when the current run started, used by
  // the hero card for live elapsed and for grouping results.
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  // Snapshot of result count at the moment the run started — anything beyond
  // this index in the current results array belongs to the current run. Kept
  // as state (not ref) so the cost memo sees the right value in the same
  // render commit cycle when a new run starts.
  const [baselineResultCount, setBaselineResultCount] = useState(0);
  // Last completed run summary (shown when idle).
  const [lastRunSummary, setLastRunSummary] = useState<{
    done: number;
    failed: number;
    finishedAt: number | null;
  } | null>(null);
  const wasRunningRef = useRef<boolean>(false);

  useEffect(() => {
    if (!status) return;
    if (status.running && !wasRunningRef.current) {
      // New run started — set baseline BEFORE the cost memo sees the next status
      setRunStartedAt(Date.now());
      setBaselineResultCount(status.results.length);
    } else if (!status.running && wasRunningRef.current) {
      // Run ended — snapshot summary using the baseline that was set on start
      const newResults = status.results.slice(baselineResultCount);
      const done = newResults.filter((r) => r.status === "done").length;
      const failed = newResults.filter(
        (r) => r.status !== "done" && r.status !== "queued" && r.status !== "in_progress"
      ).length;
      setLastRunSummary({ done, failed, finishedAt: Date.now() });
      setRunStartedAt(null);
    }
    wasRunningRef.current = status.running;
  }, [status, baselineResultCount]);

  // Aggregate cost of the current run
  const currentRunCost = useMemo(() => {
    if (!status || runStartedAt === null) return 0;
    return sumCost(status.results.slice(baselineResultCount));
  }, [status, runStartedAt, baselineResultCount]);

  // Session metrics — sum across the current API status payload (not strictly today).
  const { sessionCost, sessionRuns } = useMemo(() => {
    if (!status) return { sessionCost: 0, sessionRuns: 0 };
    const cost = sumCost(status.results);
    const runs = status.results.length > 0 ? 1 : 0;
    const total = runs + (status.running && runStartedAt ? 1 : 0);
    return { sessionCost: cost, sessionRuns: total };
  }, [status, runStartedAt]);

  // Classify dialog
  const [classifyDialogOpen, setClassifyDialogOpen] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [classifyProgress, setClassifyProgress] = useState<ClassifyProgress | null>(null);
  const [classifyResult, setClassifyResult] = useState<ClassifyResponse | null>(null);
  const [classifyError, setClassifyError] = useState<string | null>(null);

  async function handleClassify() {
    if (!selectedProject || classifying) return;
    setClassifyDialogOpen(true);
    setClassifying(true);
    setClassifyProgress(null);
    setClassifyResult(null);
    setClassifyError(null);
    try {
      const res = await classifyIssues(selectedProject, undefined, (p) => {
        setClassifyProgress(p);
      });
      setClassifyResult(res);
      if (res.classified > 0) void loadStats(selectedProject);
    } catch (e) {
      setClassifyError(e instanceof Error ? e.message : String(e));
    } finally {
      setClassifying(false);
    }
  }

  function closeClassifyDialog() {
    setClassifyDialogOpen(false);
    setClassifyProgress(null);
    setClassifyResult(null);
    setClassifyError(null);
  }

  // Timeline modal
  const [timelineIssue, setTimelineIssue] = useState<number | null>(null);

  function handleStart() {
    void start({
      project: selectedProject || undefined,
      labels: selectedLabels.length > 0 ? selectedLabels : undefined,
      limit,
      complexity_filter: complexityFilter !== "all" ? complexityFilter : undefined,
    });
  }

  // Project label for hero (shorthand without owner)
  const selectedProjectLabel = selectedProject
    ? selectedProject.split("/").pop()
    : "Все проекты";

  const unclassifiedCount = stats?.complexity_breakdown?.unclassified ?? 0;

  // Filter results to display: hide queued/in_progress entries (they show in
  // active tasks panel, not here)
  const displayResults: PipelineResult[] = useMemo(() => {
    if (!status) return [];
    return status.results.filter((r) => r.status !== "queued" && r.status !== "in_progress");
  }, [status]);

  return (
    <div className="v4-content">
      <div className="v4-ph">
        <div>
          <h1>Pipeline</h1>
          <div className="v4-sub">
            {available === true ? "API подключен" : available === false ? "API офлайн" : "Подключение…"}
            {selectedProjectLabel && (
              <>
                {" · "}
                <span className="v4-pl-mono">{selectedProjectLabel}</span>
              </>
            )}
          </div>
        </div>
        <div className="v4-ph-right">
          {available === false && (
            <button type="button" className="v4-btn v4-btn--pri" onClick={() => void refresh()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 11-6.22-8.56" />
                <path d="M21 3v6h-6" />
              </svg>
              Подключиться
            </button>
          )}
        </div>
      </div>

      <div style={{ height: 10 }} />

      <PipelineHero
        available={available}
        status={status}
        starting={starting}
        stopping={stopping}
        runStartedAt={runStartedAt}
        currentRunCost={currentRunCost}
        lastRunSummary={lastRunSummary ?? undefined}
        onStart={handleStart}
        onStop={() => void stop()}
        onConfigToggle={() => setConfigOpen((v) => !v)}
        configOpen={configOpen}
        startDisabled={starting}
        selectedProjectLabel={selectedProjectLabel ?? undefined}
      />

      {available === true && (
        <ConfigPanel
          open={configOpen}
          disabled={running}
          selectedProject={selectedProject}
          setSelectedProject={setSelectedProject}
          selectedLabels={selectedLabels}
          toggleLabel={toggleLabel}
          complexityFilter={complexityFilter}
          setComplexityFilter={setComplexityFilter}
          limit={limit}
          setLimit={setLimit}
          unclassifiedCount={unclassifiedCount}
          classifying={classifying}
          onClassify={() => void handleClassify()}
        />
      )}

      {error && <div className="v4-error" style={{ marginTop: 14 }}>{error}</div>}

      {available === true && (
        <>
          <PipelineKpiStrip stats={stats} sessionCost={sessionCost} sessionRuns={sessionRuns} />

          <div className="v4-grid">
            {running && status ? (
              <PipelineActiveTasksBlock status={status} />
            ) : (
              <div className="v4-panel">
                <div className="v4-panel-h">
                  <div className="v4-panel-t">
                    Активные задачи <span className="v4-tag">idle</span>
                  </div>
                </div>
                <div className="v4-empty">Pipeline не запущен. Нажмите «Запустить» чтобы стартовать.</div>
              </div>
            )}
            <PipelineClosedChartV4 projects={projects} lastUpdated={lastUpdated} />
          </div>

          <PipelineResults
            results={displayResults}
            currentRunStartedAt={runStartedAt}
            onTimelineClick={(n) => setTimelineIssue(n)}
          />

          <div className="v4-grid">
            <PipelineComplexityPanel stats={stats} />
            {selectedProject && (
              <div className="v4-panel v4-pl-quality-wrap">
                <QualityPanel project={selectedProject} />
              </div>
            )}
          </div>
        </>
      )}

      {/* Modals */}
      {timelineIssue !== null && selectedProject && (
        <IssueTimeline
          repo={selectedProject}
          issueNumber={timelineIssue}
          onClose={() => setTimelineIssue(null)}
        />
      )}
      <ClassifyDialog
        open={classifyDialogOpen}
        classifying={classifying}
        progress={classifyProgress}
        result={classifyResult}
        error={classifyError}
        onClose={closeClassifyDialog}
      />
    </div>
  );
}
