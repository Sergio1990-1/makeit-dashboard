import { Icon } from "../../health/Icon";
import { DecisionLog } from "../DecisionLog";
import type { Decision } from "../../../../types/hub";

const EPIC_URL = "https://github.com/Sergio1990-1/makeit-dashboard/blob/main/docs/epics/epic-011.md";

interface Props {
  decisions: Decision[];
}

/**
 * Decision Log lives here today (Epic-011 Task-01). Risk Register,
 * Commitments, and Renewals get their own sections in Tasks 02–04 and
 * the four-section assembly + anchors lands in Task-08.
 */
export function DecisionsRisksTab({ decisions }: Props) {
  return (
    <div className="v4-hub-decisions-tab" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <section aria-labelledby="hub-decision-log-heading">
        <h2
          id="hub-decision-log-heading"
          style={{
            margin: "0 0 12px",
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          Decision Log
        </h2>
        <DecisionLog decisions={decisions} />
      </section>

      <div className="v4-hub-tab-stub">
        <Icon name="book" />
        <div>
          <strong>Risk Register, Commitments, Renewals — в разработке</strong>
          <p>
            Появятся в{" "}
            <a href={EPIC_URL} target="_blank" rel="noreferrer">Epic-011</a>{" "}
            (Tasks 02–04, 08).
          </p>
        </div>
      </div>
    </div>
  );
}

export default DecisionsRisksTab;
