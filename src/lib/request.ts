export interface RetryOptions {
  retries?: number
  baseDelayMs?: number
}

const AUTH_TOKEN_STORAGE_KEY = 'twentys1x:auth-token'
const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL)

export async function requestWithRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? 2
  const baseDelayMs = options.baseDelayMs ?? 300

  try {
    return await fn()
  } catch (error) {
    if (retries <= 0) throw error
    await delay(baseDelayMs * 2 ** (options.retries ?? 0))
    return requestWithRetry(fn, { retries: retries - 1, baseDelayMs })
  }
}

export function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || ''
  const headers = new Headers(init.headers)
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)

  return fetch(apiUrl(input), {
    ...init,
    headers,
  })
}

export function apiUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (!API_BASE_URL) return input
  if (typeof input !== 'string') return input
  if (!input.startsWith('/api/')) return input
  return `${API_BASE_URL}${input}`
}

function normalizeApiBaseUrl(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\/$/, '')
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
