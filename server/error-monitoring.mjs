import * as Sentry from '@sentry/node'

let sentryEnabled = false

export function initServerErrorMonitoring() {
  const dsn = process.env.SENTRY_DSN?.trim()
  if (!dsn) return false

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE),
    beforeSend(event) {
      return scrubSentryEvent(event)
    },
  })

  sentryEnabled = true
  return true
}

export function captureServerError(error, context = {}) {
  if (!sentryEnabled) return

  Sentry.withScope((scope) => {
    scope.setTag('source', context.source || 'server')
    if (context.route) scope.setTag('route', context.route)
    if (context.status) scope.setTag('status', String(context.status))
    Sentry.captureException(toSafeError(error))
  })
}

export function captureClientErrorReport(body) {
  const payload = normalizeClientErrorReport(body)
  if (!sentryEnabled) return payload

  Sentry.withScope((scope) => {
    scope.setTag('source', payload.source)
    scope.setTag('client_report', 'true')
    if (payload.component) scope.setTag('component', payload.component)
    if (payload.info) scope.setExtra('info', payload.info)
    scope.setExtra('url', payload.url)
    scope.setExtra('userAgent', payload.userAgent)
    Sentry.captureException(toSafeError(payload.message, payload.stack))
  })

  return payload
}

export function normalizeClientErrorReport(body) {
  return {
    message: scrubSensitiveText(String(body?.message || 'Unknown client error')).slice(0, 800),
    source: String(body?.source || 'client').slice(0, 80),
    component: body?.component ? String(body.component).slice(0, 120) : '',
    info: body?.info ? scrubSensitiveText(String(body.info)).slice(0, 200) : '',
    stack: body?.stack ? scrubSensitiveText(String(body.stack)).slice(0, 4000) : '',
    url: body?.url ? scrubSensitiveText(String(body.url)).slice(0, 500) : '',
    userAgent: body?.userAgent ? String(body.userAgent).slice(0, 300) : '',
    createdAt: body?.createdAt ? String(body.createdAt).slice(0, 80) : new Date().toISOString(),
  }
}

export function scrubSensitiveText(value) {
  return value
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, '[redacted-api-key]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted-token]')
    .replace(/api[_-]?key["'\s:=]+[A-Za-z0-9._-]+/gi, 'apiKey=[redacted]')
}

export function parseSampleRate(value) {
  if (!value) return 0

  const sampleRate = Number(value)
  if (!Number.isFinite(sampleRate)) return 0
  return Math.min(Math.max(sampleRate, 0), 1)
}

function toSafeError(error, stack) {
  if (error instanceof Error) {
    const safeError = new Error(scrubSensitiveText(error.message))
    safeError.name = error.name
    safeError.stack = error.stack ? scrubSensitiveText(error.stack) : undefined
    return safeError
  }

  const safeError = new Error(scrubSensitiveText(String(error || 'Unknown server error')))
  safeError.stack = stack ? scrubSensitiveText(stack) : safeError.stack
  return safeError
}

function scrubSentryEvent(event) {
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

function scrubRecord(value) {
  if (!value || typeof value !== 'object') return value

  if (Array.isArray(value)) return value.map(scrubRecord)

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      typeof entry === 'string' ? scrubSensitiveText(entry) : scrubRecord(entry),
    ]),
  )
}

export const errorMonitoringTestUtils = {
  parseSampleRate,
  scrubSensitiveText,
  scrubSentryEvent,
  toSafeError,
}
