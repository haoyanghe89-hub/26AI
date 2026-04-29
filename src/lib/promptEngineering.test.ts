import { describe, expect, it } from 'vitest'
import {
  BUILTIN_AGENTS,
  BUILTIN_PROMPT_TEMPLATES,
  BUILTIN_WORKFLOWS,
  buildPromptRuntimeConfig,
  extractPromptVariables,
  normalizeAgent,
  normalizePromptTemplate,
  normalizeWorkflow,
  renderPromptTemplate,
} from './promptEngineering'

describe('promptEngineering', () => {
  it('extracts unique prompt variables and renders values', () => {
    const content = '请处理 {{ input }}，参考 {{previous}}，再次处理 {{input}}。'
    expect(extractPromptVariables(content)).toEqual(['input', 'previous'])
    expect(renderPromptTemplate(content, { input: '需求', previous: '分析' })).toContain('请处理 需求')
    expect(renderPromptTemplate(content, { input: '需求', previous: '分析' })).toContain('参考 分析')
  })

  it('normalizes templates with derived variables', () => {
    const template = normalizePromptTemplate({
      name: '测试模板',
      content: '目标：{{goal}}\n输入：{{input}}',
      category: '研发',
    })
    expect(template.variables).toEqual(['goal', 'input'])
    expect(template.isBuiltin).toBe(false)
  })

  it('normalizes agent runtime settings safely', () => {
    const agent = normalizeAgent({
      name: '前端助手',
      systemPrompt: '专注前端',
      temperature: 9,
      model: 'kimi-k2.6',
    })
    expect(agent.temperature).toBe(2)
    expect(buildPromptRuntimeConfig(agent)).toEqual({
      systemPrompt: '专注前端',
      model: 'kimi-k2.6',
      temperature: 2,
      useProjectContext: true,
    })
  })

  it('allows agents to opt out of uploaded project context', () => {
    const agent = normalizeAgent({
      name: '纯聊天助手',
      systemPrompt: '不要读取项目',
      useProjectContext: false,
    })
    expect(agent.useProjectContext).toBe(false)
    expect(buildPromptRuntimeConfig(agent).useProjectContext).toBe(false)
  })

  it('ships built-in prompt assets for templates, agents, and workflows', () => {
    expect(BUILTIN_PROMPT_TEMPLATES.map((item) => item.name)).toContain('代码重构')
    expect(BUILTIN_AGENTS.map((item) => item.name)).toContain('前端开发助手')
    expect(BUILTIN_WORKFLOWS[0].steps.length).toBeGreaterThan(1)
  })

  it('normalizes workflow steps with default agent references', () => {
    const workflow = normalizeWorkflow({
      name: '测试工作流',
      steps: [{ id: 's1', title: '分析', prompt: '输入：{{input}}', agentId: '', templateId: '' }],
    })
    expect(workflow.steps[0].agentId).toBe('agent-general-assistant')
    expect(workflow.steps[0].prompt).toContain('{{input}}')
  })
})
