import type { ChatSession, MessageContent } from '../stores/chat'

const SUMMARY_TRANSCRIPT_MAX_CHARS = 18000

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

export function buildSessionSummaryPrompt(session: ChatSession) {
  const transcript = session.messages
    .filter((message) => message.content)
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
