# MakeIT — Карта бизнес-процессов

> Документ сгенерирован на основе анализа кода 4 репозиториев: makeit-dashboard, makeit-auditor, makeit-pipeline, makeit-knowledge.
> Дата: 2026-04-11

---

## Архитектура системы

### 4 компонента MakeIT

| Компонент | Стек | Порт | Назначение |
|-----------|------|------|------------|
| **Dashboard** | React 19 + TypeScript + Vite | :5173 (dev) | SPA — панель управления всей системой |
| **Auditor** | Python + FastAPI | :8765 | Автоматический code audit (L1–L4 pipeline) |
| **Pipeline** | Python + FastAPI | :8766 | Автоматическая разработка, транскрипции, research, debate |
| **Knowledge** | Markdown-файлы | — | База знаний: глобальные правила, скиллы, бизнес-логика, шаблоны |

### Внешние сервисы

| Сервис | Использование | Компоненты |
|--------|---------------|------------|
| **GitHub API** (GraphQL + REST) | Проекты, Issues, PRs, branches, CI, milestones | Dashboard, Pipeline, Auditor |
| **GitHub Actions** | CI мониторинг (тесты, линт) | Pipeline |
| **Claude API** (Anthropic) | Верификация findings, чат, ретроспективы, транскрипт-обработка | Dashboard, Pipeline |
| **Claude CLI** (`claude --print`) | Dev-агент, review-агент, discovery, research | Pipeline |
| **OpenAI API** | Транскрипция аудио (gpt-4o-transcribe), weekly review (Codex) | Pipeline |
| **RunPod** (GPU) | vLLM инстансы для LLM-аудита (Qwen3-Coder-Next) | Auditor |
| **BetterStack** | Uptime мониторинг сервисов | Dashboard |
| **Telegram Bot API** | Уведомления о прогрессе, rate-limit алерты, результаты QA | Pipeline, Auditor |
| **faster-whisper** (local, опц.) | Локальная транскрипция с diarization (GPU + HF_TOKEN) | Pipeline |

### Связи между компонентами

```
┌──────────────────────────────────────────────────────────────┐
│                        ПОЛЬЗОВАТЕЛЬ                          │
│            (соло-разработчик + AI-агенты)                    │
└──────┬───────────────┬────────────────┬──────────────────────┘
       │               │                │
       ▼               ▼                ▼
┌──────────────┐ ┌───────────────┐ ┌──────────────┐
│  Dashboard   │ │    CLI        │ │   Telegram   │
│  (browser)   │ │  (terminal)   │ │   (бот)      │
└──────┬───────┘ └──────┬────────┘ └──────────────┘
       │                │
       │  HTTP API      │  CLI
       ▼                ▼
┌──────────────────────────────────────┐
│         Pipeline API (:8766)         │ ◄── SSH tunnel на VPS
│  Orchestrator, Agents, Transcripts,  │
│  Research, Discovery, Debate,        │
│  Quality, Retro, AutoTuner           │
└──────┬───────────────────────────────┘
       │  HTTP API (localhost:8765)
       ▼
┌──────────────────────────────────────┐
│         Auditor API (:8765)          │
│  L1 (ruff,mypy,semgrep,eslint) →    │
│  L2 (AST indexing) →                │
│  L3 (LLM audit, RunPod GPU) →      │
│  L4 (Reports, Gist, Telegram)       │
└──────────────────────────────────────┘

Knowledge (makeit-knowledge):
  └── Читается Claude-агентами через CLAUDE.md, Skills, промпты
  └── Не имеет API — это файловая база знаний
```

### API-вызовы Dashboard → Auditor (:8765)

| Endpoint | Метод | Файл Dashboard | Назначение |
|----------|-------|----------------|------------|
| `/api/projects` | GET | `auditor.ts` | Список проектов + статус последнего аудита |
| `/api/audit/{project}/run` | POST | `auditor.ts` | Запуск аудита |
| `/api/audit/{project}/cancel` | POST | `auditor.ts` | Отмена аудита |
| `/api/audit/{project}/status` | GET | `auditor.ts` | Статус текущего аудита |
| `/api/audit/{project}/findings` | GET | `auditor.ts` | Findings (severity, category, file, line) |
| `/api/audit/{project}/verification` | GET/POST | `auditor.ts` | Загрузка/сохранение VerificationReport |
| `/api/audit/{project}/meta` | POST | `auditor.ts` | Метаданные (issues_created, issue_urls) |
| `/api/ux/{project}/run` | POST | `ux-auditor.ts` | Запуск UX-аудита |
| `/api/ux/{project}/status` | GET | `ux-auditor.ts` | Статус UX-аудита |
| `/api/ux/{project}/results` | GET | `ux-auditor.ts` | Результаты UX-аудита (findings + скриншоты) |

### API-вызовы Dashboard → Pipeline (:8766)

| Endpoint | Метод | Файл Dashboard | Назначение |
|----------|-------|----------------|------------|
| `/health` | GET | `pipeline.ts` | Health check |
| `/pipeline/start` | POST | `pipeline.ts` | Запуск pipeline (project, labels, complexity_filter) |
| `/pipeline/stop` | POST | `pipeline.ts` | Остановка pipeline |
| `/pipeline/status` | GET | `pipeline.ts` | Статус: очередь, активные задачи, stage progress |
| `/pipeline/stats` | GET | `pipeline.ts` | KPI: closed_issues, first_pass_rate, cost |
| `/pipeline/classify` | POST | `pipeline.ts` | Классификация issues по сложности (SSE stream) |
| `/pipeline/timeline/{repo}/{issue}` | GET | `pipeline.ts` | Timeline стадий задачи |
| `/transcript/upload` | POST | `transcript.ts` | Загрузка аудио/текста |
| `/transcript/status/{id}` | GET | `transcript.ts` | Статус обработки (intake→stt→…→done) |
| `/transcript/result/{id}` | GET/PUT | `transcript.ts` | BRIEF.md + transcript_text |
| `/transcript/list` | GET | `transcript.ts` | История транскрипций |
| `/research/start` | POST | `pipeline.ts` | Запуск research-агента |
| `/discovery/start` | POST | `pipeline.ts` | Запуск discovery-агента |
| `/research/status/{id}` | GET | `pipeline.ts` | Статус research |
| `/research/history` | GET | `pipeline.ts` | История research/discovery |
| `/pipeline/quality/snapshot` | GET | `quality.ts` | Текущие KPI качества |
| `/pipeline/quality/trends` | GET | `quality.ts` | 12-недельные тренды |
| `/pipeline/quality/findings` | GET | `quality.ts` | Распределение findings по категориям |
| `/pipeline/quality/errors` | GET | `quality.ts` | Распределение ошибок |
| `/pipeline/quality/pending` | GET | `quality.ts` | AutoTuner: ожидающие изменения |
| `/pipeline/quality/pending/{id}/apply` | POST | `quality.ts` | Применить изменение |
| `/pipeline/quality/pending/{id}/reject` | POST | `quality.ts` | Отклонить изменение |
| `/pipeline/quality/retro/list` | GET | `quality.ts` | Список ретроспектив |
| `/pipeline/quality/retro/{id}` | GET | `quality.ts` | Детали ретроспективы |
| `/pipeline/quality/retro/run` | POST | `quality.ts` | Запуск ретроспективы |
| `/pipeline/debate/start` | POST | `debate.ts` | Запуск дебатов |
| `/pipeline/debate/{id}/status` | GET | `debate.ts` | Статус дебатов |
| `/pipeline/debate/{id}/result` | GET | `debate.ts` | Результат дебатов |
| `/pipeline/debate/list` | GET | `debate.ts` | Список дебатов |

### Pipeline → Auditor (localhost:8765)

| Endpoint | Метод | Файл Pipeline | Назначение |
|----------|-------|---------------|------------|
| `/api/audit/{project}/verify` | POST | `qa_client.py` | QA-верификация PR перед мержем (spec-based) |

---

## Бизнес-процессы

---

### Процесс 1: Автоматическая разработка (Pipeline)

**Статус:** ✅ Реализован  
**Компоненты:** Pipeline (orchestrator), Dashboard (UI), GitHub (Issues/PRs)  
**Ключевые файлы:**
- Pipeline: `simple_orchestrator.py`, `workflow.py`, `phase_machine.py`, `dev_agent.py`, `review_agent.py`, `git_ops.py`, `qa_client.py`
- Dashboard: `PipelineControlPanel.tsx`, `usePipeline.ts`, `pipeline.ts`

#### Стадии

```
┌─────────┐    ┌─────┐    ┌────────────┐    ┌───────────┐    ┌───────────┐    ┌──────────────┐    ┌────────────────┐    ┌────────┐
│ queued  │───▶│ dev │───▶│ self_check │───▶│ pr_opened │───▶│ in_review │───▶│ qa_verifying │───▶│ ready_to_merge │───▶│ merged │
└─────────┘    └──┬──┘    └─────┬──────┘    └───────────┘    └─────┬─────┘    └──────┬───────┘    └────────────────┘    └────────┘
                  │             │                                   │                  │
                  ▼             ▼                                   ▼                  ▼
             dev_failure   self_check_fail                   review_failed         qa_failed
             → retry(3)   → retry dev                       → retry dev           → retry dev
             → needs_human                                  → needs_human         → needs_human
```

#### Детальный поток

1. **Запуск** (🧑 человек): Пользователь в Dashboard выбирает проект, фильтры → POST `/pipeline/start`
2. **Очередь** (🤖 автомат): `queue.py` загружает GitHub Issues по label/priority → сортировка по DAG-зависимостям
3. **Conflict Prediction** (🤖): `conflict_predictor.py` определяет пересечения файлов → параллельное vs последовательное выполнение
4. **Routing** (🤖): `workflow.py` маршрутизирует issue → dev/review/bugfix/codex/discovery/ux_fix
5. **Dev** (🤖): `dev_agent.py` генерирует код через `claude --print` с контекстом проекта + rules
6. **Self-check** (🤖): Валидация сгенерированного кода (линт, тесты, type-check)
7. **PR** (🤖): `git_ops.py` создаёт branch → commit → PR через `gh` CLI
8. **Review** (🤖): `review_agent.py` ревьюит PR через `claude --print`
9. **QA** (🤖): `qa_client.py` вызывает Auditor API (`/api/audit/{project}/verify`) для spec-based проверки
   - PASS → proceed
   - FAIL → retry dev с findings
   - Auditor недоступен → graceful skip
10. **Merge** (🤖): `git_ops.py` мержит PR, удаляет branch
11. **Triage** (🤖): `triage_agent.py` создаёт follow-up issues для нерешённых находок
12. **Метрики** (🤖): Логирование в `metrics.jsonl` (cost, duration, first-pass, findings)

#### Артефакты

- GitHub Issue (вход) → Branch → PR → Merged commit
- Логи: `~/.makeit-pipeline/logs/runs/run-{repo}-{issue}-*.jsonl`
- Метрики: `~/.makeit-pipeline/logs/metrics.jsonl`

#### Гейты (точки возврата)

- **dev_failure** (3 retry) → escalate to `needs_human`
- **self_check_fail** → retry dev
- **review_rejected** → retry dev with feedback
- **qa_failed** → retry dev with findings
- **Circuit breaker** (`error_recovery.py`): при превышении порога ошибок → автостоп

#### Роли

- 🧑 Человек: Запуск/остановка pipeline, мониторинг прогресса, escalated issues
- 🤖 AI-агент: Dev, Review, QA, Triage
- 🔧 Сервис: GitHub API, Claude CLI, Auditor API

---

### Процесс 2: Code Audit

**Статус:** ✅ Реализован  
**Компоненты:** Auditor (backend), Dashboard (UI), GitHub (код + issues)  
**Ключевые файлы:**
- Auditor: `pipeline.py`, `runners/`, `indexer/`, `llm/`, `report/`, `api.py`
- Dashboard: `AuditTab.tsx`, `AuditVerifyDialog.tsx`, `useAudit.ts`, `auditor.ts`, `verify-agent.ts`, `claude.ts`

#### 4-слойный pipeline аудита

```
┌───────────────┐    ┌──────────────────┐    ┌─────────────────┐    ┌──────────────────┐
│ L1: Детерм.   │───▶│ L2: AST Index   │───▶│ L3: LLM Audit  │───▶│ L4: Отчёты      │
│ 5-30% прогр.  │    │ 30-45% прогр.   │    │ 45-85% прогр.  │    │ 85-100% прогр.  │
│               │    │                  │    │                 │    │                  │
│ ruff          │    │ tree-sitter AST  │    │ RunPod GPU      │    │ Markdown отчёт   │
│ mypy          │    │ repo_map (граф)  │    │ 2× A100-SXM4   │    │ findings.json    │
│ pytest        │    │ zone marking     │    │ Qwen3-Coder     │    │ GitHub Gist      │
│ semgrep       │    │ domain chunking  │    │ SSE streaming   │    │ Telegram         │
│ ESLint        │    │ (<32K tokens)    │    │ parallel chunks │    │                  │
└───────────────┘    └──────────────────┘    └─────────────────┘    └──────────────────┘
```

#### Поток

1. **Запуск** (🧑): Пользователь в Dashboard → AuditTab → выбирает проект → POST `/api/audit/{project}/run`
2. **Confirm** (🧑): AuditConfirmDialog показывает ожидаемую стоимость (~$5-12/hr GPU)
3. **Repo Sync** (🤖): `repo_sync.py` клонирует/обновляет репозиторий (GITHUB_TOKEN)
4. **L1** (🤖): Параллельный запуск 7+ инструментов (ruff, mypy, pytest, semgrep, eslint, lighthouse, axe-core)
5. **L2** (🤖): AST-индексация через tree-sitter → repo_map → domain chunks
6. **L3** (🤖): Provision GPU (RunPod) → Deploy vLLM → параллельный LLM-анализ chunks
7. **Aggregation** (🤖): Merge + deduplicate findings, confidence filter
8. **L4** (🤖): Генерация отчётов (Jinja2 templates), upload Gist, Telegram уведомление
9. **Просмотр** (🧑): Dashboard показывает findings по severity/category
10. **Верификация** (🧑+🤖): Запуск Claude verification → для каждого finding:
    - Чтение кода из GitHub (`read_code_at_location`, `grep_file`, `find_symbol_definition`)
    - Вердикт: CONFIRMED | FALSE_POSITIVE | UNCERTAIN | NOT_A_BUG
11. **Issues** (🤖): `generateIssuesFromFindings()` группирует по темам → создаёт 1-5 GitHub Issues
12. **Сохранение** (🤖): POST `/api/audit/{project}/verification` + `/meta`

#### Категории findings

| Категория | Инструменты |
|-----------|-------------|
| BUG | ruff, mypy, pytest, ESLint, LLM |
| SECURITY | ruff S*, semgrep, LLM |
| BUSINESS_LOGIC | LLM |
| ARCHITECTURE | LLM |
| PERFORMANCE | LLM, Lighthouse |
| DATA_INTEGRITY | LLM |
| ACCESSIBILITY | axe-core, LLM |
| UX_DESIGN | Lighthouse, Vision LLM |

#### Артефакты

- `~/.makeit-auditor/reports/{project}/{timestamp}/audit_result.json`
- `audit_summary.md`, `findings.json`, `verification.json`, `audit_meta.json`
- GitHub Gist с отчётом
- GitHub Issues (P1-critical, P2-high, P3-medium + bug/security/tech-debt)

---

### Процесс 3: Транскрипция и обработка встреч

**Статус:** ✅ Реализован  
**Компоненты:** Pipeline (backend), Dashboard (UI)  
**Ключевые файлы:**
- Pipeline: `transcription_engine.py`, `transcript_processor.py`, `domain_dictionary.py`, `manifest.py`, `api.py`
- Dashboard: `TranscriptsTab.tsx`, `TranscriptEditor.tsx`, `TranscriptProgress.tsx`, `transcript.ts`

#### Стадии обработки

```
┌────────┐    ┌─────┐    ┌────────────┐    ┌─────────────┐    ┌───────────┐    ┌──────┐
│ intake │───▶│ stt │───▶│ enrichment │───▶│ structuring │───▶│ synthesis │───▶│ done │
└────────┘    └─────┘    └────────────┘    └─────────────┘    └───────────┘    └──────┘
  Валидация    Whisper     Контекст,         Извлечение        Генерация       Готово
  файла        (OpenAI)    спикеры           тем, решений,     BRIEF.md
                                             требований
```

#### Поток

1. **Загрузка** (🧑): Dashboard → TranscriptsTab → выбор файла + проект → POST `/transcript/upload` (multipart)
2. **Дедупликация** (🤖): Content hash matching (SPEC-012 BR-7)
3. **STT** (🤖): OpenAI gpt-4o-transcribe (quality) или gpt-4o-mini-transcribe (fast); опционально: локальный faster-whisper с diarization
4. **Enrichment** (🤖): Определение спикеров, контекста, нормализация терминов (domain dictionary)
5. **Structuring** (🤖): Claude API извлекает topics, decisions, requirements, uncertainties, contradictions
6. **Synthesis** (🤖): Генерация BRIEF.md с DOMPurify + marked.js рендерингом
7. **Редактирование** (🧑): TranscriptEditor — live preview, PUT `/transcript/result/{id}`
8. **История** (🧑): TranscriptHistory — просмотр прошлых транскрипций

#### Артефакты

- `~/.makeit-pipeline/transcripts/{timestamp}_{project}/manifest.json`
- `transcript.txt` — сырая транскрипция
- `BRIEF.md` — структурированный документ с решениями и требованиями
- `quality_report.json` — метрики качества

---

### Процесс 4: Research & Discovery

**Статус:** ✅ Реализован  
**Компоненты:** Pipeline (agents), Dashboard (UI), GitHub (RESEARCH.md, DISCOVERY.md)  
**Ключевые файлы:**
- Pipeline: `research.py`, `discovery.py`, `api.py`
- Dashboard: `ResearchTab.tsx`, `StartResearchModal.tsx`, `useResearch.ts`, `research-parser.ts`

#### Два типа агентов

**Research Agent** — анализ рынка и конкурентов:
1. **Запуск** (🧑): Dashboard → ResearchTab → "Start Research" → product_description, region
2. **Выполнение** (🤖): Claude CLI анализирует рынок, конкурентов
3. **Результат** (🤖): RESEARCH.md → competitive landscape, user segments, opportunities
4. **Просмотр** (🧑): Dashboard парсит и отображает `parseResearchMd()`

**Discovery Agent** — поиск фич и gap-analysis:
1. **Запуск** (🧑): Dashboard → "Start Discovery" → на основе research результатов
2. **Два этапа** (🤖):
   - Inventory: список всех существующих фич
   - Analyze: скоринг gaps, приоритизация
3. **Результат** (🤖): DISCOVERY.md → gap matrix, recommendations, priorities
4. **Просмотр** (🧑): Dashboard парсит `parseDiscoveryMd()`

#### Артефакты

- `~/.makeit-pipeline/.agent-jobs/{type}/{timestamp}_{project}/REPORT.md`
- RESEARCH.md, DISCOVERY.md в репозитории проекта

---

### Процесс 5: Quality Management

**Статус:** ✅ Реализован  
**Компоненты:** Pipeline (metrics, retro, autotuner), Dashboard (UI)  
**Ключевые файлы:**
- Pipeline: `quality_metrics.py`, `retro_agent.py`, `auto_tuning.py`, `quality_gate.py`, `quality_signals.py`
- Dashboard: `QualityTab.tsx`, `QualityPanel.tsx`, `QualityBarCharts.tsx`, `QualityTrendsChart.tsx`, `QualityPendingChanges.tsx`, `QualityRetros.tsx`, `quality.ts`

#### Подпроцессы

**5.1 Сбор метрик** (🤖 автомат):
- Чтение `metrics.jsonl` → агрегация по неделям
- KPI: first_pass_success_rate, avg_finding_density, qa_pass_rate, avg_duration_sec, cost_per_issue, retry_rate
- Snapshot: GET `/pipeline/quality/snapshot`
- Trends: GET `/pipeline/quality/trends?weeks=12`

**5.2 Ретроспективы** (🤖+🧑):
1. POST `/pipeline/quality/retro/run` → асинхронный анализ
2. `retro_agent.py`: Claude Anthropic API анализирует паттерны ошибок, повторяющиеся проблемы
3. Генерирует recommendations, prioritized by area (prompt, rule, threshold, process, config)
4. Dashboard: QualityRetros показывает результаты

**5.3 AutoTuner** (🤖+🧑):
```
Tier 1 (auto-apply):     lessons, skip_keywords, pre_triage → прямое применение
Tier 2 (PR):              pipeline rules, review rules, prompts → PR через агент
Tier 3 (manual review):   config.yaml, major changes → ожидает человека
```
1. Backend предлагает изменения → `pending` список
2. Dashboard: QualityPendingChanges → Approve/Reject кнопки
3. Apply: POST `/pipeline/quality/pending/{id}/apply` → commit или PR
4. KPI monitoring: before/after snapshot → degradation detection → automatic rollback

#### Гейты

- **Quality Gate** (`quality_gate.py`): блокирует phase transitions если артефакты отсутствуют
- **Contract Verifier** (`contract_verifier.py`): проверяет phase contracts

---

### Процесс 6: Debate Engine

**Статус:** ✅ Реализован  
**Компоненты:** Pipeline (debate/), Dashboard (UI)  
**Ключевые файлы:**
- Pipeline: `debate/engine.py`, `debate/providers.py`, `debate/adr.py`, `debate/context_gatherer.py`
- Dashboard: `DebateTab.tsx`, `StartDebateModal.tsx`, `debate.ts`, `useDebate.ts`

#### Раунды дебатов

```
┌──────────┐    ┌──────────────┐    ┌────────────────┐    ┌───────────┐
│ Proposal │───▶│ Critique ×N  │───▶│ Final Position │───▶│ Synthesis │
│ (все)    │    │ (каждый vs   │    │ (каждый)       │    │ (модератор│
│          │    │  каждого)    │    │                │    │  Opus)    │
└──────────┘    └──────────────┘    └────────────────┘    └───────────┘
```

#### Поток

1. **Создание** (🧑): Dashboard → DebateTab → тема + 2+ позиции + контекст
2. **Context Gathering** (🤖): `context_gatherer.py` анализирует кодовую базу
3. **Proposal** (🤖): Все участники параллельно предлагают решения (asyncio.gather)
4. **Critique** (🤖): Каждый участник критикует предложения других (1-5 раундов)
5. **User Input** (🧑): POST `/pipeline/debate/{id}/message` — вмешательство пользователя
6. **Final Position** (🤖): Каждый участник формулирует итоговую позицию
7. **Synthesis** (🤖): Claude Opus-модератор синтезирует консенсус → ADR (Architecture Decision Record)
8. **Результат** (🧑): Dashboard показывает аргументы, консенсус, dissenting opinions

#### Артефакты

- DebateResult: topic, rounds, messages, consensus, dissenting_opinions, total_cost
- ADR (Architecture Decision Record) в markdown

---

### Процесс 7: Specs Tracking (PRD → Epic → Tasks)

**Статус:** ✅ Реализован  
**Компоненты:** Dashboard (UI), Pipeline (docs/), Knowledge (шаблоны)  
**Ключевые файлы:**
- Dashboard: `SpecsTab.tsx`, `useSpecs.ts`, `specs-parser.ts`
- Pipeline: `docs/prds/PRD-*.md`, `docs/epics/epic-*/`
- Knowledge: `SPEC_TEMPLATE.md`

#### Поток

1. **PRD** (🧑): Создание PRD файла по шаблону → `docs/prds/PRD-{id}.md`
2. **Парсинг** (🤖): `parsePrdMd()` → PrdData: title, status (draft/approved), description, value_prop, success_criteria
3. **Epics** (🧑/🤖): Разбивка PRD на эпики → `docs/epics/epic-{id}/`
4. **Tasks** (🧑/🤖): Задачи внутри эпиков → `epic-{id}/task-*.md` → GitHub Issues
5. **Статус-машина** (🤖): draft → spec_ready → in_development → completed
6. **Dashboard** (🧑): SpecsTab отображает прогресс, связь с GitHub Issues

#### Артефакты

- `docs/prds/PRD-{id}.md` — Product Requirements Document
- `docs/epics/epic-{id}/` — Epic с задачами
- GitHub Issues — привязанные к задачам эпика

---

### Процесс 8: Мониторинг и наблюдаемость

**Статус:** ✅ Реализован  
**Компоненты:** Dashboard (UI), BetterStack (uptime), GitHub (activity)  
**Ключевые файлы:**
- Dashboard: `UptimeBar.tsx`, `CommitHeatmap.tsx`, `StaleAlert.tsx`, `MilestoneCard.tsx`, `UrgentDeadlines.tsx`, `betterstack.ts`, `useMonitors.ts`

#### Подсистемы мониторинга

**8.1 Uptime мониторинг** (🤖):
- BetterStack API → monitor matching по имени проекта (`config.ts` MONITOR_MATCH)
- UptimeBar: status (up/down/paused), uptime %, last_checked_at

**8.2 Commit Heatmap** (🤖):
- GitHub API → commitActivity за 12 недель
- CommitHeatmap: GitHub-style визуализация активности

**8.3 Stale Alerts** (🤖):
- StaleAlert: проекты без коммитов 7+ дней → предупреждение

**8.4 Milestones** (🧑):
- GitHub API → open/closed milestones, due dates
- MilestoneCard: progress bar, due date, issue count
- UrgentDeadlines: milestones с приближающимися дедлайнами (red/yellow/green)

---

### Процесс 9: UX Audit

**Статус:** ✅ Реализован  
**Компоненты:** Auditor (UX runners + Vision LLM), Dashboard (UI)  
**Ключевые файлы:**
- Auditor: `runners/ux_orchestrator.py`, `runners/lighthouse.py`, `runners/axe_core.py`, `llm/ux_auditor.py`, `llm/vision_client.py`, `screenshotter.py`
- Dashboard: `UXAuditTab.tsx`, `ux-auditor.ts`

#### Поток

1. **Запуск** (🧑): Dashboard → AuditCombinedTab → UX Audit
2. **Screenshotter** (🤖): Захват скриншотов страниц проекта
3. **L1 UX** (🤖): Lighthouse (performance, SEO, PWA) + axe-core (WCAG accessibility)
4. **Vision LLM** (🤖): Claude Sonnet или GPT-4o анализирует скриншоты
5. **Findings** (🤖): Категории: ACCESSIBILITY, UX_DESIGN, PERFORMANCE
6. **Просмотр** (🧑): UXAuditTab отображает результаты

---

### Процесс 10: Chat / Project Manager Agent

**Статус:** ✅ Реализован  
**Компоненты:** Dashboard (ChatPanel + Claude API)  
**Ключевые файлы:**
- Dashboard: `ChatPanel.tsx`, `ChatButton.tsx`, `useChat.ts`, `claude.ts`

#### Возможности агента

- Tool-using Claude agent с 500+ строками системного промпта
- Инструменты: read_project_docs, create_issue, close_issue, add_labels, list_repo_issues, list_milestones, update_milestone
- Max 20 tool iterations per message
- Кэширование системного промпта (ephemeral cache_control)

#### Поток

1. **Сообщение** (🧑): Пользователь пишет в ChatPanel
2. **Обработка** (🤖): Claude с tools обрабатывает запрос
3. **Tool calls** (🤖): Создание issues, чтение документации, управление milestones
4. **Ответ** (🤖): Структурированный ответ пользователю

---

### Процесс 11: Complexity Classification

**Статус:** ✅ Реализован  
**Компоненты:** Pipeline (classifier), Dashboard (UI)  
**Ключевые файлы:**
- Pipeline: `complexity_classifier.py`, `api.py`
- Dashboard: `pipeline.ts` (classify endpoint), `PipelineControlPanel.tsx`

#### Уровни сложности

| Уровень | Описание | Агент |
|---------|----------|-------|
| `auto` | Простые задачи, полностью автоматизируемые | Sonnet |
| `assisted` | Средней сложности, нужен контроль | Opus |
| `manual` | Сложные, требуют человека | Человек |

#### Поток

1. **Запуск** (🧑): Dashboard → Pipeline → "Classify Issues" → POST `/pipeline/classify` (SSE stream)
2. **Классификация** (🤖): LLM оценивает каждый issue → auto/assisted/manual
3. **Labeling** (🤖): GitHub labels: `complexity-auto`, `complexity-assisted`, `complexity-manual`
4. **Результат** (🧑): Dashboard показывает breakdown по сложности

---

## Процессы НЕ найденные в коде

Все 8 процессов из задания **подтверждены кодом**. Дополнительно обнаружены:

- **UX Audit** (Процесс 9) — отдельный от code audit
- **Chat / PM Agent** (Процесс 10) — tool-using assistant в Dashboard
- **Complexity Classification** (Процесс 11) — классификация перед pipeline

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     VPS (89.167.17.79)                   │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  nginx      │  │  Dashboard   │  │   Auditor     │  │
│  │  (reverse   │──│  (Docker)    │  │   (Docker)    │  │
│  │   proxy)    │  │  :80         │  │   :8765       │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
│        │                                                │
│        │ SSH tunnel (reverse, port 8766)                 │
│        ▼                                                │
│  ┌──────────────────────┐                               │
│  │  Pipeline port :8766 │◄──── tunnel from Mac 2        │
│  └──────────────────────┘                               │
└─────────────────────────────────────────────────────────┘
              ▲
              │ SSH reverse tunnel
              │
┌─────────────────────────────────────┐
│         Mac 2 (Pipeline)             │
│                                      │
│  ┌────────────────────────────┐     │
│  │  Pipeline API (:8766)      │     │
│  │  LaunchAgent: com.makeit.  │     │
│  │    pipeline-api             │     │
│  └────────────────────────────┘     │
│  ┌────────────────────────────┐     │
│  │  SSH Tunnel LaunchAgent    │     │
│  │  com.makeit.pipeline-tunnel│     │
│  └────────────────────────────┘     │
└─────────────────────────────────────┘
```

---

## Knowledge Base (makeit-knowledge)

Файловая база знаний без API. Содержит:

| Файл/Директория | Назначение |
|-----------------|------------|
| `GLOBAL_CLAUDE.md` | Глобальные правила разработки для всех проектов |
| `PORTFOLIO.md` | Реестр проектов (11 проектов, 3 тира) |
| `skills/` | 5 core скиллов: Plan, Dev, Init, Deploy, CodeReview |
| `skills/BRIEF_TEMPLATE.md` | Шаблон BRIEF документа |
| `skills/SPEC_TEMPLATE.md` | Шаблон спецификации |
| `knowledge/` | Бизнес-логика по проектам (mankassa, quiet-walls, solotax) |
| `MakeIT_Prompts_Kit_v2.1.md` | Стандартизированные промпты для аудитов, git hygiene, PRD |

**Использование**: Claude-агенты читают CLAUDE.md и rules файлы при выполнении задач. Skills вызываются через `/makeit-plan`, `/makeit-dev`, `/makeit-deploy`, etc.
