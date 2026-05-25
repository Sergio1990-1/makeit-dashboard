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
  { name: "--mk-caution",        value: "#EAB308" },
  { name: "--mk-review",         value: "#7C3AED" },
  { name: "--mk-info",           value: "#0EA5E9" },
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

const SWATCH_GRAY: Swatch[] = [
  { name: "--mk-gray-0",   value: "#F6F7F9" },
  { name: "--mk-gray-50",  value: "#F4F5F8" },
  { name: "--mk-gray-100", value: "#EDEFF3" },
  { name: "--mk-gray-200", value: "#E4E8EF" },
  { name: "--mk-gray-300", value: "#C5CCDA" },
  { name: "--mk-gray-400", value: "#94A0B8" },
  { name: "--mk-gray-500", value: "#6B7691" },
  { name: "--mk-gray-600", value: "#4A5570" },
  { name: "--mk-gray-700", value: "#2F3850" },
  { name: "--mk-gray-800", value: "#1B2235" },
  { name: "--mk-gray-900", value: "#0E1320" },
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

      <h3 className="sg-sub">Gray ramp (raw scale)</h3>
      <SwatchGrid items={SWATCH_GRAY} />
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
      </main>
    </div>
  );
}
