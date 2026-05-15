import { Icon } from "../../health/Icon";

const EPIC_URL = "https://github.com/Sergio1990-1/makeit-dashboard/blob/main/docs/epics/epic-011.md";

/**
 * Placeholder. Epic-011 (Activity Pulse aggregator + ActivityTab assembly,
 * Tasks 06–07) fills this with the real timeline + inbox + open PRs/runs.
 */
export function ActivityTab() {
  return (
    <div className="v4-hub-tab-stub">
      <Icon name="clock" />
      <div>
        <strong>Вкладка в разработке</strong>
        <p>
          Activity Pulse, Inbox, Open PRs и Open Pipeline Runs появятся в{" "}
          <a href={EPIC_URL} target="_blank" rel="noreferrer">Epic-011</a>.
        </p>
      </div>
    </div>
  );
}

export default ActivityTab;
