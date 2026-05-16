import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.VITE_BASE ?? '/makeit-dashboard/'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
        'icon-192.png',
        'icon-512.png',
        'icon-512-maskable.png',
        'splash-dark.png',
        'splash-light.png',
      ],
      manifest: {
        name: 'MakeIT Dashboard',
        short_name: 'MakeIT',
        description: 'Дашборд управления проектами MakeIT',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        categories: ['business', 'productivity'],
        shortcuts: [
          {
            name: 'Утренний брифинг',
            url: `${base}?action=briefing`,
            description: 'AI брифинг по проектам',
          },
        ],
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['config.js'], // Runtime config — replaced by volume mount on VPS
        navigateFallbackDenylist: [/^\/api\//], // Don't intercept API calls
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.github\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'github-api',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /\/api\/projects/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'cache-backend',
              expiration: {
                maxEntries: 5,
                maxAgeSeconds: 60 * 30, // 30 min offline fallback
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // #486: Auditor / Pipeline / Transcripts / settings / monitors
            // live on separate, runtime-configured origins (AUDITOR_URL /
            // PIPELINE_URL / BetterStack worker). Match cross-origin
            // requests only (never the SPA's own assets/navigations) whose
            // path is in the API family — host can't be hard-coded since
            // the URLs come from runtime config.js. NetworkFirst keeps
            // online behaviour unchanged; offline (or on a 6s network
            // stall) it serves the last response within the TTL so those
            // tabs degrade gracefully instead of blanking.
            urlPattern: ({ url, sameOrigin }) =>
              !sameOrigin &&
              /\/(pipeline|audit|findings|runs|verify|transcripts|settings|monitors|uptime)\b/i.test(
                url.pathname,
              ),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'cache-api',
              networkTimeoutSeconds: 6,
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  base,
  server: {
    port: 4173,
    strictPort: true,
  },
})
