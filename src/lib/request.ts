export interface RetryOptions {
  retries?: number
  baseDelayMs?: number
}

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

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
