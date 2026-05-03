// Pure helpers for turning a HealthFinding into a GitHub Issue payload.
//
// These functions are deliberately side-effect-free so they can be unit-tested
// in isolation. The actual REST call (createIssue) lives in github-actions.ts.
//
// ── Expected behaviour (informal spec; no test runner configured yet) ──
//
// buildIssueTitle({ rule_id: "hygiene.contributing", title: "CONTRIBUTING.md в корне", ... })
//   → "[health] CONTRIBUTING.md в корне"
//
// buildIssueLabels({ severity: "critical", ... })  → ["tech-debt", "P1-critical"]
// buildIssueLabels({ severity: "high",     ... })  → ["tech-debt", "P2-high"]
// buildIssueLabels({ severity: "medium",   ... })  → ["tech-debt", "P3-medium"]
// buildIssueLabels({ severity: "low",      ... })  → ["tech-debt"]
//
// buildIssueBody(finding, "owner/repo", classification, "2026-05-03T10:00:00Z")
//   → markdown-formatted body containing severity, repo, project tier/flags,
//     finding detail, remediation hint and a generated_at footer. User-supplied
//     text (title/detail/remediation) is inserted verbatim — GitHub renders
//     issue bodies as Markdown, which already handles HTML escaping for us, so
//     no extra sanitisation is required (and we don't want to mangle legitimate
//     markdown in remediation hints).

import type { HealthFinding, HealthSeverity, ProjectClassification } from "../types/health";

const TITLE_PREFIX = "[health]";
const BASE_LABELS: readonly string[] = ["tech-debt"];

// Severity → priority label. `null` means "no priority label" (e.g. "low").
const SEVERITY_PRIORITY_LABEL: Record<HealthSeverity, string | null> = {
  critical: "P1-critical",
  high: "P2-high",
  medium: "P3-medium",
  low: null,
};

export function buildIssueTitle(finding: HealthFinding): string {
  return `${TITLE_PREFIX} ${finding.title}`;
}

export function buildIssueLabels(finding: HealthFinding): string[] {
  const priority = SEVERITY_PRIORITY_LABEL[finding.severity];
  return priority ? [...BASE_LABELS, priority] : [...BASE_LABELS];
}

export function buildIssueBody(
  finding: HealthFinding,
  repo: string,
  classification: ProjectClassification,
  generatedAt: string,
): string {
  const flags: string[] = [`tier ${classification.tier}`];
  if (classification.complex) flags.push("complex");
  if (classification.client) flags.push("client");

  const lines: string[] = [
    `**Severity:** ${finding.severity}`,
    `**Layer:** ${finding.layer}`,
    `**Rule:** \`${finding.rule_id}\``,
    `**Repo:** \`${repo}\``,
    `**Project:** ${flags.join(", ")}`,
    "",
    "## Что не так",
    finding.detail?.trim() || "_(детали не предоставлены health-движком)_",
  ];

  if (finding.remediation?.trim()) {
    lines.push("", "## Как починить", finding.remediation.trim());
  }

  if (finding.source) {
    lines.push("", `**Источник правила:** ${finding.source}`);
  }

  lines.push(
    "",
    "## Как воспроизвести",
    `1. Открыть дашборд → вкладка «Аудит» → выбрать репо \`${repo}\`.`,
    `2. Запустить Project Health и найти правило \`${finding.rule_id}\`.`,
    "",
    "---",
    `_Сгенерировано Project Health движком: ${generatedAt}_`,
  );

  return lines.join("\n");
}
