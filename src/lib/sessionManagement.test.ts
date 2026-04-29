import { describe, expect, it } from 'vitest'
import {
  buildHeuristicSessionTags,
  buildSessionSummaryPrompt,
  buildSessionTagsPrompt,
  exportSessionMarkdown,
  exportSessionsJson,
  normalizeTags,
  parseAutoSessionTagsResponse,
  sessionMatchesQuery,
} from './sessionManagement'
import type { ChatSession } from '../stores/chat'

const session: ChatSession = {
  id: 's1',
  title: 'Vue 性能优化',
  tags: ['前端', '性能'],
  summary: {
    content: '本次讨论确定用虚拟滚动优化长列表。',
    updatedAt: '2026-04-28T01:30:00.000Z',
  },
  createdAt: '2026-04-28T00:00:00.000Z',
  updatedAt: '2026-04-28T01:00:00.000Z',
  messages: [
    {
      id: 'm1',
      role: 'user',
      content: '如何优化长列表？',
      createdAt: '2026-04-28T00:01:00.000Z',
    },
    {
      id: 'm2',
      role: 'assistant',
      content: '可以使用虚拟滚动。',
      createdAt: '2026-04-28T00:02:00.000Z',
    },
  ],
}

describe('sessionManagement', () => {
  it('normalizes duplicate and oversized tags', () => {
    expect(normalizeTags(' 前端, 性能，前端 very-long-tag-name-over-limit ')).toEqual([
      '前端',
      '性能',
      'very-long-tag-name-over-',
    ])
  })

  it('matches sessions by title, tags, and message body', () => {
    expect(sessionMatchesQuery(session, 'vue')).toBe(true)
    expect(sessionMatchesQuery(session, '性能')).toBe(true)
    expect(sessionMatchesQuery(session, '虚拟滚动')).toBe(true)
    expect(sessionMatchesQuery(session, '本次讨论')).toBe(true)
    expect(sessionMatchesQuery(session, '不存在')).toBe(false)
  })

  it('exports sessions to portable json', () => {
    const data = JSON.parse(exportSessionsJson([session]))
    expect(data.version).toBe(1)
    expect(data.sessions[0].id).toBe('s1')
  })

  it('exports a readable markdown transcript', () => {
    const markdown = exportSessionMarkdown(session)
    expect(markdown).toContain('# Vue 性能优化')
    expect(markdown).toContain('Tags: 前端, 性能')
    expect(markdown).toContain('## Smart Summary')
    expect(markdown).toContain('本次讨论确定用虚拟滚动优化长列表。')
    expect(markdown).toContain('## User')
    expect(markdown).toContain('如何优化长列表？')
  })

  it('builds a focused smart summary prompt from the transcript', () => {
    const prompt = buildSessionSummaryPrompt(session)
    expect(prompt).toContain('请为下面这段会话生成一个面向后续回顾的中文智能总结。')
    expect(prompt).toContain('会话标题：Vue 性能优化')
    expect(prompt).toContain('用户: 如何优化长列表？')
    expect(prompt).toContain('助手: 可以使用虚拟滚动。')
    expect(prompt).toContain('不要编造会话里没有的信息')
  })

  it('builds a session tags prompt and parses model output', () => {
    const prompt = buildSessionTagsPrompt(session)
    expect(prompt).toContain('生成 2～4 个')
    expect(prompt).toContain('会话标题：Vue 性能优化')
    expect(prompt).toContain('用户: 如何优化长列表？')
    expect(parseAutoSessionTagsResponse('前端, 性能优化, Vue')).toEqual(['前端', '性能优化', 'Vue'])
    expect(parseAutoSessionTagsResponse('```\n标签：Go, 并发\n```')).toEqual(['Go', '并发'])
    expect(parseAutoSessionTagsResponse('说明文字无逗号\nVue, 性能')).toEqual(['Vue', '性能'])
  })

  it('builds heuristic tags from title and first user message', () => {
    const s: ChatSession = {
      id: 's2',
      title: '推荐一些书',
      tags: [],
      createdAt: '2026-04-29T00:00:00.000Z',
      updatedAt: '2026-04-29T00:00:00.000Z',
      messages: [
        {
          id: 'u1',
          role: 'user',
          content: '推荐一些适合通勤的科幻小说',
          createdAt: '2026-04-29T00:01:00.000Z',
        },
      ],
    }
    expect(buildHeuristicSessionTags(s).length).toBeGreaterThan(0)
  })
})
