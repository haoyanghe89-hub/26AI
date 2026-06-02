import { buildPetExpertContext, getLatestUserMessageText } from './contextBuilder.mjs'
import { classifyPetExpertIntent, promptKeyForIntent } from './router.mjs'
import { retrievePetCareKnowledge } from './retriever.mjs'
import { buildPetExpertMessages } from './prompts.mjs'
import { buildEmergencyStructuredResponse, evaluateSafetyRules } from './safetyRules.mjs'
import { normalizePetExpertResponse, renderPetExpertResponse } from './outputSchemas.mjs'

const SUPPORTED_BASE_PROVIDERS = new Set(['kimi', 'openai', 'deepseek', 'qwen', 'ollama'])

export function createPetExpertGateway(dependencies) {
  return {
    async complete({ body, userId, state }) {
      return completePetExpert({ ...dependencies, body, userId, state })
    },
  }
}

export function parsePetExpertModelSpec(value, fallback = 'kimi:kimi-k2.6') {
  const spec = String(value || fallback).trim()
  const [providerId, ...modelParts] = spec.includes(':') ? spec.split(':') : ['', spec]
  const normalizedProviderId = providerId && modelParts.length ? providerId : 'kimi'
  const model = modelParts.length ? modelParts.join(':') : spec
  return {
    providerId: SUPPORTED_BASE_PROVIDERS.has(normalizedProviderId) ? normalizedProviderId : 'kimi',
    model: model || 'kimi-k2.6',
  }
}

export function getPetExpertConfig() {
  return {
    primaryModel: parsePetExpertModelSpec(process.env.PET_EXPERT_PRIMARY_MODEL || 'kimi:kimi-k2.6'),
    fallbackModel: parsePetExpertModelSpec(process.env.PET_EXPERT_FALLBACK_MODEL || 'openai:gpt-4.1-mini'),
    enableRag: process.env.PET_EXPERT_ENABLE_RAG !== 'false',
    enableSafetyRules: process.env.PET_EXPERT_ENABLE_SAFETY_RULES !== 'false',
  }
}

async function completePetExpert({
  body,
  state,
  providers,
  callProvider,
  readProviderResponse,
  extractProviderText,
  extractProviderErrorMessage,
  getApiKey,
  httpError,
}) {
  const messages = Array.isArray(body?.messages) ? body.messages : []
  if (!messages.length) throw httpError(400, 'messages are required')

  const config = getPetExpertConfig()
  const userText = getLatestUserMessageText(messages)
  const petContext = buildPetExpertContext({
    state,
    requestContext: body?.petContext || {},
    messages,
  })
  const intent = classifyPetExpertIntent(`${userText}\n${petContext.text}`)
  const safetyResult = config.enableSafetyRules
    ? evaluateSafetyRules({ userText, contextText: petContext.text })
    : { enabled: false, hasRedFlags: false, riskLevel: 'low', matches: [], instruction: '' }
  const retrievedKnowledge = await retrievePetCareKnowledge(`${userText}\n${petContext.text}`, {
    enabled: config.enableRag,
    limit: safetyResult.hasRedFlags ? 5 : 4,
  })
  const sourcesUsed = retrievedKnowledge.map(({ title, path }) => ({ title, path }))

  if (safetyResult.hasRedFlags && body?.petExpertBypassModelOnEmergency === true) {
    const structured = buildEmergencyStructuredResponse(safetyResult, sourcesUsed)
    return buildGatewayResult({
      content: renderPetExpertResponse(structured, safetyResult),
      structured,
      intent,
      safetyResult,
      sourcesUsed,
      inference: {
        providerId: 'pet_expert',
        model: 'deterministic-emergency-safety',
        reason: '宠物专家引擎已根据急症安全规则直接处理本次回复。',
      },
    })
  }

  const promptKey = promptKeyForIntent(intent)
  const petExpertPrompt = buildPetExpertMessages({
    promptKey,
    userText,
    conversationMessages: messages,
    petContextText: petContext.text,
    retrievedKnowledge,
    safetyResult,
  })

  const primary = await callBaseModel({
    target: config.primaryModel,
    body,
    messages: petExpertPrompt.messages,
    systemPrompt: petExpertPrompt.systemPrompt,
    providers,
    callProvider,
    readProviderResponse,
    extractProviderText,
    extractProviderErrorMessage,
    getApiKey,
  }).catch((error) => ({ error }))

  let baseResult = primary
  let fallbackReason = ''
  if (primary?.error) {
    fallbackReason = primary.error instanceof Error ? primary.error.message : 'primary model failed'
    baseResult = await callBaseModel({
      target: config.fallbackModel,
      body,
      messages: petExpertPrompt.messages,
      systemPrompt: petExpertPrompt.systemPrompt,
      providers,
      callProvider,
      readProviderResponse,
      extractProviderText,
      extractProviderErrorMessage,
      getApiKey,
    }).catch((error) => ({ error }))
  }

  if (baseResult?.error) {
    const message = baseResult.error instanceof Error ? baseResult.error.message : '底层模型调用失败'
    throw httpError(502, `宠物专家引擎底层模型错误：${message}`)
  }

  const structured = safetyResult.hasRedFlags
    ? mergeEmergencySafety(normalizePetExpertResponse(baseResult.text), safetyResult, sourcesUsed)
    : {
        ...normalizePetExpertResponse(baseResult.text),
        riskLevel:
          safetyResult.riskLevel === 'medium'
            ? 'medium'
            : normalizePetExpertResponse(baseResult.text).riskLevel,
        sourcesUsed,
      }

  return buildGatewayResult({
    content: renderPetExpertResponse(structured, safetyResult),
    structured,
    intent,
    safetyResult,
    sourcesUsed,
    inference: {
      providerId: 'pet_expert',
      model: `${baseResult.target.providerId}:${baseResult.target.model}`,
      reason: fallbackReason
        ? `宠物专家引擎主模型调用失败（${fallbackReason}），已使用备用底层模型。`
        : '宠物专家引擎已在内部选择主底层模型。',
      baseProviderId: baseResult.target.providerId,
      baseModel: baseResult.target.model,
    },
    raw: baseResult.raw,
  })
}

async function callBaseModel({
  target,
  body,
  messages,
  systemPrompt,
  providers,
  callProvider,
  readProviderResponse,
  extractProviderText,
  extractProviderErrorMessage,
  getApiKey,
}) {
  const provider = providers[target.providerId]
  if (!provider) throw new Error(`不支持的宠物专家底层供应商：${target.providerId}`)
  const apiKey = getPetExpertApiKey(provider, target.providerId, body, getApiKey)
  if (provider.needsApiKey && !apiKey) throw new Error(`需要配置 ${provider.envKey} 或宠物专家引擎底层密钥`)

  const response = await callProvider(
    target.providerId,
    provider,
    target.model,
    messages,
    apiKey,
    systemPrompt,
    { temperature: 0.3 },
  )
  const data = await readProviderResponse(response)
  if (!response.ok) {
    throw new Error(extractProviderErrorMessage(data) || `Provider request failed: ${response.status}`)
  }
  return {
    target,
    text: extractProviderText(provider, data),
    raw: data,
  }
}

function getPetExpertApiKey(provider, providerId, body, getApiKey) {
  const requestKeys =
    body?.petExpertApiKeys && typeof body.petExpertApiKeys === 'object' ? body.petExpertApiKeys : {}
  return getApiKey(provider, requestKeys[providerId] || '')
}

function buildGatewayResult({ content, structured, intent, safetyResult, sourcesUsed, inference, raw }) {
  return {
    content,
    inference,
    workspaceHits: [],
    petExpert: {
      intent,
      structured,
      safety: safetyResult,
      sourcesUsed,
    },
    raw,
  }
}

function mergeEmergencySafety(modelResponse, safetyResult, sourcesUsed) {
  const emergency = buildEmergencyStructuredResponse(safetyResult, sourcesUsed)
  return {
    ...emergency,
    summary: modelResponse.summary || emergency.summary,
    recommendedActions: uniqueStrings([...emergency.recommendedActions, ...modelResponse.recommendedActions]),
    observationChecklist: uniqueStrings([
      ...emergency.observationChecklist,
      ...modelResponse.observationChecklist,
    ]),
    vetQuestions: uniqueStrings([...emergency.vetQuestions, ...modelResponse.vetQuestions]),
    sourcesUsed,
  }
}

function uniqueStrings(items) {
  return [...new Set(items.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 10)
}
