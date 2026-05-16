import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../health/Icon";
import { BpmnDiagram } from "../BpmnDiagram";
import {
  BIZPROC_PATH,
  EXAMPLE_BUSINESS_PROCESS,
  loadBizProcess,
} from "../../../../utils/bizProcessParser";
import type { BusinessProcessDoc } from "../../../../types/bizProcess";

interface Props {
  /** Repo whose docs/business_process.yaml is being viewed. */
  repo: string;
}

/** Loaded section state, tagged with the `repo` it was loaded for. */
type Loaded =
  | { status: "ok"; doc: BusinessProcessDoc; sha: string }
  | { status: "absent" }
  | { status: "error"; message: string };

interface Resolved {
  key: string;
  data: Loaded;
}

/**
 * Project Hub → "Бизнес-процессы" tab (path b of the agreed plan: UI +
 * parser first, the makeit-bizproc generator skill follows).
 *
 * Self-loading like ActivityTab/HealthTab — `docs/business_process.yaml`
 * has its own lifecycle and isn't worth threading through useProjectHub.
 * The `Resolved` tagged-store + derived `loading` keeps this lint-clean
 * (no synchronous setState-in-effect): the effect only ever commits a
 * value tagged with the `repo` it loaded for; `loading` is "key mismatch".
 *
 * Empty states are first-class: no file yet → an explanatory state with a
 * "показать пример" toggle that renders the golden example through the
 * exact same UI, so the diagram is always demoable even before any repo
 * has the file.
 */
export function ProcessesTab({ repo }: Props) {
  const [resolved, setResolved] = useState<Resolved | null>(null);
  // Tag the example toggle with the repo it was opened for. ProjectHubPage
  // is reconciled in place across project switches (no `key={repo}`), so a
  // bare boolean would leak the example into the next file-less project.
  // Mirroring the `Resolved` tagged-store keeps the toggle repo-safe with
  // no synchronous setState-in-effect (lint-forbidden).
  const [showExampleFor, setShowExampleFor] = useState<string | null>(null);
  const showExample = showExampleFor === repo;

  useEffect(() => {
    const key = repo;
    let cancelled = false;
    void loadBizProcess(repo)
      .then((res) => {
        if (cancelled) return;
        setResolved({
          key,
          data: res
            ? { status: "ok", doc: res.doc, sha: res.sha }
            : { status: "absent" },
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setResolved({
          key,
          data: {
            status: "error",
            message:
              e instanceof Error
                ? e.message
                : "Не удалось прочитать business_process.yaml",
          },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  const fresh = resolved !== null && resolved.key === repo;
  const state: Loaded | "loading" = fresh
    ? (resolved as Resolved).data
    : "loading";

  return (
    <div className="v4-bp">
      <header className="v4-bp-head">
        <span className="v4-bp-head-ic" aria-hidden="true">
          <Icon name="map" />
        </span>
        <h2 className="v4-bp-title">Бизнес-процессы</h2>
        {state !== "loading" && state.status === "ok" && (
          <span className="v4-bp-src">
            <code>{BIZPROC_PATH}</code> · sha {state.sha.slice(0, 7)}
          </span>
        )}
      </header>

      {state === "loading" && (
        <BpEmpty icon="clock" text="Загрузка бизнес-процессов…" />
      )}

      {state !== "loading" && state.status === "error" && (
        <BpEmpty
          icon="alert"
          text={`Файл ${BIZPROC_PATH} повреждён: ${state.message}`}
        />
      )}

      {state !== "loading" && state.status === "ok" && (
        <DocView doc={state.doc} />
      )}

      {state !== "loading" && state.status === "absent" && !showExample && (
        <div className="v4-bp-empty v4-bp-empty--cta">
          <span className="v4-bp-empty-ic" aria-hidden="true">
            <Icon name="map" />
          </span>
          <p className="v4-bp-empty-text">
            В репозитории ещё нет <code>{BIZPROC_PATH}</code>.
          </p>
          <p className="v4-bp-empty-sub">
            Схема генерируется скиллом <code>makeit-bizproc</code> из доков и
            кода проекта, ревьюится в PR и коммитится — дашборд только рисует
            её. Пока файла нет, можно посмотреть формат на эталонном примере.
          </p>
          <button
            type="button"
            className="v4-bp-btn"
            onClick={() => setShowExampleFor(repo)}
          >
            Показать пример
          </button>
        </div>
      )}

      {state !== "loading" && state.status === "absent" && showExample && (
        <>
          <div className="v4-bp-example-note">
            Эталонный пример (<code>docs/examples/business_process.example.yaml</code>)
            — не данные этого проекта.{" "}
            <button
              type="button"
              className="v4-bp-linkbtn"
              onClick={() => setShowExampleFor(null)}
            >
              скрыть
            </button>
          </div>
          <DocView doc={EXAMPLE_BUSINESS_PROCESS} />
        </>
      )}
    </div>
  );
}

export default ProcessesTab;

/** Process selector chips + the selected diagram + meta. Shared by the
 *  real doc and the example so both render through identical UI. */
function DocView({ doc }: { doc: BusinessProcessDoc }) {
  const [selId, setSelId] = useState<string>(doc.processes[0]?.id ?? "");
  const proc = useMemo(
    () =>
      doc.processes.find((p) => p.id === selId) ?? doc.processes[0] ?? null,
    [doc.processes, selId],
  );

  if (!proc) {
    return <BpEmpty icon="map" text="В файле нет ни одного процесса." />;
  }

  return (
    <>
      <div className="v4-bp-toolbar">
        <div
          className="v4-bp-chips"
          role="group"
          aria-label="Выбор процесса"
        >
          {doc.processes.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`v4-bp-chip${
                p.id === proc.id ? " v4-bp-chip--on" : ""
              }`}
              aria-pressed={p.id === proc.id}
              onClick={() => setSelId(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="v4-bp-meta">
          <span>
            узлов <b>{proc.nodes.length}</b>
          </span>
          <span>
            дорожек <b>{proc.lanes.length}</b>
          </span>
        </div>
      </div>

      <div className="v4-bp-legend">
        <span className="v4-bp-lg">
          <svg width="20" height="20" aria-hidden="true">
            <circle
              cx="10"
              cy="10"
              r="8"
              className="v4-bp-ev v4-bp-ev--start"
            />
          </svg>
          старт
        </span>
        <span className="v4-bp-lg">
          <svg width="20" height="20" aria-hidden="true">
            <circle cx="10" cy="10" r="8" className="v4-bp-ev v4-bp-ev--end" />
          </svg>
          конец
        </span>
        <span className="v4-bp-lg">
          <svg width="32" height="18" aria-hidden="true">
            <rect
              x="1"
              y="1"
              width="30"
              height="16"
              rx="4"
              className="v4-bp-task"
            />
          </svg>
          задача
        </span>
        <span className="v4-bp-lg">
          <svg width="22" height="22" aria-hidden="true">
            <polygon points="11,2 20,11 11,20 2,11" className="v4-bp-gw" />
          </svg>
          шлюз
        </span>
        <span className="v4-bp-lg">
          <svg width="32" height="18" aria-hidden="true">
            <rect
              x="1"
              y="1"
              width="30"
              height="16"
              rx="3"
              className="v4-bp-task v4-bp-task--sys"
            />
          </svg>
          система
        </span>
      </div>

      <BpmnDiagram process={proc} />
    </>
  );
}

interface BpEmptyProps {
  icon: "clock" | "alert" | "map";
  text: string;
}

function BpEmpty({ icon, text }: BpEmptyProps) {
  return (
    <div className="v4-bp-empty">
      <span className="v4-bp-empty-ic" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <p className="v4-bp-empty-text">{text}</p>
    </div>
  );
}
