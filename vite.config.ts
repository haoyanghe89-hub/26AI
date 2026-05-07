import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { spawn, type ChildProcess } from 'node:child_process'

const BACKEND_PORT = process.env.AGENT_BACKEND_PORT || '8787'
const BACKEND_HOST = process.env.AGENT_BACKEND_HOST || '127.0.0.1'

function agentBackendPlugin() {
  let backend: ChildProcess | undefined

  return {
    name: 'twentys1x-agent-backend',
    configureServer() {
      if (process.env.VITEST) return
      if (process.env.AGENT_BACKEND === 'false') return

      backend = spawn('node', ['server/index.mjs'], {
        stdio: 'inherit',
        env: {
          ...process.env,
          PORT: BACKEND_PORT,
          HOST: BACKEND_HOST,
        },
      })

      const stopBackend = () => {
        if (backend && !backend.killed) backend.kill()
      }

      process.once('exit', stopBackend)
      process.once('SIGINT', () => {
        stopBackend()
        process.exit(0)
      })
      process.once('SIGTERM', () => {
        stopBackend()
        process.exit(0)
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), agentBackendPlugin()],
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
  test: {
    environment: 'jsdom',
    exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**'],
    globals: true,
  },
  server: {
    proxy: {
      '/api': {
        target: `http://${BACKEND_HOST}:${BACKEND_PORT}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'element-plus': ['element-plus', '@element-plus/icons-vue'],
          vendor: ['vue', 'vue-router', 'pinia'],
        },
      },
    },
  },
})
