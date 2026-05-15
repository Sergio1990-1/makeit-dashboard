import { Icon } from "../../health/Icon";

const EPIC_URL = "https://github.com/Sergio1990-1/makeit-dashboard/blob/main/docs/epics/epic-011.md";

/**
 * Placeholder. Epic-011 (Decision Log + Risk Register + Commitments +
 * Renewals, Tasks 01–04, 08) fills this with the four sections + anchors.
 */
export function DecisionsRisksTab() {
  return (
    <div className="v4-hub-tab-stub">
      <Icon name="book" />
      <div>
        <strong>Вкладка в разработке</strong>
        <p>
          Decision Log, Risk Register, Commitments и Renewals появятся в{" "}
          <a href={EPIC_URL} target="_blank" rel="noreferrer">Epic-011</a>.
        </p>
      </div>
    </div>
  );
}

export default DecisionsRisksTab;
