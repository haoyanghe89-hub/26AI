import DOMPurify from 'dompurify'
import { marked } from 'marked'
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
  const html = marked.parse(text, { breaks: true, gfm: true }) as string
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
