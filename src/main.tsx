import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './styles/tokens.css'
import './styles/components.css'
import './index.css'
import App from './App.tsx'
import { PipelineActiveTasksDemoPage } from './components/PipelineActiveTasksBlock/DemoPage'
import { StyleguideApp } from './styleguide/StyleguideApp'

// Sanity check: when served from a non-localhost origin, the runtime
// config.js should override the default localhost API URLs. Warn loudly
// if it's still pointing at 127.0.0.1 — almost certainly a misconfigured
// VPS deploy with a missing config.js volume mount. Side-effect only;
// app continues to load.
;(() => {
  if (typeof window === 'undefined') return
  const cfg = (window as unknown as {
    __MAKEIT_CONFIG__?: { AUDITOR_URL?: string; PIPELINE_URL?: string }
  }).__MAKEIT_CONFIG__
  const auditor = cfg?.AUDITOR_URL ?? ''
  const pipeline = cfg?.PIPELINE_URL ?? ''
  const looksLocal = (u: string) => u.includes('127.0.0.1') || u.includes('localhost')
  const onLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  if (!onLocalhost && (looksLocal(auditor) || looksLocal(pipeline))) {
    console.warn(
      '[config] Production deploy is using localhost API URLs. ' +
        'Check that public/config.js is correctly mounted on the VPS.',
      { AUDITOR_URL: auditor, PIPELINE_URL: pipeline },
    )
  }
})()

function showUpdateBanner(onAccept: () => void) {
  if (document.getElementById('sw-update-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'sw-update-banner';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  // SW update banner живёт вне React/styleguide, поэтому стили задаются
  // через .style.cssText. Раньше использовался несуществующий
  // --color-bg-elevated (fallback на dark hex — артефакт dark-темы);
  // теперь все цвета идут из tokens.css через --mk-*.
  banner.style.cssText =
    'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);' +
    'background:var(--mk-paper);color:var(--mk-ink-900);' +
    'padding:12px 16px;border-radius:8px;box-shadow:var(--mk-shadow-lg);' +
    'border:1px solid var(--mk-line);' +
    'display:flex;gap:12px;align-items:center;z-index:9999;font-size:14px;';
  const text = document.createElement('span');
  text.textContent = 'Доступна новая версия дашборда.';
  const updateBtn = document.createElement('button');
  updateBtn.textContent = 'Обновить';
  updateBtn.style.cssText = 'background:var(--mk-primary);color:var(--mk-on-primary);border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:14px;';
  updateBtn.addEventListener('click', () => {
    banner.remove();
    onAccept();
  });
  const dismissBtn = document.createElement('button');
  dismissBtn.textContent = 'Позже';
  dismissBtn.setAttribute('aria-label', 'Закрыть уведомление об обновлении');
  dismissBtn.style.cssText = 'background:transparent;color:inherit;border:1px solid currentColor;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:14px;';
  dismissBtn.addEventListener('click', () => banner.remove());
  banner.append(text, updateBtn, dismissBtn);
  document.body.appendChild(banner);
}

registerSW({
  onNeedRefresh() {
    showUpdateBanner(() => window.location.reload());
  },
  onOfflineReady() {
    console.log('App ready to work offline')
  },
})

// `?pipeline-demo=1` mounts the standalone Active Tasks demo (mock data,
// no auth, no GitHub token). Useful for iterating on the design without
// a live pipeline backend.
const isPipelineDemo =
  typeof window !== 'undefined' && window.location.search.includes('pipeline-demo=1')

// `?styleguide=1` (dev only) mounts the design-system styleguide.
// No auth, no API calls — pure CSS reference for design review.
const isStyleguide =
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  window.location.search.includes('styleguide=1')

function pickRoot() {
  if (isStyleguide) return <StyleguideApp />
  if (isPipelineDemo) return <PipelineActiveTasksDemoPage />
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{pickRoot()}</StrictMode>,
)
