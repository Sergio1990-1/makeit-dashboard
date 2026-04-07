/**
 * Parsers for PRD and Epic markdown files from makeit-pipeline docs/.
 */

import type { PrdData, EpicData, EpicTask } from "../types";

// ── PRD parsing ──

export function parsePrdMd(id: string, md: string): PrdData {
  const titleMatch = md.match(/^#\s+(.+)/m);
  const statusMatch = md.match(/Статус:\s*(.+)/i);
  const authorMatch = md.match(/Автор:\s*(.+)/i);
  const dateMatch = md.match(/Дата:\s*(.+)/i);
  const priorityMatch = md.match(/Приоритет:\s*(.+)/i);

  return {
    id,
    title: titleMatch?.[1]?.trim() ?? id,
    status: statusMatch?.[1]?.trim() ?? "draft",
    author: authorMatch?.[1]?.trim() ?? "",
    date: dateMatch?.[1]?.trim() ?? "",
    priority: priorityMatch?.[1]?.trim() ?? "",
  };
}

// ── Epic parsing ──

function parseTasksTable(md: string): EpicTask[] {
  const tasks: EpicTask[] = [];
  let inTable = false;
  let headerPassed = false;

  for (const line of md.split("\n")) {
    const stripped = line.trim();

    // Detect table start: look for "Задач" section header or table with # column
    if (stripped.startsWith("## ") && stripped.toLowerCase().includes("задач")) {
      inTable = true;
      continue;
    }

    // Exit on next section
    if (inTable && stripped.startsWith("## ") && !stripped.toLowerCase().includes("задач")) {
      break;
    }

    if (!inTable || !stripped.includes("|")) continue;

    const cells = stripped.split("|").map((c) => c.trim()).filter(Boolean);
    if (!cells.length) continue;

    // Skip separator row
    if (cells.every((c) => /^[-:]+$/.test(c))) {
      headerPassed = true;
      continue;
    }

    // Skip header row
    if (!headerPassed) {
      headerPassed = false; // will be set on separator
      continue;
    }

    // Parse data row — format varies, but first cell is #, second is title
    if (cells.length >= 2) {
      const num = cells[0].replace(/^#?\s*/, "").trim();
      const title = cells[1].trim();
      const deps = cells.length > 2 ? cells[2].trim() : "—";
      // Size is typically 4th or 5th column depending on "Параллельно" column
      const sizeCell = cells.find((c) => /^[SMLX]{1,2}$/.test(c.trim()));
      const repoCell = cells[cells.length - 1]?.trim();

      tasks.push({
        number: num,
        title,
        dependencies: deps === "—" ? "" : deps,
        size: sizeCell?.trim() ?? "",
        repo: repoCell && !["да", "нет", "S", "M", "L", "XL"].includes(repoCell) ? repoCell : "",
      });
    }
  }

  return tasks;
}

export function parseEpicMd(id: string, md: string): EpicData {
  const titleMatch = md.match(/^#\s+(.+)/m);
  const prdMatch = md.match(/PRD:\s*(.+)/i);
  const milestoneMatch = md.match(/Milestone:\s*(.+)/i);
  const deadlineMatch = md.match(/Дедлайн:\s*(.+)/i);
  const statusMatch = md.match(/Статус:\s*(.+)/i);
  const priorityMatch = md.match(/Приоритет:\s*(.+)/i);

  // Extract overview: first paragraph after "## Обзор"
  const overviewMatch = md.match(/## Обзор\s*\n+([^\n#]+)/);

  return {
    id,
    title: titleMatch?.[1]?.trim() ?? id,
    prd: prdMatch?.[1]?.trim() ?? "",
    milestone: milestoneMatch?.[1]?.trim() ?? "",
    deadline: deadlineMatch?.[1]?.trim() ?? "",
    epicStatus: statusMatch?.[1]?.trim() ?? "planning",
    priority: priorityMatch?.[1]?.trim() ?? "",
    overview: overviewMatch?.[1]?.trim() ?? "",
    tasks: parseTasksTable(md),
  };
}
