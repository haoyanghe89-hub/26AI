import { describe, expect, it } from 'vitest'
import {
  BUILTIN_AGENTS,
  BUILTIN_PROMPT_TEMPLATES,
  BUILTIN_WORKFLOWS,
  buildPromptRuntimeConfig,
  buildTemplatedUserPrompt,
  extractPromptVariables,
  normalizeAgent,
  normalizePromptTemplate,
  normalizeWorkflow,
  renderPromptTemplate,
  wrapComposerTemplate,
} from './promptEngineering'

describe('promptEngineering', () => {
  it('extracts unique prompt variables and renders values', () => {
    const content = '请处理 {{ input }}，参考 {{previous}}，再次处理 {{input}}。'
    expect(extractPromptVariables(content)).toEqual(['input', 'previous'])
    expect(renderPromptTemplate(content, { input: '需求', previous: '分析' })).toContain('请处理 需求')
    expect(renderPromptTemplate(content, { input: '需求', previous: '分析' })).toContain('参考 分析')
  })

  it('builds a real model prompt from the selected template and user input', () => {
    expect(
      buildTemplatedUserPrompt({ id: 't1', name: '需求分析', content: '请分析：{{input}}' }, '新增登录页'),
    ).toBe('请分析：新增登录页')

    expect(
      buildTemplatedUserPrompt({ id: 't2', name: '代码审查', content: '你是代码审查专家。' }, '检查这段代码'),
    ).toContain('用户输入：\n检查这段代码')
  })

  it('wrapComposerTemplate fills {{input}} or appends user text for fixed templates', () => {
    expect(wrapComposerTemplate('说明：{{input}}', '你好')).toBe('说明：你好')
    expect(wrapComposerTemplate('固定前缀\n\n---\n尾部', 'x')).toContain('固定前缀')
    expect(wrapComposerTemplate('仅静态指令', '用户话')).toContain('仅静态指令')
    expect(wrapComposerTemplate('仅静态指令', '用户话')).toContain('用户话')
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
