import { PipelineActiveTasksBlock } from ".";
import { DEMO_STATUS_LOOKING, DEMO_STATUS_RUNNING, DEMO_STATUS_STOPPING } from "./demo-data";

const wrap: React.CSSProperties = {
  maxWidth: 1100,
  margin: "32px auto",
  padding: "0 24px",
  display: "flex",
  flexDirection: "column",
  gap: 28,
  fontFamily: "var(--mk-font-sans)",
  color: "var(--mk-ink-900)",
  background: "var(--mk-bg)",
  minHeight: "100vh",
};

const blockHd: React.CSSProperties = {
  fontFamily: "var(--mk-font-mono)",
  fontSize: 10.5,
  color: "var(--mk-ink-500)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontWeight: 600,
  paddingLeft: 4,
};

const hdBox: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
};

const hdSub: React.CSSProperties = {
  fontFamily: "var(--mk-font-mono)",
  fontSize: 11,
  color: "var(--mk-ink-500)",
};

const block: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };

export function PipelineActiveTasksDemoPage() {
  return (
    <div style={wrap}>
      <div style={hdBox}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>
          Pipeline · Active Tasks · Variant C (плотный mono)
        </h1>
        <span style={hdSub}>?pipeline-demo=1 · моки</span>
      </div>

      <div style={block}>
        <div style={blockHd}>Comfortable density · 6 задач</div>
        <PipelineActiveTasksBlock
          status={DEMO_STATUS_RUNNING}
          showV2
          onOpenContext={(n) => alert(`open context for #${n}`)}
        />
      </div>

      <div style={block}>
        <div style={blockHd}>Compact density</div>
        <PipelineActiveTasksBlock status={DEMO_STATUS_RUNNING} density="compact" showV2 />
      </div>

      <div style={block}>
        <div style={blockHd}>Останавливается</div>
        <PipelineActiveTasksBlock status={DEMO_STATUS_STOPPING} />
      </div>

      <div style={block}>
        <div style={blockHd}>Подбираю задачи (skeleton)</div>
        <PipelineActiveTasksBlock status={DEMO_STATUS_LOOKING} />
      </div>
    </div>
  );
}
