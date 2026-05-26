import { describe, it, expect } from "vitest";
import { validateProjectYaml } from "../../src/utils/health-engine";

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
