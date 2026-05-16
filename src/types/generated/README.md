# Generated backend API types

Machine-generated TypeScript from the backends' FastAPI OpenAPI specs.
**Do not edit by hand** — regenerate (CI fails on hand-edits / generator
drift, see below).

## Source of truth: committed snapshots

The backend is the source of truth for the wire contract (#447). To make
generation **deterministic, offline and CI-safe**, the OpenAPI specs are
captured as pinned snapshots committed next to the generated types:

- `auditor.openapi.json` — pinned makeit-auditor spec
- `pipeline.openapi.json` — pinned makeit-pipeline spec

`npm run gen:api-types` reads these committed JSON snapshots (NOT a live
backend), so it needs no network and produces the same output everywhere
(local, CI, a teammate's machine).

```bash
npm run gen:api-types           # regenerate both .ts from committed snapshots
npm run gen:api-types:auditor   # auditor only
npm run gen:api-types:pipeline  # pipeline only
```

## Refreshing a snapshot (when a backend legitimately changes)

When a backend's contract genuinely changes, refresh the pinned snapshot
from the live backend, regenerate, eyeball the diff, and commit:

```bash
# 1. Pull the live spec into the committed snapshot
#    (auditor default http://127.0.0.1:8765, pipeline default :8766;
#     override with AUDITOR_OPENAPI / PIPELINE_OPENAPI)
npm run snapshot:api:auditor       # or :pipeline, or `npm run snapshot:api` for both

# 2. Regenerate the .ts from the refreshed snapshot
npm run gen:api-types

# 3. Review + commit BOTH the .openapi.json snapshot and the .ts together
git add src/types/generated/*.openapi.json src/types/generated/*.ts
```

`snapshot:api:*` uses `curl -fsS`, so it fails loudly if the backend is
unreachable rather than writing a truncated/empty spec.

## CI drift-check

`.github/workflows/ci.yml` runs `npm run gen:api-types` and then
`git diff --exit-code` on the generated `.ts` files. The build **fails**
if the committed generated types don't match regenerating from the
committed snapshots. This catches hand-edits and generator-version drift.
It needs **no network** — it regenerates from the committed JSON snapshots,
never from a live backend.

## Why

Tracks tech-debt #447. The contract-drift bugs #433–#438 all came from
hand-written client types silently diverging from the backends. These
generated types are the source of truth for the wire contract; client
modules (`src/utils/{auditor,pipeline,transcript}.ts`) are migrated
incrementally to derive from them so `tsc` catches drift.

## Migration status (incremental — see #447)

- `auditor.ts` — **migrated**. `src/utils/auditor.ts` and the audit types
  in `src/types/index.ts` (`AuditFinding`, `Severity`, `FindingCategory`,
  `FindingSource`, `Verdict`, `VerificationResult`, and the
  `AuditMetaRequest` / `VerificationReportRequest` request bodies) now
  derive from `auditor.ts`. Backend-vs-frontend drift found during this
  migration (e.g. `FindingCategory` gained `accessibility`/`ux_design`,
  `Finding.code_snippet`, required `not_a_bug_count`, optional
  `VerificationResult.line`) was reconciled toward the backend.
- `pipeline.ts` — generated + snapshot committed, **client not yet
  migrated** (`src/utils/pipeline.ts` still hand-written). Follow-up PR
  under #447.
- transcript client (`src/utils/transcript.ts`) — **not yet migrated**.
  Follow-up PR under #447. (Transcript endpoints live on the pipeline
  backend, covered by `pipeline.openapi.json`.)
