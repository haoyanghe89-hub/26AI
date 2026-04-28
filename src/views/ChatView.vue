<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Delete, Paperclip, Plus, Promotion, CopyDocument, Check, Edit, CircleClose, FolderAdd, Files, Close } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs'
import ElAlert from 'element-plus/es/components/alert/index.mjs'
import ElButton from 'element-plus/es/components/button/index.mjs'
import ElIcon from 'element-plus/es/components/icon/index.mjs'
import ElInput from 'element-plus/es/components/input/index.mjs'
import ElSelect, { ElOption } from 'element-plus/es/components/select/index.mjs'
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
import { messagePreviewContent, type ProviderId, useChatStore } from '../stores/chat'

const chat = useChatStore()
const input = ref('')
const appShellEl = ref<HTMLElement | null>(null)
const messagesEl = ref<HTMLElement | null>(null)
const fileInputEl = ref<HTMLInputElement | null>(null)
const projectInputEl = ref<HTMLInputElement | null>(null)
const apiKeyInputEl = ref<InstanceType<typeof ElInput> | null>(null)
const modelSelectEl = ref<InstanceType<typeof ElSelect> | null>(null)
const copiedMessageId = ref<string | null>(null)
const copiedCodeBlock = ref<{ id: string; index: number } | null>(null)
const isWorkspaceCollapsed = ref(false)
const isEditingFile = ref(false)

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

const activeFileLanguage = computed(() => detectPrismLanguage(chat.activeFilePath))
const highlightedActiveFileContent = computed(() =>
  highlightCode(chat.activeFileContent || '', activeFileLanguage.value),
)
const activeFileLineNumbers = computed(() => {
  const lineCount = String(chat.activeFileContent || '').split('\n').length
  return Array.from({ length: Math.max(1, lineCount) }, (_, index) => index + 1)
})
const highlightedActiveFileDiff = computed(() => highlightCode(chat.activeFileDiff || '', 'diff'))
const canToggleCodePreview = computed(() => Boolean(chat.activeFilePath))
const leftSidebarWidth = ref(loadStoredWidth('twentys1x:left-sidebar-width', 304))
const rightWorkspaceWidth = ref(loadStoredWidth('twentys1x:right-workspace-width', 380))
const previewPanelWidth = ref(loadStoredWidth('twentys1x:preview-panel-width', 520))
const isCodePreviewVisible = ref(false)
const isDraggingPanels = ref(false)
const PANEL_HANDLE_WIDTH = 8
const MAIN_MIN_WIDTH = 560

const appShellStyle = computed(() => ({
  '--sidebar-left-width': `${leftSidebarWidth.value}px`,
  '--preview-panel-width': `${isCodePreviewVisible.value ? previewPanelWidth.value : 0}px`,
  '--preview-handle-width': `${isCodePreviewVisible.value ? PANEL_HANDLE_WIDTH : 0}px`,
  '--workspace-width': `${rightWorkspaceWidth.value}px`,
}))

let cleanupDragListeners: (() => void) | null = null

onMounted(() => {
  chat.refreshProjects()
  clampPanelWidths()
  window.addEventListener('resize', clampPanelWidths)
})

onBeforeUnmount(() => {
  cleanupActiveDrag()
  window.removeEventListener('resize', clampPanelWidths)
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

function pickProjectFolder() {
  projectInputEl.value?.click()
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
  return Prism.highlight(safeCode, grammar, language)
}

function closeCodePreview() {
  setCodePreviewVisible(false)
}

function toggleCodePreview() {
  if (!canToggleCodePreview.value) return
  setCodePreviewVisible(!isCodePreviewVisible.value)
}

function setCodePreviewVisible(visible: boolean) {
  isCodePreviewVisible.value = visible
  if (!visible) isEditingFile.value = false
  clampPanelWidths()
}

function loadStoredWidth(key: string, fallback: number) {
  const saved = Number(localStorage.getItem(key) || '')
  return Number.isFinite(saved) && saved > 0 ? saved : fallback
}

function getPanelBounds(containerWidth: number) {
  const leftMin = Math.max(248, Math.round(containerWidth * 0.16))
  const leftMaxByRatio = Math.min(460, Math.round(containerWidth * 0.34))
  const rightMin = Math.max(300, Math.round(containerWidth * 0.2))
  const rightMaxByRatio = Math.min(580, Math.round(containerWidth * 0.42))
  const previewMin = Math.max(360, Math.round(containerWidth * 0.24))
  const previewMaxByRatio = Math.min(760, Math.round(containerWidth * 0.48))
  return { leftMin, leftMaxByRatio, rightMin, rightMaxByRatio, previewMin, previewMaxByRatio }
}

function clampPanelWidths() {
  const shell = appShellEl.value
  if (!shell) return
  const total = shell.clientWidth
  if (!total) return

  const { leftMin, leftMaxByRatio, rightMin, rightMaxByRatio, previewMin, previewMaxByRatio } = getPanelBounds(total)
  const handleCount = isCodePreviewVisible.value ? 3 : 2
  const usable = total - MAIN_MIN_WIDTH - PANEL_HANDLE_WIDTH * handleCount

  if (isCodePreviewVisible.value && usable <= leftMin + rightMin + previewMin) {
    isCodePreviewVisible.value = false
    clampPanelWidths()
    return
  }

  const leftMax = Math.max(leftMin, Math.min(leftMaxByRatio, usable - rightMin - (isCodePreviewVisible.value ? previewMin : 0)))
  const rightMax = Math.max(rightMin, Math.min(rightMaxByRatio, usable - leftMin - (isCodePreviewVisible.value ? previewMin : 0)))
  leftSidebarWidth.value = Math.round(Math.min(Math.max(leftSidebarWidth.value, leftMin), leftMax))
  rightWorkspaceWidth.value = Math.round(Math.min(Math.max(rightWorkspaceWidth.value, rightMin), rightMax))

  if (!isCodePreviewVisible.value) return

  const previewMax = Math.max(
    previewMin,
    Math.min(previewMaxByRatio, usable - leftSidebarWidth.value - rightWorkspaceWidth.value),
  )
  previewPanelWidth.value = Math.round(Math.min(Math.max(previewPanelWidth.value, previewMin), previewMax))

  const overflow = leftSidebarWidth.value + rightWorkspaceWidth.value + previewPanelWidth.value - usable
  if (overflow > 0) {
    const previewCanShrink = Math.max(0, previewPanelWidth.value - previewMin)
    const previewShrink = Math.min(previewCanShrink, overflow)
    previewPanelWidth.value -= previewShrink

    const remainderAfterPreview = overflow - previewShrink
    if (remainderAfterPreview > 0) {
      const rightCanShrink = Math.max(0, rightWorkspaceWidth.value - rightMin)
      const rightShrink = Math.min(rightCanShrink, remainderAfterPreview)
      rightWorkspaceWidth.value -= rightShrink

      const remainderAfterRight = remainderAfterPreview - rightShrink
      if (remainderAfterRight > 0) {
        const leftCanShrink = Math.max(0, leftSidebarWidth.value - leftMin)
        const leftShrink = Math.min(leftCanShrink, remainderAfterRight)
        leftSidebarWidth.value -= leftShrink
      }
    }
  }
}

function cleanupActiveDrag() {
  if (cleanupDragListeners) {
    cleanupDragListeners()
    cleanupDragListeners = null
  }
  isDraggingPanels.value = false
}

function startResize(side: 'left' | 'preview' | 'right', event: MouseEvent) {
  const shell = appShellEl.value
  if (!shell) return
  event.preventDefault()

  const shellRect = shell.getBoundingClientRect()
  const total = shellRect.width
  const { leftMin, leftMaxByRatio, rightMin, rightMaxByRatio, previewMin, previewMaxByRatio } = getPanelBounds(total)
  const handleCount = isCodePreviewVisible.value ? 3 : 2
  const usable = total - MAIN_MIN_WIDTH - PANEL_HANDLE_WIDTH * handleCount
  const leftMax = Math.max(leftMin, Math.min(leftMaxByRatio, usable - rightMin - (isCodePreviewVisible.value ? previewMin : 0)))
  const rightMax = Math.max(rightMin, Math.min(rightMaxByRatio, usable - leftMin - (isCodePreviewVisible.value ? previewMin : 0)))
  const previewMax = Math.max(previewMin, Math.min(previewMaxByRatio, usable - leftMin - rightMin))

  isDraggingPanels.value = true

  const onMove = (moveEvent: MouseEvent) => {
    const offsetX = moveEvent.clientX - shellRect.left
    if (side === 'left') {
      const leftAllowedMax = Math.min(
        leftMax,
        total -
          rightWorkspaceWidth.value -
          (isCodePreviewVisible.value ? previewPanelWidth.value : 0) -
          PANEL_HANDLE_WIDTH * handleCount -
          MAIN_MIN_WIDTH,
      )
      leftSidebarWidth.value = Math.round(Math.min(Math.max(offsetX, leftMin), leftAllowedMax))
      localStorage.setItem('twentys1x:left-sidebar-width', String(leftSidebarWidth.value))
      return
    }

    if (side === 'preview') {
      if (!isCodePreviewVisible.value) return
      const rightSegment = rightWorkspaceWidth.value + PANEL_HANDLE_WIDTH
      const previewFromPointer = total - offsetX - rightSegment
      const previewAllowedMax = Math.min(
        previewMax,
        total - leftSidebarWidth.value - rightWorkspaceWidth.value - PANEL_HANDLE_WIDTH * handleCount - MAIN_MIN_WIDTH,
      )
      previewPanelWidth.value = Math.round(Math.min(Math.max(previewFromPointer, previewMin), previewAllowedMax))
      localStorage.setItem('twentys1x:preview-panel-width', String(previewPanelWidth.value))
      return
    }

    const rightFromPointer = total - offsetX
    const rightAllowedMax = Math.min(
      rightMax,
      total -
        leftSidebarWidth.value -
        (isCodePreviewVisible.value ? previewPanelWidth.value : 0) -
        PANEL_HANDLE_WIDTH * handleCount -
        MAIN_MIN_WIDTH,
    )
    rightWorkspaceWidth.value = Math.round(Math.min(Math.max(rightFromPointer, rightMin), rightAllowedMax))
    localStorage.setItem('twentys1x:right-workspace-width', String(rightWorkspaceWidth.value))
  }

  const onUp = () => {
    cleanupActiveDrag()
  }

  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp, { once: true })
  cleanupDragListeners = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
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
  <div ref="appShellEl" class="app-shell" :class="{ 'is-resizing': isDraggingPanels }" :style="appShellStyle">
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
          <el-button class="panel-icon-button" :icon="FolderAdd" text title="导入项目文件夹" :loading="chat.isImportingProject" @click="pickProjectFolder" />
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
            <el-icon class="delete-project" title="删除项目" @click.stop="confirmDeleteProject(project.id, project.name)">
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
    <div class="panel-resizer left" title="拖拽调整左侧栏宽度" @mousedown="startResize('left', $event)"></div>

    <main class="chat-area">
      <header class="topbar">
        <div>
          <p>当前会话</p>
          <h1>{{ chat.activeSession.title }}</h1>
          <div class="active-project-indicator">
            当前项目：{{ activeProjectObjectLabel }}
          </div>
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
          <div class="avatar">{{ message.role === 'user' ? '你' : 'T1' }}</div>
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

        <!-- === 修改：仅在有项目时显示，并添加退出按钮 === -->
        <div v-if="chat.activeProjectId" class="composer-project-indicator">
          <span>当前项目：<strong>{{ activeProjectLabel }}</strong></span>
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
            :placeholder="chat.activeProjectId ? `向 ${chat.selectedProvider.name} 提问（当前项目：${activeProjectLabel}）...` : `向 ${chat.selectedProvider.name} 提问...`"
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
        <el-button class="panel-icon-button" text :icon="Close" title="关闭代码预览" @click="closeCodePreview" />
      </header>

      <section class="code-preview-body">
        <div v-if="chat.activeFilePath" class="file-actions">
          <el-button v-if="!isEditingFile" size="small" plain :icon="Edit" @click="isEditingFile = true">编辑</el-button>
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
        <pre v-else-if="chat.activeFilePath" class="code-preview line-numbered">
          <span class="line-number-gutter" aria-hidden="true">
            <span v-for="line in activeFileLineNumbers" :key="line" class="line-no">{{ line }}</span>
          </span>
          <code :class="`language-${activeFileLanguage}`" v-html="highlightedActiveFileContent"></code>
        </pre>
        <div v-else class="code-empty">选择文件后在这里预览代码</div>

        <pre v-if="chat.activeFileDiff" class="diff-preview">
          <code class="language-diff" v-html="highlightedActiveFileDiff"></code>
        </pre>
      </section>
    </aside>

    <div class="panel-resizer right" title="拖拽调整 Workspace 宽度" @mousedown="startResize('right', $event)"></div>

    <aside class="workspace-panel-right" :class="{ collapsed: isWorkspaceCollapsed }">
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
            @click="toggleCodePreview"
          >
            <span class="split-panel-icon" :class="{ collapsed: !isCodePreviewVisible }" aria-hidden="true"></span>
          </el-button>
          <el-button class="panel-icon-button" text @click="isWorkspaceCollapsed = !isWorkspaceCollapsed">
            {{ isWorkspaceCollapsed ? '展开' : '收起' }}
          </el-button>
        </div>
      </header>

      <template v-if="!isWorkspaceCollapsed">
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

      </template>
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
  font-family: "JetBrains Mono", ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace;
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
  transition: border-color 0.22s ease, box-shadow 0.22s ease;
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