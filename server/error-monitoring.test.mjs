import { describe, expect, it } from 'vitest'
import { errorMonitoringTestUtils, normalizeClientErrorReport } from './error-monitoring.mjs'

describe('server error monitoring', () => {
  it('normalizes and redacts browser fallback reports before logging or forwarding', () => {
    const payload = normalizeClientErrorReport({
      message: 'request failed for sk-1234567890abcdef',
      source: 'window',
      info: 'Authorization: Bearer abc.def',
      stack: 'at run apiKey: super-secret',
      url: 'https://example.test/?apiKey=super-secret',
      userAgent: 'Vitest',
    })

    expect(payload.message).toBe('request failed for [redacted-api-key]')
    expect(payload.info).toBe('Authorization: Bearer [redacted-token]')
    expect(payload.stack).toContain('apiKey=[redacted]')
    expect(payload.url).toContain('apiKey=[redacted]')
  })

  it('uses the same sample-rate guard as the browser client', () => {
    expect(errorMonitoringTestUtils.parseSampleRate('')).toBe(0)
    expect(errorMonitoringTestUtils.parseSampleRate('not-a-number')).toBe(0)
    expect(errorMonitoringTestUtils.parseSampleRate('0.5')).toBe(0.5)
    expect(errorMonitoringTestUtils.parseSampleRate('3')).toBe(1)
  })
})
