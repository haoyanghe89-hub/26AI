export const PET_EXPERT_INTENTS = {
  dailyCare: 'daily_care',
  symptomHealthConcern: 'symptom_health_concern',
  feedingNutrition: 'feeding_nutrition',
  vetVisitPreparation: 'vet_visit_preparation',
  reportExplanation: 'report_explanation',
  productComparison: 'product_comparison',
  reminderCarePlanGeneration: 'reminder_care_plan_generation',
}

export function classifyPetExpertIntent(text = '') {
  const input = text.toLowerCase()
  const rules = [
    {
      intent: PET_EXPERT_INTENTS.reportExplanation,
      patterns: [/报告|化验|检查单|血常规|生化|尿检|便检|影像|x光|b超|report|lab/i],
    },
    {
      intent: PET_EXPERT_INTENTS.vetVisitPreparation,
      patterns: [/就医|就诊|问诊|看医生|去医院|vet|clinic|checklist/i],
    },
    {
      intent: PET_EXPERT_INTENTS.productComparison,
      patterns: [/比较|对比|哪款|猫粮|狗粮|用品|保险|饮水机|喂食器|compare|product/i],
    },
    {
      intent: PET_EXPERT_INTENTS.reminderCarePlanGeneration,
      patterns: [/计划|提醒|日程|护理安排|生成.*plan|care plan|reminder/i],
    },
    {
      intent: PET_EXPERT_INTENTS.feedingNutrition,
      patterns: [/喂|吃|食物|营养|换粮|热量|罐头|冻干|零食|feeding|nutrition|diet/i],
    },
    {
      intent: PET_EXPERT_INTENTS.symptomHealthConcern,
      patterns: [
        /症状|呕吐|吐|腹泻|拉稀|便血|尿血|咳|喘|抽搐|中毒|不吃|没精神|疼|symptom|vomit|diarrhea|seizure/i,
      ],
    },
  ]

  return (
    rules.find((rule) => rule.patterns.some((pattern) => pattern.test(input)))?.intent ||
    PET_EXPERT_INTENTS.dailyCare
  )
}

export function promptKeyForIntent(intent) {
  if (intent === PET_EXPERT_INTENTS.symptomHealthConcern) return 'symptomTriagePrompt'
  if (intent === PET_EXPERT_INTENTS.feedingNutrition) return 'feedingPlanPrompt'
  if (intent === PET_EXPERT_INTENTS.vetVisitPreparation) return 'vetChecklistPrompt'
  if (intent === PET_EXPERT_INTENTS.reportExplanation) return 'reportExplanationPrompt'
  if (intent === PET_EXPERT_INTENTS.productComparison) return 'productComparisonPrompt'
  if (intent === PET_EXPERT_INTENTS.reminderCarePlanGeneration) return 'reminderPlanPrompt'
  return 'petCareGeneralPrompt'
}
