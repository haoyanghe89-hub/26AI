<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { Delete, Paperclip, Plus, Promotion, CopyDocument, Check, Edit, CircleClose } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs'
import ElAlert from 'element-plus/es/components/alert/index.mjs'
import ElButton from 'element-plus/es/components/button/index.mjs'
import ElIcon from 'element-plus/es/components/icon/index.mjs'
import ElInput from 'element-plus/es/components/input/index.mjs'
import ElSelect, { ElOption } from 'element-plus/es/components/select/index.mjs'
import ElTag from 'element-plus/es/components/tag/index.mjs'
import { messagePreviewContent, type ProviderId, useChatStore } from '../stores/chat'

const chat = useChatStore()
const input = ref('')
const messagesEl = ref<HTMLElement | null>(null)
const fileInputEl = ref<HTMLInputElement | null>(null)
const apiKeyInputEl = ref<InstanceType<typeof ElInput> | null>(null)
const modelSelectEl = ref<InstanceType<typeof ElSelect> | null>(null)
const composerInputEl = ref<InstanceType<typeof ElInput> | null>(null)

const copiedMessageId = ref<string | null>(null)
const copiedCodeBlock = ref<{ id: string; index: number } | null>(null)

// 气泡内联编辑状态
const editingMessageId = ref<string | null>(null)
const editingContent = ref('')

const canSend = computed(() => {
  return chat.isProviderReady && !chat.isSending && (input.value.trim() || chat.pendingFiles.length)
})

function formatSessionTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function scrollToBottom() {
  nextTick(() => {
    const el = messagesEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function pickFiles() {
  fileInputEl.value?.click()
}

function selectSession(id: string) {
  chat.setActiveSession(id)
  scrollToBottom()
}

function selectProvider(value: string) {
  chat.setProvider(value as ProviderId)
  nextTick(() => apiKeyInputEl.value?.focus())
}

function selectModel(value: string) {
  chat.setModel(value)
  nextTick(() => modelSelectEl.value?.blur())
}

async function handleFiles(event: Event) {
  const target = event.target as HTMLInputElement
  await chat.prepareFiles(Array.from(target.files || []))
  target.value = ''
}

async function submit() {
  const content = input.value
  input.value = '' // 点击发送后立即清空输入框
  scrollToBottom() // 立即滚动到底部以显示用户刚发出的消息
  
  const sent = await chat.sendMessage(content)
  if (sent) {
    scrollToBottom()
  } else {
    // 如果发送失败拦截，则恢复输入的内容
    input.value = content
  }
}

function handleEnter(event: Event | KeyboardEvent) {
  if (event instanceof KeyboardEvent && event.shiftKey) return
  event.preventDefault()
  submit()
}

async function confirmClear() {
  await ElMessageBox.confirm('清空后会创建一个新的空会话，历史记录将从本地浏览器移除。', '清空历史', {
    confirmButtonText: '清空',
    cancelButtonText: '取消',
    type: 'warning',
  })
  chat.clearAllSessions()
}

// ==================== 停止生成功能 ====================
function stopGeneration() {
  // 规避 TypeScript 检查：如果 store 中实现了 stop 方法则调用
  const store = chat as any
  if (typeof store.stop === 'function') {
    store.stop()
  }
}

// ==================== 气泡内联编辑功能 ====================
function startInlineEdit(message: any) {
  // 1. 点击重新编辑时，相当于触发停止模型
  stopGeneration()
  
  // 2. 开启当前气泡的编辑模式
  editingMessageId.value = message.id
  editingContent.value = typeof message.content === 'string' ? message.content : messagePreviewContent(message.content)
}

function cancelInlineEdit() {
  editingMessageId.value = null
  editingContent.value = ''
}

async function submitInlineEdit() {
  const content = editingContent.value
  cancelInlineEdit()
  
  scrollToBottom()
  const sent = await chat.sendMessage(content)
  if (sent) {
    scrollToBottom()
  }
}

// ==================== 复制与 Markdown 渲染功能 ====================

async function copyMessage(messageId: string, content: any) {
  const textToCopy = typeof content === 'string' ? content : messagePreviewContent(content)
  try {
    await navigator.clipboard.writeText(textToCopy)
    copiedMessageId.value = messageId
    setTimeout(() => (copiedMessageId.value = null), 2000)
  } catch (err) {
    console.error('复制失败', err)
  }
}

async function copyCodeBlock(messageId: string, code: string, blockIndex: number) {
  try {
    await navigator.clipboard.writeText(code)
    copiedCodeBlock.value = { id: messageId, index: blockIndex }
    setTimeout(() => (copiedCodeBlock.value = null), 2000)
  } catch (err) {
    console.error('复制代码失败', err)
  }
}

/**
 * 将长消息智能切割为 普通文本段 和 代码段
 * 以便穿插渲染并修复直接显示 Markdown 标记的问题
 */
function parseMessageSegments(content: any) {
  if (!content) return []
  const text = typeof content === 'string' ? content : messagePreviewContent(content)
  const segments: Array<{ type: 'text' | 'code'; content: string; language?: string; index?: number }> = []
  
  // 匹配被三个反引号包裹的代码块
  const regex = /```([a-zA-Z0-9+#\-]*)[ \t]*\n([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let codeIndex = 0
  
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      // 提取代码块之前的文本时，使用 trim() 彻底去除多余的尾随换行符，避免留白
      const textPart = text.substring(lastIndex, match.index).trim()
      if (textPart) {
        segments.push({
          type: 'text',
          content: formatText(textPart)
        })
      }
    }
    segments.push({
      type: 'code',
      language: match[1] || 'text',
      content: match[2].trimEnd(),
      index: codeIndex++
    })
    lastIndex = regex.lastIndex
  }
  
  // 处理剩余文本（包含流式输出打字机导致尚未闭合的结尾代码块）
  if (lastIndex < text.length) {
    const remaining = text.substring(lastIndex)
    const unfinishedRegex = /```([a-zA-Z0-9+#\-]*)[ \t]*\n([\s\S]*)$/
    const unfinishedMatch = unfinishedRegex.exec(remaining)
    
    if (unfinishedMatch) {
       if (unfinishedMatch.index > 0) {
          const textPart = remaining.substring(0, unfinishedMatch.index).trim()
          if (textPart) {
            segments.push({
              type: 'text',
              content: formatText(textPart)
            })
          }
       }
       segments.push({
         type: 'code',
         language: unfinishedMatch[1] || 'text',
         content: unfinishedMatch[2],
         index: codeIndex++
       })
    } else {
       const textPart = remaining.trim()
       if (textPart) {
         segments.push({
           type: 'text',
           content: formatText(textPart)
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
    .replace(/^---$/gm, '<hr>') // 增加分隔线支持
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>') // 内联代码支持

  // 1. 把内容里超过两个的连续换行压缩成两个（代表一个正常的段落空行）
  res = res.replace(/\n{3,}/g, '\n\n')
  
  // 2. 彻底清除块级元素前后的换行符
  // 因为 css 设置了 white-space: pre-wrap，如果 h1-6/hr 旁边有换行符，
  // 会被浏览器强制渲染成额外的空白行，这是导致排版过于稀松的罪魁祸首。
  res = res.replace(/\n*(<h[1-6]>|<hr>)/g, '$1')
  res = res.replace(/(<\/h[1-6]>|<hr>)\n*/g, '$1')
  
  return res
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="logo-mark">T1</div>
        <div>
          <strong>Twentys1x</strong>
          <span>AI Studio</span>
        </div>
      </div>

      <el-button class="new-chat" type="primary" :icon="Plus" @click="chat.newSession">新会话</el-button>

      <nav class="sessions" aria-label="历史会话">
        <button
          v-for="session in chat.sessions"
          :key="session.id"
          type="button"
          class="session-item"
          :class="{ active: session.id === chat.activeSessionId }"
          @click="selectSession(session.id)"
        >
          <span class="session-title">{{ session.title }}</span>
          <small>{{ formatSessionTime(session.updatedAt) }}</small>
          <el-icon class="delete-session" title="删除会话" @click.stop="chat.deleteSession(session.id)">
            <Delete />
          </el-icon>
        </button>
      </nav>

      <div class="settings-panel">
        <label>
          <span>AI 供应商</span>
          <el-select :model-value="chat.selectedProviderId" filterable popper-class="military-green-select-dropdown" @change="selectProvider">
            <el-option v-for="provider in chat.providers" :key="provider.id" :label="provider.name" :value="provider.id" />
          </el-select>
        </label>
        <label>
          <span>{{ chat.selectedProvider.keyLabel }}</span>
          <el-input
            :key="chat.selectedProviderId"
            ref="apiKeyInputEl"
            :model-value="chat.apiKey"
            type="password"
            :placeholder="chat.selectedProvider.keyPlaceholder"
            show-password
            autocomplete="off"
            @update:model-value="chat.setApiKey"
          />
        </label>
        <label>
          <span>模型</span>
          <el-select
            ref="modelSelectEl"
            :model-value="chat.model"
            filterable
            allow-create
            default-first-option
            placeholder="选择或输入模型"
            popper-class="military-green-select-dropdown"
            @update:model-value="selectModel"
          >
            <el-option
              v-for="item in chat.currentModelOptions"
              :key="item.value"
              :label="item.hint ? `${item.label} · ${item.hint}` : item.label"
              :value="item.value"
            />
          </el-select>
        </label>
        <el-button plain @click="confirmClear">清空历史</el-button>
      </div>
    </aside>

    <main class="chat-area">
      <header class="topbar">
        <div>
          <p>当前会话</p>
          <h1>{{ chat.activeSession.title }}</h1>
        </div>
        <el-tag :type="chat.apiKey.trim() ? 'success' : 'warning'" round>
          {{ chat.isProviderReady ? `${chat.selectedProvider.name} 已就绪` : '等待 API Key' }}
        </el-tag>
      </header>

      <section ref="messagesEl" class="messages">
        <div v-if="!chat.visibleMessages.length" class="empty-state">
          <div class="empty-logo">T1</div>
          <h2>Twentys1x AI 工作台</h2>
          <p>选择 AI 供应商并粘贴对应 API Key 后，直接开始对话。支持文本附件和图片附件，历史会话会保存在本地浏览器。</p>
        </div>

        <article
          v-for="message in chat.visibleMessages"
          :key="message.id"
          class="message-row"
          :class="message.role"
        >
          <div class="avatar">{{ message.role === 'user' ? '你' : 'K' }}</div>
          <div class="message-bubble">
            <!-- 附件 -->
            <div v-if="message.attachments?.length" class="attachment-list compact">
              <el-tag v-for="file in message.attachments" :key="file.id" size="small" effect="plain">
                {{ file.name }}
              </el-tag>
            </div>

            <!-- 内联编辑模式 -->
            <template v-if="editingMessageId === message.id">
              <div class="inline-edit-box">
                <el-input
                  v-model="editingContent"
                  type="textarea"
                  resize="vertical"
                  :autosize="{ minRows: 2, maxRows: 10 }"
                  class="inline-edit-input"
                  @keydown.enter.exact.prevent="submitInlineEdit"
                />
                <div class="inline-edit-actions">
                  <el-button class="inline-cancel-btn" size="small" @click="cancelInlineEdit">取消</el-button>
                  <el-button 
                    class="inline-send-btn"
                    type="primary" 
                    size="small" 
                    :disabled="chat.isSending || !editingContent.trim()" 
                    @click="submitInlineEdit"
                  >
                    发送
                  </el-button>
                </div>
              </div>
            </template>

            <!-- 正常展示模式 -->
            <template v-else>
              <!-- 分段渲染文本和代码块（避免提取导致的行间错乱） -->
              <template v-for="(segment, idx) in parseMessageSegments(message.content)" :key="idx">
                <div v-if="segment.type === 'text'" class="message-content" v-html="segment.content"></div>
                
                <div v-else-if="segment.type === 'code'" class="code-block-wrapper">
                  <div class="code-header">
                    <span class="language">{{ segment.language }}</span>
                    <el-button
                      :icon="copiedCodeBlock?.id === message.id && copiedCodeBlock?.index === segment.index ? Check : CopyDocument"
                      size="small"
                      text
                      @click="copyCodeBlock(message.id, segment.content, segment.index!)"
                    >
                      {{ copiedCodeBlock?.id === message.id && copiedCodeBlock?.index === segment.index ? '已复制' : '复制代码' }}
                    </el-button>
                  </div>
                  <pre><code>{{ segment.content }}</code></pre>
                </div>
              </template>

              <!-- 思考中 -->
              <p v-if="chat.isSending && message.role === 'assistant' && !message.content" class="thinking">
                思考中...
              </p>

              <!-- 【复制整条回复】按钮 -->
              <div class="message-actions" v-if="message.role === 'assistant' && message.content">
                <el-button
                  :icon="copiedMessageId === message.id ? Check : CopyDocument"
                  size="small"
                  text
                  @click="copyMessage(message.id, message.content)"
                >
                  {{ copiedMessageId === message.id ? '已复制' : '复制回复' }}
                </el-button>
              </div>

              <!-- 【用户消息操作栏】复制 & 重新编辑 -->
              <div class="message-actions user-actions" v-if="message.role === 'user'">
                <el-button
                  :icon="copiedMessageId === message.id ? Check : CopyDocument"
                  size="small"
                  text
                  @click="copyMessage(message.id, message.content)"
                >
                  {{ copiedMessageId === message.id ? '已复制' : '复制' }}
                </el-button>
                <el-button
                  :icon="Edit"
                  size="small"
                  text
                  @click="startInlineEdit(message)"
                >
                  重新编辑
                </el-button>
              </div>
            </template>
          </div>
        </article>
      </section>

      <section class="composer-wrap">
        <el-alert v-if="chat.errorMessage" class="error-message" type="error" :closable="false" show-icon>
          {{ chat.errorMessage }}
        </el-alert>

        <div v-if="chat.pendingFiles.length" class="attachment-list">
          <el-tag
            v-for="file in chat.pendingFiles"
            :key="file.id"
            closable
            effect="plain"
            @close="chat.removePendingFile(file.id)"
          >
            {{ file.name }}
          </el-tag>
        </div>

        <div class="composer">
          <el-button class="icon-button" :icon="Paperclip" circle title="添加附件" @click="pickFiles" />
          <el-input
            ref="composerInputEl"
            v-model="input"
            type="textarea"
            resize="vertical"
            :autosize="{ minRows: 1, maxRows: 6 }"
            :placeholder="`向 ${chat.selectedProvider.name} 提问...`"
            @keydown.enter="handleEnter"
          />
          
          <!-- 发送/停止按钮动态切换 -->
          <el-button 
            v-if="!chat.isSending" 
            class="send-button" 
            type="primary" 
            :icon="Promotion" 
            :disabled="!canSend" 
            @click="submit"
          >
            发送
          </el-button>
          
          <el-button 
            v-else 
            class="send-button stop-button" 
            type="danger" 
            :icon="CircleClose" 
            @click="stopGeneration"
          >
            停止
          </el-button>

          <input ref="fileInputEl" class="file-input" type="file" multiple @change="handleFiles" />
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
/* ========================================================
   1. Markdown 消息展示排版 - 极度控制间距使其美观紧凑
   ======================================================== */
:deep(.message-content) {
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  color: #17201a;
  font-size: 14px;
}

:deep(.message-content h1), 
:deep(.message-content h2), 
:deep(.message-content h3) {
  margin: 1.2em 0 0.5em; /* 压缩自带块级标题边距 */
  font-weight: 700;
  color: #17201a;
  line-height: 1.35;
}

:deep(.message-content h1:first-child), 
:deep(.message-content h2:first-child), 
:deep(.message-content h3:first-child) {
  margin-top: 0;
}

:deep(.message-content hr) {
  border: none;
  border-top: 1px solid rgba(23, 32, 26, 0.12);
  margin: 1.2em 0; /* 控制分割线的留白 */
}

:deep(.message-content code) {
  background: rgba(23, 32, 26, 0.06);
  padding: 0.15em 0.35em;
  border-radius: 4px;
  font-family: ui-monospace, 'Cascadia Mono', 'Segoe UI Mono', monospace;
  font-size: 0.85em;
  color: #2d5848;
}

/* 降低列表的内部间距 */
:deep(.message-content ul),
:deep(.message-content ol) {
  padding-left: 1.5em;
  margin: 0.5em 0;
}

:deep(.message-content li) {
  margin: 0.25em 0;
}

/* ========================================================
   2. 修复代码块外层间隙与样式
   ======================================================== */
.code-block-wrapper {
  margin: 8px 0; /* 让代码块完美贴合上下文，不大出间距 */
  border: 1px solid rgba(23, 32, 26, 0.12);
  border-radius: 8px;
  overflow: hidden;
  background: #1e2621;
}

.code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.06);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 12px;
  font-weight: 600;
  color: #a3b5a8;
}

.language {
  font-family: ui-monospace, monospace;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* 彻底覆盖 Element Plus 按钮默认的高亮 hover 变量，适配暗色代码块头 */
:deep(.code-header .el-button) {
  --el-button-bg-color: transparent;
  --el-button-border-color: transparent;
  --el-button-hover-bg-color: rgba(255, 255, 255, 0.12);
  --el-button-hover-border-color: transparent;
  --el-button-active-bg-color: rgba(255, 255, 255, 0.2);
  --el-button-active-border-color: transparent;
  --el-button-text-color: #a3b5a8;
  --el-button-hover-text-color: #ffffff;
}

/* ========================================================
   3. 其余组件原有样式保持不变
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
  --el-button-bg-color: #8c4240 !important;
  --el-button-border-color: #8c4240 !important;
  --el-button-hover-bg-color: #a45350 !important;
  --el-button-hover-border-color: #a45350 !important;
  --el-button-active-bg-color: #723432 !important;
  --el-button-active-border-color: #723432 !important;
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
  background: #f8faf7;
  border-color: rgba(52, 96, 78, 0.2);
  border-radius: 6px;
  color: #17201a;
}

:deep(.inline-edit-input .el-textarea__inner:focus) {
  border-color: rgba(52, 96, 78, 0.5);
  box-shadow: 0 0 0 2px rgba(52, 96, 78, 0.1);
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