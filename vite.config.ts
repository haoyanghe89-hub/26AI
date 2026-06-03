import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { spawn, type ChildProcess } from 'node:child_process'

function agentBackendPlugin(env: Record<string, string>) {
  let backend: ChildProcess | undefined
  const backendPort = env.AGENT_BACKEND_PORT || '8787'
  const backendHost = env.AGENT_BACKEND_HOST || '127.0.0.1'

  return {
    name: 'twentys1x-agent-backend',
    configureServer() {
      if (process.env.VITEST) return
      if (process.env.AGENT_BACKEND === 'false') return

      backend = spawn('node', ['server/index.mjs'], {
        stdio: 'inherit',
        env: {
          ...process.env,
          ...env,
          PORT: backendPort,
          HOST: backendHost,
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendPort = env.AGENT_BACKEND_PORT || '8787'
  const backendHost = env.AGENT_BACKEND_HOST || '127.0.0.1'

  return {
    plugins: [vue(), agentBackendPlugin(env)],
    esbuild: {
      drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
    },
    test: {
      environment: 'jsdom',
      exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**', 'data/**'],
      globals: true,
    },
    server: {
      proxy: {
        '/api': {
          target: `http://${backendHost}:${backendPort}`,
          changeOrigin: true,
          xfwd: true,
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
  }
})
