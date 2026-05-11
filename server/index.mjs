import http from 'node:http'
import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  analyzeProject,
  buildWorkspaceContext,
  deleteProject,
  getProjectTree,
  getProjectFilePath,
  getProjectFilesRoot,
  getWorkspaceStatus,
  getProjectStatus,
  importProject,
  indexWorkspace,
  listProjects,
  previewProjectFileWrite,
  readProjectFile,
  searchProject,
  searchWorkspace,
  writeProjectFile,
} from './workspace-index.mjs'
import {
  captureClientErrorReport,
  captureServerError,
  initServerErrorMonitoring,
} from './error-monitoring.mjs'
import {
  authenticateRequest,
  completeOAuthTicket,
  getAuthCapabilities,
  handleOAuthCallback,
  loginWithAccount,
  loginWithDevQr,
  loginWithPhone,
  registerWithAccount,
  requestSmsCode,
  startOAuthLogin,
} from './auth.mjs'

const PORT = Number(process.env.PORT || 8787)
const HOST = process.env.HOST || '127.0.0.1'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.resolve(__dirname, '../dist')

initServerErrorMonitoring()

const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  '你是 Twentys1x 的 AI 助手。请用清晰、可靠、友好的方式回答问题，默认使用中文，必要时给出结构化步骤。'

const PROVIDERS = {
  openai: {
    kind: 'openai-compatible',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    envKey: 'OPENAI_API_KEY',
    needsApiKey: true,
  },
  gemini: {
    kind: 'gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    envKey: 'GEMINI_API_KEY',
    needsApiKey: true,
  },
  xai: {
    kind: 'openai-compatible',
    endpoint: 'https://api.x.ai/v1/chat/completions',
    envKey: 'XAI_API_KEY',
    needsApiKey: true,
  },
  anthropic: {
    kind: 'claude',
    endpoint: 'https://api.anthropic.com/v1/messages',
    envKey: 'ANTHROPIC_API_KEY',
    needsApiKey: true,
  },
  deepseek: {
    kind: 'openai-compatible',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    envKey: 'DEEPSEEK_API_KEY',
    needsApiKey: true,
  },
  doubao: {
    kind: 'openai-compatible',
    endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    envKey: 'DOUBAO_API_KEY',
    needsApiKey: true,
  },
  kimi: {
    kind: 'openai-compatible',
    endpoint: process.env.KIMI_BASE_URL
      ? `${process.env.KIMI_BASE_URL.replace(/\/$/, '')}/chat/completions`
      : 'https://api.moonshot.cn/v1/chat/completions',
    envKey: 'KIMI_API_KEY',
    needsApiKey: true,
  },
  qwen: {
    kind: 'openai-compatible',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    envKey: 'QWEN_API_KEY',
    needsApiKey: true,
  },
  ollama: {
    kind: 'openai-compatible',
    endpoint: process.env.OLLAMA_BASE_URL
      ? `${process.env.OLLAMA_BASE_URL.replace(/\/$/, '')}/v1/chat/completions`
      : 'http://localhost:11434/v1/chat/completions',
    envKey: 'OLLAMA_API_KEY',
    needsApiKey: false,
  },
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res)

  try {
    const routePath = getRoutePath(req)
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (req.method === 'GET' && routePath === '/health') {
      sendJson(res, 200, { ok: true })
      return
    }

    if (req.method === 'POST' && routePath === '/api/client-errors') {
      const body = await readJson(req, 64 * 1024)
      logClientError(body)
      sendJson(res, 202, { accepted: true })
      return
    }

    if (routePath.startsWith('/api/auth/')) {
      await handleAuthRoute(req, res, routePath)
      return
    }

    if (routePath.startsWith('/api/')) {
      req.user = await authenticateRequest(req)
    }

    if (req.method === 'GET' && routePath === '/api/workspace/status') {
      sendJson(res, 200, await getWorkspaceStatus())
      return
    }

    if (req.method === 'GET' && routePath === '/api/projects') {
      sendJson(res, 200, { projects: await listProjects() })
      return
    }

    if (req.method === 'GET' && routePath === '/api/providers') {
      sendJson(res, 200, {
        providers: Object.fromEntries(
          Object.entries(PROVIDERS).map(([id, provider]) => [
            id,
            {
              needsApiKey: provider.needsApiKey,
              serverConfigured: !provider.needsApiKey || Boolean(process.env[provider.envKey]),
            },
          ]),
        ),
      })
      return
    }

    if (req.method === 'GET' && routePath === '/api/local-models') {
      sendJson(res, 200, await getLocalModels())
      return
    }

    if (req.method === 'POST' && routePath === '/api/projects/import') {
      const body = await readJson(req)
      sendJson(res, 200, { project: await importProject(body) })
      return
    }

    if (req.method === 'POST' && routePath === '/api/workspace/index') {
      sendJson(res, 200, await indexWorkspace())
      return
    }

    if (req.method === 'POST' && routePath === '/api/workspace/search') {
      const body = await readJson(req)
      const results = await searchWorkspace(body?.query, Number(body?.limit || 8))
      sendJson(res, 200, { results })
      return
    }

    const projectAnalyzeMatch = routePath.match(/^\/api\/projects\/([^/]+)\/analyze$/)
    if (req.method === 'POST' && projectAnalyzeMatch) {
      const analysis = await analyzeProject(projectAnalyzeMatch[1])
      if (!analysis) throw httpError(404, 'Project not found')
      sendJson(res, 200, { analysis })
      return
    }

    const projectTreeMatch = routePath.match(/^\/api\/projects\/([^/]+)\/tree$/)
    if (req.method === 'GET' && projectTreeMatch) {
      const tree = await getProjectTree(projectTreeMatch[1])
      if (!tree) throw httpError(404, 'Project not found')
      sendJson(res, 200, { tree })
      return
    }

    const projectFileMatch = routePath.match(/^\/api\/projects\/([^/]+)\/file$/)
    if (projectFileMatch) {
      const projectId = projectFileMatch[1]
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
      const filePath = url.searchParams.get('path') || ''

      if (req.method === 'GET') {
        const content = await readProjectFile(projectId, filePath)
        if (content === null) throw httpError(404, 'File not found')
        sendJson(res, 200, { path: filePath, content })
        return
      }

      if (req.method === 'PUT') {
        const body = await readJson(req)
        const result = body?.dryRun
          ? await previewProjectFileWrite(projectId, filePath, String(body?.content || ''))
          : await writeProjectFile(projectId, filePath, String(body?.content || ''))
        if (!result) throw httpError(404, 'File not found')
        sendJson(res, 200, result)
        return
      }
    }

    const projectOpenFileMatch = routePath.match(/^\/api\/projects\/([^/]+)\/open-file$/)
    if (req.method === 'POST' && projectOpenFileMatch) {
      const projectId = projectOpenFileMatch[1]
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
      const filePath = url.searchParams.get('path') || ''
      const body = await readJson(req)
      const absolutePath = await getProjectFilePath(projectId, filePath)
      const projectRoot = await getProjectFilesRoot(projectId)
      if (!absolutePath) throw httpError(404, 'File not found')
      if (!projectRoot) throw httpError(404, 'Project not found')
      await openFileInExternalEditor(projectRoot, absolutePath, body?.editor)
      sendJson(res, 200, { opened: true, editor: normalizeEditor(body?.editor), path: filePath })
      return
    }

    const projectDeleteMatch = routePath.match(/^\/api\/projects\/([^/]+)$/)
    if (req.method === 'DELETE' && projectDeleteMatch) {
      const deleted = await deleteProject(projectDeleteMatch[1])
      if (!deleted) throw httpError(404, 'Project not found')
      sendJson(res, 200, { deleted: true })
      return
    }

    const projectSearchMatch = routePath.match(/^\/api\/projects\/([^/]+)\/search$/)
    if (req.method === 'POST' && projectSearchMatch) {
      const body = await readJson(req)
      const results = await searchProject(projectSearchMatch[1], body?.query, Number(body?.limit || 8))
      sendJson(res, 200, { results })
      return
    }

    if (req.method === 'POST' && routePath === '/api/chat') {
      const body = await readJson(req)
      console.log(
        `[chat] stream=${Boolean(body?.stream)} provider=${body?.providerId} model=${body?.model} messages=${body?.messages?.length || 0}`,
      )
      if (body?.stream) {
        await handleStreamChat(req, res, body)
      } else {
        const result = await handleChat(body)
        sendJson(res, 200, result)
      }
      return
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      await sendStaticFile(req, res)
      return
    }

    sendJson(res, 404, { error: 'Not found' })
    return
  } catch (error) {
    const status = Number(error?.status || 500)
    if (status >= 500) captureServerError(error, { route: req.url, status })
    sendJson(res, status, {
      error: error instanceof Error ? error.message : 'Unknown server error',
      details: error?.details,
    })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Agent backend listening on http://${HOST}:${PORT}`)
})

async function handleChat(body) {
  const ctx = await buildChatRequest(body)
  let effectiveTarget = ctx.target

  const callCloudFallback = () => {
    const fallbackApiKey = getApiKey(ctx.provider, body?.apiKey)
    if (ctx.provider.needsApiKey && !fallbackApiKey)
      throw httpError(400, `${ctx.provider.envKey} or apiKey is required`)
    effectiveTarget = {
      providerId: ctx.providerId,
      model: ctx.model,
      reason: '本地模型不可用，已回退云端模型。',
    }
    return callProvider(
      ctx.providerId,
      ctx.provider,
      ctx.model,
      ctx.messages,
      fallbackApiKey,
      ctx.runtimeSystemPrompt,
      {
        temperature: ctx.temperature,
      },
    )
  }

  let response = await callProvider(
    ctx.target.providerId,
    ctx.targetProvider,
    ctx.target.model,
    ctx.messages,
    ctx.targetApiKey,
    ctx.runtimeSystemPrompt,
    {
      temperature: ctx.temperature,
    },
  ).catch(async (error) => {
    if (ctx.canFallbackToCloud) return callCloudFallback()

    throw httpError(
      502,
      `Provider network error: ${error instanceof Error ? error.message : 'request failed'}`,
    )
  })

  let data = await readProviderResponse(response)
  if (!response.ok && ctx.canFallbackToCloud) {
    response = await callCloudFallback()
    data = await readProviderResponse(response)
  }

  if (!response.ok) {
    throw httpError(
      response.status,
      extractProviderErrorMessage(data) || `Provider request failed: ${response.status}`,
      data,
    )
  }

  return {
    content: extractProviderText(PROVIDERS[effectiveTarget.providerId], data),
    inference: effectiveTarget,
    workspaceHits: ctx.workspaceHits.map(({ path, startLine, endLine, score }) => ({
      path,
      startLine,
      endLine,
      score,
    })),
    raw: data,
  }
}

async function handleAuthRoute(req, res, routePath) {
  const oauthStartMatch = routePath.match(/^\/api\/auth\/oauth\/([^/]+)\/start$/)
  if (req.method === 'GET' && oauthStartMatch) {
    redirect(res, startOAuthLogin(req, oauthStartMatch[1]))
    return
  }

  const oauthCallbackMatch = routePath.match(/^\/api\/auth\/oauth\/([^/]+)\/callback$/)
  if (req.method === 'GET' && oauthCallbackMatch) {
    redirect(res, await handleOAuthCallback(req, oauthCallbackMatch[1]))
    return
  }

  if (req.method === 'POST' && routePath === '/api/auth/oauth/complete') {
    sendJson(res, 200, await completeOAuthTicket(await readJson(req, 16 * 1024)))
    return
  }

  if (req.method === 'GET' && routePath === '/api/auth/capabilities') {
    sendJson(res, 200, getAuthCapabilities())
    return
  }

  if (req.method === 'POST' && routePath === '/api/auth/sms') {
    sendJson(res, 200, await requestSmsCode(await readJson(req, 16 * 1024)))
    return
  }

  if (req.method === 'POST' && routePath === '/api/auth/phone-login') {
    sendJson(res, 200, await loginWithPhone(await readJson(req, 16 * 1024)))
    return
  }

  if (req.method === 'POST' && routePath === '/api/auth/register') {
    sendJson(res, 200, await registerWithAccount(await readJson(req, 16 * 1024)))
    return
  }

  if (req.method === 'POST' && routePath === '/api/auth/login') {
    sendJson(res, 200, await loginWithAccount(await readJson(req, 16 * 1024)))
    return
  }

  if (req.method === 'POST' && routePath === '/api/auth/qr-dev') {
    sendJson(res, 200, await loginWithDevQr(await readJson(req, 16 * 1024)))
    return
  }

  if (req.method === 'GET' && routePath === '/api/auth/me') {
    sendJson(res, 200, { user: await authenticateRequest(req) })
    return
  }

  if (req.method === 'POST' && routePath === '/api/auth/logout') {
    sendJson(res, 200, { loggedOut: true })
    return
  }

  throw httpError(404, 'Not found')
}

function validateChatBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'Invalid JSON body')
  }

  const messages = Array.isArray(body.messages) ? body.messages : []
  if (!messages.length) throw httpError(400, 'messages are required')
  if (messages.length > 60) throw httpError(400, 'messages exceeds limit')

  for (const message of messages) {
    if (message?.role !== 'user' && message?.role !== 'assistant') {
      throw httpError(400, 'message role is invalid')
    }
    if (typeof message.content !== 'string' && !Array.isArray(message.content)) {
      throw httpError(400, 'message content is invalid')
    }
  }
}

async function getLocalModels() {
  const ollamaBaseUrl = getOllamaBaseUrl()

  try {
    const [tagsResponse, versionResponse, psResponse] = await Promise.all([
      fetchJson(`${ollamaBaseUrl}/api/tags`),
      fetchJson(`${ollamaBaseUrl}/api/version`).catch(() => ({})),
      fetchJson(`${ollamaBaseUrl}/api/ps`).catch(() => ({})),
    ])
    const running = new Set(
      (Array.isArray(psResponse.models) ? psResponse.models : []).map((item) => item.name),
    )
    const models = (Array.isArray(tagsResponse.models) ? tagsResponse.models : []).map((item) =>
      normalizeLocalModel(item, running),
    )

    return {
      available: true,
      version: String(versionResponse.version || ''),
      models,
      updatedAt: new Date().toISOString(),
    }
  } catch (error) {
    return {
      available: false,
      version: '',
      models: [],
      error: error instanceof Error ? error.message : 'Ollama is not available',
      updatedAt: new Date().toISOString(),
    }
  }
}

function getOllamaBaseUrl() {
  if (process.env.OLLAMA_BASE_URL) return process.env.OLLAMA_BASE_URL.replace(/\/$/, '')
  return 'http://localhost:11434'
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(2500),
  })
  const data = await readProviderResponse(response)
  if (!response.ok) throw new Error(extractProviderErrorMessage(data) || `Request failed: ${response.status}`)
  return data || {}
}

function normalizeLocalModel(item, running) {
  const name = String(item?.name || item?.model || '').trim()
  const details = item?.details && typeof item.details === 'object' ? item.details : {}

  return {
    name,
    label: name,
    size: Number(item?.size || 0),
    digest: String(item?.digest || ''),
    modifiedAt: String(item?.modified_at || ''),
    running: running.has(name),
    parameterSize: typeof details.parameter_size === 'string' ? details.parameter_size : '',
    quantizationLevel: typeof details.quantization_level === 'string' ? details.quantization_level : '',
  }
}

function callProvider(providerId, provider, model, messages, apiKey, systemPrompt, options = {}) {
  if (provider.kind === 'gemini') return callGemini(provider, model, messages, apiKey, systemPrompt, options)
  if (provider.kind === 'claude') return callClaude(provider, model, messages, apiKey, systemPrompt, options)
  return callOpenAiCompatible(providerId, provider, model, messages, apiKey, systemPrompt, options)
}

function normalizeInferenceMode(value) {
  return value === 'local' || value === 'auto' || value === 'cloud' ? value : 'cloud'
}

function resolveInferenceTarget({
  inferenceMode,
  cloudProviderId,
  cloudModel,
  localProviderId,
  localModel,
  messages,
  hasWorkspaceContext,
}) {
  if (inferenceMode === 'local') {
    return {
      providerId: localProviderId,
      model: localModel,
      reason: '用户选择了本地模型推理。',
    }
  }

  if (inferenceMode === 'auto' && localModel && shouldUseLocalModel(messages, hasWorkspaceContext)) {
    return {
      providerId: localProviderId,
      model: localModel,
      reason: '自动混合策略判定为短文本或隐私优先任务，使用本地模型。',
    }
  }

  return {
    providerId: cloudProviderId,
    model: cloudModel,
    reason:
      inferenceMode === 'auto' ? '自动混合策略判定为复杂任务，使用云端模型。' : '用户选择了云端模型推理。',
  }
}

function shouldUseLocalModel(messages, hasWorkspaceContext) {
  const latestText = getLatestUserText(messages)
  if (!latestText.trim()) return false
  if (hasWorkspaceContext) return false
  if (
    messages.some(
      (message) =>
        Array.isArray(message?.content) && message.content.some((part) => part.type === 'image_url'),
    )
  ) {
    return false
  }

  const complexPatterns = [
    /架构|重构|调试|debug|性能|并发|安全|漏洞|审计|生产|部署|迁移|数据库|权限|鉴权/i,
    /生成.*代码|实现.*功能|修复.*bug|完整.*方案/i,
    /```|diff --git|stack trace|traceback|exception/i,
  ]
  if (complexPatterns.some((pattern) => pattern.test(latestText))) return false
  if (latestText.length > 900) return false

  const totalTextLength = messages.reduce((sum, message) => sum + messageToText(message?.content).length, 0)
  return totalTextLength <= 2200
}

function getApiKey(provider, requestApiKey) {
  const envKey = provider.envKey ? process.env[provider.envKey] : ''
  // 优先使用前端本次请求携带的 key，便于用户在界面内及时切换/修复失效凭证
  return normalizeApiKey(requestApiKey || envKey || '')
}

function normalizeApiKey(value) {
  return String(value || '')
    .replace(/^Bearer\s+/i, '')
    .replace(/\s+/g, '')
    .trim()
}

function authHeaders(provider, apiKey) {
  if (!provider.needsApiKey || !apiKey) return {}
  if (provider.kind === 'gemini') return { 'x-goog-api-key': apiKey }
  if (provider.kind === 'claude') return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
  return { Authorization: `Bearer ${apiKey}` }
}

function callOpenAiCompatible(providerId, provider, model, messages, apiKey, systemPrompt, options = {}) {
  const requestedTemperature = typeof options.temperature === 'number' ? options.temperature : undefined
  const effectiveTemperature = providerId === 'kimi' && model === 'kimi-k2.6' ? 0.6 : requestedTemperature

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages
        .filter((message) => message.role === 'user' || (message.role === 'assistant' && message.content))
        .map((message) => ({
          role: message.role,
          content: message.content,
        })),
    ],
    ...(typeof effectiveTemperature === 'number' ? { temperature: effectiveTemperature } : {}),
    ...(providerId === 'kimi' ? { thinking: { type: 'disabled' } } : {}),
  }

  return fetch(provider.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(provider, apiKey),
    },
    body: JSON.stringify(body),
  })
}

function callClaude(provider, model, messages, apiKey, systemPrompt, options = {}) {
  return fetch(provider.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(provider, apiKey),
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      ...(typeof options.temperature === 'number' ? { temperature: options.temperature } : {}),
      system: systemPrompt,
      messages: messages
        .filter((message) => message.role === 'user' || (message.role === 'assistant' && message.content))
        .map((message) => ({
          role: message.role,
          content: toClaudeContent(message.content),
        })),
    }),
  })
}

function callGemini(provider, model, messages, apiKey, systemPrompt, options = {}) {
  const geminiModel = encodeURIComponent(model)
  return fetch(`${provider.endpoint}/${geminiModel}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(provider, apiKey),
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      ...(typeof options.temperature === 'number'
        ? { generationConfig: { temperature: options.temperature } }
        : {}),
      contents: messages
        .filter((message) => message.role === 'user' || (message.role === 'assistant' && message.content))
        .map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: toGeminiParts(message.content),
        })),
    }),
  })
}

function normalizeTemperature(value) {
  if (value === undefined || value === null || value === '') return undefined
  const temperature = Number(value)
  if (!Number.isFinite(temperature)) return undefined
  return Math.min(2, Math.max(0, temperature))
}

function getLatestUserText(messages) {
  const latest = [...messages].reverse().find((message) => message?.role === 'user')
  if (!latest) return ''
  return messageToText(latest.content)
}

function messageToText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .filter((part) => part?.type === 'text')
    .map((part) => part.text || '')
    .join('\n')
}

function toClaudeContent(content) {
  if (typeof content === 'string') return content

  return content
    .map((part) => {
      if (part.type === 'text') return { type: 'text', text: part.text }
      return dataUrlToClaudeImage(part)
    })
    .filter(Boolean)
}

function toGeminiParts(content) {
  if (typeof content === 'string') return [{ text: content }]

  return content
    .map((part) => {
      if (part.type === 'text') return { text: part.text }
      return dataUrlToGeminiImage(part)
    })
    .filter(Boolean)
}

function dataUrlToClaudeImage(part) {
  const match = part?.image_url?.url?.match(/^data:(.*?);base64,(.*)$/)
  if (!match) return null

  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: match[1],
      data: match[2],
    },
  }
}

function dataUrlToGeminiImage(part) {
  const match = part?.image_url?.url?.match(/^data:(.*?);base64,(.*)$/)
  if (!match) return null

  return {
    inlineData: {
      mimeType: match[1],
      data: match[2],
    },
  }
}

function extractProviderText(provider, data) {
  if (provider.kind === 'gemini') {
    return normalizeProviderText(data.candidates?.[0]?.content?.parts)
  }

  if (provider.kind === 'claude') {
    return normalizeProviderText(data.content)
  }

  const message = data.choices?.[0]?.message || {}
  return normalizeProviderText(message.content || message.reasoning_content || message.refusal)
}

function normalizeProviderText(value) {
  if (typeof value === 'string') return value.trim() || '没有收到有效回复。'

  if (Array.isArray(value)) {
    const text = value
      .map((part) => {
        if (typeof part === 'string') return part
        if (!part || typeof part !== 'object') return ''
        if (typeof part.text === 'string') return part.text
        if (typeof part.content === 'string') return part.content
        if (typeof part.value === 'string') return part.value
        return ''
      })
      .join('')
      .trim()
    return text || '没有收到有效回复。'
  }

  return '没有收到有效回复。'
}

async function readProviderResponse(response) {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function extractProviderErrorMessage(data) {
  if (!data) return ''
  if (typeof data === 'string') return data.trim()
  if (typeof data !== 'object') return ''

  const error = data.error
  if (typeof error === 'string') return error.trim()
  if (error && typeof error === 'object') {
    const message = typeof error.message === 'string' ? error.message.trim() : ''
    const type = typeof error.type === 'string' ? error.type.trim() : ''
    if (type && message) return `${type}: ${message}`
    if (message) return message
    if (type) return type
  }

  return typeof data.message === 'string' ? data.message.trim() : ''
}

function readJson(req, maxBytes = 40 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = ''

    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > maxBytes) {
        reject(httpError(413, 'Request body too large'))
        req.destroy()
      }
    })

    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(httpError(400, 'Invalid JSON body'))
      }
    })

    req.on('error', reject)
  })
}

function getRoutePath(req) {
  return new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).pathname
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

function redirect(res, location) {
  res.writeHead(302, { Location: location })
  res.end()
}

function logClientError(body) {
  const payload = captureClientErrorReport(body)

  console.error(
    JSON.stringify({
      level: 'error',
      type: 'client-error',
      source: payload.source,
      component: payload.component,
      info: payload.info,
      message: payload.message,
      stack: payload.stack,
      url: payload.url,
      userAgent: payload.userAgent,
      createdAt: payload.createdAt,
    }),
  )
}

async function sendStaticFile(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const requestPath = decodeURIComponent(url.pathname)
  const safePath = requestPath === '/' ? '/index.html' : requestPath
  const filePath = path.resolve(PUBLIC_DIR, `.${safePath}`)

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: 'Forbidden' })
    return
  }

  const resolvedPath = (await canReadFile(filePath)) ? filePath : path.join(PUBLIC_DIR, 'index.html')
  const fileStats = await canReadFile(resolvedPath)
  if (!fileStats) {
    sendJson(res, 404, { error: 'Not found' })
    return
  }

  res.writeHead(200, {
    'Content-Type': contentTypeFor(resolvedPath),
    'Content-Length': String(fileStats.size),
    'Cache-Control': resolvedPath.includes(`${path.sep}assets${path.sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  })

  if (req.method === 'HEAD') {
    res.end()
    return
  }

  createReadStream(resolvedPath).pipe(res)
}

async function canReadFile(filePath) {
  try {
    const fileStats = await stat(filePath)
    return fileStats.isFile() ? fileStats : null
  } catch {
    return null
  }
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.css') return 'text/css; charset=utf-8'
  if (extension === '.html') return 'text/html; charset=utf-8'
  if (extension === '.ico') return 'image/x-icon'
  if (extension === '.js') return 'text/javascript; charset=utf-8'
  if (extension === '.json') return 'application/json; charset=utf-8'
  if (extension === '.png') return 'image/png'
  if (extension === '.svg') return 'image/svg+xml'
  if (extension === '.webp') return 'image/webp'
  return 'application/octet-stream'
}

function normalizeEditor(value) {
  return value === 'vscode' ? 'vscode' : 'cursor'
}

async function openFileInExternalEditor(projectRoot, filePath, editor) {
  const selectedEditor = normalizeEditor(editor)
  const commands = buildExternalEditorOpenCommands(projectRoot, filePath, selectedEditor)

  for (const command of commands) {
    try {
      await spawnDetached(command, projectRoot)
      return
    } catch (error) {
      if (command === commands.at(-1)) throw error
    }
  }
}

function buildExternalEditorOpenCommands(projectRoot, filePath, editor) {
  const selectedEditor = normalizeEditor(editor)
  const cliName = selectedEditor === 'vscode' ? 'code' : 'cursor'
  const gotoTarget = `${filePath}:1:1`
  const args = ['--new-window', '--goto', gotoTarget, projectRoot]

  if (process.platform !== 'darwin') return [[cliName, args]]

  const macAppCli =
    selectedEditor === 'vscode'
      ? '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'
      : '/Applications/Cursor.app/Contents/Resources/app/bin/cursor'

  return [
    [macAppCli, args],
    [cliName, args],
  ]
}

function spawnDetached([command, args], cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      detached: true,
      stdio: 'ignore',
    })

    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

function httpError(status, message, details) {
  const error = new Error(message)
  error.status = status
  error.details = details
  return error
}

async function buildChatRequest(body) {
  validateChatBody(body)
  const providerId = String(body?.providerId || '')
  const provider = PROVIDERS[providerId]
  if (!provider) throw httpError(400, `Unsupported provider: ${providerId}`)

  const model = String(body?.model || '').trim()
  const localProviderId = String(body?.localProviderId || 'ollama')
  const localProvider = PROVIDERS[localProviderId]
  if (!localProvider) throw httpError(400, `Unsupported local provider: ${localProviderId}`)
  const localModel = String(body?.localModel || '').trim()
  const messages = Array.isArray(body?.messages) ? body.messages : []
  const activeProject = body?.projectId ? await getProjectStatus(body.projectId) : null
  if (body?.projectId && !activeProject) throw httpError(404, 'Active project not found')
  const workspaceHits =
    body?.useWorkspaceContext === false
      ? []
      : activeProject
        ? await searchProject(activeProject.id, getLatestUserText(messages), 6)
        : await searchWorkspace(getLatestUserText(messages), 6)
  const workspaceContext = buildWorkspaceContext(workspaceHits)
  const currentOperationObject = activeProject
    ? `当前操作对象：项目「${activeProject.name}」（projectId: ${activeProject.id}）`
    : '当前操作对象：宿主工作区（未选中导入项目）'
  const projectInstruction = activeProject
    ? `${currentOperationObject}。当前正在查看和操作的项目是「${activeProject.name}」（projectId: ${activeProject.id}）。所有项目分析、文件路径引用、修改建议和工具操作都必须默认针对这个项目；不要把后端宿主项目或其他导入项目当成当前目标。`
    : `${currentOperationObject}。当前未选择导入项目；只有在用户明确要求时才分析宿主工作区。`
  const requestSystemPrompt = String(body?.systemPrompt || '').trim()
  const systemPrompt = workspaceContext
    ? `${SYSTEM_PROMPT}\n\n${projectInstruction}\n\n你可以使用以下项目检索上下文回答问题。上下文来自当前项目索引，优先根据这些片段给出有文件路径依据的回答；如果上下文不足，请明确说明。\n\n${workspaceContext}`
    : `${SYSTEM_PROMPT}\n\n${projectInstruction}`
  const runtimeSystemPrompt = requestSystemPrompt ? `${systemPrompt}\n\n${requestSystemPrompt}` : systemPrompt
  const temperature = normalizeTemperature(body?.temperature)
  const inferenceMode = normalizeInferenceMode(body?.inferenceMode)
  const target = resolveInferenceTarget({
    inferenceMode,
    cloudProviderId: providerId,
    cloudModel: model,
    localProviderId,
    localModel,
    messages,
    hasWorkspaceContext: Boolean(workspaceContext),
  })
  const targetProvider = PROVIDERS[target.providerId]
  const targetApiKey = getApiKey(targetProvider, target.providerId === providerId ? body?.apiKey : '')

  if (!target.model) throw httpError(400, 'model is required')
  if (!messages.length) throw httpError(400, 'messages are required')
  if (targetProvider.needsApiKey && !targetApiKey) {
    throw httpError(400, `${targetProvider.envKey} or apiKey is required`)
  }

  const canFallbackToCloud =
    inferenceMode === 'auto' &&
    body?.hybridFallbackToCloud !== false &&
    target.providerId === localProviderId &&
    providerId !== localProviderId &&
    Boolean(model)

  return {
    providerId,
    provider,
    model,
    messages,
    workspaceHits,
    temperature,
    runtimeSystemPrompt,
    target,
    targetProvider,
    targetApiKey,
    canFallbackToCloud,
  }
}

async function handleStreamChat(req, res, body) {
  const ctx = await buildChatRequest(body)
  let effectiveTarget = ctx.target

  const callCloudFallbackStream = () => {
    const fallbackApiKey = getApiKey(ctx.provider, body?.apiKey)
    if (ctx.provider.needsApiKey && !fallbackApiKey)
      throw httpError(400, `${ctx.provider.envKey} or apiKey is required`)
    effectiveTarget = {
      providerId: ctx.providerId,
      model: ctx.model,
      reason: '本地模型不可用，已回退云端模型。',
    }
    return callProviderStream(
      ctx.providerId,
      ctx.provider,
      ctx.model,
      ctx.messages,
      fallbackApiKey,
      ctx.runtimeSystemPrompt,
      {
        temperature: ctx.temperature,
      },
    )
  }

  let response
  try {
    response = await callProviderStream(
      ctx.target.providerId,
      ctx.targetProvider,
      ctx.target.model,
      ctx.messages,
      ctx.targetApiKey,
      ctx.runtimeSystemPrompt,
      {
        temperature: ctx.temperature,
      },
    )
  } catch (error) {
    if (ctx.canFallbackToCloud) {
      try {
        response = await callCloudFallbackStream()
      } catch (fallbackError) {
        sendStreamError(
          res,
          `Provider network error: ${fallbackError instanceof Error ? fallbackError.message : 'request failed'}`,
        )
        return
      }
    } else {
      sendStreamError(
        res,
        `Provider network error: ${error instanceof Error ? error.message : 'request failed'}`,
      )
      return
    }
  }

  if (!response.ok) {
    const data = await readProviderResponse(response).catch(() => null)
    sendStreamError(res, extractProviderErrorMessage(data) || `Provider request failed: ${response.status}`)
    return
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  res.write(
    `event: start\ndata: ${JSON.stringify({
      inference: effectiveTarget,
      workspaceHits: ctx.workspaceHits.map(({ path, startLine, endLine, score }) => ({
        path,
        startLine,
        endLine,
        score,
      })),
    })}\n\n`,
  )

  const parser = createSseParser()
  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const events = parser.push(decoder.decode(value, { stream: true }))
      for (const { event, data } of events) {
        const delta = extractStreamDelta(ctx.targetProvider.kind, event, data)
        if (delta.text) {
          res.write(`event: delta\ndata: ${JSON.stringify({ content: delta.text })}\n\n`)
        }
      }
    }

    const events = parser.flush()
    for (const { event, data } of events) {
      const delta = extractStreamDelta(ctx.targetProvider.kind, event, data)
      if (delta.text) {
        res.write(`event: delta\ndata: ${JSON.stringify({ content: delta.text })}\n\n`)
      }
    }
  } catch (streamError) {
    sendStreamError(res, `Stream error: ${streamError instanceof Error ? streamError.message : 'unknown'}`)
    return
  }

  res.write(`event: done\ndata: {}\n\n`)
  res.end()
}

function sendStreamError(res, message) {
  res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`)
  res.write(`event: done\ndata: {}\n\n`)
  res.end()
}

function callProviderStream(providerId, provider, model, messages, apiKey, systemPrompt, options = {}) {
  if (provider.kind === 'gemini')
    return callGeminiStream(provider, model, messages, apiKey, systemPrompt, options)
  if (provider.kind === 'claude')
    return callClaudeStream(provider, model, messages, apiKey, systemPrompt, options)
  return callOpenAiCompatibleStream(providerId, provider, model, messages, apiKey, systemPrompt, options)
}

function callOpenAiCompatibleStream(
  providerId,
  provider,
  model,
  messages,
  apiKey,
  systemPrompt,
  options = {},
) {
  const requestedTemperature = typeof options.temperature === 'number' ? options.temperature : undefined
  const effectiveTemperature = providerId === 'kimi' && model === 'kimi-k2.6' ? 0.6 : requestedTemperature

  const body = {
    model,
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages
        .filter((message) => message.role === 'user' || (message.role === 'assistant' && message.content))
        .map((message) => ({
          role: message.role,
          content: message.content,
        })),
    ],
    ...(typeof effectiveTemperature === 'number' ? { temperature: effectiveTemperature } : {}),
    ...(providerId === 'kimi' ? { thinking: { type: 'disabled' } } : {}),
  }

  return fetch(provider.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(provider, apiKey),
    },
    body: JSON.stringify(body),
  })
}

function callClaudeStream(provider, model, messages, apiKey, systemPrompt, options = {}) {
  return fetch(provider.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(provider, apiKey),
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      stream: true,
      ...(typeof options.temperature === 'number' ? { temperature: options.temperature } : {}),
      system: systemPrompt,
      messages: messages
        .filter((message) => message.role === 'user' || (message.role === 'assistant' && message.content))
        .map((message) => ({
          role: message.role,
          content: toClaudeContent(message.content),
        })),
    }),
  })
}

function callGeminiStream(provider, model, messages, apiKey, systemPrompt, options = {}) {
  const geminiModel = encodeURIComponent(model)
  return fetch(`${provider.endpoint}/${geminiModel}:streamGenerateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(provider, apiKey),
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      ...(typeof options.temperature === 'number'
        ? { generationConfig: { temperature: options.temperature } }
        : {}),
      contents: messages
        .filter((message) => message.role === 'user' || (message.role === 'assistant' && message.content))
        .map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: toGeminiParts(message.content),
        })),
    }),
  })
}

function createSseParser() {
  let buffer = ''
  let currentEvent = null
  return {
    push(chunk) {
      buffer += chunk
      const events = []
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed === '') {
          currentEvent = null
          continue
        }
        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.slice(6).trim()
        } else if (trimmed.startsWith('data:')) {
          events.push({ event: currentEvent || 'message', data: trimmed.slice(5).trim() })
          currentEvent = null
        }
      }
      return events
    },
    flush() {
      const events = this.push('\n\n')
      buffer = ''
      currentEvent = null
      return events
    },
  }
}

function extractStreamDelta(providerKind, eventName, data) {
  if (data === '[DONE]') return { done: true }
  try {
    const json = JSON.parse(data)
    if (providerKind === 'gemini') {
      const text = json.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || ''
      return { text }
    }
    if (providerKind === 'claude') {
      if (eventName === 'content_block_delta') {
        return { text: json.delta?.text || '' }
      }
      if (eventName === 'message_stop') {
        return { done: true }
      }
      return { text: '' }
    }
    const text = json.choices?.[0]?.delta?.content || json.choices?.[0]?.delta?.reasoning_content || ''
    return { text }
  } catch {
    return { text: '' }
  }
}
