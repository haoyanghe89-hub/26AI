import fs from 'node:fs/promises'
import path from 'node:path'
import { PET_KNOWLEDGE_BASE } from './mockKnowledge.mjs'

const KNOWLEDGE_DIR = path.join(process.cwd(), 'knowledge', 'pet-care')
const KNOWLEDGE_FILES = [
  'nutrition.md',
  'vaccination.md',
  'deworming.md',
  'emergency-red-flags.md',
  'common-symptoms.md',
  'product-comparison.md',
  'report-explanation.md',
]

const METADATA_BY_FILE = {
  'nutrition.md': {
    category: 'nutrition',
    risk_level: 'low',
    tags: ['喂', '吃', '食物', '营养', '换粮', '猫粮', '狗粮', '热量', 'feeding', 'nutrition', 'diet'],
  },
  'vaccination.md': {
    category: 'care',
    risk_level: 'none',
    tags: ['疫苗', '免疫', '抗体', 'vaccination', 'vaccine'],
  },
  'deworming.md': {
    category: 'care',
    risk_level: 'none',
    tags: ['驱虫', '寄生虫', '跳蚤', '蜱', 'deworm', 'parasite'],
  },
  'emergency-red-flags.md': {
    category: 'emergency',
    risk_level: 'high',
    tags: ['急诊', '中毒', '抽搐', '呼吸困难', '尿不出来', '便血', 'vomit', 'poison', 'seizure'],
  },
  'common-symptoms.md': {
    category: 'health',
    risk_level: 'medium',
    tags: ['症状', '呕吐', '腹泻', '咳嗽', '精神', '便便', '尿', 'symptom', 'diarrhea'],
  },
  'product-comparison.md': {
    category: 'nutrition',
    risk_level: 'low',
    tags: ['比较', '对比', '产品', '用品', '保险', '饮水机', '喂食器', 'compare', 'product'],
  },
  'report-explanation.md': {
    category: 'health',
    risk_level: 'medium',
    tags: ['报告', '化验', '检查', '血常规', '生化', '尿检', 'report', 'lab'],
  },
}

export async function retrievePetCareKnowledge(
  query,
  { enabled = true, limit = 4, petProfile = null, categoryFilters = [] } = {},
) {
  if (!enabled) return []
  const documents = await loadKnowledgeDocuments()
  const queryTerms = tokenize(query)
  const inferredCategories = normalizeCategoryFilters(categoryFilters, query)
  const species = petProfile?.species === 'dog' || petProfile?.species === 'cat' ? petProfile.species : ''

  return documents
    .filter((document) => !species || document.species === 'both' || document.species === species)
    .filter((document) => !inferredCategories.length || inferredCategories.includes(document.category))
    .map((document) => ({
      ...document,
      score: scoreDocument(document, queryTerms, inferredCategories),
    }))
    .filter((document) => document.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(
      ({
        id,
        title,
        path: filePath,
        content,
        score,
        tags,
        risk_level,
        category,
        species: itemSpecies,
        source_type,
      }) => ({
        id,
        title,
        path: filePath,
        content: content.slice(0, 3000),
        tags,
        risk_level,
        category,
        species: itemSpecies,
        source_type,
        score,
      }),
    )
}

async function loadKnowledgeDocuments() {
  const documents = PET_KNOWLEDGE_BASE.map((item) => ({
    ...item,
    path: `mock://pet-knowledge/${item.id}`,
    keywords: item.tags,
  }))
  for (const fileName of KNOWLEDGE_FILES) {
    const filePath = path.join(KNOWLEDGE_DIR, fileName)
    try {
      const content = await fs.readFile(filePath, 'utf8')
      const metadata = METADATA_BY_FILE[fileName] || { category: 'care', risk_level: 'none', tags: [] }
      documents.push({
        id: `markdown-${fileName.replace(/\.md$/, '')}`,
        title: extractTitle(content) || fileName.replace(/\.md$/, ''),
        path: path.join('knowledge', 'pet-care', fileName),
        fileName,
        content,
        species: 'both',
        category: metadata.category,
        tags: metadata.tags,
        risk_level: metadata.risk_level,
        source_type: 'manual',
        keywords: metadata.tags,
      })
    } catch {
      // Missing optional knowledge files should not break chat.
    }
  }
  return documents
}

function scoreDocument(document, queryTerms, categoryFilters) {
  const content = document.content.toLowerCase()
  let score = 0
  if (categoryFilters.includes(document.category)) score += 4
  if (document.risk_level === 'high' && categoryFilters.includes('emergency')) score += 5
  for (const term of queryTerms) {
    if (!term) continue
    if (content.includes(term)) score += term.length > 1 ? 2 : 1
  }
  for (const keyword of document.keywords) {
    if (queryTerms.includes(keyword.toLowerCase())) score += 5
  }
  return score
}

export function inferKnowledgeCategories(text = '') {
  const input = text.toLowerCase()
  const categories = []
  if (/急诊|便血|抽搐|呼吸困难|中毒|尿不出来|持续.*呕吐|emergency|seizure|poison/i.test(input)) {
    categories.push('emergency')
  }
  if (/喂|吃|食物|营养|换粮|猫粮|狗粮|口粮|热量|配餐|meal|food|nutrition|diet/i.test(input)) {
    categories.push('nutrition')
  }
  if (/症状|呕吐|腹泻|拉稀|咳|疼|尿|便便|精神|health|symptom|diarrhea|vomit/i.test(input)) {
    categories.push('health')
  }
  if (/训练|行为|等待|乱叫|咬|抓|社交|training|behavior/i.test(input)) categories.push('training')
  if (/护理|疫苗|驱虫|洗澡|梳毛|提醒|care|vaccine|deworm/i.test(input)) categories.push('care')
  if (/品种|短鼻|breed/i.test(input)) categories.push('breed')
  return [...new Set(categories)]
}

function normalizeCategoryFilters(categoryFilters, query) {
  const allowed = new Set(['nutrition', 'health', 'training', 'care', 'breed', 'emergency'])
  const explicit = (Array.isArray(categoryFilters) ? categoryFilters : [])
    .map((item) => String(item || '').trim())
    .filter((item) => allowed.has(item))
  return explicit.length ? [...new Set(explicit)] : inferKnowledgeCategories(query)
}

function tokenize(text = '') {
  const lower = text.toLowerCase()
  const latin = lower.match(/[a-z0-9]{2,}/g) || []
  const chineseKeywords = [
    '呕吐',
    '腹泻',
    '便血',
    '尿血',
    '呼吸困难',
    '抽搐',
    '中毒',
    '无法排尿',
    '疫苗',
    '驱虫',
    '喂养',
    '营养',
    '换粮',
    '猫粮',
    '狗粮',
    '报告',
    '化验',
    '产品',
    '比较',
    '口粮',
    '配餐',
    '训练',
    '行为',
    '护理',
    '短鼻',
    '提醒',
    '计划',
  ].filter((keyword) => lower.includes(keyword))
  return [...new Set([...latin, ...chineseKeywords])]
}

function extractTitle(content) {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() || ''
}
