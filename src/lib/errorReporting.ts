import type { App } from 'vue'
import type { Router } from 'vue-router'
import * as Sentry from '@sentry/vue'

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

interface ErrorContext {
  source: string
  component?: string
  info?: string
}

let sentryEnabled = false

export function installErrorReporting(app: App, router?: Router) {
  sentryEnabled = initializeSentry(app, router)

  app.config.errorHandler = (error, instance, info) => {
    captureExternalError(error, {
      source: 'vue',
      component: instance?.$?.type?.name,
      info,
    })
    void reportClientError(error, {
      source: 'vue',
      component: instance?.$?.type?.name,
      info,
    })
  }

  window.addEventListener('error', (event) => {
    captureExternalError(event.error || event.message, { source: 'window' })
    void reportClientError(event.error || event.message, { source: 'window' })
  })

  window.addEventListener('unhandledrejection', (event) => {
    captureExternalError(event.reason, { source: 'unhandledrejection' })
    void reportClientError(event.reason, { source: 'unhandledrejection' })
  })
}

function initializeSentry(app: App, router?: Router) {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim()
  if (!dsn) return false

  Sentry.init({
    app,
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    tracesSampleRate: parseSampleRate(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE),
    integrations: router ? [Sentry.browserTracingIntegration({ router })] : [],
    beforeSend(event) {
      return scrubSentryEvent(event)
    },
  })

  return true
}

function captureExternalError(error: unknown, context: ErrorContext) {
  if (!sentryEnabled) return

  Sentry.withScope((scope) => {
    scope.setTag('source', context.source)
    if (context.component) scope.setTag('component', context.component)
    if (context.info) scope.setExtra('info', context.info)
    Sentry.captureException(toSafeError(error))
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

function toSafeError(error: unknown) {
  if (error instanceof Error) {
    const safeError = new Error(scrubSensitiveText(error.message))
    safeError.name = error.name
    safeError.stack = error.stack ? scrubSensitiveText(error.stack) : undefined
    return safeError
  }

  return new Error(scrubSensitiveText(String(error || 'Unknown client error')))
}

function parseSampleRate(value: string | undefined) {
  if (!value) return 0

  const sampleRate = Number(value)
  if (!Number.isFinite(sampleRate)) return 0
  return Math.min(Math.max(sampleRate, 0), 1)
}

function scrubSentryEvent(event: Sentry.ErrorEvent) {
  if (event.message) event.message = scrubSensitiveText(event.message)

  event.exception?.values?.forEach((exception) => {
    if (exception.value) exception.value = scrubSensitiveText(exception.value)
    exception.stacktrace?.frames?.forEach((frame) => {
      if (frame.filename) frame.filename = scrubSensitiveText(frame.filename)
      if (frame.function) frame.function = scrubSensitiveText(frame.function)
      if (frame.context_line) frame.context_line = scrubSensitiveText(frame.context_line)
      frame.pre_context = frame.pre_context?.map(scrubSensitiveText)
      frame.post_context = frame.post_context?.map(scrubSensitiveText)
      frame.vars = scrubRecord(frame.vars)
    })
  })

  event.request = scrubRecord(event.request)
  event.extra = scrubRecord(event.extra)
  event.contexts = scrubRecord(event.contexts)
  event.tags = scrubRecord(event.tags)

  return event
}

function scrubRecord<T>(value: T): T {
  if (!value || typeof value !== 'object') return value

  if (Array.isArray(value)) {
    return value.map(scrubRecord) as T
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      typeof entry === 'string' ? scrubSensitiveText(entry) : scrubRecord(entry),
    ]),
  ) as T
}

export const errorReportingTestUtils = {
  normalizeError,
  parseSampleRate,
  scrubSensitiveText,
  scrubSentryEvent,
  toSafeError,
}
