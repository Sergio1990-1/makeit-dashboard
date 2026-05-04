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

export function BrandedLoader({ stage, subtitle }: Props) {
  const label = STAGE_LABEL[stage];
  return (
    <div className="bl-root" role="status" aria-live="polite">
      <div className="bl-card">
        <MakeItLoader size={64} />
        <div className="bl-stage">{label}</div>
        {subtitle ? <div className="bl-subtitle">{subtitle}</div> : null}
      </div>
    </div>
  );
}
