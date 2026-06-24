import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Pera — Money Tracker',
        short_name: 'Pera',
        description: 'Free, offline, local-first money tracker.',
        theme_color: '#0B0C10',
        background_color: '#0B0C10',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        // Long-press the installed icon (Android PWA) → fast capture. HashRouter,
        // so deep links MUST use the /#/ form to cold-launch the route.
        shortcuts: [
          {
            name: 'Add expense',
            short_name: 'Expense',
            url: '/#/quick-add?type=expense',
            icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }]
          },
          {
            name: 'Add income',
            short_name: 'Income',
            url: '/#/quick-add?type=income',
            icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }]
          }
        ]
      }
    })
  ]
})
