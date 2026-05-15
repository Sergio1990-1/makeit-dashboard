import type { ProjectData } from "../../../../types";
import { ProjectHealthPage } from "../../health/ProjectHealthPage";

interface Props {
  repo: string;
  project?: ProjectData;
}

/**
 * Thin wrapper that delegates the entire Health surface to the existing
 * ProjectHealthPage — Epic-009 design brief §9 explicitly says the Health
 * page renders inside this tab without visual changes.
 *
 * Wrapping (rather than importing ProjectHealthPage directly into
 * ProjectHubPage) keeps the Suspense boundary tight: switching to Health
 * downloads only this chunk + the heavy health-engine modules it pulls in.
 */
export function HealthTab({ repo, project }: Props) {
  return <ProjectHealthPage repo={repo} project={project} />;
}

export default HealthTab;
