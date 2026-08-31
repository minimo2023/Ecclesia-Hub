import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL('../../', import.meta.url))
  const env = loadEnv(mode, envDir, '')
  const apiTarget = `http://127.0.0.1:${env.PORT || '3005'}`
  // Production clients use the API on their own origin. This keeps the mobile
  // bundle deployable on an isolated validation host without reaching live data.
  const clientApiBaseUrl = mode === 'production' ? '' : (env.VITE_API_BASE_URL || '')
  const clientSocketUrl = mode === 'production' ? '' : (env.VITE_SOCKET_URL || '')

  return {
  envDir,
  plugins: [react()],
  define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(clientApiBaseUrl),
    'import.meta.env.VITE_SOCKET_URL': JSON.stringify(clientSocketUrl),
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    // 手機版會共用桌機版的 src。兩邊必須解析到同一份套件，
    // 否則會重複打包 React/Lucide，產物也會偏離生產版本。
    alias: {
      react: fileURLToPath(new URL('../../node_modules/react', import.meta.url)),
      'react-dom': fileURLToPath(new URL('../../node_modules/react-dom', import.meta.url)),
      'react-router-dom': fileURLToPath(new URL('../../node_modules/react-router-dom', import.meta.url)),
      'lucide-react': fileURLToPath(new URL('../../node_modules/lucide-react', import.meta.url)),
      axios: fileURLToPath(new URL('../../node_modules/axios', import.meta.url)),
    }
  },
  // 生產環境 build 需以 /m/ 為 base，讓靜態資源路徑正確
  base: mode === 'production' ? '/m/' : '/',
  build: {
    chunkSizeWarningLimit: 1500,
  },
  server: {
    host: true, // Allow LAN access for mobile testing
    port: 5174,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true
      },
      // Proxy the standalone Scripture Explorer through the mobile dev origin.
      // This preserves the authenticated mobile session during navigation.
      '/scripture-tools': {
        target: 'http://127.0.0.1:5186',
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
      '/audio': {
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
    }
  }
  }
})
