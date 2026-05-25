import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import type { Milestone, ProjectData, TabId } from "../../types";
import { GITHUB_OWNER } from "../../utils/config";

interface Props {
  projects: ProjectData[];
  milestones: Milestone[];
  activeTab: TabId;
  onClose: () => void;
  onJumpTab: (tab: TabId) => void;
  onRefresh: () => void;
  onLogout: () => void;
  onOpenFinance: () => void;
}

type ItemKind = "action" | "project" | "milestone" | "tab";

interface Item {
  id: string;
  kind: ItemKind;
  title: string;
  subtitle?: string;
  hint?: string;
  icon: ReactNode;
  /** Returning anything other than `false` runs the default close-after-execute. */
  run: () => void | false;
}

const TAB_LABEL: Record<TabId, string> = {
  dashboard: "Дашборд",
  projects: "Проекты",
  milestones: "Milestones",
  uptime: "Мониторинг",
  pipeline: "Pipeline",
  transcripts: "Транскрипты",
  audit: "Аудит",
  research: "Research",
  specs: "Specs",
  quality: "Quality",
  "codex-quality": "Качество кода",
  debate: "Debate",
};

const ICON = {
  bolt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 11-6.22-8.56" />
      <path d="M21 3v6h-6" />
    </svg>
  ),
  exit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  ),
  money: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  ),
  repo: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    </svg>
  ),
  flag: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  ),
  arrow: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  ),
};

function buildRepoUrl(repo: string): string {
  if (repo.includes("/")) return `https://github.com/${repo}`;
  return `https://github.com/${GITHUB_OWNER}/${repo}`;
}

/** Normalize for case- and accent-insensitive matching. NFKD strips diacritics
 *  after decomposition; lowercase handles Cyrillic/Latin uniformly. */
function norm(s: string): string {
  return s.normalize("NFKD").toLowerCase();
}

/** Lightweight subsequence-fuzzy match. Returns score (lower=better) or null. */
function fuzzyScore(text: string, query: string): number | null {
  if (!query) return 0;
  const t = norm(text);
  const q = norm(query);
  if (t.includes(q)) return -1000 + t.indexOf(q); // substring beats subseq
  let ti = 0;
  let qi = 0;
  let score = 0;
  let lastMatch = -1;
  while (ti < t.length && qi < q.length) {
    if (t[ti] === q[qi]) {
      score += ti - lastMatch; // gap penalty
      lastMatch = ti;
      qi++;
    }
    ti++;
  }
  if (qi < q.length) return null;
  return score;
}

export function CommandPalette({
  projects,
  milestones,
  activeTab,
  onClose,
  onJumpTab,
  onRefresh,
  onLogout,
  onOpenFinance,
}: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // Save the element that opened the palette and restore focus on unmount.
  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    inputRef.current?.focus();
    return () => {
      const prev = previousFocusRef.current;
      if (prev instanceof HTMLElement) prev.focus();
    };
  }, []);

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];

    // Actions
    list.push({
      id: "act:refresh",
      kind: "action",
      title: "Обновить данные",
      subtitle: "Перезагрузить проекты и мониторы",
      hint: "R",
      icon: ICON.refresh,
      run: onRefresh,
    });
    list.push({
      id: "act:finance",
      kind: "action",
      title: "Открыть редактор финансов",
      subtitle: "Бюджеты и платежи по проектам",
      icon: ICON.money,
      run: onOpenFinance,
    });
    list.push({
      id: "act:logout",
      kind: "action",
      title: "Выйти и очистить токены",
      subtitle: "GitHub PAT, Claude key, пароль",
      icon: ICON.exit,
      run: onLogout,
    });

    // Tabs
    (Object.keys(TAB_LABEL) as TabId[]).forEach((id) => {
      if (id === activeTab) return;
      list.push({
        id: `tab:${id}`,
        kind: "tab",
        title: `Перейти: ${TAB_LABEL[id]}`,
        subtitle: "Раздел приложения",
        icon: ICON.arrow,
        run: () => onJumpTab(id),
      });
    });

    // Projects
    projects.forEach((p) => {
      list.push({
        id: `prj:${p.repo}`,
        kind: "project",
        title: p.repo,
        subtitle: `${p.openCount} открытых · ${p.doneCount}/${p.totalCount} (${p.totalCount > 0 ? Math.round((p.doneCount / p.totalCount) * 100) : 0}%)`,
        icon: ICON.repo,
        run: () => {
          window.open(buildRepoUrl(p.repo), "_blank", "noopener,noreferrer");
          return false;
        },
      });
    });

    // Milestones — open only, sorted by due date
    milestones
      .filter((m) => m.state === "OPEN")
      .slice(0, 80)
      .forEach((m) => {
        const due = m.dueOn ? new Date(m.dueOn).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : null;
        list.push({
          id: `ms:${m.repo}:${m.title}`,
          kind: "milestone",
          title: m.title,
          subtitle: `${m.repo}${due ? ` · до ${due}` : ""} · ${m.openIssues} открытых`,
          icon: ICON.flag,
          run: () => {
            window.open(m.url, "_blank", "noopener,noreferrer");
            return false;
          },
        });
      });

    return list;
  }, [activeTab, milestones, onJumpTab, onLogout, onOpenFinance, onRefresh, projects]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) {
      return items.slice(0, 30);
    }
    const scored: Array<{ item: Item; score: number }> = [];
    items.forEach((item) => {
      const haystack = `${item.title} ${item.subtitle ?? ""}`;
      const s = fuzzyScore(haystack, q);
      if (s !== null) scored.push({ item, score: s });
    });
    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, 40).map((s) => s.item);
  }, [items, query]);

  // Reset selection on filter change.
  useEffect(() => {
    setActive(0);
  }, [query]);

  // Group filtered by kind for section headers, preserving relative order.
  const grouped = useMemo(() => {
    const order: ItemKind[] = ["action", "tab", "project", "milestone"];
    const buckets = new Map<ItemKind, Item[]>();
    filtered.forEach((it) => {
      const arr = buckets.get(it.kind) ?? [];
      arr.push(it);
      buckets.set(it.kind, arr);
    });
    const flat: Array<{ section?: string; item: Item; flatIndex: number }> = [];
    let idx = 0;
    order.forEach((k) => {
      const arr = buckets.get(k);
      if (!arr || arr.length === 0) return;
      arr.forEach((item, i) => {
        flat.push({
          section: i === 0 ? sectionLabel(k) : undefined,
          item,
          flatIndex: idx++,
        });
      });
    });
    return flat;
  }, [filtered]);

  // Keyboard navigation handled by `onKeyDown` on the dialog root below —
  // scoping to the dialog avoids leaking Escape/Enter to other window-level
  // listeners while the palette is open.
  const handleKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filtered[active];
      if (target) {
        const r = target.run();
        if (r !== false) onClose();
      }
    }
  };

  // Scroll active into view.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <div
      className="wow-cmdk-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Командная палитра"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKey}
    >
      <div className="wow-cmdk">
        <div className="wow-cmdk-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            className="wow-cmdk-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Куда хотите перейти? Что найти?"
            aria-label="Поиск команды"
          />
          <span className="wow-cmdk-hint">esc</span>
        </div>
        <div className="wow-cmdk-list" ref={listRef}>
          {grouped.length === 0 ? (
            <div className="wow-cmdk-empty">Ничего не найдено по «{query}»</div>
          ) : (
            grouped.map(({ section, item, flatIndex }) => (
              <div key={item.id}>
                {section && <div className="wow-cmdk-section">{section}</div>}
                <button
                  type="button"
                  data-idx={flatIndex}
                  className={`wow-cmdk-item ${flatIndex === active ? "is-active" : ""}`}
                  onMouseEnter={() => setActive(flatIndex)}
                  onClick={() => {
                    const r = item.run();
                    if (r !== false) onClose();
                  }}
                >
                  <span className="wow-cmdk-item-ic">{item.icon}</span>
                  <div className="wow-cmdk-item-body">
                    <div className="wow-cmdk-item-title">{item.title}</div>
                    {item.subtitle && <div className="wow-cmdk-item-sub">{item.subtitle}</div>}
                  </div>
                  {item.hint && <span className="wow-cmdk-item-kbd">{item.hint}</span>}
                </button>
              </div>
            ))
          )}
        </div>
        <div className="wow-cmdk-foot">
          <span><span className="wow-cmdk-hint">↑↓</span> навигация</span>
          <span><span className="wow-cmdk-hint">⏎</span> выбрать</span>
          <span><span className="wow-cmdk-hint">esc</span> закрыть</span>
          <span style={{ marginLeft: "auto" }}>{filtered.length} из {items.length}</span>
        </div>
      </div>
    </div>
  );
}

function sectionLabel(k: ItemKind): string {
  switch (k) {
    case "action": return "Действия";
    case "tab": return "Переход";
    case "project": return "Проекты";
    case "milestone": return "Milestones";
    default: return "";
  }
}
