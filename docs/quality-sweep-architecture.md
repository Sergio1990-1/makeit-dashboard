# Quality Sweep Architecture

How the «Качество кода» tab gets its data, and why it's split into two
independent moving parts.

## Data flow

```
┌────────────────────────┐         ┌───────────────────────────┐
│  GitHub Actions cron   │  rsync  │  VPS /opt/apps/makeit-    │
│  codex-quality-sweep   │ ──────▶ │  stack/web/data/          │
│  scripts/sweep_...py   │ + ssh   │  ├─ codex-quality.json    │
│  (read-only, 1×/day)   │   mv    │  └─ annotations.json      │
└────────────────────────┘         │     (also backups/)       │
                                   └─────────────┬─────────────┘
                                                 │ nginx (Basic Auth)
                                                 │
                       ┌─────────────────────────┴───────────────────────────┐
                       │                                                     │
                       ▼                                                     ▼
            /data/codex-quality.json (static)            /api/annotations (FastAPI)
                       │                                                     │
                       │                                                     ▼
                       │                                       annotations-api container
                       │                                       (writes annotations.json
                       │                                        with FileLock + snapshots)
                       │
                       ▼
            React «Качество кода» tab
            (src/hooks/useCodexQuality.ts)
```

## Why two halves

The aggregated chart (Codex review findings per PR) and the manual
timeline events (deploys, skill updates) have very different ownership:

| | Chart data | Manual events |
|--|--|--|
| Source of truth | GitHub PR comments | User typing into a modal |
| Write cadence | Once a day | A few times a week |
| Write client | GitHub Actions | Any browser the team is using |
| Failure mode | Stale chart (banner says so) | "Save failed" toast |
| Recovery | Re-run workflow_dispatch | Restore from `annotations.backups/` |

Mixing them into one backend would mean a Pipeline Mac outage took out
manual annotations too; splitting them means each side fails on its
own schedule.

## Component map

| Path | Owner | What it does |
|--|--|--|
| `.github/workflows/codex-quality-sweep.yml` | Actions | Daily cron + manual dispatch button. |
| `scripts/sweep_codex_quality.py` | Actions runner | Pull merged PRs across 12 repos, classify codex review severity, write aggregate JSON, rsync to VPS. |
| `scripts/test_sweep_codex_quality.py` | CI | Pure-function tests for severity / bucketization. |
| `annotations-api/` | VPS container | FastAPI; GET/POST/DELETE around a JSON file with FileLock + atomic rename + snapshots. |
| `src/utils/codex-quality.ts` | React app | Fetch helpers — chart from `/data/codex-quality.json`, events from `/api/annotations`. |
| `src/hooks/useCodexQuality.ts` | React app | Mounts both sources; tracks `unavailable` flag for "sweep hasn't run yet". |
| `src/components/quality/QualityTab.tsx` | React app | Renders chart + events; empty-state still lets you POST events even if sweep is missing. |

## Required GitHub secrets

Set under repo settings → Secrets and variables → Actions:

| Secret | Purpose | How to get it |
|--|--|--|
| `MAKEIT_FINE_GRAINED_PAT` | Cross-repo PR read for sweep. | github.com → Settings → Developer Settings → Personal access tokens → Fine-grained. **Resource owner: Sergio1990-1; Repository access: only the 12 repos listed in scripts/sweep_codex_quality.py REPOS; Permissions: Pull requests: Read, Contents: Read.** Default GITHUB_TOKEN won't work — it's scoped to this repo only. |
| `MAKEIT_VPS_HOST` | SSH host (no user, no port). | `89.167.17.79` or hostname. |
| `MAKEIT_VPS_USER` | SSH user. | Optional; defaults to `root`. |
| `MAKEIT_VPS_DATA_DIR` | Target directory on VPS. | Optional; defaults to `/opt/apps/makeit-stack/web/data`. |
| `MAKEIT_VPS_DEPLOY_KEY` | Private ed25519 key. | `ssh-keygen -t ed25519 -C "actions-sweep" -f sweep_deploy -N ""` — paste the **private** key here, install the public key into `~/.ssh/authorized_keys` of the VPS user. Limit with `command="rsync …"` and `from=` if you want belt-and-braces. |
| `MAKEIT_VPS_KNOWN_HOSTS` | SSH host key fingerprints. | Get with `ssh-keyscan -H <host>` from a trusted network and paste the full output. |

## First-time setup

1. Create the fine-grained PAT → set `MAKEIT_FINE_GRAINED_PAT` secret.
2. Create the deploy key pair → install pubkey on VPS, set the
   `MAKEIT_VPS_*` secrets.
3. On the VPS, create the data dir (if not already):
   ```
   mkdir -p /opt/apps/makeit-stack/web/data
   ```
4. Add the annotations-api container + nginx route — see
   [`annotations-api/README.md`](../annotations-api/README.md) for the
   exact compose / nginx snippets.
5. From this repo: trigger
   `Actions → codex-quality-sweep → Run workflow`. Inspect the run, the
   `Publish to VPS` step should succeed in under 30s.
6. Hit the dashboard — the «Качество кода» tab should now load the
   chart instead of the empty-state.

## Operating it

- Force a sweep: GitHub UI → Actions → `codex-quality-sweep` → "Run
  workflow". Useful after a backfill (e.g. you just installed the bot
  on a new repo) or to debug a stale chart.
- Inspect a published JSON: the workflow uploads `out/codex-quality.json`
  as a 14-day artifact on every run. Cheaper than SSHing to the VPS.
- Recover annotations: see "Disaster recovery" in
  [`annotations-api/README.md`](../annotations-api/README.md).

## Things that aren't here yet (and probably shouldn't be in v1)

- **Per-user identity / annotation auth.** Everything is
  `created_by: "shared-basic-auth"`. `device_hint` is a free-text label
  for UX, not security. If multi-author audit ever matters, add OIDC
  to nginx and pass the user to the API via a header.
- **Webhook-triggered sweep.** Cron is enough — the chart resolution is
  daily anyway.
- **Per-repo enable/disable in the UI.** The repo list lives in the
  sweep script. Update there, rerun, done.
- **Gist backups.** VPS-side `annotations.backups/` is the recovery
  path. If you later decide you want offsite backup, pick a private
  repo (not a public gist) and snapshot weekly.
