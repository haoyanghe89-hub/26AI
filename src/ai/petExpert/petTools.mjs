import { findFoodProductsForPet, foodProductToText } from './foodDatabase.mjs'

export function comparePetFoods(petProfile, foodA, foodB, goal = '') {
  const comparison = [foodA, foodB].filter(Boolean).map((food) => scoreFood(food, petProfile, goal))
  const winner =
    comparison.length === 2
      ? comparison[0].score === comparison[1].score
        ? 'tie'
        : comparison[0].score > comparison[1].score
          ? comparison[0].food.id
          : comparison[1].food.id
      : comparison[0]?.food.id || ''

  return {
    tool: 'comparePetFoods',
    goal,
    pet_id: petProfile?.id || '',
    winner,
    comparison: comparison.map(({ food, score, strengths, cautions }) => ({
      id: food.id,
      name: `${food.brand} ${food.product_name}`,
      protein_percent: food.protein_percent,
      fat_percent: food.fat_percent,
      fiber_percent: food.fiber_percent,
      kcal_per_kg: food.kcal_per_kg,
      price_per_kg: food.price_per_kg,
      score,
      strengths,
      cautions,
    })),
    safety_note: '口粮对比只评估结构化营养与适配性，不能替代兽医对疾病处方粮、过敏排查或慢病饮食的判断。',
  }
}

export function generateMealPlan(petProfile, currentFood, recentLogs = []) {
  const food = currentFood || findFoodProductsForPet(petProfile, { limit: 1 })[0] || null
  const weight = Number(petProfile?.weight_kg || 0)
  const recentSoftStool = recentLogs.some((log) => /软|拉稀|腹泻|异常|血/.test(log.stool_status))
  const poorAppetite = recentLogs.some((log) => /少|差|不吃|没胃口|拒食/.test(log.appetite))
  const activityLevel = petProfile?.activity_level || 'medium'
  const dailyCalories = estimateDailyCalories(petProfile)
  const dailyGrams = food && dailyCalories ? Math.round((dailyCalories / food.kcal_per_kg) * 1000) : null
  const mealsPerDay = petProfile?.species === 'cat' ? 3 : weight && weight < 8 ? 3 : 2

  return {
    tool: 'generateMealPlan',
    pet_id: petProfile?.id || '',
    current_food: food
      ? {
          id: food.id,
          name: `${food.brand} ${food.product_name}`,
          kcal_per_kg: food.kcal_per_kg,
          feeding_guide: food.feeding_guide,
        }
      : null,
    estimated_daily_calories: dailyCalories,
    estimated_daily_food_grams: dailyGrams,
    meals_per_day: mealsPerDay,
    meal_split:
      dailyGrams && mealsPerDay
        ? Array.from({ length: mealsPerDay }, (_, index) => ({
            meal: index + 1,
            grams: Math.round(dailyGrams / mealsPerDay),
          }))
        : [],
    adjustments: [
      activityLevel === 'high' ? '活动量高时可优先观察体重趋势后再小幅上调。' : '',
      activityLevel === 'low' ? '活动量低或体况偏高时，先控制零食热量并监测体重。' : '',
      recentSoftStool ? '最近便便异常，配餐建议先保持稳定，不要突然加新零食或快速换粮。' : '',
      poorAppetite ? '最近食欲下降，若持续不吃不喝或精神差，应尽快咨询兽医。' : '',
    ].filter(Boolean),
    applicable_conditions:
      '适用于精神状态稳定、无急症警讯、无兽医处方饮食要求的日常喂养估算；幼龄、妊娠、慢病或处方粮需求需咨询兽医。',
  }
}

export function classifyHealthRisk(question, recentLogs = [], retrievedKnowledge = []) {
  const text = [
    question,
    ...recentLogs.map((log) =>
      [log.appetite, log.stool_status, log.water_intake, log.abnormal_symptoms.join(' '), log.note].join(' '),
    ),
    ...retrievedKnowledge.map((item) => `${item.title} ${item.tags?.join(' ')} ${item.risk_level}`),
  ]
    .join('\n')
    .toLowerCase()
  const redFlags = [
    ['持续呕吐', /持续.*呕吐|反复.*呕吐|一直.*吐|多次.*吐|persistent vomiting/i],
    ['便血', /便血|血便|大便.*血|bloody stool/i],
    ['抽搐', /抽搐|癫痫|seizure|convulsion/i],
    ['呼吸困难', /呼吸困难|喘不上气|张口呼吸|difficulty breathing/i],
    ['幼龄严重腹泻', /幼犬|幼猫|puppy|kitten/i.test(text) && /严重.*腹泻|持续.*腹泻|拉稀/.test(text)],
    ['持续不吃不喝', /持续.*不吃|拒食.*(24|一天|两天)|不吃不喝|几乎没喝|not eating/i],
  ].filter(([, pattern]) => (pattern instanceof RegExp ? pattern.test(text) : Boolean(pattern)))

  const mediumFlags = /呕吐|腹泻|拉稀|软便|精神差|尿频|疼|咳|symptom|vomit|diarrhea/.test(text)

  return {
    tool: 'classifyHealthRisk',
    risk_level: redFlags.length ? 'high' : mediumFlags ? 'medium' : 'low',
    red_flags: redFlags.map(([label]) => label),
    recommended_boundary: redFlags.length
      ? '建议尽快联系执业兽医或急诊医院；AI 不做诊断、不建议处方药。'
      : '可结合近期记录继续观察；若症状持续、加重或信息不确定，应咨询兽医。',
  }
}

export function generateCareSuggestion(petProfile, question, retrievedKnowledge = []) {
  const categories = [...new Set(retrievedKnowledge.map((item) => item.category).filter(Boolean))]
  return {
    tool: 'generateCareSuggestion',
    pet_id: petProfile?.id || '',
    focus_categories: categories,
    suggestions: [
      petProfile?.weight_kg
        ? `继续记录 ${petProfile.name} 的体重趋势，避免只凭单日波动调整喂养。`
        : '补充当前体重，配餐和用量估算会更可靠。',
      petProfile?.allergy_list?.length
        ? `所有新食物先避开已记录过敏项：${petProfile.allergy_list.join('、')}。`
        : '补充已知过敏或不耐受食材，后续口粮对比会更准确。',
      categories.includes('training') ? '训练建议采用短时多次、正向奖励，并记录触发场景。' : '',
      categories.includes('care') ? '护理计划应包含疫苗、驱虫、体重、便便和饮水的固定记录点。' : '',
    ].filter(Boolean),
    knowledge_used: retrievedKnowledge.map((item) => item.title).slice(0, 5),
    boundary: '护理建议用于日常管理；若涉及疾病、疼痛、处方饮食或症状加重，需要咨询执业兽医。',
  }
}

export function renderToolResult(result) {
  return JSON.stringify(result, null, 2)
}

export function renderFoodCandidates(foods = []) {
  if (!foods.length) return '暂无匹配口粮。'
  return foods.map(foodProductToText).join('\n\n')
}

function scoreFood(food, petProfile, goal) {
  let score = 50
  const strengths = []
  const cautions = []
  const allergies = (petProfile?.allergy_list || []).map((item) => item.toLowerCase())
  const goalText = String(goal || petProfile?.health_goal || '').toLowerCase()

  for (const allergen of food.allergen_tags) {
    if (
      allergies.some((item) => allergen.toLowerCase().includes(item) || item.includes(allergen.toLowerCase()))
    ) {
      score -= 30
      cautions.push(`包含可能过敏标签：${allergen}`)
    }
  }
  if (/减重|控重|weight|胖|体重/.test(goalText)) {
    if (food.health_tags.includes('weight_control')) {
      score += 18
      strengths.push('匹配体重管理目标')
    }
    if (food.fat_percent > 16) {
      score -= 8
      cautions.push('脂肪比例偏高，控重目标下需谨慎')
    }
  }
  if (/肠胃|软便|digest|腹泻/.test(goalText) && food.health_tags.includes('digestive')) {
    score += 14
    strengths.push('匹配肠胃稳定目标')
  }
  if (/皮毛|毛发|skin/.test(goalText) && food.health_tags.includes('skin_coat')) {
    score += 10
    strengths.push('匹配皮毛支持目标')
  }
  if (petProfile?.species === food.species) {
    score += 10
    strengths.push('物种适配')
  } else {
    score -= 50
    cautions.push('物种不匹配')
  }
  if (!strengths.length) strengths.push('基础营养参数可用于进一步评估')
  if (!cautions.length) cautions.push('仍需结合便便、体重趋势和适口性观察')
  return { food, score, strengths, cautions }
}

function estimateDailyCalories(petProfile) {
  const weight = Number(petProfile?.weight_kg || 0)
  if (!weight) return null
  const rer = 70 * Math.pow(weight, 0.75)
  const age = Number(petProfile?.age_months || 0)
  const activity = petProfile?.activity_level || 'medium'
  let multiplier = petProfile?.species === 'cat' ? 1.2 : 1.4
  if (age && age < 12) multiplier = petProfile?.species === 'cat' ? 2.0 : 2.2
  if (activity === 'low') multiplier -= 0.15
  if (activity === 'high') multiplier += 0.25
  if (petProfile?.neutered === true) multiplier -= 0.1
  return Math.max(1, Math.round(rer * multiplier))
}
