import { useEffect, useMemo, useState } from "react";
import type { PulseEvent, PulseSource } from "../../../../types/hub";
import { Icon, type IconName } from "../../health/Icon";
import { markVisited, getLastVisited } from "../../../../utils/lastVisitedStore";
import { aggregatePulse } from "../../../../utils/activityPulseAggregator";
import {
  fetchOpenPullRequests,
  type OpenPullRequest,
} from "../../../../utils/github";
import { usePipeline } from "../../../../hooks/usePipeline";
import { PulseTimeline } from "../PulseTimeline";

interface Props {
  /** Repo whose Activity is being viewed — keys the lastVisited store. */
  repo: string;
  /** Called after `markVisited` so the parent can drop the inbox badge to 0. */
  onVisited: () => void;
}

/** All pulse sources, in chip display order. */
const SOURCES: readonly PulseSource[] = [
  "github",
  "pipeline",
  "transcript",
  "audit",
] as const;

const SOURCE_LABEL: Record<PulseSource, string> = {
  github: "GitHub",
  pipeline: "Pipeline",
  transcript: "Транскрипт",
  audit: "Аудит",
};

/**
 * Pulse window matches the aggregator's own 30-day floor. `aggregatePulse`
 * clamps `since` to `max(since, now − 30d)` regardless, so this is just an
 * explicit, honest lower bound rather than a magic `""`.
 */
const PULSE_WINDOW_DAYS = 30;

/**
 * One async section's resolved value, tagged with the `repo` it was loaded
 * for. The public `data` / `loading` are *derived* from whether the stored
 * key still matches the current `repo` — so a `repo` change instantly reads
 * as "loading" with no synchronous setState-in-effect (forbidden by
 * `react-hooks/set-state-in-effect`). Same idle-derivation pattern as
 * `useProjectHub`'s `Resolved<T>` / `deriveSection`.
 */
interface Resolved<T> {
  key: string;
  data: T;
}

/**
 * Activity tab (Epic-011 Task-07) — final assembly. Four stacked sections:
 *
 *   1. Inbox        — pulse events newer than this device's last Activity
 *                     visit for `repo`, highlighted. Computed against the
 *                     last-visited timestamp captured *before* the
 *                     markVisited effect runs (see `visitCutoff`), so the
 *                     unread set is stable for this open.
 *   2. Pulse        — `<PulseTimeline>` with source filter chips. Chips are
 *                     tab-local state (NOT persisted) and filter the already
 *                     loaded events client-side — no refetch.
 *   3. Open PRs     — open pull requests from GitHub (≤20, newest-updated).
 *   4. Open Runs    — currently-*running* pipeline tasks (via usePipeline).
 *
 * Data is fetched here (self-contained, like HealthTab) rather than through
 * useProjectHub: `aggregatePulse` owns its own 5-min sessionStorage cache
 * and `usePipeline` owns its own polling lifecycle, so threading either
 * through the Hub aggregate would duplicate that machinery for no gain.
 *
 * The markVisited/onVisited effect is preserved verbatim from the Epic-009
 * stub: on mount we `markVisited(repo)` then `onVisited()` so the Inbox
 * renders its unread set at least once before the badge clears.
 */
export function ActivityTab({ repo, onVisited }: Props) {
  // Capture "last visited" ONCE, synchronously at mount, before the
  // markVisited effect overwrites it — this is the cutoff the Inbox unread
  // set is computed against, so the section is stable for the whole visit
  // and doesn't empty itself the instant the effect fires. A lazy useState
  // initializer (not a ref read in render) keeps this lint-clean and the
  // value frozen for the component's lifetime; `repo` does not change for a
  // mounted Hub (a different project remounts ProjectHubPage's subtree).
  const [visitCutoff] = useState<string | null>(() => getLastVisited(repo));

  useEffect(() => {
    markVisited(repo);
    onVisited();
  }, [repo, onVisited]);

  // ── Pulse ────────────────────────────────────────────────────────────
  // aggregatePulse never throws (per its contract: a failing source
  // degrades to empty); still guarded so a rejected promise can't escape
  // into render. The effect only ever commits a *resolved* value tagged
  // with the `repo` it loaded for; `loading` is derived (key mismatch =
  // still loading) so there's no synchronous setState in the effect.
  // `cancelled` drops a late resolve after repo-change / unmount.
  const [pulseResolved, setPulseResolved] =
    useState<Resolved<PulseEvent[]> | null>(null);
  useEffect(() => {
    const key = repo;
    let cancelled = false;
    const since = new Date(
      Date.now() - PULSE_WINDOW_DAYS * 86_400_000,
    ).toISOString();
    void aggregatePulse(repo, since)
      .then((events) => {
        if (cancelled) return;
        setPulseResolved({ key, data: events });
      })
      .catch(() => {
        if (cancelled) return;
        setPulseResolved({ key, data: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [repo]);
  const pulseFresh = pulseResolved !== null && pulseResolved.key === repo;
  const pulse = useMemo<PulseEvent[]>(
    () => (pulseFresh ? (pulseResolved?.data ?? []) : []),
    [pulseFresh, pulseResolved],
  );
  const pulseLoading = !pulseFresh;

  // ── Open PRs ─────────────────────────────────────────────────────────
  // fetchOpenPullRequests degrades to [] on any failure (no token / network
  // / GraphQL error), so the section just shows its empty state. Same
  // tagged-store / derived-loading pattern as pulse above.
  const [prsResolved, setPrsResolved] =
    useState<Resolved<OpenPullRequest[]> | null>(null);
  useEffect(() => {
    const key = repo;
    let cancelled = false;
    void fetchOpenPullRequests(repo)
      .then((list) => {
        if (cancelled) return;
        setPrsResolved({ key, data: list });
      })
      .catch(() => {
        if (cancelled) return;
        setPrsResolved({ key, data: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [repo]);
  const prsFresh = prsResolved !== null && prsResolved.key === repo;
  const prs = useMemo<OpenPullRequest[]>(
    () => (prsFresh ? (prsResolved?.data ?? []) : []),
    [prsFresh, prsResolved],
  );
  const prsLoading = !prsFresh;

  // ── Open pipeline runs ───────────────────────────────────────────────
  // usePipeline owns its own polling + backoff; we only read its status and
  // filter to in-flight runs. The feed is global (not repo-scoped), so this
  // mirrors the aggregator's pipeline source: surface runs whose status is
  // "running" (a running task genuinely is happening now).
  const { status: pipelineStatus } = usePipeline();
  const runningRuns = useMemo(
    () =>
      (pipelineStatus?.results ?? []).filter((r) => r.status === "running"),
    [pipelineStatus],
  );

  // ── Inbox (unread) ───────────────────────────────────────────────────
  // Events strictly newer than the pre-visit cutoff. Never-visited
  // (`null`) → empty inbox, NOT the whole history (mirrors
  // lastVisitedStore.unreadCount's first-open contract).
  const unread = useMemo<PulseEvent[]>(() => {
    if (visitCutoff === null) return [];
    const cutoffMs = Date.parse(visitCutoff);
    if (Number.isNaN(cutoffMs)) return [];
    return pulse.filter((ev) => {
      const t = Date.parse(ev.timestamp);
      return !Number.isNaN(t) && t > cutoffMs;
    });
  }, [pulse, visitCutoff]);

  // ── Source filter chips (tab-local, not persisted) ───────────────────
  // `null` = "all"; otherwise the single selected source. The timeline is
  // filtered client-side from the already-loaded `pulse` — toggling a chip
  // never refetches.
  const [sourceFilter, setSourceFilter] = useState<PulseSource | null>(null);
  const filteredPulse = useMemo(
    () =>
      sourceFilter === null
        ? pulse
        : pulse.filter((ev) => ev.source === sourceFilter),
    [pulse, sourceFilter],
  );

  return (
    <div className="v4-hub-activity">
      {/* 1 ── Inbox ─────────────────────────────────────────────────── */}
      <section
        className="v4-hub-activity-section v4-hub-activity-inbox"
        aria-labelledby="v4-hub-activity-inbox-title"
      >
        <header className="v4-hub-activity-head">
          <span className="v4-hub-activity-ic" aria-hidden="true">
            <Icon name="bell" />
          </span>
          <h2
            className="v4-hub-activity-title"
            id="v4-hub-activity-inbox-title"
          >
            Inbox
            {unread.length > 0 ? (
              <span className="v4-hub-activity-count">{unread.length}</span>
            ) : null}
          </h2>
        </header>
        {unread.length > 0 ? (
          <ul className="v4-hub-activity-inbox-list">
            {unread.map((ev) => (
              <li
                key={`${ev.source}:${ev.id}`}
                className="v4-hub-activity-inbox-item"
              >
                <span className="v4-hub-activity-inbox-src">
                  {SOURCE_LABEL[ev.source]}
                </span>
                <span className="v4-hub-activity-inbox-title">
                  {ev.title}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <ActivityEmpty
            icon="check-big"
            text={
              pulseLoading
                ? "Загрузка событий…"
                : "Новых событий с прошлого визита нет."
            }
          />
        )}
      </section>

      {/* 2 ── Pulse Timeline + source chips ──────────────────────────── */}
      <section
        className="v4-hub-activity-section"
        aria-labelledby="v4-hub-activity-pulse-title"
      >
        <header className="v4-hub-activity-head">
          <span className="v4-hub-activity-ic" aria-hidden="true">
            <Icon name="trend" />
          </span>
          <h2
            className="v4-hub-activity-title"
            id="v4-hub-activity-pulse-title"
          >
            Активность
          </h2>
        </header>
        <div
          className="v4-hub-activity-chips"
          role="group"
          aria-label="Фильтр по источнику"
        >
          <button
            type="button"
            className={`v4-hub-activity-chip${
              sourceFilter === null ? " v4-hub-activity-chip--on" : ""
            }`}
            aria-pressed={sourceFilter === null}
            onClick={() => setSourceFilter(null)}
          >
            Все
          </button>
          {SOURCES.map((src) => (
            <button
              key={src}
              type="button"
              className={`v4-hub-activity-chip${
                sourceFilter === src ? " v4-hub-activity-chip--on" : ""
              }`}
              aria-pressed={sourceFilter === src}
              onClick={() =>
                setSourceFilter((cur) => (cur === src ? null : src))
              }
            >
              {SOURCE_LABEL[src]}
            </button>
          ))}
        </div>
        {pulseLoading ? (
          <ActivityEmpty icon="clock" text="Загрузка активности…" />
        ) : (
          <PulseTimeline events={filteredPulse} />
        )}
      </section>

      {/* 3 ── Open PRs ───────────────────────────────────────────────── */}
      <section
        className="v4-hub-activity-section"
        aria-labelledby="v4-hub-activity-prs-title"
      >
        <header className="v4-hub-activity-head">
          <span className="v4-hub-activity-ic" aria-hidden="true">
            <Icon name="git-branch" />
          </span>
          <h2
            className="v4-hub-activity-title"
            id="v4-hub-activity-prs-title"
          >
            Открытые PR
            {prs.length > 0 ? (
              <span className="v4-hub-activity-count">{prs.length}</span>
            ) : null}
          </h2>
        </header>
        {prs.length > 0 ? (
          <ul className="v4-hub-activity-pr-list">
            {prs.map((pr) => (
              <li key={pr.number} className="v4-hub-activity-pr-item">
                <a
                  className="v4-hub-activity-pr-link"
                  href={pr.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="v4-hub-activity-pr-num">
                    #{pr.number}
                  </span>
                  <span className="v4-hub-activity-pr-title">
                    {pr.title}
                  </span>
                  {pr.isDraft ? (
                    <span className="v4-hub-activity-pr-badge">draft</span>
                  ) : null}
                  {pr.author ? (
                    <span className="v4-hub-activity-pr-author">
                      @{pr.author}
                    </span>
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <ActivityEmpty
            icon="check"
            text={
              prsLoading ? "Загрузка PR…" : "Открытых PR нет."
            }
          />
        )}
      </section>

      {/* 4 ── Open pipeline runs ─────────────────────────────────────── */}
      <section
        className="v4-hub-activity-section"
        aria-labelledby="v4-hub-activity-runs-title"
      >
        <header className="v4-hub-activity-head">
          <span className="v4-hub-activity-ic" aria-hidden="true">
            <Icon name="cpu" />
          </span>
          <h2
            className="v4-hub-activity-title"
            id="v4-hub-activity-runs-title"
          >
            Pipeline в работе
            {runningRuns.length > 0 ? (
              <span className="v4-hub-activity-count">
                {runningRuns.length}
              </span>
            ) : null}
          </h2>
        </header>
        {runningRuns.length > 0 ? (
          <ul className="v4-hub-activity-run-list">
            {runningRuns.map((run) => {
              const verdict =
                run.outcome ?? run.phase_status ?? run.status;
              return (
                <li
                  key={run.issue_number}
                  className="v4-hub-activity-run-item"
                >
                  {run.pr_url ? (
                    <a
                      className="v4-hub-activity-run-link"
                      href={run.pr_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="v4-hub-activity-run-num">
                        #{run.issue_number}
                      </span>
                      <span className="v4-hub-activity-run-status">
                        {verdict}
                      </span>
                    </a>
                  ) : (
                    <span className="v4-hub-activity-run-plain">
                      <span className="v4-hub-activity-run-num">
                        #{run.issue_number}
                      </span>
                      <span className="v4-hub-activity-run-status">
                        {verdict}
                      </span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <ActivityEmpty
            icon="check"
            text="Сейчас pipeline-задач в работе нет."
          />
        )}
      </section>
    </div>
  );
}

export default ActivityTab;

interface ActivityEmptyProps {
  icon: IconName;
  text: string;
}

/** Scoped per-section empty state — keeps a section visible (never collapses
 *  to nothing) even when its source is empty or still loading. */
function ActivityEmpty({ icon, text }: ActivityEmptyProps) {
  return (
    <div className="v4-hub-activity-empty">
      <span className="v4-hub-activity-empty-ic" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <p className="v4-hub-activity-empty-text">{text}</p>
    </div>
  );
}
