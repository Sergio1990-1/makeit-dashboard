import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useResearch } from "../../../hooks/useResearch";
import { useResearchAgent } from "../../../hooks/useResearchAgent";
import { StartResearchModal } from "../../StartResearchModal";
import { GITHUB_OWNER } from "../../../utils/config";
import { ResearchAgentBanner } from "./ResearchAgentBanner";
import { ResearchHero } from "./ResearchHero";
import { ResearchKpiStrip } from "./ResearchKpiStrip";
import { ResearchProjectCardV4 } from "./ResearchProjectCardV4";
import {
  applyFilter,
  applySearch,
  RESEARCH_FILTERS,
  type ResearchFilter,
} from "./utils";

interface Props {
  repos: string[];
}

const STORAGE_FILTER = "v4rsh:filter";

function readFilter(): ResearchFilter {
  try {
    const v = localStorage.getItem(STORAGE_FILTER);
    if (v === "all" || v === "withResearch" || v === "withDiscovery" || v === "noData" || v === "hasQuickWins") {
      return v;
    }
  } catch { /* ignore */ }
  return "all";
}

export function ResearchView({ repos }: Props) {
  const { projects, loading, refresh } = useResearch();
  const agent = useResearchAgent();
  const loadedRef = useRef(false);

  const [showModal, setShowModal] = useState(false);
  const [modalRepo, setModalRepo] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ResearchFilter>(() => readFilter());

  useEffect(() => {
    try { localStorage.setItem(STORAGE_FILTER, filter); } catch { /* ignore */ }
  }, [filter]);

  const { checkPipeline } = agent;
  useEffect(() => {
    if (!loadedRef.current && repos.length > 0) {
      loadedRef.current = true;
      refresh(repos);
      checkPipeline();
    }
  }, [repos, refresh, checkPipeline]);

  const visible = useMemo(() => {
    return applySearch(applyFilter(projects, filter), search);
  }, [projects, filter, search]);

  // useCallback so memoised cards don't re-render whenever the parent
  // ticks for unrelated state (agent status flips, search input).
  const handleOpenModal = useCallback((repo?: string) => {
    setModalRepo(repo);
    setShowModal(true);
  }, []);

  const handleStartResearch = useCallback(
    (project: string, description: string, region: string) => {
      setShowModal(false);
      agent.launchResearch({
        project,
        // Modal guarantees a non-empty description before calling onStart;
        // backend requires it (Field(..., min_length=1)).
        product_description: description,
        region: region || undefined,
      });
    },
    [agent],
  );

  const handleStartDiscovery = useCallback(
    (repo: string) => {
      agent.launchDiscovery(`${GITHUB_OWNER}/${repo}`);
    },
    [agent],
  );

  const handleLaunchResearchFromCard = useCallback(
    (repo: string) => {
      handleOpenModal(repo);
    },
    [handleOpenModal],
  );

  return (
    <div className="v4-content">
      <div className="v4-ph">
        <div>
          <h1>Research</h1>
          <div className="v4-sub">
            RESEARCH.md + DISCOVERY.md из репозиториев ·{" "}
            <span className="v4-pl-mono">{projects.length}</span> {projects.length === 1 ? "проект" : "проектов"}
          </div>
        </div>
      </div>

      <div style={{ height: 10 }} />

      <ResearchHero
        projects={projects}
        loading={loading}
        pipelineAvailable={agent.pipelineAvailable}
        onRefresh={() => refresh(repos)}
        onStart={() => handleOpenModal()}
      />

      {agent.error && (
        <div className="v4-error" style={{ marginTop: 14 }} role="alert">
          {agent.error}
        </div>
      )}

      {agent.activeRun && (
        <ResearchAgentBanner
          status={agent.activeRun}
          onDismiss={agent.clearActiveRun}
        />
      )}

      <ResearchKpiStrip projects={projects} />

      <div className="v4-au-toolbar">
        <div className="v4-mon-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            aria-label="Поиск по имени проекта"
            placeholder="Поиск по проекту…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="v4-pillgrp">
          {RESEARCH_FILTERS.map(({ key, label }) => (
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

      {loading && projects.length === 0 ? (
        <div className="v4-empty" style={{ marginTop: 14 }}>Загрузка данных из репозиториев…</div>
      ) : visible.length === 0 && projects.length === 0 ? (
        <div className="v4-panel">
          <div className="v4-rsh-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
              <path d="M11 8v6" />
              <path d="M8 11h6" />
            </svg>
            <h3>Research & Discovery</h3>
            <p>
              Анализ рынка, конкурентов и болевых точек пользователей.
              Research агент собирает данные и формирует RESEARCH.md,
              Discovery агент на их основе генерирует рекомендации в DISCOVERY.md.
            </p>
            <button
              type="button"
              className="v4-btn v4-btn--pri"
              onClick={() => handleOpenModal()}
              disabled={agent.pipelineAvailable === false}
            >
              Запустить Research
            </button>
          </div>
        </div>
      ) : visible.length === 0 ? (
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
        <>
          {/* Subtle inline indicator while a background refresh is running
              and we already have data to show. Keeps the list visible
              instead of swapping to a spinner. */}
          {loading && projects.length > 0 && (
            <div className="v4-rsh-refresh-hint v4-pl-mono v4-rsh-text-muted" role="status">
              Обновление…
            </div>
          )}
          <div className="v4-rsh-list">
            {visible.map((pr) => (
              <ResearchProjectCardV4
                key={pr.repo}
                pr={pr}
                agentStarting={agent.starting}
                onLaunchResearch={handleLaunchResearchFromCard}
                onLaunchDiscovery={handleStartDiscovery}
              />
            ))}
          </div>
        </>
      )}

      {showModal && (
        <StartResearchModal
          defaultRepo={modalRepo}
          onClose={() => setShowModal(false)}
          onStart={handleStartResearch}
          starting={agent.starting}
        />
      )}
    </div>
  );
}
