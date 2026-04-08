import { useState } from "react";
import { AuditTab } from "./AuditTab";
import { UXAuditTab } from "./UXAuditTab";
import type { ProjectData } from "../types";

type SubTab = "code" | "ux";

interface Props {
  dashboardProjects?: ProjectData[];
}

export function AuditCombinedTab({ dashboardProjects = [] }: Props) {
  const [subTab, setSubTab] = useState<SubTab>("code");

  return (
    <>
      <div className="bento-panel span-12" style={{ padding: "var(--sp-2) var(--sp-4)" }}>
        <div className="audit-sub-tabs">
          <button
            className={`audit-sub-tab ${subTab === "code" ? "audit-sub-tab-active" : ""}`}
            onClick={() => setSubTab("code")}
          >
            Code
          </button>
          <button
            className={`audit-sub-tab ${subTab === "ux" ? "audit-sub-tab-active" : ""}`}
            onClick={() => setSubTab("ux")}
          >
            UX
          </button>
        </div>
      </div>
      {subTab === "code" && <AuditTab dashboardProjects={dashboardProjects} />}
      {subTab === "ux" && <UXAuditTab />}
    </>
  );
}
