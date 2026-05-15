import { Icon } from "../../health/Icon";

const EPIC_URL = "https://github.com/Sergio1990-1/makeit-dashboard/blob/main/docs/epics/epic-012.md";

/**
 * Placeholder. Epic-012 (DORA + Weekly Digest + Customer Health +
 * Onboarding + NBA engine, Tasks 01–09) fills this with the delivery
 * intelligence layout.
 */
export function DeliveryTab() {
  return (
    <div className="v4-hub-tab-stub">
      <Icon name="trend" />
      <div>
        <strong>Вкладка в разработке</strong>
        <p>
          DORA, Weekly Digest, Customer Health и Onboarding Readiness появятся в{" "}
          <a href={EPIC_URL} target="_blank" rel="noreferrer">Epic-012</a>.
        </p>
      </div>
    </div>
  );
}

export default DeliveryTab;
