import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: '/' keeps asset URLs absolute so Vercel's root-served dist/ works as-is.
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    // Bind IPv4 explicitly. On Windows the dev server otherwise listens only on
    // [::1], and browsers that resolve localhost to 127.0.0.1 first get a blank
    // page. Vercel is unaffected — this only configures the local dev server.
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
  },
  preview: {
    host: '127.0.0.1',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
