import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const MOBILE_UA_REGEX =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile Safari/i

// Mobile App dev port 優先讀環境變數，否則用預設 5174
// 若 mobile-app Vite 被迫改 port，可在 .env.local 設定 MOBILE_APP_PORT=5176
const MOBILE_APP_DEV_PORT = parseInt(process.env.MOBILE_APP_PORT || '5174', 10)

/**
 * Vite Plugin：開發環境手機 UA 偵測，自動重導至 Mobile App dev server
 * 生產環境不作用（由 Express middleware 處理）
 */
function mobileRedirectPlugin() {
  return {
    name: 'mobile-redirect-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // 只處理 GET 頁面請求，跳過 Vite HMR / 靜態資源
        if (req.method !== 'GET') return next()
        if (req.url.startsWith('/@')) return next()        // Vite 內部路徑
        if (req.url.startsWith('/__')) return next()       // Vite 內部路徑
        if (req.url.startsWith('/node_modules')) return next()
        if (req.url.startsWith('/api')) return next()

        const ua = req.headers['user-agent'] || ''
        if (!MOBILE_UA_REGEX.test(ua)) return next()

        const host = (req.headers.host || 'localhost').split(':')[0]
        const redirectUrl = `http://${host}:${MOBILE_APP_DEV_PORT}${req.url || '/'}`
        console.log(`📱 [MobileRedirect] Dev → ${redirectUrl}`)
        res.writeHead(302, { Location: redirectUrl })
        res.end()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const envDir = resolve(__dirname, '..')
  const env = loadEnv(mode, envDir, '')
  const apiTarget = `http://127.0.0.1:${env.PORT || '3005'}`
  // Production is always served behind the same reverse proxy as the API.
  // Keeping the compiled client origin-neutral prevents a validation build,
  // restored host, or future domain change from silently calling production.
  const clientApiBaseUrl = mode === 'production' ? '' : (env.VITE_API_BASE_URL || '')
  const clientSocketUrl = mode === 'production' ? '' : (env.VITE_SOCKET_URL || '')

  return {
  envDir,
  base: './',
  plugins: [react(), mobileRedirectPlugin()],
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString().split('T')[0]),
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(clientApiBaseUrl),
    'import.meta.env.VITE_SOCKET_URL': JSON.stringify(clientSocketUrl),
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  server: {
    host: true, // Allow LAN access (0.0.0.0)
    allowedHosts: 'all', // Allow connections from any host
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      // Keep Scripture Explorer on the same browser origin in development so
      // the existing session/local storage login token remains available.
      '/scripture-tools': {
        target: 'http://127.0.0.1:5186',
        changeOrigin: true,
      },
      '/xit-worker': {
        target: 'http://127.0.0.1:3105',
        changeOrigin: true,
      },
      '/socket.io': {
        target: apiTarget,
        changeOrigin: true,
        ws: true
      },
      '/uploads': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/images/bible_knowledge': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/assets/lexicon': {
        target: apiTarget,
        changeOrigin: true,
      }
    },
    watch: {
      ignored: ['**/dist/**', '**/mobile-app/dist/**']
    }
  }
  }
})
