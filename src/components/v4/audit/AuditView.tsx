import { useEffect, useState } from "react";
import type { ProjectData } from "../../../types";
import { CodeAuditView } from "./CodeAuditView";
import { UXAuditView } from "./UXAuditView";

interface Props {
  dashboardProjects?: ProjectData[];
}

type SubTab = "code" | "ux";

const STORAGE_SUB = "v4au:subtab";

function readSub(): SubTab {
  try {
    const v = localStorage.getItem(STORAGE_SUB);
    if (v === "code" || v === "ux") return v;
  } catch { /* ignore */ }
  return "code";
}

export function AuditView({ dashboardProjects = [] }: Props) {
  const [subTab, setSubTab] = useState<SubTab>(() => readSub());

  useEffect(() => {
    try { localStorage.setItem(STORAGE_SUB, subTab); } catch { /* ignore */ }
  }, [subTab]);

  return (
    <div className="v4-content">
      <div className="v4-ph">
        <div>
          <h1>Аудит</h1>
          <div className="v4-sub">
            {subTab === "code"
              ? "Code audit · LLM + детерминистические анализаторы"
              : "UX audit · Lighthouse + axe-core + Vision LLM"}
          </div>
        </div>
        <div className="v4-ph-right">
          <div className="v4-pillgrp">
            <button
              type="button"
              className={subTab === "code" ? "is-active" : ""}
              onClick={() => setSubTab("code")}
            >
              Код
            </button>
            <button
              type="button"
              className={subTab === "ux" ? "is-active" : ""}
              onClick={() => setSubTab("ux")}
            >
              UX
            </button>
          </div>
        </div>
      </div>

      <div style={{ height: 10 }} />

      {subTab === "code"
        ? <CodeAuditView dashboardProjects={dashboardProjects} />
        : <UXAuditView />}
    </div>
  );
}
