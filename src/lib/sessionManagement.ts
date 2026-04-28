import type { ChatSession, MessageContent } from '../stores/chat'

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

  return `${header}${body}`
}

function messageContentText(content: MessageContent) {
  if (typeof content === 'string') return content
  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
}
