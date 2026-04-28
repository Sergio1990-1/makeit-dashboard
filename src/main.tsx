import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

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

// Register service worker with auto-update
registerSW({
  onNeedRefresh() {
    if (confirm('Доступна новая версия. Обновить?')) {
      window.location.reload()
    }
  },
  onOfflineReady() {
    console.log('App ready to work offline')
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
