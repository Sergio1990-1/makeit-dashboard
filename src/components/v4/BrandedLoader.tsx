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

const MATRIX_CHARS =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function BrandedLoader({ stage, subtitle }: Props) {
  const label = STAGE_LABEL[stage];
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    // Non-null aliases for use inside nested functions where TS can't narrow
    const canvas: HTMLCanvasElement = canvasEl;
    const g: CanvasRenderingContext2D = ctx;

    const fontSize = 14;
    let cols: number;
    let drops: number[];
    let raf = 0;

    function resize() {
      cancelAnimationFrame(raf);
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      cols = Math.floor(canvas.width / fontSize);
      drops = Array.from({ length: cols }, () =>
        Math.floor(Math.random() * Math.ceil(canvas.height / fontSize))
      );
      g.fillStyle = "#000";
      g.fillRect(0, 0, canvas.width, canvas.height);
      raf = requestAnimationFrame(draw);
    }

    function draw() {
      g.fillStyle = "rgba(0,0,0,0.08)";
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.font = `${fontSize}px "JetBrains Mono", monospace`;

      for (let i = 0; i < drops.length; i++) {
        const y = drops[i] * fontSize;
        if (y <= 0) {
          drops[i]++;
          continue;
        }

        const headChar = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
        g.fillStyle = "#e0ffe8";
        g.fillText(headChar, i * fontSize, y);

        const bodyChar = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
        g.fillStyle = "#00cc44";
        g.fillText(bodyChar, i * fontSize, y - fontSize);

        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }

      raf = requestAnimationFrame(draw);
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
