import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateProjectYaml,
  getProjectYaml,
  resolveArtifactPath,
  summarizeDiscovery,
  type RunCtx,
} from "../../src/utils/health-engine";
import type { ChecklistDocument, ProjectClassification } from "../../src/types/health";
import * as github from "../../src/utils/github-actions";

// Mocked во всех тестах ниже. Per-test override через mockResolvedValue/mockRejectedValue.
vi.mock("../../src/utils/github-actions", async () => {
  const actual = await vi.importActual<typeof import("../../src/utils/github-actions")>(
    "../../src/utils/github-actions",
  );
  return { ...actual, readRepoFile: vi.fn() };
});

// ─── Fixtures на основе трёх retrofitted simple-проектов (2026-05-26) ─────
// Business-News, makeit-dashboard, makeit-auditor — все complexity: simple,
// discovery.status: not_required + market_research:null + na_reason set.
// Codex review d118a6a coverage gap: «include fixtures/tests using the three
// retrofitted shapes before mass retrofit».

const FIXTURE_BUSINESS_NEWS = {
  version: 1,
  project_name: "Business-News",
  created_at: "2026-03-16",
  complexity: "simple",
  discovery: {
    status: "not_required",
    completed_at: "2026-05-26",
    interviewer: "makeit-discovery@v1",
    artifacts: {
      brief: "docs/briefs/BRIEF-001.md",
      market_research: null,
      market_research_na_reason: "Внутренний контент-инструмент для @uchet_plus_news; конкурентов нет",
      overview: "docs/OVERVIEW.md",
    },
    review_due: "2026-08-26",
  },
  domain: {
    key_entities: ["Source", "RawNews", "FactObject", "Post"],
    key_actors: ["Reader", "Editor", "Publisher_Agent"],
  },
};

const FIXTURE_MAKEIT_DASHBOARD = {
  version: 1,
  project_name: "makeit-dashboard",
  created_at: "2026-03-25",
  complexity: "simple",
  discovery: {
    status: "not_required",
    completed_at: "2026-05-26",
    interviewer: "makeit-discovery@v1",
    artifacts: {
      brief: "docs/BRIEF.md", // exception — historical path, не briefs/BRIEF-001.md
      market_research: null,
      market_research_na_reason: "Внутренний инструмент команды MakeIT для портфельного мониторинга",
      overview: "docs/OVERVIEW.md",
    },
    review_due: "2026-08-26",
  },
};

const FIXTURE_MAKEIT_AUDITOR = {
  version: 1,
  project_name: "makeit-auditor",
  created_at: "2026-03-30",
  complexity: "simple",
  discovery: {
    status: "not_required",
    completed_at: "2026-05-26",
    interviewer: "makeit-discovery@v1",
    artifacts: {
      brief: "docs/briefs/BRIEF-001.md",
      market_research: null,
      market_research_na_reason: "Внутренний инструмент аудита MakeIT-проектов; не коммерческий продукт",
      overview: "docs/OVERVIEW.md",
    },
    review_due: "2026-08-26",
  },
};

// Hypothetical transactional fixture (для будущего P1 retrofit, например mankassa-app).
const FIXTURE_TRANSACTIONAL_FULL = {
  version: 1,
  project_name: "mankassa-app",
  created_at: "2026-02-14",
  complexity: "transactional",
  discovery: {
    status: "completed",
    completed_at: "2026-05-26",
    interviewer: "makeit-discovery@v1",
    artifacts: {
      brief: "docs/briefs/BRIEF-001.md",
      market_research: "docs/research/market-research-2026-05-26.md",
      market_research_na_reason: null,
      overview: "docs/OVERVIEW.md",
      operating_model: "docs/OPERATING_MODEL.md",
      state_machines: "docs/STATE_MACHINES.md",
      invariants: "docs/INVARIANTS.md",
      source_of_truth: "docs/SOURCE_OF_TRUTH_MAP.md",
      business_process: "docs/business_process.yaml",
    },
    review_due: "2026-08-26",
  },
};

describe("validateProjectYaml — happy paths (3 retrofitted shapes)", () => {
  it("Business-News: simple/not_required с market_research:null + na_reason", () => {
    const res = validateProjectYaml(FIXTURE_BUSINESS_NEWS);
    expect(res.kind).toBe("loaded");
    if (res.kind === "loaded") {
      expect(res.data.complexity).toBe("simple");
      expect(res.data.discovery.status).toBe("not_required");
    }
  });
  it("makeit-dashboard: BRIEF на нестандартном пути (исторический exception)", () => {
    const res = validateProjectYaml(FIXTURE_MAKEIT_DASHBOARD);
    expect(res.kind).toBe("loaded");
    if (res.kind === "loaded") {
      expect(res.data.discovery.artifacts?.brief).toBe("docs/BRIEF.md");
    }
  });
  it("makeit-auditor: канонический simple short-path", () => {
    expect(validateProjectYaml(FIXTURE_MAKEIT_AUDITOR).kind).toBe("loaded");
  });
  it("transactional full с заполненным market_research", () => {
    const res = validateProjectYaml(FIXTURE_TRANSACTIONAL_FULL);
    expect(res.kind).toBe("loaded");
    if (res.kind === "loaded") {
      expect(res.data.complexity).toBe("transactional");
      expect(res.data.discovery.artifacts?.market_research).toBe("docs/research/market-research-2026-05-26.md");
      expect(res.data.discovery.artifacts?.market_research_na_reason).toBeNull();
    }
  });
});

describe("validateProjectYaml — structural failures", () => {
  it("rejects non-object root", () => {
    expect(validateProjectYaml(null).kind).toBe("invalid");
    expect(validateProjectYaml([1, 2, 3]).kind).toBe("invalid");
    expect(validateProjectYaml("string").kind).toBe("invalid");
  });
  it("rejects version != 1", () => {
    const bad = { ...FIXTURE_BUSINESS_NEWS, version: 2 };
    const res = validateProjectYaml(bad);
    expect(res.kind).toBe("invalid");
    if (res.kind === "invalid") expect(res.reason).toMatch(/version/);
  });
  it("rejects missing project_name", () => {
    const bad: Record<string, unknown> = { ...FIXTURE_BUSINESS_NEWS };
    delete bad.project_name;
    expect(validateProjectYaml(bad).kind).toBe("invalid");
  });
  it("rejects complexity not in enum", () => {
    const bad = { ...FIXTURE_BUSINESS_NEWS, complexity: "moderate" };
    const res = validateProjectYaml(bad);
    expect(res.kind).toBe("invalid");
    if (res.kind === "invalid") expect(res.reason).toMatch(/complexity/);
  });
  it("rejects discovery.status not in enum", () => {
    const bad = {
      ...FIXTURE_BUSINESS_NEWS,
      discovery: { ...FIXTURE_BUSINESS_NEWS.discovery, status: "done" },
    };
    const res = validateProjectYaml(bad);
    expect(res.kind).toBe("invalid");
    if (res.kind === "invalid") expect(res.reason).toMatch(/discovery.status/);
  });
  it("rejects missing discovery block", () => {
    const bad: Record<string, unknown> = { ...FIXTURE_BUSINESS_NEWS };
    delete bad.discovery;
    expect(validateProjectYaml(bad).kind).toBe("invalid");
  });
});

describe("validateProjectYaml — paired market_research XOR contract (Codex P2)", () => {
  it("rejects both null (forgot to fill)", () => {
    const bad = {
      ...FIXTURE_BUSINESS_NEWS,
      discovery: {
        ...FIXTURE_BUSINESS_NEWS.discovery,
        artifacts: {
          ...FIXTURE_BUSINESS_NEWS.discovery.artifacts,
          market_research: null,
          market_research_na_reason: null,
        },
      },
    };
    const res = validateProjectYaml(bad);
    expect(res.kind).toBe("invalid");
    if (res.kind === "invalid") expect(res.reason).toMatch(/market_research/);
  });
  it("rejects both filled (double-write)", () => {
    const bad = {
      ...FIXTURE_BUSINESS_NEWS,
      discovery: {
        ...FIXTURE_BUSINESS_NEWS.discovery,
        artifacts: {
          ...FIXTURE_BUSINESS_NEWS.discovery.artifacts,
          market_research: "docs/research/something.md",
          market_research_na_reason: "Контрадикция",
        },
      },
    };
    const res = validateProjectYaml(bad);
    expect(res.kind).toBe("invalid");
    if (res.kind === "invalid") expect(res.reason).toMatch(/взаимоисключающие/);
  });
  it("accepts research present + na_reason null (full discovery path)", () => {
    expect(validateProjectYaml(FIXTURE_TRANSACTIONAL_FULL).kind).toBe("loaded");
  });
  it("accepts research null + na_reason set (short-path)", () => {
    expect(validateProjectYaml(FIXTURE_MAKEIT_AUDITOR).kind).toBe("loaded");
  });
  it("rejects empty-string na_reason as still missing", () => {
    const bad = {
      ...FIXTURE_BUSINESS_NEWS,
      discovery: {
        ...FIXTURE_BUSINESS_NEWS.discovery,
        artifacts: {
          ...FIXTURE_BUSINESS_NEWS.discovery.artifacts,
          market_research: null,
          market_research_na_reason: "",
        },
      },
    };
    expect(validateProjectYaml(bad).kind).toBe("invalid");
  });
});

describe("validateProjectYaml — edge cases", () => {
  it("accepts in_progress status (validation_failures live in detail)", () => {
    const inProgress = {
      ...FIXTURE_BUSINESS_NEWS,
      discovery: {
        ...FIXTURE_BUSINESS_NEWS.discovery,
        status: "in_progress",
        last_validation_at: "2026-05-26",
        validation_failures: ["STATE_MACHINES.md inconsistency"],
      },
    };
    expect(validateProjectYaml(inProgress).kind).toBe("loaded");
  });
  it("accepts artifacts block без market_research keys (только brief+overview)", () => {
    // Если короткая ветка вообще без market_research (даже null+reason не указали) —
    // это валидно если оба ключа отсутствуют в artifacts (paired-проверка не срабатывает).
    const minimal = {
      ...FIXTURE_BUSINESS_NEWS,
      discovery: {
        ...FIXTURE_BUSINESS_NEWS.discovery,
        artifacts: {
          brief: "docs/briefs/BRIEF-001.md",
          overview: "docs/OVERVIEW.md",
        },
      },
    };
    expect(validateProjectYaml(minimal).kind).toBe("loaded");
  });
  it("accepts no artifacts block at all", () => {
    const noArts: Record<string, unknown> = {
      ...FIXTURE_BUSINESS_NEWS,
      discovery: { status: "not_required" },
    };
    expect(validateProjectYaml(noArts).kind).toBe("loaded");
  });
});

// ═══ Helpers для интеграционных тестов (RunCtx) ═══════════════════════════

const STUB_CLASSIFICATION: ProjectClassification = { tier: 2, complex: false, client: false };
const STUB_DOC: ChecklistDocument = {
  version: 1,
  updated: "2026-05-26",
  authoritative_sources: [],
  project_classification: { "test-repo": STUB_CLASSIFICATION },
  settings: {
    grace_period_days: 3,
    freshness_business_doc_max_age_days: 15,
    freshness_business_doc_max_closed_issues_since: 50,
    freshness_tech_doc_max_age_days: 90,
    freshness_meaningful_change_min_lines: 10,
    issues_no_milestone_threshold: 5,
    pr_doc_drift_window_days: 30,
    pr_doc_drift_max_count: 3,
    coverage_thresholds: { tier_2: 40, tier_1: 60, tier_1_complex: 70 },
    discovery_review_due_days: 90,
  },
  severity_weights: { critical: 10, high: 5, medium: 3, low: 1 },
  no_grace_severities: ["critical"],
  check_types_supported: [],
  rules: [],
};

function makeCtx(overrides: Partial<RunCtx> = {}): RunCtx {
  return {
    token: "test-token",
    owner: "test-owner",
    repo: "test-repo",
    classification: STUB_CLASSIFICATION,
    doc: STUB_DOC,
    dirCache: new Map(),
    inGrace: false,
    ...overrides,
  };
}

const VALID_YAML_TEXT = `version: 1
project_name: test-repo
complexity: simple
discovery:
  status: not_required
  completed_at: 2026-05-26
  review_due: 2026-08-26
  artifacts:
    brief: docs/briefs/BRIEF-001.md
    market_research: null
    market_research_na_reason: "Internal tool"
    overview: docs/OVERVIEW.md
`;

beforeEach(() => {
  vi.mocked(github.readRepoFile).mockReset();
});

// ═══ getProjectYaml: error mapping (D1) ════════════════════════════════════

describe("getProjectYaml — distinguishes 404 from auth/server errors (D1)", () => {
  it("maps GitHub API 404 to { kind: 'missing' } — legacy project ok", async () => {
    vi.mocked(github.readRepoFile).mockRejectedValueOnce(new Error("GitHub API 404"));
    const ctx = makeCtx();
    const state = await getProjectYaml(ctx);
    expect(state).toEqual({ kind: "missing" });
  });

  it("maps token-expired (401/403) to { kind: 'invalid', reason: ... }", async () => {
    vi.mocked(github.readRepoFile).mockRejectedValueOnce(
      new Error("GitHub token истёк или недостаточно прав. Сбросьте токен и введите новый."),
    );
    const ctx = makeCtx();
    const state = await getProjectYaml(ctx);
    expect(state.kind).toBe("invalid");
    if (state.kind === "invalid") expect(state.reason).toMatch(/истёк/);
  });

  it("maps 5xx to { kind: 'invalid' } — not silently swallowed as missing", async () => {
    vi.mocked(github.readRepoFile).mockRejectedValueOnce(new Error("GitHub API 503"));
    const ctx = makeCtx();
    const state = await getProjectYaml(ctx);
    expect(state.kind).toBe("invalid");
    if (state.kind === "invalid") expect(state.reason).toMatch(/503/);
  });

  it("propagates AbortError up — cancelled scan must not pollute cache", async () => {
    const ab = new Error("Aborted");
    ab.name = "AbortError";
    vi.mocked(github.readRepoFile).mockRejectedValueOnce(ab);
    const ctx = makeCtx();
    await expect(getProjectYaml(ctx)).rejects.toThrow();
  });

  it("returns { kind: 'invalid' } on YAML parse failure", async () => {
    vi.mocked(github.readRepoFile).mockResolvedValueOnce(":\n bad: : yaml\n  -");
    const ctx = makeCtx();
    const state = await getProjectYaml(ctx);
    expect(state.kind).toBe("invalid");
    if (state.kind === "invalid") expect(state.reason).toMatch(/YAML parse/);
  });

  it("caches result per scan — second call does not re-fetch", async () => {
    vi.mocked(github.readRepoFile).mockResolvedValueOnce(VALID_YAML_TEXT);
    const ctx = makeCtx();
    const first = await getProjectYaml(ctx);
    const second = await getProjectYaml(ctx);
    expect(first).toBe(second); // same promise resolution
    expect(vi.mocked(github.readRepoFile).mock.calls.length).toBe(1);
  });
});

// ═══ resolveArtifactPath: artifact_key invariants (D2) ══════════════════════

describe("resolveArtifactPath — artifact_key resolution + invalid_key guard (D2)", () => {
  it("returns fallback when no artifact_key given (legacy rule)", async () => {
    const ctx = makeCtx();
    const r = await resolveArtifactPath(ctx, undefined, "docs/LEGACY.md");
    expect(r).toEqual({ path: "docs/LEGACY.md", source: "fallback" });
  });

  it("flags invalid artifact_key (typo) — returns source 'invalid_key'", async () => {
    const ctx = makeCtx();
    // Cast как unknown — TS не пропустит invalid строку, симулируем YAML-typo
    const r = await resolveArtifactPath(ctx, "breif" as never, "docs/LEGACY.md");
    expect(r.source).toBe("invalid_key");
    expect(r.invalid_key_warning).toMatch(/breif/);
    expect(r.path).toBe("docs/LEGACY.md"); // graceful fallback
  });

  it("returns fallback when project.yaml missing", async () => {
    vi.mocked(github.readRepoFile).mockRejectedValueOnce(new Error("GitHub API 404"));
    const ctx = makeCtx();
    const r = await resolveArtifactPath(ctx, "brief", "docs/LEGACY.md");
    expect(r).toEqual({ path: "docs/LEGACY.md", source: "fallback" });
  });

  it("uses path from artifacts when present", async () => {
    vi.mocked(github.readRepoFile).mockResolvedValueOnce(VALID_YAML_TEXT);
    const ctx = makeCtx();
    const r = await resolveArtifactPath(ctx, "brief", "docs/LEGACY.md");
    expect(r).toEqual({ path: "docs/briefs/BRIEF-001.md", source: "project_yaml" });
  });

  it("flags intentional_skip when artifact value is null (e.g. market_research)", async () => {
    vi.mocked(github.readRepoFile).mockResolvedValueOnce(VALID_YAML_TEXT);
    const ctx = makeCtx();
    const r = await resolveArtifactPath(ctx, "market_research", "docs/research/fallback.md");
    expect(r.intentional_skip).toBe(true);
    expect(r.source).toBe("project_yaml");
  });

  it("falls back when artifact key missing from artifacts block", async () => {
    vi.mocked(github.readRepoFile).mockResolvedValueOnce(VALID_YAML_TEXT);
    const ctx = makeCtx();
    // operating_model отсутствует в YAML (simple проект)
    const r = await resolveArtifactPath(ctx, "operating_model", "docs/OPERATING_MODEL.md");
    expect(r).toEqual({ path: "docs/OPERATING_MODEL.md", source: "fallback" });
  });
});

// ═══ summarizeDiscovery: date math + NaN unification (D3) ═══════════════════

describe("summarizeDiscovery — date math + Invalid Date handling (D3)", () => {
  it("returns { status: 'missing' } when project.yaml absent", async () => {
    vi.mocked(github.readRepoFile).mockRejectedValueOnce(new Error("GitHub API 404"));
    const ctx = makeCtx();
    const summary = await summarizeDiscovery(ctx);
    expect(summary).toEqual({ status: "missing" });
  });

  it("returns { status: 'invalid' } when project.yaml is broken", async () => {
    vi.mocked(github.readRepoFile).mockResolvedValueOnce("not: : valid: yaml");
    const ctx = makeCtx();
    const summary = await summarizeDiscovery(ctx);
    expect(summary).toEqual({ status: "invalid" });
  });

  it("fresh=true when status green AND review_due in future", async () => {
    // 100 years in the future
    const futureYaml = VALID_YAML_TEXT.replace("review_due: 2026-08-26", "review_due: 2126-01-01");
    vi.mocked(github.readRepoFile).mockResolvedValueOnce(futureYaml);
    const summary = await summarizeDiscovery(makeCtx());
    expect(summary.fresh).toBe(true);
    expect(summary.status).toBe("not_required");
  });

  it("fresh=false when status green AND review_due in past (stale)", async () => {
    const pastYaml = VALID_YAML_TEXT.replace("review_due: 2026-08-26", "review_due: 2020-01-01");
    vi.mocked(github.readRepoFile).mockResolvedValueOnce(pastYaml);
    const summary = await summarizeDiscovery(makeCtx());
    expect(summary.fresh).toBe(false);
  });

  it("fresh=undefined when review_due is Invalid Date (NaN) — D3 unification", async () => {
    // "not-a-date" parses to Invalid Date
    const badYaml = VALID_YAML_TEXT.replace("review_due: 2026-08-26", "review_due: 'not-a-date'");
    vi.mocked(github.readRepoFile).mockResolvedValueOnce(badYaml);
    const summary = await summarizeDiscovery(makeCtx());
    expect(summary.fresh).toBeUndefined();
    expect(summary.review_due).toBeUndefined();
  });

  it("computes review_due from completed_at + default 90d when explicit absent", async () => {
    const yamlNoReviewDue = VALID_YAML_TEXT.replace("\n  review_due: 2026-08-26", "");
    vi.mocked(github.readRepoFile).mockResolvedValueOnce(yamlNoReviewDue);
    const summary = await summarizeDiscovery(makeCtx());
    // completed_at 2026-05-26 + 90д = 2026-08-24
    expect(summary.review_due).toBe("2026-08-24");
  });

  it("fresh=true on green status with no completed_at and no review_due (synthetic case)", async () => {
    const minimalYaml = `version: 1
project_name: test
complexity: simple
discovery:
  status: not_required
`;
    vi.mocked(github.readRepoFile).mockResolvedValueOnce(minimalYaml);
    const summary = await summarizeDiscovery(makeCtx());
    expect(summary.fresh).toBe(true);
  });

  it("fresh=false for in_progress regardless of dates", async () => {
    const inProgressYaml = VALID_YAML_TEXT.replace(
      "status: not_required",
      "status: in_progress\n  validation_failures:\n    - 'Some failure'",
    );
    vi.mocked(github.readRepoFile).mockResolvedValueOnce(inProgressYaml);
    const summary = await summarizeDiscovery(makeCtx());
    expect(summary.fresh).toBe(false);
    expect(summary.status).toBe("in_progress");
    expect(summary.validation_failures).toEqual(["Some failure"]);
  });
});
