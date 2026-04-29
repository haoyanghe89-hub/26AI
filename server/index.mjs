import http from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  analyzeProject,
  buildWorkspaceContext,
  deleteProject,
  getProjectTree,
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

const PORT = Number(process.env.PORT || 8787)
const HOST = process.env.HOST || '127.0.0.1'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.resolve(__dirname, '../dist')

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
    endpoint: 'https://api.moonshot.cn/v1/chat/completions',
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
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { ok: true })
      return
    }

    if (req.method === 'POST' && req.url === '/api/client-errors') {
      const body = await readJson(req, 64 * 1024)
      logClientError(body)
      sendJson(res, 202, { accepted: true })
      return
    }

    if (req.method === 'GET' && req.url === '/api/workspace/status') {
      sendJson(res, 200, await getWorkspaceStatus())
      return
    }

    if (req.method === 'GET' && req.url === '/api/projects') {
      sendJson(res, 200, { projects: await listProjects() })
      return
    }

    if (req.method === 'GET' && req.url === '/api/providers') {
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

    if (req.method === 'POST' && req.url === '/api/projects/import') {
      const body = await readJson(req)
      sendJson(res, 200, { project: await importProject(body) })
      return
    }

    if (req.method === 'POST' && req.url === '/api/workspace/index') {
      sendJson(res, 200, await indexWorkspace())
      return
    }

    if (req.method === 'POST' && req.url === '/api/workspace/search') {
      const body = await readJson(req)
      const results = await searchWorkspace(body?.query, Number(body?.limit || 8))
      sendJson(res, 200, { results })
      return
    }

    const projectAnalyzeMatch = req.url.match(/^\/api\/projects\/([^/]+)\/analyze$/)
    if (req.method === 'POST' && projectAnalyzeMatch) {
      const analysis = await analyzeProject(projectAnalyzeMatch[1])
      if (!analysis) throw httpError(404, 'Project not found')
      sendJson(res, 200, { analysis })
      return
    }

    const projectTreeMatch = req.url.match(/^\/api\/projects\/([^/]+)\/tree$/)
    if (req.method === 'GET' && projectTreeMatch) {
      const tree = await getProjectTree(projectTreeMatch[1])
      if (!tree) throw httpError(404, 'Project not found')
      sendJson(res, 200, { tree })
      return
    }

    const projectFileMatch = req.url.match(/^\/api\/projects\/([^/]+)\/file(?:\?.*)?$/)
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

    const projectDeleteMatch = req.url.match(/^\/api\/projects\/([^/]+)$/)
    if (req.method === 'DELETE' && projectDeleteMatch) {
      const deleted = await deleteProject(projectDeleteMatch[1])
      if (!deleted) throw httpError(404, 'Project not found')
      sendJson(res, 200, { deleted: true })
      return
    }

    const projectSearchMatch = req.url.match(/^\/api\/projects\/([^/]+)\/search$/)
    if (req.method === 'POST' && projectSearchMatch) {
      const body = await readJson(req)
      const results = await searchProject(projectSearchMatch[1], body?.query, Number(body?.limit || 8))
      sendJson(res, 200, { results })
      return
    }

    if (req.method !== 'POST' || req.url !== '/api/chat') {
      if (req.method === 'GET' || req.method === 'HEAD') {
        await sendStaticFile(req, res)
        return
      }

      sendJson(res, 404, { error: 'Not found' })
      return
    }

    const body = await readJson(req)
    const result = await handleChat(body)
    sendJson(res, 200, result)
  } catch (error) {
    const status = Number(error?.status || 500)
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
  const providerId = String(body?.providerId || '')
  const provider = PROVIDERS[providerId]
  if (!provider) throw httpError(400, `Unsupported provider: ${providerId}`)

  const model = String(body?.model || '').trim()
  const messages = Array.isArray(body?.messages) ? body.messages : []
  const apiKey = getApiKey(provider, body?.apiKey)
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

  if (!model) throw httpError(400, 'model is required')
  if (!messages.length) throw httpError(400, 'messages are required')
  if (provider.needsApiKey && !apiKey) {
    throw httpError(400, `${provider.envKey} or apiKey is required`)
  }

  const response = await callProvider(providerId, provider, model, messages, apiKey, runtimeSystemPrompt, {
    temperature,
  }).catch((error) => {
    throw httpError(
      502,
      `Provider network error: ${error instanceof Error ? error.message : 'request failed'}`,
    )
  })

  const data = await readProviderResponse(response)
  if (!response.ok) {
    throw httpError(response.status, 'Provider request failed', data)
  }

  return {
    content: extractProviderText(provider, data),
    workspaceHits: workspaceHits.map(({ path, startLine, endLine, score }) => ({
      path,
      startLine,
      endLine,
      score,
    })),
    raw: data,
  }
}

function callProvider(providerId, provider, model, messages, apiKey, systemPrompt, options = {}) {
  if (provider.kind === 'gemini') return callGemini(provider, model, messages, apiKey, systemPrompt, options)
  if (provider.kind === 'claude') return callClaude(provider, model, messages, apiKey, systemPrompt, options)
  return callOpenAiCompatible(providerId, provider, model, messages, apiKey, systemPrompt, options)
}

function getApiKey(provider, requestApiKey) {
  const envKey = provider.envKey ? process.env[provider.envKey] : ''
  return String(envKey || requestApiKey || '').trim()
}

function authHeaders(provider, apiKey) {
  if (!provider.needsApiKey || !apiKey) return {}
  if (provider.kind === 'gemini') return { 'x-goog-api-key': apiKey }
  if (provider.kind === 'claude') return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
  return { Authorization: `Bearer ${apiKey}` }
}

function callOpenAiCompatible(providerId, provider, model, messages, apiKey, systemPrompt, options = {}) {
  return fetch(provider.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(provider, apiKey),
    },
    body: JSON.stringify({
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
      ...(typeof options.temperature === 'number' ? { temperature: options.temperature } : {}),
      ...(providerId === 'kimi' ? { thinking: { type: 'disabled' } } : {}),
    }),
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
    return (
      data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '没有收到有效回复。'
    )
  }

  if (provider.kind === 'claude') {
    return data.content?.map((part) => part.text || '').join('') || '没有收到有效回复。'
  }

  return data.choices?.[0]?.message?.content || '没有收到有效回复。'
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

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

function logClientError(body) {
  const message = scrubSensitiveText(String(body?.message || 'Unknown client error')).slice(0, 800)
  const source = String(body?.source || 'client').slice(0, 80)
  const component = body?.component ? String(body.component).slice(0, 120) : ''
  const info = body?.info ? String(body.info).slice(0, 200) : ''
  const stack = body?.stack ? scrubSensitiveText(String(body.stack)).slice(0, 4000) : ''

  console.error(
    JSON.stringify({
      level: 'error',
      type: 'client-error',
      source,
      component,
      info,
      message,
      stack,
      createdAt: new Date().toISOString(),
    }),
  )
}

function scrubSensitiveText(value) {
  return value
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, '[redacted-api-key]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted-token]')
    .replace(/api[_-]?key["'\s:=]+[A-Za-z0-9._-]+/gi, 'apiKey=[redacted]')
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

function httpError(status, message, details) {
  const error = new Error(message)
  error.status = status
  error.details = details
  return error
}
