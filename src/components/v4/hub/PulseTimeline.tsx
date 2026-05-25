import { useMemo } from "react";
import type { PulseEvent, PulseSource } from "../../../types/hub";
import { Icon, type IconName } from "../health/Icon";

/**
 * Activity Pulse vertical timeline (Epic-011 Task-06).
 *
 * Pure presentation: events come pre-merged & sorted newest-first from
 * `aggregatePulse` (via `useProjectHub` once Task-07 wires the tab). The
 * list is grouped by relative day ("Сегодня" / "Вчера" / "N дней назад")
 * and each row carries a per-source icon. Clicking a row opens its `url`
 * in a new tab (no-op when the event has no url). Empty state is built in.
 *
 * Not yet mounted in the Hub layout (ActivityTab assembly is Task-07);
 * until then it is exercised by type-check / lint / build only.
 */

interface Props {
  events: PulseEvent[];
}

/** Per-source icon — reuses the shared Health icon set. */
const SOURCE_ICON: Record<PulseSource, IconName> = {
  github: "git-branch",
  pipeline: "cpu",
  transcript: "book",
  audit: "audit",
};

/** Short human label for the source badge. */
const SOURCE_LABEL: Record<PulseSource, string> = {
  github: "GitHub",
  pipeline: "Pipeline",
  transcript: "Транскрипт",
  audit: "Аудит",
};

/**
 * Relative-day bucket label for an ISO timestamp. Day boundaries are
 * compared in local time (midnight-to-midnight), so an event at 23:59
 * yesterday reads "Вчера", not "0 дней назад".
 */
function dayLabel(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "Без даты";
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round(
    (startOfDay(new Date()) - startOfDay(new Date(t))) / 86_400_000,
  );
  if (diffDays <= 0) return "Сегодня";
  if (diffDays === 1) return "Вчера";
  return `${diffDays} дней назад`;
}

/** `14:05` time-of-day for the row, or empty string for a bad timestamp. */
function timeLabel(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function openEvent(url?: string): void {
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

interface DayGroup {
  label: string;
  events: PulseEvent[];
}

/** Group an already-sorted (newest-first) list into ordered day buckets. */
function groupByDay(events: PulseEvent[]): DayGroup[] {
  const groups: DayGroup[] = [];
  let current: DayGroup | null = null;
  for (const ev of events) {
    const label = dayLabel(ev.timestamp);
    if (!current || current.label !== label) {
      current = { label, events: [] };
      groups.push(current);
    }
    current.events.push(ev);
  }
  return groups;
}

export function PulseTimeline({ events }: Props) {
  const groups = useMemo(() => groupByDay(events), [events]);

  if (events.length === 0) {
    return (
      <div
        style={{
          padding: 16,
          border: "1px dashed var(--mk-line)",
          borderRadius: 10,
          color: "var(--mk-ink-500)",
          fontSize: 13,
        }}
      >
        Активности за последние 30 дней нет. Сделай коммит, запусти pipeline
        или загрузи транскрипт — события появятся здесь.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {groups.map((group) => (
        <section key={group.label}>
          <h4
            style={{
              fontSize: 12,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--mk-ink-500)",
              margin: "0 0 8px",
            }}
          >
            {group.label}
          </h4>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              // Vertical timeline rail.
              borderLeft: "2px solid var(--mk-line-soft)",
              paddingLeft: 14,
            }}
          >
            {group.events.map((ev) => {
              const clickable = Boolean(ev.url);
              return (
                <li
                  key={`${ev.source}:${ev.id}`}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => openEvent(ev.url) : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openEvent(ev.url);
                          }
                        }
                      : undefined
                  }
                  title={clickable ? "Открыть в новой вкладке" : undefined}
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: 10,
                    border: "1px solid var(--mk-line-soft)",
                    borderRadius: 8,
                    cursor: clickable ? "pointer" : "default",
                    background: "transparent",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      fontSize: 16,
                      lineHeight: "20px",
                      color: "var(--mk-ink-500)",
                      flexShrink: 0,
                    }}
                  >
                    <Icon name={SOURCE_ICON[ev.source]} />
                  </span>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--mk-ink-900)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {ev.title}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 11,
                        color: "var(--mk-ink-500)",
                      }}
                    >
                      <span
                        style={{
                          padding: "1px 7px",
                          borderRadius: 999,
                          background: "var(--mk-line-soft)",
                          color: "var(--mk-ink-700)",
                        }}
                      >
                        {SOURCE_LABEL[ev.source]}
                      </span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>
                        {timeLabel(ev.timestamp)}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default PulseTimeline;
