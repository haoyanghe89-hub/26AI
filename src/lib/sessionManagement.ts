import type { ChatSession, MessageContent } from '../stores/chat'

const SUMMARY_TRANSCRIPT_MAX_CHARS = 18000
const TAGS_TRANSCRIPT_MAX_CHARS = 12000

export function normalizeTags(value: string | string[]) {
  const rawTags = Array.isArray(value) ? value : value.split(/[,，\s]+/)
  return Array.from(
    new Set(
      rawTags
        .map((tag) => tag.trim())
        .filter(Boolean)
        .map((tag) => tag.slice(0, 24)),
    ),
  ).slice(0, 12)
}

export function sessionMatchesQuery(session: ChatSession, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true

  const haystack = [
    session.title,
    session.tags?.join(' ') || '',
    session.summary?.content || '',
    ...session.messages.map((message) => messageContentText(message.content)),
  ]
    .join('\n')
    .toLowerCase()

  return haystack.includes(normalizedQuery)
}

export function exportSessionsJson(sessions: ChatSession[]) {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      sessions,
    },
    null,
    2,
  )
}

export function exportSessionMarkdown(session: ChatSession) {
  const tags = session.tags?.length ? `\nTags: ${session.tags.join(', ')}` : ''
  const header = `# ${session.title}\n\nCreated: ${session.createdAt}\nUpdated: ${session.updatedAt}${tags}\n`
  const summary = session.summary?.content
    ? `\n## Smart Summary · ${session.summary.updatedAt}\n\n${session.summary.content.trim()}\n`
    : ''
  const body = session.messages
    .map((message) => {
      const speaker = message.role === 'user' ? 'User' : 'Assistant'
      const text = messageContentText(message.content).trim()
      const attachments = message.attachments?.length
        ? `\n\nAttachments:\n${message.attachments.map((file) => `- ${file.name} (${file.kind}, ${file.size} bytes)`).join('\n')}`
        : ''
      return `\n## ${speaker} · ${message.createdAt}\n\n${text || '[非文本内容]'}${attachments}\n`
    })
    .join('\n')

  return `${header}${summary}${body}`
}

export function buildSessionTagsPrompt(session: ChatSession) {
  const transcript = session.messages
    .filter((message) => messageContentText(message.content).trim())
    .map((message) => {
      const speaker = message.role === 'user' ? '用户' : '助手'
      return `${speaker}: ${messageContentText(message.content).trim()}`
    })
    .join('\n\n')
    .slice(-TAGS_TRANSCRIPT_MAX_CHARS)

  if (!transcript.trim()) return ''

  return [
    '请根据下面会话内容，生成 2～4 个用于侧边栏分类与检索的短标签（每个不超过 8 个字，使用中文）。',
    '只输出一行：多个标签用英文逗号分隔。不要序号、不要引号、不要解释或多余文字。',
    '',
    `会话标题：${session.title}`,
    '会话内容：',
    transcript,
  ].join('\n')
}

/** 无模型或模型失败时，用标题与首条用户消息生成占位标签 */
export function buildHeuristicSessionTags(session: ChatSession): string[] {
  const title =
    session.title && session.title !== '新的会话' ? session.title.replace(/\s*\.\.\.\s*$/, '').trim() : ''
  const firstUser = session.messages.find((m) => m.role === 'user')
  const userText = firstUser ? messageContentText(firstUser.content).replace(/\s+/g, ' ').trim() : ''
  const parts: string[] = []
  if (title) parts.push(title.slice(0, 12))
  if (userText) {
    const slice = userText.slice(0, 18)
    const tPrefix = title.slice(0, Math.min(4, title.length))
    if (!title || !tPrefix || !slice.includes(tPrefix)) parts.push(slice)
  }
  return normalizeTags(parts.join(',')).slice(0, 4)
}

/** 从模型返回的一行或多行文本中解析标签 */
export function parseAutoSessionTagsResponse(raw: string) {
  let s = raw.trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```\s*$/, '')
  }
  s = s.trim().replace(/^(标签|Tags?)[：:]\s*/i, '')

  const lines = s
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length) return []

  let best: string[] = []
  for (const line of lines) {
    const stripped = line
      .replace(/^\d+[.)、]\s*/, '')
      .replace(/^[•\-*]\s*/, '')
      .replace(/，/g, ',')
    const normalized = normalizeTags(stripped)
    if (normalized.length > best.length) best = normalized
  }
  if (best.length) return best.slice(0, 12)

  return normalizeTags(s.replace(/，/g, ',')).slice(0, 12)
}

export function buildSessionSummaryPrompt(session: ChatSession) {
  const transcript = session.messages
    .filter((message) => messageContentText(message.content).trim())
    .map((message) => {
      const speaker = message.role === 'user' ? '用户' : '助手'
      return `${speaker}: ${messageContentText(message.content).trim()}`
    })
    .join('\n\n')
    .slice(-SUMMARY_TRANSCRIPT_MAX_CHARS)

  if (!transcript.trim()) return ''

  return [
    '请为下面这段会话生成一个面向后续回顾的中文智能总结。',
    '要求：',
    '1. 先用一句话概括本次会话核心。',
    '2. 用 3-5 个短要点列出关键结论、待办或用户偏好。',
    '3. 保留对后续继续对话有帮助的决策、文件名、技术栈和约束。',
    '4. 不要复述无关寒暄，不要编造会话里没有的信息。',
    '',
    `会话标题：${session.title}`,
    '会话内容：',
    transcript,
  ].join('\n')
}

function messageContentText(content: MessageContent) {
  if (typeof content === 'string') return content
  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
}
