# Project Hub — design brief

ТЗ для Claude Design. Задача: расширить «страницу проекта» (сейчас — только Health) в полноценный Project Hub из 5 вкладок и обновить страницу «Проекты» в виде превью-сетки с портфельными виджетами.

Этот документ — продолжение `PROJECT_HEALTH_DESIGN_BRIEF.md`. Health остаётся как одна из 5 вкладок Hub без изменений визуала; редизайнятся обёртка, навигация, новые вкладки и portfolio surface.

---

## 1. Контекст

MakeIT Dashboard — внутренний дашборд по портфелю из 12 проектов. Сейчас вкладка «Проекты» = сетка карточек, по клику на «Health» в правом верхнем углу карточки открывается `ProjectHealthPage` через `?repo=X` в URL.

Цель Project Hub: за 30 секунд после открытия проекта владелец восстанавливает полный контекст и понимает, что нужно сделать прямо сейчас. Health — лишь один срез из шести.

Цель Portfolio Surface (страница «Проекты»): за 10 секунд оценить состояние всех 12 проектов сразу + увидеть топ-обязательных действий по портфелю.

---

## 2. Архитектура страниц

```
?tab=projects                             — Portfolio Surface (превью-сетка + 4 виджета сверху)
?tab=projects&repo=X                      — Project Hub, default tab Overview
?tab=projects&repo=X&subtab=health        — Project Hub, явная вкладка
                                            (overview / health / activity / decisions / delivery)
```

Старые ссылки `?tab=projects&repo=X` ведут на Hub Overview — поведение Health-страницы как первоэкрана уходит.

---

## 3. Portfolio Surface (страница «Проекты»)

### 3.1 Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  TopBar                                                          │
├─────────────────────────────────────────────────────────────────┤
│  ⓒ Portfolio Next Actions       │ ⓘ Renewals (top-5)            │
│     (ranked top-5 с обоснованием)│    ближайшие SSL/contracts/  │
│                                  │    deps                       │
├─────────────────────────────────────────────────────────────────┤
│  ⓟ Promise Tracker               │ ⓓ Latest Portfolio Digest     │
│     overdue + due-this-week     │    (preview, кнопка regenerate)│
├─────────────────────────────────────────────────────────────────┤
│  Filters: phase / priority / search                             │
├─────────────────────────────────────────────────────────────────┤
│  ProjectScorecard  ProjectScorecard  ProjectScorecard           │
│  ProjectScorecard  ProjectScorecard  ProjectScorecard           │
│  ... (grid 3 col @1024+, 2 col @768, 1 col @<768)              │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 ProjectScorecard (превью-карточка проекта)

Минимальная карточка должна содержать:

- **Header**: имя проекта (моноширинно), tier-pill, phase-badge, client-name мелким
- **Health KPI**: grade A/B/C/D/F крупно справа + цветной dot
- **Stats row**: open issues / in-progress / blocked / overdue-commitments (число + иконка)
- **Drift dots**: 4 цветных дота в строке (commit / deploy / audit / client-touch). Tooltip раскрывает «N дней назад, норма Y дней».
- **Footer**: last activity (ISO дата) + cost MTD ($N.XX)
- Клик по всей карточке → Project Hub Overview
- Hover: лёгкий highlight, focus-ring для клавиатурной навигации

### 3.3 4 портфельных виджета сверху

| Виджет | Что показывает | Empty state |
|---|---|---|
| **Portfolio Next Actions** | Top-5 ranked recommendations от Claude с обоснованием в одну строку и линком на проект | «Всё под контролем — нет срочных действий по портфелю» |
| **Portfolio Renewals** | Top-5 ближайших expiry с цветом по urgency (red ≤7д, yellow ≤30д, gray >30д) | «На ближайшие 90 дней expiry нет» |
| **Portfolio Promise Tracker** | Overdue commitments + due-this-week, группировка по клиенту | «Все обещания в срок» |
| **Portfolio Digest** | Превью последнего weekly digest (3-5 строк) + кнопка «Сгенерировать новый» | «Дайджеста за эту неделю ещё нет — кнопка «Сгенерировать»»|

Виджеты должны быть компактными — каждый занимает ≤25% высоты viewport на 1440×900.

---

## 4. Project Hub (страница проекта)

### 4.1 Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Все проекты                                                  │
│  Project Header                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ name • tier • phase • client    │ grade A • health 78%    │ │
│  │ Next Best Action: «...»          │ кнопка «Регенерировать» │ │
│  └────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  [ Overview ] [ Health ] [ Activity ] [ Decisions ] [ Delivery ]│
├─────────────────────────────────────────────────────────────────┤
│  Tab content                                                    │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Header

- **Слева**: имя репо моноширинно, tier-pill (T1/T2/T3), phase-badge, client-name мелким, last activity
- **Справа**: health-grade крупно + health-score % + sparkline (placeholder под историю)
- **Центр (sticky под header)**: «Next Best Action» — одна строка от Claude с обоснованием и линком на якорь нужной вкладки
- На мобильном (≤640px) — collapse в одну колонку

### 4.3 Вкладки

| Вкладка | Виджеты | Default landing |
|---|---|---|
| **Overview** | NBA-блок (раскрытый), Pulse-summary (5 last events), Risks-summary (top-3), Commitments-summary (top-3 overdue + due-this-week) | Да |
| **Health** | existing `ProjectHealthPage` целиком, без изменений | — |
| **Activity** | Activity Pulse (vertical timeline), Project Inbox (since-last-visit), Open PRs list, Open Pipeline Runs list | — |
| **Decisions & Risks** | Decision Log (chronological), Risk Register (CRUD), Commitments (per-project), Renewals (per-project) | — |
| **Delivery** | DORA metrics (4 KPI), Project Digest (last week + history), Customer Health Score (gauge + 90д sparkline), Onboarding Readiness Checklist | — |

Tab content загружается lazy. URL обновляется при смене tab. Browser back/forward работает.

### 4.4 Состояния страницы

| Состояние | Когда | Что показать |
|---|---|---|
| **loading-initial** | Hub только открыт, данные грузятся | Скелетон header + табов, активная вкладка показывает skeleton секций |
| **loading-tab** | Переключение на новую вкладку, данные ещё не подгружены | Шапка остаётся, контент tab показывает skeleton |
| **error** | Нет токена или GitHub отдал ошибку | Сообщение «не получилось загрузить», кнопка retry. Шапка остаётся видна с placeholder |
| **partial** | Часть источников успешна, часть нет (например Pipeline API лежит) | Здоровые блоки рендерятся, упавшие показывают inline-warning «не удалось загрузить, retry» |
| **classification-missing** | Репо не в `project_classification` | На Overview — баннер «Зарегистрируй в `PROJECT_CHECKLIST.yaml`», остальные вкладки работают на reduced функциональности |

---

## 5. Доступные данные

Новый агрегирующий хук `useProjectHub(repo)` (расширяет `useProjectHealth`):

```ts
interface ProjectHubData {
  // Базовое (из useProjectHealth)
  project: ProjectData;
  health: HealthReport;

  // Новое (из новых источников Epic-011, Epic-012)
  decisions: Decision[];           // chronological
  risks: Risk[];                   // RiskRegister
  commitments: Commitment[];       // PromiseTracker per-project
  renewals: Renewal[];             // SSL/domains/contracts/deps per-project
  pulse: PulseEvent[];             // unified timeline
  inboxCount: number;              // since lastVisited
  digest: DigestEntry | null;      // last weekly digest
  dora: DoraMetrics | null;        // 4 metrics + 90d trend
  customerHealth: CustomerHealthScore | null;
  onboarding: OnboardingReport;    // extension of health Layer 2
  nba: NextBestAction[];           // ranked top-5

  // Lifecycle
  loading: boolean;
  loadingTab: Record<HubTab, boolean>;
  error: Error | null;
  refresh: () => void;
  generateDigest: () => Promise<void>;
  regenerateNBA: () => Promise<void>;
}
```

Все типы — в `src/types/hub.ts` (новый файл, типы Decision/Risk/Commitment/Renewal/PulseEvent/DigestEntry/DoraMetrics/CustomerHealthScore/NextBestAction).

---

## 6. Иерархия внимания

В порядке важности (что должно быть в верхней половине экрана):

1. **Next Best Action** — что делать прямо сейчас, в одну строку
2. **Health-grade** — визитка здоровья проекта
3. **Active commitments / risks** — что обещано и что может рвануть
4. **Drift indicators** — отклонения от нормы (на Scorecard, не в Hub)
5. **Recent activity** — что произошло с прошлого визита

Менее важно, но должно быть доступно:

6. Decision Log — институциональная память
7. Renewals и onboarding — фоновые операционные дела
8. DORA — метрики, для саморефлексии раз в неделю

---

## 7. UX-правила

- **Health не теряется** — пользователи привыкли открывать «Health». Теперь это вкладка, и если пользователь шёл на health (старый bookmark) — он попадает на Overview и сразу видит вкладку Health в строке табов. Подсказка-toast при первом таком переходе.
- **Скан-данных не должно быть много на одну вкладку** — каждая tab фокусируется на одной задаче. Если блок начинает расти — выносится в отдельную вкладку.
- **Manual triggers явны** — генерация Digest, регенерация NBA, scan Drift LLM — всё кнопками с понятной ценой (показывать ожидаемые ~$X.XX).
- **NBA — не todo** — это рекомендации с обоснованием. Не делать чекбоксы. Делать кнопки «Создать issue из этого», «Отметить как сделанное вне дашборда».
- **Risks/Commitments — CRUD** — добавление, редактирование, удаление работают inline, без модалок где возможно. CRUD не отправляет в backend (его нет), а пишет в `docs/risks.yaml` / `docs/commitments.yaml` через GitHub API commit.
- **Inbox-badge на табах** — над «Activity» — число unread events since-last-visit, исчезает при открытии.

---

## 8. Дизайн-система

Текущая — v4 (см. `src/styles/v4.css` переменные `--v4-*`):

- Те же токены — никаких новых акцентных цветов
- Светлая и тёмная темы обязательны
- Severity-цвета (critical/high/medium/low) — переиспользовать
- Новые элементы:
  - `v4-tabs` — горизонтальная навигация Hub-вкладок с inbox-badge
  - `v4-scorecard` — карточка проекта
  - `v4-drift-dot` — цветной индикатор с tooltip
  - `v4-nba-row` — строка рекомендации с обоснованием и actions
  - `v4-pulse-event` — элемент timeline
  - `v4-risk-row`, `v4-commitment-row`, `v4-decision-row` — табличные строки CRUD

---

## 9. Что трогать и что не трогать

**Создаём:**
- `src/components/v4/hub/ProjectHubPage.tsx`
- `src/components/v4/hub/ProjectHubHeader.tsx`
- `src/components/v4/hub/ProjectHubTabs.tsx`
- `src/components/v4/hub/tabs/OverviewTab.tsx`
- `src/components/v4/hub/tabs/ActivityTab.tsx`
- `src/components/v4/hub/tabs/DecisionsRisksTab.tsx`
- `src/components/v4/hub/tabs/DeliveryTab.tsx`
- `src/components/v4/portfolio/ProjectScorecard.tsx`
- `src/components/v4/portfolio/PortfolioNextActions.tsx`
- `src/components/v4/portfolio/PortfolioPromiseTracker.tsx`
- `src/components/v4/portfolio/PortfolioRenewals.tsx`
- `src/components/v4/portfolio/PortfolioDigestPanel.tsx`
- `src/components/v4/portfolio/DriftDots.tsx`
- `src/hooks/useProjectHub.ts`
- `src/types/hub.ts`

**Меняем:**
- `src/components/v4/ProjectsView.tsx` — рендерит Scorecards и портфельные виджеты сверху; при `selectedRepo` — рендерит `ProjectHubPage` вместо текущего `ProjectHealthPage`
- `src/styles/v4.css` — добавляем секции `Project Hub`, `Portfolio Surface`

**Не трогаем:**
- `src/components/v4/health/ProjectHealthPage.tsx` — рендерится как content вкладки Health, без изменений
- `src/types/health.ts`, `src/utils/health-engine.ts`, `src/utils/checklist.ts`
- `src/hooks/useProjectHealth.ts` (расширяется через композицию в `useProjectHub`)
- Структура других вкладок дашборда

---

## 10. Что обязательно должно работать после фичи

- Открыл `/?tab=projects` → видишь сетку Scorecard'ов + 4 портфельных виджета
- Клик по Scorecard → попадаешь на `?tab=projects&repo=X&subtab=overview` → Hub Overview
- Переключение вкладок Hub без перезагрузки, URL обновляется
- Browser back/forward переключает между списком, Hub, табами
- Health вкладка показывает существующую `ProjectHealthPage` без визуальной регрессии
- Refresh в любом месте Hub — состояние восстанавливается
- Inbox-badge на «Activity» уменьшается до 0 после открытия вкладки
- Кнопка «Сгенерировать» дайджест/NBA отрабатывает и кэширует результат
- Темная тема работает во всех новых компонентах
- Адаптив ≥ 1024px не разваливается, ≥ 768px — readable
- Доступность: severity badges не передают смысл только цветом

---

## 11. Дальше (контекст для решений)

В следующих итерациях:

- Customer Health Score — пересмотр формулы после накопления данных (через 3-6 мес)
- Stakeholder Map (вкладка Context) — отложено
- Cross-project Dependency View — отложено
- Sharing portfolio digest по email/Telegram
- Project Hub mobile-optimized layout
- Bulk operations across projects (например «верифицировать все P1-risks»)

---

## 12. Definition of Done

- Все 11 виджетов реализованы и интегрированы согласно §3-§4
- Существующая ProjectHealthPage работает без регрессий
- 5 вкладок Hub переключаются, deep-link работает
- Portfolio Surface рендерит Scorecards + 4 виджета
- Type-check `npx tsc --noEmit` зелёный
- Build `npm run build` зелёный
- Светлая и тёмная темы
- Адаптив ≥ 1024px
- Inbox-badge корректно считается via `lastVisitedStore`
- E2E-сценарий: открыл Portfolio → клик Scorecard → переключение всех 5 табов → back возвращает в Portfolio
