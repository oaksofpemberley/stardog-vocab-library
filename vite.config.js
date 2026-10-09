import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Proxy settings are server-side only (no VITE_ prefix), so credentials never reach the browser bundle.
  const env = loadEnv(mode, import.meta.dirname, '')
  const target = env.STARDOG_URL || 'http://localhost:5820'
  const auth = env.STARDOG_USERNAME ? `${env.STARDOG_USERNAME}:${env.STARDOG_PASSWORD || ''}` : undefined

  return {
    plugins: [react()],
    server: {
      port: 5180,
      proxy: {
        // Browser calls /stardog/... and Vite forwards them to Stardog, avoiding CORS.
        // If STARDOG_USERNAME is set, the proxy adds Basic auth; a Bearer token entered in the app takes precedence.
        '/stardog': {
          target,
          changeOrigin: true,
          auth,
          rewrite: (path) => path.replace(/^\/stardog/, ''),
          secure: true,
        },
      },
    },
  }
})
