import { useEffect, useState } from "react";
import "./styleguide.css";

type Swatch = { name: string; value: string };

const SWATCH_BRAND: Swatch[] = [
  { name: "--mk-brand-50",  value: "#EEF4FF" },
  { name: "--mk-brand-100", value: "#DCE7FF" },
  { name: "--mk-brand-400", value: "#3B82F6" },
  { name: "--mk-brand-500", value: "#2563EB" },
  { name: "--mk-brand-600", value: "#1D4ED8" },
  { name: "--mk-brand-700", value: "#1E40AF" },
];

const SWATCH_STATUS: Swatch[] = [
  { name: "--mk-success",        value: "#12B76A" },
  { name: "--mk-success-soft",   value: "#ECFDF3" },
  { name: "--mk-success-strong", value: "#067647" },
  { name: "--mk-danger",         value: "#EF4444" },
  { name: "--mk-danger-soft",    value: "#FEF2F2" },
  { name: "--mk-danger-strong",  value: "#B91C1C" },
  { name: "--mk-warn",           value: "#F79009" },
  { name: "--mk-warn-soft",      value: "#FFFAEB" },
  { name: "--mk-warn-strong",    value: "#B54708" },
];

const SWATCH_AUX: Swatch[] = [
  { name: "--mk-purple-50",         value: "#F5F0FF" },
  { name: "--mk-purple-500",        value: "#7C3AED" },
  { name: "--mk-purple-700",        value: "#5B21B6" },
  { name: "--mk-sky-50",            value: "#E0F2FE" },
  { name: "--mk-sky-500",           value: "#0EA5E9" },
  { name: "--mk-sky-700",           value: "#0369A1" },
  { name: "--mk-orange-bright-500", value: "#F97316" },
  { name: "--mk-orange-bright-700", value: "#C2410C" },
];

const SWATCH_PRIORITY: Swatch[] = [
  { name: "--mk-priority-p1", value: "#EF4444" },
  { name: "--mk-priority-p2", value: "#F79009" },
  { name: "--mk-priority-p3", value: "#2563EB" },
  { name: "--mk-priority-p4", value: "#94A0B8" },
];

const SWATCH_SEVERITY: Swatch[] = [
  { name: "--mk-severity-critical", value: "#EF4444" },
  { name: "--mk-severity-high",     value: "#F97316" },
  { name: "--mk-severity-medium",   value: "#EAB308" },
  { name: "--mk-severity-low",      value: "#2563EB" },
];

const SWATCH_SURFACE: Swatch[] = [
  { name: "--mk-bg",         value: "#F6F7F9" },
  { name: "--mk-paper",      value: "#FFFFFF" },
  { name: "--mk-surface-2",  value: "#F4F5F8" },
  { name: "--mk-surface-3",  value: "#EDEFF3" },
];

const SWATCH_INK: Swatch[] = [
  { name: "--mk-ink-900", value: "#0E1320" },
  { name: "--mk-ink-800", value: "#1B2235" },
  { name: "--mk-ink-700", value: "#2F3850" },
  { name: "--mk-ink-600", value: "#4A5570" },
  { name: "--mk-ink-500", value: "#6B7691" },
  { name: "--mk-ink-400", value: "#94A0B8" },
  { name: "--mk-ink-300", value: "#C5CCDA" },
];

const SWATCH_LINE: Swatch[] = [
  { name: "--mk-line",         value: "#E4E8EF" },
  { name: "--mk-line-soft",    value: "#EEF1F6" },
  { name: "--mk-line-strong",  value: "#D6DBE5" },
];

function SwatchGrid({ items }: { items: Swatch[] }) {
  return (
    <div className="sg-swatch-grid">
      {items.map((s) => (
        <div key={s.name} className="sg-swatch">
          <div className="sg-swatch-color" style={{ background: s.value }} />
          <div className="sg-swatch-meta">
            <div className="sg-swatch-name">{s.name}</div>
            <div className="sg-swatch-hex">{s.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PaletteSection() {
  return (
    <section id="palette" className="sg-section">
      <header className="sg-section-head">
        <h2>Цвета</h2>
        <p>Палитра проекта: бренд, статусы, приоритеты, severity, нейтральная шкала, поверхности, текст, разделители.</p>
      </header>

      <h3 className="sg-sub">Brand</h3>
      <SwatchGrid items={SWATCH_BRAND} />

      <h3 className="sg-sub">Status (semantic)</h3>
      <SwatchGrid items={SWATCH_STATUS} />

      <h3 className="sg-sub">Auxiliary (Pipeline, Bizproc, Quality)</h3>
      <SwatchGrid items={SWATCH_AUX} />

      <h3 className="sg-sub">Priority (portfolio tasks)</h3>
      <SwatchGrid items={SWATCH_PRIORITY} />

      <h3 className="sg-sub">Severity (code quality / audit)</h3>
      <SwatchGrid items={SWATCH_SEVERITY} />

      <h3 className="sg-sub">Surfaces</h3>
      <SwatchGrid items={SWATCH_SURFACE} />

      <h3 className="sg-sub">Ink (text)</h3>
      <SwatchGrid items={SWATCH_INK} />

      <h3 className="sg-sub">Lines (borders, dividers)</h3>
      <SwatchGrid items={SWATCH_LINE} />

      <div className="sg-note">
        Канон: для прозрачных вариантов цвета (rgba/tint) не плодить переменные —
        писать <code>color-mix(in srgb, var(--mk-*) 20%, transparent)</code> прямо в стилях компонента.
      </div>
    </section>
  );
}

function TypographySection() {
  const sizes = [
    { name: "--mk-text-xs",   px: "11px", sample: "Caption / metadata" },
    { name: "--mk-text-sm",   px: "13px", sample: "Body small / labels" },
    { name: "--mk-text-base", px: "14px", sample: "Default body text" },
    { name: "--mk-text-md",   px: "15px", sample: "Card title / emphasised" },
    { name: "--mk-text-lg",   px: "18px", sample: "Section title" },
    { name: "--mk-text-xl",   px: "20px", sample: "Page subtitle" },
    { name: "--mk-text-data", px: "24px", sample: "KPI / data display" },
  ];
  return (
    <section id="typography" className="sg-section">
      <header className="sg-section-head">
        <h2>Типографика</h2>
        <p>Шрифты: Inter (sans), JetBrains Mono. Tracking уменьшается для заголовков, увеличивается для uppercase-labels.</p>
      </header>

      <h3 className="sg-sub">Семейства</h3>
      <div className="sg-variants">
        <div className="sg-variant">
          <div className="sg-variant-label">SANS</div>
          <div className="sg-variant-name" style={{ fontFamily: "var(--mk-font-sans)" }}>Inter</div>
          <div className="sg-variant-desc">Используется по умолчанию для всего UI. Поддерживает tabular-nums и широкий диапазон весов.</div>
          <div className="sg-variant-stage" style={{ fontFamily: "var(--mk-font-sans)", fontSize: 18 }}>
            The quick brown fox · Тест шрифта Inter
          </div>
        </div>
        <div className="sg-variant">
          <div className="sg-variant-label">MONO</div>
          <div className="sg-variant-name" style={{ fontFamily: "var(--mk-font-mono)" }}>JetBrains Mono</div>
          <div className="sg-variant-desc">Цифры в метриках, hex-коды, ID, числовые значения с tabular figures.</div>
          <div className="sg-variant-stage" style={{ fontFamily: "var(--mk-font-mono)", fontSize: 14 }}>
            123,456 · const x = 42; · #2563EB
          </div>
        </div>
      </div>

      <h3 className="sg-sub">Размеры</h3>
      <div>
        {sizes.map((s) => (
          <div key={s.name} className="sg-type-row">
            <div className="sg-type-name">{s.name}</div>
            <div className="sg-type-sample" style={{ fontSize: `var(${s.name})` }}>{s.sample}</div>
            <div className="sg-type-meta">{s.px}</div>
          </div>
        ))}
      </div>

      <h3 className="sg-sub">Tracking + Leading</h3>
      <div className="sg-variants">
        <div className="sg-variant">
          <div className="sg-variant-label">TRACKING</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "var(--mk-tracking-tight)" }}>Tight (-0.025em) — заголовки</div>
          <div style={{ fontSize: 14, letterSpacing: "var(--mk-tracking-base)" }}>Base (-0.015em) — основной текст</div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "var(--mk-tracking-wide)", textTransform: "uppercase" }}>Wide (+0.06em) — UPPERCASE LABELS</div>
        </div>
        <div className="sg-variant">
          <div className="sg-variant-label">LEADING</div>
          <div style={{ lineHeight: "var(--mk-leading-tight)", fontSize: 13 }}>Tight 1.2 — заголовки и компактные блоки. Две строки текста подряд для демонстрации высоты.</div>
          <div style={{ lineHeight: "var(--mk-leading-base)", fontSize: 13, marginTop: 8 }}>Base 1.45 — основной текст. Две строки подряд для демонстрации высоты.</div>
          <div style={{ lineHeight: "var(--mk-leading-relaxed)", fontSize: 13, marginTop: 8 }}>Relaxed 1.6 — длинные описания. Две строки подряд для демонстрации высоты.</div>
        </div>
      </div>
    </section>
  );
}

function SpacingSection() {
  const spaces = [
    { name: "--mk-sp-1",  val: 4 },
    { name: "--mk-sp-2",  val: 8 },
    { name: "--mk-sp-3",  val: 12 },
    { name: "--mk-sp-4",  val: 16 },
    { name: "--mk-sp-5",  val: 20 },
    { name: "--mk-sp-6",  val: 24 },
    { name: "--mk-sp-8",  val: 32 },
    { name: "--mk-sp-10", val: 40 },
  ];
  return (
    <section id="spacing" className="sg-section">
      <header className="sg-section-head">
        <h2>Spacing</h2>
        <p>База — 4px. Используется для padding, gap, margin.</p>
      </header>
      <div>
        {spaces.map((s) => (
          <div key={s.name} className="sg-spacing-row">
            <div className="sg-spacing-name">{s.name}</div>
            <div className="sg-spacing-bar" style={{ width: s.val * 4 }} />
            <div className="sg-spacing-val">{s.val}px</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RadiusSection() {
  const radii = [
    { name: "--mk-r-xs",   val: "4px"   },
    { name: "--mk-r-sm",   val: "6px"   },
    { name: "--mk-r-md",   val: "8px"   },
    { name: "--mk-r-lg",   val: "12px"  },
    { name: "--mk-r-xl",   val: "16px"  },
    { name: "--mk-r-2xl",  val: "24px"  },
    { name: "--mk-r-full", val: "9999px" },
  ];
  return (
    <section id="radius" className="sg-section">
      <header className="sg-section-head">
        <h2>Radius</h2>
        <p>Проект сейчас использует все размеры от 2 до 24px вперемешку. Здесь — рекомендуемая шкала.</p>
      </header>
      <div className="sg-radius-grid">
        {radii.map((r) => (
          <div key={r.name} className="sg-radius-card">
            <div className="sg-radius-box" style={{ borderRadius: `var(${r.name})` }} />
            <div className="sg-radius-name">{r.name}</div>
            <div className="sg-radius-val">{r.val}</div>
          </div>
        ))}
      </div>
      <div className="sg-note">
        Расхождение: legacy <code>.btn</code> radius=16px, v4 <code>.v4-btn</code> radius=6px, <code>.v4-kpi</code> radius=12px. На утверждение — какой брать дефолтом для кнопок/карточек.
      </div>
    </section>
  );
}

function ShadowsSection() {
  const shadows = [
    { cls: "sm",         name: "--mk-shadow-sm" },
    { cls: "md",         name: "--mk-shadow-md" },
    { cls: "lg",         name: "--mk-shadow-lg" },
    { cls: "card",       name: "--mk-shadow-card" },
    { cls: "card-hover", name: "--mk-shadow-card-hover" },
    { cls: "elevated",   name: "--mk-shadow-elevated" },
  ];
  return (
    <section id="shadows" className="sg-section">
      <header className="sg-section-head">
        <h2>Shadows</h2>
        <p>Сейчас в проекте 4+ разных hover-теней. Здесь — кандидаты на унификацию.</p>
      </header>
      <div className="sg-shadow-grid">
        {shadows.map((s) => (
          <div key={s.cls} className={`sg-shadow-card ${s.cls}`}>
            <div className="sg-shadow-name">{s.name}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MotionSection() {
  return (
    <section id="motion" className="sg-section">
      <header className="sg-section-head">
        <h2>Motion</h2>
        <p>Длительности и easing. Наведи курсор на карточку — точка проедет по треку.</p>
      </header>
      <h3 className="sg-sub">Длительности</h3>
      <div className="sg-motion-grid">
        {(["fast", "base", "slow"] as const).map((d) => (
          <div key={d} className={`sg-motion-card ${d}`}>
            <div className="sg-motion-name">--mk-dur-{d}</div>
            <div className="sg-motion-track"><div className="sg-motion-dot" /></div>
            <div className="sg-motion-hint">{d === "fast" ? "120ms" : d === "base" ? "200ms" : "300ms"} — hover-to-trigger</div>
          </div>
        ))}
      </div>
      <h3 className="sg-sub">Easing</h3>
      <div className="sg-motion-grid">
        {(["ease-out", "ease-in-out", "ease-spring"] as const).map((e) => (
          <div key={e} className={`sg-motion-card ${e}`}>
            <div className="sg-motion-name">--mk-{e}</div>
            <div className="sg-motion-track"><div className="sg-motion-dot" /></div>
            <div className="sg-motion-hint">300ms — hover-to-trigger</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ButtonsBlock() {
  return (
    <>
      <h3 className="sg-sub">Кнопки — выбрать вариант</h3>
      <div className="sg-variants">
        <div className="sg-variant">
          <div className="sg-variant-label">VARIANT A · LEGACY</div>
          <div className="sg-variant-name">App.css `.btn`</div>
          <div className="sg-variant-desc">44px высота, padding 8/12, radius 16px, font-weight 500. Текущий стиль в Audit/Pipeline/Monitoring.</div>
          <div className="sg-variant-stage">
            <button className="sg-btn-legacy primary">Сохранить</button>
            <button className="sg-btn-legacy">Отмена</button>
          </div>
        </div>
        <div className="sg-variant">
          <div className="sg-variant-label">VARIANT B · V4</div>
          <div className="sg-variant-name">v4.css `.v4-btn`</div>
          <div className="sg-variant-desc">34px высота, padding 0/14, radius 6px, primary = чёрный. Текущий стиль в Project Hub.</div>
          <div className="sg-variant-stage">
            <button className="sg-btn-v4 primary">Сохранить</button>
            <button className="sg-btn-v4">Отмена</button>
          </div>
        </div>
        <div className="sg-variant">
          <div className="sg-variant-label">VARIANT C · PROPOSED</div>
          <div className="sg-variant-name">Новый унифицированный</div>
          <div className="sg-variant-desc">36px высота, padding 0/14, radius 8px, font-weight 600, primary = brand-blue. Совмещает плотность v4 и кликабельность legacy.</div>
          <div className="sg-variant-stage">
            <button className="sg-btn-new primary">Сохранить</button>
            <button className="sg-btn-new">Отмена</button>
          </div>
        </div>
      </div>
    </>
  );
}

function TabsBlock() {
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const [c, setC] = useState(0);
  const labels = ["Обзор", "Метрики", "Логи"];
  return (
    <>
      <h3 className="sg-sub">Tabs — выбрать вариант</h3>
      <div className="sg-variants">
        <div className="sg-variant">
          <div className="sg-variant-label">VARIANT A · UNDERLINE</div>
          <div className="sg-variant-name">Подчёркивание (legacy)</div>
          <div className="sg-variant-desc">Стиль `.verify-tab` в Audit. padding 8/12, border-bottom 2px.</div>
          <div className="sg-variant-stage" style={{ alignItems: "stretch", justifyContent: "flex-start", padding: 0 }}>
            <div className="sg-tabs-underline" style={{ width: "100%" }}>
              {labels.map((l, i) => (
                <button key={l} className={i === a ? "is-active" : ""} onClick={() => setA(i)}>{l}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="sg-variant">
          <div className="sg-variant-label">VARIANT B · PILL</div>
          <div className="sg-variant-name">Pill (v4)</div>
          <div className="sg-variant-desc">Стиль `.v4-pillgrp`. Inline-toggle с белой подложкой активной.</div>
          <div className="sg-variant-stage">
            <div className="sg-tabs-pill">
              {labels.map((l, i) => (
                <button key={l} className={i === b ? "is-active" : ""} onClick={() => setB(i)}>{l}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="sg-variant">
          <div className="sg-variant-label">VARIANT C · SEGMENTED</div>
          <div className="sg-variant-name">Segmented (proposed)</div>
          <div className="sg-variant-desc">Кнопочный control с активным сегментом в primary-цвете. Хорошо читается как выбор режима.</div>
          <div className="sg-variant-stage">
            <div className="sg-tabs-segmented">
              {labels.map((l, i) => (
                <button key={l} className={i === c ? "is-active" : ""} onClick={() => setC(i)}>{l}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="sg-note">
        Underline хорош для основной навигации внутри страницы (раздел разделён на под-вкладки). Pill — для inline-фильтров. Segmented — для выбора режима/представления. Можно зафиксировать все три семантически разделёнными.
      </div>
    </>
  );
}

function CardsBlock() {
  return (
    <>
      <h3 className="sg-sub">Карточки — выбрать вариант</h3>
      <div className="sg-variants">
        <div className="sg-variant">
          <div className="sg-variant-label">VARIANT A · LEGACY</div>
          <div className="sg-variant-name">App.css `.pc`</div>
          <div className="sg-variant-desc">radius 16px, padding 10/14, тень card.</div>
          <div className="sg-variant-stage">
            <div className="sg-card-legacy">
              <div className="sg-card-title">Project Alpha</div>
              <div className="sg-card-meta">12 открытых · 88% готово</div>
            </div>
          </div>
        </div>
        <div className="sg-variant">
          <div className="sg-variant-label">VARIANT B · V4</div>
          <div className="sg-variant-name">v4.css `.v4-pcard`</div>
          <div className="sg-variant-desc">radius 8px, padding 14/14/14/17, без тени, только border.</div>
          <div className="sg-variant-stage">
            <div className="sg-card-v4">
              <div className="sg-card-title">Project Alpha</div>
              <div className="sg-card-meta">12 открытых · 88% готово</div>
            </div>
          </div>
        </div>
        <div className="sg-variant">
          <div className="sg-variant-label">VARIANT C · PROPOSED</div>
          <div className="sg-variant-name">Новый унифицированный</div>
          <div className="sg-variant-desc">radius 12px, padding 16, лёгкая тень shadow-sm, border opcjonalный. Сбалансирован между плотностью и premium-ощущением.</div>
          <div className="sg-variant-stage">
            <div className="sg-card-new">
              <div className="sg-card-title">Project Alpha</div>
              <div className="sg-card-meta">12 открытых · 88% готово</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function BadgesBlock() {
  return (
    <>
      <h3 className="sg-sub">Бейджи — pill vs square</h3>
      <div className="sg-variants">
        <div className="sg-variant">
          <div className="sg-variant-label">VARIANT A · PILL (radius-full)</div>
          <div className="sg-variant-name">Закруглённые</div>
          <div className="sg-variant-desc">Полный radius. Подходит для status, count, tag.</div>
          <div className="sg-variant-stage">
            <span className="sg-badge success">Done</span>
            <span className="sg-badge warn">Warn</span>
            <span className="sg-badge danger">Danger</span>
            <span className="sg-badge info">Info</span>
            <span className="sg-badge neutral">Neutral</span>
          </div>
        </div>
        <div className="sg-variant">
          <div className="sg-variant-label">VARIANT B · SQUARE (radius-xs)</div>
          <div className="sg-variant-name">Квадратные</div>
          <div className="sg-variant-desc">radius 4px. Более «строгий» вид, для серьёзных меток (severity, priority).</div>
          <div className="sg-variant-stage">
            <span className="sg-badge-sq success">P0</span>
            <span className="sg-badge-sq warn">P1</span>
            <span className="sg-badge-sq danger">CRIT</span>
            <span className="sg-badge-sq info">P3</span>
            <span className="sg-badge-sq neutral">N/A</span>
          </div>
        </div>
      </div>
    </>
  );
}

function InputBlock() {
  return (
    <>
      <h3 className="sg-sub">Input — фокус</h3>
      <div className="sg-variants">
        <div className="sg-variant">
          <div className="sg-variant-label">DEFAULT + FOCUS</div>
          <div className="sg-variant-name">Текстовое поле</div>
          <div className="sg-variant-desc">Фокус — border primary + 3px ring. Кликни в поле.</div>
          <div className="sg-variant-stage" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <input className="sg-input" placeholder="Введите название проекта…" />
          </div>
        </div>
        <div className="sg-variant">
          <div className="sg-variant-label">FOCUS RINGS — варианты</div>
          <div className="sg-variant-name">Кликни/Tab по квадратам</div>
          <div className="sg-variant-desc">A — box-shadow ring (мягкое), B — outline solid (резкое), C — inset (внутрь рамки).</div>
          <div className="sg-variant-stage">
            <button className="sg-focus-target ring-blue" tabIndex={0}>A</button>
            <button className="sg-focus-target ring-solid" tabIndex={0}>B</button>
            <button className="sg-focus-target ring-inset" tabIndex={0}>C</button>
          </div>
        </div>
      </div>
    </>
  );
}

function ComponentsSection() {
  return (
    <section id="components" className="sg-section">
      <header className="sg-section-head">
        <h2>Компоненты</h2>
        <p>Сравнение текущих legacy / v4 стилей и предлагаемых унифицированных. Выбираем по одному варианту на сущность.</p>
      </header>
      <ButtonsBlock />
      <TabsBlock />
      <CardsBlock />
      <BadgesBlock />
      <InputBlock />
    </section>
  );
}

/* ══════════════════════════════════════════════════════════
   LAYOUT PATTERNS
   ══════════════════════════════════════════════════════════ */

function LayoutSection() {
  const [filter, setFilter] = useState(0);
  const filterLabels = ["Все", "Pre-dev", "Dev", "Support"];

  return (
    <section id="layout" className="sg-section">
      <header className="sg-section-head">
        <h2>Layout patterns</h2>
        <p>Структурные контейнеры. Канонические шаблоны для всех вкладок — чтобы у Dashboard, Quality, Pipeline и т.д. был одинаковый каркас.</p>
      </header>

      <h3 className="sg-sub">App shell</h3>
      <div className="sg-variants">
        <div className="sg-variant">
          <div className="sg-variant-label">КАНОН</div>
          <div className="sg-variant-name">.v4-app — 240px sidebar + 1fr main</div>
          <div className="sg-variant-desc">
            Единственный shell в проекте, legacy-варианта нет. Грид sticky-сайдбар + основной контент. Высота 100dvh.
          </div>
          <div className="sg-variant-stage" style={{ padding: 0, background: "transparent" }}>
            <div className="sg-mini sg-shell" style={{ width: "100%" }}>
              <div className="sg-shell-side">
                <div className="row brand" />
                <div className="row section" />
                <div className="row" />
                <div className="row" />
                <div className="row" />
                <div className="row section" />
                <div className="row" />
                <div className="row" />
              </div>
              <div className="sg-shell-main">
                <div className="top" />
                <div className="content" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <h3 className="sg-sub">Sidebar</h3>
      <div className="sg-variants">
        <div className="sg-variant">
          <div className="sg-variant-label">SIDEBAR — КАНОН</div>
          <div className="sg-variant-name">.v4-side</div>
          <div className="sg-variant-desc">
            240px ширина, paper-фон, sticky top, brand-блок 56px + nav. Секции «WORKFLOW», «КОНТРОЛЬ» — mono 10px uppercase, color ink-400. Items 7px padding, radius-sm, hover surface-2.
          </div>
          <div className="sg-variant-stage" style={{ alignItems: "stretch", justifyContent: "flex-start", background: "var(--mk-surface-2)" }}>
            <div className="sg-side-mini">
              <div className="brand-row">
                <div className="brand-logo">M</div>
                <div className="brand-name">MakeIT</div>
              </div>
              <div className="nav-item active"><span>Дашборд</span><span className="nav-count danger">2</span></div>
              <div className="nav-item"><span>Проекты</span><span className="nav-count">12</span></div>
              <div className="nav-item"><span>Milestones</span><span className="nav-count">8</span></div>
              <div className="nav-section">WORKFLOW</div>
              <div className="nav-item"><span>Pipeline</span></div>
              <div className="nav-item"><span>Транскрипты</span></div>
            </div>
          </div>
        </div>
        <div className="sg-variant">
          <div className="sg-variant-label">NAV INDICATORS</div>
          <div className="sg-variant-name">3 типа счётчиков рядом</div>
          <div className="sg-variant-desc">
            Сейчас в коде есть .v4-nav-count (нейтральный), .v4-nav-badge (red danger), .sidebar-badge (orange warn), .v4-nav-pulse (6px dot пульсирующий). Все используются параллельно — нужна семантическая иерархия.
          </div>
          <div className="sg-variant-stage" style={{ flexDirection: "column", gap: 8, alignItems: "stretch" }}>
            <div className="sg-side-mini" style={{ width: "100%" }}>
              <div className="nav-item"><span>Quality</span><span className="nav-count">203</span></div>
              <div className="nav-item"><span>Аудит</span><span className="nav-count danger">2</span></div>
              <div className="nav-item"><span>Debate</span><span className="nav-count" style={{ background: "var(--mk-warn-soft)", color: "var(--mk-warn-strong)" }}>!</span></div>
            </div>
          </div>
          <div className="sg-note">Канон: нейтральный count = просто число (информативное), danger pill = срочное действие, warn pill = внимание, pulse-dot = live / new.</div>
        </div>
      </div>

      <h3 className="sg-sub">Topbar</h3>
      <div className="sg-variants">
        <div className="sg-variant">
          <div className="sg-variant-label">TOPBAR — КАНОН</div>
          <div className="sg-variant-name">56px sticky, breadcrumbs + actions</div>
          <div className="sg-variant-desc">
            Слева — breadcrumbs (последний сегмент жирный) + live-pill + ratelimit. Справа — search (⌘K), refresh, settings, logout. Все icon-buttons 32×32.
          </div>
          <div className="sg-variant-stage" style={{ padding: 12, background: "var(--mk-surface-2)" }}>
            <div className="sg-top-mini">
              <div className="crumbs"><span>Все проекты</span><span className="sep">/</span><b>Дашборд</b></div>
              <span className="live">GitHub API · live</span>
              <span className="ratelimit">REST 5.0k · GQL 1.3k</span>
              <span className="spacer" />
              <div className="search"><span>Поиск</span><span className="kbd">⌘K</span></div>
              <button className="ibtn" aria-label="refresh">↻</button>
              <button className="ibtn" aria-label="settings">⚙</button>
              <button className="ibtn" aria-label="logout">⇲</button>
            </div>
          </div>
        </div>
      </div>

      <h3 className="sg-sub">Page header</h3>
      <div className="sg-variants">
        <div className="sg-variant">
          <div className="sg-variant-label">PROPOSED — КАНОН</div>
          <div className="sg-variant-name">Title + meta + actions в одной строке</div>
          <div className="sg-variant-desc">
            Заголовок 22px, под ним meta (12px ink-500). Справа — actions (filter toolbar + primary CTA). Сейчас в Dashboard это есть, в Quality иначе, в Audit ещё иначе — унифицируем.
          </div>
          <div className="sg-variant-stage" style={{ padding: 0, background: "transparent", alignItems: "stretch" }}>
            <div className="sg-ph" style={{ width: "100%" }}>
              <div className="sg-ph-title-row">
                <h4 className="sg-ph-title">MakeIT · сводка по проектам</h4>
                <div className="sg-ph-actions">
                  <div className="sg-toolbar">
                    {filterLabels.map((l, i) => (
                      <button key={l} className={i === filter ? "active" : ""} onClick={() => setFilter(i)}>{l}</button>
                    ))}
                  </div>
                  <button className="sg-btn-new primary" style={{ height: 30 }}>Все проекты</button>
                </div>
              </div>
              <div className="sg-ph-meta">12 активных проектов · обновлено 11:13</div>
            </div>
          </div>
        </div>
      </div>

      <h3 className="sg-sub">Toolbar (filter chips)</h3>
      <div className="sg-variants">
        <div className="sg-variant">
          <div className="sg-variant-label">КАНОН</div>
          <div className="sg-variant-name">Pill-toolbar для фильтра по таксономии</div>
          <div className="sg-variant-desc">
            Тот же стиль что pill-tabs. Используется для inline-фильтров: фазы проекта, статус, период. Активный сегмент — белая подложка.
          </div>
          <div className="sg-variant-stage">
            <div className="sg-toolbar">
              <button className="active">Все</button>
              <button>Pre-dev</button>
              <button>Dev</button>
              <button>Support</button>
            </div>
          </div>
        </div>
      </div>

      <h3 className="sg-sub">Grids</h3>
      <div className="sg-variants">
        <div className="sg-variant">
          <div className="sg-variant-label">V4-GRID</div>
          <div className="sg-variant-name">1.6fr + 1fr</div>
          <div className="sg-variant-desc">Двухколоночный layout: основной контент слева (шире), aside справа. Используется в Hub.</div>
          <div className="sg-variant-stage" style={{ padding: 0, background: "transparent", alignItems: "stretch" }}>
            <div className="sg-grid-demo v4" style={{ width: "100%" }}>
              <div className="cell">1.6fr</div>
              <div className="cell">1fr</div>
            </div>
          </div>
        </div>
        <div className="sg-variant">
          <div className="sg-variant-label">KPI-ROW</div>
          <div className="sg-variant-name">repeat(4, 1fr)</div>
          <div className="sg-variant-desc">Четыре равных KPI-карточки сверху на странице. Главные метрики (прогресс портфеля, открытые задачи, velocity, бюджет).</div>
          <div className="sg-variant-stage" style={{ padding: 0, background: "transparent", alignItems: "stretch" }}>
            <div className="sg-grid-demo kpi" style={{ width: "100%" }}>
              <div className="cell">KPI</div>
              <div className="cell">KPI</div>
              <div className="cell">KPI</div>
              <div className="cell">KPI</div>
            </div>
          </div>
        </div>
        <div className="sg-variant">
          <div className="sg-variant-label">BENTO (12-COL)</div>
          <div className="sg-variant-name">flex spans 4/8/12</div>
          <div className="sg-variant-desc">12-колоночная сетка для bento-layout. Spans 4, 8, 12. Подходит когда нужна асимметрия (например 8+4).</div>
          <div className="sg-variant-stage" style={{ padding: 0, background: "transparent", alignItems: "stretch" }}>
            <div className="sg-grid-demo bento" style={{ width: "100%", height: 100 }}>
              <div className="cell span-8">8</div>
              <div className="cell span-4">4</div>
              <div className="cell span-12">12</div>
            </div>
          </div>
        </div>
      </div>
      <div className="sg-note">
        Канон: <strong>KPI-row</strong> сверху страницы, <strong>v4-grid (1.6+1)</strong> для основного контента, <strong>bento (12-col)</strong> только когда требуется асимметрия. Один grid на одну зону, не миксовать.
      </div>

      <h3 className="sg-sub">Table / list</h3>
      <div className="sg-variants">
        <div className="sg-variant" style={{ gridColumn: "1 / -1" }}>
          <div className="sg-variant-label">КАНОН</div>
          <div className="sg-variant-name">Mono-uppercase headers, hover surface-2</div>
          <div className="sg-variant-desc">
            Сейчас Quality / Pipeline / Audit имеют каждый свою таблицу. Канон — общий шаблон ниже.
          </div>
          <div className="sg-variant-stage" style={{ padding: 0, background: "transparent", alignItems: "stretch" }}>
            <table className="sg-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Open</th>
                  <th>Progress</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Sewing-ERP</td><td><span className="sg-badge success">dev</span></td><td>82</td><td>88%</td></tr>
                <tr><td>mankassa-app</td><td><span className="sg-badge success">dev</span></td><td>74</td><td>92%</td></tr>
                <tr><td>moliyakg</td><td><span className="sg-badge info">dev</span></td><td>85</td><td>93%</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════
   STATE PATTERNS
   ══════════════════════════════════════════════════════════ */

function StateSection() {
  return (
    <section id="states" className="sg-section">
      <header className="sg-section-head">
        <h2>State patterns</h2>
        <p>Что показываем когда данных нет, пришла ошибка, идёт загрузка, токен не введён. Сейчас все вкладки делают это по-своему — здесь единый набор.</p>
      </header>

      <h3 className="sg-sub">Loading</h3>
      <div className="sg-variants">
        <div className="sg-variant">
          <div className="sg-variant-label">SKELETON</div>
          <div className="sg-variant-name">Для известной структуры</div>
          <div className="sg-variant-desc">Когда мы знаем форму данных (карточка, строка таблицы), показываем placeholder с shimmer-анимацией.</div>
          <div className="sg-variant-stage" style={{ padding: 16 }}>
            <div className="sg-skeleton-stack">
              <div className="sg-skeleton sg-skeleton-row" />
              <div className="sg-skeleton sg-skeleton-row medium" />
              <div className="sg-skeleton sg-skeleton-row short" />
            </div>
          </div>
        </div>
        <div className="sg-variant">
          <div className="sg-variant-label">SPINNER</div>
          <div className="sg-variant-name">Для inline-действий</div>
          <div className="sg-variant-desc">Pulse-dots в primary-цвете. Для refresh-кнопок, mini-actions внутри карточки.</div>
          <div className="sg-variant-stage">
            <div className="sg-spinner"><span /><span /><span /></div>
          </div>
        </div>
        <div className="sg-variant">
          <div className="sg-variant-label">BRANDED LOADER</div>
          <div className="sg-variant-name">Cold-start full-screen</div>
          <div className="sg-variant-desc">Только при первой загрузке приложения. MakeIT wordmark + stage label («Подтягиваем…»).</div>
          <div className="sg-variant-stage" style={{ flexDirection: "column", gap: 4 }}>
            <div className="sg-typewriter">MakeIT</div>
            <div className="sg-typewriter-label">Подтягиваем данные…</div>
          </div>
        </div>
      </div>
      <div className="sg-note">
        Канон: skeleton — для предсказуемых списков и карточек; spinner — для inline-actions и refresh; branded loader — <strong>только</strong> для cold-start (первый mount), не для последующих refresh.
      </div>

      <h3 className="sg-sub">Empty</h3>
      <div className="sg-variants">
        <div className="sg-variant">
          <div className="sg-variant-label">EMPTY STATE</div>
          <div className="sg-variant-name">Нет данных</div>
          <div className="sg-variant-desc">Иконка в surface-3 круге + краткое описание + опциональный CTA.</div>
          <div className="sg-variant-stage">
            <div className="sg-state-card" style={{ width: "100%" }}>
              <div className="sg-empty-icon">∅</div>
              <div className="sg-empty-title">Нет данных</div>
              <div className="sg-empty-desc">По текущему фильтру ничего не найдено. Попробуйте сменить период или сбросить фильтр.</div>
              <button className="sg-btn-new" style={{ marginTop: 6 }}>Сбросить</button>
            </div>
          </div>
        </div>
        <div className="sg-variant">
          <div className="sg-variant-label">BACKEND NOT DEPLOYED</div>
          <div className="sg-variant-name">«Не настроено»</div>
          <div className="sg-variant-desc">Когда подсистема существует, но backend не развёрнут (Quality на свежем VPS). Без агрессивной ошибки — мягко.</div>
          <div className="sg-variant-stage">
            <div className="sg-state-card" style={{ width: "100%" }}>
              <div className="sg-empty-icon" style={{ background: "var(--mk-brand-50)", color: "var(--mk-brand-700)" }}>⚙</div>
              <div className="sg-empty-title">Quality backend ещё не развёрнут</div>
              <div className="sg-empty-desc">Чтобы видеть метрики качества кода, разверните makeit-quality-api на VPS и пропишите URL в config.js.</div>
            </div>
          </div>
        </div>
      </div>

      <h3 className="sg-sub">Error</h3>
      <div className="sg-variants">
        <div className="sg-variant" style={{ gridColumn: "1 / -1" }}>
          <div className="sg-variant-label">API ERROR — КАНОН</div>
          <div className="sg-variant-name">Краткое описание + retry CTA</div>
          <div className="sg-variant-desc">Красный border-left, danger-soft фон, иконка «!» в круге, заголовок + причина + кнопка retry. Inline (не модал).</div>
          <div className="sg-variant-stage" style={{ padding: 0, background: "transparent", alignItems: "stretch" }}>
            <div className="sg-error" style={{ width: "100%" }}>
              <div className="sg-error-icon">!</div>
              <div className="sg-error-body">
                <strong>Не удалось загрузить данные.</strong><br />
                GitHub API вернул 502. Возможно, временный сбой. Попробуйте обновить через минуту.
                <div className="sg-error-actions">
                  <button className="sg-btn-new primary" style={{ height: 30 }}>Повторить</button>
                  <button className="sg-btn-new" style={{ height: 30 }}>Скрыть</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <h3 className="sg-sub">Stale data</h3>
      <div className="sg-variants">
        <div className="sg-variant" style={{ gridColumn: "1 / -1" }}>
          <div className="sg-variant-label">КАНОН</div>
          <div className="sg-variant-name">Warning banner с временем</div>
          <div className="sg-variant-desc">Если данные не обновлялись &gt;5 минут — показать warning. Mono time-stamp + CTA.</div>
          <div className="sg-variant-stage" style={{ padding: 0, background: "transparent", alignItems: "stretch" }}>
            <div className="sg-stale" style={{ width: "100%" }}>
              <span className="sg-stale-icon">⚠</span>
              <span>Данные устарели — последнее обновление</span>
              <span className="time">38 мин назад</span>
              <span style={{ flex: 1 }} />
              <button className="sg-btn-new" style={{ height: 28, fontSize: 12 }}>Обновить</button>
            </div>
          </div>
        </div>
      </div>

      <h3 className="sg-sub">No token / unauthorized</h3>
      <div className="sg-variants">
        <div className="sg-variant" style={{ gridColumn: "1 / -1" }}>
          <div className="sg-variant-label">PASSWORD GATE / TOKEN FORM</div>
          <div className="sg-variant-name">Минимальная форма входа</div>
          <div className="sg-variant-desc">Centered card с title + description + input + primary button. Без navigation, без sidebar.</div>
          <div className="sg-variant-stage" style={{ background: "var(--mk-bg)" }}>
            <div className="sg-gate">
              <div className="sg-gate-title">MakeIT Dashboard</div>
              <div className="sg-gate-desc">Введите пароль для доступа</div>
              <input className="sg-input" placeholder="Пароль" type="password" style={{ marginBottom: 10 }} />
              <button className="sg-btn-new primary" style={{ width: "100%" }}>Войти</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════
   DATA VISUALIZATION
   ══════════════════════════════════════════════════════════ */

function DataVizSection() {
  return (
    <section id="dataviz" className="sg-section">
      <header className="sg-section-head">
        <h2>Data visualization</h2>
        <p>Цветовая семантика данных, единый стиль графиков, heatmap, прогресс-баров и severity-шкал.</p>
      </header>

      <h3 className="sg-sub">Line chart (KPI sparkline)</h3>
      <div className="sg-variants">
        <div className="sg-variant">
          <div className="sg-variant-label">КАНОН</div>
          <div className="sg-variant-name">Velocity / closed issues</div>
          <div className="sg-variant-desc">Кастомный SVG, success-зелёная линия 2px, lightly filled area, нет осей и grid (sparkline-стиль).</div>
          <div className="sg-variant-stage" style={{ padding: 0, background: "transparent", alignItems: "stretch" }}>
            <div className="sg-viz-card" style={{ width: "100%" }}>
              <div className="sg-viz-title">VELOCITY · 7 дней</div>
              <div className="sg-viz-value">61.6 <span style={{ fontSize: 13, color: "var(--mk-ink-500)", fontWeight: 500 }}>issue/день</span></div>
              <div className="sg-line">
                <svg viewBox="0 0 200 60" preserveAspectRatio="none">
                  <path d="M0,40 L20,32 L40,38 L60,22 L80,28 L100,16 L120,22 L140,10 L160,18 L180,8 L200,12"
                    fill="none" stroke="var(--mk-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M0,40 L20,32 L40,38 L60,22 L80,28 L100,16 L120,22 L140,10 L160,18 L180,8 L200,12 L200,60 L0,60 Z"
                    fill="var(--mk-success)" opacity="0.1" />
                </svg>
              </div>
            </div>
          </div>
        </div>
        <div className="sg-variant">
          <div className="sg-variant-label">КАНОН</div>
          <div className="sg-variant-name">Bar chart (closed 30d)</div>
          <div className="sg-variant-desc">Brand-blue столбцы + ма-trend линия в success. Hover-tooltip с mono labels.</div>
          <div className="sg-variant-stage" style={{ padding: 0, background: "transparent", alignItems: "stretch" }}>
            <div className="sg-viz-card" style={{ width: "100%" }}>
              <div className="sg-viz-title">ЗАКРЫТО · 30 дней</div>
              <div className="sg-line">
                <svg viewBox="0 0 300 80" preserveAspectRatio="none">
                  {[20, 14, 28, 22, 35, 18, 30, 25, 38, 30, 42, 28, 36, 48, 32, 40, 50, 38, 44, 55, 40, 48, 60, 45, 52, 58, 50, 55, 62, 50].map((h, i) => (
                    <rect key={i} x={i * 10} y={80 - h} width={7} height={h} fill="var(--mk-brand-500)" opacity={0.85} />
                  ))}
                  <path d="M3,55 Q50,50 100,42 T200,28 T297,20" fill="none" stroke="var(--mk-success)" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      <h3 className="sg-sub">Heatmap (commit activity)</h3>
      <div className="sg-variants">
        <div className="sg-variant">
          <div className="sg-variant-label">5 ступеней</div>
          <div className="sg-variant-name">Brand-blue scale</div>
          <div className="sg-variant-desc">
            0 коммитов — surface-3 (нейтральный фон), 1+ — 4 ступени из <code>--mk-heat-1..4</code>. 10×10px ячейки, pop-in animation 380ms.
          </div>
          <div className="sg-variant-stage" style={{ padding: 0, background: "transparent", alignItems: "stretch" }}>
            <div style={{ width: "100%" }}>
              <div className="sg-heat" style={{ marginBottom: 12 }}>
                {Array.from({ length: 84 }).map((_, i) => {
                  const intensities = [0, 0, 1, 0, 2, 3, 4, 0, 1, 2, 0, 0];
                  const intensity = (i * 7 + Math.floor(i / 12)) % 5;
                  const tones = ["var(--mk-surface-3)", "var(--mk-heat-1)", "var(--mk-heat-2)", "var(--mk-heat-3)", "var(--mk-heat-4)"];
                  return <div key={i} className="cell" style={{ background: tones[intensity] }} />;
                })}
              </div>
              <div className="sg-heat-legend">
                <span>меньше</span>
                <div className="lcell" style={{ background: "var(--mk-surface-3)" }} />
                <div className="lcell" style={{ background: "var(--mk-heat-1)" }} />
                <div className="lcell" style={{ background: "var(--mk-heat-2)" }} />
                <div className="lcell" style={{ background: "var(--mk-heat-3)" }} />
                <div className="lcell" style={{ background: "var(--mk-heat-4)" }} />
                <span>больше</span>
              </div>
            </div>
          </div>
        </div>
        <div className="sg-variant">
          <div className="sg-variant-label">ЗАМЕЧАНИЕ</div>
          <div className="sg-variant-name">Альтернатива GitHub-style green</div>
          <div className="sg-variant-desc">
            Текущий проект использует brand-blue для heatmap. GitHub-style зелёная шкала ниже — для сравнения. Можно сохранить blue (отличается от bare GitHub clone) или вернуть green.
          </div>
          <div className="sg-variant-stage" style={{ padding: 0, background: "transparent", alignItems: "stretch" }}>
            <div style={{ width: "100%" }}>
              <div className="sg-heat" style={{ marginBottom: 12 }}>
                {Array.from({ length: 84 }).map((_, i) => {
                  const intensity = (i * 7 + Math.floor(i / 12)) % 5;
                  const tones = ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"];
                  return <div key={i} className="cell" style={{ background: tones[intensity] }} />;
                })}
              </div>
              <div className="sg-heat-legend"><span>GitHub-style green (для сравнения)</span></div>
            </div>
          </div>
        </div>
      </div>

      <h3 className="sg-sub">Progress bars</h3>
      <div className="sg-variants">
        <div className="sg-variant">
          <div className="sg-variant-label">КАНОН</div>
          <div className="sg-variant-name">Single fill — прогресс задач</div>
          <div className="sg-variant-desc">Height 6px, radius-full, surface-3 track, success-fill. Easing 700ms cubic-out.</div>
          <div className="sg-variant-stage" style={{ padding: 0, background: "transparent", alignItems: "stretch" }}>
            <div style={{ width: "100%" }}>
              <div className="sg-progress-row">
                <span className="lbl">Sewing-ERP</span>
                <div className="sg-progress"><div className="fill" style={{ width: "88%" }} /></div>
                <span className="pct">611/693</span>
              </div>
              <div className="sg-progress-row">
                <span className="lbl">mankassa</span>
                <div className="sg-progress"><div className="fill" style={{ width: "92%" }} /></div>
                <span className="pct">811/885</span>
              </div>
              <div className="sg-progress-row">
                <span className="lbl">moliyakg</span>
                <div className="sg-progress"><div className="fill" style={{ width: "93%" }} /></div>
                <span className="pct">1104/1189</span>
              </div>
            </div>
          </div>
        </div>
        <div className="sg-variant">
          <div className="sg-variant-label">STACKED</div>
          <div className="sg-variant-name">Paid / unpaid (budget)</div>
          <div className="sg-variant-desc">Height 10px, radius-sm. Paid (success) + unpaid (surface-3). Подпись слева/справа.</div>
          <div className="sg-variant-stage" style={{ padding: 0, background: "transparent", alignItems: "stretch" }}>
            <div style={{ width: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--mk-ink-500)", fontFamily: "var(--mk-font-mono)", marginBottom: 6 }}>
                <span>Оплачено $30.6k</span>
                <span>Остаток $16k</span>
              </div>
              <div className="sg-progress-stack">
                <div className="paid" style={{ width: "66%" }} />
                <div className="unpaid" style={{ width: "34%" }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <h3 className="sg-sub">Severity scales (priority vs severity)</h3>
      <div className="sg-variants">
        <div className="sg-variant">
          <div className="sg-variant-label">PRIORITY (portfolio tasks)</div>
          <div className="sg-variant-name">P1 / P2 / P3 / P4</div>
          <div className="sg-variant-desc">Для задач в портфеле. P3 = normal (синий), P4 = low (серый).</div>
          <div className="sg-variant-stage" style={{ padding: 0, background: "transparent", alignItems: "stretch" }}>
            <div className="sg-sev-legend">
              <div className="sg-sev-row"><span className="sg-sev-dot" style={{ background: "var(--mk-priority-p1)" }} /><span className="sg-sev-name">P1 · critical</span><span className="sg-sev-token">--mk-priority-p1</span></div>
              <div className="sg-sev-row"><span className="sg-sev-dot" style={{ background: "var(--mk-priority-p2)" }} /><span className="sg-sev-name">P2 · high</span><span className="sg-sev-token">--mk-priority-p2</span></div>
              <div className="sg-sev-row"><span className="sg-sev-dot" style={{ background: "var(--mk-priority-p3)" }} /><span className="sg-sev-name">P3 · normal</span><span className="sg-sev-token">--mk-priority-p3</span></div>
              <div className="sg-sev-row"><span className="sg-sev-dot" style={{ background: "var(--mk-priority-p4)" }} /><span className="sg-sev-name">P4 · low</span><span className="sg-sev-token">--mk-priority-p4</span></div>
            </div>
          </div>
        </div>
        <div className="sg-variant">
          <div className="sg-variant-label">SEVERITY (code quality)</div>
          <div className="sg-variant-name">CRIT / HIGH / MED / LOW</div>
          <div className="sg-variant-desc">Для Quality и Audit findings. Чёткая шкала угрозы — красный → жёлтый.</div>
          <div className="sg-variant-stage" style={{ padding: 0, background: "transparent", alignItems: "stretch" }}>
            <div className="sg-sev-legend">
              <div className="sg-sev-row"><span className="sg-sev-dot" style={{ background: "var(--mk-severity-critical)" }} /><span className="sg-sev-name">CRITICAL</span><span className="sg-sev-token">--mk-severity-critical</span></div>
              <div className="sg-sev-row"><span className="sg-sev-dot" style={{ background: "var(--mk-severity-high)" }} /><span className="sg-sev-name">HIGH</span><span className="sg-sev-token">--mk-severity-high</span></div>
              <div className="sg-sev-row"><span className="sg-sev-dot" style={{ background: "var(--mk-severity-medium)" }} /><span className="sg-sev-name">MEDIUM</span><span className="sg-sev-token">--mk-severity-medium</span></div>
              <div className="sg-sev-row"><span className="sg-sev-dot" style={{ background: "var(--mk-severity-low)" }} /><span className="sg-sev-name">LOW</span><span className="sg-sev-token">--mk-severity-low</span></div>
            </div>
          </div>
        </div>
      </div>
      <div className="sg-note">
        Канон: <strong>priority</strong> и <strong>severity</strong> — разные шкалы с разными переменными. Не смешивать. P3 (синий) ≠ severity-low (тоже синий, но другой контекст). Эта пара уже разнесена в tokens.css.
      </div>

      <h3 className="sg-sub">Repo colors</h3>
      <div className="sg-policy">
        <strong>Gap:</strong> сейчас в проекте <strong>нет</strong> единой схемы цвета per репозиторий. Все репо в heatmap и графиках используют общий brand-blue. Если хочешь, чтобы один и тот же репо был узнаваем во всех представлениях (sewing-ERP всегда красный, mankassa всегда фиолетовый и т.д.) — это <strong>отдельный architectural decision</strong>: вводим mapping <code>repo → mk-token</code> в <code>config.ts</code>.<br /><br />
        <strong>Альтернатива:</strong> оставить как есть — цвет несёт семантику (success/danger/priority), а не identity. Это проще, и для дашборда уровня «портфель из 12 проектов» избыточная identity-палитра скорее шумит.
      </div>
    </section>
  );
}

export function StyleguideApp() {
  useEffect(() => {
    document.title = "MakeIT — Styleguide";
  }, []);

  return (
    <div className="sg-root">
      <aside className="sg-side">
        <div className="sg-side-brand">
          <div className="sg-side-logo">M</div>
          <div>
            <div className="sg-side-title">Styleguide</div>
            <div className="sg-side-tag">MAKEIT · DEV</div>
          </div>
        </div>
        <nav className="sg-nav">
          <a href="#palette">Цвета</a>
          <a href="#typography">Типографика</a>
          <a href="#spacing">Spacing</a>
          <a href="#radius">Radius</a>
          <a href="#shadows">Shadows</a>
          <a href="#motion">Motion</a>
          <a href="#components">Компоненты</a>
          <a href="#layout">Layout</a>
          <a href="#states">States</a>
          <a href="#dataviz">Data viz</a>
        </nav>
      </aside>
      <main className="sg-main">
        <header className="sg-hero">
          <h1>MakeIT Design System</h1>
          <p>Живой справочник дизайн-токенов и компонентов. Полностью на <code>--mk-*</code>. Используется для согласования стилей и миграции legacy/v4 в единую систему.</p>
        </header>
        <PaletteSection />
        <TypographySection />
        <SpacingSection />
        <RadiusSection />
        <ShadowsSection />
        <MotionSection />
        <ComponentsSection />
        <LayoutSection />
        <StateSection />
        <DataVizSection />
      </main>
    </div>
  );
}
