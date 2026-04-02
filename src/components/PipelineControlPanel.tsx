import { useState, useEffect } from "react";
import { usePipeline } from "../hooks/usePipeline";
import { GITHUB_OWNER, PROJECTS } from "../utils/config";

const LABEL_OPTIONS = ["P1-critical", "P2-high", "P3-medium"] as const;
type LabelOption = (typeof LABEL_OPTIONS)[number];

const STATUS_LABEL: Record<string, string> = {
  queued: "В очереди",
  in_progress: "В работе",
  pr_open: "PR открыт",
  in_review: "На ревью",
  retry: "Повтор",
  done: "✓ Готово",
  needs_human: "⚠ Ручное",
};

function statusClass(status: string): string {
  if (status === "done") return "pipeline-status-done";
  if (status === "needs_human") return "pipeline-status-human";
  return "pipeline-status-active";
}

export function PipelineControlPanel() {
  const { available, status, stats, error, starting, stopping, start, stop, refresh, loadStats } =
    usePipeline();

  const [selectedProject, setSelectedProject] = useState<string>(
    `${GITHUB_OWNER}/moliyakg`,
  );
  const [selectedLabels, setSelectedLabels] = useState<LabelOption[]>(["P1-critical", "P2-high"]);
  const [limit, setLimit] = useState(4);

  // Load stats whenever project changes and pipeline is idle
  useEffect(() => {
    if (available && selectedProject) void loadStats(selectedProject);
  }, [available, selectedProject, loadStats]);

  function toggleLabel(label: LabelOption) {
    setSelectedLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    );
  }

  function handleStart() {
    void start({
      project: selectedProject || undefined,
      labels: selectedLabels.length > 0 ? selectedLabels : undefined,
      limit,
    });
  }

  if (available === null) {
    return (
      <div className="bento-panel span-12 pipeline-panel">
        <div className="pipeline-loading">Подключение к pipeline...</div>
      </div>
    );
  }

  if (available === false) {
    return (
      <div className="bento-panel span-12 pipeline-panel">
        <div className="pipeline-offline-card">
          <h2 className="pipeline-offline-title">Pipeline недоступен</h2>
          <p className="pipeline-offline-desc">
            Запустите API сервер <code>makeit-pipeline</code> на порту <code>8766</code>:
          </p>
          <pre className="pipeline-offline-code">{`cd ~/Desktop/makeit-pipeline\nsource .venv/bin/activate\nuvicorn makeit_pipeline.api:create_app --factory --port 8766`}</pre>
          <button className="btn btn-primary" onClick={() => void refresh()}>
            Сервер запущен (Обновить)
          </button>
        </div>
      </div>
    );
  }

  const isRunning = status?.running ?? false;
  const isStopping = status?.stopping ?? false;

  return (
    <div className="bento-panel span-12 pipeline-panel">
      <div className="bento-panel-title">
        Pipeline
        <span className={`pipeline-indicator ${isRunning ? "pipeline-indicator--running" : "pipeline-indicator--idle"}`}>
          {isRunning ? (isStopping ? "Останавливается" : "Запущен") : "Простаивает"}
        </span>
      </div>

      <div className="pipeline-body">
        {/* Control form */}
        <section className="pipeline-form">
          <div className="pipeline-form-row">
            <label className="pipeline-label">Проект</label>
            <select
              className="pipeline-select"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              disabled={isRunning}
            >
              <option value="">Все проекты</option>
              {PROJECTS.map((p) => (
                <option key={p.repo} value={`${p.owner}/${p.repo}`}>
                  {p.repo}
                  {p.client !== "Свой проект" ? ` — ${p.client}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="pipeline-form-row">
            <label className="pipeline-label">Лейблы</label>
            <div className="pipeline-label-group">
              {LABEL_OPTIONS.map((label) => (
                <label key={label} className="pipeline-checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedLabels.includes(label)}
                    onChange={() => toggleLabel(label)}
                    disabled={isRunning}
                  />
                  <span className={`pipeline-badge pipeline-badge--${label.replace("-", "")}`}>
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="pipeline-form-row">
            <label className="pipeline-label">Лимит задач</label>
            <input
              type="number"
              className="pipeline-input-number"
              min={1}
              max={50}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(50, Number(e.target.value))))}
              disabled={isRunning}
            />
          </div>

          <div className="pipeline-form-actions">
            {!isRunning && (
              <button
                className="btn btn-primary pipeline-btn-start"
                onClick={handleStart}
                disabled={starting}
              >
                {starting ? "Запуск..." : "▶ Запустить"}
              </button>
            )}
            {isRunning && !isStopping && (
              <button
                className="btn pipeline-btn-stop"
                onClick={() => void stop()}
                disabled={stopping}
              >
                {stopping ? "Остановка..." : "■ Остановить"}
              </button>
            )}
            {isStopping && (
              <span className="pipeline-stopping-hint">
                Завершаем текущие задачи...
              </span>
            )}
          </div>

          {error && <div className="pipeline-error">{error}</div>}
        </section>

        {/* Stats */}
        {stats && (
          <section className="pipeline-stats">
            <div className="pipeline-stats-title">Статистика — {stats && selectedProject.split("/")[1]}</div>
            <div className="pipeline-stats-grid">
              <div className="pipeline-stat-card">
                <span className="pipeline-stat-value">{stats.total_issues}</span>
                <span className="pipeline-stat-label">Всего</span>
              </div>
              <div className="pipeline-stat-card">
                <span className="pipeline-stat-value pipeline-stat-value--green">{stats.agent_completed}</span>
                <span className="pipeline-stat-label">Pipeline</span>
              </div>
              <div className="pipeline-stat-card">
                <span className="pipeline-stat-value">{stats.manual_completed}</span>
                <span className="pipeline-stat-label">Вручную</span>
              </div>
              <div className="pipeline-stat-card">
                <span className="pipeline-stat-value">{stats.total_issues - stats.closed_issues}</span>
                <span className="pipeline-stat-label">Открыто</span>
              </div>
            </div>
          </section>
        )}

        {/* Active run info */}
        {isRunning && status && (
          <section className="pipeline-run-info">
            <div className="pipeline-run-header">
              <span>Активных задач: <strong>{status.active_tasks}</strong></span>
              {status.current_project && (
                <span className="pipeline-run-project">{status.current_project}</span>
              )}
            </div>

            {status.queue.length > 0 && (
              <div className="pipeline-queue">
                <div className="pipeline-queue-title">Очередь ({status.queue.length})</div>
                {status.queue.slice(0, 8).map((item) => (
                  <div key={item.number} className="pipeline-queue-item">
                    <span className="pipeline-queue-number">#{item.number}</span>
                    <span className="pipeline-queue-title-text">{item.title}</span>
                    <span className={`pipeline-queue-status ${statusClass(item.status)}`}>
                      {STATUS_LABEL[item.status] ?? item.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Results of last run */}
        {!isRunning && status && status.results.length > 0 && (
          <section className="pipeline-results">
            <div className="pipeline-results-title">
              Последний запуск — {status.results.length} задач
            </div>
            <div className="pipeline-results-list">
              {status.results.map((r) => (
                <div key={r.issue_number} className={`pipeline-result-row ${statusClass(r.status)}`}>
                  <span className="pipeline-result-number">#{r.issue_number}</span>
                  <span className={`pipeline-result-status pipeline-badge pipeline-badge--status-${r.status}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                  {r.pr_url && (
                    <a href={r.pr_url} target="_blank" rel="noreferrer" className="pipeline-result-pr">
                      PR →
                    </a>
                  )}
                  {r.retries > 0 && (
                    <span className="pipeline-result-retries">↻ {r.retries}</span>
                  )}
                  {r.error && (
                    <span className="pipeline-result-error" title={r.error}>⚠</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
