<script setup lang="ts">
import { Check, CopyDocument, Edit } from '@element-plus/icons-vue'
import DOMPurify from 'dompurify'
import ElButton from 'element-plus/es/components/button/index.mjs'
import ElInput from 'element-plus/es/components/input/index.mjs'
import ElTag from 'element-plus/es/components/tag/index.mjs'
import { messagePreviewContent, type ChatMessage } from '../../stores/chat'
import CodeBlock from './CodeBlock.vue'

defineProps<{
  message: ChatMessage
  isSending: boolean
  copiedMessageId: string | null
  copiedCodeBlock: { id: string; index: number } | null
  isEditing: boolean
  editingContent: string
}>()

const emit = defineEmits<{
  'update:editingContent': [value: string]
  'start-inline-edit': [message: ChatMessage]
  'cancel-inline-edit': []
  'submit-inline-edit': []
  'copy-message': [messageId: string, content: ChatMessage['content']]
  'copy-code-block': [messageId: string, code: string, blockIndex: number]
}>()

function parseMessageSegments(content: ChatMessage['content']) {
  if (!content) return []
  const text = typeof content === 'string' ? content : messagePreviewContent(content)
  const segments: Array<{ type: 'text' | 'code'; content: string; language?: string; index?: number }> = []

  const regex = /```([a-zA-Z0-9+#-]*)[ \t]*\n([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let codeIndex = 0

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const textPart = text.substring(lastIndex, match.index).trim()
      if (textPart) {
        segments.push({
          type: 'text',
          content: formatText(textPart),
        })
      }
    }
    segments.push({
      type: 'code',
      language: match[1] || 'text',
      content: match[2].trimEnd(),
      index: codeIndex++,
    })
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    const remaining = text.substring(lastIndex)
    const unfinishedRegex = /```([a-zA-Z0-9+#-]*)[ \t]*\n([\s\S]*)$/
    const unfinishedMatch = unfinishedRegex.exec(remaining)

    if (unfinishedMatch) {
      if (unfinishedMatch.index > 0) {
        const textPart = remaining.substring(0, unfinishedMatch.index).trim()
        if (textPart) {
          segments.push({
            type: 'text',
            content: formatText(textPart),
          })
        }
      }
      segments.push({
        type: 'code',
        language: unfinishedMatch[1] || 'text',
        content: unfinishedMatch[2],
        index: codeIndex,
      })
    } else {
      const textPart = remaining.trim()
      if (textPart) {
        segments.push({
          type: 'text',
          content: formatText(textPart),
        })
      }
    }
  }

  return segments
}

function formatText(text: string) {
  let res = text
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/^---$/gm, '<hr>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')

  res = res.replace(/\n{3,}/g, '\n\n')
  res = res.replace(/\n*(<h[1-6]>|<hr>)/g, '$1')
  res = res.replace(/(<\/h[1-6]>|<hr>)\n*/g, '$1')
  return DOMPurify.sanitize(res)
}
</script>

<template>
  <article class="message-row" :class="message.role">
    <div class="avatar">{{ message.role === 'user' ? '你' : 'T1' }}</div>
    <div class="message-bubble">
      <div v-if="message.attachments?.length" class="attachment-list compact">
        <el-tag v-for="file in message.attachments" :key="file.id" size="small" effect="plain">
          {{ file.name }}
        </el-tag>
      </div>

      <template v-if="isEditing">
        <div class="inline-edit-box">
          <el-input
            :model-value="editingContent"
            type="textarea"
            resize="vertical"
            :autosize="{ minRows: 2, maxRows: 10 }"
            class="inline-edit-input"
            @update:model-value="(value: string) => emit('update:editingContent', value)"
            @keydown.enter.exact.prevent="emit('submit-inline-edit')"
          />
          <div class="inline-edit-actions">
            <el-button class="inline-cancel-btn" size="small" @click="emit('cancel-inline-edit')"
              >取消</el-button
            >
            <el-button
              class="inline-send-btn"
              type="primary"
              size="small"
              :disabled="isSending || !editingContent.trim()"
              @click="emit('submit-inline-edit')"
            >
              发送
            </el-button>
          </div>
        </div>
      </template>

      <template v-else>
        <template v-for="(segment, idx) in parseMessageSegments(message.content)" :key="idx">
          <div v-if="segment.type === 'text'" class="message-content" v-html="segment.content"></div>

          <CodeBlock
            v-else-if="segment.type === 'code'"
            :message-id="message.id"
            :language="segment.language"
            :content="segment.content"
            :block-index="segment.index ?? 0"
            :copied="copiedCodeBlock?.id === message.id && copiedCodeBlock?.index === segment.index"
            @copy="
              (messageId: string, code: string, blockIndex: number) =>
                emit('copy-code-block', messageId, code, blockIndex)
            "
          />
        </template>

        <p v-if="isSending && message.role === 'assistant' && !message.content" class="thinking">思考中...</p>

        <div v-if="message.role === 'assistant' && message.content" class="message-actions">
          <el-button
            :icon="copiedMessageId === message.id ? Check : CopyDocument"
            size="small"
            text
            @click="emit('copy-message', message.id, message.content)"
          >
            {{ copiedMessageId === message.id ? '已复制' : '复制回复' }}
          </el-button>
        </div>

        <div v-if="message.role === 'user'" class="message-actions user-actions">
          <el-button
            :icon="copiedMessageId === message.id ? Check : CopyDocument"
            size="small"
            text
            @click="emit('copy-message', message.id, message.content)"
          >
            {{ copiedMessageId === message.id ? '已复制' : '复制' }}
          </el-button>
          <el-button :icon="Edit" size="small" text @click="emit('start-inline-edit', message)"
            >重新编辑</el-button
          >
        </div>
      </template>
    </div>
  </article>
</template>
