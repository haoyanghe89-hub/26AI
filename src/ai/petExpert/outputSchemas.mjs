export const PET_EXPERT_RESPONSE_SCHEMA = {
  summary: 'string',
  riskLevel: 'low | medium | high',
  possibleConcerns: 'string[]',
  recommendedActions: 'string[]',
  observationChecklist: 'string[]',
  vetQuestions: 'string[]',
  remindersToCreate: 'Array<{ title: string, type: string, dueIn: string, notes: string }>',
  disclaimer: 'string',
  sourcesUsed: 'Array<{ title: string, path: string }>',
}

const DEFAULT_DISCLAIMER =
  '宠物专家引擎不能替代执业兽医诊断或处方。若症状严重、持续或快速加重，请及时联系兽医或急诊医院。'

export function normalizePetExpertResponse(value, fallbackText = '') {
  const parsed = typeof value === 'string' ? parseJsonFromText(value) : value
  const response = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}

  return {
    summary: normalizeString(response.summary) || fallbackText.trim() || '已根据当前宠物上下文整理建议。',
    riskLevel: normalizeRiskLevel(response.riskLevel),
    possibleConcerns: normalizeStringArray(response.possibleConcerns),
    recommendedActions: normalizeStringArray(response.recommendedActions),
    observationChecklist: normalizeStringArray(response.observationChecklist),
    vetQuestions: normalizeStringArray(response.vetQuestions),
    remindersToCreate: normalizeReminderSuggestions(response.remindersToCreate),
    disclaimer: normalizeString(response.disclaimer) || DEFAULT_DISCLAIMER,
    sourcesUsed: normalizeSources(response.sourcesUsed),
  }
}

export function renderPetExpertResponse(response, safetyResult) {
  const lines = []

  if (safetyResult?.hasRedFlags) {
    lines.push(
      '> **紧急安全提示**：检测到可能的急症警讯。请尽快联系执业兽医或附近宠物急诊医院。以下内容不是诊断，也不包含处方建议。',
    )
    lines.push('')
  }

  lines.push(`## 宠物专家引擎`)
  lines.push('')
  lines.push(`**风险等级**：${formatRiskLevel(response.riskLevel)}`)
  lines.push('')
  lines.push(response.summary)

  appendList(lines, '可能关注点', response.possibleConcerns)
  appendList(lines, '建议行动', response.recommendedActions)
  appendList(lines, '观察清单', response.observationChecklist)
  appendList(lines, '就医时可问兽医的问题', response.vetQuestions)

  if (response.remindersToCreate.length) {
    lines.push('')
    lines.push('### 可创建的提醒建议')
    for (const item of response.remindersToCreate) {
      lines.push(
        `- ${item.title}${item.dueIn ? `（${item.dueIn}）` : ''}${item.notes ? `：${item.notes}` : ''}`,
      )
    }
  }

  if (response.sourcesUsed.length) {
    lines.push('')
    lines.push('### 参考知识')
    for (const source of response.sourcesUsed) {
      lines.push(`- ${source.title}`)
    }
  }

  lines.push('')
  lines.push(`_${response.disclaimer}_`)
  return lines.join('\n')
}

function appendList(lines, title, items) {
  if (!items.length) return
  lines.push('')
  lines.push(`### ${title}`)
  for (const item of items) lines.push(`- ${item}`)
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeRiskLevel(value) {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'low'
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => normalizeString(item))
    .filter(Boolean)
    .slice(0, 8)
}

function normalizeReminderSuggestions(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      title: normalizeString(item.title),
      type: normalizeString(item.type),
      dueIn: normalizeString(item.dueIn),
      notes: normalizeString(item.notes),
    }))
    .filter((item) => item.title)
    .slice(0, 6)
}

function normalizeSources(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      title: normalizeString(item.title),
      path: normalizeString(item.path),
    }))
    .filter((item) => item.title)
    .slice(0, 6)
}

function parseJsonFromText(text) {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
    const candidate = fenced?.[1] || trimmed.match(/\{[\s\S]*\}/)?.[0]
    if (!candidate) return null
    try {
      return JSON.parse(candidate)
    } catch {
      return null
    }
  }
}

function formatRiskLevel(value) {
  if (value === 'high') return '高'
  if (value === 'medium') return '中'
  return '低'
}
