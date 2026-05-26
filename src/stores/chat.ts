import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import {
  getSecureJson,
  getStoredJson,
  getStoredString,
  setSecureJson,
  setStoredJson,
  setStoredString,
} from '../lib/clientStorage'
import { authFetch, requestWithRetry } from '../lib/request'
import { translate } from '../i18n'
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
  importSessionsJson,
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
export type InferenceMode = 'cloud' | 'local' | 'auto'
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
  kind: 'image' | 'text' | 'document' | 'audio' | 'video'
  dataUrl?: string
  text?: string
}

export type ChatAttachment = Pick<
  PreparedFile,
  'id' | 'name' | 'kind' | 'size' | 'type' | 'hash' | 'dataUrl' | 'text'
>

export interface ToolLog {
  name: string
  arguments: Record<string, unknown>
  result?: unknown
}

export interface PlanTask {
  id: string
  title: string
  description: string
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped'
  toolLogs?: ToolLog[]
  result?: string
  output?: string
}

export interface AgentPlan {
  id: string
  goal: string
  tasks: PlanTask[]
  status: 'planning' | 'executing' | 'completed' | 'failed'
  currentTaskIndex: number
  createdAt: string
  updatedAt: string
}

export interface ChatMessage {
  id: string
  role: Role
  content: MessageContent
  attachments?: ChatAttachment[]
  createdAt: string
  /** 工具调用日志 */
  toolLogs?: ToolLog[]
  /** 自主规划结果 */
  plan?: AgentPlan
  /** 本条消息生成时的上下文元信息 */
  meta?: {
    agentId?: string
    agentName?: string
    templateId?: string
    templateName?: string
    workflowId?: string
    workflowName?: string
    model?: string
    providerId?: string
    providerName?: string
    inferenceMode?: InferenceMode
    isPlanning?: boolean
  }
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

export interface LocalModel {
  name: string
  label: string
  size: number
  digest: string
  modifiedAt: string
  running: boolean
  parameterSize?: string
  quantizationLevel?: string
}

export interface LocalModelStatus {
  available: boolean
  version: string
  models: LocalModel[]
  error: string
  updatedAt: string | null
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
  originalRoot?: string
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
  inferenceMode: 'twentys1x:inference-mode',
  localModel: 'twentys1x:local-model',
  hybridFallback: 'twentys1x:hybrid-fallback',
  enableTools: 'twentys1x:enable-tools',
  enablePlanning: 'twentys1x:enable-planning',
}

const MAX_MESSAGE_CHARS = 12000
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const MAX_ATTACHMENT_TEXT_CHARS = 20000
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/json',
  'application/pdf',
  'audio/aac',
  'audio/flac',
  'audio/m4a',
  'audio/mp3',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'text/markdown',
  'text/plain',
  'video/mp4',
  'video/ogg',
  'video/quicktime',
  'video/webm',
])
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  '.aac',
  '.flac',
  '.m4a',
  '.mov',
  '.mp3',
  '.mp4',
  '.ogg',
  '.pdf',
  '.wav',
  '.webm',
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
const DEFAULT_INFERENCE_MODE: InferenceMode = 'cloud'
const DEFAULT_LOCAL_MODEL = 'qwen2.5'

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

function normalizeInferenceMode(value: string | null): InferenceMode {
  return value === 'local' || value === 'auto' || value === 'cloud' ? value : DEFAULT_INFERENCE_MODE
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
  const messages = Array.isArray(value.messages)
    ? value.messages.map((message) => ({
        ...message,
        attachments: normalizeAttachments(message.attachments),
      }))
    : []
  const title =
    value.title === '新的会话' ? deriveSessionTitleFromMessages(messages, value.title) : value.title

  return {
    ...value,
    title,
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
    messages,
  }
}

function deriveSessionTitleFromMessages(messages: ChatMessage[], fallback: string) {
  const firstUserMessage = messages.find((message) => message.role === 'user')
  if (!firstUserMessage) return fallback
  const compact = messagePreviewContent(firstUserMessage.content).replace(/\s+/g, ' ').trim()
  if (compact) return compact.slice(0, 24)
  const firstAttachment = firstUserMessage.attachments?.[0]?.name
  return firstAttachment ? firstAttachment.slice(0, 24) : fallback
}

function normalizeAttachments(value: ChatMessage['attachments']) {
  if (!Array.isArray(value)) return undefined
  const attachments = value
    .filter((file) => file && typeof file.id === 'string' && typeof file.name === 'string')
    .map((file) => ({
      id: file.id,
      name: file.name,
      kind: isAttachmentKind(file.kind) ? file.kind : 'text',
      size: Number(file.size || 0),
      type: String(file.type || ''),
      hash: String(file.hash || ''),
      dataUrl: typeof file.dataUrl === 'string' ? file.dataUrl : undefined,
      text: typeof file.text === 'string' ? file.text : undefined,
    }))
  return attachments.length ? attachments : undefined
}

function isAttachmentKind(value: unknown): value is PreparedFile['kind'] {
  return (
    value === 'image' || value === 'text' || value === 'document' || value === 'audio' || value === 'video'
  )
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

function isAuthTokenAvailable() {
  return Boolean(localStorage.getItem('twentys1x:auth-token'))
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

async function extractPdfText(file: File) {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  const pageTexts: string[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    if (pageTexts.join('\n\n').length >= MAX_ATTACHMENT_TEXT_CHARS) break
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (text) pageTexts.push(`[第 ${pageNumber} 页]\n${text}`)
  }

  return pageTexts.join('\n\n').slice(0, MAX_ATTACHMENT_TEXT_CHARS)
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

function inferAttachmentKind(file: File): PreparedFile['kind'] {
  const extension = getFileExtension(file.name)
  if (file.type.startsWith('image/')) return 'image'
  if (
    file.type.startsWith('audio/') ||
    ['.aac', '.flac', '.m4a', '.mp3', '.ogg', '.wav'].includes(extension)
  ) {
    return 'audio'
  }
  if (file.type.startsWith('video/') || ['.mov', '.mp4', '.webm'].includes(extension)) return 'video'
  if (file.type === 'application/pdf' || extension === '.pdf') return 'document'
  return 'text'
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

function appendAttachmentTextToContent(content: MessageContent, attachments: ChatAttachment[] = []) {
  const extractedText = attachments
    .filter((file) => file.text?.trim())
    .map((file) => `\n\n[附件提取文本: ${file.name}]\n${file.text}`)
    .join('')
  if (!extractedText) return content
  if (typeof content === 'string') return `${content}${extractedText}`
  return [...content, { type: 'text' as const, text: extractedText }]
}

function enrichMessagesWithAttachmentText(messages: ChatMessage[]) {
  return messages.map((message) => {
    if (message.role !== 'user' || !message.attachments?.length) return message
    return {
      ...message,
      content: appendAttachmentTextToContent(message.content, message.attachments),
    }
  })
}

function buildUserContent(
  text: string,
  files: PreparedFile[],
  options: { includePreviewSummary?: boolean } = {},
): MessageContent {
  const parts: MultiModalContent = []
  const trimmedText = text.trim()
  const textAttachments = files.filter((file) => file.kind === 'text')
  const imageAttachments = files.filter((file) => file.kind === 'image')
  const previewAttachments = files.filter((file) => file.kind !== 'text' && file.kind !== 'image')

  let fullText = trimmedText
  if (textAttachments.length) {
    const attachmentText = textAttachments
      .map((file) => `\n\n[附件: ${file.name}]\n${file.text || ''}`)
      .join('')
    fullText = `${trimmedText || '请分析以下附件内容。'}${attachmentText}`
  }
  if (options.includePreviewSummary && previewAttachments.length) {
    const attachmentSummary = previewAttachments
      .map(
        (file) =>
          `\n- ${file.name}（${formatAttachmentKind(file.kind)}，${formatBytes(file.size)}，${file.type || 'unknown'}）`,
      )
      .join('')
    fullText = `${fullText || '请参考我上传的附件。'}\n\n已上传可预览附件：${attachmentSummary}`

    const extractedText = previewAttachments
      .filter((file) => file.text?.trim())
      .map((file) => `\n\n[附件提取文本: ${file.name}]\n${file.text}`)
      .join('')
    if (extractedText) fullText = `${fullText}${extractedText}`
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

function formatAttachmentKind(kind: PreparedFile['kind']) {
  if (kind === 'document') return '文档'
  if (kind === 'audio') return '音频'
  if (kind === 'video') return '视频'
  if (kind === 'image') return '图片'
  return '文本'
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
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
  const hasHydratedServerState = ref(false)
  const isApplyingServerState = ref(false)
  let serverPersistTimer: number | null = null
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
  const inferenceMode = ref<InferenceMode>(
    normalizeInferenceMode(localStorage.getItem(STORAGE_KEYS.inferenceMode)),
  )
  const localModel = ref(localStorage.getItem(STORAGE_KEYS.localModel) || DEFAULT_LOCAL_MODEL)
  const hybridFallbackToCloud = ref(localStorage.getItem(STORAGE_KEYS.hybridFallback) !== 'false')
  const enableTools = ref(localStorage.getItem(STORAGE_KEYS.enableTools) === 'true')
  const enablePlanning = ref(localStorage.getItem(STORAGE_KEYS.enablePlanning) === 'true')
  const isPlanning = ref(false)
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
  const localModelStatus = ref<LocalModelStatus>({
    available: false,
    version: '',
    models: [],
    error: '',
    updatedAt: null,
  })
  const isRefreshingLocalModels = ref(false)
  const isSending = ref(false)
  const abortController = ref<AbortController | null>(null)
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
  const localModelOptions = computed<ProviderModel[]>(() => {
    const remoteModels = localModelStatus.value.models.map((item) => ({
      label: item.label,
      value: item.name,
      hint: [
        item.parameterSize,
        item.quantizationLevel,
        item.running ? '运行中' : '',
        item.size ? formatBytes(item.size) : '',
      ]
        .filter(Boolean)
        .join(' · '),
    }))
    const defaults = getProvider('ollama').models
    const merged = new Map<string, ProviderModel>()
    for (const item of [...defaults, ...remoteModels]) merged.set(item.value, item)
    return Array.from(merged.values())
  })
  const apiKey = computed(() => providerApiKeys.value[selectedProviderId.value] || '')
  const model = computed(
    () => providerModels.value[selectedProviderId.value] || getDefaultModel(selectedProviderId.value),
  )
  const effectiveLocalModel = computed(() => localModel.value.trim() || DEFAULT_LOCAL_MODEL)
  const isLocalInferenceReady = computed(() => Boolean(effectiveLocalModel.value.trim()))
  const isCloudProviderReady = computed(
    () =>
      !selectedProvider.value.needsApiKey ||
      Boolean(providerServerConfigured.value[selectedProviderId.value]) ||
      Boolean(apiKey.value.trim()),
  )
  const isProviderReady = computed(() => {
    if (inferenceMode.value === 'local') return isLocalInferenceReady.value
    if (inferenceMode.value === 'auto') return isCloudProviderReady.value || isLocalInferenceReady.value
    return isCloudProviderReady.value
  })

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
    scheduleServerStatePersist()
  }

  function clearErrorMessage() {
    errorMessage.value = ''
  }

  function savePromptTemplates() {
    void setStoredJson(STORAGE_KEYS.promptTemplates, promptTemplates.value)
    scheduleServerStatePersist()
  }

  function saveCustomAgents() {
    void setStoredJson(STORAGE_KEYS.customAgents, customAgents.value)
    scheduleServerStatePersist()
  }

  function savePromptWorkflows() {
    void setStoredJson(STORAGE_KEYS.promptWorkflows, promptWorkflows.value)
    scheduleServerStatePersist()
  }

  function collectPersistedSettings() {
    return {
      provider: selectedProviderId.value,
      providerModels: providerModels.value,
      inferenceMode: inferenceMode.value,
      localModel: localModel.value,
      hybridFallbackToCloud: hybridFallbackToCloud.value,
      enableTools: enableTools.value,
      enablePlanning: enablePlanning.value,
      activeSession: activeSessionId.value,
      activeProject: activeProjectId.value,
      activeAgent: activeAgentId.value,
      activeNormalAgent: activeNormalAgentId.value,
      activeProjectAgent: activeProjectAgentId.value,
    }
  }

  function scheduleServerStatePersist() {
    if (isApplyingServerState.value || !hasHydratedServerState.value || !isAuthTokenAvailable()) return
    if (serverPersistTimer) window.clearTimeout(serverPersistTimer)
    serverPersistTimer = window.setTimeout(() => {
      serverPersistTimer = null
      void persistServerState()
    }, 500)
  }

  async function persistServerState() {
    if (isApplyingServerState.value || !hasHydratedServerState.value || !isAuthTokenAvailable()) return
    try {
      await authFetch('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessions: sessions.value,
          promptTemplates: promptTemplates.value,
          customAgents: customAgents.value,
          promptWorkflows: promptWorkflows.value,
          projects: projects.value,
          settings: collectPersistedSettings(),
        }),
      })
    } catch {
      // 后端临时不可用时仍保留浏览器本地副本，下次 hydrate 会再尝试迁移。
    }
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
    scheduleServerStatePersist()
  }

  function setProvider(providerId: ProviderId) {
    selectedProviderId.value = providerId
    if (!providerModels.value[providerId]) setModel(getDefaultModel(providerId))
    errorMessage.value = ''
    persist(STORAGE_KEYS.provider, providerId)
    scheduleServerStatePersist()
  }

  function setInferenceMode(value: InferenceMode) {
    inferenceMode.value = normalizeInferenceMode(value)
    errorMessage.value = ''
    persist(STORAGE_KEYS.inferenceMode, inferenceMode.value)
    scheduleServerStatePersist()
  }

  function setLocalModel(value: string) {
    localModel.value = value.trim() || DEFAULT_LOCAL_MODEL
    persist(STORAGE_KEYS.localModel, localModel.value)
    scheduleServerStatePersist()
  }

  function setHybridFallbackToCloud(value: boolean) {
    hybridFallbackToCloud.value = Boolean(value)
    persist(STORAGE_KEYS.hybridFallback, String(hybridFallbackToCloud.value))
    scheduleServerStatePersist()
  }

  function setEnableTools(value: boolean) {
    enableTools.value = Boolean(value)
    persist(STORAGE_KEYS.enableTools, String(enableTools.value))
    scheduleServerStatePersist()
  }

  function setEnablePlanning(value: boolean) {
    enablePlanning.value = Boolean(value)
    persist(STORAGE_KEYS.enablePlanning, String(enablePlanning.value))
    scheduleServerStatePersist()
  }

  async function hydrateClientState() {
    if (hasHydratedClientState.value) return
    hasHydratedClientState.value = true

    const [
      storedApiKeys,
      storedModels,
      storedProvider,
      storedInferenceMode,
      storedLocalModel,
      storedHybridFallback,
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
      getStoredString(STORAGE_KEYS.inferenceMode),
      getStoredString(STORAGE_KEYS.localModel),
      getStoredString(STORAGE_KEYS.hybridFallback),
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
    inferenceMode.value = normalizeInferenceMode(storedInferenceMode || inferenceMode.value)
    localModel.value = storedLocalModel || localModel.value
    hybridFallbackToCloud.value =
      storedHybridFallback === null ? hybridFallbackToCloud.value : storedHybridFallback !== 'false'
    const storedEnableTools = await getStoredString(STORAGE_KEYS.enableTools)
    enableTools.value = storedEnableTools === null ? enableTools.value : storedEnableTools === 'true'
    const storedEnablePlanning = await getStoredString(STORAGE_KEYS.enablePlanning)
    enablePlanning.value =
      storedEnablePlanning === null ? enablePlanning.value : storedEnablePlanning === 'true'
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
    persist(STORAGE_KEYS.inferenceMode, inferenceMode.value)
    persist(STORAGE_KEYS.localModel, localModel.value)
    persist(STORAGE_KEYS.hybridFallback, String(hybridFallbackToCloud.value))
    persist(STORAGE_KEYS.activeSession, activeSessionId.value)
    persist(STORAGE_KEYS.activeProject, activeProjectId.value)
    persist(STORAGE_KEYS.activeAgent, activeAgentId.value)
    persist(STORAGE_KEYS.activeNormalAgent, activeNormalAgentId.value)
    persist(STORAGE_KEYS.activeProjectAgent, activeProjectAgentId.value)

    await hydrateServerState()
  }

  async function hydrateServerState() {
    if (hasHydratedServerState.value || !isAuthTokenAvailable()) return

    try {
      const response = await authFetch('/api/state')
      if (!response.ok) return
      const data = await response.json()

      isApplyingServerState.value = true
      if (data?.empty) {
        hasHydratedServerState.value = true
        isApplyingServerState.value = false
        await persistServerState()
        return
      }

      if (Array.isArray(data.sessions) && data.sessions.length) {
        sessions.value = data.sessions.map(normalizeSession)
      }

      promptTemplates.value = mergePromptAssets(
        BUILTIN_PROMPT_TEMPLATES,
        Array.isArray(data.promptTemplates) ? data.promptTemplates : [],
      ).map((item) =>
        normalizePromptTemplate(
          item,
          BUILTIN_PROMPT_TEMPLATES.find((template) => template.id === item.id),
        ),
      )
      customAgents.value = mergePromptAssets(
        BUILTIN_AGENTS,
        Array.isArray(data.customAgents) ? data.customAgents : [],
      ).map((item) =>
        normalizeAgent(
          item,
          BUILTIN_AGENTS.find((agent) => agent.id === item.id),
        ),
      )
      promptWorkflows.value = mergePromptAssets(
        BUILTIN_WORKFLOWS,
        Array.isArray(data.promptWorkflows) ? data.promptWorkflows : [],
      ).map((item) =>
        normalizeWorkflow(
          item,
          BUILTIN_WORKFLOWS.find((workflow) => workflow.id === item.id),
        ),
      )

      const settings = data?.settings && typeof data.settings === 'object' ? data.settings : {}
      providerModels.value = {
        ...providerModels.value,
        ...(settings.providerModels && typeof settings.providerModels === 'object'
          ? settings.providerModels
          : {}),
      }
      selectedProviderId.value = normalizeProviderId(String(settings.provider || selectedProviderId.value))
      inferenceMode.value = normalizeInferenceMode(String(settings.inferenceMode || inferenceMode.value))
      localModel.value = String(settings.localModel || localModel.value)
      hybridFallbackToCloud.value =
        typeof settings.hybridFallbackToCloud === 'boolean'
          ? settings.hybridFallbackToCloud
          : hybridFallbackToCloud.value
      enableTools.value = typeof settings.enableTools === 'boolean' ? settings.enableTools : enableTools.value
      enablePlanning.value =
        typeof settings.enablePlanning === 'boolean' ? settings.enablePlanning : enablePlanning.value
      activeSessionId.value =
        settings.activeSession && sessions.value.some((session) => session.id === settings.activeSession)
          ? String(settings.activeSession)
          : sessions.value[0].id
      activeProjectId.value = String(settings.activeProject || activeProjectId.value || '')
      activeNormalAgentId.value = resolveAgentId(
        String(settings.activeNormalAgent || settings.activeAgent || activeNormalAgentId.value),
        DEFAULT_AGENT_ID,
      )
      activeProjectAgentId.value = resolveAgentId(
        String(settings.activeProjectAgent || activeProjectAgentId.value),
        DEFAULT_PROJECT_AGENT_ID,
      )

      if (Array.isArray(data.projects) && data.projects.length) {
        projects.value = data.projects
      }

      await setStoredJson(STORAGE_KEYS.sessions, sessions.value)
      await setStoredJson(STORAGE_KEYS.promptTemplates, promptTemplates.value)
      await setStoredJson(STORAGE_KEYS.customAgents, customAgents.value)
      await setStoredJson(STORAGE_KEYS.promptWorkflows, promptWorkflows.value)
      await setStoredJson(STORAGE_KEYS.models, providerModels.value)
      persist(STORAGE_KEYS.provider, selectedProviderId.value)
      persist(STORAGE_KEYS.inferenceMode, inferenceMode.value)
      persist(STORAGE_KEYS.localModel, localModel.value)
      persist(STORAGE_KEYS.hybridFallback, String(hybridFallbackToCloud.value))
      persist(STORAGE_KEYS.enableTools, String(enableTools.value))
      persist(STORAGE_KEYS.enablePlanning, String(enablePlanning.value))
      persist(STORAGE_KEYS.activeSession, activeSessionId.value)
      persist(STORAGE_KEYS.activeProject, activeProjectId.value)
      persist(STORAGE_KEYS.activeAgent, activeAgentId.value)
      persist(STORAGE_KEYS.activeNormalAgent, activeNormalAgentId.value)
      persist(STORAGE_KEYS.activeProjectAgent, activeProjectAgentId.value)
      hasHydratedServerState.value = true
    } catch {
      // 未登录、后端未启动或迁移中断时继续使用浏览器本地状态。
    } finally {
      isApplyingServerState.value = false
    }
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
    scheduleServerStatePersist()
  }

  function importSessions(jsonString: string): { imported: number; skipped: number; errors: string[] } {
    const { sessions: importedSessions, result } = importSessionsJson(jsonString)
    if (result.errors.length && !importedSessions.length) return result
    // 为所有导入的会话生成新 ID 以避免冲突
    for (const session of importedSessions) {
      session.id = crypto.randomUUID()
    }
    sessions.value.unshift(...importedSessions)
    saveSessions()
    return result
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

  /** 从所有会话中移除该标签（用于标签云/筛选区批量清理） */
  function removeTagFromAllSessions(tag: string): boolean {
    const needle = tag.trim()
    if (!needle) return false
    let changed = false
    for (const session of sessions.value) {
      const list = session.tags || []
      if (!list.includes(needle)) continue
      session.tags = list.filter((t) => t !== needle)
      if (!session.tags.length) session.tagsInferAttempts = 0
      session.updatedAt = new Date().toISOString()
      changed = true
    }
    if (changed) saveSessions()
    return changed
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
    scheduleServerStatePersist()
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
    scheduleServerStatePersist()
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
        errorMessage.value = translate('errors.uploadTooLarge', { name: file.name })
        continue
      }

      if (!isAllowedAttachment(file)) {
        errorMessage.value = translate('errors.uploadTypeDenied', { name: file.name })
        continue
      }

      const hash = await hashFile(file)
      const kind = inferAttachmentKind(file)

      if (kind !== 'text') {
        const dataUrl = await readAsDataUrl(file)
        const text =
          kind === 'document'
            ? await extractPdfText(file).catch((error) => {
                errorMessage.value =
                  error instanceof Error
                    ? `${translate('errors.pdfExtractFailed', { name: file.name })}: ${error.message}`
                    : translate('errors.pdfExtractFailed', { name: file.name })
                return ''
              })
            : ''
        prepared.push({
          id: crypto.randomUUID(),
          name: file.name,
          type: file.type || (kind === 'document' ? 'application/pdf' : 'application/octet-stream'),
          size: file.size,
          hash,
          kind,
          dataUrl,
          text,
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
      errorMessage.value = translate('errors.inputTooLong', { count: MAX_MESSAGE_CHARS })
    }

    const template = options?.composerTemplate ?? undefined
    const session = activeSession.value
    const displayContent = buildUserContent(cleanText, files)
    const apiPayloadContent = template
      ? buildUserContent(wrapComposerTemplate(template.content, cleanText), files, {
          includePreviewSummary: true,
        })
      : buildUserContent(cleanText, files, { includePreviewSummary: true })
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: displayContent,
      attachments: files.map(({ id, name, kind, size, type, hash, dataUrl, text }) => ({
        id,
        name,
        kind,
        size,
        type,
        hash,
        dataUrl,
        text,
      })),
      createdAt: new Date().toISOString(),
    }
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      meta: {
        agentId: activeAgent.value?.id,
        agentName: activeAgent.value?.name,
        templateId: template?.id,
        templateName: template?.name,
        model: model.value.trim() || getDefaultModel(selectedProviderId.value),
        providerId: selectedProviderId.value,
        providerName: selectedProvider.value.name,
        inferenceMode: inferenceMode.value,
      },
    }

    updateTitle(session, cleanText || files.map((file) => file.name).join(', '))
    session.messages.push(userMessage, assistantMessage)
    session.updatedAt = new Date().toISOString()
    pendingFiles.value = []
    errorMessage.value = ''
    isSending.value = true
    abortController.value = new AbortController()
    saveSessions()

    // 从 reactive 数组中重新获取 assistantMessage 的 proxy 引用，
    // 否则直接修改局部变量无法触发 Vue 响应式更新。
    const reactiveAssistant = session.messages[session.messages.length - 1] as ChatMessage

    let assistantHttpOk = false
    try {
      const runtime = buildPromptRuntimeConfig(activeAgent.value)
      const stream = streamChat(
        replaceLastUserMessageContent(session.messages, apiPayloadContent),
        {
          runtime,
          useWorkspaceContext: Boolean(activeProjectId.value && runtime.useProjectContext),
        },
        abortController.value.signal,
      )

      const toolLogs: ToolLog[] = []
      for await (const event of stream) {
        if (event.type === 'start') {
          assistantHttpOk = true
        } else if (event.type === 'delta') {
          reactiveAssistant.content = (reactiveAssistant.content as string) + event.content
        } else if (event.type === 'tool_call') {
          console.log(`[tool_call] ${event.name}`, event.arguments)
          toolLogs.push({ name: event.name, arguments: event.arguments })
          reactiveAssistant.toolLogs = [...toolLogs]
        } else if (event.type === 'tool_result') {
          const lastLog = toolLogs[toolLogs.length - 1]
          if (lastLog) lastLog.result = event.result
          reactiveAssistant.toolLogs = [...toolLogs]
        } else if (event.type === 'error') {
          throw new Error(event.error)
        }
      }

      session.updatedAt = new Date().toISOString()
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        reactiveAssistant.content = (reactiveAssistant.content as string) || translate('errors.stopped')
      } else {
        reactiveAssistant.content = translate('errors.callFailed')
        errorMessage.value = error instanceof Error ? error.message : translate('errors.unknown')
      }
    } finally {
      isSending.value = false
      abortController.value = null
      saveSessions()
      if (assistantHttpOk) {
        void maybeInferSessionTags(session)
        void maybeExtractAgentMemory(session)
      }
    }

    return true
  }

  async function sendPlanMessage(text: string) {
    const cleanText = sanitizeUserInput(text)
    const files = [...pendingFiles.value]
    if (!isProviderReady.value || isSending.value || (!cleanText && !files.length)) return false
    if (!activeProjectId.value) {
      errorMessage.value = translate('errors.planningNeedsProject')
      return false
    }

    if (text.trim().length > MAX_MESSAGE_CHARS) {
      errorMessage.value = translate('errors.inputTooLong', { count: MAX_MESSAGE_CHARS })
    }

    const session = activeSession.value
    const displayContent = buildUserContent(cleanText, files)
    const apiPayloadContent = buildUserContent(cleanText, files, { includePreviewSummary: true })

    const now = new Date().toISOString()
    const planId = crypto.randomUUID()

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: displayContent,
      attachments: files.map(({ id, name, kind, size, type, hash, dataUrl, text }) => ({
        id,
        name,
        kind,
        size,
        type,
        hash,
        dataUrl,
        text,
      })),
      createdAt: now,
    }

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      createdAt: now,
      plan: {
        id: planId,
        goal: cleanText,
        tasks: [],
        status: 'planning',
        currentTaskIndex: -1,
        createdAt: now,
        updatedAt: now,
      },
      meta: {
        agentId: activeAgent.value?.id,
        agentName: activeAgent.value?.name,
        model: model.value.trim() || getDefaultModel(selectedProviderId.value),
        providerId: selectedProviderId.value,
        providerName: selectedProvider.value.name,
        inferenceMode: inferenceMode.value,
        isPlanning: true,
      },
    }

    updateTitle(session, cleanText || files.map((file) => file.name).join(', '))
    session.messages.push(userMessage, assistantMessage)
    session.updatedAt = now
    pendingFiles.value = []
    errorMessage.value = ''
    isSending.value = true
    isPlanning.value = true
    abortController.value = new AbortController()
    saveSessions()

    const reactiveAssistant = session.messages[session.messages.length - 1] as ChatMessage
    const plan = reactiveAssistant.plan!

    let assistantHttpOk = false
    try {
      const runtime = buildPromptRuntimeConfig(activeAgent.value)
      const stream = streamChat(
        replaceLastUserMessageContent(session.messages, apiPayloadContent),
        {
          runtime,
          useWorkspaceContext: Boolean(activeProjectId.value && runtime.useProjectContext),
          enablePlanning: true,
        },
        abortController.value.signal,
      )

      for await (const event of stream) {
        if (event.type === 'start') {
          assistantHttpOk = true
        } else if (event.type === 'plan_start') {
          plan.status = 'planning'
          plan.goal = event.goal
          plan.updatedAt = new Date().toISOString()
          reactiveAssistant.content = `🎯 **目标**：${event.goal}\n\n📋 正在生成执行计划...`
        } else if (event.type === 'plan_tasks') {
          plan.tasks = event.tasks.map((t) => ({
            ...t,
            status: 'pending',
          }))
          plan.updatedAt = new Date().toISOString()
          reactiveAssistant.content = `🎯 **目标**：${plan.goal}\n\n📋 执行计划（${event.tasks.length} 个任务）\n\n${event.tasks.map((t, i) => `${i + 1}. ${t.title}`).join('\n')}\n\n⏳ 开始执行...`
        } else if (event.type === 'task_start') {
          plan.currentTaskIndex = event.taskIndex
          if (plan.tasks[event.taskIndex]) {
            plan.tasks[event.taskIndex].status = 'running'
          }
          plan.status = 'executing'
          plan.updatedAt = new Date().toISOString()
        } else if (event.type === 'task_delta') {
          const task = plan.tasks[event.taskIndex]
          if (task) {
            task.output = (task.output || '') + event.content
          }
        } else if (event.type === 'task_tool_call') {
          console.log(`[task_tool_call] #${event.taskIndex} ${event.name}`, event.arguments)
          const task = plan.tasks[event.taskIndex]
          if (task) {
            if (!task.toolLogs) task.toolLogs = []
            task.toolLogs.push({ name: event.name, arguments: event.arguments })
          }
        } else if (event.type === 'task_tool_result') {
          const task = plan.tasks[event.taskIndex]
          if (task && task.toolLogs?.length) {
            const lastLog = task.toolLogs[task.toolLogs.length - 1]
            lastLog.result = event.result
          }
        } else if (event.type === 'task_complete') {
          const task = plan.tasks[event.taskIndex]
          if (task) {
            task.status = event.status as PlanTask['status']
            task.result = event.summary || event.error || ''
          }
          plan.updatedAt = new Date().toISOString()
          // 更新 content 为当前进度摘要
          const completed = plan.tasks.filter((t) => t.status === 'success').length
          const failed = plan.tasks.filter((t) => t.status === 'error').length
          reactiveAssistant.content = `🎯 **目标**：${plan.goal}\n\n📋 执行进度：${completed}/${plan.tasks.length} 完成${failed > 0 ? ` · ${failed} 失败` : ''}\n\n${plan.tasks.map((t, i) => `${t.status === 'success' ? '✅' : t.status === 'error' ? '❌' : t.status === 'running' ? '⏳' : '⬜'} ${i + 1}. ${t.title}${t.result ? '\n   ' + t.result.slice(0, 120) + (t.result.length > 120 ? '...' : '') : ''}`).join('\n')}`
        } else if (event.type === 'plan_complete') {
          plan.status = event.allSuccessful ? 'completed' : 'failed'
          plan.updatedAt = new Date().toISOString()
          const completed = plan.tasks.filter((t) => t.status === 'success').length
          reactiveAssistant.content = `🎯 **目标**：${plan.goal}\n\n✅ 计划执行完成（${completed}/${plan.tasks.length} 成功）\n\n${plan.tasks.map((t, i) => `${t.status === 'success' ? '✅' : '❌'} ${i + 1}. ${t.title}${t.result ? '\n   ' + t.result.slice(0, 200) + (t.result.length > 200 ? '...' : '') : ''}`).join('\n')}`
        } else if (event.type === 'error') {
          throw new Error(event.error)
        }
      }

      session.updatedAt = new Date().toISOString()
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        reactiveAssistant.content = (reactiveAssistant.content as string) || translate('errors.stopped')
        plan.status = 'failed'
      } else {
        reactiveAssistant.content = translate('errors.callFailed')
        errorMessage.value = error instanceof Error ? error.message : translate('errors.unknown')
        plan.status = 'failed'
      }
    } finally {
      isSending.value = false
      isPlanning.value = false
      abortController.value = null
      plan.updatedAt = new Date().toISOString()
      saveSessions()
      if (assistantHttpOk) {
        void maybeInferSessionTags(session)
        void maybeExtractAgentMemory(session)
      }
    }

    return true
  }

  async function regenerateMessage(messageId: string) {
    if (!isProviderReady.value || isSending.value) return false

    const session = activeSession.value
    const assistantIndex = session.messages.findIndex(
      (message) => message.id === messageId && message.role === 'assistant',
    )
    if (assistantIndex < 1) return false

    const promptMessages = session.messages.slice(0, assistantIndex)
    if (!promptMessages.some((message) => message.role === 'user')) return false

    const assistantMessage = session.messages[assistantIndex]
    const existingMeta = assistantMessage.meta
    assistantMessage.content = ''
    assistantMessage.createdAt = new Date().toISOString()
    assistantMessage.meta = {
      ...existingMeta,
      model: model.value.trim() || getDefaultModel(selectedProviderId.value),
      providerId: selectedProviderId.value,
      providerName: selectedProvider.value.name,
      inferenceMode: inferenceMode.value,
    }
    session.updatedAt = assistantMessage.createdAt
    errorMessage.value = ''
    isSending.value = true
    abortController.value = new AbortController()
    saveSessions()

    let assistantHttpOk = false
    try {
      const runtime = buildPromptRuntimeConfig(activeAgent.value)
      const stream = streamChat(
        enrichMessagesWithAttachmentText(promptMessages),
        {
          runtime,
          useWorkspaceContext: Boolean(activeProjectId.value && runtime.useProjectContext),
        },
        abortController.value.signal,
      )

      const toolLogs: ToolLog[] = []
      for await (const event of stream) {
        if (event.type === 'start') {
          assistantHttpOk = true
        } else if (event.type === 'delta') {
          assistantMessage.content = (assistantMessage.content as string) + event.content
        } else if (event.type === 'tool_call') {
          toolLogs.push({ name: event.name, arguments: event.arguments })
          assistantMessage.toolLogs = [...toolLogs]
        } else if (event.type === 'tool_result') {
          const lastLog = toolLogs[toolLogs.length - 1]
          if (lastLog) lastLog.result = event.result
          assistantMessage.toolLogs = [...toolLogs]
        } else if (event.type === 'error') {
          throw new Error(event.error)
        }
      }

      session.updatedAt = new Date().toISOString()
      return true
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        assistantMessage.content = (assistantMessage.content as string) || translate('errors.stopped')
      } else {
        assistantMessage.content = translate('errors.callFailed')
        errorMessage.value = error instanceof Error ? error.message : translate('errors.unknown')
      }
      return false
    } finally {
      isSending.value = false
      abortController.value = null
      saveSessions()
      if (assistantHttpOk) {
        void maybeInferSessionTags(session)
        void maybeExtractAgentMemory(session)
      }
    }
  }

  type StreamEvent =
    | { type: 'start'; inference: unknown; workspaceHits: unknown[] }
    | { type: 'delta'; content: string }
    | { type: 'tool_call'; name: string; arguments: Record<string, unknown> }
    | { type: 'tool_result'; name: string; result: unknown }
    | { type: 'plan_start'; goal: string }
    | { type: 'plan_tasks'; tasks: Array<{ id: string; title: string; description: string }> }
    | { type: 'task_start'; taskIndex: number; taskId: string; title: string }
    | { type: 'task_delta'; taskIndex: number; content: string }
    | { type: 'task_tool_call'; taskIndex: number; name: string; arguments: Record<string, unknown> }
    | { type: 'task_tool_result'; taskIndex: number; name: string; result: unknown }
    | {
        type: 'task_complete'
        taskIndex: number
        taskId: string
        status: string
        summary?: string
        error?: string
      }
    | { type: 'plan_complete'; allSuccessful: boolean; completedCount: number; totalCount: number }
    | { type: 'done' }
    | { type: 'error'; error: string }

  function createSseParser() {
    let buffer = ''
    let currentEvent = ''
    return {
      push(chunk: string): Array<{ event: string; data: string }> {
        buffer += chunk
        const events: Array<{ event: string; data: string }> = []
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim()
          if (line === '') {
            currentEvent = ''
            continue
          }
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            events.push({ event: currentEvent || 'message', data: line.slice(5).trim() })
            currentEvent = ''
          }
        }
        return events
      },
      flush(): Array<{ event: string; data: string }> {
        const events = this.push('\n\n')
        buffer = ''
        currentEvent = ''
        return events
      },
    }
  }

  async function* streamChat(
    messages: ChatMessage[],
    options: { useWorkspaceContext?: boolean; runtime?: PromptRuntimeConfig; enablePlanning?: boolean },
    signal: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    const useWorkspaceContext =
      options.useWorkspaceContext ?? Boolean(activeProject.value || workspaceStatus.value.indexed)

    const response = await authFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: selectedProviderId.value,
        model:
          options.runtime?.model?.trim() || model.value.trim() || getDefaultModel(selectedProviderId.value),
        inferenceMode: inferenceMode.value,
        localProviderId: 'ollama',
        localModel: effectiveLocalModel.value,
        hybridFallbackToCloud: hybridFallbackToCloud.value,
        temperature: options.runtime?.temperature,
        systemPrompt: options.runtime?.systemPrompt?.trim() || undefined,
        apiKey: apiKey.value.trim() || undefined,
        projectId: useWorkspaceContext ? activeProjectId.value || undefined : undefined,
        useWorkspaceContext,
        stream: true,
        enableTools: enableTools.value,
        enablePlanning: options.enablePlanning ?? false,
        messages: messages
          .filter((message) => message.role === 'user' || (message.role === 'assistant' && message.content))
          .map((message) => ({ role: message.role, content: message.content })),
      }),
      signal,
    })

    if (!response.ok) {
      const detail = await response.json().catch(() => null)
      throw new Error(detail?.error || translate('errors.requestFailed', { status: response.status }))
    }

    if (!response.body) {
      throw new Error(translate('errors.streamUnsupported'))
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const parser = createSseParser()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const events = parser.push(decoder.decode(value, { stream: true }))
        for (const { event, data } of events) {
          if (event === 'start') {
            const parsed = JSON.parse(data)
            yield { type: 'start', inference: parsed.inference, workspaceHits: parsed.workspaceHits || [] }
          } else if (event === 'delta') {
            const parsed = JSON.parse(data)
            yield { type: 'delta', content: String(parsed.content || '') }
          } else if (event === 'tool_call') {
            const parsed = JSON.parse(data)
            yield { type: 'tool_call', name: String(parsed.name || ''), arguments: parsed.arguments || {} }
          } else if (event === 'tool_result') {
            const parsed = JSON.parse(data)
            yield { type: 'tool_result', name: String(parsed.name || ''), result: parsed.result }
          } else if (event === 'plan_start') {
            const parsed = JSON.parse(data)
            yield { type: 'plan_start', goal: String(parsed.goal || '') }
          } else if (event === 'plan_tasks') {
            const parsed = JSON.parse(data)
            yield { type: 'plan_tasks', tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [] }
          } else if (event === 'task_start') {
            const parsed = JSON.parse(data)
            yield {
              type: 'task_start',
              taskIndex: Number(parsed.taskIndex ?? 0),
              taskId: String(parsed.taskId || ''),
              title: String(parsed.title || ''),
            }
          } else if (event === 'task_delta') {
            const parsed = JSON.parse(data)
            yield {
              type: 'task_delta',
              taskIndex: Number(parsed.taskIndex ?? 0),
              content: String(parsed.content || ''),
            }
          } else if (event === 'task_tool_call') {
            const parsed = JSON.parse(data)
            yield {
              type: 'task_tool_call',
              taskIndex: Number(parsed.taskIndex ?? 0),
              name: String(parsed.name || ''),
              arguments: parsed.arguments || {},
            }
          } else if (event === 'task_tool_result') {
            const parsed = JSON.parse(data)
            yield {
              type: 'task_tool_result',
              taskIndex: Number(parsed.taskIndex ?? 0),
              name: String(parsed.name || ''),
              result: parsed.result,
            }
          } else if (event === 'task_complete') {
            const parsed = JSON.parse(data)
            yield {
              type: 'task_complete',
              taskIndex: Number(parsed.taskIndex ?? 0),
              taskId: String(parsed.taskId || ''),
              status: String(parsed.status || ''),
              summary: parsed.summary,
              error: parsed.error,
            }
          } else if (event === 'plan_complete') {
            const parsed = JSON.parse(data)
            yield {
              type: 'plan_complete',
              allSuccessful: Boolean(parsed.allSuccessful),
              completedCount: Number(parsed.completedCount ?? 0),
              totalCount: Number(parsed.totalCount ?? 0),
            }
          } else if (event === 'done') {
            yield { type: 'done' }
          } else if (event === 'error') {
            const parsed = JSON.parse(data)
            yield { type: 'error', error: String(parsed.error || translate('errors.unknown')) }
          }
        }
      }

      const events = parser.flush()
      for (const { event, data } of events) {
        if (event === 'delta') {
          const parsed = JSON.parse(data)
          yield { type: 'delta', content: String(parsed.content || '') }
        } else if (event === 'done') {
          yield { type: 'done' }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  function stop() {
    if (abortController.value) {
      abortController.value.abort()
      abortController.value = null
    }
  }

  async function runPromptWorkflow(workflowId: string, input: string) {
    const workflow = promptWorkflows.value.find((item) => item.id === workflowId)
    const cleanInput = sanitizeUserInput(input)
    if (!workflow || !workflow.steps.length) {
      errorMessage.value = translate('errors.workflowNoSteps')
      return false
    }
    if (!cleanInput) {
      errorMessage.value = translate('errors.workflowNeedsInput')
      return false
    }
    if (!isProviderReady.value) {
      errorMessage.value = translate('errors.providerNotReady')
      return false
    }
    if (isSending.value) {
      errorMessage.value = translate('errors.requestBusy')
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
          meta: {
            agentId: agent?.id,
            agentName: agent?.name,
            workflowId: workflow.id,
            workflowName: workflow.name,
            model: model.value.trim() || getDefaultModel(selectedProviderId.value),
            providerId: selectedProviderId.value,
            providerName: selectedProvider.value.name,
            inferenceMode: inferenceMode.value,
          },
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
          if (result.status >= 500)
            throw new Error(translate('errors.serviceUnavailable', { status: result.status }))
          return result
        })

        if (!response.ok) {
          const detail = await response.json().catch(() => null)
          throw new Error(
            detail?.error || translate('errors.workflowStepFailed', { status: response.status }),
          )
        }

        const data = await response.json()
        previous = String(data.content || '').trim() || translate('errors.noValidResponse')
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
        content: translate('errors.workflowFailedFull'),
        createdAt: new Date().toISOString(),
      })
      errorMessage.value = error instanceof Error ? error.message : translate('errors.workflowFailed')
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
        if (result.status >= 500)
          throw new Error(translate('errors.serviceUnavailable', { status: result.status }))
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

  async function maybeExtractAgentMemory(session: ChatSession) {
    const agent = activeAgent.value
    if (!agent || agent.isBuiltin) return
    if (session.messages.length < 4) return
    if (!isProviderReady.value) return

    const transcript = session.messages
      .slice(-6)
      .map((message) => {
        const speaker = message.role === 'user' ? '用户' : '助手'
        const text =
          typeof message.content === 'string'
            ? message.content
            : message.content
                .filter((part) => part.type === 'text')
                .map((part) => part.text)
                .join('\n')
        return `${speaker}: ${text.trim()}`
      })
      .join('\n\n')

    const memoryPrompt = [
      '请根据以下最近几轮对话，提取关于该用户的长期偏好、习惯和已确认决策。',
      '要求：',
      '1. 只输出对未来对话有直接帮助的事实性信息。',
      '2. 不要重复对话原文，用简洁的条目式总结。',
      '3. 如果用户明确表达了技术偏好（如框架、库、风格）、设计习惯、业务规则或已确认的方案，请记录下来。',
      '4. 如果对话中没有新的值得记忆的信息，请输出「无」。',
      '5. 总字数不超过 300 字。',
      '',
      '对话内容：',
      transcript,
      '',
      '请输出记忆条目：',
    ].join('\n')

    try {
      const response = await requestWithRetry(async () => {
        const result = await callChatBackend(
          [
            {
              id: crypto.randomUUID(),
              role: 'user',
              content: memoryPrompt,
              createdAt: new Date().toISOString(),
            },
          ],
          {
            useWorkspaceContext: false,
            runtime: {
              temperature: 0.3,
              systemPrompt:
                '你是一台记忆提取引擎。你的任务是从对话中提取用户的长期偏好和已确认决策，输出简洁的条目式记忆。禁止解释、禁止寒暄、禁止输出对话原文。',
            },
          },
        )
        if (result.status >= 500)
          throw new Error(translate('errors.serviceUnavailable', { status: result.status }))
        return result
      })

      if (!response.ok) return

      const data = await response.json()
      const extracted = String(data.content || '').trim()
      if (!extracted || extracted === '无' || extracted.startsWith('无')) return

      const existingMemory = agent.memory || ''
      const merged = existingMemory
        ? `${existingMemory}\n\n【${new Date().toLocaleDateString('zh-CN')} 更新】\n${extracted}`
        : extracted

      const normalizedMemory = merged.slice(0, 4000)
      if (normalizedMemory === existingMemory) return

      const updatedAgent = normalizeAgent({ ...agent, memory: normalizedMemory })
      customAgents.value = customAgents.value.map((item) =>
        item.id === updatedAgent.id ? updatedAgent : item,
      )
      saveCustomAgents()
    } catch {
      // 记忆提取失败不打断主流程
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
        if (result.status >= 500)
          throw new Error(translate('errors.serviceUnavailable', { status: result.status }))
        return result
      })

      if (!response.ok) {
        const detail = await response.json().catch(() => null)
        throw new Error(detail?.error || translate('errors.requestFailed', { status: response.status }))
      }

      const data = await response.json()
      const now = new Date().toISOString()
      session.summary = {
        content: String(data.content || '').trim() || translate('errors.noValidSummary'),
        updatedAt: now,
      }
      session.updatedAt = now
      saveSessions()
      return true
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : translate('errors.summarizeFailed')
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

    return authFetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        providerId: selectedProviderId.value,
        model:
          options.runtime?.model?.trim() || model.value.trim() || getDefaultModel(selectedProviderId.value),
        inferenceMode: inferenceMode.value,
        localProviderId: 'ollama',
        localModel: effectiveLocalModel.value,
        hybridFallbackToCloud: hybridFallbackToCloud.value,
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
      const response = await authFetch('/api/workspace/status')
      if (!response.ok) return
      workspaceStatus.value = await response.json()
    } catch {
      // 后端未启动时不阻塞聊天界面。
    }
  }

  async function refreshProviderServerConfig() {
    try {
      const response = await authFetch('/api/providers')
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

  async function refreshLocalModels() {
    if (isRefreshingLocalModels.value) return
    isRefreshingLocalModels.value = true

    try {
      const response = await authFetch('/api/local-models')
      const data = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(data?.error || translate('errors.requestFailed', { status: response.status }))

      localModelStatus.value = {
        available: Boolean(data.available),
        version: String(data.version || ''),
        models: Array.isArray(data.models) ? data.models : [],
        error: '',
        updatedAt: String(data.updatedAt || new Date().toISOString()),
      }

      const firstModel = localModelStatus.value.models[0]?.name
      if (firstModel && !localModel.value.trim()) setLocalModel(firstModel)
    } catch (error) {
      localModelStatus.value = {
        ...localModelStatus.value,
        available: false,
        error: error instanceof Error ? error.message : translate('errors.localModelsRefreshFailed'),
        updatedAt: new Date().toISOString(),
      }
    } finally {
      isRefreshingLocalModels.value = false
    }
  }

  async function refreshProjects() {
    try {
      const response = await authFetch('/api/projects')
      if (!response.ok) return
      const data = await response.json()
      projects.value = Array.isArray(data.projects) ? data.projects : []
      if (activeProjectId.value && !projects.value.some((project) => project.id === activeProjectId.value)) {
        setActiveProject('')
      }
      scheduleServerStatePersist()
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
    scheduleServerStatePersist()
  }

  async function importProjectFolder(files: File[], pathMap?: Map<File, string>) {
    if (isImportingProject.value || !files.length) return null

    isImportingProject.value = true
    errorMessage.value = ''

    try {
      const { files: projectFiles, originalRoot } = await prepareProjectFiles(files, pathMap)
      if (!projectFiles.length) throw new Error(translate('errors.noImportableFiles'))

      const firstPath = projectFiles[0].path
      const name = firstPath.split('/')[0] || '导入项目'
      const response = await authFetch('/api/projects/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, files: projectFiles, originalRoot }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(data?.error || translate('errors.requestFailed', { status: response.status }))

      const project = data.project as ImportedProject
      projects.value = [project, ...projects.value.filter((item) => item.id !== project.id)]
      setActiveProject(project.id)
      scheduleServerStatePersist()
      return project
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : translate('errors.importProjectFailed')
      return null
    } finally {
      isImportingProject.value = false
    }
  }

  async function pickAndImportProjectFolder() {
    if (isImportingProject.value) return null

    isImportingProject.value = true
    errorMessage.value = ''

    try {
      const response = await authFetch('/api/projects/pick-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(data?.error || translate('errors.requestFailed', { status: response.status }))
      if (data?.cancelled) return null

      const project = data.project as ImportedProject
      projects.value = [project, ...projects.value.filter((item) => item.id !== project.id)]
      setActiveProject(project.id)
      scheduleServerStatePersist()
      return project
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : translate('errors.pickImportProjectFailed')
      return null
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
      const response = await authFetch(`/api/projects/${project.id}/analyze`, { method: 'POST' })
      const data = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(data?.error || translate('errors.requestFailed', { status: response.status }))

      const session = activeSession.value
      session.messages.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.analysis || translate('errors.noValidAnalysis'),
        createdAt: new Date().toISOString(),
      })
      session.updatedAt = new Date().toISOString()
      if (session.title === '新的会话') session.title = `${project.name} 框架分析`.slice(0, 24)
      saveSessions()
      return true
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : translate('errors.analyzeProjectFailed')
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
      const response = await authFetch(`/api/projects/${project.id}/tree`)
      const data = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(data?.error || translate('errors.requestFailed', { status: response.status }))
      activeProjectTree.value = Array.isArray(data.tree) ? data.tree : []
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : translate('errors.getTreeFailed')
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
      const response = await authFetch(`/api/projects/${project.id}/file?path=${encodeURIComponent(path)}`)
      const data = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(data?.error || translate('errors.requestFailed', { status: response.status }))
      activeFilePath.value = path
      activeFileContent.value = data.content || ''
      editedFileContent.value = activeFileContent.value
      activeFileDiff.value = ''
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : translate('errors.readFileFailed')
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
      const response = await authFetch(
        `/api/projects/${project.id}/file?path=${encodeURIComponent(activeFilePath.value)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: editedFileContent.value, dryRun: true }),
        },
      )
      const data = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(data?.error || translate('errors.requestFailed', { status: response.status }))
      activeFileDiff.value = data.diff || ''
      return activeFileDiff.value
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : translate('errors.diffFailed')
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
      const response = await authFetch(
        `/api/projects/${project.id}/file?path=${encodeURIComponent(activeFilePath.value)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: editedFileContent.value, dryRun: false }),
        },
      )
      const data = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(data?.error || translate('errors.requestFailed', { status: response.status }))
      activeFileContent.value = editedFileContent.value
      activeFileDiff.value = data.diff || ''
      await refreshProjects()
      await refreshActiveProjectTree()
      return true
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : translate('errors.writeFileFailed')
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
      const response = await authFetch(
        `/api/projects/${project.id}/open-file?path=${encodeURIComponent(activeFilePath.value)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ editor }),
        },
      )
      const data = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(data?.error || translate('errors.requestFailed', { status: response.status }))
      return true
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : translate('errors.openEditorFailed')
      return false
    } finally {
      isOpeningExternalEditor.value = false
    }
  }

  async function deleteProject(projectId: string) {
    if (!projectId) return false

    errorMessage.value = ''

    try {
      const response = await authFetch(`/api/projects/${projectId}`, { method: 'DELETE' })
      const data = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(data?.error || translate('errors.requestFailed', { status: response.status }))
      projects.value = projects.value.filter((project) => project.id !== projectId)
      if (activeProjectId.value === projectId) setActiveProject(projects.value[0]?.id || '')
      scheduleServerStatePersist()
      return true
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : translate('errors.deleteProjectFailed')
      return false
    }
  }

  async function indexCurrentWorkspace() {
    if (isIndexingWorkspace.value) return

    isIndexingWorkspace.value = true
    errorMessage.value = ''

    try {
      const response = await authFetch('/api/workspace/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(data?.error || translate('errors.requestFailed', { status: response.status }))
      workspaceStatus.value = data
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : translate('errors.indexProjectFailed')
    } finally {
      isIndexingWorkspace.value = false
    }
  }

  return {
    providers,
    selectedProviderId,
    selectedProvider,
    currentModelOptions,
    localModelOptions,
    apiKey,
    model,
    inferenceMode,
    localModel,
    hybridFallbackToCloud,
    localModelStatus,
    isProviderReady,
    isCloudProviderReady,
    isLocalInferenceReady,
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
    enableTools,
    enablePlanning,
    isPlanning,
    providerServerConfigured,
    isRefreshingLocalModels,
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
    clearErrorMessage,
    hydrateClientState,
    setProvider,
    setInferenceMode,
    setApiKey,
    setModel,
    setLocalModel,
    setHybridFallbackToCloud,
    newSession,
    deleteSession,
    renameSession,
    setActiveSession,
    importSessions,
    clearAllSessions,
    setSessionTags,
    removeTagFromAllSessions,
    updateSessionSummary,
    setActiveAgent,
    setEnableTools,
    setEnablePlanning,
    savePromptTemplate,
    deletePromptTemplate,
    saveCustomAgent,
    deleteCustomAgent,
    savePromptWorkflow,
    deletePromptWorkflow,
    prepareFiles,
    removePendingFile,
    sendMessage,
    sendPlanMessage,
    regenerateMessage,
    stop,
    runPromptWorkflow,
    summarizeActiveSession,
    refreshProviderServerConfig,
    refreshLocalModels,
    refreshWorkspaceStatus,
    refreshProjects,
    indexCurrentWorkspace,
    importProjectFolder,
    pickAndImportProjectFolder,
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

function getFileAbsolutePath(file: File): string | undefined {
  // 方式1: Electron 旧版本的 file.path
  const path1 = (file as File & { path?: string }).path
  if (typeof path1 === 'string' && path1) return path1

  // 方式2: Electron 28+ 的 webUtils.getPathForFile
  try {
    const electron = (
      window as Window & { Electron?: { webUtils?: { getPathForFile?: (f: File) => string } } }
    ).Electron
    if (electron?.webUtils?.getPathForFile) {
      const path2 = electron.webUtils.getPathForFile(file)
      if (typeof path2 === 'string' && path2) return path2
    }
  } catch {
    // ignore
  }

  // 方式3: Tauri 的 @tauri-apps/api
  try {
    const tauri = (window as Window & { __TAURI__?: { path?: { dirname?: (p: string) => string } } })
      .__TAURI__
    if (tauri?.path?.dirname) {
      // Tauri 下 file.path 同样可用（通过自定义协议或插件）
      const path3 = (file as any).path
      if (typeof path3 === 'string' && path3) return path3
    }
  } catch {
    // ignore
  }

  // 方式4: 尝试从 dataTransfer 或自定义属性获取（拖放场景兜底）
  try {
    const path4 = (file as any).relativePath || (file as any).fullPath
    if (typeof path4 === 'string' && path4 && path4.startsWith('/')) return path4
  } catch {
    // ignore
  }

  return undefined
}

function inferOriginalRoot(files: File[], pathMap?: Map<File, string>): string | undefined {
  for (const file of files) {
    const absPath = getFileAbsolutePath(file)
    const relPath = (
      pathMap?.get(file) ||
      (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
      file.name
    ).replace(/\\/g, '/')
    if (typeof absPath !== 'string' || !absPath) continue

    // 从 absPath 向上退 relPath 中的目录层级数
    // relPath 每有一个 / 就需要退一级；没有 / 时退 1 级（文件就在根目录下）
    const depth = Math.max(1, relPath.split('/').length - 1)
    let root = absPath
    for (let i = 0; i < depth; i++) {
      const lastSep = Math.max(root.lastIndexOf('/'), root.lastIndexOf('\\'))
      if (lastSep <= 0) break
      root = root.slice(0, lastSep)
    }
    if (root) return root
  }
  return undefined
}

async function prepareProjectFiles(files: File[], pathMap?: Map<File, string>) {
  const maxBytes = 256 * 1024
  const maxFiles = 5000
  const prepared: Array<{ path: string; text: string; size: number; type: string; lastModified: number }> = []
  const originalRoot = inferOriginalRoot(files, pathMap)

  for (const file of files.slice(0, maxFiles)) {
    const relativePath = (
      pathMap?.get(file) ||
      (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
      file.name
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

  return { files: prepared, originalRoot }
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
