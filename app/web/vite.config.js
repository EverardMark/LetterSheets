import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ─── Development API switch ──────────────────────────────────────────────
// Flip DEV_MODE to retarget EVERY API request across the whole app:
//   true  → local server   (LOCAL_API)
//   false → remote server  (REMOTE_API)
// The value is baked in at build/dev time, so restart Vite (`npm run dev`)
// or rebuild (`npm run build`) after changing it.
const DEV_MODE = false
const LOCAL_API = 'http://localhost:8080'
const REMOTE_API = 'https://api.lettersheets.com'

// An explicit VITE_API_BASE wins over the switch above.
//
// DEPLOY.md §4 documents building with `VITE_API_BASE=https://erp.example.com
// npm run electron:build`, but the `define` block below replaces every
// reference to that variable with whatever this constant holds — so before
// this line the documented command silently did nothing and every build
// shipped pointing at REMOTE_API. Reading the environment first makes the
// runbook true, and leaves DEV_MODE as the local convenience it was meant
// to be.
// `??`, not `||`, so an explicitly EMPTY VITE_API_BASE is honoured. That is the
// setting for the hosted site, where nginx serves the SPA and proxies /api/ from
// the same origin: a relative path then works over both https://api.lettersheets.com
// and the plain-HTTP default server, where a baked-in absolute https:// URL would
// instead be a cross-origin request. Unset still means REMOTE_API, which is what
// the Electron build needs — it loads from file:// and has no origin to be
// relative to.
const API_BASE = process.env.VITE_API_BASE ?? (DEV_MODE ? LOCAL_API : REMOTE_API)
// ─────────────────────────────────────────────────────────────────────────

// Inject a Content-Security-Policy into the PRODUCTION build only (so Vite's dev
// HMR, which needs inline/eval scripts, keeps working). script-src is locked to
// 'self'; the web-font CDNs the app injects at runtime are allowlisted.
function cspPlugin() {
  const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:",
    "img-src 'self' data: https:",
    "connect-src 'self' https: http:",
  ].join('; ')
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '</title>',
        `</title>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`
      )
    },
  }
}

export default defineConfig({
  plugins: [react(), cspPlugin()],
  base: './',
  // Bake the chosen API base into every `import.meta.env.VITE_API_BASE`
  // reference so the DEV_MODE switch above controls all API calls app-wide.
  define: {
    'import.meta.env.VITE_API_BASE': JSON.stringify(API_BASE),
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8080'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
})
