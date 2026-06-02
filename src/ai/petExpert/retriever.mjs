import fs from 'node:fs/promises'
import path from 'node:path'

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

const KEYWORDS_BY_FILE = {
  'nutrition.md': [
    '喂',
    '吃',
    '食物',
    '营养',
    '换粮',
    '猫粮',
    '狗粮',
    '热量',
    'feeding',
    'nutrition',
    'diet',
  ],
  'vaccination.md': ['疫苗', '免疫', '抗体', 'vaccination', 'vaccine'],
  'deworming.md': ['驱虫', '寄生虫', '跳蚤', '蜱', 'deworm', 'parasite'],
  'emergency-red-flags.md': [
    '急诊',
    '中毒',
    '抽搐',
    '呼吸困难',
    '尿不出来',
    '便血',
    'vomit',
    'poison',
    'seizure',
  ],
  'common-symptoms.md': ['症状', '呕吐', '腹泻', '咳嗽', '精神', '便便', '尿', 'symptom', 'diarrhea'],
  'product-comparison.md': ['比较', '对比', '产品', '用品', '保险', '饮水机', '喂食器', 'compare', 'product'],
  'report-explanation.md': ['报告', '化验', '检查', '血常规', '生化', '尿检', 'report', 'lab'],
}

export async function retrievePetCareKnowledge(query, { enabled = true, limit = 4 } = {}) {
  if (!enabled) return []
  const documents = await loadKnowledgeDocuments()
  const queryTerms = tokenize(query)

  return documents
    .map((document) => ({
      ...document,
      score: scoreDocument(document, queryTerms),
    }))
    .filter((document) => document.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ title, path: filePath, content, score }) => ({
      title,
      path: filePath,
      content: content.slice(0, 3000),
      score,
    }))
}

async function loadKnowledgeDocuments() {
  const documents = []
  for (const fileName of KNOWLEDGE_FILES) {
    const filePath = path.join(KNOWLEDGE_DIR, fileName)
    try {
      const content = await fs.readFile(filePath, 'utf8')
      documents.push({
        title: extractTitle(content) || fileName.replace(/\.md$/, ''),
        path: path.join('knowledge', 'pet-care', fileName),
        fileName,
        content,
        keywords: KEYWORDS_BY_FILE[fileName] || [],
      })
    } catch {
      // Missing optional knowledge files should not break chat.
    }
  }
  return documents
}

function scoreDocument(document, queryTerms) {
  const content = document.content.toLowerCase()
  let score = 0
  for (const term of queryTerms) {
    if (!term) continue
    if (content.includes(term)) score += term.length > 1 ? 2 : 1
  }
  for (const keyword of document.keywords) {
    if (queryTerms.includes(keyword.toLowerCase())) score += 5
  }
  return score
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
    '提醒',
    '计划',
  ].filter((keyword) => lower.includes(keyword))
  return [...new Set([...latin, ...chineseKeywords])]
}

function extractTitle(content) {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() || ''
}
