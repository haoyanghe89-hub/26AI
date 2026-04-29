import { describe, expect, it } from 'vitest'
import { errorReportingTestUtils } from './errorReporting'

describe('errorReporting', () => {
  it('redacts secrets from client error payloads', () => {
    const payload = errorReportingTestUtils.normalizeError(
      new Error('failed with sk-1234567890abcdef and Bearer abc.def'),
      { source: 'vue', component: 'ChatView' },
    )

    expect(payload.message).toContain('[redacted-api-key]')
    expect(payload.message).toContain('Bearer [redacted-token]')
    expect(payload.message).not.toContain('sk-1234567890abcdef')
    expect(payload.component).toBe('ChatView')
  })

  it('clamps Sentry trace sample rates to a safe range', () => {
    expect(errorReportingTestUtils.parseSampleRate(undefined)).toBe(0)
    expect(errorReportingTestUtils.parseSampleRate('oops')).toBe(0)
    expect(errorReportingTestUtils.parseSampleRate('-0.5')).toBe(0)
    expect(errorReportingTestUtils.parseSampleRate('0.25')).toBe(0.25)
    expect(errorReportingTestUtils.parseSampleRate('2')).toBe(1)
  })

  it('scrubs nested Sentry event metadata before external upload', () => {
    const event = errorReportingTestUtils.scrubSentryEvent({
      message: 'apiKey: sk-1234567890abcdef',
      extra: {
        auth: 'Bearer token.value',
      },
      exception: {
        values: [
          {
            value: 'sk-1234567890abcdef',
            stacktrace: {
              frames: [{ context_line: 'const apiKey = "secret-value"' }],
            },
          },
        ],
      },
    } as unknown as Parameters<typeof errorReportingTestUtils.scrubSentryEvent>[0])

    expect(JSON.stringify(event)).not.toContain('sk-1234567890abcdef')
    expect(JSON.stringify(event)).not.toContain('Bearer token.value')
    expect(JSON.stringify(event)).toContain('[redacted-api-key]')
    expect(JSON.stringify(event)).toContain('Bearer [redacted-token]')
  })
})
