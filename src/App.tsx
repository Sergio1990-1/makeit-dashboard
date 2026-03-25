import { useEffect } from "react";
import { TokenForm } from "./components/TokenForm";
import { Summary } from "./components/Summary";
import { ProjectCard } from "./components/ProjectCard";
import { BlockedItems } from "./components/BlockedItems";
import { StackedChart } from "./components/StackedChart";
import { Filters } from "./components/Filters";
import { useDashboard } from "./hooks/useDashboard";
import { getToken } from "./utils/config";
import "./App.css";

function App() {
  const {
    projects,
    filteredIssues,
    summary,
    blockedIssues,
    loading,
    error,
    lastUpdated,
    filters,
    setFilters,
    refresh,
  } = useDashboard();

  useEffect(() => {
    if (getToken()) refresh();
  }, [refresh]);

  const hasToken = !!getToken();

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>MakeIT Dashboard</h1>
          {lastUpdated && (
            <span className="last-updated">
              Обновлено: {lastUpdated.toLocaleTimeString("ru-RU")}
            </span>
          )}
        </div>
        <div className="header-right">
          <TokenForm onTokenSet={refresh} />
          {hasToken && (
            <button onClick={refresh} disabled={loading} className="btn btn-primary">
              {loading ? "Загрузка..." : "Обновить"}
            </button>
          )}
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {!hasToken && (
        <div className="empty-state">
          <p>Укажите GitHub Token для начала работы</p>
        </div>
      )}

      {hasToken && projects.length > 0 && (
        <>
          <Summary metrics={summary} />

          <Filters filters={filters} onChange={setFilters} projects={projects} />

          <section className="projects-grid">
            {projects.map((p) => {
              const issues = filteredIssues(p);
              if (filters.priority || filters.status) {
                if (issues.length === 0) return null;
              }
              return <ProjectCard key={p.repo} project={{ ...p, issues }} />;
            })}
          </section>

          <StackedChart projects={projects} />

          <BlockedItems issues={blockedIssues} />
        </>
      )}

      {hasToken && !loading && projects.length === 0 && !error && (
        <div className="empty-state">
          <p>Нажмите «Обновить» для загрузки данных</p>
        </div>
      )}
    </div>
  );
}

export default App;
