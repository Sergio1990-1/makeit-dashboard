export interface QualityBucket {
  total_pr: number;
  with_p0: number;           // PR с ≥1 P0 (BLOCKER, worst-wins absorbs P1+P2)
  with_p1_only: number;      // PR с P1, без P0
  with_p2_only: number;      // PR с P2, без P0 и P1
}

export interface RepoStatusEntry {
  status: "ok" | "error" | "stale";
  code?: string;
  message?: string;
}

export interface RepoQualityData {
  buckets: QualityBucket[];
  codex_coverage_pct: number;
  codex_first_seen: string | null;
}

export interface QualityBucketsMode {
  labels: string[];
  summary: QualityBucket[];
  per_repo: Record<string, RepoQualityData>;
}

export interface QualityPayload {
  schema_version: 1;
  generated_at: string;
  window_start: string;
  window_end: string;
  bucket_tz: "UTC";
  repo_status: Record<string, RepoStatusEntry>;
  buckets: {
    "30d": QualityBucketsMode;
    "12w": QualityBucketsMode;
  };
}

export type PeriodMode = "30d" | "12w";

export type AnnotationCategory = "skill" | "deploy" | "manual";
export type AnnotationScope = "global" | "repo";

export interface Annotation {
  id: string;                              // UUID v4
  occurred_at: string;                     // UTC ISO8601
  category: AnnotationCategory;
  scope: AnnotationScope;
  repos: string[] | null;
  title: string;
  desc: string;
  created_by: string;
  created_at: string;
}

export interface AnnotationCreatePayload {
  occurred_at: string;
  category: AnnotationCategory;
  scope: AnnotationScope;
  repos?: string[];
  title: string;
  desc: string;
}
