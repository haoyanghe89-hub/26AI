import type { App } from 'vue'

interface ClientErrorPayload {
  message: string
  stack?: string
  source: string
  component?: string
  info?: string
  url: string
  userAgent: string
  createdAt: string
}

export function installErrorReporting(app: App) {
  app.config.errorHandler = (error, instance, info) => {
    void reportClientError(error, {
      source: 'vue',
      component: instance?.$?.type?.name,
      info,
    })
  }

  window.addEventListener('error', (event) => {
    void reportClientError(event.error || event.message, { source: 'window' })
  })

  window.addEventListener('unhandledrejection', (event) => {
    void reportClientError(event.reason, { source: 'unhandledrejection' })
  })
}

async function reportClientError(error: unknown, context: Partial<ClientErrorPayload>) {
  if (import.meta.env.DEV) {
    console.error(error)
  }

  const payload = normalizeError(error, context)

  try {
    const response = await fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    })
    if (!response.ok && !import.meta.env.DEV) {
      console.warn(`Client error reporting failed: ${response.status}`)
    }
  } catch {
    // Error reporting must never interrupt the user flow.
  }
}

function normalizeError(error: unknown, context: Partial<ClientErrorPayload>): ClientErrorPayload {
  const value = error instanceof Error ? error : new Error(String(error || 'Unknown client error'))

  return {
    message: scrubSensitiveText(value.message).slice(0, 800),
    stack: value.stack ? scrubSensitiveText(value.stack).slice(0, 4000) : undefined,
    source: context.source || 'client',
    component: context.component,
    info: context.info,
    url: window.location.href,
    userAgent: navigator.userAgent,
    createdAt: new Date().toISOString(),
  }
}

function scrubSensitiveText(value: string) {
  return value
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, '[redacted-api-key]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted-token]')
    .replace(/api[_-]?key["'\s:=]+[A-Za-z0-9._-]+/gi, 'apiKey=[redacted]')
}
