<script setup lang="ts">
import {
  Check,
  CopyDocument,
  Document,
  Edit,
  Headset,
  MagicStick,
  Picture,
  RefreshRight,
  User,
  VideoCamera,
} from '@element-plus/icons-vue'
import ElButton from 'element-plus/es/components/button/index.mjs'
import ElIcon from 'element-plus/es/components/icon/index.mjs'
import ElInput from 'element-plus/es/components/input/index.mjs'
import ElTag from 'element-plus/es/components/tag/index.mjs'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { parseMessageSegments } from '../../lib/messageSegments'
import { type ChatAttachment, type ChatMessage } from '../../stores/chat'
import CodeBlock from './CodeBlock.vue'
import PlanPanel from './PlanPanel.vue'
import ToolCallLogs from './ToolCallLogs.vue'

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

const { t, locale } = useI18n()
const renderedContent = computed(() => {
  if (hasContent(props.message.content)) return props.message.content
  if (props.message.role === 'assistant' && !props.isSending) return t('message.emptyResponse')
  return props.message.content
})
const messageSegments = computed(() => parseMessageSegments(renderedContent.value))
const hasRenderableContent = computed(() => messageSegments.value.length > 0)

/** 当前消息的元信息 */
const meta = computed(() => props.message.meta)
const hasMeta = computed(() => Boolean(meta.value))

/** 推理模式标签 */
const inferenceLabel = computed(() => {
  const mode = meta.value?.inferenceMode
  if (mode === 'local') return t('message.local')
  if (mode === 'auto') return t('message.hybrid')
  return ''
})
const messageTimestamp = computed(() =>
  new Intl.DateTimeFormat(locale.value, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(props.message.createdAt)),
)

function hasContent(content: ChatMessage['content']) {
  if (typeof content === 'string') return content.trim().length > 0
  return content.some((part) => part.type === 'text' && part.text.trim().length > 0)
}

function handleInlineEnter(event: Event | KeyboardEvent) {
  if (!(event instanceof KeyboardEvent)) return
  if (event.shiftKey) return
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
    <div class="avatar">{{ message.role === 'user' ? t('message.you') : '专' }}</div>

    <div class="message-bubble" :class="{ 'is-inline-editing': isEditing }">
      <!-- 元信息条：仅助手消息且非编辑态显示 -->
      <div v-if="message.role === 'assistant' && !isEditing && hasMeta" class="message-meta-bar">
        <div class="meta-left">
          <span v-if="meta?.agentName" class="meta-badge meta-agent">
            <el-icon><User /></el-icon>
            {{ meta.agentName }}
          </span>
          <span v-if="meta?.templateName" class="meta-badge meta-template">
            <el-icon><MagicStick /></el-icon>
            {{ meta.templateName }}
          </span>
          <span v-if="meta?.workflowName" class="meta-badge meta-workflow">
            <el-icon><MagicStick /></el-icon>
            {{ meta.workflowName }}
          </span>
        </div>
        <div class="meta-right">
          <span v-if="inferenceLabel" class="meta-badge meta-inference">
            {{ inferenceLabel }}
          </span>
          <span v-if="meta?.providerName && meta?.model" class="meta-badge meta-model">
            {{ meta.providerName }} · {{ meta.model }}
          </span>
        </div>
      </div>

      <!-- 用户消息的模板指示器 -->
      <div
        v-if="message.role === 'user' && !isEditing && meta?.templateName"
        class="message-meta-bar user-meta"
      >
        <span class="meta-badge meta-template">
          <el-icon><MagicStick /></el-icon>
          {{ t('message.template', { name: meta.templateName }) }}
        </span>
      </div>

      <!-- 自主规划面板 -->
      <PlanPanel v-if="message.plan" :plan="message.plan" :is-sending="isSending" />

      <!-- 工具调用日志 -->
      <ToolCallLogs v-if="message.toolLogs?.length" :logs="message.toolLogs" />

      <!-- 附件列表 -->
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

      <!-- 内联编辑态 -->
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
            <el-button class="inline-cancel-btn" size="small" @click="emit('cancel-inline-edit')">{{
              t('common.cancel')
            }}</el-button>
            <el-button
              class="inline-send-btn"
              type="primary"
              size="small"
              :disabled="isSending || !editingContent.trim()"
              @click="emit('submit-inline-edit')"
            >
              {{ t('common.send') }}
            </el-button>
          </div>
        </div>
      </template>

      <!-- 正常展示态 -->
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

        <!-- 思考中 / 流式生成中 -->
        <p v-if="isSending && message.role === 'assistant' && !hasRenderableContent" class="thinking">
          <span class="thinking-dot"></span>
          <span class="thinking-dot"></span>
          <span class="thinking-dot"></span>
        </p>

        <!-- 助手消息操作栏 -->
        <div v-if="message.role === 'assistant' && hasRenderableContent" class="message-actions">
          <span class="message-timestamp" :title="message.createdAt">{{ messageTimestamp }}</span>
          <div class="message-action-buttons">
            <el-button
              :icon="RefreshRight"
              size="small"
              text
              :disabled="isSending"
              :aria-label="t('message.regenerate')"
              @click="emit('regenerate-message', message.id)"
            >
              {{ t('message.regenerate') }}
            </el-button>
            <el-button
              :icon="copiedMessageId === message.id ? Check : CopyDocument"
              size="small"
              text
              @click="emit('copy-message', message.id, message.content)"
            >
              {{ copiedMessageId === message.id ? t('common.copied') : t('message.copyReply') }}
            </el-button>
          </div>
        </div>

        <!-- 用户消息操作栏 -->
        <div v-if="message.role === 'user'" class="message-actions user-actions">
          <span class="message-timestamp" :title="message.createdAt">{{ messageTimestamp }}</span>
          <div class="message-action-buttons">
            <el-button
              :icon="copiedMessageId === message.id ? Check : CopyDocument"
              size="small"
              text
              @click="emit('copy-message', message.id, message.content)"
            >
              {{ copiedMessageId === message.id ? t('common.copied') : t('common.copy') }}
            </el-button>
            <el-button :icon="Edit" size="small" text @click="emit('start-inline-edit', message)">{{
              t('message.editAgain')
            }}</el-button>
          </div>
        </div>
      </template>
    </div>
  </article>
</template>

<style scoped>
/* ========================================================
   1. 元信息条
   ======================================================== */
.message-meta-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin: -6px -6px 10px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(59, 47, 41, 0.06);
  border-radius: 10px 10px 0 0;
  background: rgba(255, 250, 243, 0.6);
}

.message-meta-bar.user-meta {
  justify-content: flex-end;
  background: rgba(59, 47, 41, 0.02);
  border-bottom-color: rgba(59, 47, 41, 0.04);
}

.meta-left,
.meta-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.meta-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 750;
  line-height: 1.4;
  white-space: nowrap;
}

.meta-badge .el-icon {
  font-size: 12px;
}

.meta-agent {
  color: #a9582f;
  background: rgba(217, 130, 75, 0.12);
}

.meta-template {
  color: #8a6b38;
  background: rgba(217, 130, 75, 0.12);
}

.meta-workflow {
  color: #a9582f;
  background: rgba(169, 88, 47, 0.12);
}

.meta-inference {
  color: #7a6234;
  background: rgba(122, 98, 52, 0.1);
}

.meta-model {
  color: #8b6950;
  background: rgba(59, 47, 41, 0.06);
}

/* ========================================================
   2. 思考动画
   ======================================================== */
.thinking {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 10px 0 0;
}

.thinking-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(217, 130, 75, 0.78);
  animation: thinkingPulse 1.28s infinite ease-in-out both;
}

.thinking-dot:nth-child(1) {
  animation-delay: -0.24s;
}

.thinking-dot:nth-child(2) {
  animation-delay: -0.12s;
}

@keyframes thinkingPulse {
  0%,
  80%,
  100% {
    transform: translateY(0) scale(0.72);
    opacity: 0.35;
  }
  40% {
    transform: translateY(-1px) scale(1);
    opacity: 1;
  }
}

.message-timestamp {
  color: rgba(102, 112, 106, 0.92);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.message-action-buttons {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}

.inline-edit-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.inline-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

:deep(.inline-edit-input .el-textarea__inner) {
  min-height: 128px;
  border-radius: 14px;
  border-color: rgba(217, 130, 75, 0.18);
  background: linear-gradient(180deg, rgba(255, 252, 247, 0.98), rgba(255, 240, 220, 0.96));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.78);
  color: #3b2f29;
  transition:
    border-color 0.22s ease,
    box-shadow 0.22s ease;
}

:deep(.inline-edit-input .el-textarea__inner:focus) {
  border-color: rgba(217, 130, 75, 0.4);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.82),
    0 0 0 4px rgba(217, 130, 75, 0.08);
}

.inline-cancel-btn {
  --el-button-bg-color: rgba(255, 255, 255, 0.9);
  --el-button-border-color: rgba(217, 130, 75, 0.2);
  --el-button-hover-bg-color: #fff0dc;
  --el-button-hover-border-color: #d9824b;
  --el-button-active-bg-color: #ffead0;
  --el-button-active-border-color: #a9582f;
  --el-button-text-color: #d9824b;
  --el-button-hover-text-color: #a9582f;
}

.inline-send-btn {
  --el-button-bg-color: #d9824b;
  --el-button-border-color: #d9824b;
  --el-button-hover-bg-color: #c96f3a;
  --el-button-hover-border-color: #c96f3a;
  --el-button-active-bg-color: #a9582f;
  --el-button-active-border-color: #a9582f;
  --el-button-disabled-bg-color: #f2d8ba;
  --el-button-disabled-border-color: #f2d8ba;
  --el-button-disabled-text-color: #b48767;
  --el-button-text-color: #fffaf3;
  --el-button-hover-text-color: #fffaf3;
}
</style>
