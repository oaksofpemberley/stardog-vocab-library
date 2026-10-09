import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { Buffer } from 'node:buffer'

// Only requests from this app's own pages may borrow the proxy credentials. Without this,
// any website open in the same browser could POST to /stardog/... and act as the proxy user (CSRF).
function isSameOrigin(req) {
  const site = req.headers['sec-fetch-site']
  if (site && site !== 'same-origin' && site !== 'none') return false
  const origin = req.headers.origin
  if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) return false
  return true
}

export default defineConfig(({ mode }) => {
  // Proxy settings are server-side only (no VITE_ prefix), so credentials never reach the browser bundle.
  const env = loadEnv(mode, import.meta.dirname, '')
  const target = env.STARDOG_URL || 'http://localhost:5820'
  const basicAuth = env.STARDOG_USERNAME
    ? 'Basic ' + Buffer.from(`${env.STARDOG_USERNAME}:${env.STARDOG_PASSWORD || ''}`).toString('base64')
    : null

  return {
    plugins: [react()],
    server: {
      port: 5180,
      proxy: {
        // Browser calls /stardog/... and Vite forwards them to Stardog, avoiding CORS.
        // If STARDOG_USERNAME is set, the proxy adds Basic auth to same-origin requests;
        // a Bearer token entered in the app takes precedence.
        '/stardog': {
          target,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/stardog/, ''),
          secure: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              if (basicAuth && !req.headers.authorization && isSameOrigin(req)) {
                proxyReq.setHeader('Authorization', basicAuth)
              }
            })
            // A 401 with WWW-Authenticate makes the browser pop up its own login dialog (e.g. on a
            // wrong sign-in password), which blocks the page. The app shows its own error instead.
            proxy.on('proxyRes', (proxyRes) => {
              delete proxyRes.headers['www-authenticate']
            })
          },
        },
      },
    },
  }
})
