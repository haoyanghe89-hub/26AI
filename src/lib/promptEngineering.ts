import type { ProviderId } from '../stores/chat'

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

export interface CustomAgent {
  id: string
  name: string
  description: string
  systemPrompt: string
  model: string
  temperature: number
  useProjectContext: boolean
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

const BUILTIN_CREATED_AT = '2026-04-29T00:00:00.000Z'

export const DEFAULT_AGENT_ID = 'agent-general-assistant'

export const BUILTIN_PROMPT_TEMPLATES: PromptTemplate[] = [
  createBuiltinTemplate({
    id: 'template-code-refactor',
    name: '代码重构',
    description: '分析代码问题并给出可执行重构方案。',
    category: '研发',
    content:
      '请作为资深工程师重构下面的代码。\n\n目标：{{goal}}\n\n代码：\n{{code}}\n\n请输出：\n1. 主要问题\n2. 重构后的代码\n3. 关键改动说明\n4. 风险与测试建议',
  }),
  createBuiltinTemplate({
    id: 'template-copywriting',
    name: '文案创作',
    description: '为产品、活动或页面生成结构化文案。',
    category: '创作',
    content:
      '请为「{{product}}」创作{{channel}}文案。\n\n目标受众：{{audience}}\n核心卖点：{{selling_points}}\n语气：{{tone}}\n\n请给出标题、正文、行动号召，并补充 3 个备选标题。',
  }),
  createBuiltinTemplate({
    id: 'template-interview-coach',
    name: '面试辅导',
    description: '按岗位与经历生成模拟面试和反馈。',
    category: '职场',
    content:
      '你是面试辅导教练。请根据下面信息设计一轮模拟面试。\n\n岗位：{{role}}\n候选人背景：{{background}}\n重点训练方向：{{focus}}\n\n请输出 8 个问题、每题考察点、优秀回答要点和追问。',
  }),
]

export const BUILTIN_AGENTS: CustomAgent[] = [
  createBuiltinAgent({
    id: DEFAULT_AGENT_ID,
    name: '通用助手',
    description: '可靠、清晰、默认中文回复。',
    systemPrompt: '你是 Twentys1x 的通用 AI 助手。回答要清晰、可靠、友好，默认使用中文。',
    model: '',
    temperature: 0.7,
    useProjectContext: true,
  }),
  createBuiltinAgent({
    id: 'agent-frontend-engineer',
    name: '前端开发助手',
    description: '聚焦 Vue、TypeScript、交互体验与工程质量。',
    systemPrompt:
      '你是资深前端开发助手，擅长 Vue、TypeScript、组件设计、可访问性和前端工程化。若用户上传并选中了项目，请优先基于当前项目上下文、文件路径和检索片段回答，给出可落地方案、代码片段和测试建议。',
    model: '',
    temperature: 0.45,
    useProjectContext: true,
  }),
  createBuiltinAgent({
    id: 'agent-product-strategist',
    name: '产品策略助手',
    description: '帮助拆解需求、定义范围、产出 PRD 和验收标准。',
    systemPrompt:
      '你是产品策略助手，擅长从用户目标、业务价值、约束和上线风险拆解需求。若用户上传并选中了项目，请结合当前项目结构和已有实现评估需求可行性。回答要包含范围边界、优先级和验收标准。',
    model: '',
    temperature: 0.65,
    useProjectContext: true,
  }),
]

export const BUILTIN_WORKFLOWS: PromptWorkflow[] = [
  createBuiltinWorkflow({
    id: 'workflow-requirement-to-code',
    name: '需求到代码',
    description: '需求分析、实现方案、代码优化三步串联。',
    steps: [
      {
        id: 'step-requirement-analysis',
        title: '需求分析',
        templateId: '',
        agentId: 'agent-product-strategist',
        prompt: '请分析这个需求，提炼用户目标、核心流程、边界条件和验收标准。\n\n原始输入：\n{{input}}',
      },
      {
        id: 'step-code-plan',
        title: '实现方案',
        templateId: '',
        agentId: 'agent-frontend-engineer',
        prompt:
          '基于上一步分析，设计前端实现方案。请说明数据结构、组件拆分、状态流转和测试点。\n\n原始输入：\n{{input}}\n\n上一步输出：\n{{previous}}',
      },
      {
        id: 'step-polish',
        title: '注释优化',
        templateId: '',
        agentId: 'agent-frontend-engineer',
        prompt:
          '请审视上一步方案，补充命名、边界处理和可维护性建议。输出最终执行清单。\n\n原始输入：\n{{input}}\n\n上一步输出：\n{{previous}}',
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

export function normalizePromptTemplate(
  value: Partial<PromptTemplate>,
  fallback?: PromptTemplate,
): PromptTemplate {
  const now = new Date().toISOString()
  const content = String(value.content ?? fallback?.content ?? '').trim()
  return {
    id: String(value.id || fallback?.id || crypto.randomUUID()),
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
  return {
    id: String(value.id || fallback?.id || crypto.randomUUID()),
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
    isBuiltin: Boolean(value.isBuiltin ?? fallback?.isBuiltin ?? false),
    createdAt: String(value.createdAt || fallback?.createdAt || now),
    updatedAt: now,
  }
}

export function normalizeWorkflow(value: Partial<PromptWorkflow>, fallback?: PromptWorkflow): PromptWorkflow {
  const now = new Date().toISOString()
  const steps = Array.isArray(value.steps) ? value.steps : fallback?.steps || []
  return {
    id: String(value.id || fallback?.id || crypto.randomUUID()),
    name: String(value.name || fallback?.name || '未命名工作流')
      .trim()
      .slice(0, 40),
    description: String(value.description ?? fallback?.description ?? '')
      .trim()
      .slice(0, 120),
    steps: steps.map((step) => ({
      id: String(step.id || crypto.randomUUID()),
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
  return {
    systemPrompt: agent.systemPrompt,
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
