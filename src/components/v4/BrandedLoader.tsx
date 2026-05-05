import { useEffect, useRef } from "react";
import { MakeItLoader } from "./MakeItLoader";

/**
 * Full-screen branded loader shown during the cold-start sequence:
 *   settings → cache/projects.
 *
 * Visual is the MakeIT brick-build wordmark from the design handoff
 * (see src/components/v4/MakeItLoader.tsx + .module.css). This wrapper
 * adds the stage label so the user knows which phase they're waiting on
 * and pins the loader full-screen so the cold-start sequence feels
 * like one continuous screen, not two.
 */

export type LoaderStage = "settings" | "data" | "syncing";

const STAGE_LABEL: Record<LoaderStage, string> = {
  settings: "Загружаем настройки",
  data: "Подтягиваем данные",
  syncing: "Синхронизируем с GitHub",
};

interface Props {
  stage: LoaderStage;
  subtitle?: string;
}

const CODE_CHARS = "{}[]()=+*#.$→/|<>01;";
const TRAIL_LEN = 16;
const COL_WIDTH = 20;
const FONT_SIZE = 13;
const FPS = 24;

export function BrandedLoader({ stage, subtitle }: Props) {
  const label = STAGE_LABEL[stage];
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    const canvas: HTMLCanvasElement = canvasEl;
    const g: CanvasRenderingContext2D = ctx;

    // Detect accent color from CSS custom property
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue("--v4-accent-600")
      .trim() || "#2563EB";

    // Parse hex to r,g,b for rgba() usage
    const hex = accent.replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16);
    const gb = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    let cols: number;
    let drops: number[];   // head row index per column
    let chars: string[];   // current head char per column
    let raf = 0;
    let lastTick = 0;

    function resize() {
      cancelAnimationFrame(raf);
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      cols = Math.floor(canvas.width / COL_WIDTH);
      const totalRows = Math.ceil(canvas.height / FONT_SIZE);
      drops = Array.from({ length: cols }, () => Math.floor(Math.random() * totalRows));
      chars = Array.from({ length: cols }, () => randomChar());
      raf = requestAnimationFrame(draw);
    }

    function randomChar() {
      return CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }

    function draw(now: number) {
      raf = requestAnimationFrame(draw);

      const elapsed = now - lastTick;
      if (elapsed < 1000 / FPS) return;
      lastTick = now;

      g.clearRect(0, 0, canvas.width, canvas.height);
      g.font = `400 ${FONT_SIZE}px "JetBrains Mono", ui-monospace, monospace`;
      g.textAlign = "center";

      for (let i = 0; i < cols; i++) {
        const headRow = drops[i];
        const x = i * COL_WIDTH + COL_WIDTH / 2;

        // Draw trail from head up, fading out
        for (let t = 0; t < TRAIL_LEN; t++) {
          const row = headRow - t;
          if (row < 0) continue;
          const y = row * FONT_SIZE;
          if (y > canvas.height) continue;

          // t=0 is head (brightest), t=TRAIL_LEN-1 is tail (near invisible)
          const alpha = t === 0
            ? 0.55
            : (0.40 * Math.pow(1 - t / TRAIL_LEN, 1.8));

          g.fillStyle = `rgba(${r},${gb},${b},${alpha.toFixed(3)})`;
          const ch = t === 0 ? chars[i] : randomChar();
          g.fillText(ch, x, y);
        }

        // Advance head
        drops[i]++;
        chars[i] = randomChar();
        if (drops[i] * FONT_SIZE > canvas.height + TRAIL_LEN * FONT_SIZE) {
          drops[i] = -Math.floor(Math.random() * 8);
        }
      }
    }

    resize();
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="bl-root" role="status" aria-live="polite">
      <canvas ref={canvasRef} className="bl-matrix" aria-hidden="true" />
      <div className="bl-card">
        <MakeItLoader size={64} />
        <div className="bl-stage">{label}</div>
        {subtitle ? <div className="bl-subtitle">{subtitle}</div> : null}
      </div>
    </div>
  );
}
