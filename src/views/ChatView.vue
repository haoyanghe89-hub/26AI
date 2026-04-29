<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import DOMPurify from 'dompurify'
import {
  Delete,
  Download,
  Expand,
  Paperclip,
  Plus,
  Promotion,
  Edit,
  CircleClose,
  FolderAdd,
  Files,
  Close,
  Fold,
  Search,
  MagicStick,
  ArrowDown,
  ArrowUp,
  MoreFilled,
  CopyDocument,
  Check,
} from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs'
import ElAlert from 'element-plus/es/components/alert/index.mjs'
import ElButton from 'element-plus/es/components/button/index.mjs'
import ElDialog from 'element-plus/es/components/dialog/index.mjs'
import ElIcon from 'element-plus/es/components/icon/index.mjs'
import ElInput from 'element-plus/es/components/input/index.mjs'
import ElTag from 'element-plus/es/components/tag/index.mjs'
import ElTree from 'element-plus/es/components/tree/index.mjs'
import Prism from 'prismjs'
import 'prismjs/components/prism-clike'
import 'prismjs/components/prism-markup'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-scss'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-diff'
import MessageBubble from '../components/chat/MessageBubble.vue'
import PromptLabPanel from '../components/chat/PromptLabPanel.vue'
import SessionItem from '../components/chat/SessionItem.vue'
import SettingsPanel from '../components/chat/SettingsPanel.vue'
import { useResizablePanels } from '../composables/useResizablePanels'
import {
  exportSessionMarkdown,
  exportSessionsJson,
  normalizeTags,
  sessionMatchesQuery,
} from '../lib/sessionManagement'
import { messagePreviewContent, type ProviderId, useChatStore } from '../stores/chat'

const chat = useChatStore()
const input = ref('')
const appShellEl = ref<HTMLElement | null>(null)
const messagesEl = ref<HTMLElement | null>(null)
const fileInputEl = ref<HTMLInputElement | null>(null)
const projectInputEl = ref<HTMLInputElement | null>(null)
const copiedMessageId = ref<string | null>(null)
const copiedCodeBlock = ref<{ id: string; index: number } | null>(null)
const isWorkspaceCollapsed = ref(true)
const isEditingFile = ref(false)
const storedSessionManagerCollapsed = localStorage.getItem('twentys1x:session-manager-collapsed')
const isSessionManagerCollapsed = ref(storedSessionManagerCollapsed === 'true')
const isSummaryDialogVisible = ref(false)
const summaryDraft = ref('')
const copiedSummary = ref(false)
const sessionSearchQuery = ref('')
const activeSessionTag = ref('')

// 气泡内联编辑状态
const editingMessageId = ref<string | null>(null)
const editingContent = ref('')

const canSend = computed(() => {
  return chat.isProviderReady && !chat.isSending && (input.value.trim() || chat.pendingFiles.length)
})

// === 修改：优化无项目状态的显示文案 ===
const activeProjectLabel = computed(() => chat.activeProject?.name || '普通对话')
const activeProjectObjectLabel = computed(() =>
  chat.activeProject ? `${chat.activeProject.name} (${chat.activeProject.id})` : '无项目关联',
)
const filteredSessions = computed(() =>
  chat.sessions.filter((session) => {
    const matchesTag = !activeSessionTag.value || session.tags?.includes(activeSessionTag.value)
    return matchesTag && sessionMatchesQuery(session, sessionSearchQuery.value)
  }),
)
const activeSessionTagsText = computed({
  get: () => chat.activeSession.tags?.join(', ') || '',
  set: (value: string) => chat.setSessionTags(chat.activeSession.id, normalizeTags(value)),
})
const canSummarizeActiveSession = computed(
  () => chat.activeSession.messages.length > 1 && chat.isProviderReady,
)

const activeFileLanguage = computed(() => detectPrismLanguage(chat.activeFilePath))
const activeFilePreviewLines = computed(() => {
  const lines = String(chat.activeFileContent || '').split('\n')
  return lines.map((line, index) => ({
    number: index + 1,
    html: highlightCode(line, activeFileLanguage.value) || '&nbsp;',
  }))
})
const highlightedActiveFileDiff = computed(() => highlightCode(chat.activeFileDiff || '', 'diff'))
const canToggleCodePreview = computed(() => Boolean(chat.activeFilePath))
const {
  appShellStyle,
  isDraggingPanels,
  isCodePreviewVisible,
  setCodePreviewVisible,
  toggleCodePreview,
  startResize,
  clampPanelWidths,
} = useResizablePanels(appShellEl, (visible) => {
  if (!visible) isEditingFile.value = false
})
const appShellViewStyle = computed(() => ({
  ...appShellStyle.value,
  '--workspace-width': isWorkspaceCollapsed.value ? '0px' : appShellStyle.value['--workspace-width'],
  '--workspace-handle-width': isWorkspaceCollapsed.value ? '0px' : '8px',
}))

onMounted(() => {
  chat.hydrateClientState()
  chat.refreshProviderServerConfig()
  chat.refreshProjects()
})

function scrollToBottom() {
  nextTick(() => {
    const el = messagesEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function pickFiles() {
  fileInputEl.value?.click()
}

function pickProjectFolder() {
  projectInputEl.value?.click()
}

function clearSessionFilters() {
  sessionSearchQuery.value = ''
  activeSessionTag.value = ''
}

function selectSession(id: string) {
  chat.setActiveSession(id)
  scrollToBottom()
}

function selectProvider(value: string) {
  chat.setProvider(value as ProviderId)
}

function selectModel(value: string) {
  chat.setModel(value)
}

async function handleFiles(event: Event) {
  const target = event.target as HTMLInputElement
  await chat.prepareFiles(Array.from(target.files || []))
  target.value = ''
}

async function handleProjectFolder(event: Event) {
  const target = event.target as HTMLInputElement
  await chat.importProjectFolder(Array.from(target.files || []))
  target.value = ''
}

async function analyzeProject() {
  const analyzed = await chat.analyzeActiveProject()
  if (analyzed) scrollToBottom()
}

async function handleTreeNodeClick(node: any) {
  if (node.isDirectory) return
  isEditingFile.value = false
  setCodePreviewVisible(true)
  await chat.loadProjectFile(node.path)
  clampPanelWidths()
}

async function previewAndApplyFileWrite() {
  const diff = await chat.previewActiveFileDiff()
  if (!diff) return

  await ElMessageBox.confirm(`<pre class="diff-confirm">${escapeHtml(diff)}</pre>`, '确认应用修改', {
    confirmButtonText: '应用修改',
    cancelButtonText: '取消',
    dangerouslyUseHTMLString: true,
    customClass: 'military-dialog military-dialog--diff',
  })

  const applied = await chat.applyActiveFileWrite()
  if (applied) isEditingFile.value = false
}

function cancelFileEdit() {
  chat.editedFileContent = chat.activeFileContent
  chat.activeFileDiff = ''
  isEditingFile.value = false
}

async function confirmDeleteProject(projectId: string, projectName: string) {
  await ElMessageBox.confirm(
    `<div class="military-dialog-content"><p>删除后会移除本地导入副本与索引。</p><p class="emphasis">当前操作对象：${escapeHtml(projectName)}（${escapeHtml(projectId)}）</p></div>`,
    '删除项目',
    {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      dangerouslyUseHTMLString: true,
      customClass: 'military-dialog military-dialog--danger',
    },
  )
  await chat.deleteProject(projectId)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
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

function applyPromptTemplate(value: string) {
  input.value = value
  nextTick(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>('.composer textarea')
    textarea?.focus()
  })
}

async function runPromptWorkflow(workflowId: string, workflowInput?: string) {
  const content = (workflowInput ?? input.value).trim()
  if (!content) return
  if (!workflowInput) input.value = ''
  scrollToBottom()
  const ran = await chat.runPromptWorkflow(workflowId, content)
  if (ran) {
    scrollToBottom()
  } else if (!workflowInput) {
    input.value = content
  }
}

function savePromptTemplate(value: Parameters<typeof chat.savePromptTemplate>[0]) {
  chat.savePromptTemplate(value)
}

function saveCustomAgent(value: Parameters<typeof chat.saveCustomAgent>[0]) {
  const agent = chat.saveCustomAgent(value)
  chat.setActiveAgent(agent.id)
}

function savePromptWorkflow(value: Parameters<typeof chat.savePromptWorkflow>[0]) {
  chat.savePromptWorkflow(value)
}

function handleEnter(event: Event | KeyboardEvent) {
  if (event instanceof KeyboardEvent && event.shiftKey) return
  event.preventDefault()
  submit()
}

async function confirmClear() {
  await ElMessageBox.confirm(
    `<div class="military-dialog-content"><p>清空后会创建一个新的空会话。</p><p>历史记录将从本地浏览器移除。</p><p class="emphasis">当前操作对象：${activeProjectObjectLabel.value}</p></div>`,
    '清空历史',
    {
      confirmButtonText: '清空',
      cancelButtonText: '取消',
      dangerouslyUseHTMLString: true,
      customClass: 'military-dialog military-dialog--danger',
    },
  )
  chat.clearAllSessions()
}

function exportActiveSessionMarkdown() {
  downloadText(
    `${safeFileName(chat.activeSession.title)}.md`,
    exportSessionMarkdown(chat.activeSession),
    'text/markdown;charset=utf-8',
  )
}

function exportFilteredSessionsJson() {
  const sessions = filteredSessions.value.length ? filteredSessions.value : chat.sessions
  downloadText('twentys1x-sessions.json', exportSessionsJson(sessions), 'application/json;charset=utf-8')
}

async function summarizeActiveSession() {
  const summarized = await chat.summarizeActiveSession()
  if (summarized) scrollToBottom()
}

function toggleSessionManager() {
  isSessionManagerCollapsed.value = !isSessionManagerCollapsed.value
  localStorage.setItem('twentys1x:session-manager-collapsed', String(isSessionManagerCollapsed.value))
}

function openSummaryDialog() {
  summaryDraft.value = chat.activeSession.summary?.content || ''
  copiedSummary.value = false
  isSummaryDialogVisible.value = true
}

function saveSummaryDraft() {
  chat.updateSessionSummary(chat.activeSession.id, summaryDraft.value)
  isSummaryDialogVisible.value = false
}

async function copySummaryDraft() {
  const content = summaryDraft.value.trim()
  if (!content) return

  try {
    await navigator.clipboard.writeText(content)
    copiedSummary.value = true
    setTimeout(() => (copiedSummary.value = false), 2000)
  } catch (err) {
    console.error('复制总结失败', err)
  }
}

function downloadText(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function safeFileName(value: string) {
  const name = value.trim().replace(/[\\/:*?"<>|]+/g, '-')
  return name || 'session'
}

function getFileExtension(name: string) {
  const extension = name.includes('.') ? name.split('.').pop() || '' : ''
  return extension.toLowerCase()
}

function detectPrismLanguage(filePath: string) {
  const extension = getFileExtension(filePath || '')
  const languageByExt: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    mjs: 'javascript',
    cjs: 'javascript',
    vue: 'markup',
    html: 'markup',
    xml: 'markup',
    svg: 'markup',
    css: 'css',
    scss: 'scss',
    sass: 'scss',
    less: 'css',
    json: 'json',
    yml: 'yaml',
    yaml: 'yaml',
    md: 'markdown',
    sh: 'bash',
    bash: 'bash',
    py: 'python',
    sql: 'sql',
  }
  return languageByExt[extension] || 'markup'
}

function highlightCode(code: string, language: string) {
  const safeCode = String(code || '')
  const grammar = Prism.languages[language]
  if (!safeCode) return ''
  if (!grammar) return escapeHtml(safeCode)
  return DOMPurify.sanitize(Prism.highlight(safeCode, grammar, language))
}

function closeCodePreview() {
  setCodePreviewVisible(false)
}

function toggleCodePreviewPanel() {
  if (!canToggleCodePreview.value) return
  toggleCodePreview()
}

function toggleWorkspaceTree() {
  isWorkspaceCollapsed.value = !isWorkspaceCollapsed.value
  if (!isWorkspaceCollapsed.value) nextTick(clampPanelWidths)
}

function getFileTypeLabel(name: string) {
  const ext = getFileExtension(name)
  if (!ext) return 'FILE'
  return ext.length > 5 ? ext.slice(0, 5).toUpperCase() : ext.toUpperCase()
}

function getFileTypeClass(name: string) {
  const ext = getFileExtension(name)
  if (['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'].includes(ext)) return 'code'
  if (['vue', 'html', 'css', 'scss', 'sass', 'less'].includes(ext)) return 'style'
  if (['json', 'yaml', 'yml', 'toml', 'ini'].includes(ext)) return 'config'
  if (['md', 'txt'].includes(ext)) return 'doc'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].includes(ext)) return 'asset'
  return 'other'
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
  editingContent.value =
    typeof message.content === 'string' ? message.content : messagePreviewContent(message.content)
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
</script>

<template>
  <div
    ref="appShellEl"
    class="app-shell"
    :class="{ 'is-resizing': isDraggingPanels, 'workspace-tree-hidden': isWorkspaceCollapsed }"
    :style="appShellViewStyle"
  >
    <aside class="sidebar">
      <div class="brand">
        <div class="logo-mark">T1</div>
        <div>
          <strong>Twentys1x</strong>
          <span>AI Studio</span>
        </div>
      </div>

      <el-button class="new-chat" type="primary" :icon="Plus" @click="chat.newSession">新会话</el-button>

      <section class="project-panel" aria-label="项目">
        <div class="panel-title">
          <span>项目</span>
          <el-button
            class="panel-icon-button"
            :icon="FolderAdd"
            text
            title="导入项目文件夹"
            :loading="chat.isImportingProject"
            @click="pickProjectFolder"
          />
        </div>
        <div class="project-list">
          <!-- === 新增：普通对话（取消关联） === -->
          <button
            type="button"
            class="project-item"
            :class="{ active: !chat.activeProjectId }"
            @click="chat.setActiveProject('')"
          >
            <el-icon><Promotion /></el-icon>
            <span>普通对话</span>
            <small>不关联任何项目</small>
          </button>

          <!-- 原有的项目列表循环 -->
          <button
            v-for="project in chat.projects"
            :key="project.id"
            type="button"
            class="project-item"
            :class="{ active: project.id === chat.activeProjectId }"
            @click="chat.setActiveProject(project.id)"
          >
            <el-icon><Files /></el-icon>
            <span>{{ project.name }}</span>
            <small>{{ project.fileCount }} 文件</small>
            <el-icon
              class="delete-project"
              title="删除项目"
              @click.stop="confirmDeleteProject(project.id, project.name)"
            >
              <Delete />
            </el-icon>
          </button>
          <button v-if="!chat.projects.length" type="button" class="project-empty" @click="pickProjectFolder">
            导入一个项目文件夹
          </button>
        </div>
        <el-button
          class="analyze-project-button"
          plain
          :disabled="!chat.activeProject"
          :loading="chat.isAnalyzingProject"
          @click="analyzeProject"
        >
          分析项目框架
        </el-button>
        <input
          ref="projectInputEl"
          class="file-input"
          type="file"
          webkitdirectory
          multiple
          @change="handleProjectFolder"
        />
      </section>

      <PromptLabPanel
        :templates="chat.promptTemplates"
        :agents="chat.customAgents"
        :workflows="chat.promptWorkflows"
        :active-agent-id="chat.activeAgentId"
        :has-active-project="Boolean(chat.activeProjectId)"
        :is-running-workflow="chat.isRunningWorkflow"
        @apply-template="applyPromptTemplate"
        @select-agent="chat.setActiveAgent"
        @save-template="savePromptTemplate"
        @delete-template="chat.deletePromptTemplate"
        @save-agent="saveCustomAgent"
        @delete-agent="chat.deleteCustomAgent"
        @save-workflow="savePromptWorkflow"
        @delete-workflow="chat.deletePromptWorkflow"
        @run-workflow="runPromptWorkflow"
      />

      <section
        class="session-manager"
        :class="{ 'is-collapsed': isSessionManagerCollapsed }"
        aria-label="会话智能管理"
      >
        <button
          type="button"
          class="session-manager-header"
          :aria-expanded="!isSessionManagerCollapsed"
          @click="toggleSessionManager"
        >
          <span class="session-manager-title">
            <el-icon><Search /></el-icon>
            会话智能管理
          </span>
          <span class="session-manager-count">{{ filteredSessions.length }}/{{ chat.sessions.length }}</span>
          <el-icon class="session-manager-chevron">
            <ArrowDown v-if="isSessionManagerCollapsed" />
            <ArrowUp v-else />
          </el-icon>
        </button>

        <div v-show="!isSessionManagerCollapsed" class="session-manager-body">
          <el-input
            v-model="sessionSearchQuery"
            class="session-search"
            clearable
            :prefix-icon="Search"
            placeholder="搜索标题、标签、内容"
          />
          <div v-if="chat.allSessionTags.length" class="session-tags">
            <button
              type="button"
              class="session-tag-filter"
              :class="{ active: !activeSessionTag }"
              @click="activeSessionTag = ''"
            >
              全部
            </button>
            <button
              v-for="tag in chat.allSessionTags"
              :key="tag"
              type="button"
              class="session-tag-filter"
              :class="{ active: activeSessionTag === tag }"
              @click="activeSessionTag = tag"
            >
              {{ tag }}
            </button>
          </div>
          <div class="session-export-actions">
            <el-button size="small" plain :icon="Download" @click="exportActiveSessionMarkdown"
              >导出当前</el-button
            >
            <el-button size="small" plain :icon="Download" @click="exportFilteredSessionsJson"
              >导出列表</el-button
            >
          </div>
          <label class="session-tag-editor">
            <span>当前会话标签</span>
            <el-input
              v-model="activeSessionTagsText"
              size="small"
              placeholder="用逗号分隔，例如 前端, 修复"
            />
          </label>
          <div class="session-summary-card" :class="{ empty: !chat.activeSession.summary }">
            <div class="session-summary-head">
              <span>智能总结</span>
              <div class="session-summary-actions">
                <el-button
                  v-if="chat.activeSession.summary"
                  class="summary-more-button"
                  size="small"
                  text
                  :icon="MoreFilled"
                  aria-label="查看完整智能总结"
                  @click="openSummaryDialog"
                />
                <el-button
                  size="small"
                  plain
                  :icon="MagicStick"
                  :loading="chat.isSummarizingSession"
                  :disabled="!canSummarizeActiveSession"
                  @click="summarizeActiveSession"
                >
                  {{ chat.activeSession.summary ? '更新' : '生成' }}
                </el-button>
              </div>
            </div>
            <p v-if="chat.activeSession.summary">{{ chat.activeSession.summary.content }}</p>
            <p v-else>长会话可一键压缩成可回顾摘要。</p>
          </div>
        </div>
      </section>

      <nav class="sessions" aria-label="历史会话">
        <SessionItem
          v-for="session in filteredSessions"
          :key="session.id"
          :session="session"
          :active="session.id === chat.activeSessionId"
          @select="selectSession"
          @delete="chat.deleteSession"
        />
        <button
          v-if="chat.sessions.length && !filteredSessions.length"
          type="button"
          class="session-empty-filter"
          @click="clearSessionFilters"
        >
          没有匹配会话，清除筛选
        </button>
      </nav>

      <SettingsPanel
        :providers="chat.providers"
        :selected-provider-id="chat.selectedProviderId"
        :selected-provider="chat.selectedProvider"
        :api-key="chat.apiKey"
        :model="chat.model"
        :current-model-options="chat.currentModelOptions"
        @select-provider="selectProvider"
        @update-api-key="chat.setApiKey"
        @select-model="selectModel"
        @clear-history="confirmClear"
      />
    </aside>

    <el-dialog
      v-model="isSummaryDialogVisible"
      class="summary-dialog"
      title="智能总结"
      width="min(640px, 92vw)"
    >
      <el-input
        v-model="summaryDraft"
        class="summary-editor"
        type="textarea"
        :rows="12"
        resize="vertical"
        placeholder="编辑当前会话总结"
      />
      <template #footer>
        <div class="summary-dialog-actions">
          <el-button
            plain
            :icon="copiedSummary ? Check : CopyDocument"
            :disabled="!summaryDraft.trim()"
            @click="copySummaryDraft"
          >
            {{ copiedSummary ? '已复制' : '复制' }}
          </el-button>
          <el-button @click="isSummaryDialogVisible = false">取消</el-button>
          <el-button type="primary" :disabled="!summaryDraft.trim()" @click="saveSummaryDraft"
            >保存</el-button
          >
        </div>
      </template>
    </el-dialog>

    <div class="panel-resizer left" title="拖拽调整左侧栏宽度" @mousedown="startResize('left', $event)"></div>

    <main id="main-content" class="chat-area" tabindex="-1">
      <header class="topbar">
        <div>
          <p>当前会话</p>
          <h1>{{ chat.activeSession.title }}</h1>
          <div class="active-project-indicator">当前项目：{{ activeProjectObjectLabel }}</div>
        </div>
        <div class="topbar-actions">
          <el-tag :type="chat.apiKey.trim() ? 'success' : 'warning'" round>
            {{ chat.isProviderReady ? `${chat.selectedProvider.name} 已就绪` : '等待 API Key' }}
          </el-tag>
          <el-button
            class="topbar-icon-button"
            :icon="isWorkspaceCollapsed ? Expand : Fold"
            :title="isWorkspaceCollapsed ? '展开文件树' : '收起文件树'"
            :aria-label="isWorkspaceCollapsed ? '展开文件树' : '收起文件树'"
            circle
            @click="toggleWorkspaceTree"
          />
        </div>
      </header>

      <div ref="messagesEl" class="messages" aria-label="消息列表" role="log" aria-live="polite">
        <div v-if="!chat.visibleMessages.length" class="empty-state">
          <div class="empty-logo">T1</div>
          <h2>Twentys1x AI 工作台</h2>
          <p>
            选择 AI 供应商并粘贴对应 API Key
            后，直接开始对话。支持文本附件和图片附件，历史会话会保存在本地浏览器。
          </p>
        </div>

        <div v-for="message in chat.visibleMessages" v-else :key="message.id" class="message-list-item">
          <MessageBubble
            :message="message"
            :is-sending="chat.isSending"
            :copied-message-id="copiedMessageId"
            :copied-code-block="copiedCodeBlock"
            :is-editing="editingMessageId === message.id"
            :editing-content="editingContent"
            @update:editing-content="editingContent = $event"
            @start-inline-edit="startInlineEdit"
            @cancel-inline-edit="cancelInlineEdit"
            @submit-inline-edit="submitInlineEdit"
            @copy-message="copyMessage"
            @copy-code-block="copyCodeBlock"
          />
        </div>
      </div>

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

        <!-- === 修改：仅在有项目时显示，并添加退出按钮 === -->
        <div v-if="chat.activeProjectId" class="composer-project-indicator">
          <span
            >当前项目：<strong>{{ activeProjectLabel }}</strong></span
          >
          <el-button link @click="chat.setActiveProject('')">
            <el-icon><Close /></el-icon> 退出项目模式
          </el-button>
        </div>

        <div class="composer">
          <el-button class="icon-button" :icon="Paperclip" circle title="添加附件" @click="pickFiles" />
          <!-- === 修改：动态更新 Placeholder 文案 === -->
          <el-input
            v-model="input"
            type="textarea"
            resize="vertical"
            :autosize="{ minRows: 1, maxRows: 6 }"
            :placeholder="
              chat.activeProjectId
                ? `向 ${chat.selectedProvider.name} 提问（当前项目：${activeProjectLabel}）...`
                : `向 ${chat.selectedProvider.name} 提问...`
            "
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
    <div
      v-if="isCodePreviewVisible"
      class="panel-resizer preview"
      title="拖拽调整代码预览宽度"
      @mousedown="startResize('preview', $event)"
    ></div>

    <aside v-if="isCodePreviewVisible" class="code-preview-panel">
      <header class="code-preview-topbar">
        <div class="code-preview-title">
          <p>代码预览</p>
          <h3>{{ chat.activeFilePath || '未选择文件' }}</h3>
        </div>
        <el-button
          class="panel-icon-button"
          text
          :icon="Close"
          title="关闭代码预览"
          @click="closeCodePreview"
        />
      </header>

      <section class="code-preview-body">
        <div v-if="chat.activeFilePath" class="file-actions">
          <el-button v-if="!isEditingFile" size="small" plain :icon="Edit" @click="isEditingFile = true"
            >编辑</el-button
          >
          <template v-else>
            <el-button size="small" plain @click="cancelFileEdit">取消</el-button>
            <el-button
              size="small"
              type="primary"
              :loading="chat.isPreviewingFileDiff || chat.isApplyingFileWrite"
              @click="previewAndApplyFileWrite"
            >
              生成 Diff
            </el-button>
          </template>
        </div>

        <el-input
          v-if="chat.activeFilePath && isEditingFile"
          v-model="chat.editedFileContent"
          class="file-editor"
          type="textarea"
          resize="none"
        />
        <div v-else-if="chat.activeFilePath" class="code-preview line-numbered">
          <div v-for="line in activeFilePreviewLines" :key="line.number" class="code-line-row">
            <span class="line-number-gutter" aria-hidden="true">{{ line.number }}</span>
            <code :class="`code-line language-${activeFileLanguage}`" v-html="line.html"></code>
          </div>
        </div>
        <div v-else class="code-empty">选择文件后在这里预览代码</div>

        <pre v-if="chat.activeFileDiff" class="diff-preview">
          <code class="language-diff" v-html="highlightedActiveFileDiff"></code>
        </pre>
      </section>
    </aside>

    <div
      v-if="!isWorkspaceCollapsed"
      class="panel-resizer right"
      title="拖拽调整 Workspace 宽度"
      @mousedown="startResize('right', $event)"
    ></div>

    <aside v-if="!isWorkspaceCollapsed" class="workspace-panel-right">
      <header class="workspace-topbar">
        <div>
          <p>Workspace</p>
          <h2>{{ chat.activeProject?.name || '未选择项目' }}</h2>
        </div>
        <div class="workspace-topbar-actions">
          <el-button
            class="panel-icon-button"
            text
            :disabled="!canToggleCodePreview"
            :title="isCodePreviewVisible ? '隐藏代码预览' : '显示代码预览'"
            @click="toggleCodePreviewPanel"
          >
            <span
              class="split-panel-icon"
              :class="{ collapsed: !isCodePreviewVisible }"
              aria-hidden="true"
            ></span>
          </el-button>
          <el-button
            class="panel-icon-button"
            text
            :icon="Fold"
            title="收起文件树"
            aria-label="收起文件树"
            @click="toggleWorkspaceTree"
          />
        </div>
      </header>

      <section class="file-tree-section">
        <div class="workspace-section-title">
          <span>文件树</span>
          <small v-if="chat.activeProject">{{ chat.activeProject.chunkCount }} 片段</small>
        </div>
        <el-tree
          v-if="chat.activeProjectTree.length"
          class="project-tree"
          :data="chat.activeProjectTree"
          node-key="path"
          :props="{ label: 'name', children: 'children' }"
          :highlight-current="true"
          @node-click="handleTreeNodeClick"
        >
          <template #default="{ data }">
            <span class="tree-node" :class="{ directory: data.isDirectory, file: !data.isDirectory }">
              <template v-if="data.isDirectory">
                <span class="tree-folder-name">{{ data.name }}</span>
              </template>
              <template v-else>
                <span class="file-type-badge" :class="`type-${getFileTypeClass(data.name)}`">
                  {{ getFileTypeLabel(data.name) }}
                </span>
                <span class="tree-file-name">{{ data.name }}</span>
              </template>
            </span>
          </template>
        </el-tree>
        <button v-else type="button" class="project-empty" @click="pickProjectFolder">
          先导入项目文件夹
        </button>
      </section>
    </aside>
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
  padding: 0.15em 0.4em;
  border-radius: 5px;
  font-family: 'JetBrains Mono', ui-monospace, 'Cascadia Mono', 'Segoe UI Mono', monospace;
  font-size: 0.85em;
  color: #2d5848;
  font-variant-ligatures: none;
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
  margin: 8px 0;
  border: 1px solid rgba(23, 32, 26, 0.16);
  border-radius: 12px;
  overflow: hidden;
  background: linear-gradient(180deg, #222b24 0%, #1a211c 100%);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.04) inset,
    0 12px 32px rgba(0, 0, 0, 0.15);
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
