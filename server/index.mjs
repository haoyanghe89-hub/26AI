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
  getProjectOriginalRoot,
  getWorkspaceStatus,
  getProjectStatus,
  importProject,
  importProjectFromLocalRoot,
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
import { executeTool, TOOL_DEFINITIONS } from './tools.mjs'
import { initPersistence, loadUserState, saveUserState } from './persistence.mjs'
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
await initPersistence()

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

    if (req.method === 'GET' && routePath === '/api/state') {
      sendJson(res, 200, await loadUserState(req.user.id))
      return
    }

    if (req.method === 'PUT' && routePath === '/api/state') {
      const body = await readJson(req)
      sendJson(res, 200, await saveUserState(req.user.id, body))
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

    if (req.method === 'POST' && routePath === '/api/projects/pick-local') {
      const rootPath = await pickLocalProjectDirectory()
      if (!rootPath) {
        sendJson(res, 200, { cancelled: true, project: null })
        return
      }

      const project = await importProjectFromLocalRoot(rootPath)
      if (!project) throw httpError(400, 'Invalid project path')
      sendJson(res, 200, { cancelled: false, project })
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
      const filesRoot = await getProjectFilesRoot(projectId)
      const originalRoot = await getProjectOriginalRoot(projectId)
      if (!absolutePath) throw httpError(404, 'File not found')
      if (!filesRoot) throw httpError(404, 'Project not found')

      const effectiveRoot = originalRoot || filesRoot
      const effectiveFilePath = originalRoot ? path.join(originalRoot, filePath) : absolutePath

      await openFileInExternalEditor(effectiveRoot, effectiveFilePath, body?.editor)
      sendJson(res, 200, {
        opened: true,
        editor: normalizeEditor(body?.editor),
        path: filePath,
        originalRoot: Boolean(originalRoot),
      })
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

async function pickLocalProjectDirectory() {
  const commands = buildDirectoryPickerCommands()

  for (const command of commands) {
    try {
      const output = await spawnForOutput(command)
      const rootPath = output.trim()
      if (rootPath) return rootPath
    } catch (error) {
      const isCancel = Number(error?.code) === 1 || String(error?.message || '').includes('User canceled')
      if (isCancel) return null
      if (command === commands.at(-1)) throw error
    }
  }

  return null
}

function buildDirectoryPickerCommands() {
  if (process.platform === 'darwin') {
    return [['osascript', ['-e', 'POSIX path of (choose folder with prompt "选择要导入的项目文件夹")']]]
  }

  if (process.platform === 'win32') {
    return [
      [
        'powershell',
        [
          '-NoProfile',
          '-Command',
          'Add-Type -AssemblyName System.Windows.Forms; $d=New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description="选择要导入的项目文件夹"; if ($d.ShowDialog() -eq "OK") { Write-Output $d.SelectedPath }',
        ],
      ],
    ]
  }

  return [
    ['zenity', ['--file-selection', '--directory', '--title=选择要导入的项目文件夹']],
    ['kdialog', ['--getexistingdirectory', '.', '选择要导入的项目文件夹']],
  ]
}

function spawnForOutput([command, args]) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) resolve(stdout)
      else {
        const error = new Error(stderr || `Command failed with exit code ${code}`)
        error.code = code
        reject(error)
      }
    })
  })
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

  // 判断是否需要工具调用：启用工具 + 有活跃项目 + 不是本地模型
  const enableTools = Boolean(body?.enableTools && ctx.targetProvider.kind === 'openai-compatible')
  const projectRoot = body?.projectId ? await getProjectFilesRoot(body.projectId) : null

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

  // ===== 自主规划模式 =====
  if (body?.enablePlanning && projectRoot) {
    const planResult = await runChatWithPlanning(ctx, body, projectRoot, res)
    if (!planResult.ok) {
      sendStreamError(res, planResult.error)
      return
    }
    res.write(`event: done\ndata: {}\n\n`)
    res.end()
    return
  }

  // ===== 工具调用模式 =====
  if (enableTools && projectRoot) {
    const toolResult = await runChatWithTools(ctx, body, projectRoot, res)
    if (!toolResult.ok) {
      sendStreamError(res, toolResult.error)
      return
    }
    res.write(`event: done\ndata: {}\n\n`)
    res.end()
    return
  }

  // ===== 普通流式模式 =====
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

/**
 * 工具调用流程：
 * 1. 第一轮非流式调用，检测 AI 是否决定调用工具
 * 2. 如果有 tool_calls，执行工具，发送事件，然后第二轮流式输出
 * 3. 如果没有 tool_calls，把 content 模拟成流式发送
 */
async function runChatWithTools(ctx, body, projectRoot, res) {
  const MAX_TOOL_ROUNDS = 3
  let messages = ctx.messages.map((m) => ({ ...m }))

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await callProviderNonStream(
      ctx.target.providerId,
      ctx.targetProvider,
      ctx.target.model,
      messages,
      ctx.targetApiKey,
      ctx.runtimeSystemPrompt,
      {
        temperature: ctx.temperature,
        tools: TOOL_DEFINITIONS,
      },
    ).catch(() => null)

    if (!response || !response.ok) {
      return { ok: false, error: '工具调用：模型请求失败' }
    }

    const data = await readProviderResponse(response).catch(() => null)
    const assistantMessage = extractAssistantMessage(ctx.targetProvider.kind, data)

    // 有 tool_calls
    if (assistantMessage.toolCalls?.length) {
      messages.push({
        role: 'assistant',
        content: assistantMessage.content || '',
        tool_calls: assistantMessage.toolCalls,
      })

      for (const toolCall of assistantMessage.toolCalls) {
        const toolName = toolCall.function?.name
        let toolArgs
        try {
          toolArgs = JSON.parse(toolCall.function?.arguments || '{}')
        } catch {
          toolArgs = {}
        }

        // 通知前端正在调用工具
        res.write(
          `event: tool_call\ndata: ${JSON.stringify({
            name: toolName,
            arguments: toolArgs,
          })}\n\n`,
        )

        const result = await executeTool(toolName, toolArgs, { projectRoot })

        // 通知前端工具执行结果
        res.write(
          `event: tool_result\ndata: ${JSON.stringify({
            name: toolName,
            result: typeof result === 'object' ? result : { output: String(result) },
          })}\n\n`,
        )

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        })
      }

      continue // 继续下一轮，让 AI 基于工具结果生成最终回复
    }

    // 没有 tool_calls，直接输出内容
    if (assistantMessage.content) {
      // 模拟流式：把内容分成小段发送
      const chunks = simulateStreaming(assistantMessage.content)
      for (const chunk of chunks) {
        res.write(`event: delta\ndata: ${JSON.stringify({ content: chunk })}\n\n`)
      }
    }

    return { ok: true }
  }

  return { ok: false, error: '工具调用轮次超限' }
}

function simulateStreaming(text) {
  if (!text) return []
  const chunks = []
  let i = 0
  while (i < text.length) {
    const size = Math.floor(Math.random() * 8) + 2
    chunks.push(text.slice(i, i + size))
    i += size
  }
  return chunks
}

function extractAssistantMessage(providerKind, data) {
  if (!data) return { content: '', toolCalls: [] }

  if (providerKind === 'gemini') {
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
    return { content: text, toolCalls: [] }
  }

  if (providerKind === 'claude') {
    const text =
      data.content
        ?.filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('') || ''
    const toolCalls =
      data.content
        ?.filter((c) => c.type === 'tool_use')
        .map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.input || {}) },
        })) || []
    return { content: text, toolCalls }
  }

  const message = data.choices?.[0]?.message || {}
  const toolCalls =
    message.tool_calls?.map((tc) => ({
      id: tc.id,
      type: tc.type,
      function: {
        name: tc.function?.name,
        arguments: tc.function?.arguments,
      },
    })) || []
  return { content: message.content || '', toolCalls }
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

/**
 * 非流式调用（用于工具调用的第一轮检测）
 */
function callProviderNonStream(providerId, provider, model, messages, apiKey, systemPrompt, options = {}) {
  if (provider.kind === 'gemini')
    return callGeminiNonStream(provider, model, messages, apiKey, systemPrompt, options)
  if (provider.kind === 'claude')
    return callClaudeNonStream(provider, model, messages, apiKey, systemPrompt, options)
  return callOpenAiCompatibleNonStream(providerId, provider, model, messages, apiKey, systemPrompt, options)
}

function callOpenAiCompatibleNonStream(
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
    ...(options.tools ? { tools: options.tools } : {}),
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

function callClaudeNonStream(provider, model, messages, apiKey, systemPrompt, options = {}) {
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

function callGeminiNonStream(provider, model, messages, apiKey, systemPrompt, options = {}) {
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
    ...(options.tools ? { tools: options.tools } : {}),
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

/* ===================== 自主规划（L4）===================== */

const PLANNING_SYSTEM_PROMPT = `你是自主规划专家。用户给出一个目标，请将其拆解为可执行的步骤。

请分析用户需求并输出JSON格式的执行计划，格式如下：
{
  "thought": "思考过程，分析用户需求的拆解思路",
  "tasks": [
    {
      "id": "1",
      "title": "任务标题（简短）",
      "description": "详细描述，包括建议使用的工具、查看的文件、预期的输出"
    }
  ]
}

规则：
1. 任务数量 2-8 个，粒度适中，每个任务对应一个明确的子目标
2. 每个任务描述要明确，包含建议使用的工具（如 read_file、list_directory、write_file、run_command）
3. 如果涉及代码生成，建议先分析现有项目结构，再生成代码，最后运行测试
4. 输出必须是合法的JSON，不要包含 Markdown 代码块标记（如 \`\`\`json）
5. 任务应该是顺序执行的，默认没有依赖关系时按数组顺序执行`

const TASK_EXECUTION_SYSTEM_PROMPT = `你是自主任务执行专家。你正在执行一个更大的计划中的一个具体任务。

可用工具：
- read_file: 读取指定文件的内容
- write_file: 写入或覆盖指定文件的内容
- list_directory: 列出指定目录下的文件和子目录
- search_code: 在项目代码中搜索匹配文本
- run_command: 在项目根目录下执行一条安全的 shell 命令

请根据任务描述执行当前任务。你可以使用工具来获取信息、修改文件或运行命令。
执行完成后，请用简洁的语言总结任务结果和关键发现。`

/**
 * 自主规划主流程
 * 1. 生成计划 → 2. 流式发送计划 → 3. 逐个执行任务 → 4. 完成
 */
async function runChatWithPlanning(ctx, body, projectRoot, res) {
  const MAX_TASK_ROUNDS = 8
  const userGoal = getLatestUserText(ctx.messages)

  // 1. 生成计划（非流式）
  res.write(`event: plan_start\ndata: ${JSON.stringify({ goal: userGoal })}\n\n`)

  const plan = await generatePlan(ctx, userGoal)
  if (!plan || !plan.tasks || !plan.tasks.length) {
    return { ok: false, error: '计划生成失败，未能拆解出可执行任务。' }
  }

  // 2. 发送计划任务列表
  const tasks = plan.tasks.slice(0, MAX_TASK_ROUNDS).map((task, index) => ({
    ...task,
    id: String(task.id || index + 1),
    status: 'pending',
  }))

  res.write(
    `event: plan_tasks\ndata: ${JSON.stringify({ tasks: tasks.map((t) => ({ id: t.id, title: t.title, description: t.description })) })}\n\n`,
  )

  // 3. 逐个执行任务
  const completedResults = []

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]
    task.status = 'running'

    // 通知前端任务开始
    res.write(
      `event: task_start\ndata: ${JSON.stringify({ taskIndex: i, taskId: task.id, title: task.title })}\n\n`,
    )

    const taskContext = buildTaskExecutionContext(userGoal, tasks.slice(0, i), task, completedResults)

    const taskResult = await runTaskWithTools(ctx, taskContext, projectRoot, res, i)

    if (taskResult.ok) {
      task.status = 'success'
      completedResults.push({ id: task.id, title: task.title, result: taskResult.summary })
      res.write(
        `event: task_complete\ndata: ${JSON.stringify({ taskIndex: i, taskId: task.id, status: 'success', summary: taskResult.summary })}\n\n`,
      )
    } else {
      task.status = 'error'
      completedResults.push({ id: task.id, title: task.title, result: `执行失败: ${taskResult.error}` })
      res.write(
        `event: task_complete\ndata: ${JSON.stringify({ taskIndex: i, taskId: task.id, status: 'error', error: taskResult.error })}\n\n`,
      )
      // 继续执行后续任务，不中断整个计划
    }
  }

  // 4. 发送计划完成总结
  const allSuccessful = tasks.every((t) => t.status === 'success')
  res.write(
    `event: plan_complete\ndata: ${JSON.stringify({ allSuccessful, completedCount: completedResults.length, totalCount: tasks.length })}\n\n`,
  )

  return { ok: true }
}

/**
 * 调用 LLM 生成结构化计划
 */
async function generatePlan(ctx, userGoal) {
  const planningMessages = [
    ...ctx.messages.slice(0, -1),
    {
      role: 'user',
      content: `${PLANNING_SYSTEM_PROMPT}\n\n用户目标：${userGoal}\n\n请输出JSON格式的执行计划：`,
    },
  ]

  const response = await callProviderNonStream(
    ctx.target.providerId,
    ctx.targetProvider,
    ctx.target.model,
    planningMessages,
    ctx.targetApiKey,
    ctx.runtimeSystemPrompt,
    { temperature: 0.4 },
  ).catch(() => null)

  if (!response || !response.ok) return null

  const data = await readProviderResponse(response).catch(() => null)
  const text = extractProviderText(ctx.targetProvider, data)

  try {
    // 尝试从文本中提取 JSON（可能包含 markdown 代码块）
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const jsonText = jsonMatch ? jsonMatch[0] : text
    const plan = JSON.parse(jsonText)

    if (Array.isArray(plan.tasks) && plan.tasks.length > 0) {
      return plan
    }
  } catch {
    // JSON 解析失败，返回 fallback 计划
  }

  // Fallback：把整个目标作为一个任务
  return {
    thought: '计划生成失败，使用默认单任务执行。',
    tasks: [
      {
        id: '1',
        title: '执行用户目标',
        description: `直接完成用户的目标：${userGoal}`,
      },
    ],
  }
}

/**
 * 构建单个任务的执行上下文（system prompt + user prompt）
 */
function buildTaskExecutionContext(goal, previousTasks, currentTask, completedResults) {
  const previousSummary = completedResults.length
    ? completedResults.map((r) => `任务 ${r.id} (${r.title}): ${r.result}`).join('\n\n')
    : '无'

  const systemPrompt = `${TASK_EXECUTION_SYSTEM_PROMPT}\n\n总体目标：${goal}\n\n之前已完成任务的结果：\n${previousSummary}`

  const userPrompt = `当前正在执行任务：${currentTask.title}\n任务描述：${currentTask.description}\n\n请开始执行当前任务。你可以使用工具。执行完成后请总结结果。`

  return { systemPrompt, userPrompt }
}

/**
 * 执行单个任务（带工具调用）
 * 与 runChatWithTools 类似，但事件名带 task_ 前缀
 */
async function runTaskWithTools(ctx, taskContext, projectRoot, res, taskIndex) {
  const MAX_TOOL_ROUNDS = 3
  const messages = [{ role: 'user', content: taskContext.userPrompt }]

  let fullContent = ''

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await callProviderNonStream(
      ctx.target.providerId,
      ctx.targetProvider,
      ctx.target.model,
      messages,
      ctx.targetApiKey,
      taskContext.systemPrompt,
      {
        temperature: ctx.temperature,
        tools: TOOL_DEFINITIONS,
      },
    ).catch(() => null)

    if (!response || !response.ok) {
      return { ok: false, error: '任务执行：模型请求失败' }
    }

    const data = await readProviderResponse(response).catch(() => null)
    const assistantMessage = extractAssistantMessage(ctx.targetProvider.kind, data)

    // 有 tool_calls
    if (assistantMessage.toolCalls?.length) {
      messages.push({
        role: 'assistant',
        content: assistantMessage.content || '',
        tool_calls: assistantMessage.toolCalls,
      })

      for (const toolCall of assistantMessage.toolCalls) {
        const toolName = toolCall.function?.name
        let toolArgs
        try {
          toolArgs = JSON.parse(toolCall.function?.arguments || '{}')
        } catch {
          toolArgs = {}
        }

        // 通知前端正在调用工具（task_ 前缀）
        res.write(
          `event: task_tool_call\ndata: ${JSON.stringify({
            taskIndex,
            name: toolName,
            arguments: toolArgs,
          })}\n\n`,
        )

        const result = await executeTool(toolName, toolArgs, { projectRoot })

        // 通知前端工具执行结果
        res.write(
          `event: task_tool_result\ndata: ${JSON.stringify({
            taskIndex,
            name: toolName,
            result: typeof result === 'object' ? result : { output: String(result) },
          })}\n\n`,
        )

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        })
      }

      continue // 继续下一轮
    }

    // 没有 tool_calls，直接输出内容
    if (assistantMessage.content) {
      fullContent = assistantMessage.content
      // 模拟流式：把内容分成小段发送（task_delta）
      const chunks = simulateStreaming(assistantMessage.content)
      for (const chunk of chunks) {
        res.write(`event: task_delta\ndata: ${JSON.stringify({ taskIndex, content: chunk })}\n\n`)
      }
    }

    return { ok: true, summary: fullContent }
  }

  return { ok: false, error: '任务执行轮次超限' }
}
