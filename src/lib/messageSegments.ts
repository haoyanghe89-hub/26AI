import DOMPurify from 'dompurify'
import { messagePreviewContent, type MessageContent } from '../stores/chat'

export interface MessageSegment {
  type: 'text' | 'code'
  content: string
  language?: string
  index?: number
}

export function parseMessageSegments(content: MessageContent): MessageSegment[] {
  if (!content) return []
  const text = typeof content === 'string' || Array.isArray(content) ? messagePreviewContent(content) : ''
  const segments: MessageSegment[] = []

  const regex = /```([a-zA-Z0-9+#-]*)[ \t]*\n([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let codeIndex = 0

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const textPart = text.substring(lastIndex, match.index).trim()
      if (textPart) segments.push({ type: 'text', content: formatMessageText(textPart) })
    }

    segments.push({
      type: 'code',
      language: match[1] || 'text',
      content: match[2].trimEnd(),
      index: codeIndex,
    })
    codeIndex += 1
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    appendRemainingText(text.substring(lastIndex), segments, codeIndex)
  }

  return segments
}

export function formatMessageText(text: string) {
  let html = text
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/^---$/gm, '<hr>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')

  html = html.replace(/\n{3,}/g, '\n\n')
  html = html.replace(/\n*(<h[1-6]>|<hr>)/g, '$1')
  html = html.replace(/(<\/h[1-6]>|<hr>)\n*/g, '$1')
  return DOMPurify.sanitize(html)
}

function appendRemainingText(text: string, segments: MessageSegment[], codeIndex: number) {
  const unfinishedRegex = /```([a-zA-Z0-9+#-]*)[ \t]*\n([\s\S]*)$/
  const unfinishedMatch = unfinishedRegex.exec(text)

  if (!unfinishedMatch) {
    const textPart = text.trim()
    if (textPart) segments.push({ type: 'text', content: formatMessageText(textPart) })
    return
  }

  if (unfinishedMatch.index > 0) {
    const textPart = text.substring(0, unfinishedMatch.index).trim()
    if (textPart) segments.push({ type: 'text', content: formatMessageText(textPart) })
  }

  segments.push({
    type: 'code',
    language: unfinishedMatch[1] || 'text',
    content: unfinishedMatch[2],
    index: codeIndex,
  })
}
