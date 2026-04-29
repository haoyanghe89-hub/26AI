import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  getSecureJson,
  getStoredJson,
  getStoredString,
  setSecureJson,
  setStoredJson,
  setStoredString,
} from '../lib/clientStorage'
import { requestWithRetry } from '../lib/request'
import {
  BUILTIN_AGENTS,
  BUILTIN_PROMPT_TEMPLATES,
  BUILTIN_WORKFLOWS,
  DEFAULT_AGENT_ID,
  buildPromptRuntimeConfig,
  normalizeAgent,
  normalizePromptTemplate,
  normalizeWorkflow,
  renderPromptTemplate,
  wrapComposerTemplate,
  type CustomAgent,
  type PromptRuntimeConfig,
  type PromptTemplate,
  type PromptWorkflow,
} from '../lib/promptEngineering'
import {
  buildHeuristicSessionTags,
  buildSessionSummaryPrompt,
  buildSessionTagsPrompt,
  normalizeTags,
  parseAutoSessionTagsResponse,
} from '../lib/sessionManagement'

type Role = 'user' | 'assistant'
export type ProviderId =
  | 'openai'
  | 'gemini'
  | 'xai'
  | 'anthropic'
  | 'deepseek'
  | 'doubao'
  | 'kimi'
  | 'qwen'
  | 'ollama'
type MultiModalContent = Array<
  | { type: 'text'; text: string }
  | {
      type: 'image_url'
      image_url: { url: string }
    }
>

export type MessageContent = string | MultiModalContent

export interface PreparedFile {
  id: string
  name: string
  type: string
  size: number
  hash: string
  kind: 'image' | 'text'
  dataUrl?: string
  text?: string
}

export interface ChatMessage {
  id: string
  role: Role
  content: MessageContent
  attachments?: Array<Pick<PreparedFile, 'id' | 'name' | 'kind' | 'size' | 'type' | 'hash'>>
  createdAt: string
}

export interface ChatSession {
  id: string
  title: string
  tags: string[]
  /** 自动推断标签的尝试次数；用户清空标签时归零 */
  tagsInferAttempts?: number
  summary?: {
    content: string
    updatedAt: string
  }
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
}

export interface ProviderModel {
  label: string
  value: string
  hint?: string
}

export interface AiProvider {
  id: ProviderId
  name: string
  keyLabel: string
  keyPlaceholder: string
  models: ProviderModel[]
  needsApiKey: boolean
}

export interface WorkspaceStatus {
  indexed: boolean
  root: string
  fileCount: number
  chunkCount: number
  updatedAt: string | null
}

export interface ImportedProject {
  id: string
  name: string
  root: string
  importedAt: string
  updatedAt: string
  fileCount: number
  chunkCount: number
}

export interface ProjectTreeNode {
  name: string
  path: string
  isDirectory: boolean
  children?: ProjectTreeNode[]
}

const STORAGE_KEYS = {
  apiKey: 'twentys1x:kimi-api-key',
  apiKeys: 'twentys1x:provider-api-keys',
  provider: 'twentys1x:provider',
  sessions: 'twentys1x:sessions',
  activeSession: 'twentys1x:active-session',
  models: 'twentys1x:provider-models',
  model: 'twentys1x:kimi-model',
  activeProject: 'twentys1x:active-project',
  promptTemplates: 'twentys1x:prompt-templates',
  customAgents: 'twentys1x:custom-agents',
  activeAgent: 'twentys1x:active-agent',
  activeNormalAgent: 'twentys1x:active-normal-agent',
  activeProjectAgent: 'twentys1x:active-project-agent',
  promptWorkflows: 'twentys1x:prompt-workflows',
}

const MAX_MESSAGE_CHARS = 12000
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const MAX_ATTACHMENT_TEXT_CHARS = 20000
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/json',
  'application/pdf',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'text/markdown',
  'text/plain',
])
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  '.c',
  '.cpp',
  '.css',
  '.csv',
  '.go',
  '.html',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.py',
  '.rs',
  '.scss',
  '.sh',
  '.sql',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
  '.xml',
  '.yaml',
  '.yml',
])

export const AI_PROVIDERS: AiProvider[] = [
  {
    id: 'openai',
    name: 'ChatGPT / OpenAI',
    keyLabel: 'OpenAI API Key',
    keyPlaceholder: 'sk-...',
    needsApiKey: true,
    models: [
      { label: 'GPT-5.2', value: 'gpt-5.2' },
      { label: 'GPT-5.1', value: 'gpt-5.1' },
      { label: 'GPT-4.1', value: 'gpt-4.1' },
      { label: 'GPT-4.1 mini', value: 'gpt-4.1-mini' },
      { label: 'GPT-4o', value: 'gpt-4o' },
    ],
  },
  {
    id: 'gemini',
    name: 'Gemini',
    keyLabel: 'Gemini API Key',
    keyPlaceholder: 'AIza...',
    needsApiKey: true,
    models: [
      { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
      { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
      { label: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
    ],
  },
  {
    id: 'xai',
    name: 'Grok / xAI',
    keyLabel: 'xAI API Key',
    keyPlaceholder: 'xai-...',
    needsApiKey: true,
    models: [
      { label: 'Grok 4', value: 'grok-4' },
      { label: 'Grok 3', value: 'grok-3' },
      { label: 'Grok 3 mini', value: 'grok-3-mini' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Claude / Anthropic',
    keyLabel: 'Anthropic API Key',
    keyPlaceholder: 'sk-ant-...',
    needsApiKey: true,
    models: [
      { label: 'Claude Opus 4.6', value: 'claude-opus-4-6' },
      { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
      { label: 'Claude Haiku 4.5', value: 'claude-haiku-4-5' },
      { label: 'Claude Sonnet 4.5', value: 'claude-sonnet-4-5' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    keyLabel: 'DeepSeek API Key',
    keyPlaceholder: 'sk-...',
    needsApiKey: true,
    models: [
      { label: 'DeepSeek Chat', value: 'deepseek-chat' },
      { label: 'DeepSeek Reasoner', value: 'deepseek-reasoner' },
    ],
  },
  {
    id: 'doubao',
    name: '豆包 / 火山方舟',
    keyLabel: 'ARK API Key',
    keyPlaceholder: '填入火山方舟 API Key',
    needsApiKey: true,
    models: [
      { label: 'Doubao 1.5 Pro', value: 'doubao-1-5-pro-32k-250115', hint: '也可填火山方舟 Endpoint ID' },
      { label: 'Doubao 1.5 Lite', value: 'doubao-1-5-lite-32k-250115', hint: '也可填火山方舟 Endpoint ID' },
    ],
  },
  {
    id: 'kimi',
    name: 'Kimi / Moonshot',
    keyLabel: 'Kimi API Key',
    keyPlaceholder: 'sk-...',
    needsApiKey: true,
    models: [
      { label: 'Kimi K2.6', value: 'kimi-k2.6' },
      { label: 'Kimi K2.5', value: 'kimi-k2.5' },
      { label: 'Moonshot v1 128K', value: 'moonshot-v1-128k' },
    ],
  },
  {
    id: 'qwen',
    name: '千问 / 通义千问',
    keyLabel: 'DashScope API Key',
    keyPlaceholder: 'sk-...',
    needsApiKey: true,
    models: [
      { label: 'Qwen3 Max', value: 'qwen3-max' },
      { label: 'Qwen3.6 Plus', value: 'qwen3.6-plus' },
      { label: 'Qwen3.5 Flash', value: 'qwen3.5-flash' },
      { label: 'Qwen Max', value: 'qwen-max' },
      { label: 'Qwen Plus', value: 'qwen-plus' },
      { label: 'Qwen Turbo', value: 'qwen-turbo' },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama 本地',
    keyLabel: 'Ollama API Key',
    keyPlaceholder: '本地 Ollama 通常无需填写',
    needsApiKey: false,
    models: [
      { label: 'Llama 3.1', value: 'llama3.1' },
      { label: 'Qwen2.5', value: 'qwen2.5' },
      { label: 'DeepSeek R1', value: 'deepseek-r1' },
    ],
  },
]

const DEFAULT_PROVIDER: ProviderId = 'kimi'
const DEFAULT_MODEL = 'kimi-k2.6'
const DEFAULT_PROJECT_AGENT_ID = 'agent-frontend-engineer'

function getProvider(id: ProviderId) {
  return (
    AI_PROVIDERS.find((provider) => provider.id === id) ||
    AI_PROVIDERS.find((provider) => provider.id === DEFAULT_PROVIDER)!
  )
}

function getDefaultModel(providerId: ProviderId) {
  return getProvider(providerId).models[0]?.value || DEFAULT_MODEL
}

function normalizeProviderId(value: string | null): ProviderId {
  return AI_PROVIDERS.some((provider) => provider.id === value) ? (value as ProviderId) : DEFAULT_PROVIDER
}

function createSession(): ChatSession {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: '新的会话',
    tags: [],
    createdAt: now,
    updatedAt: now,
    messages: [],
  }
}

function normalizeSession(value: ChatSession): ChatSession {
  return {
    ...value,
    tags: normalizeTags(value.tags || []),
    tagsInferAttempts:
      typeof value.tagsInferAttempts === 'number' && value.tagsInferAttempts >= 0
        ? Math.min(99, Math.floor(value.tagsInferAttempts))
        : 0,
    summary:
      value.summary && typeof value.summary.content === 'string'
        ? {
            content: value.summary.content,
            updatedAt: value.summary.updatedAt || value.updatedAt,
          }
        : undefined,
    messages: Array.isArray(value.messages) ? value.messages : [],
  }
}

function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.sessions)
    const parsed = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed) && parsed.length) return parsed.map(normalizeSession)
  } catch {
    localStorage.removeItem(STORAGE_KEYS.sessions)
  }

  return [createSession()]
}

function loadPromptTemplates(): PromptTemplate[] {
  return mergePromptAssets(
    BUILTIN_PROMPT_TEMPLATES,
    loadJsonArray<PromptTemplate>(STORAGE_KEYS.promptTemplates),
  ).map((item) =>
    normalizePromptTemplate(
      item,
      BUILTIN_PROMPT_TEMPLATES.find((template) => template.id === item.id),
    ),
  )
}

function loadCustomAgents(): CustomAgent[] {
  return mergePromptAssets(BUILTIN_AGENTS, loadJsonArray<CustomAgent>(STORAGE_KEYS.customAgents)).map(
    (item) =>
      normalizeAgent(
        item,
        BUILTIN_AGENTS.find((agent) => agent.id === item.id),
      ),
  )
}

function loadPromptWorkflows(): PromptWorkflow[] {
  return mergePromptAssets(
    BUILTIN_WORKFLOWS,
    loadJsonArray<PromptWorkflow>(STORAGE_KEYS.promptWorkflows),
  ).map((item) =>
    normalizeWorkflow(
      item,
      BUILTIN_WORKFLOWS.find((workflow) => workflow.id === item.id),
    ),
  )
}

function loadJsonArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed : []
  } catch {
    localStorage.removeItem(key)
    return []
  }
}

function mergePromptAssets<T extends { id: string; isBuiltin?: boolean }>(builtins: T[], stored: T[]) {
  const custom = stored.filter(
    (item) => !builtins.some((builtin) => builtin.id === item.id && builtin.isBuiltin),
  )
  const builtinOverrides = new Map(stored.filter((item) => item.isBuiltin).map((item) => [item.id, item]))
  return [
    ...builtins.map((builtin) => ({ ...builtin, ...builtinOverrides.get(builtin.id), isBuiltin: true })),
    ...custom,
  ]
}

function persist(key: string, value: string) {
  void setStoredString(key, value)
}

function loadJsonRecord(key: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  } catch {
    localStorage.removeItem(key)
  }

  return {}
}

async function hydrateJsonRecord(key: string, fallback: Record<string, string>) {
  return getStoredJson<Record<string, string>>(key, fallback)
}

async function hydrateSessions(fallback: ChatSession[]) {
  const stored = await getStoredJson<ChatSession[] | null>(STORAGE_KEYS.sessions, null)
  return Array.isArray(stored) && stored.length ? stored.map(normalizeSession) : fallback
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function readAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsText(file)
  })
}

async function hashFile(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function isAllowedAttachment(file: File) {
  if (file.type && ALLOWED_ATTACHMENT_TYPES.has(file.type)) return true
  const extension = getFileExtension(file.name)
  return extension ? ALLOWED_ATTACHMENT_EXTENSIONS.has(extension) : false
}

function getFileExtension(name: string) {
  const normalized = name.toLowerCase()
  const dotIndex = normalized.lastIndexOf('.')
  return dotIndex === -1 ? '' : normalized.slice(dotIndex)
}

function sanitizeUserInput(value: string) {
  return value
    .split('')
    .filter((char) => {
      const code = char.charCodeAt(0)
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)
    })
    .join('')
    .slice(0, MAX_MESSAGE_CHARS)
    .trim()
}

function normalizeApiKeyInput(value: string) {
  // 防止用户粘贴了 "Bearer sk-..." 或包含不可见空白字符。
  return String(value || '')
    .replace(/^Bearer\s+/i, '')
    .replace(/\s+/g, '')
}

function replaceLastUserMessageContent(messages: ChatMessage[], content: MessageContent): ChatMessage[] {
  let lastUserIndex = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIndex = i
      break
    }
  }
  if (lastUserIndex === -1) return messages
  return messages.map((message, index) => (index === lastUserIndex ? { ...message, content } : message))
}

function buildUserContent(text: string, files: PreparedFile[]): MessageContent {
  const parts: MultiModalContent = []
  const trimmedText = text.trim()
  const textAttachments = files.filter((file) => file.kind === 'text')
  const imageAttachments = files.filter((file) => file.kind === 'image')

  let fullText = trimmedText
  if (textAttachments.length) {
    const attachmentText = textAttachments
      .map((file) => `\n\n[附件: ${file.name}]\n${file.text || ''}`)
      .join('')
    fullText = `${trimmedText || '请分析以下附件内容。'}${attachmentText}`
  }

  if (fullText) parts.push({ type: 'text', text: fullText })

  for (const file of imageAttachments) {
    if (!file.dataUrl) continue
    parts.push({
      type: 'image_url',
      image_url: { url: file.dataUrl },
    })
  }

  return parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts
}

export function messagePreviewContent(content: MessageContent) {
  if (typeof content === 'string') return content
  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
}

export const useChatStore = defineStore('chat', () => {
  const hasHydratedClientState = ref(false)
  const legacyKimiKey = localStorage.getItem(STORAGE_KEYS.apiKey) || ''
  const providerApiKeys = ref<Record<string, string>>({
    ...loadJsonRecord(STORAGE_KEYS.apiKeys),
    ...(legacyKimiKey ? { kimi: legacyKimiKey } : {}),
  })
  const providerModels = ref<Record<string, string>>({
    ...loadJsonRecord(STORAGE_KEYS.models),
    kimi: localStorage.getItem(STORAGE_KEYS.model) || DEFAULT_MODEL,
  })
  const selectedProviderId = ref<ProviderId>(normalizeProviderId(localStorage.getItem(STORAGE_KEYS.provider)))
  const sessions = ref<ChatSession[]>(loadSessions())
  const activeSessionId = ref(localStorage.getItem(STORAGE_KEYS.activeSession) || sessions.value[0].id)
  const promptTemplates = ref<PromptTemplate[]>(loadPromptTemplates())
  const customAgents = ref<CustomAgent[]>(loadCustomAgents())
  const activeNormalAgentId = ref(
    localStorage.getItem(STORAGE_KEYS.activeNormalAgent) ||
      localStorage.getItem(STORAGE_KEYS.activeAgent) ||
      DEFAULT_AGENT_ID,
  )
  const activeProjectAgentId = ref(
    localStorage.getItem(STORAGE_KEYS.activeProjectAgent) || DEFAULT_PROJECT_AGENT_ID,
  )
  const promptWorkflows = ref<PromptWorkflow[]>(loadPromptWorkflows())
  const pendingFiles = ref<PreparedFile[]>([])
  const providerServerConfigured = ref<Record<string, boolean>>({})
  const isSending = ref(false)
  const isRunningWorkflow = ref(false)
  const isSummarizingSession = ref(false)
  const isIndexingWorkspace = ref(false)
  const isImportingProject = ref(false)
  const isAnalyzingProject = ref(false)
  const projects = ref<ImportedProject[]>([])
  const activeProjectId = ref(localStorage.getItem(STORAGE_KEYS.activeProject) || '')
  const activeProjectTree = ref<ProjectTreeNode[]>([])
  const activeFilePath = ref('')
  const activeFileContent = ref('')
  const editedFileContent = ref('')
  const activeFileDiff = ref('')
  const isLoadingProjectTree = ref(false)
  const isLoadingFile = ref(false)
  const isPreviewingFileDiff = ref(false)
  const isApplyingFileWrite = ref(false)
  const isOpeningExternalEditor = ref(false)
  const workspaceStatus = ref<WorkspaceStatus>({
    indexed: false,
    root: '',
    fileCount: 0,
    chunkCount: 0,
    updatedAt: null,
  })
  const errorMessage = ref('')

  const providers = computed(() => AI_PROVIDERS)
  const selectedProvider = computed(() => getProvider(selectedProviderId.value))
  const currentModelOptions = computed(() => selectedProvider.value.models)
  const apiKey = computed(() => providerApiKeys.value[selectedProviderId.value] || '')
  const model = computed(
    () => providerModels.value[selectedProviderId.value] || getDefaultModel(selectedProviderId.value),
  )
  const isProviderReady = computed(
    () =>
      !selectedProvider.value.needsApiKey ||
      Boolean(providerServerConfigured.value[selectedProviderId.value]) ||
      Boolean(apiKey.value.trim()),
  )

  const activeSession = computed(() => {
    return sessions.value.find((session) => session.id === activeSessionId.value) || sessions.value[0]
  })
  const activeAgentId = computed({
    get: () => {
      const fallback = activeProjectId.value ? DEFAULT_PROJECT_AGENT_ID : DEFAULT_AGENT_ID
      const selected = activeProjectId.value ? activeProjectAgentId.value : activeNormalAgentId.value
      return resolveAgentId(selected, fallback)
    },
    set: (agentId: string) => setActiveAgent(agentId),
  })
  const activeAgent = computed(
    () =>
      customAgents.value.find((agent) => agent.id === activeAgentId.value) ||
      customAgents.value.find((agent) => agent.id === DEFAULT_AGENT_ID) ||
      null,
  )

  const visibleMessages = computed(() => activeSession.value?.messages || [])
  const allSessionTags = computed(() =>
    Array.from(new Set(sessions.value.flatMap((session) => session.tags || []))).sort((a, b) =>
      a.localeCompare(b, 'zh-CN'),
    ),
  )
  const activeProject = computed(
    () => projects.value.find((project) => project.id === activeProjectId.value) || null,
  )

  function resolveAgentId(agentId: string, fallback: string) {
    if (customAgents.value.some((agent) => agent.id === agentId)) return agentId
    if (customAgents.value.some((agent) => agent.id === fallback)) return fallback
    return DEFAULT_AGENT_ID
  }

  function saveSessions() {
    void setStoredJson(STORAGE_KEYS.sessions, sessions.value)
  }

  function savePromptTemplates() {
    void setStoredJson(STORAGE_KEYS.promptTemplates, promptTemplates.value)
  }

  function saveCustomAgents() {
    void setStoredJson(STORAGE_KEYS.customAgents, customAgents.value)
  }

  function savePromptWorkflows() {
    void setStoredJson(STORAGE_KEYS.promptWorkflows, promptWorkflows.value)
  }

  function setApiKey(value: string) {
    const normalized = normalizeApiKeyInput(value)
    providerApiKeys.value = {
      ...providerApiKeys.value,
      [selectedProviderId.value]: normalized,
    }
    void setSecureJson(STORAGE_KEYS.apiKeys, providerApiKeys.value)
  }

  function setModel(value: string) {
    providerModels.value = {
      ...providerModels.value,
      [selectedProviderId.value]: value.trim() || getDefaultModel(selectedProviderId.value),
    }
    void setStoredJson(STORAGE_KEYS.models, providerModels.value)
  }

  function setProvider(providerId: ProviderId) {
    selectedProviderId.value = providerId
    if (!providerModels.value[providerId]) setModel(getDefaultModel(providerId))
    errorMessage.value = ''
    persist(STORAGE_KEYS.provider, providerId)
  }

  async function hydrateClientState() {
    if (hasHydratedClientState.value) return
    hasHydratedClientState.value = true

    const [
      storedApiKeys,
      storedModels,
      storedProvider,
      storedSessions,
      storedActiveSession,
      storedActiveProject,
      storedPromptTemplates,
      storedCustomAgents,
      storedActiveAgent,
      storedActiveNormalAgent,
      storedActiveProjectAgent,
      storedPromptWorkflows,
    ] = await Promise.all([
      getSecureJson<Record<string, string>>(STORAGE_KEYS.apiKeys, providerApiKeys.value),
      hydrateJsonRecord(STORAGE_KEYS.models, providerModels.value),
      getStoredString(STORAGE_KEYS.provider),
      hydrateSessions(sessions.value),
      getStoredString(STORAGE_KEYS.activeSession),
      getStoredString(STORAGE_KEYS.activeProject),
      getStoredJson<PromptTemplate[]>(STORAGE_KEYS.promptTemplates, promptTemplates.value),
      getStoredJson<CustomAgent[]>(STORAGE_KEYS.customAgents, customAgents.value),
      getStoredString(STORAGE_KEYS.activeAgent),
      getStoredString(STORAGE_KEYS.activeNormalAgent),
      getStoredString(STORAGE_KEYS.activeProjectAgent),
      getStoredJson<PromptWorkflow[]>(STORAGE_KEYS.promptWorkflows, promptWorkflows.value),
    ])

    providerApiKeys.value = { ...providerApiKeys.value, ...storedApiKeys }
    providerModels.value = { ...providerModels.value, ...storedModels }
    selectedProviderId.value = normalizeProviderId(storedProvider || selectedProviderId.value)
    sessions.value = storedSessions
    promptTemplates.value = mergePromptAssets(BUILTIN_PROMPT_TEMPLATES, storedPromptTemplates).map((item) =>
      normalizePromptTemplate(
        item,
        BUILTIN_PROMPT_TEMPLATES.find((template) => template.id === item.id),
      ),
    )
    customAgents.value = mergePromptAssets(BUILTIN_AGENTS, storedCustomAgents).map((item) =>
      normalizeAgent(
        item,
        BUILTIN_AGENTS.find((agent) => agent.id === item.id),
      ),
    )
    promptWorkflows.value = mergePromptAssets(BUILTIN_WORKFLOWS, storedPromptWorkflows).map((item) =>
      normalizeWorkflow(
        item,
        BUILTIN_WORKFLOWS.find((workflow) => workflow.id === item.id),
      ),
    )
    activeSessionId.value =
      storedActiveSession && storedSessions.some((session) => session.id === storedActiveSession)
        ? storedActiveSession
        : storedSessions[0].id
    activeProjectId.value = storedActiveProject || activeProjectId.value
    activeNormalAgentId.value = resolveAgentId(
      storedActiveNormalAgent || storedActiveAgent || activeNormalAgentId.value,
      DEFAULT_AGENT_ID,
    )
    activeProjectAgentId.value = resolveAgentId(
      storedActiveProjectAgent || activeProjectAgentId.value,
      DEFAULT_PROJECT_AGENT_ID,
    )

    void setSecureJson(STORAGE_KEYS.apiKeys, providerApiKeys.value)
    void setStoredJson(STORAGE_KEYS.models, providerModels.value)
    saveSessions()
    savePromptTemplates()
    saveCustomAgents()
    savePromptWorkflows()
    persist(STORAGE_KEYS.provider, selectedProviderId.value)
    persist(STORAGE_KEYS.activeSession, activeSessionId.value)
    persist(STORAGE_KEYS.activeProject, activeProjectId.value)
    persist(STORAGE_KEYS.activeAgent, activeAgentId.value)
    persist(STORAGE_KEYS.activeNormalAgent, activeNormalAgentId.value)
    persist(STORAGE_KEYS.activeProjectAgent, activeProjectAgentId.value)
  }

  function newSession() {
    const session = createSession()
    sessions.value.unshift(session)
    activeSessionId.value = session.id
    pendingFiles.value = []
    errorMessage.value = ''
    persist(STORAGE_KEYS.activeSession, session.id)
    saveSessions()
  }

  function deleteSession(id: string) {
    const index = sessions.value.findIndex((session) => session.id === id)
    if (index === -1) return
    sessions.value.splice(index, 1)
    if (!sessions.value.length) sessions.value.push(createSession())
    if (activeSessionId.value === id) activeSessionId.value = sessions.value[0].id
    persist(STORAGE_KEYS.activeSession, activeSessionId.value)
    saveSessions()
  }

  function renameSession(sessionId: string, title: string) {
    const session = sessions.value.find((item) => item.id === sessionId)
    if (!session) return false
    const next = title.trim().slice(0, 120)
    if (!next) return false
    session.title = next
    saveSessions()
    return true
  }

  function setActiveSession(id: string) {
    activeSessionId.value = id
    errorMessage.value = ''
    persist(STORAGE_KEYS.activeSession, id)
  }

  function clearAllSessions() {
    const session = createSession()
    sessions.value = [session]
    activeSessionId.value = session.id
    pendingFiles.value = []
    errorMessage.value = ''
    persist(STORAGE_KEYS.activeSession, session.id)
    saveSessions()
  }

  function applyHeuristicSessionTagsIfEmpty(sessionId: string) {
    const fresh = sessions.value.find((item) => item.id === sessionId)
    if (!fresh || fresh.tags.length) return
    const inferred = buildHeuristicSessionTags(fresh)
    if (!inferred.length) return
    fresh.tags = inferred
    fresh.updatedAt = new Date().toISOString()
    saveSessions()
  }

  function setSessionTags(sessionId: string, tags: string[]) {
    const session = sessions.value.find((item) => item.id === sessionId)
    if (!session) return
    session.tags = normalizeTags(tags)
    if (!session.tags.length) session.tagsInferAttempts = 0
    session.updatedAt = new Date().toISOString()
    saveSessions()
  }

  function updateSessionSummary(sessionId: string, content: string) {
    const session = sessions.value.find((item) => item.id === sessionId)
    const normalizedContent = content.trim()
    if (!session || !normalizedContent) return

    const now = new Date().toISOString()
    session.summary = {
      content: normalizedContent,
      updatedAt: now,
    }
    session.updatedAt = now
    saveSessions()
  }

  function setActiveAgent(agentId: string) {
    const fallback = activeProjectId.value ? DEFAULT_PROJECT_AGENT_ID : DEFAULT_AGENT_ID
    const resolved = resolveAgentId(agentId, fallback)
    if (activeProjectId.value) {
      activeProjectAgentId.value = resolved
      persist(STORAGE_KEYS.activeProjectAgent, resolved)
    } else {
      activeNormalAgentId.value = resolved
      persist(STORAGE_KEYS.activeNormalAgent, resolved)
    }
    persist(STORAGE_KEYS.activeAgent, activeAgentId.value)
  }

  function savePromptTemplate(template: Partial<PromptTemplate>) {
    const existing = template.id ? promptTemplates.value.find((item) => item.id === template.id) : undefined
    const normalized = normalizePromptTemplate(
      {
        ...template,
        isBuiltin: existing?.isBuiltin && template.id ? true : false,
      },
      existing,
    )
    promptTemplates.value = [
      normalized,
      ...promptTemplates.value.filter((item) => item.id !== normalized.id),
    ].sort((a, b) => Number(b.isBuiltin) - Number(a.isBuiltin) || a.name.localeCompare(b.name, 'zh-CN'))
    savePromptTemplates()
    return normalized
  }

  function deletePromptTemplate(templateId: string) {
    const template = promptTemplates.value.find((item) => item.id === templateId)
    if (!template || template.isBuiltin) return false
    promptTemplates.value = promptTemplates.value.filter((item) => item.id !== templateId)
    savePromptTemplates()
    return true
  }

  function saveCustomAgent(agent: Partial<CustomAgent>) {
    const existing = agent.id ? customAgents.value.find((item) => item.id === agent.id) : undefined
    const normalized = normalizeAgent(
      {
        ...agent,
        isBuiltin: existing?.isBuiltin && agent.id ? true : false,
      },
      existing,
    )
    customAgents.value = [normalized, ...customAgents.value.filter((item) => item.id !== normalized.id)].sort(
      (a, b) => Number(b.isBuiltin) - Number(a.isBuiltin) || a.name.localeCompare(b.name, 'zh-CN'),
    )
    saveCustomAgents()
    if (!activeAgentId.value) setActiveAgent(normalized.id)
    return normalized
  }

  function deleteCustomAgent(agentId: string) {
    const agent = customAgents.value.find((item) => item.id === agentId)
    if (!agent || agent.isBuiltin) return false
    customAgents.value = customAgents.value.filter((item) => item.id !== agentId)
    promptWorkflows.value = promptWorkflows.value.map((workflow) => ({
      ...workflow,
      steps: workflow.steps.map((step) => ({
        ...step,
        agentId: step.agentId === agentId ? DEFAULT_AGENT_ID : step.agentId,
      })),
    }))
    if (activeNormalAgentId.value === agentId) {
      activeNormalAgentId.value = resolveAgentId(DEFAULT_AGENT_ID, DEFAULT_AGENT_ID)
      persist(STORAGE_KEYS.activeNormalAgent, activeNormalAgentId.value)
    }
    if (activeProjectAgentId.value === agentId) {
      activeProjectAgentId.value = resolveAgentId(DEFAULT_PROJECT_AGENT_ID, DEFAULT_AGENT_ID)
      persist(STORAGE_KEYS.activeProjectAgent, activeProjectAgentId.value)
    }
    persist(STORAGE_KEYS.activeAgent, activeAgentId.value)
    saveCustomAgents()
    savePromptWorkflows()
    return true
  }

  function savePromptWorkflow(workflow: Partial<PromptWorkflow>) {
    const existing = workflow.id ? promptWorkflows.value.find((item) => item.id === workflow.id) : undefined
    const normalized = normalizeWorkflow(
      {
        ...workflow,
        isBuiltin: existing?.isBuiltin && workflow.id ? true : false,
      },
      existing,
    )
    promptWorkflows.value = [
      normalized,
      ...promptWorkflows.value.filter((item) => item.id !== normalized.id),
    ].sort((a, b) => Number(b.isBuiltin) - Number(a.isBuiltin) || a.name.localeCompare(b.name, 'zh-CN'))
    savePromptWorkflows()
    return normalized
  }

  function deletePromptWorkflow(workflowId: string) {
    const workflow = promptWorkflows.value.find((item) => item.id === workflowId)
    if (!workflow || workflow.isBuiltin) return false
    promptWorkflows.value = promptWorkflows.value.filter((item) => item.id !== workflowId)
    savePromptWorkflows()
    return true
  }

  async function prepareFiles(files: File[]) {
    const prepared: PreparedFile[] = []

    for (const file of files) {
      if (file.size > MAX_UPLOAD_BYTES) {
        errorMessage.value = `${file.name} 超过 10MB，已跳过。`
        continue
      }

      if (!isAllowedAttachment(file)) {
        errorMessage.value = `${file.name} 类型不在上传白名单内，已跳过。`
        continue
      }

      const hash = await hashFile(file)

      if (file.type.startsWith('image/')) {
        prepared.push({
          id: crypto.randomUUID(),
          name: file.name,
          type: file.type,
          size: file.size,
          hash,
          kind: 'image',
          dataUrl: await readAsDataUrl(file),
        })
        continue
      }

      const text = await readAsText(file)
      prepared.push({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type || 'text/plain',
        size: file.size,
        hash,
        kind: 'text',
        text: text.slice(0, MAX_ATTACHMENT_TEXT_CHARS),
      })
    }

    pendingFiles.value.push(...prepared)
  }

  function removePendingFile(id: string) {
    pendingFiles.value = pendingFiles.value.filter((file) => file.id !== id)
  }

  function updateTitle(session: ChatSession, text: string) {
    if (session.messages.length > 1 || session.title !== '新的会话') return
    const compact = text.replace(/\s+/g, ' ').trim()
    session.title = compact ? compact.slice(0, 24) : '附件会话'
  }

  async function sendMessage(
    text: string,
    options?: { composerTemplate?: Pick<PromptTemplate, 'id' | 'name' | 'content'> | null },
  ) {
    const cleanText = sanitizeUserInput(text)
    const files = [...pendingFiles.value]
    if (!isProviderReady.value || isSending.value || (!cleanText && !files.length)) return false

    if (text.trim().length > MAX_MESSAGE_CHARS) {
      errorMessage.value = `单次输入最多 ${MAX_MESSAGE_CHARS} 个字符，已自动截断后发送。`
    }

    const template = options?.composerTemplate ?? undefined
    const session = activeSession.value
    const displayContent = buildUserContent(cleanText, files)
    const apiPayloadContent = template
      ? buildUserContent(wrapComposerTemplate(template.content, cleanText), files)
      : displayContent
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: displayContent,
      attachments: files.map(({ id, name, kind, size, type, hash }) => ({
        id,
        name,
        kind,
        size,
        type,
        hash,
      })),
      createdAt: new Date().toISOString(),
    }

    session.messages.push(userMessage)
    session.updatedAt = new Date().toISOString()
    updateTitle(session, cleanText || files.map((file) => file.name).join(', '))
    pendingFiles.value = []
    errorMessage.value = ''
    isSending.value = true
    saveSessions()

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    }
    session.messages.push(assistantMessage)

    let assistantHttpOk = false
    try {
      const response = await requestWithRetry(async () => {
        const runtime = buildPromptRuntimeConfig(activeAgent.value)
        const messagesPayload = template
          ? replaceLastUserMessageContent(session.messages, apiPayloadContent)
          : session.messages
        const result = await callChatBackend(messagesPayload, {
          runtime,
          useWorkspaceContext: Boolean(activeProjectId.value && runtime.useProjectContext),
        })
        if (result.status >= 500) throw new Error(`服务暂时不可用：${result.status}`)
        return result
      })

      if (!response.ok) {
        const detail = await response.json().catch(() => null)
        throw new Error(detail?.error || `请求失败：${response.status}`)
      }

      const data = await response.json()
      assistantHttpOk = true
      const reply = data.content || '没有收到有效回复。'
      assistantMessage.content = reply
      session.updatedAt = new Date().toISOString()
    } catch (error) {
      assistantMessage.content = '调用失败，请检查 API Key、模型名称、供应商配置或网络连接。'
      errorMessage.value = error instanceof Error ? error.message : '未知错误'
    } finally {
      isSending.value = false
      saveSessions()
      if (assistantHttpOk) void maybeInferSessionTags(session)
    }

    return true
  }

  async function runPromptWorkflow(workflowId: string, input: string) {
    const workflow = promptWorkflows.value.find((item) => item.id === workflowId)
    const cleanInput = sanitizeUserInput(input)
    if (!workflow || !workflow.steps.length) {
      errorMessage.value = '请选择一个包含步骤的工作流。'
      return false
    }
    if (!cleanInput) {
      errorMessage.value = '请输入要交给工作流处理的任务。'
      return false
    }
    if (!isProviderReady.value) {
      errorMessage.value = '请先配置 API Key 或后端供应商环境变量。'
      return false
    }
    if (isSending.value) {
      errorMessage.value = '当前已有请求进行中，请稍后再执行工作流。'
      return false
    }

    const session = activeSession.value
    const now = new Date().toISOString()
    let previous = ''
    isRunningWorkflow.value = true
    isSending.value = true
    errorMessage.value = ''

    session.messages.push({
      id: crypto.randomUUID(),
      role: 'user',
      content: `运行工作流「${workflow.name}」\n\n${cleanInput}`,
      createdAt: now,
    })
    session.updatedAt = now
    updateTitle(session, workflow.name)
    saveSessions()

    try {
      for (const [index, step] of workflow.steps.entries()) {
        const template = step.templateId
          ? promptTemplates.value.find((item) => item.id === step.templateId)
          : null
        const promptSource = template?.content || step.prompt
        const prompt = renderPromptTemplate(promptSource, {
          input: cleanInput,
          previous,
          step: step.title,
        })
        const agent = customAgents.value.find((item) => item.id === step.agentId) || activeAgent.value
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `### ${index + 1}. ${step.title}\n\n执行中...`,
          createdAt: new Date().toISOString(),
        }
        session.messages.push(assistantMessage)
        saveSessions()

        const response = await requestWithRetry(async () => {
          const runtime = buildPromptRuntimeConfig(agent)
          const result = await callChatBackend(
            [
              {
                id: crypto.randomUUID(),
                role: 'user',
                content: prompt,
                createdAt: new Date().toISOString(),
              },
            ],
            {
              runtime,
              useWorkspaceContext: Boolean(activeProjectId.value && runtime.useProjectContext),
            },
          )
          if (result.status >= 500) throw new Error(`服务暂时不可用：${result.status}`)
          return result
        })

        if (!response.ok) {
          const detail = await response.json().catch(() => null)
          throw new Error(detail?.error || `工作流步骤失败：${response.status}`)
        }

        const data = await response.json()
        previous = String(data.content || '').trim() || '没有收到有效回复。'
        assistantMessage.content = `### ${index + 1}. ${step.title}\n\n${previous}`
        session.updatedAt = new Date().toISOString()
        saveSessions()
      }
      void maybeInferSessionTags(session)
      return true
    } catch (error) {
      session.messages.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '工作流执行失败，请检查 API Key、模型名称、Agent 配置或网络连接。',
        createdAt: new Date().toISOString(),
      })
      errorMessage.value = error instanceof Error ? error.message : '工作流执行失败'
      saveSessions()
      return false
    } finally {
      isRunningWorkflow.value = false
      isSending.value = false
    }
  }

  async function maybeInferSessionTags(session: ChatSession) {
    if (session.tags?.length) return

    // 先同步填启发式，侧栏立刻有标签；模型返回后再覆盖为更贴切的结果
    applyHeuristicSessionTagsIfEmpty(session.id)

    if (!isProviderReady.value) return

    if ((session.tagsInferAttempts ?? 0) >= 2) return

    const prompt = buildSessionTagsPrompt(session)
    if (!prompt.trim()) return

    session.tagsInferAttempts = (session.tagsInferAttempts ?? 0) + 1
    session.updatedAt = new Date().toISOString()
    saveSessions()

    try {
      const response = await requestWithRetry(async () => {
        const result = await callChatBackend(
          [
            {
              id: crypto.randomUUID(),
              role: 'user',
              content: prompt,
              createdAt: new Date().toISOString(),
            },
          ],
          {
            useWorkspaceContext: false,
            runtime: {
              temperature: 0.2,
              systemPrompt:
                '【附加指令】下一条用户消息是一项元任务：仅根据其中的「会话内容」摘录输出 2～4 个中文主题标签。请只输出一行标签，用英文半角逗号分隔；禁止解释、禁止 Markdown、禁止序号与多余文字。',
            },
          },
        )
        if (result.status >= 500) throw new Error(`服务暂时不可用：${result.status}`)
        return result
      })

      if (!response.ok) return

      const data = await response.json()
      const fresh = sessions.value.find((item) => item.id === session.id)
      if (!fresh) return

      const inferred = parseAutoSessionTagsResponse(String(data.content || ''))
      if (!inferred.length) return

      fresh.tags = inferred
      fresh.updatedAt = new Date().toISOString()
      saveSessions()
    } catch {
      // 不打断主流程、不写入 errorMessage
    } finally {
      applyHeuristicSessionTagsIfEmpty(session.id)
    }
  }

  async function summarizeActiveSession() {
    const session = activeSession.value
    const summaryPrompt = buildSessionSummaryPrompt(session)

    if (!isProviderReady.value || isSending.value || isSummarizingSession.value || !summaryPrompt.trim()) {
      return false
    }

    isSummarizingSession.value = true
    errorMessage.value = ''

    try {
      const response = await requestWithRetry(async () => {
        const result = await callChatBackend(
          [
            {
              id: crypto.randomUUID(),
              role: 'user',
              content: summaryPrompt,
              createdAt: new Date().toISOString(),
            },
          ],
          { useWorkspaceContext: false },
        )
        if (result.status >= 500) throw new Error(`服务暂时不可用：${result.status}`)
        return result
      })

      if (!response.ok) {
        const detail = await response.json().catch(() => null)
        throw new Error(detail?.error || `总结失败：${response.status}`)
      }

      const data = await response.json()
      const now = new Date().toISOString()
      session.summary = {
        content: String(data.content || '').trim() || '没有生成有效总结。',
        updatedAt: now,
      }
      session.updatedAt = now
      saveSessions()
      return true
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '生成会话总结失败'
      return false
    } finally {
      isSummarizingSession.value = false
    }
  }

  function callChatBackend(
    messages: ChatMessage[],
    options: { useWorkspaceContext?: boolean; runtime?: PromptRuntimeConfig } = {},
  ) {
    const useWorkspaceContext =
      options.useWorkspaceContext ?? Boolean(activeProject.value || workspaceStatus.value.indexed)

    return fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        providerId: selectedProviderId.value,
        model:
          options.runtime?.model?.trim() || model.value.trim() || getDefaultModel(selectedProviderId.value),
        temperature: options.runtime?.temperature,
        systemPrompt: options.runtime?.systemPrompt?.trim() || undefined,
        // 始终允许前端当前输入的 key 覆盖服务端环境变量，便于失效 key 的即时修复。
        apiKey: apiKey.value.trim() || undefined,
        projectId: useWorkspaceContext ? activeProjectId.value || undefined : undefined,
        useWorkspaceContext,
        messages: messages
          .filter((message) => message.role === 'user' || (message.role === 'assistant' && message.content))
          .map((message) => ({
            role: message.role,
            content: message.content,
          })),
      }),
    })
  }

  async function refreshWorkspaceStatus() {
    try {
      const response = await fetch('/api/workspace/status')
      if (!response.ok) return
      workspaceStatus.value = await response.json()
    } catch {
      // 后端未启动时不阻塞聊天界面。
    }
  }

  async function refreshProviderServerConfig() {
    try {
      const response = await fetch('/api/providers')
      if (!response.ok) return
      const data = await response.json()
      const providers = data?.providers && typeof data.providers === 'object' ? data.providers : {}
      providerServerConfigured.value = Object.fromEntries(
        Object.entries(providers).map(([id, config]) => [
          id,
          Boolean((config as { serverConfigured?: boolean }).serverConfigured),
        ]),
      )
    } catch {
      // 后端未启动时仍允许用户使用本地填写的 API Key。
    }
  }

  async function refreshProjects() {
    try {
      const response = await fetch('/api/projects')
      if (!response.ok) return
      const data = await response.json()
      projects.value = Array.isArray(data.projects) ? data.projects : []
      if (!activeProjectId.value && projects.value.length) setActiveProject(projects.value[0].id)
      if (activeProjectId.value && !projects.value.some((project) => project.id === activeProjectId.value)) {
        setActiveProject(projects.value[0]?.id || '')
      }
    } catch {
      // 后端未启动时不阻塞聊天界面。
    }
  }

  function setActiveProject(projectId: string) {
    activeProjectId.value = projectId
    persist(STORAGE_KEYS.activeProject, projectId)
    persist(STORAGE_KEYS.activeAgent, activeAgentId.value)
    activeFilePath.value = ''
    activeFileContent.value = ''
    editedFileContent.value = ''
    activeFileDiff.value = ''
    if (projectId) refreshActiveProjectTree()
    else activeProjectTree.value = []
  }

  async function importProjectFolder(files: File[]) {
    if (isImportingProject.value || !files.length) return

    isImportingProject.value = true
    errorMessage.value = ''

    try {
      const projectFiles = await prepareProjectFiles(files)
      if (!projectFiles.length) throw new Error('没有可导入的文本/代码文件。')

      const firstPath = projectFiles[0].path
      const name = firstPath.split('/')[0] || '导入项目'
      const response = await fetch('/api/projects/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, files: projectFiles }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || `导入失败：${response.status}`)

      const project = data.project as ImportedProject
      projects.value = [project, ...projects.value.filter((item) => item.id !== project.id)]
      setActiveProject(project.id)
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '导入项目失败'
    } finally {
      isImportingProject.value = false
    }
  }

  async function analyzeActiveProject() {
    const project = activeProject.value
    if (!project || isAnalyzingProject.value) return false

    isAnalyzingProject.value = true
    errorMessage.value = ''

    try {
      const response = await fetch(`/api/projects/${project.id}/analyze`, { method: 'POST' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || `分析失败：${response.status}`)

      const session = activeSession.value
      session.messages.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.analysis || '没有生成有效分析。',
        createdAt: new Date().toISOString(),
      })
      session.updatedAt = new Date().toISOString()
      if (session.title === '新的会话') session.title = `${project.name} 框架分析`.slice(0, 24)
      saveSessions()
      return true
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '分析项目失败'
      return false
    } finally {
      isAnalyzingProject.value = false
    }
  }

  async function refreshActiveProjectTree() {
    const project = activeProject.value
    if (!project || isLoadingProjectTree.value) return

    isLoadingProjectTree.value = true
    errorMessage.value = ''

    try {
      const response = await fetch(`/api/projects/${project.id}/tree`)
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || `获取目录树失败：${response.status}`)
      activeProjectTree.value = Array.isArray(data.tree) ? data.tree : []
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '获取目录树失败'
    } finally {
      isLoadingProjectTree.value = false
    }
  }

  async function refreshActiveProjectFiles() {
    await refreshActiveProjectTree()
    if (activeFilePath.value) await loadProjectFile(activeFilePath.value, { force: true })
  }

  async function loadProjectFile(path: string, options: { force?: boolean } = {}) {
    const project = activeProject.value
    if (!project || !path || (isLoadingFile.value && !options.force)) return

    isLoadingFile.value = true
    errorMessage.value = ''

    try {
      const response = await fetch(`/api/projects/${project.id}/file?path=${encodeURIComponent(path)}`)
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || `读取文件失败：${response.status}`)
      activeFilePath.value = path
      activeFileContent.value = data.content || ''
      editedFileContent.value = activeFileContent.value
      activeFileDiff.value = ''
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '读取文件失败'
    } finally {
      isLoadingFile.value = false
    }
  }

  async function previewActiveFileDiff() {
    const project = activeProject.value
    if (!project || !activeFilePath.value || isPreviewingFileDiff.value) return ''

    isPreviewingFileDiff.value = true
    errorMessage.value = ''

    try {
      const response = await fetch(
        `/api/projects/${project.id}/file?path=${encodeURIComponent(activeFilePath.value)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: editedFileContent.value, dryRun: true }),
        },
      )
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || `生成 Diff 失败：${response.status}`)
      activeFileDiff.value = data.diff || ''
      return activeFileDiff.value
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '生成 Diff 失败'
      return ''
    } finally {
      isPreviewingFileDiff.value = false
    }
  }

  async function applyActiveFileWrite() {
    const project = activeProject.value
    if (!project || !activeFilePath.value || isApplyingFileWrite.value) return false

    isApplyingFileWrite.value = true
    errorMessage.value = ''

    try {
      const response = await fetch(
        `/api/projects/${project.id}/file?path=${encodeURIComponent(activeFilePath.value)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: editedFileContent.value, dryRun: false }),
        },
      )
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || `写入失败：${response.status}`)
      activeFileContent.value = editedFileContent.value
      activeFileDiff.value = data.diff || ''
      await refreshProjects()
      await refreshActiveProjectTree()
      return true
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '写入文件失败'
      return false
    } finally {
      isApplyingFileWrite.value = false
    }
  }

  async function openActiveFileInEditor(editor: 'cursor' | 'vscode' = 'cursor') {
    const project = activeProject.value
    if (!project || !activeFilePath.value || isOpeningExternalEditor.value) return false

    isOpeningExternalEditor.value = true
    errorMessage.value = ''

    try {
      const response = await fetch(
        `/api/projects/${project.id}/open-file?path=${encodeURIComponent(activeFilePath.value)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ editor }),
        },
      )
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || `打开编辑器失败：${response.status}`)
      return true
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '打开编辑器失败'
      return false
    } finally {
      isOpeningExternalEditor.value = false
    }
  }

  async function deleteProject(projectId: string) {
    if (!projectId) return false

    errorMessage.value = ''

    try {
      const response = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || `删除失败：${response.status}`)
      projects.value = projects.value.filter((project) => project.id !== projectId)
      if (activeProjectId.value === projectId) setActiveProject(projects.value[0]?.id || '')
      return true
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '删除项目失败'
      return false
    }
  }

  async function indexCurrentWorkspace() {
    if (isIndexingWorkspace.value) return

    isIndexingWorkspace.value = true
    errorMessage.value = ''

    try {
      const response = await fetch('/api/workspace/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || `索引失败：${response.status}`)
      workspaceStatus.value = data
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '索引项目失败'
    } finally {
      isIndexingWorkspace.value = false
    }
  }

  return {
    providers,
    selectedProviderId,
    selectedProvider,
    currentModelOptions,
    apiKey,
    model,
    isProviderReady,
    sessions,
    activeSessionId,
    activeSession,
    promptTemplates,
    customAgents,
    activeAgentId,
    activeAgent,
    promptWorkflows,
    visibleMessages,
    allSessionTags,
    pendingFiles,
    providerServerConfigured,
    isSending,
    isRunningWorkflow,
    isSummarizingSession,
    isIndexingWorkspace,
    isImportingProject,
    isAnalyzingProject,
    isLoadingProjectTree,
    isLoadingFile,
    isPreviewingFileDiff,
    isApplyingFileWrite,
    isOpeningExternalEditor,
    projects,
    activeProjectId,
    activeProject,
    activeProjectTree,
    activeFilePath,
    activeFileContent,
    editedFileContent,
    activeFileDiff,
    workspaceStatus,
    errorMessage,
    hydrateClientState,
    setProvider,
    setApiKey,
    setModel,
    newSession,
    deleteSession,
    renameSession,
    setActiveSession,
    clearAllSessions,
    setSessionTags,
    updateSessionSummary,
    setActiveAgent,
    savePromptTemplate,
    deletePromptTemplate,
    saveCustomAgent,
    deleteCustomAgent,
    savePromptWorkflow,
    deletePromptWorkflow,
    prepareFiles,
    removePendingFile,
    sendMessage,
    runPromptWorkflow,
    summarizeActiveSession,
    refreshProviderServerConfig,
    refreshWorkspaceStatus,
    refreshProjects,
    indexCurrentWorkspace,
    importProjectFolder,
    setActiveProject,
    analyzeActiveProject,
    refreshActiveProjectTree,
    refreshActiveProjectFiles,
    loadProjectFile,
    previewActiveFileDiff,
    applyActiveFileWrite,
    openActiveFileInEditor,
    deleteProject,
  }
})

const PROJECT_FILE_EXTENSIONS = new Set([
  '.c',
  '.cpp',
  '.css',
  '.csv',
  '.go',
  '.html',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.py',
  '.rs',
  '.scss',
  '.sh',
  '.sql',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
  '.xml',
  '.yaml',
  '.yml',
])

async function prepareProjectFiles(files: File[]) {
  const maxBytes = 256 * 1024
  const maxFiles = 1000
  const prepared: Array<{ path: string; text: string; size: number; type: string; lastModified: number }> = []

  for (const file of files.slice(0, maxFiles)) {
    const relativePath = (
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    ).replace(/\\/g, '/')
    if (!isProjectFilePath(relativePath)) continue
    if (file.size > maxBytes) continue

    prepared.push({
      path: relativePath,
      text: await readAsText(file),
      size: file.size,
      type: file.type || 'text/plain',
      lastModified: file.lastModified,
    })
  }

  return prepared
}

function isProjectFilePath(value: string) {
  const normalized = value.toLowerCase()
  if (
    normalized.includes('/node_modules/') ||
    normalized.includes('/dist/') ||
    normalized.includes('/.git/') ||
    normalized.includes('/coverage/')
  ) {
    return false
  }

  if (normalized.endsWith('/package-lock.json')) return false
  const dotIndex = normalized.lastIndexOf('.')
  return dotIndex === -1
    ? normalized.endsWith('/.gitignore')
    : PROJECT_FILE_EXTENSIONS.has(normalized.slice(dotIndex))
}
