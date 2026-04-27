import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

type Role = 'user' | 'assistant'
type ProviderKind = 'openai-compatible' | 'gemini' | 'claude'
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
  kind: 'image' | 'text'
  dataUrl?: string
  text?: string
}

export interface ChatMessage {
  id: string
  role: Role
  content: MessageContent
  attachments?: Array<Pick<PreparedFile, 'id' | 'name' | 'kind' | 'size' | 'type'>>
  createdAt: string
}

export interface ChatSession {
  id: string
  title: string
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
  kind: ProviderKind
  endpoint: string
  models: ProviderModel[]
  needsApiKey: boolean
}

const STORAGE_KEYS = {
  apiKey: 'twentys1x:kimi-api-key',
  apiKeys: 'twentys1x:provider-api-keys',
  provider: 'twentys1x:provider',
  sessions: 'twentys1x:sessions',
  activeSession: 'twentys1x:active-session',
  models: 'twentys1x:provider-models',
  model: 'twentys1x:kimi-model',
}

export const AI_PROVIDERS: AiProvider[] = [
  {
    id: 'openai',
    name: 'ChatGPT / OpenAI',
    keyLabel: 'OpenAI API Key',
    keyPlaceholder: 'sk-...',
    kind: 'openai-compatible',
    endpoint: '/api/openai/v1/chat/completions',
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
    kind: 'gemini',
    endpoint: '/api/gemini/v1beta/models',
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
    kind: 'openai-compatible',
    endpoint: '/api/xai/v1/chat/completions',
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
    kind: 'claude',
    endpoint: '/api/anthropic/v1/messages',
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
    kind: 'openai-compatible',
    endpoint: '/api/deepseek/v1/chat/completions',
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
    kind: 'openai-compatible',
    endpoint: '/api/doubao/api/v3/chat/completions',
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
    kind: 'openai-compatible',
    endpoint: '/api/kimi/v1/chat/completions',
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
    kind: 'openai-compatible',
    endpoint: '/api/qwen/v1/chat/completions',
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
    kind: 'openai-compatible',
    endpoint: '/api/ollama/v1/chat/completions',
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
const SYSTEM_PROMPT =
  '你是 Twentys1x 的 AI 助手。请用清晰、可靠、友好的方式回答问题，默认使用中文，必要时给出结构化步骤。'

function getProvider(id: ProviderId) {
  return AI_PROVIDERS.find((provider) => provider.id === id) || AI_PROVIDERS.find((provider) => provider.id === DEFAULT_PROVIDER)!
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
    createdAt: now,
    updatedAt: now,
    messages: [],
  }
}

function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.sessions)
    const parsed = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed) && parsed.length) return parsed
  } catch {
    localStorage.removeItem(STORAGE_KEYS.sessions)
  }

  return [createSession()]
}

function persist(key: string, value: string) {
  localStorage.setItem(key, value)
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

function dataUrlToClaudeImage(part: Extract<MultiModalContent[number], { type: 'image_url' }>) {
  const match = part.image_url.url.match(/^data:(.*?);base64,(.*)$/)
  if (!match) return null

  return {
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: match[1],
      data: match[2],
    },
  }
}

function dataUrlToGeminiImage(part: Extract<MultiModalContent[number], { type: 'image_url' }>) {
  const match = part.image_url.url.match(/^data:(.*?);base64,(.*)$/)
  if (!match) return null

  return {
    inlineData: {
      mimeType: match[1],
      data: match[2],
    },
  }
}

function toClaudeContent(content: MessageContent) {
  if (typeof content === 'string') return content

  return content
    .map((part) => {
      if (part.type === 'text') return { type: 'text' as const, text: part.text }
      return dataUrlToClaudeImage(part)
    })
    .filter(Boolean)
}

function toGeminiParts(content: MessageContent) {
  if (typeof content === 'string') return [{ text: content }]

  return content
    .map((part) => {
      if (part.type === 'text') return { text: part.text }
      return dataUrlToGeminiImage(part)
    })
    .filter(Boolean)
}

export const useChatStore = defineStore('chat', () => {
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
  const pendingFiles = ref<PreparedFile[]>([])
  const isSending = ref(false)
  const errorMessage = ref('')

  const providers = computed(() => AI_PROVIDERS)
  const selectedProvider = computed(() => getProvider(selectedProviderId.value))
  const currentModelOptions = computed(() => selectedProvider.value.models)
  const apiKey = computed(() => providerApiKeys.value[selectedProviderId.value] || '')
  const model = computed(() => providerModels.value[selectedProviderId.value] || getDefaultModel(selectedProviderId.value))
  const isProviderReady = computed(() => !selectedProvider.value.needsApiKey || Boolean(apiKey.value.trim()))

  const activeSession = computed(() => {
    return sessions.value.find((session) => session.id === activeSessionId.value) || sessions.value[0]
  })

  const visibleMessages = computed(() => activeSession.value?.messages || [])

  function saveSessions() {
    persist(STORAGE_KEYS.sessions, JSON.stringify(sessions.value))
  }

  function setApiKey(value: string) {
    providerApiKeys.value = {
      ...providerApiKeys.value,
      [selectedProviderId.value]: value,
    }
    persist(STORAGE_KEYS.apiKeys, JSON.stringify(providerApiKeys.value))
    if (selectedProviderId.value === 'kimi') persist(STORAGE_KEYS.apiKey, value.trim())
  }

  function setModel(value: string) {
    providerModels.value = {
      ...providerModels.value,
      [selectedProviderId.value]: value.trim() || getDefaultModel(selectedProviderId.value),
    }
    persist(STORAGE_KEYS.models, JSON.stringify(providerModels.value))
    if (selectedProviderId.value === 'kimi') persist(STORAGE_KEYS.model, providerModels.value.kimi || DEFAULT_MODEL)
  }

  function setProvider(providerId: ProviderId) {
    selectedProviderId.value = providerId
    if (!providerModels.value[providerId]) setModel(getDefaultModel(providerId))
    errorMessage.value = ''
    persist(STORAGE_KEYS.provider, providerId)
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

  async function prepareFiles(files: File[]) {
    const maxBytes = 4 * 1024 * 1024
    const prepared: PreparedFile[] = []

    for (const file of files) {
      if (file.size > maxBytes) {
        errorMessage.value = `${file.name} 超过 4MB，当前版本先限制小文件上传。`
        continue
      }

      if (file.type.startsWith('image/')) {
        prepared.push({
          id: crypto.randomUUID(),
          name: file.name,
          type: file.type,
          size: file.size,
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
        kind: 'text',
        text: text.slice(0, 20000),
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

  async function sendMessage(text: string) {
    const cleanText = text.trim()
    const files = [...pendingFiles.value]
    if (!isProviderReady.value || isSending.value || (!cleanText && !files.length)) return false

    const session = activeSession.value
    const provider = selectedProvider.value
    const content = buildUserContent(cleanText, files)
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      attachments: files.map(({ id, name, kind, size, type }) => ({ id, name, kind, size, type })),
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

    try {
      const response = await callProvider(provider, session.messages)

      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail || `请求失败：${response.status}`)
      }

      const data = await response.json()
      assistantMessage.content = extractProviderText(provider, data)
      session.updatedAt = new Date().toISOString()
    } catch (error) {
      assistantMessage.content = '调用失败，请检查 API Key、模型名称、供应商配置或网络连接。'
      errorMessage.value = error instanceof Error ? error.message : '未知错误'
    } finally {
      isSending.value = false
      saveSessions()
    }

    return true
  }

  function authHeaders(provider: AiProvider): Record<string, string> {
    const key = apiKey.value.trim()
    if (!provider.needsApiKey || !key) return {}
    if (provider.kind === 'gemini') return { 'x-goog-api-key': key }
    if (provider.kind === 'claude') return { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
    return { Authorization: `Bearer ${key}` }
  }

  function callProvider(provider: AiProvider, messages: ChatMessage[]) {
    if (provider.kind === 'gemini') return callGemini(provider, messages)
    if (provider.kind === 'claude') return callClaude(provider, messages)
    return callOpenAiCompatible(provider, messages)
  }

  function callOpenAiCompatible(provider: AiProvider, messages: ChatMessage[]) {
    return fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(provider),
      },
      body: JSON.stringify({
        model: model.value.trim() || getDefaultModel(provider.id),
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages
            .filter((message) => message.role === 'user' || (message.role === 'assistant' && message.content))
            .map((message) => ({
              role: message.role,
              content: message.content,
            })),
        ],
        ...(provider.id === 'kimi' ? { thinking: { type: 'disabled' } } : {}),
      }),
    })
  }

  function callClaude(provider: AiProvider, messages: ChatMessage[]) {
    return fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(provider),
      },
      body: JSON.stringify({
        model: model.value.trim() || getDefaultModel(provider.id),
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: messages
          .filter((message) => message.role === 'user' || (message.role === 'assistant' && message.content))
          .map((message) => ({
            role: message.role,
            content: toClaudeContent(message.content),
          })),
      }),
    })
  }

  function callGemini(provider: AiProvider, messages: ChatMessage[]) {
    const geminiModel = encodeURIComponent(model.value.trim() || getDefaultModel(provider.id))
    return fetch(`${provider.endpoint}/${geminiModel}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(provider),
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents: messages
          .filter((message) => message.role === 'user' || (message.role === 'assistant' && message.content))
          .map((message) => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: toGeminiParts(message.content),
          })),
      }),
    })
  }

  function extractProviderText(provider: AiProvider, data: any) {
    if (provider.kind === 'gemini') {
      return data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('') || '没有收到有效回复。'
    }

    if (provider.kind === 'claude') {
      return data.content?.map((part: { text?: string }) => part.text || '').join('') || '没有收到有效回复。'
    }

    return data.choices?.[0]?.message?.content || '没有收到有效回复。'
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
    visibleMessages,
    pendingFiles,
    isSending,
    errorMessage,
    setProvider,
    setApiKey,
    setModel,
    newSession,
    deleteSession,
    setActiveSession,
    clearAllSessions,
    prepareFiles,
    removePendingFile,
    sendMessage,
  }
})
