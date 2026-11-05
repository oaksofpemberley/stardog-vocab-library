import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'

// Only requests from this app's own pages may borrow the proxy credentials. Without this,
// any website open in the same browser could POST to /stardog/... and act as the proxy user (CSRF).
function isSameOrigin(req) {
  const site = req.headers['sec-fetch-site']
  if (site && site !== 'same-origin' && site !== 'none') return false
  const origin = req.headers.origin
  if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) return false
  return true
}

// `vite build --mode single` (npm run build:single) makes dist-single/vocab-library.html: the whole
// app in one file that opens straight from disk, with no npm, Node or web server for whoever uses it.
// The browser calls Stardog directly (Stardog allows cross-origin requests), so there is no proxy.
const singleFile = {
  // Every browser that runs React 19 reads woff2; inlining the .woff fallbacks too would add ~1.3 MB
  name: 'single-file-woff2-only',
  enforce: 'pre',
  transform(code, id) {
    if (id.includes('@fontsource') && id.endsWith('.css')) {
      return code.replace(/,\s*url\([^)]*\.woff\)\s*format\(['"]woff['"]\)/g, '')
    }
  },
}
const inlineIntoHtml = {
  name: 'single-file-inline',
  enforce: 'post',
  generateBundle(_, bundle) {
    const page = bundle['index.html']
    let html = page.source
    for (const [name, file] of Object.entries(bundle)) {
      const tag = name.endsWith('.js')
        ? new RegExp(`<script[^>]*src="[^"]*${name}"[^>]*></script>`)
        : name.endsWith('.css') ? new RegExp(`<link[^>]*href="[^"]*${name}"[^>]*>`) : null
      if (!tag) continue
      // A literal "</script" inside the code would end the inline script early
      const code = (file.type === 'chunk' ? file.code : String(file.source)).replace(/<\/(script|style)/gi, '<\\/$1')
      // A function replacement, so "$&" and similar in the code are not treated as patterns
      html = html.replace(tag, () => name.endsWith('.js') ? `<script type="module">${code}</script>` : `<style>${code}</style>`)
      delete bundle[name]
    }
    const favicon = readFileSync(`${import.meta.dirname}/public/favicon.svg`).toString('base64')
    page.source = html.replace('href="/favicon.svg"', `href="data:image/svg+xml;base64,${favicon}"`)
    page.fileName = 'vocab-library.html'
  },
}

export default defineConfig(({ mode }) => {
  if (mode === 'single') {
    return {
      plugins: [react(), singleFile, inlineIntoHtml],
      // Never read .env: a token or local database name must not end up in a file people share
      envDir: false,
      define: { 'import.meta.env.VITE_STARDOG_ENDPOINT': JSON.stringify('http://localhost:5820') },
      publicDir: false,
      build: { outDir: 'dist-single', assetsInlineLimit: () => true, cssCodeSplit: false },
    }
  }

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
