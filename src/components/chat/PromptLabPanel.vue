<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  ArrowDown,
  Collection,
  CopyDocument,
  Delete,
  Edit,
  MagicStick,
  Plus,
  User,
} from '@element-plus/icons-vue'
import ElButton from 'element-plus/es/components/button/index.mjs'
import ElDialog from 'element-plus/es/components/dialog/index.mjs'
import ElIcon from 'element-plus/es/components/icon/index.mjs'
import ElInput from 'element-plus/es/components/input/index.mjs'
import ElInputNumber from 'element-plus/es/components/input-number/index.mjs'
import ElSelect, { ElOption } from 'element-plus/es/components/select/index.mjs'
import {
  DEFAULT_AGENT_ID,
  exportPromptAssetJson,
  extractPromptVariables,
  renderPromptTemplate,
  type AgentKnowledge,
  type CustomAgent,
  type PromptTemplate,
  type PromptWorkflow,
  type PromptWorkflowStep,
} from '../../lib/promptEngineering'

const props = defineProps<{
  templates: PromptTemplate[]
  agents: CustomAgent[]
  workflows: PromptWorkflow[]
  activeAgentId: string
  hasActiveProject: boolean
  isRunningWorkflow: boolean
}>()

const emit = defineEmits<{
  'apply-template': [value: Pick<PromptTemplate, 'id' | 'name' | 'content'>]
  'select-agent': [value: string]
  'save-template': [value: Partial<PromptTemplate>]
  'delete-template': [id: string]
  'save-agent': [value: Partial<CustomAgent>]
  'delete-agent': [id: string]
  'save-workflow': [value: Partial<PromptWorkflow>]
  'delete-workflow': [id: string]
  'run-workflow': [id: string, input: string]
}>()

type LabMode = 'templates' | 'agents' | 'workflows'

const storedCollapsed = localStorage.getItem('twentys1x:prompt-lab-collapsed')
const isCollapsed = ref(storedCollapsed === 'true')
const mode = ref<LabMode>('templates')
const selectedTemplateId = ref(props.templates[0]?.id || '')
const selectedWorkflowId = ref(props.workflows[0]?.id || '')
const templateDialogVisible = ref(false)
const agentDialogVisible = ref(false)
const workflowDialogVisible = ref(false)
const workflowRunDialogVisible = ref(false)
const variableDialogVisible = ref(false)
const copiedAssetId = ref('')
const workflowRunInput = ref('')

const templateDraft = reactive<Partial<PromptTemplate>>({})
const agentDraft = reactive<Partial<CustomAgent>>({})
const workflowDraft = reactive<Partial<PromptWorkflow>>({})
const variableValues = reactive<Record<string, string>>({})

const selectedTemplate = computed(() => props.templates.find((item) => item.id === selectedTemplateId.value))
const selectedWorkflow = computed(() => props.workflows.find((item) => item.id === selectedWorkflowId.value))
const activeAgent = computed(() => props.agents.find((item) => item.id === props.activeAgentId))
const isProjectContextActive = computed(
  () => props.hasActiveProject && Boolean(activeAgent.value?.useProjectContext),
)
const templateVariables = computed(() => extractPromptVariables(selectedTemplate.value?.content || ''))

watch(
  () => props.templates,
  (templates) => {
    if (!templates.some((item) => item.id === selectedTemplateId.value)) {
      selectedTemplateId.value = templates[0]?.id || ''
    }
  },
)

watch(
  () => props.workflows,
  (workflows) => {
    if (!workflows.some((item) => item.id === selectedWorkflowId.value)) {
      selectedWorkflowId.value = workflows[0]?.id || ''
    }
  },
)

function toggleCollapsed() {
  isCollapsed.value = !isCollapsed.value
  localStorage.setItem('twentys1x:prompt-lab-collapsed', String(isCollapsed.value))
}

function switchMode(nextMode: LabMode) {
  mode.value = nextMode
}

function resetObject(target: Record<string, unknown>, source: Record<string, unknown>) {
  for (const key of Object.keys(target)) delete target[key]
  Object.assign(target, source)
}

function openTemplateDialog(template?: PromptTemplate) {
  resetObject(templateDraft, {
    id: template?.isBuiltin ? undefined : template?.id,
    name: template?.isBuiltin ? `${template.name} 副本` : template?.name || '',
    description: template?.description || '',
    category: template?.category || '自定义',
    content: template?.content || '',
  })
  templateDialogVisible.value = true
}

function saveTemplateDraft() {
  emit('save-template', { ...templateDraft })
  templateDialogVisible.value = false
}

function applySelectedTemplate() {
  const template = selectedTemplate.value
  if (!template) return
  const vars = templateVariables.value
  if (!vars.length) {
    emit('apply-template', {
      id: template.id,
      name: template.name,
      content: template.content,
    })
    return
  }

  // 仅有 {{input}} 时不弹窗，留给主输入框在发送时填入
  const onlyInput = vars.length === 1 && vars[0] === 'input'
  if (onlyInput) {
    emit('apply-template', {
      id: template.id,
      name: template.name,
      content: template.content,
    })
    return
  }

  for (const key of vars) {
    if (!(key in variableValues)) variableValues[key] = ''
  }
  variableDialogVisible.value = true
}

function applyTemplateVariables() {
  const template = selectedTemplate.value
  if (!template) return
  emit('apply-template', {
    id: template.id,
    name: template.name,
    content: renderPromptTemplate(template.content, variableValues),
  })
  variableDialogVisible.value = false
}

function openAgentDialog(agent?: CustomAgent) {
  resetObject(agentDraft, {
    id: agent?.isBuiltin ? undefined : agent?.id,
    name: agent?.isBuiltin ? `${agent.name} 副本` : agent?.name || '',
    description: agent?.description || '',
    systemPrompt: agent?.systemPrompt || '',
    model: agent?.model || '',
    temperature: agent?.temperature ?? 0.7,
    useProjectContext: agent?.useProjectContext ?? true,
    knowledgeBase: agent?.knowledgeBase?.length ? agent.knowledgeBase.map((k) => ({ ...k })) : [],
    memory: agent?.memory || '',
  })
  agentDialogVisible.value = true
}

function agentKnowledgeItems(): AgentKnowledge[] {
  if (!Array.isArray(agentDraft.knowledgeBase)) agentDraft.knowledgeBase = []
  return agentDraft.knowledgeBase as AgentKnowledge[]
}

function createKnowledgeItem(): AgentKnowledge {
  return { id: crypto.randomUUID(), title: '', content: '' }
}

function addKnowledgeItem() {
  agentKnowledgeItems().push(createKnowledgeItem())
}

function removeKnowledgeItem(index: number) {
  agentDraft.knowledgeBase = agentKnowledgeItems().filter((_, i) => i !== index)
}

function saveAgentDraft() {
  emit('save-agent', { ...agentDraft })
  agentDialogVisible.value = false
}

function createWorkflowStep(): PromptWorkflowStep {
  return {
    id: crypto.randomUUID(),
    title: '新步骤',
    prompt: '请基于输入完成这个步骤。\n\n输入：\n{{input}}\n\n上一步输出：\n{{previous}}',
    agentId: props.activeAgentId || DEFAULT_AGENT_ID,
    templateId: '',
  }
}

function openWorkflowDialog(workflow?: PromptWorkflow) {
  resetObject(workflowDraft, {
    id: workflow?.isBuiltin ? undefined : workflow?.id,
    name: workflow?.isBuiltin ? `${workflow.name} 副本` : workflow?.name || '',
    description: workflow?.description || '',
    steps: workflow?.steps?.length ? workflow.steps.map((step) => ({ ...step })) : [createWorkflowStep()],
  })
  workflowDialogVisible.value = true
}

function workflowSteps() {
  if (!Array.isArray(workflowDraft.steps)) workflowDraft.steps = []
  return workflowDraft.steps as PromptWorkflowStep[]
}

function addWorkflowStep() {
  workflowSteps().push(createWorkflowStep())
}

function removeWorkflowStep(index: number) {
  workflowDraft.steps = workflowSteps().filter((_, itemIndex) => itemIndex !== index)
}

function applyWorkflowTemplate(step: PromptWorkflowStep) {
  const template = props.templates.find((item) => item.id === step.templateId)
  if (template) {
    step.title = step.title || template.name
    step.prompt = template.content
  }
}

function saveWorkflowDraft() {
  emit('save-workflow', { ...workflowDraft, steps: workflowSteps() })
  workflowDialogVisible.value = false
}

function openWorkflowRunDialog() {
  workflowRunInput.value = ''
  workflowRunDialogVisible.value = true
}

function submitWorkflowRun() {
  const workflow = selectedWorkflow.value
  const content = workflowRunInput.value.trim()
  if (!workflow || !content) return
  emit('run-workflow', workflow.id, content)
  workflowRunDialogVisible.value = false
}

async function copyAsset(asset: PromptTemplate | CustomAgent | PromptWorkflow | undefined) {
  if (!asset) return
  await navigator.clipboard.writeText(exportPromptAssetJson(asset))
  copiedAssetId.value = asset.id
  setTimeout(() => (copiedAssetId.value = ''), 1800)
}
</script>

<template>
  <section class="prompt-lab" :class="{ 'is-collapsed': isCollapsed }" aria-label="个性化工作台">
    <button type="button" class="prompt-lab-header" :aria-expanded="!isCollapsed" @click="toggleCollapsed">
      <span class="prompt-lab-title">
        <el-icon><MagicStick /></el-icon>
        个性化工作台
      </span>
      <span class="prompt-lab-summary">{{ activeAgent?.name || '通用助手' }}</span>
      <el-icon class="prompt-lab-chevron t1-chevron" :class="{ 'is-expanded': !isCollapsed }">
        <ArrowDown />
      </el-icon>
    </button>

    <div class="t1-collapse-wrap" :class="{ 'is-open': !isCollapsed }">
      <div class="t1-collapse-inner">
        <div class="prompt-lab-body">
          <div class="prompt-lab-tabs" role="tablist" aria-label="个性化工作台视图">
            <button :class="{ active: mode === 'templates' }" type="button" @click="switchMode('templates')">
              模板
            </button>
            <button :class="{ active: mode === 'agents' }" type="button" @click="switchMode('agents')">
              Agent
            </button>
            <button :class="{ active: mode === 'workflows' }" type="button" @click="switchMode('workflows')">
              工作流
            </button>
          </div>

          <div v-if="mode === 'templates'" class="prompt-lab-section">
            <div class="prompt-lab-toolbar">
              <el-select
                v-model="selectedTemplateId"
                size="small"
                popper-class="military-green-select-dropdown"
              >
                <el-option
                  v-for="template in templates"
                  :key="template.id"
                  :label="`${template.name} · ${template.category}`"
                  :value="template.id"
                />
              </el-select>
              <el-button size="small" plain :icon="Plus" @click="openTemplateDialog()">新建</el-button>
            </div>
            <div v-if="selectedTemplate" class="prompt-card">
              <div class="prompt-card-head">
                <span
                  ><el-icon><Collection /></el-icon>{{ selectedTemplate.name }}</span
                >
                <small>{{ selectedTemplate.isBuiltin ? '内置' : '自定义' }}</small>
              </div>
              <p>{{ selectedTemplate.description || '无描述' }}</p>
              <div v-if="templateVariables.length" class="prompt-chip-row">
                <span v-for="name in templateVariables" :key="name">{{ name }}</span>
              </div>
              <div class="prompt-lab-actions">
                <el-button size="small" type="primary" @click="applySelectedTemplate">使用模板</el-button>
                <el-button size="small" plain :icon="Edit" @click="openTemplateDialog(selectedTemplate)">
                  {{ selectedTemplate.isBuiltin ? '复制编辑' : '编辑' }}
                </el-button>
                <el-button size="small" plain :icon="CopyDocument" @click="copyAsset(selectedTemplate)">
                  {{ copiedAssetId === selectedTemplate.id ? '已复制' : '分享' }}
                </el-button>
                <el-button
                  v-if="!selectedTemplate.isBuiltin"
                  size="small"
                  plain
                  :icon="Delete"
                  @click="emit('delete-template', selectedTemplate.id)"
                >
                  删除
                </el-button>
              </div>
            </div>
          </div>

          <div v-else-if="mode === 'agents'" class="prompt-lab-section">
            <div class="prompt-lab-toolbar">
              <el-select
                :model-value="activeAgentId"
                size="small"
                popper-class="military-green-select-dropdown"
                @update:model-value="(value: string) => emit('select-agent', value)"
              >
                <el-option v-for="agent in agents" :key="agent.id" :label="agent.name" :value="agent.id" />
              </el-select>
              <el-button size="small" plain :icon="Plus" @click="openAgentDialog()">新建</el-button>
            </div>
            <div v-if="activeAgent" class="prompt-card">
              <div class="prompt-card-head">
                <span
                  ><el-icon><User /></el-icon>{{ activeAgent.name }}</span
                >
                <small>{{ activeAgent.model || '当前模型' }} · T {{ activeAgent.temperature }}</small>
              </div>
              <p>{{ activeAgent.description || '无描述' }}</p>
              <div class="agent-meta-row">
                <div class="agent-context-row" :class="{ disabled: !isProjectContextActive }">
                  {{
                    isProjectContextActive
                      ? '项目上下文已开启'
                      : hasActiveProject
                        ? '项目上下文未启用'
                        : '普通对话模式'
                  }}
                </div>
                <div v-if="activeAgent.knowledgeBase?.length" class="agent-kb-badge">
                  <el-icon><Collection /></el-icon>
                  {{ activeAgent.knowledgeBase.length }} 条知识
                </div>
                <div v-if="activeAgent.memory" class="agent-memory-badge">
                  <el-icon><Collection /></el-icon>
                  有记忆
                </div>
              </div>
              <div class="prompt-lab-actions">
                <el-button size="small" plain :icon="Edit" @click="openAgentDialog(activeAgent)">
                  {{ activeAgent.isBuiltin ? '复制编辑' : '编辑' }}
                </el-button>
                <el-button size="small" plain :icon="CopyDocument" @click="copyAsset(activeAgent)">
                  {{ copiedAssetId === activeAgent.id ? '已复制' : '分享' }}
                </el-button>
                <el-button
                  v-if="!activeAgent.isBuiltin"
                  size="small"
                  plain
                  :icon="Delete"
                  @click="emit('delete-agent', activeAgent.id)"
                >
                  删除
                </el-button>
              </div>
            </div>
          </div>

          <div v-else class="prompt-lab-section">
            <div class="prompt-lab-toolbar">
              <el-select
                v-model="selectedWorkflowId"
                size="small"
                popper-class="military-green-select-dropdown"
              >
                <el-option
                  v-for="workflow in workflows"
                  :key="workflow.id"
                  :label="workflow.name"
                  :value="workflow.id"
                />
              </el-select>
              <el-button size="small" plain :icon="Plus" @click="openWorkflowDialog()">新建</el-button>
            </div>
            <div v-if="selectedWorkflow" class="prompt-card">
              <div class="prompt-card-head">
                <span
                  ><el-icon><MagicStick /></el-icon>{{ selectedWorkflow.name }}</span
                >
                <small>{{ selectedWorkflow.steps.length }} 步</small>
              </div>
              <p>{{ selectedWorkflow.description || '无描述' }}</p>
              <ol class="workflow-step-list">
                <li v-for="step in selectedWorkflow.steps" :key="step.id">{{ step.title }}</li>
              </ol>
              <div class="prompt-lab-actions">
                <el-button
                  size="small"
                  type="primary"
                  :loading="isRunningWorkflow"
                  @click="openWorkflowRunDialog"
                >
                  执行
                </el-button>
                <el-button size="small" plain :icon="Edit" @click="openWorkflowDialog(selectedWorkflow)">
                  {{ selectedWorkflow.isBuiltin ? '复制编辑' : '编辑' }}
                </el-button>
                <el-button size="small" plain :icon="CopyDocument" @click="copyAsset(selectedWorkflow)">
                  {{ copiedAssetId === selectedWorkflow.id ? '已复制' : '分享' }}
                </el-button>
                <el-button
                  v-if="!selectedWorkflow.isBuiltin"
                  size="small"
                  plain
                  :icon="Delete"
                  @click="emit('delete-workflow', selectedWorkflow.id)"
                >
                  删除
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <el-dialog
    v-model="templateDialogVisible"
    class="personalization-dialog"
    title="提示词模板"
    width="min(720px, 94vw)"
    append-to-body
    align-center
  >
    <div class="prompt-form">
      <el-input v-model="templateDraft.name" placeholder="模板名称" />
      <el-input v-model="templateDraft.category" placeholder="分类，例如 研发、创作、职场" />
      <el-input v-model="templateDraft.description" placeholder="用途描述" />
      <el-input
        v-model="templateDraft.content"
        type="textarea"
        :rows="10"
        resize="vertical"
        placeholder="使用 {{input}}、{{code}} 这类变量占位"
      />
    </div>
    <template #footer>
      <el-button @click="templateDialogVisible = false">取消</el-button>
      <el-button
        type="primary"
        :disabled="!templateDraft.name || !templateDraft.content"
        @click="saveTemplateDraft"
      >
        保存
      </el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="variableDialogVisible"
    class="personalization-dialog"
    title="填写模板变量"
    width="min(560px, 94vw)"
    append-to-body
    align-center
  >
    <div class="prompt-form">
      <label v-for="name in templateVariables" :key="name">
        <span>{{ name }}</span>
        <el-input v-model="variableValues[name]" type="textarea" :rows="3" resize="vertical" />
      </label>
    </div>
    <template #footer>
      <el-button @click="variableDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="applyTemplateVariables">使用模板</el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="agentDialogVisible"
    class="personalization-dialog"
    title="自定义 Agent"
    width="min(720px, 94vw)"
    append-to-body
    align-center
  >
    <div class="prompt-form">
      <el-input v-model="agentDraft.name" placeholder="Agent 名称" />
      <el-input v-model="agentDraft.description" placeholder="用途描述" />
      <el-input v-model="agentDraft.model" placeholder="模型覆盖，留空则使用当前模型" />
      <label>
        <span>温度</span>
        <el-input-number v-model="agentDraft.temperature" :min="0" :max="2" :step="0.1" />
      </label>
      <label class="agent-project-toggle">
        <input v-model="agentDraft.useProjectContext" type="checkbox" />
        <span>使用当前上传项目上下文</span>
      </label>
      <el-input
        v-model="agentDraft.systemPrompt"
        type="textarea"
        :rows="6"
        resize="vertical"
        placeholder="输入这个 Agent 的系统提示词"
      />
      <div class="memory-section">
        <div class="memory-section-head">
          <strong>长期记忆</strong>
          <span v-if="agentDraft.memory" class="memory-hint">已记录 {{ agentDraft.memory.length }} 字</span>
          <span v-else class="memory-hint">对话中自动提取用户偏好</span>
        </div>
        <el-input
          v-model="agentDraft.memory"
          type="textarea"
          :rows="4"
          resize="vertical"
          placeholder="可手动编辑，也可由系统在对话中自动提取。每次对话后会自动更新。"
        />
      </div>
      <div class="kb-section">
        <div class="kb-section-head">
          <strong>知识库</strong>
          <span>{{ agentKnowledgeItems().length }} 条</span>
          <el-button size="small" plain :icon="Plus" @click="addKnowledgeItem">添加</el-button>
        </div>
        <div v-for="(item, idx) in agentKnowledgeItems()" :key="item.id" class="kb-item">
          <div class="kb-item-head">
            <el-input v-model="item.title" size="small" placeholder="知识标题" />
            <el-button size="small" plain @click="removeKnowledgeItem(idx)">删除</el-button>
          </div>
          <el-input
            v-model="item.content"
            type="textarea"
            :rows="3"
            resize="vertical"
            placeholder="知识内容，回答时作为参考上下文注入"
          />
        </div>
      </div>
    </div>
    <template #footer>
      <el-button @click="agentDialogVisible = false">取消</el-button>
      <el-button
        type="primary"
        :disabled="!agentDraft.name || !agentDraft.systemPrompt"
        @click="saveAgentDraft"
      >
        保存
      </el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="workflowDialogVisible"
    class="personalization-dialog personalization-dialog--wide"
    title="工作流编排"
    width="min(820px, 96vw)"
    append-to-body
    align-center
  >
    <div class="prompt-form workflow-form">
      <el-input v-model="workflowDraft.name" placeholder="工作流名称" />
      <el-input v-model="workflowDraft.description" placeholder="用途描述" />
      <div v-for="(step, index) in workflowSteps()" :key="step.id" class="workflow-step-editor">
        <div class="workflow-step-editor-head">
          <strong>步骤 {{ index + 1 }}</strong>
          <el-button
            size="small"
            plain
            :disabled="workflowSteps().length <= 1"
            @click="removeWorkflowStep(index)"
          >
            删除
          </el-button>
        </div>
        <el-input v-model="step.title" placeholder="步骤标题" />
        <el-select
          v-model="step.agentId"
          popper-class="military-green-select-dropdown"
          placeholder="选择 Agent"
        >
          <el-option v-for="agent in agents" :key="agent.id" :label="agent.name" :value="agent.id" />
        </el-select>
        <el-select
          v-model="step.templateId"
          clearable
          popper-class="military-green-select-dropdown"
          placeholder="可选：套用模板"
          @change="() => applyWorkflowTemplate(step)"
        >
          <el-option
            v-for="template in templates"
            :key="template.id"
            :label="template.name"
            :value="template.id"
          />
        </el-select>
        <el-input v-model="step.prompt" type="textarea" :rows="6" resize="vertical" />
      </div>
      <el-button plain :icon="Plus" @click="addWorkflowStep">添加步骤</el-button>
    </div>
    <template #footer>
      <el-button @click="workflowDialogVisible = false">取消</el-button>
      <el-button
        type="primary"
        :disabled="!workflowDraft.name || !workflowSteps().length"
        @click="saveWorkflowDraft"
      >
        保存
      </el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="workflowRunDialogVisible"
    class="personalization-dialog"
    title="运行工作流"
    width="min(640px, 94vw)"
    append-to-body
    align-center
  >
    <div class="prompt-form">
      <div v-if="selectedWorkflow" class="workflow-run-summary">
        <strong>{{ selectedWorkflow.name }}</strong>
        <span>{{ selectedWorkflow.steps.length }} 个步骤会依次执行，结果将写入当前会话。</span>
      </div>
      <el-input
        v-model="workflowRunInput"
        type="textarea"
        :rows="8"
        resize="vertical"
        placeholder="输入这次要交给工作流处理的任务、需求或问题"
        @keydown.meta.enter.prevent="submitWorkflowRun"
        @keydown.ctrl.enter.prevent="submitWorkflowRun"
      />
    </div>
    <template #footer>
      <el-button @click="workflowRunDialogVisible = false">取消</el-button>
      <el-button
        type="primary"
        :loading="isRunningWorkflow"
        :disabled="!workflowRunInput.trim()"
        @click="submitWorkflowRun"
      >
        开始执行
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.prompt-lab {
  display: grid;
  flex-shrink: 0;
  gap: 0;
  padding: 8px 10px;
  border: 1px solid rgba(23, 32, 26, 0.09);
  border-radius: 12px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.76) 0%, rgba(245, 249, 245, 0.5) 100%),
    radial-gradient(ellipse at 12% 0%, rgba(52, 96, 78, 0.1), transparent 42%);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.78) inset,
    0 14px 34px rgba(23, 32, 26, 0.06);
}

.prompt-lab:not(.is-collapsed) .t1-collapse-wrap {
  margin-top: 8px;
}

.prompt-lab.is-collapsed {
  padding: 6px 8px;
}

.prompt-lab-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, auto) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 28px;
  border: 0;
  padding: 0;
  color: #5b675f;
  background: transparent;
  text-align: left;
}

.prompt-lab-title {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  color: #2f3a33;
  font-size: 13px;
  font-weight: 850;
  letter-spacing: 0.02em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-lab-title .el-icon {
  color: #34604e;
  font-size: 15px;
}

.prompt-lab-summary,
.prompt-lab-chevron {
  color: #8a918b;
  font-size: 11px;
  font-weight: 750;
}

.prompt-lab-summary {
  max-width: 112px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-lab-body,
.prompt-lab-section,
.prompt-form {
  display: grid;
  gap: 12px;
}

.prompt-lab-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
  padding: 5px;
  border: 1px solid rgba(23, 32, 26, 0.05);
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(23, 32, 26, 0.05), rgba(23, 32, 26, 0.035)), rgba(255, 255, 255, 0.42);
}

.prompt-lab-tabs button {
  min-width: 0;
  min-height: 36px;
  border: 0;
  border-radius: 8px;
  color: #66706a;
  background: transparent;
  font-size: 13px;
  font-weight: 850;
  transition:
    background var(--t1-duration) var(--t1-ease),
    box-shadow var(--t1-duration) var(--t1-ease),
    color var(--t1-duration) var(--t1-ease);
}

.prompt-lab-tabs button.active {
  color: #17201a;
  background: #f8fbf7;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.85) inset,
    0 8px 18px rgba(23, 32, 26, 0.07);
}

.prompt-lab-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.prompt-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(52, 96, 78, 0.13);
  border-radius: 12px;
  background:
    linear-gradient(165deg, rgba(255, 255, 255, 0.78) 0%, rgba(249, 251, 248, 0.58) 100%),
    rgba(255, 255, 255, 0.56);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.72) inset;
}

.prompt-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.prompt-card-head span {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  color: #17201a;
  font-size: 14px;
  font-weight: 850;
}

.prompt-card-head small,
.prompt-card p {
  color: #66706a;
  font-size: 13px;
}

.prompt-card p {
  margin: 0;
  line-height: 1.45;
}

.agent-context-row {
  width: fit-content;
  border-radius: 999px;
  padding: 5px 10px;
  color: #2d5848;
  background: rgba(52, 96, 78, 0.1);
  font-size: 12px;
  font-weight: 780;
}

.agent-context-row.disabled {
  color: #7a7065;
  background: rgba(122, 112, 101, 0.12);
}

.prompt-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.prompt-chip-row span {
  border-radius: 999px;
  padding: 4px 9px;
  color: #34604e;
  background: rgba(52, 96, 78, 0.11);
  font-size: 12px;
  font-weight: 750;
}

.prompt-lab-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 2px;
}

.prompt-lab-actions :deep(.el-button) {
  width: 100%;
  min-height: 34px;
  margin-left: 0;
  border-radius: 8px;
  font-weight: 780;
}

.prompt-lab-actions :deep(.el-button--primary:first-child) {
  grid-column: 1 / -1;
  min-height: 38px;
  box-shadow: 0 10px 22px rgba(79, 93, 58, 0.2);
}

.workflow-step-list {
  margin: 0;
  padding-left: 18px;
  color: #4b554f;
  font-size: 12px;
}

.workflow-step-editor {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid rgba(23, 32, 26, 0.1);
  border-radius: 10px;
  background: rgba(248, 251, 247, 0.78);
}

.workflow-step-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.workflow-run-summary {
  display: grid;
  gap: 5px;
  border: 1px solid rgba(52, 96, 78, 0.14);
  border-radius: 12px;
  padding: 12px;
  background: rgba(52, 96, 78, 0.07);
}

.workflow-run-summary strong {
  color: #17201a;
  font-size: 14px;
  font-weight: 850;
}

.workflow-run-summary span {
  color: #66706a;
  font-size: 13px;
  line-height: 1.45;
}

.prompt-form label {
  display: grid;
  gap: 6px;
}

.prompt-form label > span {
  color: #66706a;
  font-size: 12px;
  font-weight: 750;
}

.agent-project-toggle {
  display: flex !important;
  grid-template-columns: none;
  align-items: center;
  gap: 10px !important;
  width: fit-content;
  min-height: 36px;
  border: 1px solid rgba(52, 96, 78, 0.16);
  border-radius: 999px;
  padding: 6px 12px;
  color: #2d5848;
  background: rgba(52, 96, 78, 0.07);
  font-size: 13px;
  font-weight: 800;
}

.agent-project-toggle input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: #4f5d3a;
}

:global(.personalization-dialog.el-dialog) {
  border: 1px solid rgba(23, 32, 26, 0.1);
  border-radius: 16px;
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.96) 0%, rgba(247, 250, 246, 0.94) 100%), #f8fbf7;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.84) inset,
    0 32px 88px rgba(23, 32, 26, 0.22);
  overflow: hidden;
}

:global(.personalization-dialog .el-dialog__header) {
  margin: 0;
  padding: 20px 22px 12px;
  border-bottom: 1px solid rgba(23, 32, 26, 0.07);
}

:global(.personalization-dialog .el-dialog__title) {
  color: #17201a;
  font-size: 18px;
  font-weight: 850;
  letter-spacing: 0;
}

:global(.personalization-dialog .el-dialog__body) {
  padding: 20px 22px;
}

:global(.personalization-dialog .el-dialog__footer) {
  padding: 14px 22px 20px;
  border-top: 1px solid rgba(23, 32, 26, 0.07);
  background: rgba(248, 251, 247, 0.72);
}

:global(.personalization-dialog .el-input__wrapper),
:global(.personalization-dialog .el-textarea__inner),
:global(.personalization-dialog .el-select__wrapper) {
  border-radius: 10px;
}

:global(.personalization-dialog--wide .el-dialog__body) {
  max-height: min(68vh, 720px);
  overflow-y: auto;
}

.agent-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.agent-kb-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  padding: 4px 10px;
  color: #34604e;
  background: rgba(52, 96, 78, 0.1);
  font-size: 11px;
  font-weight: 780;
}

.agent-kb-badge .el-icon {
  font-size: 12px;
}

.agent-memory-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  padding: 4px 10px;
  color: #7a6234;
  background: rgba(122, 98, 52, 0.1);
  font-size: 11px;
  font-weight: 780;
}

.agent-memory-badge .el-icon {
  font-size: 12px;
}

.memory-section {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid rgba(52, 96, 78, 0.12);
  border-radius: 10px;
  background: rgba(52, 96, 78, 0.05);
}

.memory-section-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.memory-section-head strong {
  color: #17201a;
  font-size: 13px;
  font-weight: 850;
}

.memory-hint {
  color: #8a918b;
  font-size: 11px;
  font-weight: 750;
}

.kb-section {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid rgba(23, 32, 26, 0.08);
  border-radius: 10px;
  background: rgba(248, 251, 247, 0.72);
}

.kb-section-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kb-section-head strong {
  color: #17201a;
  font-size: 13px;
  font-weight: 850;
}

.kb-section-head span {
  color: #8a918b;
  font-size: 12px;
  font-weight: 750;
}

.kb-item {
  display: grid;
  gap: 6px;
  padding: 8px;
  border: 1px solid rgba(23, 32, 26, 0.06);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.6);
}

.kb-item-head {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
}
</style>
