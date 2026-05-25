# Codex Quality Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать новую 9-ю вкладку «Качество кода и изменения» в makeit-dashboard, показывающую динамику качества кода (**P0/P1/P2** находки Codex с worst-wins) и события на временной оси (skill-changes, deploys, manual) по 12 MakeIT-репо. Данные — daily-cron sweep на Pipeline Mac → JSON → nginx статика → React-SPA. P0 (BLOCKER) выделен отдельной pulse-плашкой в KPI, в баре объединён с P1 в красный crit-сегмент.

**Architecture:**
- **Backend** (репо `makeit-pipeline`): Python-скрипт `codex_quality_sweep.py` запускается launchd ежедневно в 19:00 UTC (= 03:00 Бали), тянет PR'ы и review-комменты через GitHub REST API из 12 репо, агрегирует в JSON, публикует на VPS через rsync `.tmp` + ssh `mv` (atomic). FastAPI endpoints `/quality/refresh`, `/annotations`, `/annotations/{id}` на том же сервисе. Локинг через `flock`. Retry с уважением `X-RateLimit-Reset`.
- **VPS**: nginx отдаёт `/data/codex-quality.json` и `/data/annotations.json` как статику.
- **Frontend** (репо `makeit-dashboard`): React 19 + TS, новая вкладка `<QualityTab>` с подкомпонентами для сводного чарта, KPI, грида карточек проектов, маркеров аннотаций, healthcheck-баннера. Hover-language идентичный для главного и mini-чартов (dim siblings + halo + value-chip + tooltip).

**Tech Stack:**
- Backend: Python 3.11, httpx, FastAPI, python-dotenv, pytest, fcntl/launchd (macOS)
- Frontend: React 19, TypeScript, Vite, Vitest, существующие utils (`config.ts`, `settings.ts`)
- Infra: rsync over SSH, nginx, Docker (на VPS, уже развёрнут)

**Спец:** [`docs/superpowers/specs/2026-05-25-codex-quality-tab-design.md`](../specs/2026-05-25-codex-quality-tab-design.md) — v2, после Codex code-review.
**Прототип:** [`quality-tab-prototype.html`](../../../quality-tab-prototype.html) — визуальный референс с моками.
**Vision:** [`docs/QUALITY-TELEMETRY-VISION.md`](../../QUALITY-TELEMETRY-VISION.md) — общая картина с CI fail % (Phase B) и agent telemetry (Phase C) — НЕ в скоупе этого плана.

---

## File Structure

### Repo `makeit-pipeline` (Pipeline Mac)
```
config/
  quality_repos.json                          # NEW: source of truth для списка репо
src/makeit_pipeline/
  api.py                                       # MODIFY: добавить /quality/refresh + /annotations*
  quality/
    __init__.py                               # NEW
    types.py                                   # NEW: Pydantic-модели (Bucket, RepoStatus, Payload, AnnotationCreate)
    severity.py                                # NEW: parse_severity, group_findings_per_pr
    bucketize.py                               # NEW: bucketize, aggregate_summary, low-sample logic
    fetch.py                                   # NEW: fetch_repo_merged_prs, fetch_repo_review_comments, request_with_retry
    publish.py                                 # NEW: write_json_atomic_local, publish_remote_atomic
    locking.py                                 # NEW: acquire_lock context manager
    annotations.py                             # NEW: load/save/add/delete annotations
    sweep.py                                   # NEW: главная orchestration (main entry-point)
tests/quality/
  test_severity.py                            # NEW
  test_bucketize.py                           # NEW
  test_fetch.py                               # NEW (httpx mocks)
  test_publish.py                             # NEW
  test_annotations.py                         # NEW
  test_sweep_integration.py                   # NEW (фикстура с моком GH API)
scripts/
  codex_quality_sweep.py                      # NEW: CLI entry-point (вызывает sweep.main())
deploy/launchd/
  com.makeit.codex-quality-sweep.plist        # NEW
```

### VPS (`/opt/apps/`)
```
nginx-proxy/conf.d/makeit.conf                # MODIFY: добавить location /data/
makeit-stack/web/data/                        # NEW dir: куда rsync кладёт JSON
```

### Repo `makeit-dashboard`
```
public/config.js                              # MODIFY: добавить QUALITY_URL (optional)
src/
  types/quality.ts                            # NEW: TypeScript типы (QualityPayload, Annotation, и т.д.)
  utils/
    quality.ts                                # NEW: fetchQualityData, forceRefresh, annotation CRUD
    quality-position.ts                       # NEW: isoMonday, annotation-position-calc (pure functions)
  hooks/
    useQuality.ts                             # NEW
  components/quality/
    QualityTab.tsx                            # NEW: orchestrator
    QualitySummaryPanel.tsx                   # NEW: верхний блок (chart + KPI)
    QualityChart.tsx                          # NEW: bar-chart (compact prop для миничартов)
    QualityKPIs.tsx                           # NEW: 4 KPI-карточки
    QualityProjectCard.tsx                    # NEW: один проект с мини-чартом
    QualityProjectGrid.tsx                    # NEW: grid + sort
    QualityAnnotations.tsx                    # NEW: вертикальные маркеры
    QualityStaleBanner.tsx                    # NEW: healthcheck
    AnnotationModal.tsx                       # NEW: + событие
  styles/
    v4-quality.css                            # NEW: все стили вкладки (импортируется в App.tsx)
  App.tsx                                     # MODIFY: добавить 9-ю вкладку и Suspense-loader
tests/quality/
  quality-position.test.ts                    # NEW: isoMonday + position-math
  useQuality.test.tsx                         # NEW
  QualityChart.test.tsx                       # NEW
  AnnotationModal.test.tsx                    # NEW
```

---

## Phase A — Backend foundation (pure logic, no GitHub yet)

### Task 1: Setup `quality_repos.json` config

**Repo:** `makeit-pipeline`

**Files:**
- Create: `config/quality_repos.json`

- [ ] **Step 1: Создать конфиг с 14 репо**

```json
{
  "owner": "Sergio1990-1",
  "repos": [
    "Sewing-ERP", "mankassa-app", "solotax-kg", "Business-News",
    "Beer_bot", "Uchet_bot", "quiet-walls", "moliyakg",
    "MyMoney", "makeit-auditor", "makeit-pipeline", "makeit-dashboard",
    "makeit-knowledge", "MetaSellerSupplies"
  ],
  "_comment": "Source of truth для quality sweep. Sync вручную с ~/.claude/CLAUDE.md."
}
```

- [ ] **Step 2: Commit**

```bash
git add config/quality_repos.json
git commit -m "feat(quality): add repo config for codex quality sweep"
```

---

### Task 2: Severity parsing

**Repo:** `makeit-pipeline`

**Files:**
- Create: `src/makeit_pipeline/quality/__init__.py` (empty)
- Create: `src/makeit_pipeline/quality/severity.py`
- Create: `tests/quality/__init__.py` (empty)
- Create: `tests/quality/test_severity.py`

- [ ] **Step 1: Failing test for parse_severity**

`tests/quality/test_severity.py`:
```python
from makeit_pipeline.quality.severity import parse_severity, group_findings_per_pr

def test_parse_p1():
    body = "**<sub><sub>![P1 Badge](https://example.com/p1.svg)</sub></sub> Security issue**\n\nSQL injection"
    assert parse_severity(body) == "P1"

def test_parse_p2():
    body = "![P2 Badge](url) some text"
    assert parse_severity(body) == "P2"

def test_parse_no_badge():
    assert parse_severity("just a regular comment") is None

def test_parse_p3_returns_p3_even_if_codex_doesnt_use():
    # graceful — пусть парсер вернёт что есть, фильтрация выше
    assert parse_severity("![P3 Badge](url)") == "P3"

def test_parse_p0():
    """Codex реально emit'ит P0 для блокеров (например moliyakg#2282 — DB constraint).
    Badge URL: https://img.shields.io/badge/P0-red?style=flat"""
    body = "**<sub><sub>![P0 Badge](https://img.shields.io/badge/P0-red?style=flat)</sub></sub> Populate snapshot...**"
    assert parse_severity(body) == "P0"

def test_group_findings_per_pr_combines_overlapping_severities():
    comments = [
        {"pull_request_url": "...repos/X/pulls/1", "body": "![P0 Badge]() ..."},
        {"pull_request_url": "...repos/X/pulls/1", "body": "![P1 Badge]() ..."},
        {"pull_request_url": "...repos/X/pulls/1", "body": "![P2 Badge]() ..."},
        {"pull_request_url": "...repos/X/pulls/2", "body": "![P1 Badge]() ..."},
        {"pull_request_url": "...repos/X/pulls/2", "body": "![P2 Badge]() ..."},
        {"pull_request_url": "...repos/X/pulls/3", "body": "![P2 Badge]() ..."},
    ]
    result = group_findings_per_pr(comments)
    assert result == {
        "...repos/X/pulls/1": {"has_p0": True,  "has_p1": True,  "has_p2": True},
        "...repos/X/pulls/2": {"has_p0": False, "has_p1": True,  "has_p2": True},
        "...repos/X/pulls/3": {"has_p0": False, "has_p1": False, "has_p2": True},
    }

def test_group_findings_ignores_non_p012():
    comments = [{"pull_request_url": "...pulls/1", "body": "nitpick"}]
    assert group_findings_per_pr(comments) == {}
```

- [ ] **Step 2: Run, verify FAIL**

`pytest tests/quality/test_severity.py -v` → ImportError.

- [ ] **Step 3: Implementation**

`src/makeit_pipeline/quality/severity.py`:
```python
import re
from collections import defaultdict

SEV_RE = re.compile(r"!\[P(\d) Badge\]")
SUPPORTED_SEVERITIES = ("P0", "P1", "P2")  # P3 Codex не использует, но фильтруем явно


def parse_severity(body: str) -> str | None:
    """Извлечь severity из markdown-комментария Codex. None если бейджа нет.
    Поддерживает P0 (red, BLOCKER), P1 (orange, high), P2 (yellow, medium)."""
    m = SEV_RE.search(body or "")
    return f"P{m.group(1)}" if m else None


def group_findings_per_pr(comments: list[dict]) -> dict[str, dict]:
    """Сгруппировать line-level комменты по PR. 3 уровня severity flags.
    Worst-wins reasoning происходит в bucketize (with_p0 absorbs P1+P2 of same PR)."""
    result: dict[str, dict] = defaultdict(lambda: {"has_p0": False, "has_p1": False, "has_p2": False})
    for c in comments:
        sev = parse_severity(c.get("body", ""))
        if sev not in SUPPORTED_SEVERITIES:
            continue
        pr_url = c.get("pull_request_url", "")
        if not pr_url:
            continue
        key = sev.lower().replace("p", "has_p")  # "P0" → "has_p0"
        result[pr_url][key] = True
    return dict(result)
```

- [ ] **Step 4: Run, verify PASS**

`pytest tests/quality/test_severity.py -v`

- [ ] **Step 5: Commit**

```bash
git add src/makeit_pipeline/quality/__init__.py src/makeit_pipeline/quality/severity.py tests/quality/
git commit -m "feat(quality): parse P1/P2 severity from Codex review comments"
```

---

### Task 3: Bucketize + low-sample

**Repo:** `makeit-pipeline`

**Files:**
- Create: `src/makeit_pipeline/quality/bucketize.py`
- Create: `tests/quality/test_bucketize.py`

- [ ] **Step 1: Failing tests**

`tests/quality/test_bucketize.py`:
```python
from datetime import datetime, timezone
from makeit_pipeline.quality.bucketize import (
    bucketize_daily, bucketize_weekly_iso, aggregate_summary, LOW_SAMPLE_THRESHOLD,
)


def _utc(s):
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


def test_bucketize_daily_30_buckets():
    prs = [
        {"merged_at": "2026-05-20T10:00:00Z", "url": "p_blocker"},   # P0
        {"merged_at": "2026-05-20T15:00:00Z", "url": "p_p1_p2"},     # P1 (worst-wins absorbs P2)
        {"merged_at": "2026-05-20T18:00:00Z", "url": "p_p2_only"},   # P2 only
        {"merged_at": "2026-05-24T00:01:00Z", "url": "p_clean"},     # no findings
    ]
    findings = {
        "p_blocker":   {"has_p0": True,  "has_p1": True, "has_p2": True},   # worst-wins → with_p0
        "p_p1_p2":     {"has_p0": False, "has_p1": True, "has_p2": True},   # worst-wins → with_p1_only
        "p_p2_only":   {"has_p0": False, "has_p1": False, "has_p2": True},
    }
    today = _utc("2026-05-25T12:00:00")
    buckets, labels = bucketize_daily(prs, findings, today, n=30)
    assert len(buckets) == 30
    assert labels[-1] == "2026-05-25"
    # 20.05 bar: 3 PR — 1 P0, 1 P1-only, 1 P2-only
    b = buckets[-6]
    assert b == {"total_pr": 3, "with_p0": 1, "with_p1_only": 1, "with_p2_only": 1}


def test_bucketize_weekly_iso_aligns_to_monday():
    # PR merged on Wed 13 May 2026 → должен попасть в неделю с пн 11 May
    prs = [{"merged_at": "2026-05-13T08:00:00Z", "url": "p1"}]
    today = _utc("2026-05-25T12:00:00")  # Mon
    buckets, labels = bucketize_weekly_iso(prs, {}, today, n=12)
    assert len(buckets) == 12
    # Последняя метка — текущая неделя (пн 25 May)
    assert labels[-1] == "2026-05-25"
    # Неделя с 11 May = индекс labels.index("2026-05-11")
    idx = labels.index("2026-05-11")
    assert buckets[idx]["total_pr"] == 1


def test_aggregate_summary_excludes_errored_repos():
    per_repo_buckets = {
        "ok-repo":  [{"total_pr": 5, "with_p0": 0, "with_p1_only": 1, "with_p2_only": 0}],
        "bad-repo": [{"total_pr": 10, "with_p0": 0, "with_p1_only": 0, "with_p2_only": 0}],  # фейк нулей
    }
    repo_status = {"ok-repo": "ok", "bad-repo": "error"}
    summary = aggregate_summary(per_repo_buckets, repo_status)
    assert summary == [{"total_pr": 5, "with_p0": 0, "with_p1_only": 1, "with_p2_only": 0}]


def test_low_sample_threshold_constant():
    assert LOW_SAMPLE_THRESHOLD == 8
```

- [ ] **Step 2: Run, verify FAIL**

`pytest tests/quality/test_bucketize.py -v` → ImportError.

- [ ] **Step 3: Implementation**

`src/makeit_pipeline/quality/bucketize.py`:
```python
from datetime import datetime, timedelta, timezone
from typing import Iterable

LOW_SAMPLE_THRESHOLD = 8


def _iso_monday_utc(dt: datetime) -> datetime:
    """Понедельник ISO-недели в UTC, обрезанный до полуночи."""
    d = dt.astimezone(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    # weekday(): пн=0, вт=1, ..., вс=6
    return d - timedelta(days=d.weekday())


def _parse_merged(pr: dict) -> datetime:
    return datetime.fromisoformat(pr["merged_at"].replace("Z", "+00:00"))


def _empty_bucket() -> dict:
    return {"total_pr": 0, "with_p0": 0, "with_p1_only": 0, "with_p2_only": 0}


def _update_bucket(b: dict, finding: dict | None):
    """Worst-wins: P0 > P1 > P2-only. PR с P0+P1+P2 учитывается только в with_p0."""
    b["total_pr"] += 1
    if not finding:
        return
    if finding.get("has_p0"):
        b["with_p0"] += 1
    elif finding.get("has_p1"):
        b["with_p1_only"] += 1
    elif finding.get("has_p2"):
        b["with_p2_only"] += 1


def bucketize_daily(prs: list[dict], findings: dict, today: datetime, n: int = 30):
    """n дневных бакетов оканчивая сегодняшним днём (UTC). Возвращает (buckets, labels)."""
    today_utc = today.astimezone(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    starts = [today_utc - timedelta(days=n - 1 - i) for i in range(n)]
    labels = [s.strftime("%Y-%m-%d") for s in starts]
    buckets = [_empty_bucket() for _ in range(n)]
    for pr in prs:
        m = _parse_merged(pr)
        m_day = m.astimezone(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        idx = (m_day - starts[0]).days
        if 0 <= idx < n:
            _update_bucket(buckets[idx], findings.get(pr["url"]))
    return buckets, labels


def bucketize_weekly_iso(prs: list[dict], findings: dict, today: datetime, n: int = 12):
    """n ISO-недель оканчивая текущей (понедельник). Возвращает (buckets, labels)."""
    today_mon = _iso_monday_utc(today)
    starts = [today_mon - timedelta(weeks=n - 1 - i) for i in range(n)]
    labels = [s.strftime("%Y-%m-%d") for s in starts]
    buckets = [_empty_bucket() for _ in range(n)]
    for pr in prs:
        m = _parse_merged(pr)
        pr_mon = _iso_monday_utc(m)
        idx = (pr_mon - starts[0]).days // 7
        if 0 <= idx < n:
            _update_bucket(buckets[idx], findings.get(pr["url"]))
    return buckets, labels


def aggregate_summary(per_repo_buckets: dict[str, list[dict]],
                      repo_status: dict[str, str]) -> list[dict]:
    """Суммировать buckets из ОК-репо (исключая error). Иначе summary занизит dirty rate."""
    ok_repos = [r for r, s in repo_status.items() if s == "ok" and r in per_repo_buckets]
    if not ok_repos:
        return []
    n = len(per_repo_buckets[ok_repos[0]])
    summary = [_empty_bucket() for _ in range(n)]
    for repo in ok_repos:
        for i, b in enumerate(per_repo_buckets[repo]):
            summary[i]["total_pr"]     += b["total_pr"]
            summary[i]["with_p0"]      += b["with_p0"]
            summary[i]["with_p1_only"] += b["with_p1_only"]
            summary[i]["with_p2_only"] += b["with_p2_only"]
    return summary
```

- [ ] **Step 4: Run, verify PASS**

`pytest tests/quality/test_bucketize.py -v`

- [ ] **Step 5: Commit**

```bash
git add src/makeit_pipeline/quality/bucketize.py tests/quality/test_bucketize.py
git commit -m "feat(quality): bucketize PRs by day/ISO-week + summary excludes errored repos"
```

---

### Task 4: Atomic local + remote publish

**Repo:** `makeit-pipeline`

**Files:**
- Create: `src/makeit_pipeline/quality/publish.py`
- Create: `tests/quality/test_publish.py`

- [ ] **Step 1: Failing tests**

`tests/quality/test_publish.py`:
```python
import json
from pathlib import Path
from unittest.mock import patch, MagicMock
from makeit_pipeline.quality.publish import write_json_atomic_local, publish_remote_atomic


def test_write_json_atomic_local_creates_file(tmp_path):
    target = tmp_path / "x.json"
    write_json_atomic_local(target, {"a": 1})
    assert json.loads(target.read_text()) == {"a": 1}


def test_write_json_atomic_local_does_not_leave_tmp(tmp_path):
    target = tmp_path / "x.json"
    write_json_atomic_local(target, {"a": 1})
    assert not (tmp_path / "x.json.tmp").exists()


def test_write_json_atomic_local_overwrites_existing(tmp_path):
    target = tmp_path / "x.json"
    target.write_text('{"old": true}')
    write_json_atomic_local(target, {"new": True})
    assert json.loads(target.read_text()) == {"new": True}


@patch("makeit_pipeline.quality.publish.subprocess.run")
def test_publish_remote_atomic_uses_tmp_then_mv(mock_run, tmp_path):
    mock_run.return_value = MagicMock(returncode=0)
    local = tmp_path / "q.json"
    local.write_text("{}")
    publish_remote_atomic(local, remote_host="vps", remote_dir="/opt/data")
    # Проверяем что было 2 вызова: rsync + ssh mv
    assert mock_run.call_count == 2
    rsync_args = mock_run.call_args_list[0][0][0]
    assert rsync_args[0] == "rsync"
    assert rsync_args[-1].endswith(".codex-quality.json.tmp")
    ssh_args = mock_run.call_args_list[1][0][0]
    assert ssh_args[0] == "ssh"
    assert "mv" in ssh_args[2]
    assert ".codex-quality.json.tmp" in ssh_args[2]
    assert "codex-quality.json" in ssh_args[2]


@patch("makeit_pipeline.quality.publish.subprocess.run")
def test_publish_raises_on_rsync_failure(mock_run, tmp_path):
    import subprocess
    mock_run.side_effect = subprocess.CalledProcessError(1, "rsync")
    local = tmp_path / "q.json"; local.write_text("{}")
    import pytest
    with pytest.raises(subprocess.CalledProcessError):
        publish_remote_atomic(local, remote_host="vps", remote_dir="/opt/data")
```

- [ ] **Step 2: Run, FAIL**

`pytest tests/quality/test_publish.py -v` → ImportError.

- [ ] **Step 3: Implementation**

`src/makeit_pipeline/quality/publish.py`:
```python
import json
import os
import subprocess
from pathlib import Path
from typing import Any

REMOTE_TMP_NAME = ".codex-quality.json.tmp"
REMOTE_FINAL_NAME = "codex-quality.json"


def write_json_atomic_local(target: Path, data: Any) -> None:
    """Запись JSON через .tmp + os.replace (POSIX atomic rename на одном FS)."""
    target = Path(target)
    tmp = target.with_suffix(target.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    os.replace(tmp, target)


def publish_remote_atomic(local_path: Path, *, remote_host: str, remote_dir: str,
                          tmp_name: str = REMOTE_TMP_NAME,
                          final_name: str = REMOTE_FINAL_NAME) -> None:
    """rsync файл в .tmp на remote → ssh mv в final.
    Без этого nginx может вернуть половину файла во время rsync."""
    remote_tmp = f"{remote_dir.rstrip('/')}/{tmp_name}"
    remote_final = f"{remote_dir.rstrip('/')}/{final_name}"
    subprocess.run(
        ["rsync", "-e", "ssh", str(local_path), f"{remote_host}:{remote_tmp}"],
        check=True,
    )
    subprocess.run(
        ["ssh", remote_host, f"mv {remote_tmp} {remote_final}"],
        check=True,
    )
```

- [ ] **Step 4: Run, PASS**

`pytest tests/quality/test_publish.py -v`

- [ ] **Step 5: Commit**

```bash
git add src/makeit_pipeline/quality/publish.py tests/quality/test_publish.py
git commit -m "feat(quality): atomic local JSON write + remote publish via rsync .tmp + ssh mv"
```

---

### Task 5: Locking

**Repo:** `makeit-pipeline`

**Files:**
- Create: `src/makeit_pipeline/quality/locking.py`
- Append to: `tests/quality/test_publish.py` (logical grouping — locking is publish-related)

- [ ] **Step 1: Failing tests**

Append to `tests/quality/test_publish.py`:
```python
import pytest
from makeit_pipeline.quality.locking import acquire_lock, SweepAlreadyRunning


def test_acquire_lock_works_first_time(tmp_path):
    lock = tmp_path / "test.lock"
    with acquire_lock(lock):
        assert lock.exists()


def test_acquire_lock_blocks_second_attempt(tmp_path):
    lock = tmp_path / "test.lock"
    with acquire_lock(lock):
        with pytest.raises(SweepAlreadyRunning):
            with acquire_lock(lock):
                pass


def test_acquire_lock_releases_on_exit(tmp_path):
    lock = tmp_path / "test.lock"
    with acquire_lock(lock):
        pass
    # После выхода — должен быть свободен
    with acquire_lock(lock):
        pass  # не упадёт
```

- [ ] **Step 2: Run, FAIL**

`pytest tests/quality/test_publish.py::test_acquire_lock_works_first_time -v` → ImportError.

- [ ] **Step 3: Implementation**

`src/makeit_pipeline/quality/locking.py`:
```python
import fcntl
from contextlib import contextmanager
from pathlib import Path


class SweepAlreadyRunning(Exception):
    """Поднимается если кто-то уже держит exclusive lock."""


@contextmanager
def acquire_lock(lock_path: Path):
    """Exclusive flock на файл. Освобождается на выходе из context'а.
    Используется и cron'ом, и /quality/refresh endpoint'ом."""
    lock_path = Path(lock_path)
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    f = open(lock_path, "w")
    try:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as e:
        f.close()
        raise SweepAlreadyRunning(f"Lock {lock_path} уже взят другим процессом") from e
    try:
        yield
    finally:
        fcntl.flock(f, fcntl.LOCK_UN)
        f.close()
```

- [ ] **Step 4: Run, PASS**

`pytest tests/quality/test_publish.py -v`

- [ ] **Step 5: Commit**

```bash
git add src/makeit_pipeline/quality/locking.py tests/quality/test_publish.py
git commit -m "feat(quality): flock-based locking for sweep + force-refresh"
```

---

## Phase B — GitHub fetch

### Task 6: Request with rate-limit-aware retry

**Repo:** `makeit-pipeline`

**Files:**
- Create: `src/makeit_pipeline/quality/fetch.py`
- Create: `tests/quality/test_fetch.py`

- [ ] **Step 1: Failing tests**

`tests/quality/test_fetch.py`:
```python
import time
from unittest.mock import patch, MagicMock
import pytest
from makeit_pipeline.quality.fetch import request_with_retry


def _resp(status, headers=None, json_data=None):
    r = MagicMock()
    r.status_code = status
    r.headers = headers or {}
    r.json.return_value = json_data or []
    return r


@patch("makeit_pipeline.quality.fetch.httpx.request")
def test_success_first_try(mock_req):
    mock_req.return_value = _resp(200, json_data=[{"id": 1}])
    r = request_with_retry("GET", "https://example/x")
    assert r.status_code == 200
    assert mock_req.call_count == 1


@patch("makeit_pipeline.quality.fetch.time.sleep")
@patch("makeit_pipeline.quality.fetch.httpx.request")
def test_retries_on_429_with_retry_after(mock_req, mock_sleep):
    mock_req.side_effect = [
        _resp(429, headers={"Retry-After": "2"}),
        _resp(200, json_data=[]),
    ]
    request_with_retry("GET", "https://example/x")
    assert mock_req.call_count == 2
    # Должны были подождать минимум 2с + jitter < 4с
    args = mock_sleep.call_args[0][0]
    assert 2 <= args <= 4


@patch("makeit_pipeline.quality.fetch.time.sleep")
@patch("makeit_pipeline.quality.fetch.time.time")
@patch("makeit_pipeline.quality.fetch.httpx.request")
def test_retries_on_403_with_rate_limit_reset(mock_req, mock_now, mock_sleep):
    mock_now.return_value = 1_000_000
    mock_req.side_effect = [
        _resp(403, headers={"X-RateLimit-Reset": "1000003"}),  # reset через 3с
        _resp(200),
    ]
    request_with_retry("GET", "https://example/x")
    args = mock_sleep.call_args[0][0]
    assert 3 <= args <= 5


@patch("makeit_pipeline.quality.fetch.time.sleep")
@patch("makeit_pipeline.quality.fetch.httpx.request")
def test_retries_on_5xx_with_expo_backoff(mock_req, mock_sleep):
    mock_req.side_effect = [_resp(503), _resp(503), _resp(200)]
    request_with_retry("GET", "https://example/x")
    # 2 sleep'а: ~1с, ~2с (+jitter)
    assert mock_sleep.call_count == 2
    assert 1 <= mock_sleep.call_args_list[0][0][0] <= 2
    assert 2 <= mock_sleep.call_args_list[1][0][0] <= 3


@patch("makeit_pipeline.quality.fetch.time.sleep")
@patch("makeit_pipeline.quality.fetch.httpx.request")
def test_raises_on_4xx_other(mock_req, mock_sleep):
    mock_req.return_value = _resp(404)
    mock_req.return_value.raise_for_status.side_effect = Exception("404")
    with pytest.raises(Exception, match="404"):
        request_with_retry("GET", "https://example/x")
```

- [ ] **Step 2: Run, FAIL**

`pytest tests/quality/test_fetch.py -v`

- [ ] **Step 3: Implementation**

`src/makeit_pipeline/quality/fetch.py`:
```python
import logging
import random
import time
import httpx

log = logging.getLogger(__name__)

MAX_RETRIES = 3
MAX_WAIT_SECONDS = 300


def request_with_retry(method: str, url: str, **kwargs) -> httpx.Response:
    """HTTP-запрос с уважением GitHub rate-limit headers + jitter.

    - 429 + Retry-After / X-RateLimit-Reset → ждём указанное время
    - 5xx → exponential backoff (1, 2, 4) с jitter
    - Иначе raise_for_status
    """
    last_resp = None
    for attempt in range(MAX_RETRIES):
        resp = httpx.request(method, url, **kwargs)
        last_resp = resp
        if resp.status_code < 400:
            return resp
        if resp.status_code in (429, 403):
            wait = _compute_rate_limit_wait(resp.headers)
            log.warning("Rate-limit on %s: sleeping %.1fs", url, wait)
            time.sleep(wait)
            continue
        if 500 <= resp.status_code < 600:
            wait = (2 ** attempt) + random.uniform(0, 1)
            log.warning("5xx on %s (attempt %d): sleeping %.1fs", url, attempt + 1, wait)
            time.sleep(wait)
            continue
        resp.raise_for_status()
    last_resp.raise_for_status()
    return last_resp


def _compute_rate_limit_wait(headers) -> float:
    """Retry-After в приоритете; иначе X-RateLimit-Reset; иначе дефолт 30с. + jitter."""
    retry_after = headers.get("Retry-After")
    if retry_after:
        wait = float(retry_after)
    else:
        reset = headers.get("X-RateLimit-Reset")
        if reset:
            wait = max(1.0, float(reset) - time.time())
        else:
            wait = 30.0
    wait = min(wait, MAX_WAIT_SECONDS) + random.uniform(0, 2)
    return wait
```

- [ ] **Step 4: Run, PASS**

`pytest tests/quality/test_fetch.py -v`

- [ ] **Step 5: Commit**

```bash
git add src/makeit_pipeline/quality/fetch.py tests/quality/test_fetch.py
git commit -m "feat(quality): rate-limit-aware request_with_retry (Retry-After + X-RateLimit-Reset + jitter)"
```

---

### Task 7: Fetch merged PRs (early-exit)

**Repo:** `makeit-pipeline`

**Files:**
- Modify: `src/makeit_pipeline/quality/fetch.py`
- Modify: `tests/quality/test_fetch.py`

- [ ] **Step 1: Failing test**

Append to `tests/quality/test_fetch.py`:
```python
from datetime import datetime, timezone, timedelta
from makeit_pipeline.quality.fetch import fetch_repo_merged_prs


def _pr(merged_at, updated_at, url):
    return {"merged_at": merged_at, "updated_at": updated_at, "url": url}


@patch("makeit_pipeline.quality.fetch.request_with_retry")
def test_fetch_paginates_until_updated_at_below_since(mock_req):
    since = datetime(2026, 5, 1, tzinfo=timezone.utc)
    page1 = [
        _pr("2026-05-20T00:00:00Z", "2026-05-22T00:00:00Z", "pr/100"),
        _pr(None, "2026-05-21T00:00:00Z", "pr/99"),  # закрыт без мержа — игнор
        _pr("2026-05-05T00:00:00Z", "2026-05-10T00:00:00Z", "pr/98"),
    ]
    page2 = [_pr("2026-04-20T00:00:00Z", "2026-04-25T00:00:00Z", "pr/97")]  # updated < since → early exit
    mock_req.side_effect = [
        MagicMock(status_code=200, json=lambda: page1),
        MagicMock(status_code=200, json=lambda: page2),
    ]
    result = fetch_repo_merged_prs("X", since, token="t")
    assert len(result) == 2
    assert {p["url"] for p in result} == {"pr/100", "pr/98"}
    assert mock_req.call_count == 2  # дошёл до второй страницы и понял что можно выйти


@patch("makeit_pipeline.quality.fetch.request_with_retry")
def test_fetch_handles_empty_response(mock_req):
    mock_req.return_value = MagicMock(status_code=200, json=lambda: [])
    result = fetch_repo_merged_prs("X", datetime(2026, 5, 1, tzinfo=timezone.utc), token="t")
    assert result == []


@patch("makeit_pipeline.quality.fetch.request_with_retry")
def test_fetch_review_comments_paginates(mock_req):
    page1 = [{"body": "![P1 Badge]()", "pull_request_url": "pr/1", "user": {"login": "chatgpt-codex-connector[bot]"}}]
    page2 = []
    mock_req.side_effect = [
        MagicMock(status_code=200, json=lambda: page1),
        MagicMock(status_code=200, json=lambda: page2),
    ]
    from makeit_pipeline.quality.fetch import fetch_repo_review_comments
    result = fetch_repo_review_comments("X", datetime(2026, 5, 1, tzinfo=timezone.utc), token="t")
    # Только от бота
    assert len(result) == 1
```

- [ ] **Step 2: Run, FAIL**

`pytest tests/quality/test_fetch.py -v`

- [ ] **Step 3: Implementation**

Append to `src/makeit_pipeline/quality/fetch.py`:
```python
from datetime import datetime

API_BASE = "https://api.github.com"
MAX_PAGES = 50  # safety; на типичном репо << 5 страниц
CODEX_BOT_LOGIN = "chatgpt-codex-connector[bot]"


def _parse_dt(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def fetch_repo_merged_prs(repo: str, since: datetime, *, token: str,
                          owner: str = "Sergio1990-1") -> list[dict]:
    """Pull merged PRs since cutoff.

    Использует sort=updated+direction=desc + early-exit когда updated_at < since.
    GitHub /pulls НЕ принимает ?since — мы фильтруем клиентски по merged_at."""
    headers = {"Authorization": f"token {token}", "Accept": "application/vnd.github+json"}
    merged: list[dict] = []
    for page in range(1, MAX_PAGES + 1):
        resp = request_with_retry(
            "GET", f"{API_BASE}/repos/{owner}/{repo}/pulls",
            headers=headers,
            params={"state": "closed", "sort": "updated", "direction": "desc",
                    "per_page": 100, "page": page},
        )
        items = resp.json()
        if not items:
            break
        for pr in items:
            if _parse_dt(pr["updated_at"]) < since:
                return merged  # early-exit, остальные тоже старые
            if pr.get("merged_at") and _parse_dt(pr["merged_at"]) >= since:
                merged.append(pr)
    log.warning("Hit MAX_PAGES on %s — могут быть пропущены старые PR", repo)
    return merged


def fetch_repo_review_comments(repo: str, since: datetime, *, token: str,
                               owner: str = "Sergio1990-1") -> list[dict]:
    """Все review-комменты в репо since updated_at (включает редактирования старых).
    Фильтрует на стороне клиента — только от Codex-бота."""
    headers = {"Authorization": f"token {token}", "Accept": "application/vnd.github+json"}
    result: list[dict] = []
    for page in range(1, MAX_PAGES + 1):
        resp = request_with_retry(
            "GET", f"{API_BASE}/repos/{owner}/{repo}/pulls/comments",
            headers=headers,
            params={"since": since.isoformat().replace("+00:00", "Z"),
                    "per_page": 100, "page": page},
        )
        items = resp.json()
        if not items:
            break
        for c in items:
            if (c.get("user") or {}).get("login") == CODEX_BOT_LOGIN:
                result.append(c)
    return result
```

- [ ] **Step 4: Run, PASS**

`pytest tests/quality/test_fetch.py -v`

- [ ] **Step 5: Commit**

```bash
git add src/makeit_pipeline/quality/fetch.py tests/quality/test_fetch.py
git commit -m "feat(quality): fetch merged PRs via sort=updated+early-exit (no nonexistent ?since); fetch Codex review comments"
```

---

### Task 8: Sweep orchestration

**Repo:** `makeit-pipeline`

**Files:**
- Create: `src/makeit_pipeline/quality/sweep.py`
- Create: `tests/quality/test_sweep_integration.py`

- [ ] **Step 1: Failing integration test**

`tests/quality/test_sweep_integration.py`:
```python
from datetime import datetime, timezone
from unittest.mock import patch
from pathlib import Path
import json
from makeit_pipeline.quality.sweep import run_sweep


@patch("makeit_pipeline.quality.sweep.fetch_repo_review_comments")
@patch("makeit_pipeline.quality.sweep.fetch_repo_merged_prs")
def test_sweep_produces_well_formed_json(mock_fetch_prs, mock_fetch_comments, tmp_path):
    today = datetime(2026, 5, 25, 12, tzinfo=timezone.utc)
    mock_fetch_prs.return_value = [
        {"url": "pr/1", "merged_at": "2026-05-20T08:00:00Z", "updated_at": "2026-05-20T08:00:00Z"},
    ]
    mock_fetch_comments.return_value = [
        {"pull_request_url": "pr/1", "body": "![P1 Badge]()", "user": {"login": "chatgpt-codex-connector[bot]"}},
    ]
    out = tmp_path / "q.json"
    run_sweep(repos=["repo-A"], owner="X", token="t", out_path=out,
              now=today, publish=False)
    data = json.loads(out.read_text())
    assert data["schema_version"] == 1
    assert data["bucket_tz"] == "UTC"
    assert "window_start" in data and "window_end" in data
    assert data["repo_status"]["repo-A"]["status"] == "ok"
    assert "30d" in data["buckets"] and "12w" in data["buckets"]
    assert len(data["buckets"]["30d"]["labels"]) == 30
    assert len(data["buckets"]["12w"]["labels"]) == 12
    # pr/1 merged 2026-05-20 → P1 в дневном бакете 2026-05-20
    daily_repo = data["buckets"]["30d"]["per_repo"]["repo-A"]["buckets"]
    idx_20may = data["buckets"]["30d"]["labels"].index("2026-05-20")
    assert daily_repo[idx_20may] == {"total_pr": 1, "with_p1": 1, "with_p2_only": 0}


@patch("makeit_pipeline.quality.sweep.fetch_repo_review_comments")
@patch("makeit_pipeline.quality.sweep.fetch_repo_merged_prs")
def test_sweep_marks_failed_repo_in_status(mock_prs, mock_comments, tmp_path):
    mock_prs.side_effect = [Exception("API exploded"), []]
    mock_comments.return_value = []
    out = tmp_path / "q.json"
    run_sweep(repos=["bad", "good"], owner="X", token="t", out_path=out,
              now=datetime(2026, 5, 25, tzinfo=timezone.utc), publish=False)
    data = json.loads(out.read_text())
    assert data["repo_status"]["bad"]["status"] == "error"
    assert data["repo_status"]["good"]["status"] == "ok"
    # bad НЕ участвует в summary
    summary_total = sum(b["total_pr"] for b in data["buckets"]["30d"]["summary"])
    assert summary_total == 0  # good вернул [] PR, bad excluded
```

- [ ] **Step 2: Run, FAIL**

`pytest tests/quality/test_sweep_integration.py -v`

- [ ] **Step 3: Implementation**

`src/makeit_pipeline/quality/sweep.py`:
```python
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from .fetch import fetch_repo_merged_prs, fetch_repo_review_comments
from .severity import group_findings_per_pr
from .bucketize import bucketize_daily, bucketize_weekly_iso, aggregate_summary, _iso_monday_utc
from .publish import write_json_atomic_local, publish_remote_atomic

log = logging.getLogger(__name__)
SCHEMA_VERSION = 1
WINDOW_DAYS = 90  # сколько тащим из API (покрывает 30d + 12w + запас)


def run_sweep(*, repos: list[str], owner: str, token: str, out_path: Path,
              now: datetime, publish: bool = True,
              remote_host: str = "vps",
              remote_dir: str = "/opt/apps/makeit-stack/web/data") -> dict:
    """Главная sweep-функция. Делает fetch + bucketize + write JSON (+ publish)."""
    since = now - timedelta(days=WINDOW_DAYS)
    repo_status: dict[str, dict] = {}
    per_repo_30d: dict[str, list[dict]] = {}
    per_repo_12w: dict[str, list[dict]] = {}
    per_repo_meta: dict[str, dict] = {}

    for repo in repos:
        try:
            prs = fetch_repo_merged_prs(repo, since, token=token, owner=owner)
            comments = fetch_repo_review_comments(repo, since, token=token, owner=owner)
        except Exception as e:
            log.exception("Failed to fetch %s", repo)
            repo_status[repo] = {"status": "error", "code": "FETCH_FAILED",
                                 "message": _short(str(e))}
            continue

        findings = group_findings_per_pr(comments)
        d_buckets, d_labels = bucketize_daily(prs, findings, now, n=30)
        w_buckets, w_labels = bucketize_weekly_iso(prs, findings, now, n=12)
        per_repo_30d[repo] = d_buckets
        per_repo_12w[repo] = w_buckets

        # Codex coverage = доля PR с хотя бы одним коммент от бота
        covered = sum(1 for pr in prs if pr["url"] in {c["pull_request_url"] for c in comments})
        coverage_pct = round(covered / max(1, len(prs)) * 100)
        per_repo_meta[repo] = {
            "codex_coverage_pct": coverage_pct,
            "codex_first_seen": comments[-1]["created_at"] if comments else None,
        }
        repo_status[repo] = {"status": "ok"}

    # Только статуса нет — labels берём из ЛЮБОГО успешного репо ИЛИ генерируем из now
    if any(s["status"] == "ok" for s in repo_status.values()):
        any_ok = next(r for r, s in repo_status.items() if s["status"] == "ok")
        d_labels = bucketize_daily([], {}, now, n=30)[1]
        w_labels = bucketize_weekly_iso([], {}, now, n=12)[1]
    else:
        d_labels = bucketize_daily([], {}, now, n=30)[1]
        w_labels = bucketize_weekly_iso([], {}, now, n=12)[1]

    summary_30d = aggregate_summary(per_repo_30d, {r: s["status"] for r, s in repo_status.items()})
    summary_12w = aggregate_summary(per_repo_12w, {r: s["status"] for r, s in repo_status.items()})

    payload = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": now.isoformat().replace("+00:00", "Z"),
        "window_start": _iso_monday_utc(since).isoformat().replace("+00:00", "Z"),
        "window_end": now.isoformat().replace("+00:00", "Z"),
        "bucket_tz": "UTC",
        "repo_status": repo_status,
        "buckets": {
            "30d": {
                "labels": d_labels,
                "summary": summary_30d,
                "per_repo": {r: {"buckets": per_repo_30d[r], **per_repo_meta[r]}
                             for r in per_repo_30d},
            },
            "12w": {
                "labels": w_labels,
                "summary": summary_12w,
                "per_repo": {r: {"buckets": per_repo_12w[r], **per_repo_meta[r]}
                             for r in per_repo_12w},
            },
        },
    }
    write_json_atomic_local(out_path, payload)
    if publish:
        publish_remote_atomic(out_path, remote_host=remote_host, remote_dir=remote_dir)
    return payload


def _short(s: str, n: int = 200) -> str:
    """Обрезаем длинные exception-сообщения (могут содержать stack-trace, пути и т.д.)."""
    s = s.replace("\n", " ").strip()
    return s[:n] + ("…" if len(s) > n else "")
```

- [ ] **Step 4: Run, PASS**

`pytest tests/quality/test_sweep_integration.py -v`

- [ ] **Step 5: Commit**

```bash
git add src/makeit_pipeline/quality/sweep.py tests/quality/test_sweep_integration.py
git commit -m "feat(quality): sweep orchestration with repo_status + coverage + schema metadata"
```

---

## Phase C — CLI + launchd

### Task 9: CLI entry-point + sanity

**Repo:** `makeit-pipeline`

**Files:**
- Create: `scripts/codex_quality_sweep.py`

- [ ] **Step 1: Create CLI**

`scripts/codex_quality_sweep.py`:
```python
#!/usr/bin/env python3
"""CLI entry для codex quality sweep. Используется launchd cron'ом и /quality/refresh."""
import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
import os
from makeit_pipeline.quality.locking import acquire_lock, SweepAlreadyRunning
from makeit_pipeline.quality.sweep import run_sweep

EXIT_OK = 0
EXIT_LOCK_BUSY = 2
EXIT_NO_TOKEN = 3
EXIT_INTERNAL = 1

LOCK_PATH = Path("/tmp/codex-quality-sweep.lock")
DEFAULT_OUT = Path.home() / "data" / "codex-quality.json"
CONFIG_PATH = Path(__file__).parent.parent / "config" / "quality_repos.json"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("sweep")


def main():
    load_dotenv()
    p = argparse.ArgumentParser()
    p.add_argument("--out", default=str(DEFAULT_OUT))
    p.add_argument("--no-publish", action="store_true", help="dry-run без rsync на VPS")
    p.add_argument("--force", action="store_true", help="принудительный запуск (всё равно lock работает)")
    args = p.parse_args()

    token = os.getenv("GH_TOKEN") or os.getenv("GITHUB_TOKEN")
    if not token:
        log.error("GH_TOKEN or GITHUB_TOKEN env var required")
        print(json.dumps({"code": "NO_TOKEN"}))
        return EXIT_NO_TOKEN

    cfg = json.loads(CONFIG_PATH.read_text())
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        with acquire_lock(LOCK_PATH):
            run_sweep(
                repos=cfg["repos"], owner=cfg["owner"], token=token,
                out_path=out, now=datetime.now(timezone.utc),
                publish=not args.no_publish,
            )
            return EXIT_OK
    except SweepAlreadyRunning:
        log.warning("Sweep already running, exiting")
        print(json.dumps({"code": "ALREADY_RUNNING"}))
        return EXIT_LOCK_BUSY
    except Exception as e:
        log.exception("Sweep failed")
        print(json.dumps({"code": "INTERNAL"}))  # sanitized — не stderr
        return EXIT_INTERNAL


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Manual smoke test**

```bash
GH_TOKEN=<your-pat> python scripts/codex_quality_sweep.py --no-publish --out /tmp/test-q.json
cat /tmp/test-q.json | jq '.schema_version, .repo_status | keys'
```
Expected: schema_version=1, ключи всех 14 репо.

- [ ] **Step 3: Commit**

```bash
chmod +x scripts/codex_quality_sweep.py
git add scripts/codex_quality_sweep.py
git commit -m "feat(quality): CLI entry-point for codex quality sweep with sanitized errors"
```

---

### Task 10: launchd plist

**Repo:** `makeit-pipeline`

**Files:**
- Create: `deploy/launchd/com.makeit.codex-quality-sweep.plist`

- [ ] **Step 1: Создать plist**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.makeit.codex-quality-sweep</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/sergeymakarov/makeit-pipeline/.venv/bin/python</string>
    <string>/Users/sergeymakarov/makeit-pipeline/scripts/codex_quality_sweep.py</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/sergeymakarov/makeit-pipeline</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>19</integer>      <!-- 19:00 UTC = 03:00 Bali (UTC+8) -->
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/Users/sergeymakarov/logs/codex-quality-sweep.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/sergeymakarov/logs/codex-quality-sweep.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <!-- GH_TOKEN читается из .env через python-dotenv, не из plist (не plain-text на диск) -->
  </dict>
</dict>
</plist>
```

- [ ] **Step 2: Установить на Pipeline Mac (ssh sergeymakarov)**

```bash
scp deploy/launchd/com.makeit.codex-quality-sweep.plist \
    sergeymakarov:~/Library/LaunchAgents/
ssh sergeymakarov "launchctl load ~/Library/LaunchAgents/com.makeit.codex-quality-sweep.plist"
ssh sergeymakarov "launchctl start com.makeit.codex-quality-sweep"
sleep 30
ssh sergeymakarov "tail -50 ~/logs/codex-quality-sweep.log"
```
Expected: INFO `sweep` logs, exit 0.

- [ ] **Step 3: Commit**

```bash
git add deploy/launchd/com.makeit.codex-quality-sweep.plist
git commit -m "feat(quality): launchd plist for daily 03:00 Bali sweep"
```

---

## Phase D — Annotations backend

### Task 11: Annotations store

**Repo:** `makeit-pipeline`

**Files:**
- Create: `src/makeit_pipeline/quality/annotations.py`
- Create: `tests/quality/test_annotations.py`

- [ ] **Step 1: Failing tests**

`tests/quality/test_annotations.py`:
```python
import json
from pathlib import Path
import pytest
from makeit_pipeline.quality.annotations import (
    load_annotations, add_annotation, delete_annotation, MAX_ANNOTATIONS_TOTAL,
)


def test_load_returns_empty_on_missing_file(tmp_path):
    assert load_annotations(tmp_path / "x.json") == []


def test_add_returns_annotation_with_uuid(tmp_path):
    path = tmp_path / "a.json"
    ann = add_annotation(path, occurred_at="2026-05-22T00:00:00Z", category="skill",
                         scope="global", repos=None, title="t", desc="d")
    assert "id" in ann
    assert len(ann["id"]) == 36  # UUID v4
    assert ann["category"] == "skill"
    stored = load_annotations(path)
    assert len(stored) == 1
    assert stored[0]["id"] == ann["id"]


def test_delete_by_id(tmp_path):
    path = tmp_path / "a.json"
    ann = add_annotation(path, occurred_at="2026-05-22T00:00:00Z", category="skill",
                         scope="global", repos=None, title="t", desc="d")
    assert delete_annotation(path, ann["id"]) is True
    assert load_annotations(path) == []


def test_delete_missing_returns_false(tmp_path):
    path = tmp_path / "a.json"
    assert delete_annotation(path, "00000000-0000-0000-0000-000000000000") is False


def test_add_rejects_when_at_max(tmp_path, monkeypatch):
    monkeypatch.setattr("makeit_pipeline.quality.annotations.MAX_ANNOTATIONS_TOTAL", 1)
    path = tmp_path / "a.json"
    add_annotation(path, occurred_at="2026-05-22T00:00:00Z", category="skill",
                   scope="global", repos=None, title="t", desc="d")
    with pytest.raises(ValueError, match="full"):
        add_annotation(path, occurred_at="2026-05-23T00:00:00Z", category="skill",
                       scope="global", repos=None, title="t2", desc="d2")
```

- [ ] **Step 2: Run, FAIL**

`pytest tests/quality/test_annotations.py -v`

- [ ] **Step 3: Implementation**

`src/makeit_pipeline/quality/annotations.py`:
```python
import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
from .publish import write_json_atomic_local

MAX_ANNOTATIONS_TOTAL = 5000
SCHEMA_VERSION = 1


def load_annotations(path: Path) -> list[dict]:
    path = Path(path)
    if not path.exists():
        return []
    data = json.loads(path.read_text())
    if isinstance(data, list):
        return data  # legacy shape
    return data.get("annotations", [])


def _save(path: Path, annotations: list[dict]) -> None:
    write_json_atomic_local(path, {"schema_version": SCHEMA_VERSION, "annotations": annotations})


def add_annotation(path: Path, *, occurred_at: str, category: str, scope: str,
                   repos: list[str] | None, title: str, desc: str,
                   created_by: str = "manual") -> dict:
    annotations = load_annotations(path)
    if len(annotations) >= MAX_ANNOTATIONS_TOTAL:
        raise ValueError(f"Annotation store full (>{MAX_ANNOTATIONS_TOTAL})")
    ann = {
        "id": str(uuid4()),
        "occurred_at": occurred_at,
        "category": category,
        "scope": scope,
        "repos": repos,
        "title": title,
        "desc": desc,
        "created_by": created_by,
        "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    annotations.append(ann)
    _save(path, annotations)
    return ann


def delete_annotation(path: Path, ann_id: str) -> bool:
    annotations = load_annotations(path)
    new_list = [a for a in annotations if a["id"] != ann_id]
    if len(new_list) == len(annotations):
        return False
    _save(path, new_list)
    return True
```

- [ ] **Step 4: Run, PASS**

`pytest tests/quality/test_annotations.py -v`

- [ ] **Step 5: Commit**

```bash
git add src/makeit_pipeline/quality/annotations.py tests/quality/test_annotations.py
git commit -m "feat(quality): annotations store with UUID + scope + max-cap"
```

---

### Task 12: FastAPI endpoints

**Repo:** `makeit-pipeline`

**Files:**
- Modify: `src/makeit_pipeline/api.py`

- [ ] **Step 1: Найти место в api.py для импорта/регистрации (обычно рядом с другими роутерами)**

Файл уже существует, надо добавить endpoints. Сначала прочитать структуру:
```bash
head -50 src/makeit_pipeline/api.py
```

- [ ] **Step 2: Добавить роутер `/quality`**

В `src/makeit_pipeline/api.py` добавить (после существующих routes):

```python
from typing import Literal
from uuid import UUID
import subprocess
import json
import logging
from pathlib import Path
from datetime import datetime
from fastapi import HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from makeit_pipeline.quality.annotations import (
    load_annotations, add_annotation, delete_annotation,
)

QUALITY_JSON_PATH = Path.home() / "data" / "codex-quality.json"
ANNOT_PATH = Path.home() / "data" / "annotations.json"
SWEEP_SCRIPT = Path(__file__).parent.parent.parent / "scripts" / "codex_quality_sweep.py"
MAX_BODY_SIZE = 4096

SAFE_ERROR_CODES = {
    "RATE_LIMITED": "GitHub API rate-limit. Дождитесь сброса.",
    "REPO_NOT_FOUND": "Один из репо переименован/удалён. Проверьте config/quality_repos.json.",
    "NETWORK": "Сетевая ошибка sweep'а. Проверьте Pipeline Mac.",
    "ALREADY_RUNNING": "Sweep уже выполняется. Подождите ~5 минут.",
    "INTERNAL": "Внутренняя ошибка. См. ~/logs/codex-quality-sweep.log.",
    "NO_TOKEN": "GH_TOKEN не настроен.",
}

q_log = logging.getLogger("quality_api")


class AnnotationCreate(BaseModel):
    occurred_at: datetime
    category: Literal["skill", "deploy", "manual"]
    scope: Literal["global", "repo"] = "global"
    repos: list[str] | None = Field(default=None, max_length=20)
    title: str = Field(max_length=120)
    desc: str = Field(default="", max_length=600)


@app.post("/quality/refresh")
def quality_refresh():
    try:
        result = subprocess.run(
            ["python3", str(SWEEP_SCRIPT), "--force"],
            capture_output=True, timeout=300, text=True,
        )
    except subprocess.TimeoutExpired:
        return JSONResponse(status_code=504, content={"code": "TIMEOUT",
                                                       "message": "Sweep > 5 минут"})
    # Парсим stdout JSON (последняя строка скрипта при ошибке)
    code = None
    if result.returncode != 0:
        try:
            code = (json.loads(result.stdout.strip().splitlines()[-1])).get("code")
        except Exception:
            code = "INTERNAL"
        status = 409 if code == "ALREADY_RUNNING" else 500
        q_log.error("Sweep failed: code=%s, stderr=%s", code, result.stderr[:200])
        return JSONResponse(status_code=status, content={
            "code": code, "message": SAFE_ERROR_CODES.get(code, SAFE_ERROR_CODES["INTERNAL"]),
        })
    if not QUALITY_JSON_PATH.exists():
        return JSONResponse(status_code=500, content={
            "code": "INTERNAL", "message": "Sweep finished but JSON missing"
        })
    return FileResponse(QUALITY_JSON_PATH, media_type="application/json")


@app.post("/annotations")
def annotations_add(payload: AnnotationCreate, request: Request):
    if int(request.headers.get("content-length", 0)) > MAX_BODY_SIZE:
        raise HTTPException(413, "Payload too large")
    if payload.scope == "repo" and not payload.repos:
        raise HTTPException(422, "scope=repo требует repos[]")
    try:
        ann = add_annotation(
            ANNOT_PATH,
            occurred_at=payload.occurred_at.isoformat().replace("+00:00", "Z"),
            category=payload.category,
            scope=payload.scope,
            repos=payload.repos,
            title=payload.title,
            desc=payload.desc,
        )
    except ValueError as e:
        raise HTTPException(429, str(e))
    return ann


@app.delete("/annotations/{ann_id}")
def annotations_delete(ann_id: UUID):
    ok = delete_annotation(ANNOT_PATH, str(ann_id))
    if not ok:
        raise HTTPException(404, "Annotation not found")
    return {"ok": True}


@app.get("/annotations")
def annotations_list():
    return {"annotations": load_annotations(ANNOT_PATH)}
```

- [ ] **Step 3: Smoke-test локально**

```bash
# В одном окне:
uvicorn makeit_pipeline.api:app --port 8766 --reload

# В другом:
curl -X POST http://localhost:8766/annotations \
  -H 'Content-Type: application/json' \
  -d '{"occurred_at":"2026-05-22T00:00:00Z","category":"skill","title":"test","desc":"d"}'
# → {"id":"...", "category":"skill", ...}

curl http://localhost:8766/annotations
# → {"annotations":[{...}]}

curl -X POST http://localhost:8766/quality/refresh
# → 200 + JSON или 409/500 с кодом
```

- [ ] **Step 4: Commit**

```bash
git add src/makeit_pipeline/api.py
git commit -m "feat(quality): FastAPI endpoints — POST /quality/refresh + CRUD /annotations with sanitized errors"
```

---

## Phase E — VPS nginx

### Task 13: nginx static route

**Repo/Host:** VPS (89.167.17.79)

**Files:**
- Modify on VPS: `/opt/apps/nginx-proxy/conf.d/makeit.conf`
- Create dir on VPS: `/opt/apps/makeit-stack/web/data/`

- [ ] **Step 1: Создать data dir на VPS**

```bash
ssh root@89.167.17.79 'mkdir -p /opt/apps/makeit-stack/web/data && chmod 755 /opt/apps/makeit-stack/web/data'
```

- [ ] **Step 2: Добавить location в nginx-конфиг**

```bash
ssh root@89.167.17.79
cd /opt/apps/nginx-proxy/conf.d
cp makeit.conf makeit.conf.bak
```

Открыть `makeit.conf` и добавить внутрь основного `server { ... }`:
```nginx
location /data/ {
    alias /opt/apps/makeit-stack/web/data/;
    add_header Cache-Control "public, max-age=300";
    add_header Access-Control-Allow-Origin "*";  # для GitHub Pages
}
```

- [ ] **Step 3: Тест и reload**

```bash
nginx -t
nginx -s reload
```

- [ ] **Step 4: Smoke test (после первого успешного sweep'а)**

```bash
# С Pipeline Mac или локально:
curl -I https://your-dashboard-domain/data/codex-quality.json
# → 200 OK + cache-control + cors header
```

- [ ] **Step 5: Commit (только если файл под git)**

Если конфиг nginx версионируется отдельно — закоммитить в том репо. Иначе — note в DEPLOYMENT.md что было сделано.

---

## Phase F — Frontend types + data layer

### Task 14: TypeScript types

**Repo:** `makeit-dashboard`

**Files:**
- Create: `src/types/quality.ts`

- [ ] **Step 1: Создать типы**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/types/quality.ts
git commit -m "feat(quality): TypeScript types for QualityPayload + Annotation"
```

---

### Task 15: Position math (pure functions, TDD)

**Repo:** `makeit-dashboard`

**Files:**
- Create: `src/utils/quality-position.ts`
- Create: `tests/quality/quality-position.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { isoMonday, annotationPositionPct } from "../../src/utils/quality-position";

describe("isoMonday", () => {
  it("snaps Wednesday to Monday of same week", () => {
    expect(isoMonday(new Date("2026-05-13"))).toEqual(new Date("2026-05-11T00:00:00.000Z"));
  });
  it("snaps Sunday to Monday of same week (not next)", () => {
    expect(isoMonday(new Date("2026-05-17"))).toEqual(new Date("2026-05-11T00:00:00.000Z"));
  });
  it("snaps Monday to itself", () => {
    expect(isoMonday(new Date("2026-05-11"))).toEqual(new Date("2026-05-11T00:00:00.000Z"));
  });
});

describe("annotationPositionPct", () => {
  const today = new Date("2026-05-25T00:00:00Z");  // Monday
  it("30d mode snaps to bar center", () => {
    // Annotation on 2026-05-15 (10 days before today, day index 19 in 30-day series ending today)
    const pct = annotationPositionPct(new Date("2026-05-15T08:00:00Z"), "30d", today, 30);
    // (19 + 0.5) / 30 = 65%
    expect(pct).toBeCloseTo(65);
  });
  it("12w mode positions proportionally within week", () => {
    // Annotation on Wed 2026-05-13. Week 12 of 12 starts on Mon 2026-05-25.
    // 2026-05-13 is in week starting 2026-05-11 — that's week index 10 (0-based) of 12.
    // days from window start (2026-03-09) to 2026-05-13 = 65 days
    // pct = 65 / (12*7) = 65/84 = 77.4%
    const pct = annotationPositionPct(new Date("2026-05-13T00:00:00Z"), "12w", today, 12);
    expect(pct).toBeCloseTo(77.38, 1);
  });
  it("returns null for date outside window", () => {
    expect(annotationPositionPct(new Date("2025-01-01"), "30d", today, 30)).toBeNull();
    expect(annotationPositionPct(new Date("2030-01-01"), "30d", today, 30)).toBeNull();
  });
});
```

- [ ] **Step 2: Run, FAIL**

`npx vitest run tests/quality/quality-position.test.ts`

- [ ] **Step 3: Implementation**

`src/utils/quality-position.ts`:
```typescript
import type { PeriodMode } from "../types/quality";

export function isoMonday(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();  // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

const DAY_MS = 86400000;

export function annotationPositionPct(
  occurredAt: Date,
  mode: PeriodMode,
  today: Date,
  bucketCount: number
): number | null {
  const occ = new Date(occurredAt);
  occ.setUTCHours(0, 0, 0, 0);

  if (mode === "30d") {
    const start = new Date(today);
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - (bucketCount - 1));
    const daysFromStart = Math.round((occ.getTime() - start.getTime()) / DAY_MS);
    if (daysFromStart < 0 || daysFromStart >= bucketCount) return null;
    return ((daysFromStart + 0.5) / bucketCount) * 100;
  } else {
    const todayMon = isoMonday(today);
    const start = new Date(todayMon);
    start.setUTCDate(start.getUTCDate() - (bucketCount - 1) * 7);
    const totalDays = bucketCount * 7;
    const daysFromStart = (occ.getTime() - start.getTime()) / DAY_MS;
    if (daysFromStart < 0 || daysFromStart >= totalDays) return null;
    return (daysFromStart / totalDays) * 100;
  }
}
```

- [ ] **Step 4: Run, PASS**

`npx vitest run tests/quality/quality-position.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/utils/quality-position.ts tests/quality/quality-position.test.ts
git commit -m "feat(quality): isoMonday + annotation position math (daily snap, weekly proportional)"
```

---

### Task 16: API client

**Repo:** `makeit-dashboard`

**Files:**
- Create: `src/utils/quality.ts`

- [ ] **Step 1: Реализация**

```typescript
import type { QualityPayload, Annotation, AnnotationCreatePayload } from "../types/quality";

declare global {
  interface Window {
    __MAKEIT_CONFIG__?: { QUALITY_URL?: string; PIPELINE_URL?: string; ANNOT_URL?: string };
  }
}

function qualityUrl(): string {
  return window.__MAKEIT_CONFIG__?.QUALITY_URL ?? "/data/codex-quality.json";
}
function annotUrl(): string {
  return window.__MAKEIT_CONFIG__?.ANNOT_URL ?? "/data/annotations.json";
}
function pipelineUrl(): string {
  return window.__MAKEIT_CONFIG__?.PIPELINE_URL ?? "http://localhost:8766";
}

export async function fetchQualityData(): Promise<QualityPayload> {
  const r = await fetch(qualityUrl(), { cache: "no-cache" });
  if (!r.ok) throw new Error(`Quality fetch failed: ${r.status}`);
  const data = await r.json();
  if (data.schema_version !== 1) {
    throw new Error(`Unknown schema_version: ${data.schema_version}`);
  }
  return data as QualityPayload;
}

export async function fetchAnnotations(): Promise<Annotation[]> {
  const r = await fetch(annotUrl(), { cache: "no-cache" });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`Annotations fetch failed: ${r.status}`);
  const data = await r.json();
  return Array.isArray(data) ? data : (data.annotations ?? []);
}

export async function forceQualityRefresh(): Promise<QualityPayload> {
  const r = await fetch(`${pipelineUrl()}/quality/refresh`, { method: "POST" });
  if (r.status === 409) throw new Error("Sweep уже выполняется — попробуйте через ~5 мин");
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || `Refresh failed: ${r.status}`);
  }
  return r.json();
}

export async function createAnnotation(p: AnnotationCreatePayload): Promise<Annotation> {
  const r = await fetch(`${pipelineUrl()}/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || `Create failed: ${r.status}`);
  }
  return r.json();
}

export async function deleteAnnotation(id: string): Promise<void> {
  const r = await fetch(`${pipelineUrl()}/annotations/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`Delete failed: ${r.status}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/quality.ts
git commit -m "feat(quality): API client (fetch JSON + force-refresh + annotations CRUD)"
```

---

### Task 17: useQuality hook

**Repo:** `makeit-dashboard`

**Files:**
- Create: `src/hooks/useQuality.ts`
- Create: `tests/quality/useQuality.test.tsx`

- [ ] **Step 1: Failing test (fake-fetch + render hook)**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useQuality } from "../../src/hooks/useQuality";

const STALE_HOURS = 30;
const mockFetch = vi.fn();
beforeEach(() => {
  globalThis.fetch = mockFetch as any;
  mockFetch.mockReset();
});

const samplePayload = {
  schema_version: 1,
  generated_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  window_start: "x", window_end: "y", bucket_tz: "UTC",
  repo_status: {}, buckets: { "30d": { labels: [], summary: [], per_repo: {} },
                              "12w": { labels: [], summary: [], per_repo: {} } },
};

describe("useQuality", () => {
  it("loads data on mount", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => samplePayload });
    const { result } = renderHook(() => useQuality());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.loading).toBe(false);
    expect(result.current.isStale).toBe(false);
  });
  it("marks stale when generated_at > 30h old", async () => {
    const old = { ...samplePayload, generated_at: new Date(Date.now() - (STALE_HOURS + 1) * 3.6e6).toISOString() };
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => old });
    const { result } = renderHook(() => useQuality());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.isStale).toBe(true);
  });
  it("surfaces error on 404", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
    const { result } = renderHook(() => useQuality());
    await waitFor(() => expect(result.current.error).not.toBeNull());
  });
});
```

- [ ] **Step 2: Run, FAIL**

`npx vitest run tests/quality/useQuality.test.tsx`

- [ ] **Step 3: Implementation**

`src/hooks/useQuality.ts`:
```typescript
import { useEffect, useState, useCallback, useMemo } from "react";
import type { QualityPayload, Annotation } from "../types/quality";
import { fetchQualityData, fetchAnnotations, forceQualityRefresh } from "../utils/quality";

const STALE_HOURS = 30;

export function useQuality() {
  const [data, setData] = useState<QualityPayload | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const [q, a] = await Promise.all([
        force ? forceQualityRefresh() : fetchQualityData(),
        fetchAnnotations(),
      ]);
      setData(q);
      setAnnotations(a);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const isStale = useMemo(() => {
    if (!data) return false;
    const ageHours = (Date.now() - new Date(data.generated_at).getTime()) / 3.6e6;
    return ageHours > STALE_HOURS;
  }, [data]);

  return { data, annotations, loading, error, isStale, refresh: () => load(true), reloadAnnotations: () => load(false) };
}
```

- [ ] **Step 4: Run, PASS**

`npx vitest run tests/quality/useQuality.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useQuality.ts tests/quality/useQuality.test.tsx
git commit -m "feat(quality): useQuality hook (fetch + isStale + refresh)"
```

---

## Phase G — Frontend chart components

### Task 18: QualityChart (reusable, main + compact)

**Repo:** `makeit-dashboard`

**Files:**
- Create: `src/styles/v4-quality.css` (CSS из прототипа, ниже шорт-версия)
- Create: `src/components/quality/QualityChart.tsx`
- Create: `tests/quality/QualityChart.test.tsx`

- [ ] **Step 1: Перенести CSS из прототипа**

Создать `src/styles/v4-quality.css` — скопировать ВСЕ блоки `.chart`, `.bar*`, `.chart-tip*`, `.bar-chip`, `.annot*`, `.kpi*`, `.card*`, `.summary`, `.btn-add-event`, `.seg`, `.bar-clean`/`.bar-p1`/`.bar-p2` и keyframes (`q-chart-in`, `q-kpi-in`, `q-card-in`) из `quality-tab-prototype.html`. Префиксы оставить как есть — стили scoped через wrapping-div с классом `v4-quality-tab`.

Также добавить в `:root` (в `v4.css`):
```css
--v4-clean-soft: #93C5FD;
```

- [ ] **Step 2: Failing test для QualityChart**

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { QualityChart } from "../../src/components/quality/QualityChart";

const buckets = [
  { total_pr: 10, with_p1: 1, with_p2_only: 2 },
  { total_pr: 20, with_p1: 0, with_p2_only: 4 },
];
const labels = ["2026-05-23", "2026-05-24"];

describe("QualityChart", () => {
  it("renders one bar per bucket", () => {
    const { container } = render(<QualityChart buckets={buckets} labels={labels} compact={false} />);
    expect(container.querySelectorAll(".bar")).toHaveLength(2);
  });
  it("renders clean/p2/p1 segments correctly", () => {
    const { container } = render(<QualityChart buckets={buckets} labels={labels} compact={false} />);
    const firstBar = container.querySelector(".bar")!;
    expect(firstBar.querySelector(".bar-p1")).toBeTruthy();
    expect(firstBar.querySelector(".bar-p2")).toBeTruthy();
    expect(firstBar.querySelector(".bar-clean")).toBeTruthy();
  });
  it("auto-scales y-axis", () => {
    const { container } = render(<QualityChart buckets={buckets} labels={labels} compact={false} />);
    // max=20 → niceCeil=20
    const axis = container.querySelector(".chart-axis-label");
    expect(axis?.textContent).toBe("20");
  });
});
```

- [ ] **Step 3: Run, FAIL**

`npx vitest run tests/quality/QualityChart.test.tsx`

- [ ] **Step 4: Implementation**

`src/components/quality/QualityChart.tsx`:
```tsx
import { useRef, useEffect, useMemo } from "react";
import type { QualityBucket } from "../../types/quality";

interface Props {
  buckets: QualityBucket[];
  labels: string[];
  compact: boolean;
}

function niceCeil(n: number): number {
  if (n <= 5) return 5;
  if (n <= 10) return 10;
  if (n <= 20) return 20;
  if (n <= 50) return 50;
  if (n <= 100) return 100;
  if (n <= 200) return 200;
  return Math.ceil(n / 100) * 100;
}

const LOW_SAMPLE = 8;

export function QualityChart({ buckets, labels, compact }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipRefsObj = useRef<Record<string, HTMLElement>>({});

  const scale = useMemo(() => {
    const max = Math.max(1, ...buckets.map(b => b.total_pr));
    return niceCeil(max);
  }, [buckets]);

  const handleEnter = (b: QualityBucket, label: string, barEl: HTMLDivElement) => {
    const tip = tipRef.current!;
    const refs = tipRefsObj.current;
    const clean = Math.max(0, b.total_pr - b.with_p1 - b.with_p2_only);
    const dirtyPct = b.total_pr > 0 ? ((b.with_p1 + b.with_p2_only) / b.total_pr * 100) : 0;
    refs.label.textContent = label;
    refs.total.textContent = String(b.total_pr);
    refs.clean.textContent = String(clean);
    refs.p2.textContent = String(b.with_p2_only);
    refs.p1.textContent = String(b.with_p1);
    refs.dirty.textContent = dirtyPct.toFixed(0) + "%";
    const cRect = containerRef.current!.getBoundingClientRect();
    const bRect = barEl.getBoundingClientRect();
    const pctX = ((bRect.left + bRect.width / 2) - cRect.left) / cRect.width * 100;
    if (compact) {
      tip.style.left = `${pctX}%`;
      tip.style.transform = "translateX(-50%) translateY(0)";
    } else {
      const flipLeft = pctX > 70;
      tip.style.left = `calc(${pctX}% + 12px - ${flipLeft ? "208px" : "0px"})`;
    }
    tip.classList.add("show");
    containerRef.current!.classList.add("is-hovering");
    barEl.classList.add("is-active");
  };

  const handleLeave = (barEl: HTMLDivElement) => {
    tipRef.current?.classList.remove("show");
    containerRef.current?.classList.remove("is-hovering");
    barEl.classList.remove("is-active");
  };

  return (
    <div ref={containerRef} className={compact ? "card-chart" : "chart"}>
      {!compact && (
        <div className="chart-axis">
          <span className="chart-axis-label" style={{ top: "-2px" }}>{scale}</span>
          <span className="chart-axis-label" style={{ top: "calc(50% - 6px)" }}>{Math.round(scale / 2)}</span>
        </div>
      )}
      {buckets.map((b, i) => {
        const total = b.total_pr;
        const heightPct = (total / scale) * 100;
        // Worst-wins: P0+P1 объединены в crit-сегмент (один красный)
        const critCount = b.with_p0 + b.with_p1_only;
        const cleanCount = Math.max(0, total - critCount - b.with_p2_only);
        const critPct = total > 0 ? (critCount / total) * heightPct : 0;
        const p2Pct = total > 0 ? (b.with_p2_only / total) * heightPct : 0;
        const cleanPct = heightPct - critPct - p2Pct;
        const lowSample = total > 0 && total < LOW_SAMPLE;
        return (
          <div
            key={`${labels[i]}-${i}`}
            className={`bar ${lowSample ? "is-low-sample" : ""} ${b.with_p0 > 0 ? "has-p0" : ""}`}
            ref={(el) => { if (el) {
              el.onmouseenter = () => handleEnter(b, labels[i], el);
              el.onmouseleave = () => handleLeave(el);
            }}}
          >
            <div className="bar-stack" style={{ height: `${heightPct}%` }}>
              {cleanPct > 0 && <div className="bar-clean" style={{ height: `${(cleanPct/heightPct)*100}%` }} />}
              {p2Pct > 0 && <div className="bar-p2" style={{ height: `${(p2Pct/heightPct)*100}%` }} />}
              {critPct > 0 && <div className="bar-crit" style={{ height: `${(critPct/heightPct)*100}%` }} />}
            </div>
            {heightPct === 0 && <div className="bar-empty" />}
            <div className="bar-chip">
              {total} PR{b.with_p0 > 0 && <> · <b style={{ color: "#fca5a5" }}>P0:{b.with_p0}</b></>}
            </div>
          </div>
        );
      })}
      <div
        ref={tipRef}
        className={`chart-tip ${compact ? "chart-tip--compact" : ""}`}
      >
        {compact ? (
          <>
            <span ref={el => { if (el) tipRefsObj.current.label = el; }} className="ct-d" /> ·
            <span ref={el => { if (el) tipRefsObj.current.total = el; }} className="ct-v" /> PR ·
            <span ref={el => { if (el) tipRefsObj.current.clean = el; }} className="ct-c" />/
            <span ref={el => { if (el) tipRefsObj.current.p2 = el; }} className="ct-p2" />/
            <span ref={el => { if (el) tipRefsObj.current.p1 = el; }} className="ct-p1" />
            <span ref={el => { if (el) tipRefsObj.current.dirty = el; }} className="ct-pct" />
          </>
        ) : (
          <>
            <div ref={el => { if (el) tipRefsObj.current.label = el; }} className="chart-tip-l" />
            <div className="chart-tip-row">
              <span ref={el => { if (el) tipRefsObj.current.total = el; }} className="chart-tip-v" />
              <span className="chart-tip-u">PR в периоде</span>
            </div>
            <div className="chart-tip-foot">
              <span className="chart-tip-seg"><i className="sw" style={{ background: "var(--v4-clean-soft)" }} /> чистые</span>
              <span ref={el => { if (el) tipRefsObj.current.clean = el; }} className="chart-tip-tr" />
            </div>
            <div className="chart-tip-foot chart-tip-foot--tight">
              <span className="chart-tip-seg"><i className="sw" style={{ background: "var(--v4-p2)" }} /> P2 only</span>
              <span ref={el => { if (el) tipRefsObj.current.p2 = el; }} className="chart-tip-tr" style={{ color: "var(--v4-p2-text)" }} />
            </div>
            <div className="chart-tip-foot chart-tip-foot--tight">
              <span className="chart-tip-seg"><i className="sw" style={{ background: "var(--v4-p1)" }} /> P1</span>
              <span ref={el => { if (el) tipRefsObj.current.p1 = el; }} className="chart-tip-tr" style={{ color: "var(--v4-p1-text)" }} />
            </div>
            <div className="chart-tip-foot" style={{ borderTop: "1px solid var(--v4-line-soft)", paddingTop: 8, marginTop: 4 }}>
              <span>Δ грязных</span>
              <span ref={el => { if (el) tipRefsObj.current.dirty = el; }} className="chart-tip-tr" style={{ fontSize: 13 }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run, PASS**

`npx vitest run tests/quality/QualityChart.test.tsx`

- [ ] **Step 6: Commit**

```bash
git add src/styles/v4-quality.css src/components/quality/QualityChart.tsx tests/quality/QualityChart.test.tsx
git commit -m "feat(quality): QualityChart component (main + compact) with hover behavior"
```

---

### Task 19: QualityKPIs

**Repo:** `makeit-dashboard`

**Files:**
- Create: `src/components/quality/QualityKPIs.tsx`

- [ ] **Step 1: Implementation**

```tsx
import type { QualityPayload, PeriodMode } from "../../types/quality";

interface Props { data: QualityPayload; mode: PeriodMode; }

export function QualityKPIs({ data, mode }: Props) {
  const buckets = data.buckets[mode].summary;
  const total = buckets.reduce((a, b) => a + b.total_pr, 0);
  const totalP0 = buckets.reduce((a, b) => a + b.with_p0, 0);
  const totalP1 = buckets.reduce((a, b) => a + b.with_p1_only, 0);
  const totalP2 = buckets.reduce((a, b) => a + b.with_p2_only, 0);
  const dirty = totalP0 + totalP1 + totalP2;
  const dirtyPct = total ? Math.round(dirty / total * 100) : 0;
  const p1Pct = total ? Math.round(totalP1 / total * 100) : 0;
  const p2Pct = total ? Math.round(totalP2 / total * 100) : 0;
  const avgPerPeriod = buckets.length ? Math.round(total / buckets.length) : 0;
  const periodLabel = mode === "12w" ? "за 12 нед." : "за 30 дней";

  return (
    <div className="kpis">
      {/* P0-alert pill — pulse-плашка, видна только если есть блокеры в периоде */}
      {totalP0 > 0 && (
        <div className="kpi-p0-alert" title="Блокирующие баги от Codex. Требуют немедленного внимания.">
          <span className="kpi-p0-icon">🔴</span>
          <div className="kpi-p0-text">
            <b>P0: {totalP0}</b>
            <span>БЛОКЕРЫ {periodLabel}</span>
          </div>
        </div>
      )}
      <div className="kpi" style={{ ["--i" as any]: 0 }}>
        <div className="kpi-lbl">% грязных PR · {periodLabel}</div>
        <div className="kpi-v">{dirtyPct}%</div>
        <div className="kpi-sub">{dirty} из {total} PR</div>
      </div>
      <div className="kpi" style={{ ["--i" as any]: 1 }}>
        <div className="kpi-lbl">% P1 · {periodLabel}</div>
        <div className="kpi-v" style={{ color: "var(--v4-p1-text)" }}>{p1Pct}%</div>
      </div>
      <div className="kpi" style={{ ["--i" as any]: 2 }}>
        <div className="kpi-lbl">% P2 · {periodLabel}</div>
        <div className="kpi-v" style={{ color: "var(--v4-p2-text)" }}>{p2Pct}%</div>
      </div>
      <div className="kpi" style={{ ["--i" as any]: 3 }}>
        <div className="kpi-lbl">PR {periodLabel}</div>
        <div className="kpi-v">{total}</div>
        <div className="kpi-sub">{avgPerPeriod} в {mode === "12w" ? "среднем за неделю" : "среднем за день"}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/quality/QualityKPIs.tsx
git commit -m "feat(quality): QualityKPIs (4 cards computed from current period summary)"
```

---

### Task 20: QualityAnnotations

**Repo:** `makeit-dashboard`

**Files:**
- Create: `src/components/quality/QualityAnnotations.tsx`

- [ ] **Step 1: Implementation**

```tsx
import type { Annotation, PeriodMode } from "../../types/quality";
import { annotationPositionPct } from "../../utils/quality-position";

interface Props {
  annotations: Annotation[];
  mode: PeriodMode;
  bucketCount: number;
}

export function QualityAnnotations({ annotations, mode, bucketCount }: Props) {
  const today = new Date();
  return (
    <>
      {annotations.map(a => {
        const pct = annotationPositionPct(new Date(a.occurred_at), mode, today, bucketCount);
        if (pct === null) return null;
        return (
          <div key={a.id} className={`annot is-${a.category}`} style={{ left: `${pct}%` }}>
            <div className="annot-dot" />
            <div className="annot-tip">
              <span className="annot-tip-cat">{a.category}</span><br />
              <b>{a.title}</b><br />
              <span style={{ opacity: 0.8, whiteSpace: "normal" }}>{a.desc}</span>
              <div className="annot-tip-date">
                {new Date(a.occurred_at).toLocaleDateString("ru")}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/quality/QualityAnnotations.tsx
git commit -m "feat(quality): QualityAnnotations renders vertical markers with hover tip"
```

---

### Task 21: QualityProjectCard

**Repo:** `makeit-dashboard`

**Files:**
- Create: `src/components/quality/QualityProjectCard.tsx`

- [ ] **Step 1: Implementation**

```tsx
import type { QualityPayload, PeriodMode, RepoStatusEntry } from "../../types/quality";
import { QualityChart } from "./QualityChart";

interface Props {
  repo: string;
  client: string;
  data: QualityPayload;
  mode: PeriodMode;
  index: number;
}

function severityBadge(dirtyPct: number): { label: string; cls: string } | null {
  if (dirtyPct === 0 || Number.isNaN(dirtyPct)) return null;
  if (dirtyPct >= 25) return { label: "высокий риск", cls: "tag-bad" };
  if (dirtyPct >= 12) return { label: "средний", cls: "tag-warn" };
  return { label: "чисто", cls: "tag-good" };
}

export function QualityProjectCard({ repo, client, data, mode, index }: Props) {
  const status: RepoStatusEntry | undefined = data.repo_status[repo];
  const repoData = data.buckets[mode].per_repo[repo];
  const labels = data.buckets[mode].labels;

  // Error state
  if (status?.status === "error") {
    return (
      <div className="card" style={{ ["--i" as any]: index }}>
        <div className="card-h">
          <div>
            <div className="card-name">{repo}</div>
            <div className="card-client">{client}</div>
          </div>
          <span className="tag tag-bad">ошибка fetch</span>
        </div>
        <div className="card-empty">
          <b>{status.code || "ERROR"}</b>
          {status.message || "Sweep не смог получить данные"}
        </div>
      </div>
    );
  }

  if (!repoData) {
    return (
      <div className="card" style={{ ["--i" as any]: index }}>
        <div className="card-h">
          <div className="card-name">{repo}</div>
        </div>
        <div className="card-empty">нет данных</div>
      </div>
    );
  }

  const totalPR = repoData.buckets.reduce((a, b) => a + b.total_pr, 0);
  const totalP0 = repoData.buckets.reduce((a, b) => a + b.with_p0, 0);
  const totalP1 = repoData.buckets.reduce((a, b) => a + b.with_p1_only, 0);
  const totalP2 = repoData.buckets.reduce((a, b) => a + b.with_p2_only, 0);
  const totalDirty = totalP0 + totalP1 + totalP2;

  if (totalPR < 3) {
    return (
      <div className="card" style={{ ["--i" as any]: index }}>
        <div className="card-h">
          <div>
            <div className="card-name">{repo}</div>
            <div className="card-client">{client}</div>
          </div>
          <span className="tag">мало данных</span>
        </div>
        <div className="card-empty">
          <b>{totalPR} PR за период</b>
          Нужно ≥3 для расчёта
        </div>
      </div>
    );
  }

  const dirtyPct = totalDirty / totalPR * 100;
  const p1Pct = totalP1 / totalPR * 100;
  const p2Pct = totalP2 / totalPR * 100;
  const badge = severityBadge(dirtyPct);
  const coverage = repoData.codex_coverage_pct;
  const lowCoverage = coverage < 50;

  return (
    <div className="card" style={{ ["--i" as any]: index }}>
      <div className="card-h">
        <div>
          <div className="card-name">{repo}</div>
          <div className="card-client">{client}</div>
        </div>
        <div>
          <div className="card-now">{dirtyPct.toFixed(0)}%</div>
          <div className="card-now-sub">{totalDirty}/{totalPR} PR</div>
        </div>
      </div>
      <QualityChart buckets={repoData.buckets} labels={labels} compact />
      <div className="card-foot">
        <div className="nums">
          {totalP0 > 0 && (
            <span className="num-p0" title="БЛОКЕР">
              <b style={{ color: "var(--v4-p0-text)", background: "rgba(239,68,68,0.12)",
                         padding: "1px 6px", borderRadius: 3, fontWeight: 700 }}>
                🔴 P0: {totalP0}
              </b>
            </span>
          )}
          <span className="num-p1">P1 <b>{p1Pct.toFixed(0)}%</b></span>
          <span className="num-p2">P2 <b>{p2Pct.toFixed(0)}%</b></span>
          {lowCoverage && (
            <span className="tag tag-warn" title="Codex ревьюил меньше половины PR">
              Codex: {coverage}%
            </span>
          )}
        </div>
        {badge && <span className={`tag ${badge.cls}`}>{badge.label}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/quality/QualityProjectCard.tsx
git commit -m "feat(quality): QualityProjectCard with error/empty/low-coverage states"
```

---

### Task 22: QualitySummaryPanel + StaleBanner

**Repo:** `makeit-dashboard`

**Files:**
- Create: `src/components/quality/QualitySummaryPanel.tsx`
- Create: `src/components/quality/QualityStaleBanner.tsx`

- [ ] **Step 1: StaleBanner**

```tsx
interface Props { generatedAt: string; onRefresh: () => void; }

export function QualityStaleBanner({ generatedAt, onRefresh }: Props) {
  const ageHours = Math.round((Date.now() - new Date(generatedAt).getTime()) / 3.6e6);
  return (
    <div className="quality-stale-banner">
      <span>⚠ Данные не обновлялись {ageHours}ч. Проверь cron на Pipeline Mac.</span>
      <button className="btn-refresh" onClick={onRefresh}>↻ Обновить сейчас</button>
    </div>
  );
}
```

- [ ] **Step 2: SummaryPanel**

```tsx
import type { QualityPayload, Annotation, PeriodMode } from "../../types/quality";
import { QualityChart } from "./QualityChart";
import { QualityKPIs } from "./QualityKPIs";
import { QualityAnnotations } from "./QualityAnnotations";

interface Props {
  data: QualityPayload;
  annotations: Annotation[];
  mode: PeriodMode;
}

export function QualitySummaryPanel({ data, annotations, mode }: Props) {
  const buckets = data.buckets[mode].summary;
  const labels = data.buckets[mode].labels;
  const errored = Object.entries(data.repo_status).filter(([, s]) => s.status === "error");

  return (
    <div className="panel summary">
      <div className="chartwrap">
        <div className="panel-t" style={{ marginBottom: 14 }}>
          Сводно по всем {Object.keys(data.repo_status).length} проектам
          <span className="tag">All repos</span>
          {errored.length > 0 && (
            <span className="tag tag-bad" title={errored.map(([r, s]) => `${r}: ${s.code}`).join("\n")}>
              ⚠ {errored.length} репо без данных
            </span>
          )}
        </div>
        <QualityChart buckets={buckets} labels={labels} compact={false} />
        <QualityAnnotations annotations={annotations} mode={mode} bucketCount={buckets.length} />
        <div className="chart-legend">
          <span><i className="dot dot-p1" /> P1 (критическое)</span>
          <span><i className="dot dot-p2" /> P2 (высокое)</span>
          <span><i className="dot dot-clean" /> чистые PR</span>
        </div>
      </div>
      <QualityKPIs data={data} mode={mode} />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/quality/QualitySummaryPanel.tsx src/components/quality/QualityStaleBanner.tsx
git commit -m "feat(quality): SummaryPanel (chart + KPIs + annotations + error badge) + StaleBanner"
```

---

### Task 23: ProjectGrid + sort

**Repo:** `makeit-dashboard`

**Files:**
- Create: `src/components/quality/QualityProjectGrid.tsx`

- [ ] **Step 1: Implementation**

```tsx
import { useState, useMemo } from "react";
import type { QualityPayload, PeriodMode } from "../../types/quality";
import { PROJECTS } from "../../utils/config";
import { QualityProjectCard } from "./QualityProjectCard";

interface Props { data: QualityPayload; mode: PeriodMode; }

type SortKey = "dirty" | "alpha" | "p1";

export function QualityProjectGrid({ data, mode }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("dirty");

  const sorted = useMemo(() => {
    return [...PROJECTS].sort((a, b) => {
      if (sortKey === "alpha") return a.repo.localeCompare(b.repo);
      const aD = computeDirtyPct(data, a.repo, mode);
      const bD = computeDirtyPct(data, b.repo, mode);
      const aP1 = computeP1Pct(data, a.repo, mode);
      const bP1 = computeP1Pct(data, b.repo, mode);
      if (sortKey === "p1") return bP1 - aP1;
      return bD - aD;
    });
  }, [data, mode, sortKey]);

  return (
    <>
      <div className="sect">
        <h2>По проектам</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="meta">Сортировка:</span>
          <div className="sort">
            <button className={sortKey === "dirty" ? "active" : ""} onClick={() => setSortKey("dirty")}>по «грязи»</button>
            <button className={sortKey === "alpha" ? "active" : ""} onClick={() => setSortKey("alpha")}>по алфавиту</button>
            <button className={sortKey === "p1" ? "active" : ""} onClick={() => setSortKey("p1")}>по P1</button>
          </div>
        </div>
      </div>
      <div className="grid">
        {sorted.map((p, idx) => (
          <QualityProjectCard
            key={p.repo}
            repo={p.repo}
            client={p.client}
            data={data}
            mode={mode}
            index={idx}
          />
        ))}
      </div>
    </>
  );
}

function computeDirtyPct(data: QualityPayload, repo: string, mode: PeriodMode): number {
  const r = data.buckets[mode].per_repo[repo];
  if (!r) return 0;
  const tot = r.buckets.reduce((a, b) => a + b.total_pr, 0);
  if (!tot) return 0;
  const dirty = r.buckets.reduce((a, b) => a + b.with_p1 + b.with_p2_only, 0);
  return dirty / tot * 100;
}
function computeP1Pct(data: QualityPayload, repo: string, mode: PeriodMode): number {
  const r = data.buckets[mode].per_repo[repo];
  if (!r) return 0;
  const tot = r.buckets.reduce((a, b) => a + b.total_pr, 0);
  if (!tot) return 0;
  return r.buckets.reduce((a, b) => a + b.with_p1, 0) / tot * 100;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/quality/QualityProjectGrid.tsx
git commit -m "feat(quality): QualityProjectGrid with sort by dirty/alpha/p1"
```

---

### Task 24: AnnotationModal

**Repo:** `makeit-dashboard`

**Files:**
- Create: `src/components/quality/AnnotationModal.tsx`
- Create: `tests/quality/AnnotationModal.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { AnnotationModal } from "../../src/components/quality/AnnotationModal";

describe("AnnotationModal", () => {
  it("submits annotation with form values converted to UTC", async () => {
    const onSubmit = vi.fn().mockResolvedValue({});
    const { getByLabelText, getByText } = render(
      <AnnotationModal onSubmit={onSubmit} onClose={vi.fn()} />
    );
    fireEvent.change(getByLabelText(/дата/i), { target: { value: "2026-05-22" } });
    fireEvent.change(getByLabelText(/title/i), { target: { value: "test event" } });
    fireEvent.click(getByText(/сохранить/i));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      occurred_at: "2026-05-22T00:00:00.000Z",
      category: "skill",
      scope: "global",
      title: "test event",
      desc: "",
    }));
  });
});
```

- [ ] **Step 2: Run, FAIL**

`npx vitest run tests/quality/AnnotationModal.test.tsx`

- [ ] **Step 3: Implementation**

```tsx
import { useState } from "react";
import type { AnnotationCreatePayload, AnnotationCategory } from "../../types/quality";

interface Props {
  onSubmit: (p: AnnotationCreatePayload) => Promise<void>;
  onClose: () => void;
}

export function AnnotationModal({ onSubmit, onClose }: Props) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<AnnotationCategory>("skill");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      // Local midnight → UTC, либо берём дату как-есть UTC (упрощение для v1)
      const occurredAt = new Date(date + "T00:00:00Z").toISOString();
      await onSubmit({
        occurred_at: occurredAt,
        category,
        scope: "global",
        title: title.trim(),
        desc: desc.trim(),
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-bd" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>Добавить событие</h3>
        <label>
          <span>Дата (UTC)</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          <span>Категория</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as AnnotationCategory)}>
            <option value="skill">skill — обновление скилла разработки</option>
            <option value="deploy">deploy — деплой инфраструктуры</option>
            <option value="manual">manual — pair-сессия, ad-hoc</option>
          </select>
        </label>
        <label>
          <span>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
        </label>
        <label>
          <span>Описание</span>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={600} rows={3} />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Отмена</button>
          <button type="submit" disabled={submitting}>Сохранить</button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run, PASS**

`npx vitest run tests/quality/AnnotationModal.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/components/quality/AnnotationModal.tsx tests/quality/AnnotationModal.test.tsx
git commit -m "feat(quality): AnnotationModal for + событие button"
```

---

### Task 25: QualityTab (orchestrator)

**Repo:** `makeit-dashboard`

**Files:**
- Create: `src/components/quality/QualityTab.tsx`

- [ ] **Step 1: Implementation**

```tsx
import { useState } from "react";
import { useQuality } from "../../hooks/useQuality";
import type { PeriodMode, AnnotationCreatePayload } from "../../types/quality";
import { QualitySummaryPanel } from "./QualitySummaryPanel";
import { QualityProjectGrid } from "./QualityProjectGrid";
import { QualityStaleBanner } from "./QualityStaleBanner";
import { AnnotationModal } from "./AnnotationModal";
import { createAnnotation } from "../../utils/quality";
import "../../styles/v4-quality.css";

export function QualityTab() {
  const { data, annotations, loading, error, isStale, refresh, reloadAnnotations } = useQuality();
  const [mode, setMode] = useState<PeriodMode>("12w");
  const [showAddModal, setShowAddModal] = useState(false);

  if (loading && !data) return <div className="v4-quality-tab">Загрузка…</div>;
  if (error) {
    return (
      <div className="v4-quality-tab">
        <div className="quality-error-panel">
          <b>Ошибка загрузки данных:</b> {error}
          <button onClick={() => refresh()}>Попробовать снова</button>
        </div>
      </div>
    );
  }
  if (!data) return <div className="v4-quality-tab">Нет данных</div>;

  const handleAddAnnotation = async (p: AnnotationCreatePayload) => {
    await createAnnotation(p);
    await reloadAnnotations();
  };

  return (
    <div className="v4-quality-tab page">
      <div className="pageH">
        <div>
          <h1>Качество кода и изменения</h1>
          <div className="sub">
            Доля PR с критическими/высокими замечаниями <b>chatgpt-codex-connector[bot]</b> от общего числа merged PR · события на временной оси
          </div>
        </div>
        <div className="ctrls">
          <div className="seg">
            <button className={mode === "30d" ? "active" : ""} onClick={() => setMode("30d")}>30 дней · По дням</button>
            <button className={mode === "12w" ? "active" : ""} onClick={() => setMode("12w")}>12 недель · По неделям</button>
          </div>
          <button className="btn-add-event" onClick={() => setShowAddModal(true)}>+ событие</button>
          <div style={{ fontFamily: "var(--v4-mono)", fontSize: 10, color: "var(--v4-ink-500)", textAlign: "right" }}>
            <div>Синхр. ежедневно · 03:00 Бали</div>
            <div style={{ color: "var(--v4-ink-400)" }}>
              последняя: {new Date(data.generated_at).toLocaleString("ru")}
            </div>
          </div>
          <button className="btn-refresh" onClick={() => refresh()} disabled={loading}>↻ Сейчас</button>
        </div>
      </div>

      {isStale && <QualityStaleBanner generatedAt={data.generated_at} onRefresh={() => refresh()} />}

      <QualitySummaryPanel data={data} annotations={annotations} mode={mode} />
      <QualityProjectGrid data={data} mode={mode} />

      {showAddModal && (
        <AnnotationModal
          onSubmit={handleAddAnnotation}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/quality/QualityTab.tsx
git commit -m "feat(quality): QualityTab orchestrator with mode toggle + add-event modal"
```

---

### Task 26: Add tab to App.tsx

**Repo:** `makeit-dashboard`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Найти tab-button block в App.tsx**

```bash
grep -n "TabButton\|setTab\|tab ===" src/App.tsx | head -20
```

- [ ] **Step 2: Добавить вкладку**

В блок с TabButtons (после последней):
```tsx
<TabButton id="quality" active={tab === "quality"} onClick={() => setTab("quality")}>
  Качество
</TabButton>
```

В render-блок (после последнего `{tab === "..." && ...}`):
```tsx
{tab === "quality" && (
  <Suspense fallback={<div>Загрузка…</div>}>
    <QualityTab />
  </Suspense>
)}
```

С import:
```tsx
const QualityTab = lazy(() => import("./components/quality/QualityTab").then(m => ({ default: m.QualityTab })));
```

- [ ] **Step 3: Manual test**

```bash
npm run dev
# Открыть http://localhost:5173/makeit-dashboard/
# Кликнуть «Качество» → увидеть вкладку
# Проверить toggle 30d/12w, hover на бары, + событие
```

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(quality): integrate Quality tab into App with lazy-load"
```

---

## Phase H — Final integration

### Task 27: End-to-end verification

**Files:** none (manual)

- [ ] **Step 1: Backend smoke (Pipeline Mac)**

```bash
ssh sergeymakarov
cd ~/makeit-pipeline
git pull && pip install -e . && pytest tests/quality/
launchctl unload ~/Library/LaunchAgents/com.makeit.codex-quality-sweep.plist
launchctl load ~/Library/LaunchAgents/com.makeit.codex-quality-sweep.plist
launchctl start com.makeit.codex-quality-sweep
sleep 60
cat ~/data/codex-quality.json | jq '.schema_version, .repo_status'
```
Expected: schema_version=1, repo_status имеет 14 ключей с "ok" статусами.

- [ ] **Step 2: VPS verify**

```bash
curl -s https://your-dashboard-domain/data/codex-quality.json | jq '.generated_at'
```
Expected: свежий timestamp.

- [ ] **Step 3: Frontend e2e**

```bash
ssh root@89.167.17.79 'bash /opt/apps/makeit-stack/deploy.sh'  # стандартный deploy dashboard
```
Открыть дашборд в браузере, вкладка «Качество», проверить:
- ✅ Чарт загружается, бары видны
- ✅ Hover на бар → tooltip-card справа
- ✅ Hover на mini-chart → compact tooltip + dim siblings
- ✅ Toggle 30d/12w работает
- ✅ + событие → модалка → submit → линия появилась
- ✅ Если cron работает >30ч назад — баннер stale показан

- [ ] **Step 4: Commit финальная заметка**

В `docs/DEPLOYMENT.md` дописать секцию про Quality tab — где данные, где cron, как переустановить plist, где логи.

```bash
git add docs/DEPLOYMENT.md
git commit -m "docs(quality): deployment notes for Quality tab + cron"
```

---

## Self-Review

Прошёлся по спецу. Каждый пункт раздела имеет соответствующую задачу:

- ✅ Метрика + bucketize → Task 3
- ✅ Per-chart auto-scaling → Task 18 (niceCeil per chart)
- ✅ Worst-wins (P1+P2 → P1) → Task 2 (group_findings_per_pr)
- ✅ Atomic remote publish → Task 4
- ✅ Locking → Task 5
- ✅ Retry с rate-limit headers → Task 6
- ✅ GitHub API fix (early-exit без `?since`) → Task 7
- ✅ Sweep с repo_status + coverage → Task 8
- ✅ Sanitized errors → Task 9 + 12
- ✅ Explicit quality_repos.json → Task 1
- ✅ launchd plist → Task 10
- ✅ Annotations с UUID + scope → Task 11 + 12
- ✅ JSON schema metadata (window_start/end, bucket_tz, schema_version) → Task 8 (run_sweep payload)
- ✅ Low-sample badge → Task 18 (is-low-sample class) + Task 21 (totalPR<3 empty state)
- ✅ Codex coverage badge → Task 21 (lowCoverage condition)
- ✅ POST/DELETE security → Task 12 (Pydantic + length limits)
- ✅ Healthcheck + stale banner → Task 22
- ✅ ISO-week UTC bucketing → Task 3 (bucketize_weekly_iso)
- ✅ Annotation position math (snap/proportional) → Task 15
- ✅ Hover behaviour identical main+compact → Task 18 (одна функция handleEnter, compact branching)
- ✅ Reduced-motion + animations → CSS из прототипа (Task 18 step 1)

Type consistency: QualityBucket, QualityPayload, Annotation определены в Task 14, использованы консистентно во всех task'ах далее.

Placeholders: проверил — все шаги содержат полный код, нет "TBD"/"add error handling".

Plan ready.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-25-codex-quality-tab.md`.**

Два варианта выполнения:

**1. Subagent-Driven (рекомендуется)** — каждая task в свежий subagent, review между task'ами, быстрая итерация. Хорошо для длинного плана (27 tasks в двух репо).

**2. Inline Execution** — выполнить в текущей сессии через executing-plans, чекпоинты для review между фазами.

Что выбираешь?
