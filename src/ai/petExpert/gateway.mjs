import { buildPetExpertContext, getLatestUserMessageText } from './contextBuilder.mjs'
import { promptKeyForIntent } from './router.mjs'
import { buildPetExpertMessages } from './prompts.mjs'
import { buildEmergencyStructuredResponse, evaluateSafetyRules } from './safetyRules.mjs'
import { normalizePetExpertResponse, renderPetExpertResponse } from './outputSchemas.mjs'
import { orchestratePetAiRequest } from './orchestrator.mjs'

const SUPPORTED_BASE_PROVIDERS = new Set(['kimi', 'openai', 'deepseek', 'qwen', 'ollama'])

export function createPetExpertGateway(dependencies) {
  return {
    async complete({ body, userId, state }) {
      return completePetExpert({ ...dependencies, body, userId, state })
    },
    async prepareStream({ body, userId, state }) {
      return preparePetExpertStream({ ...dependencies, body, userId, state })
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
  const safetyResult = config.enableSafetyRules
    ? evaluateSafetyRules({ userText, contextText: petContext.text })
    : { enabled: false, hasRedFlags: false, riskLevel: 'low', matches: [], instruction: '' }
  const orchestration = await orchestratePetAiRequest({
    userText: `${userText}\n${petContext.text}`,
    petContext,
    enableRag: config.enableRag,
    safetyResult,
  })
  const intent = orchestration.intent
  const retrievedKnowledge = orchestration.retrievedKnowledge
  const sourcesUsed = retrievedKnowledge.map(({ title, path }) => ({ title, path }))

  if (safetyResult.hasRedFlags && body?.petExpertBypassModelOnEmergency === true) {
    const structured = buildEmergencyStructuredResponse(safetyResult, sourcesUsed)
    return buildGatewayResult({
      content: renderPetExpertResponse(structured, safetyResult),
      structured,
      intent,
      orchestration: summarizeOrchestration(orchestration),
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
    petContextText: `${petContext.text}\n\n${orchestration.promptContextText}`,
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
    const structured = buildLocalExpertResponse({
      orchestration,
      safetyResult,
      sourcesUsed,
      fallbackReason: message,
    })
    return buildGatewayResult({
      content: renderPetExpertResponse(structured, safetyResult),
      structured,
      intent,
      orchestration: summarizeOrchestration(orchestration),
      safetyResult,
      sourcesUsed,
      inference: {
        providerId: 'pet_expert',
        model: 'rag-tool-expert',
        reason: '底层大模型暂不可用，宠物专家引擎已使用内置 RAG 知识库和结构化工具结果生成回复。',
      },
    })
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
    orchestration: summarizeOrchestration(orchestration),
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

async function preparePetExpertStream({
  body,
  state,
  providers,
  getApiKey,
  httpError,
}) {
  const prepared = await preparePetExpertPrompt({ body, state, httpError })
  if (prepared.deterministicResult) {
    return {
      fallbackResult: prepared.deterministicResult,
    }
  }

  const candidates = [prepared.config.primaryModel, prepared.config.fallbackModel]
    .map((target) => resolveStreamTarget({ target, providers, body, getApiKey }))
    .filter(Boolean)

  if (!candidates.length) {
    return {
      fallbackResult: buildGatewayResult({
        content: renderPetExpertResponse(prepared.localStructuredFallback, prepared.safetyResult),
        structured: prepared.localStructuredFallback,
        intent: prepared.intent,
        orchestration: summarizeOrchestration(prepared.orchestration),
        safetyResult: prepared.safetyResult,
        sourcesUsed: prepared.sourcesUsed,
        inference: {
          providerId: 'pet_expert',
          model: 'rag-tool-expert',
          reason: '没有可用的服务端底层模型密钥，已使用内置 RAG 知识库和结构化工具结果生成回复。',
        },
      }),
    }
  }

  return {
    streamRequest: {
      candidates,
      messages: prepared.petExpertPrompt.messages,
      systemPrompt: toStreamingMarkdownPrompt(prepared.petExpertPrompt.systemPrompt),
      metadata: {
        intent: prepared.intent,
        orchestration: summarizeOrchestration(prepared.orchestration),
        safetyResult: prepared.safetyResult,
        sourcesUsed: prepared.sourcesUsed,
      },
      localFallbackResult: buildGatewayResult({
        content: renderPetExpertResponse(prepared.localStructuredFallback, prepared.safetyResult),
        structured: prepared.localStructuredFallback,
        intent: prepared.intent,
        orchestration: summarizeOrchestration(prepared.orchestration),
        safetyResult: prepared.safetyResult,
        sourcesUsed: prepared.sourcesUsed,
        inference: {
          providerId: 'pet_expert',
          model: 'rag-tool-expert',
          reason: '底层流式模型暂不可用，已使用内置 RAG 知识库和结构化工具结果生成回复。',
        },
      }),
    },
  }
}

async function preparePetExpertPrompt({ body, state, httpError }) {
  const messages = Array.isArray(body?.messages) ? body.messages : []
  if (!messages.length) throw httpError(400, 'messages are required')

  const config = getPetExpertConfig()
  const userText = getLatestUserMessageText(messages)
  const petContext = buildPetExpertContext({
    state,
    requestContext: body?.petContext || {},
    messages,
  })
  const safetyResult = config.enableSafetyRules
    ? evaluateSafetyRules({ userText, contextText: petContext.text })
    : { enabled: false, hasRedFlags: false, riskLevel: 'low', matches: [], instruction: '' }
  const orchestration = await orchestratePetAiRequest({
    userText: `${userText}\n${petContext.text}`,
    petContext,
    enableRag: config.enableRag,
    safetyResult,
  })
  const intent = orchestration.intent
  const sourcesUsed = orchestration.retrievedKnowledge.map(({ title, path }) => ({ title, path }))

  if (safetyResult.hasRedFlags && body?.petExpertBypassModelOnEmergency === true) {
    const structured = buildEmergencyStructuredResponse(safetyResult, sourcesUsed)
    return {
      deterministicResult: buildGatewayResult({
        content: renderPetExpertResponse(structured, safetyResult),
        structured,
        intent,
        orchestration: summarizeOrchestration(orchestration),
        safetyResult,
        sourcesUsed,
        inference: {
          providerId: 'pet_expert',
          model: 'deterministic-emergency-safety',
          reason: '宠物专家引擎已根据急症安全规则直接处理本次回复。',
        },
      }),
    }
  }

  const promptKey = promptKeyForIntent(intent)
  const petExpertPrompt = buildPetExpertMessages({
    promptKey,
    userText,
    conversationMessages: messages,
    petContextText: `${petContext.text}\n\n${orchestration.promptContextText}`,
    retrievedKnowledge: orchestration.retrievedKnowledge,
    safetyResult,
  })
  const localStructuredFallback = buildLocalExpertResponse({
    orchestration,
    safetyResult,
    sourcesUsed,
    fallbackReason: '',
  })

  return {
    config,
    userText,
    petContext,
    safetyResult,
    orchestration,
    intent,
    sourcesUsed,
    petExpertPrompt,
    localStructuredFallback,
  }
}

function resolveStreamTarget({ target, providers, body, getApiKey }) {
  const provider = providers[target.providerId]
  if (!provider) return null
  const apiKey = getPetExpertApiKey(provider, target.providerId, body, getApiKey)
  if (provider.needsApiKey && !apiKey) return null
  return { target, provider, apiKey }
}

function toStreamingMarkdownPrompt(systemPrompt) {
  const markdownInstruction = [
    '输出要求：本次回复会直接流式展示给宠物主人。',
    '不要输出 JSON，不要输出 Markdown 代码块。',
    '请模仿 Gemini 的清爽回复样式：先用 1-2 句给结论，再用少量 Markdown 小标题和短列表说明。',
    '不要把标题写成“宠物专家引擎”，不要堆砌长段落。小标题建议使用“可以先这样做”“需要留意”“什么时候联系兽医”等自然表达。',
    '列表每条尽量短，语气温和、直接、像产品内置护理助手。',
    '如果上下文里有 RAG 命中或工具结果，必须优先使用它们；不确定的信息请明确说明。',
  ].join('\n')
  return String(systemPrompt || '').replace(/输出必须是合法 JSON[\s\S]*$/m, markdownInstruction)
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

function buildGatewayResult({
  content,
  structured,
  intent,
  orchestration,
  safetyResult,
  sourcesUsed,
  inference,
  raw,
}) {
  return {
    content,
    inference,
    workspaceHits: [],
    petExpert: {
      intent,
      orchestration,
      structured,
      safety: safetyResult,
      sourcesUsed,
    },
    raw,
  }
}

function summarizeOrchestration(orchestration) {
  return {
    intent: orchestration.intent,
    petProfile: orchestration.petProfile,
    recentLogCount: orchestration.recentLogs.length,
    knowledgeHits: orchestration.retrievedKnowledge.map((item) => ({
      id: item.id,
      title: item.title,
      category: item.category,
      tags: item.tags,
      risk_level: item.risk_level,
      source_type: item.source_type,
    })),
    foodCandidates: orchestration.foodCandidates.map((food) => ({
      id: food.id,
      brand: food.brand,
      product_name: food.product_name,
      species: food.species,
      life_stage: food.life_stage,
      kcal_per_kg: food.kcal_per_kg,
    })),
    toolResults: orchestration.toolResults,
  }
}

function buildLocalExpertResponse({ orchestration, safetyResult, sourcesUsed, fallbackReason }) {
  const toolResults = Array.isArray(orchestration.toolResults) ? orchestration.toolResults : []
  const petName = orchestration.petProfile?.name || '毛孩子'
  const riskResult = toolResults.find((item) => item?.tool === 'classifyHealthRisk')
  const mealPlan = toolResults.find((item) => item?.tool === 'generateMealPlan')
  const foodCompare = toolResults.find((item) => item?.tool === 'comparePetFoods')
  const careSuggestion = toolResults.find((item) => item?.tool === 'generateCareSuggestion')
  const knowledgeTitles = orchestration.retrievedKnowledge.map((item) => item.title).filter(Boolean)

  const possibleConcerns = [
    ...(riskResult?.red_flags || []).map((item) => `需要留意：${item}`),
    ...(careSuggestion?.focus_categories || []).map((item) => `本次问题关联到 ${formatCategory(item)} 知识`),
    ...(foodCompare?.comparison || []).flatMap((item) => item.cautions || []),
    mealPlan?.applicable_conditions ? '配餐估算只适合精神稳定、无急症警讯的日常场景。' : '',
  ].filter(Boolean)

  const recommendedActions = [
    riskResult?.recommended_boundary,
    ...renderMealPlanActions(mealPlan),
    ...renderFoodCompareActions(foodCompare),
    ...(careSuggestion?.suggestions || []),
    knowledgeTitles.length ? `我已参考：${knowledgeTitles.slice(0, 3).join('、')}。` : '',
  ].filter(Boolean)

  return normalizePetExpertResponse({
    summary: buildLocalSummary(orchestration.intent, petName, fallbackReason),
    riskLevel: safetyResult?.hasRedFlags ? 'high' : riskResult?.risk_level || safetyResult?.riskLevel || 'low',
    possibleConcerns,
    recommendedActions,
    observationChecklist: buildObservationChecklist(orchestration.intent, mealPlan, riskResult),
    vetQuestions: buildVetQuestions(orchestration.intent, riskResult),
    remindersToCreate: buildReminderSuggestions(orchestration.intent),
    disclaimer:
      '以上为宠物专家引擎基于本地 RAG 知识库、宠物档案与记录生成的护理参考，不能替代执业兽医诊断或处方。',
    sourcesUsed,
  })
}

function buildLocalSummary(intent, petName, fallbackReason) {
  const prefix = `${petName} 的这次问题我先用内置知识库和结构化工具帮你整理了一版建议。`
  const note = fallbackReason ? '当前底层大模型暂不可用，但 RAG 检索、风险规则和护理工具仍然可以工作。' : ''
  if (intent === 'health') return `${prefix}我会优先帮你看是否有需要尽快就医的信号。${note}`
  if (intent === 'nutrition' || intent === 'meal_plan') return `${prefix}重点先放在喂养稳定、体重趋势和便便观察上。${note}`
  if (intent === 'food_compare') return `${prefix}我会先按成分、热量、过敏源和适配性做基础比较。${note}`
  if (intent === 'training') return `${prefix}训练建议会尽量保持短时、正向、可重复。${note}`
  return `${prefix}${note}`
}

function renderMealPlanActions(mealPlan) {
  if (!mealPlan) return []
  return [
    mealPlan.estimated_daily_calories
      ? `日常热量可先参考约 ${mealPlan.estimated_daily_calories} kcal/天，再结合体重趋势调整。`
      : '',
    mealPlan.estimated_daily_food_grams
      ? `当前口粮估算约 ${mealPlan.estimated_daily_food_grams}g/天，可分 ${mealPlan.meals_per_day} 餐。`
      : '',
    ...(mealPlan.adjustments || []),
  ].filter(Boolean)
}

function renderFoodCompareActions(foodCompare) {
  if (!foodCompare?.comparison?.length) return []
  return foodCompare.comparison.slice(0, 2).map((item) => {
    const strengths = (item.strengths || []).slice(0, 2).join('、') || '基础营养参数可评估'
    const cautions = (item.cautions || []).slice(0, 2).join('、') || '继续观察适口性和便便'
    return `${item.name}：优势 ${strengths}；留意 ${cautions}。`
  })
}

function buildObservationChecklist(intent, mealPlan, riskResult) {
  const base = ['食欲和饮水是否和平时接近', '便便形态、颜色和次数是否变化', '精神状态、互动意愿和睡眠是否明显异常']
  if (intent === 'nutrition' || intent === 'meal_plan' || mealPlan) {
    base.push('换粮或调整口粮时，连续观察 3-7 天便便和体重趋势')
  }
  if (riskResult?.risk_level === 'medium' || riskResult?.risk_level === 'high') {
    base.push('记录异常发生时间、频次、照片或视频，便于就医沟通')
  }
  return base
}

function buildVetQuestions(intent, riskResult) {
  if (riskResult?.risk_level !== 'medium' && riskResult?.risk_level !== 'high') return []
  return [
    '这些症状是否需要当天就诊或急诊？',
    '需要做哪些基础检查来排除风险？',
    '在就医前哪些情况出现要立刻加急？',
  ]
}

function buildReminderSuggestions(intent) {
  if (intent === 'nutrition' || intent === 'meal_plan') {
    return [{ title: '观察便便和食欲变化', type: 'health_log', dueIn: '未来 3 天', notes: '调整饮食后连续观察' }]
  }
  if (intent === 'health') {
    return [{ title: '复查精神、食欲和异常症状', type: 'health_log', dueIn: '今晚', notes: '如加重请联系兽医' }]
  }
  return []
}

function formatCategory(value) {
  const map = {
    nutrition: '营养',
    health: '健康',
    training: '训练',
    care: '日常护理',
    breed: '品种',
    emergency: '急症',
  }
  return map[value] || value
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
