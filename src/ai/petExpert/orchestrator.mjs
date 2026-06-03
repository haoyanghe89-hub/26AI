import {
  dailyLogsToText,
  normalizePetProfile,
  normalizeRecentDailyLogs,
  petProfileToText,
} from './domain.mjs'
import { findFoodProductsForPet, getFoodById } from './foodDatabase.mjs'
import { inferKnowledgeCategories, retrievePetCareKnowledge } from './retriever.mjs'
import {
  classifyHealthRisk,
  comparePetFoods,
  generateCareSuggestion,
  generateMealPlan,
  renderFoodCandidates,
  renderToolResult,
} from './petTools.mjs'

export const PET_AI_INTENTS = {
  nutrition: 'nutrition',
  foodCompare: 'food_compare',
  mealPlan: 'meal_plan',
  health: 'health',
  training: 'training',
  care: 'care',
}

export async function orchestratePetAiRequest({
  userText,
  petContext,
  enableRag = true,
  safetyResult,
  categoryFilters = [],
} = {}) {
  const petProfile = normalizePetProfile(petContext?.selectedPet || {})
  const recentLogs = normalizeRecentDailyLogs(petContext?.recentHealthLogs || [], petProfile.id, 7)
  const intent = classifyPetAiIntent(userText)
  const ragCategories = resolveRagCategories(intent, userText, categoryFilters)
  const retrievedKnowledge = await retrievePetCareKnowledge(userText, {
    enabled: enableRag,
    limit: safetyResult?.hasRedFlags ? 6 : 5,
    petProfile,
    categoryFilters: ragCategories,
  })
  const foodCandidates = findFoodProductsForPet(petProfile, { limit: 4 })
  const currentFood = getFoodById(petProfile.current_food_id) || foodCandidates[0] || null
  const toolResults = selectAndRunTools({
    intent,
    userText,
    petProfile,
    recentLogs,
    retrievedKnowledge,
    foodCandidates,
    currentFood,
  })

  return {
    intent,
    petProfile,
    recentLogs,
    retrievedKnowledge,
    foodCandidates,
    currentFood,
    toolResults,
    promptContextText: renderOrchestratorContext({
      intent,
      petProfile,
      recentLogs,
      retrievedKnowledge,
      foodCandidates,
      currentFood,
      toolResults,
    }),
  }
}

export function classifyPetAiIntent(text = '') {
  if (/对比|比较|哪款|哪一个|A\s*和\s*B|food compare|compare/i.test(text)) {
    return PET_AI_INTENTS.foodCompare
  }
  if (/配餐|食谱|餐单|喂多少|每日.*克|meal plan|feeding plan/i.test(text)) {
    return PET_AI_INTENTS.mealPlan
  }
  if (/症状|呕吐|腹泻|拉稀|便血|尿|咳|喘|抽搐|中毒|不吃|不喝|精神|疼|health|symptom/i.test(text)) {
    return PET_AI_INTENTS.health
  }
  if (/喂|吃|食物|营养|换粮|猫粮|狗粮|口粮|热量|零食|nutrition|diet|food/i.test(text)) {
    return PET_AI_INTENTS.nutrition
  }
  if (/训练|行为|等待|乱叫|咬|抓|社交|分离焦虑|training|behavior/i.test(text)) {
    return PET_AI_INTENTS.training
  }
  return PET_AI_INTENTS.care
}

function resolveRagCategories(intent, userText, categoryFilters) {
  const explicit = Array.isArray(categoryFilters) ? categoryFilters.filter(Boolean) : []
  if (explicit.length) return explicit
  if (intent === PET_AI_INTENTS.foodCompare || intent === PET_AI_INTENTS.mealPlan) return ['nutrition']
  if (intent === PET_AI_INTENTS.nutrition) return ['nutrition', ...inferKnowledgeCategories(userText)]
  if (intent === PET_AI_INTENTS.health) return ['health', 'emergency']
  if (intent === PET_AI_INTENTS.training) return ['training', 'care']
  return ['care', ...inferKnowledgeCategories(userText)]
}

function selectAndRunTools({
  intent,
  userText,
  petProfile,
  recentLogs,
  retrievedKnowledge,
  foodCandidates,
  currentFood,
}) {
  const results = []
  if (intent === PET_AI_INTENTS.foodCompare) {
    const [foodA, foodB] = selectFoodsForComparison(userText, foodCandidates)
    if (foodA && foodB)
      results.push(comparePetFoods(petProfile, foodA, foodB, petProfile.health_goal || userText))
  }
  if (intent === PET_AI_INTENTS.mealPlan || intent === PET_AI_INTENTS.nutrition) {
    results.push(generateMealPlan(petProfile, currentFood, recentLogs))
  }
  if (intent === PET_AI_INTENTS.health) {
    results.push(classifyHealthRisk(userText, recentLogs, retrievedKnowledge))
  }
  if (intent === PET_AI_INTENTS.care || intent === PET_AI_INTENTS.training) {
    results.push(generateCareSuggestion(petProfile, userText, retrievedKnowledge))
  }
  if (!results.length) {
    results.push(generateCareSuggestion(petProfile, userText, retrievedKnowledge))
  }
  return results
}

function selectFoodsForComparison(userText, foodCandidates) {
  const text = String(userText || '').toLowerCase()
  const mentioned = foodCandidates.filter((food) => {
    const haystack = `${food.id} ${food.brand} ${food.product_name}`.toLowerCase()
    return haystack.split(/\s+/).some((token) => token.length > 2 && text.includes(token))
  })
  const candidates = mentioned.length >= 2 ? mentioned : foodCandidates
  return [candidates[0] || null, candidates[1] || null]
}

function renderOrchestratorContext({
  intent,
  petProfile,
  recentLogs,
  retrievedKnowledge,
  foodCandidates,
  currentFood,
  toolResults,
}) {
  return [
    '【Pet AI Orchestrator】',
    `intent: ${intent}`,
    '',
    '【PetProfile】',
    petProfileToText(petProfile),
    '',
    '【PetDailyLog 最近 7 天】',
    dailyLogsToText(recentLogs),
    '',
    '【FoodProduct 当前口粮】',
    currentFood
      ? renderFoodCandidates([currentFood])
      : '未设置 current_food_id，已使用同物种候选口粮作为参考。',
    '',
    '【FoodProduct 候选口粮数据库】',
    renderFoodCandidates(foodCandidates),
    '',
    '【RAG PetKnowledge 命中】',
    retrievedKnowledge.length
      ? retrievedKnowledge
          .map(
            (item) =>
              `- ${item.title} [${item.category}/${item.risk_level}] tags=${(item.tags || []).join(', ')}\n${item.content}`,
          )
          .join('\n\n')
      : '未检索到 PetKnowledge 命中。',
    '',
    '【Tool Calling 结果】',
    toolResults.map(renderToolResult).join('\n\n') || '未调用工具。',
  ].join('\n')
}
