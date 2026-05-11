export interface RetryOptions {
  retries?: number
  baseDelayMs?: number
}

const AUTH_TOKEN_STORAGE_KEY = 'twentys1x:auth-token'

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

  return fetch(input, {
    ...init,
    headers,
  })
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
