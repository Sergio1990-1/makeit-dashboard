import type { HubTab, ProjectHubData } from "../../../../types/hub";

interface Props {
  data: ProjectHubData;
  onOpenTab: (tab: HubTab) => void;
}

/**
 * Stub. Epic-009 Task-04 (#341) replaces this with the 4 mini-blocks
 * (NBA / Pulse / Risks / Commitments).
 *
 * Signature is settled here so Task-04 can swap the body without
 * cascading changes to ProjectHubPage's import shape; the props are
 * intentionally accessed in this stub so lint stays clean without an
 * underscore-prefix escape hatch.
 */
export function OverviewTab({ data, onOpenTab }: Props) {
  return (
    <div className="v4-hub-tab-stub">
      <div>
        <strong>Overview placeholder</strong>
        <p>
          4 mini-блока (NBA / Pulse / Risks / Commitments) появятся в Task-04 (#341).
          {data.loading ? " Загружаем данные…" : null}
        </p>
        <button
          type="button"
          className="v4-btn"
          onClick={() => onOpenTab("health")}
        >
          Открыть Health →
        </button>
      </div>
    </div>
  );
}

export default OverviewTab;
