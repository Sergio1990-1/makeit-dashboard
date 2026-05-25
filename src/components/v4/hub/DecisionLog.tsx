import type { Decision } from "../../../types/hub";

/**
 * Read-only chronological list of project decisions (Epic-011 Task-01).
 *
 * Renders one row per `Decision` with date, title, optional description,
 * and a source badge (`brief` / `commit` / `adr`). Empty state is built
 * in — callers don't need to special-case `decisions.length === 0`.
 *
 * Pure presentation: no fetching, no mutation. Data comes pre-sorted
 * (newest first) from `useProjectHub` → `extractDecisions`.
 */

interface Props {
  decisions: Decision[];
}

/**
 * Pull a `brief` / `commit` / `adr` tag out of `Decision.source`.
 * The extractor stores `source` as `<tag>` or `<tag>:<id>` so the
 * badge is stable while the suffix can carry a sha / url / doc id.
 */
function sourceTag(source: string | undefined): string {
  if (!source) return "—";
  const colon = source.indexOf(":");
  return colon < 0 ? source : source.slice(0, colon);
}

/** Optional URL embedded in `Decision.source` after the tag. */
function sourceLink(source: string | undefined): string | null {
  if (!source) return null;
  const colon = source.indexOf(":");
  if (colon < 0) return null;
  const rest = source.slice(colon + 1);
  return /^https?:\/\//.test(rest) ? rest : null;
}

/**
 * Format an ISO date as a short, human-readable string. Falls back to
 * `—` so an empty/malformed date never renders as the literal string
 * `"undefined"` or `Invalid Date`.
 */
function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Human label for a source tag — keeps the badge compact. */
function sourceLabel(tag: string): string {
  switch (tag) {
    case "brief":
      return "Бриф";
    case "commit":
      return "Коммит";
    case "adr":
      return "Арх. решение";
    default:
      return tag;
  }
}

export function DecisionLog({ decisions }: Props) {
  if (decisions.length === 0) {
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
        Решений ещё нет. Добавь BRIEF.md с разделом «Decisions» или коммит с
        префиксом <code>decide:</code>/<code>accept:</code>.
      </div>
    );
  }

  return (
    <ul
      style={{
        listStyle: "none",
        padding: 0,
        margin: 0,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {decisions.map((d) => {
        const tag = sourceTag(d.source);
        const link = sourceLink(d.source);
        return (
          <li
            key={d.id}
            style={{
              padding: 12,
              border: "1px solid var(--mk-line-soft)",
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 8,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: "var(--mk-ink-500)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatDate(d.date)}
              </div>
              {link ? (
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "var(--mk-line-soft)",
                    color: "var(--mk-ink-700)",
                    textDecoration: "none",
                  }}
                  title={link}
                >
                  {sourceLabel(tag)}
                </a>
              ) : (
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "var(--mk-line-soft)",
                    color: "var(--mk-ink-700)",
                  }}
                >
                  {sourceLabel(tag)}
                </span>
              )}
            </div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{d.title}</div>
            {d.description && (
              <div style={{ fontSize: 13, color: "var(--mk-ink-700)" }}>
                {d.description}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
