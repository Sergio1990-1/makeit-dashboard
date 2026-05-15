import { useEffect } from "react";
import { Icon } from "../../health/Icon";
import { markVisited } from "../../../../utils/lastVisitedStore";

const EPIC_URL = "https://github.com/Sergio1990-1/makeit-dashboard/blob/main/docs/epics/epic-011.md";

interface Props {
  /** Repo whose Activity is being viewed — keys the lastVisited store. */
  repo: string;
  /** Called after `markVisited` so the parent can drop the inbox badge to 0. */
  onVisited: () => void;
}

/**
 * Placeholder. Epic-011 (Activity Pulse aggregator + ActivityTab assembly,
 * Tasks 06–07) fills this with the real timeline + inbox + open PRs/runs.
 *
 * Epic-011 Task-05 wires the lastVisited tracking: opening this tab marks
 * `repo` as visited (per-device sessionStorage) and notifies the parent so
 * the inbox badge clears.
 */
export function ActivityTab({ repo, onVisited }: Props) {
  useEffect(() => {
    markVisited(repo);
    onVisited();
  }, [repo, onVisited]);

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
