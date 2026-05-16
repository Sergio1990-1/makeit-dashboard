# Generated backend API types

Machine-generated TypeScript from the backends' FastAPI OpenAPI specs.
**Do not edit by hand** — regenerate.

## Regenerate

Both backend servers must be reachable.

```bash
# pipeline (makeit-pipeline, default http://127.0.0.1:8766)
npm run gen:api-types:pipeline

# auditor (makeit-auditor, default http://127.0.0.1:8765)
npm run gen:api-types:auditor

# both
npm run gen:api-types
```

Override the source with `PIPELINE_OPENAPI` / `AUDITOR_OPENAPI` env vars
(e.g. a captured `openapi.json` file, or a tunnelled URL).

## Status

- `pipeline.ts` — committed (generated against a running makeit-pipeline).
- `auditor.ts` — **not yet committed**: makeit-auditor was not running
  when this mechanism landed. Generate it once its server is reachable:
  `npm run gen:api-types:auditor`.

## Why

Tracks tech-debt #447. The six contract-drift bugs #433–#438 all came
from hand-written client types silently diverging from the backends.
These generated types are the source of truth for the wire contract;
client modules (`src/utils/{pipeline,auditor,transcript}.ts`) are being
migrated incrementally to derive from them so `tsc` catches drift —
see #447 for the migration backlog. Until a module is migrated, its
hand-written types remain authoritative for that module.

## CI consideration (follow-up, see #447)

A CI step that regenerates against a known spec and fails on a diff
would catch drift automatically. Not wired yet — needs a stable spec
source (captured fixture or reachable server) in CI.
