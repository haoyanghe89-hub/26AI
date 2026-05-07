<script setup lang="ts">
import {
  Check,
  CopyDocument,
  Document,
  Edit,
  Headset,
  Picture,
  RefreshRight,
  VideoCamera,
} from '@element-plus/icons-vue'
import ElButton from 'element-plus/es/components/button/index.mjs'
import ElIcon from 'element-plus/es/components/icon/index.mjs'
import ElInput from 'element-plus/es/components/input/index.mjs'
import ElTag from 'element-plus/es/components/tag/index.mjs'
import { computed } from 'vue'
import { parseMessageSegments } from '../../lib/messageSegments'
import { type ChatAttachment, type ChatMessage } from '../../stores/chat'
import CodeBlock from './CodeBlock.vue'

const props = defineProps<{
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
  'regenerate-message': [messageId: string]
  'open-attachment': [attachment: ChatAttachment]
}>()

const renderedContent = computed(() => {
  if (hasContent(props.message.content)) return props.message.content
  if (props.message.role === 'assistant' && !props.isSending) return '没有收到有效回复。'
  return props.message.content
})
const messageSegments = computed(() => parseMessageSegments(renderedContent.value))
const hasRenderableContent = computed(() => messageSegments.value.length > 0)

function hasContent(content: ChatMessage['content']) {
  if (typeof content === 'string') return content.trim().length > 0
  return content.some((part) => part.type === 'text' && part.text.trim().length > 0)
}

function handleInlineEnter(event: Event | KeyboardEvent) {
  if (!(event instanceof KeyboardEvent)) return
  if (event.shiftKey) return
  // 中文输入法选词阶段按回车不应触发提交
  if (event.isComposing || event.keyCode === 229 || event.key === 'Process') return
  event.preventDefault()
  emit('submit-inline-edit')
}

function attachmentIcon(kind: ChatAttachment['kind']) {
  if (kind === 'image') return Picture
  if (kind === 'audio') return Headset
  if (kind === 'video') return VideoCamera
  return Document
}

function canPreviewAttachment(file: ChatAttachment) {
  return Boolean(file.dataUrl) && file.kind !== 'text'
}
</script>

<template>
  <article class="message-row" :class="message.role">
    <div class="avatar">{{ message.role === 'user' ? '你' : 'T1' }}</div>
    <div class="message-bubble">
      <div v-if="message.attachments?.length" class="attachment-list compact">
        <el-tag
          v-for="file in message.attachments"
          :key="file.id"
          size="small"
          effect="plain"
          :class="{ 'is-clickable': canPreviewAttachment(file) }"
          @click="canPreviewAttachment(file) && emit('open-attachment', file)"
        >
          <el-icon><component :is="attachmentIcon(file.kind)" /></el-icon>
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
            @keydown.enter="handleInlineEnter"
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
        <template v-for="(segment, idx) in messageSegments" :key="idx">
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

        <p v-if="isSending && message.role === 'assistant' && !hasRenderableContent" class="thinking">
          思考中...
        </p>

        <div v-if="message.role === 'assistant' && hasRenderableContent" class="message-actions">
          <el-button
            :icon="RefreshRight"
            size="small"
            text
            :disabled="isSending"
            aria-label="重新回复"
            @click="emit('regenerate-message', message.id)"
          >
            重新回复
          </el-button>
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
