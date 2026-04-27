<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { Delete, Paperclip, Plus, Promotion } from '@element-plus/icons-vue'
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
  nextTick(() => {
    apiKeyInputEl.value?.focus()
  })
}

function selectModel(value: string) {
  chat.setModel(value)
  nextTick(() => {
    modelSelectEl.value?.blur()
  })
}

async function handleFiles(event: Event) {
  const target = event.target as HTMLInputElement
  await chat.prepareFiles(Array.from(target.files || []))
  target.value = ''
}

async function submit() {
  const sent = await chat.sendMessage(input.value)
  if (sent) {
    input.value = ''
    scrollToBottom()
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
          <el-select
            :model-value="chat.selectedProviderId"
            filterable
            popper-class="military-green-select-dropdown"
            @change="selectProvider"
          >
            <el-option
              v-for="provider in chat.providers"
              :key="provider.id"
              :label="provider.name"
              :value="provider.id"
            />
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
            @change="selectModel"
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
            <div v-if="message.attachments?.length" class="attachment-list compact">
              <el-tag v-for="file in message.attachments" :key="file.id" size="small" effect="plain">
                {{ file.name }}
              </el-tag>
            </div>
            <p>{{ messagePreviewContent(message.content) || (chat.isSending && message.role === 'assistant' ? '思考中...' : '') }}</p>
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
            v-model="input"
            type="textarea"
            resize="vertical"
            :autosize="{ minRows: 1, maxRows: 6 }"
            :placeholder="`向 ${chat.selectedProvider.name} 提问...`"
            @keydown.enter="handleEnter"
          />
          <el-button class="send-button" type="primary" :icon="Promotion" :disabled="!canSend" @click="submit">
            发送
          </el-button>
          <input ref="fileInputEl" class="file-input" type="file" multiple @change="handleFiles" />
        </div>
      </section>
    </main>
  </div>
</template>
