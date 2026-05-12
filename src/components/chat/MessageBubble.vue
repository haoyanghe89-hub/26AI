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

const { t } = useI18n()
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
    <!-- Avatar -->
    <div class="avatar">{{ message.role === 'user' ? t('message.you') : 'T1' }}</div>

    <div class="message-bubble">
      <!-- 元信息条：仅 AI 消息且非编辑态显示 -->
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

        <!-- AI 消息操作栏 -->
        <div v-if="message.role === 'assistant' && hasRenderableContent" class="message-actions">
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

        <!-- 用户消息操作栏 -->
        <div v-if="message.role === 'user'" class="message-actions user-actions">
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
  border-bottom: 1px solid rgba(23, 32, 26, 0.06);
  border-radius: 10px 10px 0 0;
  background: rgba(248, 251, 247, 0.6);
}

.message-meta-bar.user-meta {
  justify-content: flex-end;
  background: rgba(23, 32, 26, 0.02);
  border-bottom-color: rgba(23, 32, 26, 0.04);
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
  color: #2d5848;
  background: rgba(52, 96, 78, 0.12);
}

.meta-template {
  color: #5a5f32;
  background: rgba(79, 93, 58, 0.12);
}

.meta-workflow {
  color: #2f5a4c;
  background: rgba(47, 90, 76, 0.12);
}

.meta-inference {
  color: #7a6234;
  background: rgba(122, 98, 52, 0.1);
}

.meta-model {
  color: #66706a;
  background: rgba(23, 32, 26, 0.06);
}

/* ========================================================
   2. 思考动画
   ======================================================== */
.thinking {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 8px 0 0;
  color: #8a918b;
  font-size: 13px;
}

.thinking-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #8a918b;
  animation: thinkingPulse 1.4s infinite ease-in-out both;
}

.thinking-dot:nth-child(1) {
  animation-delay: -0.32s;
}
.thinking-dot:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes thinkingPulse {
  0%,
  80%,
  100% {
    transform: scale(0.6);
    opacity: 0.4;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

/* ========================================================
   3. 复制与 Markdown 渲染功能（保留）
   ======================================================== */

.user-actions {
  text-align: right;
  border-top: 1px dashed rgba(23, 32, 26, 0.08);
  margin-top: 6px;
  padding-top: 6px;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.message-row.user:hover .user-actions {
  opacity: 1;
}

.stop-button {
  --el-button-bg-color: #4f5d3a !important;
  --el-button-border-color: #4f5d3a !important;
  --el-button-hover-bg-color: #5f6f48 !important;
  --el-button-hover-border-color: #5f6f48 !important;
  --el-button-active-bg-color: #435033 !important;
  --el-button-active-border-color: #435033 !important;
}

.inline-edit-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.inline-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

:deep(.inline-edit-input .el-textarea__inner) {
  background: linear-gradient(180deg, #f8faf7 0%, #f2f6f3 100%);
  border-color: rgba(52, 96, 78, 0.18);
  border-radius: 10px;
  color: #17201a;
  transition:
    border-color 0.22s ease,
    box-shadow 0.22s ease;
}

:deep(.inline-edit-input .el-textarea__inner:focus) {
  border-color: rgba(52, 96, 78, 0.45);
  box-shadow: 0 0 0 3px rgba(52, 96, 78, 0.1);
}

.inline-cancel-btn {
  --el-button-bg-color: #ffffff;
  --el-button-border-color: rgba(52, 96, 78, 0.22);
  --el-button-hover-bg-color: #eef4ef;
  --el-button-hover-border-color: #34604e;
  --el-button-active-bg-color: #dcebe2;
  --el-button-active-border-color: #2d5848;
  --el-button-text-color: #34604e;
  --el-button-hover-text-color: #2d5848;
}

.inline-send-btn {
  --el-button-bg-color: #34604e;
  --el-button-border-color: #34604e;
  --el-button-hover-bg-color: #3d6f5b;
  --el-button-hover-border-color: #3d6f5b;
  --el-button-active-bg-color: #2d5848;
  --el-button-active-border-color: #2d5848;
  --el-button-disabled-bg-color: #d9e8df;
  --el-button-disabled-border-color: #d9e8df;
  --el-button-disabled-text-color: #7a9788;
  --el-button-text-color: #f8fbf7;
  --el-button-hover-text-color: #f8fbf7;
}
</style>
