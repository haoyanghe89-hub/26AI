import { describe, expect, it } from 'vitest'
import { formatMessageText, parseMessageSegments } from './messageSegments'

describe('messageSegments', () => {
  it('splits text and fenced code blocks with stable code indexes', () => {
    const segments = parseMessageSegments(
      '说明\n```ts\nconst value = 1\n```\n继续\n```json\n{"ok":true}\n```',
    )

    expect(segments).toEqual([
      { type: 'text', content: '说明' },
      { type: 'code', language: 'ts', content: 'const value = 1', index: 0 },
      { type: 'text', content: '继续' },
      { type: 'code', language: 'json', content: '{"ok":true}', index: 1 },
    ])
  })

  it('keeps unfinished fenced code blocks renderable while streaming', () => {
    const segments = parseMessageSegments('前文\n```vue\n<template>\n  <div>')

    expect(segments).toEqual([
      { type: 'text', content: '前文' },
      { type: 'code', language: 'vue', content: '<template>\n  <div>', index: 0 },
    ])
  })

  it('formats compact markdown text', () => {
    expect(formatMessageText('# 标题\n\n**重点** 和 `code`')).toBe(
      '<h1>标题</h1><strong>重点</strong> 和 <code>code</code>',
    )
  })

  it('sanitizes dangerous html before v-html rendering', () => {
    const html = formatMessageText('<img src=x onerror=alert(1)><script>alert(2)</script>**ok**')

    expect(html).not.toContain('onerror')
    expect(html).not.toContain('<script>')
    expect(html).toContain('<strong>ok</strong>')
  })
})
