/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Link-preview crawlers (they don't run JavaScript). Keep in sync with vercel.json.
const crawler = /bot|crawler|spider|facebookexternalhit|whatsapp|slack|discord|telegram|linkedin|embedly|skype|pinterest|vkshare|applebot/i

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Same as production: crawlers asking for a post (or the feed popup URL) get the backend's preview page.
      '^/(posts/[^/?#]+|\\?(.*&)?post=[^&]+)': {
        target: 'http://localhost:5000',
        bypass: (req) => (crawler.test(req.headers['user-agent'] ?? '') ? undefined : '/index.html'),
        rewrite: (path) => `/api/preview/posts/${(path.match(/^\/posts\/([^/?#]+)/) ?? path.match(/[?&]post=([^&#]+)/))?.[1]}`,
      },
      '/api': 'http://localhost:5000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
