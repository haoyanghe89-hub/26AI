<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import DOMPurify from 'dompurify'
import {
  Delete,
  Download,
  Expand,
  Paperclip,
  Promotion,
  Edit,
  CircleClose,
  FolderAdd,
  Folder,
  Files,
  Close,
  Fold,
  Search,
  MagicStick,
  ArrowDown,
  MoreFilled,
  CopyDocument,
  Check,
  Refresh,
  VideoPlay,
  DocumentChecked,
  Cpu,
  SwitchButton,
  Plus,
  Tools,
  UploadFilled,
} from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import ElButton from 'element-plus/es/components/button/index.mjs'
import ElDialog from 'element-plus/es/components/dialog/index.mjs'
import ElIcon from 'element-plus/es/components/icon/index.mjs'
import ElInput from 'element-plus/es/components/input/index.mjs'
import ElTag from 'element-plus/es/components/tag/index.mjs'
import ElTree from 'element-plus/es/components/tree/index.mjs'
import Prism from 'prismjs'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
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
import SessionTagVirtualFilter from '../components/chat/SessionTagVirtualFilter.vue'
import SettingsPanel from '../components/chat/SettingsPanel.vue'
import { useResizablePanels } from '../composables/useResizablePanels'
import {
  exportSessionMarkdown,
  exportSessionsJson,
  normalizeTags,
  sessionMatchesQuery,
} from '../lib/sessionManagement'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import type { PromptTemplate } from '../lib/promptEngineering'
import { messagePreviewContent, type ChatAttachment, type ProviderId, useChatStore } from '../stores/chat'
import { useAuthStore } from '../stores/auth'
import { useRoute, useRouter } from 'vue-router'
import ElSelect, { ElOption } from 'element-plus/es/components/select/index.mjs'
import { localeOptions, setLocale, type AppLocale } from '../i18n'

const chat = useChatStore()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const input = ref('')
/** 当前会话输入区生效的模板（发送时套用到模型，界面仍显示用户原文） */
const activeComposerTemplate = ref<Pick<PromptTemplate, 'id' | 'name' | 'content'> | null>(null)
const appShellEl = ref<HTMLElement | null>(null)
const messagesEl = ref<HTMLElement | null>(null)
const fileInputEl = ref<HTMLInputElement | null>(null)
const copiedMessageId = ref<string | null>(null)
const copiedCodeBlock = ref<{ id: string; index: number } | null>(null)
const isWorkspaceCollapsed = ref(true)
const isEditingFile = ref(false)
const storedSessionManagerCollapsed = localStorage.getItem('twentys1x:session-manager-collapsed')
const isSessionManagerCollapsed = ref(storedSessionManagerCollapsed === 'true')
const storedSidebarCollapsed = localStorage.getItem('twentys1x:left-sidebar-collapsed')
const isSidebarCollapsed = ref(storedSidebarCollapsed === 'true')
const isMobileLayout = ref(false)
const isNearMessagesBottom = ref(true)

const PROJECT_PANEL_COLLAPSE_KEY = 'twentys1x:project-panel-collapsed'
function readProjectPanelStored(): boolean | null {
  const raw = localStorage.getItem(PROJECT_PANEL_COLLAPSE_KEY)
  if (raw === 'true') return true
  if (raw === 'false') return false
  return null
}
const projectPanelUserToggled = ref(readProjectPanelStored() !== null)
const isProjectPanelCollapsed = ref(readProjectPanelStored() ?? false)
const isSummaryDialogVisible = ref(false)
const summaryDraft = ref('')
const copiedSummary = ref(false)
const sessionSearchQuery = ref('')
const activeSessionTag = ref('')
const selectedSessionIds = ref<string[]>([])
const isBatchDeleteDialogVisible = ref(false)
const batchDeleteSearchQuery = ref('')
const exportLoading = ref<'markdown' | 'json' | 'pdf' | null>(null)
const attachmentPreview = ref<ChatAttachment | null>(null)
const attachmentPreviewUrl = ref('')
const monacoEditorEl = ref<HTMLElement | null>(null)
let monacoEditor: monaco.editor.IStandaloneCodeEditor | null = null
let monacoChangeDisposable: monaco.IDisposable | null = null
const codeRunStatus = ref<'idle' | 'running' | 'success' | 'error'>('idle')
const codeRunLogs = ref<string[]>([])
const codeRunPreviewHtml = ref('')
const copiedDebugOutput = ref(false)

window.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  },
}

// 气泡内联编辑状态
const editingMessageId = ref<string | null>(null)
const editingContent = ref('')

const canSend = computed(() => {
  return chat.isProviderReady && !chat.isSending && (input.value.trim() || chat.pendingFiles.length)
})
const providerStatusText = computed(() => {
  if (chat.isProviderReady) {
    if (chat.inferenceMode === 'local') return t('chat.readyLocal', { model: chat.localModel })
    if (chat.inferenceMode === 'auto') return t('chat.readyHybrid')
    return t('chat.readyProvider', { provider: chat.selectedProvider.name })
  }
  return chat.inferenceMode === 'local' ? t('chat.waitingLocal') : t('chat.waitingApiKey')
})
const modeSummaryText = computed(() => {
  if (chat.inferenceMode === 'local') return t('settings.localSummary', { model: chat.localModel })
  if (chat.inferenceMode === 'auto')
    return t('settings.hybridSummary', { localModel: chat.localModel, model: chat.model })
  return t('settings.providerSummary', { provider: chat.selectedProvider.name, model: chat.model })
})
const emptyStatePrompts = computed(() => [
  t('chat.emptyPromptReview'),
  t('chat.emptyPromptExplain'),
  t('chat.emptyPromptPlan'),
  t('chat.emptyPromptRefactor'),
])
const showJumpToBottom = computed(() => chat.visibleMessages.length > 0 && !isNearMessagesBottom.value)
const isErrorDialogVisible = computed({
  get: () => Boolean(chat.errorMessage),
  set: (value: boolean) => {
    if (!value) chat.clearErrorMessage()
  },
})
const lastMessageSignature = computed(() => {
  const message = chat.visibleMessages[chat.visibleMessages.length - 1]
  if (!message) return ''
  const text = typeof message.content === 'string' ? message.content : messagePreviewContent(message.content)
  return [
    message.id,
    message.role,
    text.length,
    message.toolLogs?.length ?? 0,
    message.plan?.tasks?.length ?? 0,
  ].join(':')
})

// === 修改：优化无项目状态的显示文案 ===
const activeProjectLabel = computed(() => chat.activeProject?.name || t('chat.normalChat'))
/** 侧栏折叠态下展示当前上下文与上传项目数 */
const projectPanelMetaText = computed(() => {
  const n = chat.projects.length
  if (isProjectPanelCollapsed.value) {
    return n ? `${activeProjectLabel.value} · ${n} ${t('chat.project')}` : activeProjectLabel.value
  }
  return n ? `${n} ${t('chat.project')}` : t('chat.noProject')
})
const activeProjectObjectLabel = computed(() =>
  chat.activeProject ? `${chat.activeProject.name} (${chat.activeProject.id})` : t('chat.noProjectRelation'),
)
const filteredSessions = computed(() =>
  chat.sessions.filter((session) => {
    const matchesTag = !activeSessionTag.value || session.tags?.includes(activeSessionTag.value)
    return matchesTag && sessionMatchesQuery(session, sessionSearchQuery.value)
  }),
)
const batchDeleteFilteredSessions = computed(() =>
  chat.sessions.filter((session) => sessionMatchesQuery(session, batchDeleteSearchQuery.value)),
)
const selectedSessionIdSet = computed(() => new Set(selectedSessionIds.value))
const selectedSessionCount = computed(() => selectedSessionIds.value.length)
const filteredSessionIds = computed(() => batchDeleteFilteredSessions.value.map((session) => session.id))
const isAllFilteredSessionsSelected = computed(
  () =>
    Boolean(filteredSessionIds.value.length) &&
    filteredSessionIds.value.every((id) => selectedSessionIdSet.value.has(id)),
)
const canBatchDeleteSessions = computed(() => selectedSessionCount.value > 0)
const activeSessionTagsText = computed({
  get: () => chat.activeSession.tags?.join(', ') || '',
  set: (value: string) => chat.setSessionTags(chat.activeSession.id, normalizeTags(value)),
})
const canSummarizeActiveSession = computed(
  () => chat.activeSession.messages.length > 1 && chat.isProviderReady,
)

const activeFileMonacoLanguage = computed(() => detectMonacoLanguage(chat.activeFilePath))
const hasEditedFileChanges = computed(() => chat.editedFileContent !== chat.activeFileContent)
const canRunActiveFile = computed(() => {
  if (!chat.activeFilePath) return false
  return ['javascript', 'typescript', 'html', 'css'].includes(activeFileMonacoLanguage.value)
})
const codeRunStatusLabel = computed(() => {
  if (codeRunStatus.value === 'running') return t('chat.runStatusRunning')
  if (codeRunStatus.value === 'success') return t('chat.runStatusSuccess')
  if (codeRunStatus.value === 'error') return t('chat.runStatusError')
  return t('chat.runStatusIdle')
})
const highlightedActiveFileDiff = computed(() => highlightCode(chat.activeFileDiff || '', 'diff'))
const previewTitle = computed(
  () => attachmentPreview.value?.name || chat.activeFilePath || t('chat.chooseFilePreview'),
)
const previewKind = computed(() => attachmentPreview.value?.kind || 'text')
const canToggleCodePreview = computed(() => Boolean(chat.activeFilePath || attachmentPreview.value))
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
  '--sidebar-left-width': isSidebarCollapsed.value ? '0px' : appShellStyle.value['--sidebar-left-width'],
  '--sidebar-handle-width': isSidebarCollapsed.value ? '0px' : '8px',
  '--workspace-width': isWorkspaceCollapsed.value ? '0px' : appShellStyle.value['--workspace-width'],
  '--workspace-handle-width': isWorkspaceCollapsed.value ? '0px' : '8px',
}))

function syncSessionQueryParam() {
  const q = route.query.session
  const current = typeof q === 'string' ? q : Array.isArray(q) && q.length ? (q[0] as string) : ''
  if (current === chat.activeSessionId) return
  router.replace({ path: '/', query: { session: chat.activeSessionId } })
}

async function bootRouteSession() {
  await auth.hydrate()
  await chat.hydrateClientState()
  const raw = route.query.session
  const sid = typeof raw === 'string' ? raw : Array.isArray(raw) && raw.length ? (raw[0] as string) : ''
  if (sid && chat.sessions.some((s) => s.id === sid)) {
    chat.setActiveSession(sid)
  }
  syncSessionQueryParam()
}

async function logout() {
  await auth.logout()
  await router.replace('/login')
}

onMounted(() => {
  void bootRouteSession()
  chat.refreshProviderServerConfig()
  chat.refreshLocalModels()
  chat.refreshProjects()
  syncMobileLayout()
  window.addEventListener('message', handleCodeRunnerMessage)
  window.addEventListener('resize', syncMobileLayout)
})

watch(
  () => chat.activeSessionId,
  () => {
    activeComposerTemplate.value = null
    syncSessionQueryParam()
    scrollToBottom()
  },
)

watch(
  () => route.query.session,
  (q) => {
    const sid = typeof q === 'string' ? q : Array.isArray(q) && q.length ? (q[0] as string) : ''
    if (!sid || sid === chat.activeSessionId) return
    if (chat.sessions.some((s) => s.id === sid)) {
      chat.setActiveSession(sid)
    }
  },
)

watch(
  () => chat.sessions.map((session) => session.id),
  (sessionIds) => {
    const validIds = new Set(sessionIds)
    selectedSessionIds.value = selectedSessionIds.value.filter((id) => validIds.has(id))
  },
  { immediate: true },
)

watch(isBatchDeleteDialogVisible, (visible) => {
  if (!visible) {
    batchDeleteSearchQuery.value = ''
    clearSessionSelection()
  }
})

watch(
  () => chat.projects.length,
  (n) => {
    if (projectPanelUserToggled.value) return
    isProjectPanelCollapsed.value = n > 2
  },
  { immediate: true },
)

watch(attachmentPreview, async (attachment, _previous, onCleanup) => {
  if (attachmentPreviewUrl.value) URL.revokeObjectURL(attachmentPreviewUrl.value)
  attachmentPreviewUrl.value = ''
  if (!attachment?.dataUrl || attachment.kind === 'text') return

  let revoked = false
  onCleanup(() => {
    revoked = true
  })

  const blob = await fetch(attachment.dataUrl).then((response) => response.blob())
  const objectUrl = URL.createObjectURL(blob)
  if (revoked) {
    URL.revokeObjectURL(objectUrl)
    return
  }
  attachmentPreviewUrl.value = objectUrl
})

onUnmounted(() => {
  if (attachmentPreviewUrl.value) URL.revokeObjectURL(attachmentPreviewUrl.value)
  window.removeEventListener('message', handleCodeRunnerMessage)
  window.removeEventListener('resize', syncMobileLayout)
  disposeMonacoEditor()
})

watch(
  [() => isCodePreviewVisible.value, () => attachmentPreview.value, () => chat.activeFilePath],
  () => {
    if (isCodePreviewVisible.value && !attachmentPreview.value && chat.activeFilePath) {
      void nextTick(ensureMonacoEditor)
      return
    }
    disposeMonacoEditor()
  },
  { flush: 'post' },
)

watch(
  () => chat.editedFileContent,
  (content) => {
    if (!monacoEditor || monacoEditor.getValue() === content) return
    monacoEditor.setValue(content)
  },
)

watch(activeFileMonacoLanguage, (language) => {
  const model = monacoEditor?.getModel()
  if (model) monaco.editor.setModelLanguage(model, language)
})

watch(lastMessageSignature, () => {
  if (isNearMessagesBottom.value) {
    scrollToBottom()
  }
})

function scrollToBottom() {
  nextTick(() => {
    const el = messagesEl.value
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'auto' })
    isNearMessagesBottom.value = true
  })
}

function isScrolledNearBottom() {
  const el = messagesEl.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < 96
}

function handleMessagesScroll() {
  isNearMessagesBottom.value = isScrolledNearBottom()
}

function focusComposerInput() {
  nextTick(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>('.composer textarea')
    textarea?.focus()
  })
}

function applyQuickPrompt(prompt: string) {
  input.value = prompt
  focusComposerInput()
}

function pickFiles() {
  fileInputEl.value?.click()
}

async function pickProjectFolder() {
  const importedProject = await chat.pickAndImportProjectFolder()
  if (importedProject) {
    await openProjectWorkspace(importedProject.id)
    ElMessage({
      message: t('chat.projectImported', { name: importedProject.name, count: importedProject.fileCount }),
      type: 'success',
      duration: 3000,
      plain: true,
    })
  }
}

function clearSessionFilters() {
  sessionSearchQuery.value = ''
  activeSessionTag.value = ''
}

function isSessionSelected(id: string) {
  return selectedSessionIdSet.value.has(id)
}

function toggleSessionSelection(id: string, checked: boolean) {
  if (checked) {
    if (!selectedSessionIdSet.value.has(id)) selectedSessionIds.value.push(id)
    return
  }
  selectedSessionIds.value = selectedSessionIds.value.filter((value) => value !== id)
}

function handleToggleSelectAllFiltered(event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  if (!checked) {
    const filteredIdSet = new Set(filteredSessionIds.value)
    selectedSessionIds.value = selectedSessionIds.value.filter((id) => !filteredIdSet.has(id))
    return
  }
  const merged = new Set(selectedSessionIds.value)
  for (const id of filteredSessionIds.value) merged.add(id)
  selectedSessionIds.value = Array.from(merged)
}

function clearSessionSelection() {
  selectedSessionIds.value = []
}

function openBatchDeleteDialog() {
  batchDeleteSearchQuery.value = ''
  clearSessionSelection()
  isBatchDeleteDialogVisible.value = true
}

function toggleSidebar() {
  isSidebarCollapsed.value = !isSidebarCollapsed.value
  localStorage.setItem('twentys1x:left-sidebar-collapsed', String(isSidebarCollapsed.value))
}

function selectSession(id: string) {
  chat.setActiveSession(id)
  if (isMobileLayout.value) isSidebarCollapsed.value = true
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

function getExtensionFromMime(type: string) {
  const normalized = String(type || '').toLowerCase()
  if (!normalized.includes('/')) return ''
  const subtype = normalized.split('/')[1] || ''
  if (!subtype) return ''
  const safeSubtype = subtype.split('+')[0]
  if (safeSubtype === 'jpeg') return 'jpg'
  return safeSubtype
}

function normalizePastedFile(file: File) {
  if (file.name) return file
  const ext = getExtensionFromMime(file.type)
  const stamp = Date.now()
  const fallbackName = ext ? `pasted-${stamp}.${ext}` : `pasted-${stamp}.bin`
  return new File([file], fallbackName, {
    type: file.type || 'application/octet-stream',
    lastModified: file.lastModified || Date.now(),
  })
}

async function handleComposerPaste(event: ClipboardEvent) {
  const clipboard = event.clipboardData
  if (!clipboard) return

  const pastedFromItems = Array.from(clipboard.items || [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))
    .map(normalizePastedFile)

  const pastedFiles =
    pastedFromItems.length > 0
      ? pastedFromItems
      : Array.from(clipboard.files || [])
          .filter((file) => file.size > 0)
          .map(normalizePastedFile)

  if (!pastedFiles.length) return
  event.preventDefault()
  await chat.prepareFiles(pastedFiles)
}

async function analyzeProject() {
  const analyzed = await chat.analyzeActiveProject()
  if (analyzed) scrollToBottom()
}

async function handleTreeNodeClick(node: any) {
  if (node.isDirectory) return
  isEditingFile.value = false
  resetCodeRunner()
  attachmentPreview.value = null
  isWorkspaceCollapsed.value = false
  setCodePreviewVisible(true)
  await chat.loadProjectFile(node.path)
  await nextTick()
  clampPanelWidths()
}

async function openAttachmentPreview(attachment: ChatAttachment) {
  if (!attachment.dataUrl || attachment.kind === 'text') return
  attachmentPreview.value = attachment
  isEditingFile.value = false
  resetCodeRunner()
  isWorkspaceCollapsed.value = false
  setCodePreviewVisible(true)
  await nextTick()
  clampPanelWidths()
}

async function selectProjectFromSidebar(projectId: string) {
  if (!projectId) {
    chat.setActiveProject('')
    if (isMobileLayout.value) isSidebarCollapsed.value = true
    return
  }
  await openProjectWorkspace(projectId)
  if (isMobileLayout.value) isSidebarCollapsed.value = true
}

async function openProjectWorkspace(projectId: string) {
  chat.setActiveProject(projectId)
  isWorkspaceCollapsed.value = isMobileLayout.value ? true : false
  await chat.refreshActiveProjectTree()
  await nextTick()
  clampPanelWidths()
}

function syncMobileLayout() {
  const isMobile = window.matchMedia('(max-width: 860px)').matches
  if (isMobileLayout.value === isMobile) return
  isMobileLayout.value = isMobile
  if (isMobile) {
    isSidebarCollapsed.value = true
    isWorkspaceCollapsed.value = true
  }
}

async function confirmDeleteProject(projectId: string, projectName: string) {
  await ElMessageBox.confirm(
    `<div class="military-dialog-content"><p>${t('chat.deleteProjectDesc')}</p><p class="emphasis">${t('chat.dialogActiveObject', { target: `${escapeHtml(projectName)}（${escapeHtml(projectId)}）` })}</p></div>`,
    t('chat.deleteProject'),
    {
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel'),
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

function showModeToast(config: {
  icon: string
  title: string
  desc: string
  type: 'success' | 'info' | 'warning'
}) {
  ElMessage({
    dangerouslyUseHTMLString: true,
    message: `<div class="t1-mode-toast">
      <div class="t1-mode-toast-icon">${config.icon}</div>
      <div class="t1-mode-toast-body">
        <div class="t1-mode-toast-title">${config.title}</div>
        <div class="t1-mode-toast-desc">${config.desc}</div>
      </div>
    </div>`,
    type: config.type,
    duration: 2800,
    showClose: true,
    customClass: 't1-mode-toast-msg',
  })
}

function toggleEnableTools() {
  const next = !chat.enableTools
  chat.setEnableTools(next)
  showModeToast(
    next
      ? { icon: '🔧', title: t('chat.toolToastOnTitle'), desc: t('chat.toolToastOnDesc'), type: 'success' }
      : { icon: '⚪', title: t('chat.toolToastOffTitle'), desc: t('chat.toolToastOffDesc'), type: 'info' },
  )
}

function toggleEnablePlanning() {
  const next = !chat.enablePlanning
  chat.setEnablePlanning(next)
  showModeToast(
    next
      ? {
          icon: '🎯',
          title: t('chat.planningToastOnTitle'),
          desc: t('chat.planningToastOnDesc'),
          type: 'warning',
        }
      : {
          icon: '⚪',
          title: t('chat.planningToastOffTitle'),
          desc: t('chat.planningToastOffDesc'),
          type: 'info',
        },
  )
}

async function submit() {
  const content = input.value
  input.value = '' // 点击发送后立即清空输入框
  scrollToBottom() // 立即滚动到底部以显示用户刚发出的消息

  const sent = chat.enablePlanning
    ? await chat.sendPlanMessage(content)
    : await chat.sendMessage(content, {
        composerTemplate: activeComposerTemplate.value,
      })
  if (sent) {
    scrollToBottom()
  } else {
    // 如果发送失败拦截，则恢复输入的内容
    input.value = content
  }
}

function applyPromptTemplate(payload: Pick<PromptTemplate, 'id' | 'name' | 'content'>) {
  activeComposerTemplate.value = payload
  focusComposerInput()
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
  if (event instanceof KeyboardEvent) {
    if (event.shiftKey) return
    // 中文输入法选词阶段按回车不应触发发送
    if (event.isComposing || event.keyCode === 229 || event.key === 'Process') return
  }
  event.preventDefault()
  submit()
}

async function confirmClear() {
  await ElMessageBox.confirm(
    `<div class="military-dialog-content"><p>${t('chat.clearHistoryDesc1')}</p><p>${t('chat.clearHistoryDesc2')}</p><p class="emphasis">${t('chat.dialogActiveObject', { target: activeProjectObjectLabel.value })}</p></div>`,
    t('chat.clearHistory'),
    {
      confirmButtonText: t('chat.clearHistory'),
      cancelButtonText: t('common.cancel'),
      dangerouslyUseHTMLString: true,
      customClass: 'military-dialog military-dialog--danger',
    },
  )
  chat.clearAllSessions()
  clearSessionSelection()
}

async function confirmBatchDeleteSessions() {
  if (!canBatchDeleteSessions.value) return
  const targetIds = [...selectedSessionIds.value]
  const deletedCount = targetIds.length
  await ElMessageBox.confirm(
    t('session.batchDeleteConfirm', { count: deletedCount }),
    t('session.batchDeleteConfirmTitle'),
    {
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    },
  )
  for (const id of targetIds) {
    chat.deleteSession(id)
  }
  ElMessage.success(t('session.batchDeleted', { count: deletedCount }))
  clearSessionSelection()
  isBatchDeleteDialogVisible.value = false
}

async function exportActiveSessionMarkdown() {
  exportLoading.value = 'markdown'
  await nextTick()
  try {
    downloadText(
      `${safeFileName(chat.activeSession.title)}.md`,
      exportSessionMarkdown(chat.activeSession),
      'text/markdown;charset=utf-8',
    )
  } finally {
    exportLoading.value = null
  }
}

async function exportFilteredSessionsJson() {
  exportLoading.value = 'json'
  await nextTick()
  try {
    const sessions = filteredSessions.value.length ? filteredSessions.value : chat.sessions
    downloadText('twentys1x-sessions.json', exportSessionsJson(sessions), 'application/json;charset=utf-8')
  } finally {
    exportLoading.value = null
  }
}

const importFileInput = ref<HTMLInputElement | null>(null)

function triggerImportJson() {
  importFileInput.value?.click()
}

async function handleImportJson(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file) return

  try {
    const text = await file.text()
    const result = chat.importSessions(text)
    const imported = result.imported || 0
    const skipped = result.skipped || 0
    if (imported > 0) {
      ElMessage({
        message: t('chat.importSuccess', { imported, skipped }),
        type: 'success',
        duration: 3000,
        plain: true,
      })
    }
    if (result.errors?.length) {
      ElMessage({
        message: result.errors.join('; '),
        type: 'warning',
        duration: 5000,
        plain: true,
      })
    }
  } catch (err) {
    ElMessage({
      message: err instanceof Error ? err.message : '导入失败',
      type: 'error',
      duration: 3000,
      plain: true,
    })
  }
}

function buildSessionPdfHtml(): string {
  const session = chat.activeSession
  const title = escapeHtml(session.title || 'Chat Session')
  const lines: string[] = [
    '<!DOCTYPE html><html><head><meta charset="utf-8"><style>',
    'body{font-family:system-ui,-apple-system,sans-serif;color:#1f2a23;background:#fff;padding:40px;max-width:800px;margin:0 auto;line-height:1.6}',
    'h1{font-size:22px;margin-bottom:8px;color:#17201a}',
    '.meta{font-size:12px;color:#6b7f72;margin-bottom:24px;border-bottom:1px solid #e4eae6;padding-bottom:12px}',
    '.msg{margin-bottom:16px}',
    '.speaker{font-weight:600;font-size:13px;color:#34604e;margin-bottom:4px}',
    '.text{font-size:14px;white-space:pre-wrap;word-break:break-word}',
    'pre{background:#f5f7f5;padding:12px;border-radius:8px;overflow-x:auto;font-size:13px}',
    'code{background:rgba(23,32,26,0.06);padding:0.15em 0.4em;border-radius:5px;font-size:0.85em}',
    '</style></head><body>',
    `<h1>${title}</h1>`,
    `<p class="meta">Created: ${escapeHtml(session.createdAt || '')} | Updated: ${escapeHtml(session.updatedAt || '')}${session.tags?.length ? ' | Tags: ' + escapeHtml(session.tags.join(', ')) : ''}</p>`,
  ]

  for (const msg of session.messages) {
    const speaker = msg.role === 'user' ? 'User' : 'Assistant'
    const rawText = typeof msg.content === 'string' ? msg.content : ''
    // Wrap raw text preserving line breaks
    const textHtml = rawText
      .split('\n')
      .map((line) => escapeHtml(line))
      .join('<br>')
    lines.push(
      `<div class="msg"><div class="speaker">${speaker} · ${escapeHtml(msg.createdAt || '')}</div>`,
      `<div class="text">${textHtml}</div></div>`,
    )
  }

  lines.push('</body></html>')
  return lines.join('\n')
}

async function exportActiveSessionPdf() {
  exportLoading.value = 'pdf'
  await nextTick()
  try {
    const title = chat.activeSession.title || 'Chat Session'
    const fileName = `${safeFileName(title)}.pdf`

    // Try server-side Puppeteer endpoint first
    try {
      const html = buildSessionPdfHtml()
      const response = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html }),
      })
      if (response.ok) {
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        link.click()
        URL.revokeObjectURL(url)
        return
      }
    } catch {
      // Server endpoint failed, fall through to client-side
    }

    // Fallback: client-side html2canvas + jspdf
    const session = chat.activeSession
    const container = document.createElement('div')
    container.style.cssText =
      'padding: 40px; max-width: 800px; margin: 0 auto; font-family: system-ui, -apple-system, sans-serif; color: #1f2a23; background: #fff;'
    const metaTags = session.tags?.length ? ` | Tags: ${escapeHtml(session.tags.join(', '))}` : ''
    container.innerHTML = `
      <h1 style="font-size: 22px; margin-bottom: 8px; color: #17201a;">${escapeHtml(title)}</h1>
      <p style="font-size: 12px; color: #6b7f72; margin-bottom: 24px; border-bottom: 1px solid #e4eae6; padding-bottom: 12px;">
        Created: ${session.createdAt || ''} | Updated: ${session.updatedAt || ''}${metaTags}
      </p>
    `

    for (const msg of session.messages) {
      const speaker = msg.role === 'user' ? 'User' : 'Assistant'
      const text = typeof msg.content === 'string' ? msg.content : ''
      const block = document.createElement('div')
      block.style.cssText = 'margin-bottom: 16px;'
      block.innerHTML = `
        <div style="font-weight: 600; font-size: 13px; color: #34604e; margin-bottom: 4px;">${speaker} · ${msg.createdAt || ''}</div>
        <div style="font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word;">${escapeHtml(text)}</div>
      `
      container.appendChild(block)
    }

    document.body.appendChild(container)
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    try {
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      })

      const imgData = canvas.toDataURL('image/png')
      const imgWidth = 210
      const pageHeight = 297
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      const pdf = new jsPDF('p', 'mm', 'a4')
      let heightLeft = imgHeight
      let position = 0

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight

      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }

      pdf.save(fileName)
    } catch (err) {
      ElMessage({
        message: `PDF export failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        type: 'error',
        duration: 4000,
        plain: true,
      })
    } finally {
      document.body.removeChild(container)
      document.body.style.overflow = originalOverflow
    }
  } finally {
    exportLoading.value = null
  }
}

async function summarizeActiveSession() {
  const summarized = await chat.summarizeActiveSession()
  if (summarized) scrollToBottom()
}

function toggleSessionManager() {
  isSessionManagerCollapsed.value = !isSessionManagerCollapsed.value
  localStorage.setItem('twentys1x:session-manager-collapsed', String(isSessionManagerCollapsed.value))
}

function toggleProjectPanel() {
  isProjectPanelCollapsed.value = !isProjectPanelCollapsed.value
  projectPanelUserToggled.value = true
  localStorage.setItem(PROJECT_PANEL_COLLAPSE_KEY, String(isProjectPanelCollapsed.value))
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
    console.error(t('chat.copiedSummaryFailed'), err)
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

function detectMonacoLanguage(filePath: string) {
  const extension = getFileExtension(filePath || '')
  const languageByExt: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    mjs: 'javascript',
    cjs: 'javascript',
    vue: 'html',
    html: 'html',
    xml: 'xml',
    svg: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'scss',
    less: 'less',
    json: 'json',
    yml: 'yaml',
    yaml: 'yaml',
    md: 'markdown',
    sh: 'shell',
    bash: 'shell',
    py: 'python',
    sql: 'sql',
  }
  return languageByExt[extension] || 'plaintext'
}

function highlightCode(code: string, language: string) {
  const safeCode = String(code || '')
  const grammar = Prism.languages[language]
  if (!safeCode) return ''
  if (!grammar) return escapeHtml(safeCode)
  return DOMPurify.sanitize(Prism.highlight(safeCode, grammar, language))
}

function ensureMonacoEditor() {
  if (!monacoEditorEl.value || attachmentPreview.value || !chat.activeFilePath) return
  if (monacoEditor) {
    monacoEditor.layout()
    return
  }

  monaco.editor.defineTheme('twentys1x-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '8b948e' },
      { token: 'keyword', foreground: '5a5f32' },
      { token: 'string', foreground: '456846' },
      { token: 'number', foreground: '7a6234' },
      { token: 'type', foreground: '2f5a4c' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#1f2a23',
      'editorLineNumber.foreground': '#8f9691',
      'editor.lineHighlightBackground': '#f5f8f4',
      'editor.selectionBackground': '#c9decf',
      'editorCursor.foreground': '#2d5848',
    },
  })

  monacoEditor = monaco.editor.create(monacoEditorEl.value, {
    value: chat.editedFileContent,
    language: activeFileMonacoLanguage.value,
    theme: 'twentys1x-light',
    automaticLayout: true,
    fontFamily: "'JetBrains Mono', ui-monospace, 'Cascadia Mono', 'Segoe UI Mono', monospace",
    fontSize: 12,
    lineHeight: 19,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    tabSize: 2,
    wordWrap: 'off',
    renderWhitespace: 'selection',
    fixedOverflowWidgets: true,
  })
  monacoChangeDisposable = monacoEditor.onDidChangeModelContent(() => {
    chat.editedFileContent = monacoEditor?.getValue() || ''
    chat.activeFileDiff = ''
  })
}

function disposeMonacoEditor() {
  monacoChangeDisposable?.dispose()
  monacoChangeDisposable = null
  monacoEditor?.dispose()
  monacoEditor = null
}

function closeCodePreview() {
  attachmentPreview.value = null
  resetCodeRunner()
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
    console.error(t('chat.copyFailed'), err)
  }
}

async function copyCodeBlock(messageId: string, code: string, blockIndex: number) {
  try {
    await navigator.clipboard.writeText(code)
    copiedCodeBlock.value = { id: messageId, index: blockIndex }
    setTimeout(() => (copiedCodeBlock.value = null), 2000)
  } catch (err) {
    console.error(t('chat.copyCodeFailed'), err)
  }
}

async function saveActiveFileFromMonaco() {
  const saved = await chat.applyActiveFileWrite()
  if (saved) isEditingFile.value = false
}

async function previewActiveFileDiffFromMonaco() {
  await chat.previewActiveFileDiff()
}

async function runActiveCode() {
  if (!canRunActiveFile.value || codeRunStatus.value === 'running') return

  codeRunStatus.value = 'running'
  codeRunLogs.value = [t('chat.runnerStarting')]
  codeRunPreviewHtml.value = ''

  try {
    const language = activeFileMonacoLanguage.value
    const source = chat.editedFileContent
    const runnableSource = language === 'typescript' ? await transpileTypeScriptForBrowser(source) : source
    codeRunPreviewHtml.value = buildCodeRunnerHtml(runnableSource, language)
  } catch (error) {
    codeRunStatus.value = 'error'
    codeRunLogs.value.push(
      formatRunnerMessage('error', error instanceof Error ? error.message : String(error)),
    )
  }
}

async function transpileTypeScriptForBrowser(source: string) {
  const ts = await import('typescript')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
      isolatedModules: true,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
  })
  const diagnostics = output.diagnostics || []
  const blocking = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
  if (blocking.length) {
    throw new Error(
      blocking.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('\n'),
    )
  }
  return output.outputText
}

function buildCodeRunnerHtml(source: string, language: string) {
  const escapedSource = JSON.stringify(source)
  const closeScript = '</' + 'script>'
  if (language === 'html') return buildHtmlRunner(source)
  if (language === 'css') {
    return buildHtmlRunner(
      `<!doctype html><style>${source}</style><main class="runner-css-preview">${t('chat.cssInjected')}</main>`,
    )
  }
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><style>${runnerBaseCss()}</style></head>
<body>
  <main id="app">${t('chat.codeRunning')}</main>
  <script>${runnerBridgeScript()}${closeScript}
  <script type="module">
    const source = ${escapedSource};
    const blob = new Blob([source], { type: 'text/javascript' });
    import(URL.createObjectURL(blob))
      .then(() => window.__twentys1xDone())
      .catch((error) => window.__twentys1xFail(error));
  ${closeScript}
</body>
</html>`
}

function buildHtmlRunner(html: string) {
  const bridge = `<script>${runnerBridgeScript()}${'</' + 'script>'}`
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${bridge}</body>`)
  return `<!doctype html><html><head><meta charset="utf-8"><style>${runnerBaseCss()}</style></head><body>${html}${bridge}</body></html>`
}

function runnerBridgeScript() {
  return `
const send = (type, payload) => parent.postMessage({ source: 'twentys1x-code-runner', type, payload }, '*');
const format = (items) => items.map((item) => {
  if (item instanceof Error) return item.stack || item.message;
  if (typeof item === 'string') return item;
  try { return JSON.stringify(item, null, 2); } catch { return String(item); }
}).join(' ');
['log', 'info', 'warn', 'error'].forEach((level) => {
  const original = console[level].bind(console);
  console[level] = (...items) => {
    original(...items);
    send('log', { level, message: format(items) });
  };
});
window.__twentys1xDone = () => send('done', {});
window.__twentys1xFail = (error) => send('error', { message: error?.stack || error?.message || String(error) });
window.addEventListener('error', (event) => send('error', { message: event.error?.stack || event.message }));
window.addEventListener('unhandledrejection', (event) => send('error', { message: event.reason?.stack || event.reason?.message || String(event.reason) }));
send('ready', {});
`
}

function runnerBaseCss() {
  return 'body{margin:0;padding:18px;font:14px/1.5 system-ui,sans-serif;color:#1f2a23;background:#fff}.runner-css-preview{padding:18px;border:1px dashed #9eb2a4;border-radius:8px;color:#456846}'
}

function handleCodeRunnerMessage(event: MessageEvent) {
  const data = event.data
  if (!data || data.source !== 'twentys1x-code-runner') return
  if (data.type === 'ready') {
    codeRunLogs.value.push(formatRunnerMessage('info', t('chat.runnerReady')))
    return
  }
  if (data.type === 'log') {
    codeRunLogs.value.push(formatRunnerMessage(data.payload?.level || 'log', data.payload?.message || ''))
    return
  }
  if (data.type === 'done') {
    codeRunStatus.value = 'success'
    codeRunLogs.value.push(formatRunnerMessage('info', t('chat.runnerDone')))
    return
  }
  if (data.type === 'error') {
    codeRunStatus.value = 'error'
    codeRunLogs.value.push(formatRunnerMessage('error', data.payload?.message || t('chat.runnerFailed')))
  }
}

function handleLocaleChange(value: string) {
  setLocale(value as AppLocale)
}

function formatRunnerMessage(level: string, message: string) {
  return `[${level}] ${message}`
}

function resetCodeRunner() {
  codeRunStatus.value = 'idle'
  codeRunLogs.value = []
  codeRunPreviewHtml.value = ''
}

async function copyDebugOutput() {
  if (!codeRunLogs.value.length) return
  await navigator.clipboard.writeText(codeRunLogs.value.join('\n'))
  copiedDebugOutput.value = true
  setTimeout(() => (copiedDebugOutput.value = false), 2000)
}

async function regenerateMessage(messageId: string) {
  stopGeneration()
  cancelInlineEdit()

  const regenerated = await chat.regenerateMessage(messageId)
  if (regenerated) {
    scrollToBottom()
  }
}
</script>

<template>
  <div
    ref="appShellEl"
    class="app-shell"
    :class="{
      'is-resizing': isDraggingPanels,
      'workspace-tree-hidden': isWorkspaceCollapsed,
      'is-sidebar-collapsed': isSidebarCollapsed,
    }"
    :style="appShellViewStyle"
  >
    <aside class="sidebar">
      <div class="brand">
        <div class="logo-mark" style="cursor: pointer" @click="chat.newSession">T1</div>
        <div>
          <strong>Twentys1x</strong>
          <span>AI Studio</span>
        </div>
      </div>

      <section
        class="project-panel"
        :class="{ 'is-collapsed': isProjectPanelCollapsed }"
        :aria-label="t('chat.project')"
      >
        <div class="project-panel-toolbar">
          <button
            type="button"
            class="project-panel-header"
            :aria-expanded="!isProjectPanelCollapsed"
            @click="toggleProjectPanel"
          >
            <span class="project-panel-title">
              <el-icon><Files /></el-icon>
              {{ t('chat.project') }}
            </span>
            <span class="project-panel-meta">{{ projectPanelMetaText }}</span>
            <el-icon
              class="project-panel-chevron t1-chevron"
              :class="{ 'is-expanded': !isProjectPanelCollapsed }"
            >
              <ArrowDown />
            </el-icon>
          </button>
          <el-button
            class="panel-icon-button"
            :icon="FolderAdd"
            text
            :title="t('chat.importProjectFolder')"
            :loading="chat.isImportingProject"
            @click.stop="pickProjectFolder"
          />
        </div>
        <div class="t1-collapse-wrap" :class="{ 'is-open': !isProjectPanelCollapsed }">
          <div class="t1-collapse-inner">
            <div class="project-panel-body">
              <div class="project-list">
                <button
                  type="button"
                  class="project-item"
                  :class="{ active: !chat.activeProjectId }"
                  @click="selectProjectFromSidebar('')"
                >
                  <el-icon><Promotion /></el-icon>
                  <span>{{ t('chat.normalChat') }}</span>
                  <small>{{ t('chat.noProjectLink') }}</small>
                </button>

                <button
                  v-for="project in chat.projects"
                  :key="project.id"
                  type="button"
                  class="project-item"
                  :class="{ active: project.id === chat.activeProjectId }"
                  @click="selectProjectFromSidebar(project.id)"
                >
                  <el-icon><Files /></el-icon>
                  <span>{{ project.name }}</span>
                  <small>{{ t('chat.fileCount', { count: project.fileCount }) }}</small>
                  <el-icon
                    class="delete-project"
                    :title="t('chat.deleteProject')"
                    @click.stop="confirmDeleteProject(project.id, project.name)"
                  >
                    <Delete />
                  </el-icon>
                </button>
                <button
                  v-if="!chat.projects.length"
                  type="button"
                  class="project-empty"
                  @click="pickProjectFolder"
                >
                  {{ t('chat.importProjectCta') }}
                </button>
              </div>
              <el-button
                class="analyze-project-button"
                plain
                :disabled="!chat.activeProject"
                :loading="chat.isAnalyzingProject"
                @click="analyzeProject"
              >
                {{ t('chat.analyzeProject') }}
              </el-button>
            </div>
          </div>
        </div>
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
        :aria-label="t('chat.sessionManager')"
      >
        <button
          type="button"
          class="session-manager-header"
          :aria-expanded="!isSessionManagerCollapsed"
          @click="toggleSessionManager"
        >
          <span class="session-manager-title">
            <el-icon><Search /></el-icon>
            {{ t('chat.sessionManager') }}
          </span>
          <span class="session-manager-count">{{ filteredSessions.length }}/{{ chat.sessions.length }}</span>
          <el-icon
            class="session-manager-chevron t1-chevron"
            :class="{ 'is-expanded': !isSessionManagerCollapsed }"
          >
            <ArrowDown />
          </el-icon>
        </button>

        <div class="t1-collapse-wrap" :class="{ 'is-open': !isSessionManagerCollapsed }">
          <div class="t1-collapse-inner">
            <div class="session-manager-body">
              <el-input
                v-model="sessionSearchQuery"
                class="session-search"
                clearable
                :prefix-icon="Search"
                :placeholder="t('chat.sessionSearchPlaceholder')"
              />
              <SessionTagVirtualFilter
                v-if="chat.allSessionTags.length"
                v-model="activeSessionTag"
                :tags="chat.allSessionTags"
                :all-label="t('common.all')"
              />
              <div class="session-export-actions">
                <el-button
                  size="small"
                  plain
                  :icon="Download"
                  :loading="exportLoading === 'markdown'"
                  @click="exportActiveSessionMarkdown"
                  >{{ t('chat.exportCurrent') }}</el-button
                >
                <el-button
                  size="small"
                  plain
                  :icon="Download"
                  :loading="exportLoading === 'json'"
                  @click="exportFilteredSessionsJson"
                  >{{ t('chat.exportList') }}</el-button
                >
                <el-button
                  size="small"
                  plain
                  :icon="Download"
                  :loading="exportLoading === 'pdf'"
                  @click="exportActiveSessionPdf"
                  >{{ t('chat.exportPdf') }}</el-button
                >
                <el-button size="small" plain :icon="UploadFilled" @click="triggerImportJson">{{
                  t('chat.importJson')
                }}</el-button>
                <el-button size="small" plain type="danger" :icon="Delete" @click="openBatchDeleteDialog">{{
                  t('session.batchDelete')
                }}</el-button>
                <input
                  ref="importFileInput"
                  type="file"
                  accept=".json"
                  style="display: none"
                  @change="handleImportJson"
                />
              </div>
              <label class="session-tag-editor">
                <span>{{ t('chat.currentSessionTags') }}</span>
                <el-input
                  v-model="activeSessionTagsText"
                  size="small"
                  :placeholder="t('chat.customSessionTags')"
                />
              </label>
              <div class="session-summary-card" :class="{ empty: !chat.activeSession.summary }">
                <div class="session-summary-head">
                  <span>{{ t('chat.smartSummary') }}</span>
                  <div class="session-summary-actions">
                    <el-button
                      v-if="chat.activeSession.summary"
                      class="summary-more-button"
                      size="small"
                      text
                      :icon="MoreFilled"
                      :aria-label="t('chat.viewFullSummary')"
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
                      {{ chat.activeSession.summary ? t('chat.update') : t('chat.generate') }}
                    </el-button>
                  </div>
                </div>
                <p v-if="chat.activeSession.summary">{{ chat.activeSession.summary.content }}</p>
                <p v-else>{{ t('chat.summaryEmpty') }}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <nav class="sessions" :aria-label="t('chat.historySessions')">
        <SessionItem
          v-for="session in filteredSessions"
          :key="session.id"
          :session="session"
          :active="session.id === chat.activeSessionId"
          @select="selectSession"
        />
        <button
          v-if="chat.sessions.length && !filteredSessions.length"
          type="button"
          class="session-empty-filter"
          @click="clearSessionFilters"
        >
          {{ t('chat.clearFilter') }}
        </button>
      </nav>

      <SettingsPanel
        :providers="chat.providers"
        :selected-provider-id="chat.selectedProviderId"
        :selected-provider="chat.selectedProvider"
        :api-key="chat.apiKey"
        :model="chat.model"
        :current-model-options="chat.currentModelOptions"
        :inference-mode="chat.inferenceMode"
        :local-model="chat.localModel"
        :local-model-options="chat.localModelOptions"
        :local-model-status="chat.localModelStatus"
        :hybrid-fallback-to-cloud="chat.hybridFallbackToCloud"
        :is-refreshing-local-models="chat.isRefreshingLocalModels"
        @select-provider="selectProvider"
        @update-api-key="chat.setApiKey"
        @select-model="selectModel"
        @select-inference-mode="chat.setInferenceMode"
        @select-local-model="chat.setLocalModel"
        @update-hybrid-fallback="chat.setHybridFallbackToCloud"
        @refresh-local-models="chat.refreshLocalModels"
        @clear-history="confirmClear"
      />
    </aside>

    <div
      v-if="isMobileLayout"
      class="mobile-sidebar-backdrop"
      :class="{ 'is-visible': !isSidebarCollapsed }"
      @click="toggleSidebar"
    ></div>

    <el-button
      class="sidebar-toggle-button"
      :icon="isSidebarCollapsed ? Expand : Fold"
      :title="isSidebarCollapsed ? t('chat.expandSidebar') : t('chat.collapseSidebar')"
      :aria-label="isSidebarCollapsed ? t('chat.expandSidebar') : t('chat.collapseSidebar')"
      circle
      @click="toggleSidebar"
    />

    <el-dialog
      v-model="isBatchDeleteDialogVisible"
      class="session-batch-delete-dialog"
      :title="t('session.batchDeleteDialogTitle')"
      width="min(760px, 92vw)"
      align-center
    >
      <div class="session-batch-delete-body">
        <div class="session-batch-delete-toolbar">
          <el-input
            v-model="batchDeleteSearchQuery"
            class="session-batch-delete-search"
            clearable
            :prefix-icon="Search"
            :placeholder="t('session.batchDeleteSearchPlaceholder')"
          />
          <label class="session-batch-select-all">
            <input
              class="session-select-checkbox"
              type="checkbox"
              :checked="isAllFilteredSessionsSelected"
              :disabled="!batchDeleteFilteredSessions.length"
              @change="handleToggleSelectAllFiltered"
            />
            <span>{{ t('session.selectAllFiltered') }}</span>
          </label>
          <span class="session-batch-count">{{
            t('session.selectedCount', { count: selectedSessionCount })
          }}</span>
        </div>
        <div v-if="batchDeleteFilteredSessions.length" class="session-batch-delete-list">
          <label
            v-for="session in batchDeleteFilteredSessions"
            :key="session.id"
            class="session-batch-delete-item"
            :class="{ selected: isSessionSelected(session.id) }"
          >
            <input
              class="session-select-checkbox"
              type="checkbox"
              :checked="isSessionSelected(session.id)"
              @change="toggleSessionSelection(session.id, ($event.target as HTMLInputElement).checked)"
            />
            <span class="session-batch-delete-item-main">
              <span class="session-batch-delete-item-title">{{ session.title }}</span>
              <span class="session-batch-delete-item-meta">
                {{ session.updatedAt.replace('T', ' ').slice(0, 16) }} ·
                {{ t('session.messagesCount', { count: session.messages.length }) }}
              </span>
            </span>
          </label>
        </div>
        <div v-else class="session-batch-delete-empty">
          {{ t('session.batchDeleteEmpty') }}
        </div>
      </div>
      <template #footer>
        <div class="session-batch-delete-footer">
          <el-button @click="isBatchDeleteDialogVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button type="danger" :disabled="!canBatchDeleteSessions" @click="confirmBatchDeleteSessions">
            {{ t('session.batchDelete') }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="isSummaryDialogVisible"
      class="summary-dialog"
      :title="t('chat.smartSummary')"
      width="min(640px, 92vw)"
    >
      <el-input
        v-model="summaryDraft"
        class="summary-editor"
        type="textarea"
        :rows="12"
        resize="vertical"
        :placeholder="t('chat.editSummary')"
      />
      <template #footer>
        <div class="summary-dialog-actions">
          <el-button
            plain
            :icon="copiedSummary ? Check : CopyDocument"
            :disabled="!summaryDraft.trim()"
            @click="copySummaryDraft"
          >
            {{ copiedSummary ? t('common.copied') : t('common.copy') }}
          </el-button>
          <el-button @click="isSummaryDialogVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" :disabled="!summaryDraft.trim()" @click="saveSummaryDraft">{{
            t('common.save')
          }}</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="isErrorDialogVisible"
      class="t1-error-dialog"
      width="min(520px, 92vw)"
      :show-close="true"
      align-center
    >
      <div class="t1-error-dialog-body">
        <div class="t1-error-dialog-icon" aria-hidden="true">
          <el-icon><CircleClose /></el-icon>
        </div>
        <div class="t1-error-dialog-copy">
          <h3>{{ t('chat.errorDialogTitle') }}</h3>
          <p class="t1-error-dialog-description">{{ t('chat.errorDialogDescription') }}</p>
          <p class="t1-error-dialog-message">{{ chat.errorMessage }}</p>
        </div>
      </div>
      <template #footer>
        <div class="t1-error-dialog-actions">
          <el-button type="primary" @click="chat.clearErrorMessage()">
            {{ t('chat.errorDialogAcknowledge') }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <div
      v-if="!isSidebarCollapsed"
      class="panel-resizer left"
      :title="t('chat.collapseSidebar')"
      @mousedown="startResize('left', $event)"
    ></div>

    <main
      id="main-content"
      class="chat-area"
      :class="{ 'is-empty-chat': !chat.visibleMessages.length }"
      tabindex="-1"
    >
      <header class="topbar">
        <div class="topbar-title">
          <!-- <p>当前会话</p> -->
          <h4 :title="chat.activeSession.title">{{ chat.activeSession.title }}</h4>
          <!-- <div class="active-project-indicator">当前项目：{{ activeProjectObjectLabel }}</div> -->
        </div>
        <div class="topbar-actions">
          <el-button
            v-if="isMobileLayout"
            class="topbar-icon-button mobile-new-chat-btn"
            :icon="Plus"
            :title="t('chat.newSession')"
            :aria-label="t('chat.newSession')"
            circle
            @click="chat.newSession"
          />
          <div v-if="auth.currentUser" class="topbar-user" :title="auth.currentUser.phone">
            <span class="topbar-user-avatar">{{ auth.currentUser.avatarText }}</span>
            <span class="topbar-user-name">{{ auth.currentUser.name }}</span>
          </div>
          <el-tag :type="chat.isProviderReady ? 'success' : 'warning'" round>
            {{ providerStatusText }}
          </el-tag>
          <el-select
            class="topbar-locale-select"
            :model-value="locale"
            size="small"
            :aria-label="t('common.language')"
            @change="handleLocaleChange"
          >
            <el-option
              v-for="item in localeOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <el-button
            class="topbar-icon-button"
            :icon="isWorkspaceCollapsed ? Expand : Fold"
            :title="isWorkspaceCollapsed ? t('chat.expandFileTree') : t('chat.collapseFileTree')"
            :aria-label="isWorkspaceCollapsed ? t('chat.expandFileTree') : t('chat.collapseFileTree')"
            circle
            @click="toggleWorkspaceTree"
          />
          <el-button
            class="topbar-icon-button"
            :icon="SwitchButton"
            :title="t('chat.logout')"
            :aria-label="t('chat.logout')"
            circle
            @click="logout"
          />
        </div>
      </header>

      <div
        ref="messagesEl"
        class="messages"
        :aria-label="t('chat.messages')"
        role="log"
        aria-live="polite"
        @scroll="handleMessagesScroll"
      >
        <div v-if="!chat.visibleMessages.length" class="empty-state">
          <div class="empty-logo">T1</div>
          <h2>{{ t('chat.emptyStateTitle') }}</h2>
          <p>{{ t('chat.emptyStateDescription') }}</p>
          <div class="empty-state-status">
            <span class="empty-status-chip">{{ providerStatusText }}</span>
            <span class="empty-status-chip">{{ modeSummaryText }}</span>
            <span class="empty-status-chip">
              {{
                chat.activeProjectId ? `${t('chat.project')} · ${activeProjectLabel}` : t('chat.normalChat')
              }}
            </span>
          </div>
          <div class="empty-state-actions" :aria-label="t('chat.quickActions')">
            <button
              v-for="prompt in emptyStatePrompts"
              :key="prompt"
              type="button"
              class="empty-state-action"
              @click="applyQuickPrompt(prompt)"
            >
              {{ prompt }}
            </button>
          </div>
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
            @regenerate-message="regenerateMessage"
            @open-attachment="openAttachmentPreview"
          />
        </div>
      </div>

      <button
        v-if="showJumpToBottom"
        type="button"
        class="scroll-to-bottom-button"
        :aria-label="t('chat.scrollToLatest')"
        @click="scrollToBottom"
      >
        <el-icon><ArrowDown /></el-icon>
        {{ t('chat.scrollToLatest') }}
      </button>

      <section class="composer-wrap">
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
            >{{ t('chat.activeProject') }}<strong>{{ activeProjectLabel }}</strong></span
          >
          <el-button link @click="chat.setActiveProject('')">
            <el-icon><Close /></el-icon> {{ t('chat.exitProjectMode') }}
          </el-button>
        </div>

        <div v-if="chat.activeProjectId" class="composer-original-root-indicator">
          <span class="original-root-label">
            <el-icon><Folder /></el-icon>
            {{
              chat.activeProject?.originalRoot
                ? t('chat.originalPath', { path: chat.activeProject.originalRoot })
                : t('chat.originalPathLoading')
            }}
          </span>
        </div>

        <div v-if="activeComposerTemplate" class="composer-template-indicator">
          <span class="composer-template-indicator__label">{{ t('chat.conversationTemplate') }}</span>
          <el-tag
            class="composer-template-tag"
            closable
            type="success"
            effect="plain"
            @close="activeComposerTemplate = null"
          >
            {{ activeComposerTemplate.name }}
          </el-tag>
        </div>

        <div class="composer" @paste="handleComposerPaste">
          <div class="composer-left-actions">
            <el-button
              class="icon-button"
              :icon="Paperclip"
              circle
              :title="t('chat.addAttachment')"
              @click="pickFiles"
            />
            <el-button
              class="icon-button"
              :type="chat.enableTools ? 'primary' : 'default'"
              :icon="Tools"
              circle
              :title="chat.enableTools ? t('chat.toolsOn') : t('chat.enableTools')"
              @click="toggleEnableTools"
            />
            <el-button
              v-if="chat.activeProjectId"
              class="icon-button"
              :type="chat.enablePlanning ? 'warning' : 'default'"
              :icon="Cpu"
              circle
              :title="chat.enablePlanning ? t('chat.planningOn') : t('chat.enablePlanning')"
              @click="toggleEnablePlanning"
            />
          </div>
          <!-- === 修改：动态更新 Placeholder 文案 === -->
          <el-input
            v-model="input"
            type="textarea"
            resize="vertical"
            :autosize="{ minRows: 1, maxRows: 6 }"
            :placeholder="
              chat.activeProjectId
                ? t('chat.askProviderWithProject', {
                    provider: chat.inferenceMode === 'local' ? chat.localModel : chat.selectedProvider.name,
                    project: activeProjectLabel,
                  })
                : t('chat.askProvider', {
                    provider: chat.inferenceMode === 'local' ? chat.localModel : chat.selectedProvider.name,
                  })
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
            {{ t('common.send') }}
          </el-button>

          <el-button
            v-else
            class="send-button stop-button"
            type="danger"
            :icon="CircleClose"
            @click="stopGeneration"
          >
            {{ t('common.stop') }}
          </el-button>

          <input ref="fileInputEl" class="file-input" type="file" multiple @change="handleFiles" />
        </div>
        <div class="composer-help-row">
          <span>{{ t('chat.composerShortcutHint') }}</span>
          <span>{{ providerStatusText }}</span>
        </div>
      </section>
    </main>
    <div
      v-if="isCodePreviewVisible"
      class="panel-resizer preview"
      :title="t('chat.codePreview')"
      @mousedown="startResize('preview', $event)"
    ></div>

    <aside v-if="isCodePreviewVisible" class="code-preview-panel">
      <header class="code-preview-topbar">
        <div class="code-preview-title">
          <p>{{ attachmentPreview ? t('chat.attachmentPreview') : t('chat.codePreview') }}</p>
          <h3>{{ previewTitle }}</h3>
        </div>
        <el-button
          class="panel-icon-button"
          text
          :icon="Refresh"
          :loading="chat.isLoadingFile"
          :disabled="!chat.activeFilePath || Boolean(attachmentPreview)"
          :title="t('chat.refreshFile')"
          @click="chat.activeFilePath && chat.loadProjectFile(chat.activeFilePath, { force: true })"
        />
        <el-button
          class="panel-icon-button"
          text
          :icon="Close"
          :title="t('chat.closeCodePreview')"
          @click="closeCodePreview"
        />
      </header>

      <section class="code-preview-body">
        <div v-if="attachmentPreview" class="attachment-preview">
          <iframe
            v-if="previewKind === 'document'"
            class="attachment-preview-frame"
            :src="attachmentPreviewUrl"
            :title="attachmentPreview.name"
          ></iframe>
          <audio
            v-else-if="previewKind === 'audio'"
            class="attachment-preview-media"
            :src="attachmentPreviewUrl"
            controls
          ></audio>
          <video
            v-else-if="previewKind === 'video'"
            class="attachment-preview-video"
            :src="attachmentPreviewUrl"
            controls
          ></video>
          <img
            v-else-if="previewKind === 'image'"
            class="attachment-preview-image"
            :src="attachmentPreviewUrl"
            :alt="attachmentPreview.name"
          />
        </div>

        <div v-else-if="chat.activeFilePath" class="file-actions">
          <el-button
            size="small"
            type="primary"
            :icon="DocumentChecked"
            :loading="chat.isApplyingFileWrite"
            :disabled="!hasEditedFileChanges"
            @click="saveActiveFileFromMonaco"
          >
            {{ t('common.save') }}
          </el-button>
          <el-button
            size="small"
            plain
            :loading="chat.isPreviewingFileDiff"
            :disabled="!hasEditedFileChanges"
            @click="previewActiveFileDiffFromMonaco"
          >
            Diff
          </el-button>
          <el-button
            size="small"
            plain
            :icon="VideoPlay"
            :loading="codeRunStatus === 'running'"
            :disabled="!canRunActiveFile"
            @click="runActiveCode"
          >
            {{ t('common.run') }}
          </el-button>
          <el-button
            size="small"
            plain
            :icon="Edit"
            :loading="chat.isOpeningExternalEditor"
            @click="chat.openActiveFileInEditor('cursor')"
          >
            Cursor
          </el-button>
        </div>

        <div v-if="!attachmentPreview && chat.activeFilePath" class="code-workbench">
          <div ref="monacoEditorEl" class="monaco-editor-host" aria-label="Monaco code editor"></div>
          <section class="code-runner-panel" :class="`status-${codeRunStatus}`">
            <header class="code-runner-header">
              <span class="code-runner-title">
                <el-icon><Cpu /></el-icon>
                {{ t('chat.debug') }}
              </span>
              <span class="code-runner-status">{{ codeRunStatusLabel }}</span>
              <el-button
                class="panel-icon-button"
                text
                :icon="CopyDocument"
                :disabled="!codeRunLogs.length"
                :title="copiedDebugOutput ? t('common.copied') : t('chat.copyDebugOutput')"
                @click="copyDebugOutput"
              />
            </header>
            <iframe
              v-if="codeRunPreviewHtml"
              class="code-runner-frame"
              sandbox="allow-scripts"
              :srcdoc="codeRunPreviewHtml"
              :title="t('chat.codeSandboxTitle')"
            ></iframe>
            <pre
              class="code-runner-log"
            ><code>{{ codeRunLogs.length ? codeRunLogs.join('\n') : t('chat.runLogEmpty') }}</code></pre>
          </section>
        </div>
        <div v-else-if="!attachmentPreview" class="code-empty">{{ t('chat.chooseFilePreview') }}</div>

        <pre v-if="!attachmentPreview && chat.activeFileDiff" class="diff-preview">
          <code class="language-diff" v-html="highlightedActiveFileDiff"></code>
        </pre>
      </section>
    </aside>

    <div
      v-if="!isWorkspaceCollapsed"
      class="panel-resizer right"
      title="Workspace"
      @mousedown="startResize('right', $event)"
    ></div>

    <aside v-if="!isWorkspaceCollapsed" class="workspace-panel-right">
      <header class="workspace-topbar">
        <div>
          <p>Workspace</p>
          <h2>{{ chat.activeProject?.name || t('chat.workspaceNoProject') }}</h2>
        </div>
        <div class="workspace-topbar-actions">
          <el-button
            class="panel-icon-button"
            text
            :icon="Refresh"
            :loading="chat.isLoadingProjectTree || chat.isLoadingFile"
            :disabled="!chat.activeProject"
            :title="t('chat.refreshProjectFiles')"
            @click="chat.refreshActiveProjectFiles"
          />
          <el-button
            class="panel-icon-button"
            text
            :disabled="!canToggleCodePreview"
            :title="isCodePreviewVisible ? t('chat.hideCodePreview') : t('chat.showCodePreview')"
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
            :title="t('chat.collapseFileTree')"
            :aria-label="t('chat.collapseFileTree')"
            @click="toggleWorkspaceTree"
          />
        </div>
      </header>

      <section class="file-tree-section">
        <div class="workspace-section-title">
          <span class="workspace-files-title"
            >{{ t('chat.allFiles') }} <el-icon><ArrowDown /></el-icon
          ></span>
          <small v-if="chat.activeProject"
            >{{ chat.activeProject.chunkCount }} {{ t('common.snippets') }}</small
          >
        </div>
        <el-tree
          v-if="chat.activeProjectTree.length"
          class="project-tree"
          :data="chat.activeProjectTree"
          node-key="path"
          :props="{ label: 'name', children: 'children' }"
          :highlight-current="true"
          :expand-on-click-node="true"
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
          {{ t('chat.importProjectFirst') }}
        </button>
      </section>
    </aside>
  </div>
</template>
