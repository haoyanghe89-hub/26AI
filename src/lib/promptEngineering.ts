import type { ProviderId } from '../stores/chat'
import { createId } from './uuid'

export interface PromptTemplate {
  id: string
  name: string
  description: string
  category: string
  content: string
  variables: string[]
  isBuiltin: boolean
  createdAt: string
  updatedAt: string
}

export interface AgentKnowledge {
  id: string
  title: string
  content: string
}

export interface CustomAgent {
  id: string
  name: string
  description: string
  systemPrompt: string
  model: string
  temperature: number
  useProjectContext: boolean
  knowledgeBase: AgentKnowledge[]
  /** 跨会话长期记忆，每次对话时自动拼入 systemPrompt */
  memory: string
  isBuiltin: boolean
  createdAt: string
  updatedAt: string
}

export interface PromptWorkflowStep {
  id: string
  title: string
  prompt: string
  agentId: string
  templateId: string
}

export interface PromptWorkflow {
  id: string
  name: string
  description: string
  steps: PromptWorkflowStep[]
  isBuiltin: boolean
  createdAt: string
  updatedAt: string
}

export interface PromptRuntimeConfig {
  systemPrompt?: string
  model?: string
  temperature?: number
  useProjectContext?: boolean
}

export interface ActivePromptTemplate {
  id: string
  name: string
  content: string
}

const BUILTIN_CREATED_AT = '2026-04-29T00:00:00.000Z'

export const DEFAULT_AGENT_ID = 'agent-pet-care-manager'

export const BUILTIN_PROMPT_TEMPLATES: PromptTemplate[] = [
  createBuiltinTemplate({
    id: 'template-cat-vomiting',
    name: '猫咪今天呕吐',
    description: '记录呕吐情况，判断观察重点和就医警讯。',
    category: '健康观察',
    content:
      '我的猫今天呕吐了：{{input}}\n\n请基于当前宠物档案和近期健康日志输出：\n1. 需要补充询问的问题\n2. 24 小时观察记录表\n3. 需要立刻就医的危险信号\n4. 就医前可准备的信息\n\n注意：不要做确诊，不要给处方；严重症状建议尽快联系执业兽医。',
  }),
  createBuiltinTemplate({
    id: 'template-feeding-plan',
    name: '生成喂养计划',
    description: '按宠物档案、体重、年龄、过敏和健康记录生成喂养建议。',
    category: '喂养照护',
    content:
      '请为当前选中的宠物生成一份 7 天喂养与照护计划。\n\n额外情况：{{input}}\n\n请输出：\n1. 档案缺失项\n2. 喂养原则\n3. 每日记录项目\n4. 零食与换粮注意事项\n5. 推荐设置的提醒\n6. 需要咨询兽医的情况',
  }),
  createBuiltinTemplate({
    id: 'template-food-compare',
    name: '比较两款宠物食品',
    description: '从配方、过敏、年龄体重、预算和风险维度比较。',
    category: '产品决策',
    content:
      '请比较以下宠物产品，并结合当前宠物档案给出选择建议。\n\n产品/配方/价格/疑问：\n{{input}}\n\n请输出对比表，包含：适配年龄体重、蛋白来源、潜在过敏风险、肠胃友好度、预算、需要向商家确认的问题、最终选择建议。',
  }),
  createBuiltinTemplate({
    id: 'template-vet-checklist',
    name: '准备就诊问题',
    description: '把症状和健康日志整理成就医前清单。',
    category: '就医助手',
    content:
      '请把以下症状和近期健康日志整理成就诊前清单：\n{{input}}\n\n请输出：\n1. 给兽医的一句话病情摘要\n2. 时间线\n3. 已观察到的症状\n4. 需要带去医院的资料/样本/照片\n5. 建议询问兽医的问题\n6. 紧急就医警讯\n\n必须注明：这不是诊断，最终以执业兽医检查为准。',
  }),
  createBuiltinTemplate({
    id: 'template-poop-appetite',
    name: '记录便便和食欲',
    description: '把日常观察转成可追踪健康日志。',
    category: '健康日志',
    content:
      '请根据以下描述整理成一条宠物健康日志，并指出需要继续观察的项目：\n{{input}}\n\n输出字段：食欲、饮水、便便、呕吐、精神、情绪、症状、异常行为、备注、后续提醒建议。',
  }),
  createBuiltinTemplate({
    id: 'template-new-puppy',
    name: '新到家幼犬照护',
    description: '为新手狗主人生成前两周照护计划。',
    category: '新手照护',
    content:
      '我家新到一只幼犬，情况如下：{{input}}\n\n请生成前两周照护计划，覆盖：适应期、喂食、饮水、排便、疫苗驱虫确认、环境安全、训练、社交、需要就医的危险信号。',
  }),
]

export const BUILTIN_AGENTS: CustomAgent[] = [
  createBuiltinAgent({
    id: DEFAULT_AGENT_ID,
    name: '宠物智能管家',
    description: '围绕宠物档案、健康日志、提醒和照护计划提供结构化建议。',
    systemPrompt:
      '你是“宠物智能管家”的核心助手。你帮助猫狗主人管理宠物档案、喂养、健康日志、提醒、就医准备和产品决策。默认中文回复。不要做医学确诊，不要给处方；遇到持续呕吐腹泻、呼吸困难、抽搐、拒食、疑似中毒、外伤出血、精神沉郁等情况，建议尽快联系执业兽医。',
    model: '',
    temperature: 0.55,
    useProjectContext: true,
    knowledgeBase: [],
    memory: '',
  }),
  createBuiltinAgent({
    id: 'agent-pet-vet-visit',
    name: '就医准备助手',
    description: '把症状、日志和报告整理成就诊前清单和提问清单。',
    systemPrompt:
      '你是宠物就医准备助手。你擅长把宠物症状、健康日志、化验单、影像报告和主人的观察整理成清晰的就诊前资料。你可以解释报告中的常见术语，但不能做诊断或处方。输出应包含病情摘要、时间线、需补充信息、建议询问兽医的问题、危险信号和就医建议。',
    model: '',
    temperature: 0.35,
    useProjectContext: true,
    knowledgeBase: [
      {
        id: 'kb-vet-warning-signs',
        title: '宠物急症警讯',
        content:
          '持续呕吐或腹泻、便血或尿血、呼吸困难、抽搐、昏迷或明显虚弱、疑似中毒、严重外伤、无法排尿、疼痛尖叫、拒食超过 24 小时、幼龄或高龄宠物急性异常，都应建议尽快联系执业兽医或急诊医院。',
      },
      {
        id: 'kb-vet-visit-pack',
        title: '就医前资料',
        content:
          '建议准备：症状开始时间、频率、饮食变化、食欲饮水、排便排尿、精神状态、用药和驱虫疫苗记录、呕吐物/便便照片、近期体重、已有化验单和病历。',
      },
    ],
    memory: '',
  }),
  createBuiltinAgent({
    id: 'agent-pet-product-advisor',
    name: '宠物产品决策助手',
    description: '比较宠物食品、用品、保险和本地服务，关注适配和风险。',
    systemPrompt:
      '你是宠物产品与服务决策助手。你帮助主人比较主粮、湿粮、猫砂、驱虫产品、洗护、保险、智能喂食器、玩具、航空箱、本地宠物服务等。必须结合宠物年龄、体重、品种、过敏、病史和预算。不要夸大商品功效，不要替代兽医开药。',
    model: '',
    temperature: 0.5,
    useProjectContext: true,
    knowledgeBase: [
      {
        id: 'kb-product-compare',
        title: '宠物产品比较维度',
        content:
          '食品比较：适用物种和年龄、蛋白来源、脂肪含量、碳水、添加剂、过敏源、适口性、换粮风险、单日成本。用品比较：安全性、清洁维护、耐用性、尺寸、售后。本地服务比较：资质、距离、评价、价格、应急能力。',
      },
    ],
    memory: '',
  }),
]

export const BUILTIN_WORKFLOWS: PromptWorkflow[] = [
  createBuiltinWorkflow({
    id: 'workflow-symptom-to-vet',
    name: '症状到就医清单',
    description: '从症状记录到观察表、就医摘要和提问清单。',
    steps: [
      {
        id: 'step-symptom-triage',
        title: '症状整理',
        templateId: '',
        agentId: 'agent-pet-vet-visit',
        prompt:
          '请把以下宠物症状整理为时间线、严重程度、已知诱因和需要补充询问的问题。\n\n原始输入：\n{{input}}',
      },
      {
        id: 'step-vet-questions',
        title: '就医问题',
        templateId: '',
        agentId: 'agent-pet-vet-visit',
        prompt:
          '基于症状整理，生成就诊前资料清单和建议询问兽医的问题。必须包含危险信号和免责声明。\n\n原始输入：\n{{input}}\n\n上一步输出：\n{{previous}}',
      },
      {
        id: 'step-care-followup',
        title: '复诊与提醒',
        templateId: '',
        agentId: 'agent-pet-care-manager',
        prompt:
          '请基于就医清单给出后续观察记录表和提醒建议。不要给诊断或处方。\n\n原始输入：\n{{input}}\n\n上一步输出：\n{{previous}}',
      },
    ],
  }),
]

export function extractPromptVariables(content: string) {
  const matches = String(content || '').matchAll(/\{\{\s*([a-zA-Z_][\w-]*)\s*\}\}/g)
  return Array.from(new Set(Array.from(matches, (match) => match[1])))
}

export function renderPromptTemplate(content: string, values: Record<string, string>) {
  return String(content || '').replace(/\{\{\s*([a-zA-Z_][\w-]*)\s*\}\}/g, (_, key: string) => {
    return values[key] ?? ''
  })
}

export function buildTemplatedUserPrompt(template: ActivePromptTemplate, userInput: string) {
  const content = template.content.trim()
  const input = userInput.trim()
  if (!content) return input

  if (/\{\{\s*(input|question|message|user_input)\s*\}\}/i.test(content)) {
    return content.replace(/\{\{\s*(input|question|message|user_input)\s*\}\}/gi, input)
  }

  return `${content}\n\n用户输入：\n${input}`
}

/**
 * 将主输入框内容与模板合并为发给模型的文本；界面与会话仍展示用户原文。
 * - 含 {{input}} 时用用户输入（或仅有附件时的占位句）替换。
 * - 已无占位符的模板正文后追加「---」与用户输入。
 */
export function wrapComposerTemplate(templateContent: string, userText: string): string {
  const trimmedUser = userText.trim()
  const inputFallback = trimmedUser || '请分析以下附件内容。'
  const raw = String(templateContent || '')
  const vars = extractPromptVariables(raw)

  if (vars.includes('input')) {
    return renderPromptTemplate(raw, { input: inputFallback })
  }

  if (!vars.length) {
    const base = raw.trim()
    if (!base) return inputFallback
    return `${base}\n\n---\n${trimmedUser || inputFallback}`
  }

  const rendered = renderPromptTemplate(raw, { input: inputFallback })
  if (/\{\{\s*[a-zA-Z_]/.test(rendered)) {
    return `${rendered}\n\n---\n${trimmedUser || inputFallback}`
  }
  return rendered
}

export function normalizePromptTemplate(
  value: Partial<PromptTemplate>,
  fallback?: PromptTemplate,
): PromptTemplate {
  const now = new Date().toISOString()
  const content = String(value.content ?? fallback?.content ?? '').trim()
  return {
    id: String(value.id || fallback?.id || createId()),
    name: String(value.name || fallback?.name || '未命名模板')
      .trim()
      .slice(0, 40),
    description: String(value.description ?? fallback?.description ?? '')
      .trim()
      .slice(0, 120),
    category: String(value.category || fallback?.category || '自定义')
      .trim()
      .slice(0, 20),
    content,
    variables: extractPromptVariables(content),
    isBuiltin: Boolean(value.isBuiltin ?? fallback?.isBuiltin ?? false),
    createdAt: String(value.createdAt || fallback?.createdAt || now),
    updatedAt: now,
  }
}

export function normalizeAgent(value: Partial<CustomAgent>, fallback?: CustomAgent): CustomAgent {
  const now = new Date().toISOString()
  const temperature = Number(value.temperature ?? fallback?.temperature ?? 0.7)
  const rawKb = Array.isArray(value.knowledgeBase)
    ? value.knowledgeBase
    : Array.isArray(fallback?.knowledgeBase)
      ? fallback.knowledgeBase
      : []
  return {
    id: String(value.id || fallback?.id || createId()),
    name: String(value.name || fallback?.name || '未命名 Agent')
      .trim()
      .slice(0, 40),
    description: String(value.description ?? fallback?.description ?? '')
      .trim()
      .slice(0, 120),
    systemPrompt: String(value.systemPrompt ?? fallback?.systemPrompt ?? '').trim(),
    model: String(value.model ?? fallback?.model ?? '').trim(),
    temperature: Number.isFinite(temperature) ? Math.min(2, Math.max(0, temperature)) : 0.7,
    useProjectContext: Boolean(value.useProjectContext ?? fallback?.useProjectContext ?? true),
    knowledgeBase: rawKb
      .filter((k) => k && typeof k === 'object')
      .map((k) => ({
        id: String(k.id || createId()),
        title: String(k.title || '未命名知识')
          .trim()
          .slice(0, 60),
        content: String(k.content || '')
          .trim()
          .slice(0, 20000),
      })),
    memory: String(value.memory ?? fallback?.memory ?? '')
      .trim()
      .slice(0, 4000),
    isBuiltin: Boolean(value.isBuiltin ?? fallback?.isBuiltin ?? false),
    createdAt: String(value.createdAt || fallback?.createdAt || now),
    updatedAt: now,
  }
}

export function normalizeWorkflow(value: Partial<PromptWorkflow>, fallback?: PromptWorkflow): PromptWorkflow {
  const now = new Date().toISOString()
  const steps = Array.isArray(value.steps) ? value.steps : fallback?.steps || []
  return {
    id: String(value.id || fallback?.id || createId()),
    name: String(value.name || fallback?.name || '未命名工作流')
      .trim()
      .slice(0, 40),
    description: String(value.description ?? fallback?.description ?? '')
      .trim()
      .slice(0, 120),
    steps: steps.map((step) => ({
      id: String(step.id || createId()),
      title: String(step.title || '步骤')
        .trim()
        .slice(0, 32),
      prompt: String(step.prompt || '').trim(),
      agentId: String(step.agentId || DEFAULT_AGENT_ID),
      templateId: String(step.templateId || ''),
    })),
    isBuiltin: Boolean(value.isBuiltin ?? fallback?.isBuiltin ?? false),
    createdAt: String(value.createdAt || fallback?.createdAt || now),
    updatedAt: now,
  }
}

export function buildPromptRuntimeConfig(agent: CustomAgent | null): PromptRuntimeConfig {
  if (!agent) return {}
  let systemPrompt = agent.systemPrompt
  const kb = agent.knowledgeBase
  if (kb?.length) {
    const kbSection = kb.map((k) => `【知识库: ${k.title}】\n${k.content}`).join('\n\n')
    systemPrompt = systemPrompt
      ? `${systemPrompt}\n\n你在回答时可以参考以下知识库内容，若知识库与用户问题无关则忽略：\n\n${kbSection}`
      : `你在回答时可以参考以下知识库内容，若知识库与用户问题无关则忽略：\n\n${kbSection}`
  }
  if (agent.memory) {
    systemPrompt = systemPrompt
      ? `${systemPrompt}\n\n【关于该用户的长期记忆】\n${agent.memory}\n\n请在回答时尊重以上用户偏好与历史决策，不要重复询问已确认的事项。`
      : `【关于该用户的长期记忆】\n${agent.memory}\n\n请在回答时尊重以上用户偏好与历史决策，不要重复询问已确认的事项。`
  }
  return {
    systemPrompt,
    model: agent.model,
    temperature: agent.temperature,
    useProjectContext: agent.useProjectContext,
  }
}

export function exportPromptAssetJson(asset: PromptTemplate | CustomAgent | PromptWorkflow) {
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), asset }, null, 2)
}

function createBuiltinTemplate(
  value: Omit<PromptTemplate, 'variables' | 'isBuiltin' | 'createdAt' | 'updatedAt'>,
) {
  return {
    ...value,
    variables: extractPromptVariables(value.content),
    isBuiltin: true,
    createdAt: BUILTIN_CREATED_AT,
    updatedAt: BUILTIN_CREATED_AT,
  }
}

function createBuiltinAgent(value: Omit<CustomAgent, 'isBuiltin' | 'createdAt' | 'updatedAt'>) {
  return {
    ...value,
    isBuiltin: true,
    createdAt: BUILTIN_CREATED_AT,
    updatedAt: BUILTIN_CREATED_AT,
  }
}

function createBuiltinWorkflow(value: Omit<PromptWorkflow, 'isBuiltin' | 'createdAt' | 'updatedAt'>) {
  return {
    ...value,
    isBuiltin: true,
    createdAt: BUILTIN_CREATED_AT,
    updatedAt: BUILTIN_CREATED_AT,
  }
}

export function isProviderId(value: string, providerIds: ProviderId[]) {
  return providerIds.includes(value as ProviderId)
}
