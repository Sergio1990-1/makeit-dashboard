import { useEffect, useMemo, useState } from "react";
import type { Monitor, MonitorStatus } from "../../../types";
import { getWorkerUrl } from "../../../utils/config";
import { MonitoringHero } from "./MonitoringHero";
import { MonitoringKpiStrip } from "./MonitoringKpiStrip";
import { MonitorCard } from "./MonitorCard";
import { MonitoringSetup } from "./MonitoringSetup";
import { getProjectName, STATUS_LABEL, STATUS_RANK } from "./utils";

interface Props {
  monitors: Monitor[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

type StatusFilter = "all" | MonitorStatus;
type GroupBy = "none" | "project";

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "Все" },
  { key: "down", label: STATUS_LABEL.down },
  { key: "up", label: STATUS_LABEL.up },
  { key: "paused", label: STATUS_LABEL.paused },
];

const STORAGE = {
  status: "v4mon:status",
  group: "v4mon:group",
};

function readStatus(): StatusFilter {
  try {
    const v = localStorage.getItem(STORAGE.status);
    if (v === "all" || v === "up" || v === "down" || v === "paused" || v === "pending") {
      return v;
    }
  } catch {
    /* ignore */
  }
  return "all";
}

function readGroup(): GroupBy {
  try {
    const v = localStorage.getItem(STORAGE.group);
    if (v === "none" || v === "project") return v;
  } catch {
    /* ignore */
  }
  return "none";
}

export function MonitoringView({ monitors, loading, error, onRefresh }: Props) {
  // Re-render gate for the worker-URL setup screen. Toggling this triggers a
  // refresh in the parent's useMonitors effect via getWorkerUrl() change.
  const [hasWorker, setHasWorker] = useState(() => !!getWorkerUrl());

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => readStatus());
  const [group, setGroup] = useState<GroupBy>(() => readGroup());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE.status, statusFilter);
    } catch {
      /* ignore */
    }
  }, [statusFilter]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE.group, group);
    } catch {
      /* ignore */
    }
  }, [group]);

  // Frozen "now" — refreshed every 30s and snapped to the current time
  // whenever the monitors array identity changes (i.e. after a refresh).
  // Microtask defer satisfies react-hooks/set-state-in-effect, which fires
  // on synchronous setState in useEffect bodies.
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
  }, [monitors]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return monitors.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (q) {
        const inName = m.name.toLowerCase().includes(q);
        const inUrl = m.url.toLowerCase().includes(q);
        const project = (getProjectName(m) ?? "").toLowerCase();
        const inProject = project.includes(q);
        if (!inName && !inUrl && !inProject) return false;
      }
      return true;
    });
  }, [monitors, statusFilter, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const ra = STATUS_RANK[a.status];
      const rb = STATUS_RANK[b.status];
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name, "ru");
    });
    return arr;
  }, [filtered]);

  const grouped = useMemo(() => {
    if (group !== "project") return null;
    const map = new Map<string, Monitor[]>();
    for (const m of sorted) {
      const p = getProjectName(m) ?? "Прочее";
      const arr = map.get(p) ?? [];
      arr.push(m);
      map.set(p, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, "ru"));
  }, [sorted, group]);

  if (!hasWorker) {
    return (
      <div className="v4-content">
        <div className="v4-ph">
          <div>
            <h1>Мониторинг</h1>
            <div className="v4-sub">Better Stack uptime · подключение не настроено</div>
          </div>
        </div>
        <div style={{ height: 10 }} />
        <MonitoringSetup
          onSaved={() => {
            setHasWorker(true);
            onRefresh();
          }}
        />
      </div>
    );
  }

  return (
    <div className="v4-content">
      <div className="v4-ph">
        <div>
          <h1>Мониторинг</h1>
          <div className="v4-sub">
            Better Stack uptime ·{" "}
            <span className="v4-pl-mono">{monitors.length}</span> {monitors.length === 1 ? "монитор" : "мониторов"}
          </div>
        </div>
      </div>

      <div style={{ height: 10 }} />

      <MonitoringHero
        monitors={monitors}
        loading={loading}
        onRefresh={onRefresh}
        nowMs={nowMs}
      />

      {error && <div className="v4-error" style={{ marginTop: 14 }}>{error}</div>}

      <MonitoringKpiStrip monitors={monitors} />

      <div className="v4-mon-toolbar">
        <div className="v4-mon-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            placeholder="Поиск по имени, url, проекту…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="v4-pillgrp">
          {STATUS_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={statusFilter === key ? "is-active" : ""}
              onClick={() => setStatusFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="v4-pillgrp">
          <button
            type="button"
            className={group === "none" ? "is-active" : ""}
            onClick={() => setGroup("none")}
          >
            Список
          </button>
          <button
            type="button"
            className={group === "project" ? "is-active" : ""}
            onClick={() => setGroup("project")}
          >
            По проектам
          </button>
        </div>
      </div>

      {monitors.length === 0 && !loading && !error ? (
        <div className="v4-panel">
          <div className="v4-empty">Мониторы не найдены. Проверьте настройку воркера.</div>
        </div>
      ) : sorted.length === 0 ? (
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
      ) : grouped ? (
        <div className="v4-mon-groups">
          {grouped.map(([project, items]) => (
            <div key={project} className="v4-mon-group">
              <div className="v4-mon-group-h">
                <span className="v4-mon-group-name">{project}</span>
                <span className="v4-pl-mono v4-mon-text-muted">
                  {items.length} {items.length === 1 ? "монитор" : "мониторов"}
                </span>
              </div>
              <div className="v4-mon-grid">
                {items.map((m) => (
                  <MonitorCard key={m.id} monitor={m} nowMs={nowMs} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="v4-mon-grid">
          {sorted.map((m) => (
            <MonitorCard key={m.id} monitor={m} nowMs={nowMs} />
          ))}
        </div>
      )}
    </div>
  );
}
