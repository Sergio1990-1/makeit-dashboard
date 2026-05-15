# Delivery Intelligence — формулы и конвенции

Документ описывает, как считаются DORA-метрики на вкладке **Delivery** Project Hub, какие конвенции используются и где границы текущей реализации.

Источник: Epic-012 (Task-03), реализация — `src/utils/doraCalculator.ts`.

---

## Зачем

DORA — индустриальный язык измерения зрелости software delivery. Четыре метрики (Deploy Frequency, Lead Time, MTTR, Change Failure Rate) показывают, насколько часто команда выкатывает, насколько быстро доходит от идеи до прод, насколько быстро восстанавливается после сбоев и насколько часто релизы ломают прод.

Мы считаем их *per-project* и сразу относим к бенчмарку DORA 2024 (`elite` / `high` / `medium` / `low`), чтобы команда видела не голое число, а ответ «хорошо это или плохо».

---

## Окно

Все 4 метрики считаются по **скользящему окну `windowDays`** (default — 30 дней). Окно `[now − windowDays, now]` единое для всех метрик в одном вызове `computeDora`.

Окно — конфигурируемый параметр `computeDora(inputs, windowDays)`. UI пока использует дефолт 30 дней, но контракт калькулятора оставляет место для 7/14/90-дневных вариантов.

---

## 1. Deploy Frequency

**Формула:**

```
deployFreq = count(commits на main с префиксом feat: | fix: | release:) / windowDays
```

Единица — *деплои в день*.

**Конвенции:**

- *Деплой* для микро-команды без формальных релизных тегов = merge на `main` с конвенциональным префиксом из списка `[feat:, fix:, release:]`. Префикс матчится регистр-неуважительно по началу subject-строки commit'а.
- Префиксы вроде `chore:`, `docs:`, `style:`, `refactor:`, `test:`, `build:`, `ci:`, `perf:` **не** считаются деплоями — они описывают сопутствующую работу, а не изменения, влияющие на пользователя.
- Деплой = коммит (а не PR). Это упрощение для squash-merge workflow, где один PR превращается ровно в один коммит на `main`.
- Если в окне 0 деплоев — `deployFreq = 0` и tier = `low` (а не `n/a`): репозиторий настроен, но не выкатывается — это legitimate сигнал.

**Бенчмарк (DORA 2024):**

| Tier   | Порог                | Эквивалент                |
|--------|----------------------|---------------------------|
| Elite  | `≥ 1 deploy/day`     | минимум ежедневно         |
| High   | `≥ 1/7 deploy/day`   | минимум еженедельно       |
| Medium | `≥ 1/30 deploy/day`  | минимум раз в месяц       |
| Low    | `<  1/30 deploy/day` | реже, чем раз в месяц     |

---

## 2. Lead Time for Changes

**Формула:**

```
leadTimeHours = median(merged_at − created_at) для merged PRs с mergedAt в окне
```

Единица — *часы*.

**Конвенции:**

- Берутся только PR, у которых `mergedAt` попадает в окно `[now − windowDays, now]`.
- PR без `mergedAt` (открытые / закрытые без merge) исключаются.
- PR с отрицательным значением `mergedAt − createdAt` (clock skew) тоже исключаются — это шум.
- Используется именно медиана, а не среднее: длинный «висящий» PR не должен утаскивать показатель команды вниз.
- Если в окне нет merged PR — `leadTimeHours = null` (`n/a` в UI).

**Бенчмарк (DORA 2024):**

| Tier   | Порог             |
|--------|-------------------|
| Elite  | `≤ 24 h` (≤ 1 дн) |
| High   | `≤ 168 h` (≤ 1 нед) |
| Medium | `≤ 720 h` (≤ 1 мес) |
| Low    | `> 720 h`          |

---

## 3. MTTR (Mean Time to Recovery)

**Формула:**

```
mttrHours = median(resolved_at − started_at) по incidents BetterStack monitor этого репо
```

Единица — *часы*. Используется медиана, не среднее (см. Lead Time).

**Конвенции:**

- Repo сопоставляется с monitor через `MONITOR_MATCH` в `src/utils/config.ts` (keyword-based match по url/имени монитора).
- Если для repo нет matching rule в `MONITOR_MATCH` — `mttrHours = null` (`n/a` в UI; карточка показывает `—`, не `0`).
- Если monitor найден, но в окне нет downtime-инцидентов — также `n/a` (нет данных для медианы — это не то же самое, что MTTR=0).
- Незавершённые инциденты (`resolvedAt === null`) исключаются — нет финальной длительности.
- Инциденты, у которых `resolvedAt < since` (полностью до окна), исключаются.
- Если инцидент начался ДО окна, но завершился внутри окна, длительность считается от `since`, а не от `startedAt` — pre-window часть не «тянет» медиану вверх.

**Ограничение текущей реализации:**

> BetterStack Cloudflare-worker, который мы используем сейчас (`getWorkerUrl()`), отдаёт *list* мониторов (статус + uptime%), но не отдаёт history incidents. До тех пор пока worker не расширится `/incidents` endpoint'ом, MTTR в `DoraInputs` будет приходить как `null` для всех проектов и UI покажет `—`. Калькулятор уже готов считать MTTR — нужно только прокачать incidents с сервера.

**Бенчмарк (DORA 2024):**

| Tier   | Порог            |
|--------|------------------|
| Elite  | `≤ 1 h`          |
| High   | `≤ 24 h` (≤ 1 дн)|
| Medium | `≤ 168 h` (≤ 1 нед) |
| Low    | `> 168 h`        |

---

## 4. Change Failure Rate

**Формула:**

```
cfr = failed_deploys / total_deploys
```

где **deploy** — `feat:` | `fix:` | `release:` commit в окне (как в Deploy Frequency), а **failed_deploy** — деплой, после которого в течение 7 дней произошло хотя бы одно:

1. `fix:` commit (исключая сам deploy-коммит — если deploy сам по себе уже `fix:`, мы не считаем его «провалом самого себя»);
2. critical audit finding (auditor нашёл `severity === "critical"`).

Если в окне нет деплоев — `cfr = null` (`n/a`).

**Конвенции:**

- 7-дневное окно «после деплоя» позволяет ловить hot-fix'ы и аудит-сигналы, которые обычно приходят с лагом.
- Fix-коммиты ищутся по **всему** переданному списку commits (не только в окне) — fix может произойти после конца окна.
- Audit critical finding засчитывается, если timestamp его audit run'а попадает в `(deploy.time, deploy.time + 7d]`.

**Fallback без auditor API:**

> Если auditor недоступен / `auditFindings = []` — CFR посчитается только по `fix:`-коммитам. Это даёт нижнюю оценку (реальный CFR может быть выше), но не блокирует метрику. UI этот fallback не индицирует — пользователю достаточно знать, что cfr посчитан по доступным сигналам.

**Бенчмарк (DORA 2024):**

| Tier   | Порог       |
|--------|-------------|
| Elite  | `≤ 5%`      |
| High   | `≤ 10%`     |
| Medium | `≤ 15%`     |
| Low    | `> 15%`     |

---

## Tier colors (UI)

| Tier   | Карточка       |
|--------|----------------|
| Elite  | зелёный        |
| High   | светло-зелёный |
| Medium | жёлтый         |
| Low    | красный        |
| n/a    | нейтральный    |

Цвет — индикатор tier'а, не безусловная оценка. Tooltip каждой карточки повторяет формулу + бенчмарк.

---

## Ограничения

- **Live-окно без архивов pipeline.** Все метрики опираются на текущие commits в `main` (через GitHub Contents API) и текущие PRs (передаются caller'ом). У нас нет архивных снапшотов исторической активности — окно > 30 дней зависит от того, сколько commits мы успели подтянуть. Полная архивация под трекинг тренда — внешний блокер: [pipeline#1129](https://github.com/Sergio1990-1/makeit-pipeline/issues/1129) (monthly metrics.jsonl rollover).
- **MTTR в production-сборке = `n/a` по умолчанию.** См. секцию MTTR выше — нужен `/incidents` на worker'е, чтобы метрика начала считаться.
- **CFR без audit fallback.** Если auditor лежит / не запущен на проекте, CFR покрывает только `fix:`-сигнал. Это lower-bound.
- **Tagged releases не учитываются** для Deploy Frequency — мы не тагаем регулярно. Если эта конвенция появится — заменим коммит-источник на `git tag --since`.

---

## Тесты вручную

После очередного изменения `doraCalculator.ts`:

1. `npx tsc --noEmit` чистый.
2. `npm run lint` чистый.
3. `npm run build` проходит.
4. На любом проекте с активными коммитами Delivery tab показывает 4 карточки, цвета совпадают с порогами выше, на пустых repo — `—` и `n/a`-tier.

---

## Источники

- Forsgren et al., *Accelerate: The Science of Lean Software & DevOps*.
- Google Cloud DORA team, *State of DevOps Report 2024*.
- `docs/epics/epic-012.md` — секция «DORA calculator», бизнес-контекст.
- `docs/prds/PRD-008.md` FR-33..FR-35 — требования.
