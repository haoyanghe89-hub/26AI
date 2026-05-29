<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Bell,
  ChatDotRound,
  CircleCheck,
  Close,
  Document,
  DocumentAdd,
  Files,
  FirstAidKit,
  Food,
  House,
  Plus,
  Promotion,
  Setting,
  UploadFilled,
  WarningFilled,
} from '@element-plus/icons-vue'
import ElButton from 'element-plus/es/components/button/index.mjs'
import ElDialog from 'element-plus/es/components/dialog/index.mjs'
import ElIcon from 'element-plus/es/components/icon/index.mjs'
import ElInput from 'element-plus/es/components/input/index.mjs'
import ElInputNumber from 'element-plus/es/components/input-number/index.mjs'
import ElSelect, { ElOption } from 'element-plus/es/components/select/index.mjs'
import ElTag from 'element-plus/es/components/tag/index.mjs'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import MessageBubble from '../components/chat/MessageBubble.vue'
import SettingsPanel from '../components/chat/SettingsPanel.vue'
import {
  messagePreviewContent,
  type CareReminder,
  type ChatMessage,
  type HealthLog,
  type PetProfile,
  type PetSpecies,
  type ProviderId,
  useChatStore,
} from '../stores/chat'
import { useAuthStore } from '../stores/auth'
import type { PromptTemplate } from '../lib/promptEngineering'

type ModuleId = 'overview' | 'health' | 'care' | 'vet' | 'products' | 'files' | 'reminders'

const chat = useChatStore()
const auth = useAuthStore()
const router = useRouter()

const activeModule = ref<ModuleId>('overview')
const isCopilotOpen = ref(false)
const settingsVisible = ref(false)
const petDialogVisible = ref(false)
const healthLogDialogVisible = ref(false)
const reminderDialogVisible = ref(false)
const mobilePetSwitcherOpen = ref(false)
const messagesEl = ref<HTMLElement | null>(null)
const fileInputEl = ref<HTMLInputElement | null>(null)
const petAvatarInputEl = ref<HTMLInputElement | null>(null)
const copilotInput = ref('')
const activeComposerTemplate = ref<Pick<PromptTemplate, 'id' | 'name' | 'content'> | null>(null)
const copiedMessageId = ref<string | null>(null)
const copiedCodeBlock = ref<{ id: string; index: number } | null>(null)
const editingMessageId = ref<string | null>(null)
const editingContent = ref('')
const petDraft = reactive(createEmptyPetDraft())
const logDraft = reactive(createEmptyLogDraft())
const reminderDraft = reactive(createEmptyReminderDraft())

const navItems: Array<{ id: ModuleId; label: string; hint: string; icon: typeof House }> = [
  { id: 'overview', label: '总览', hint: '今日照护与风险', icon: House },
  { id: 'health', label: '健康日志', hint: '时间线与趋势', icon: DocumentAdd },
  { id: 'care', label: '护理计划', hint: '喂养、运动、疫苗', icon: Food },
  { id: 'vet', label: '就医助手', hint: '问诊清单与警讯', icon: FirstAidKit },
  { id: 'products', label: '商品决策', hint: '食品、保险、设备', icon: Food },
  { id: 'files', label: '资料库', hint: '报告、发票、疫苗本', icon: Files },
  { id: 'reminders', label: '提醒', hint: '喂食、驱虫、复诊', icon: Bell },
]

const activeModuleMeta = computed(
  () => navItems.find((item) => item.id === activeModule.value) || navItems[0],
)
const petTemplates = computed(() => chat.promptTemplates.filter((item) => item.isBuiltin).slice(0, 6))
const currentPetSummary = computed(() => {
  const pet = chat.activePet
  if (!pet) return '未选择宠物'
  return [
    speciesLabel(pet.species),
    pet.breed,
    pet.ageLabel || pet.birthday,
    pet.weightKg ? `${pet.weightKg}kg` : '体重待补充',
  ]
    .filter(Boolean)
    .join(' · ')
})
const healthStatus = computed(() => {
  const latest = chat.activePetHealthLogs[0]
  if (!latest) return { label: '待建立基线', tone: 'neutral' }
  const abnormal = [latest.symptoms, latest.vomiting, latest.abnormalBehavior].some(
    (value) => value && !/无|正常/.test(value),
  )
  if (abnormal || latest.energyLevel <= 2) return { label: '需要观察', tone: 'warn' }
  return { label: '状态平稳', tone: 'good' }
})
const todayTasks = computed(() => {
  const today = new Date().toISOString().slice(0, 10)
  return chat.activePetReminders
    .filter((item) => item.status !== 'done' && item.dueAt.slice(0, 10) <= today)
    .slice(0, 6)
})
const recentLogs = computed(() => chat.activePetHealthLogs.slice(0, 6))
const latestLog = computed(() => chat.activePetHealthLogs[0] || null)
const latestWeight = computed(() => latestLog.value?.weightKg || chat.activePet?.weightKg || null)
const previousWeight = computed(
  () =>
    chat.activePetHealthLogs.find((log) => log.weightKg && log.id !== latestLog.value?.id)?.weightKg || null,
)
const weightTrend = computed(() => {
  if (!latestWeight.value || !previousWeight.value) return '待积累'
  const diff = Number((latestWeight.value - previousWeight.value).toFixed(2))
  if (Math.abs(diff) < 0.05) return '稳定'
  return diff > 0 ? `增加 ${diff}kg` : `下降 ${Math.abs(diff)}kg`
})
const aiInsights = computed(() => {
  const insights: string[] = []
  const latest = latestLog.value
  if (!latest)
    return ['还没有足够日志。先记录 3-7 天食欲、饮水、便便、精神和体重，AI 会形成更稳定的观察摘要。']
  if (latest.appetite) insights.push(`最近记录显示食欲${latest.appetite}。`)
  if (latest.waterIntake && /少|低/.test(latest.waterIntake))
    insights.push('饮水偏少，建议继续观察饮水量和尿团/排尿变化。')
  if (latest.vomiting && !/无|没有|正常/.test(latest.vomiting))
    insights.push('记录到呕吐情况，如 24 小时内重复发生或伴随精神沉郁，请联系兽医。')
  if (latest.poop && /软|稀|血/.test(latest.poop))
    insights.push('便便状态存在异常信号，建议保留照片并记录饮食变化。')
  if (!insights.length) insights.push('近期记录整体平稳，继续保持固定喂食和健康日志节奏。')
  return insights
})
const promptChips = [
  '今天呕吐了怎么办？',
  '生成本周喂养计划',
  '根据最近日志准备就医清单',
  '比较两款猫粮',
  '解释这份检查报告',
]
const canSend = computed(
  () => chat.isProviderReady && !chat.isSending && (copilotInput.value.trim() || chat.pendingFiles.length),
)

watch(
  () => chat.visibleMessages.length,
  () => scrollCopilotToBottom(),
)

onMounted(async () => {
  await auth.hydrate()
  await chat.hydrateClientState()
  await chat.refreshProviderServerConfig()
  await chat.refreshLocalModels()
})

function createEmptyPetDraft(): Partial<PetProfile> {
  return {
    name: '',
    species: 'cat',
    breed: '',
    gender: 'unknown',
    birthday: '',
    ageLabel: '',
    weightKg: null,
    sterilizationStatus: 'unknown',
    allergies: '',
    medicalHistory: '',
    vaccinationStatus: '',
    dewormingStatus: '',
    foodPreferences: '',
    avatarUrl: '',
  }
}

function createEmptyLogDraft(): Partial<HealthLog> {
  return {
    appetite: '正常',
    waterIntake: '正常',
    poop: '成形',
    vomiting: '无',
    energyLevel: 4,
    mood: '平稳',
    weightKg: chat.activePet?.weightKg ?? null,
    symptoms: '',
    medication: '',
    abnormalBehavior: '',
    notes: '',
  }
}

function createEmptyReminderDraft(): Partial<CareReminder> {
  const due = new Date()
  due.setHours(20, 0, 0, 0)
  return {
    type: 'feeding',
    title: '',
    dueAt: due.toISOString().slice(0, 16),
    repeat: '一次',
    notes: '',
    status: 'pending',
  }
}

function resetObject<T extends object>(target: T, source: Partial<T>) {
  for (const key of Object.keys(target) as Array<keyof T>) delete target[key]
  Object.assign(target, source)
}

function setModule(moduleId: ModuleId) {
  activeModule.value = moduleId
  mobilePetSwitcherOpen.value = false
}

function openCopilot(prompt?: string, template?: PromptTemplate) {
  if (template)
    activeComposerTemplate.value = { id: template.id, name: template.name, content: template.content }
  else activeComposerTemplate.value = null
  if (prompt) copilotInput.value = prompt
  isCopilotOpen.value = true
  scrollCopilotToBottom()
  nextTick(() => document.querySelector<HTMLTextAreaElement>('.copilot-composer textarea')?.focus())
}

function closeCopilot() {
  isCopilotOpen.value = false
}

function openPetDialog(pet?: PetProfile) {
  resetObject(petDraft, pet ? { ...pet } : createEmptyPetDraft())
  petDialogVisible.value = true
}

function savePet() {
  if (!String(petDraft.name || '').trim()) {
    ElMessage.warning('请先填写宠物名字')
    return
  }
  const pet = chat.savePetProfile({ ...petDraft })
  chat.setActivePet(pet.id)
  petDialogVisible.value = false
  ElMessage.success('宠物档案已保存')
}

function openHealthLogDialog() {
  resetObject(logDraft, createEmptyLogDraft())
  healthLogDialogVisible.value = true
}

function saveHealthLog() {
  const log = chat.addHealthLog({ ...logDraft, petId: chat.activePetId })
  if (!log) return
  healthLogDialogVisible.value = false
  ElMessage.success('健康日志已记录')
}

function openReminderDialog() {
  resetObject(reminderDraft, createEmptyReminderDraft())
  reminderDialogVisible.value = true
}

function saveReminder() {
  const dueAt = reminderDraft.dueAt
    ? new Date(String(reminderDraft.dueAt)).toISOString()
    : new Date().toISOString()
  chat.saveCareReminder({ ...reminderDraft, petId: chat.activePetId, dueAt })
  reminderDialogVisible.value = false
  ElMessage.success('提醒已创建')
}

function generateCarePlan() {
  const plan = chat.generateCarePlanForActivePet()
  if (!plan) return
  activeModule.value = 'care'
  ElMessage.success('护理计划已生成')
}

function prepareVetVisit() {
  activeModule.value = 'vet'
  openCopilot('请根据当前宠物档案和最近健康日志，准备一份就医前清单。')
}

function comparePetFood() {
  activeModule.value = 'products'
  openCopilot('请比较两款宠物食品。我会提供配方、价格、适用阶段和疑问，请结合当前宠物档案给出表格。')
}

async function submitCopilot() {
  const content = copilotInput.value
  copilotInput.value = ''
  const sent = await chat.sendMessage(content, { composerTemplate: activeComposerTemplate.value })
  if (sent) {
    activeComposerTemplate.value = null
    scrollCopilotToBottom()
  } else {
    copilotInput.value = content
  }
}

async function handleFiles(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files || [])
  ;(event.target as HTMLInputElement).value = ''
  await chat.prepareFiles(files)
  openCopilot('请解释我上传的宠物资料/检查报告，并整理对当前宠物档案有用的信息。')
}

async function handlePetAvatar(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (!file) return
  petDraft.avatarUrl = await readFileAsDataUrl(file)
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function startInlineEdit(message: ChatMessage) {
  editingMessageId.value = message.id
  editingContent.value =
    typeof message.content === 'string' ? message.content : messagePreviewContent(message.content)
}

async function submitInlineEdit() {
  const content = editingContent.value
  editingMessageId.value = null
  editingContent.value = ''
  await chat.sendMessage(content)
}

function cancelInlineEdit() {
  editingMessageId.value = null
  editingContent.value = ''
}

async function copyMessage(messageId: string, content: ChatMessage['content']) {
  await navigator.clipboard.writeText(typeof content === 'string' ? content : messagePreviewContent(content))
  copiedMessageId.value = messageId
  window.setTimeout(() => (copiedMessageId.value = null), 1600)
}

async function copyCodeBlock(messageId: string, code: string, blockIndex: number) {
  await navigator.clipboard.writeText(code)
  copiedCodeBlock.value = { id: messageId, index: blockIndex }
  window.setTimeout(() => (copiedCodeBlock.value = null), 1600)
}

function scrollCopilotToBottom() {
  nextTick(() => {
    const el = messagesEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function speciesLabel(value?: PetSpecies) {
  if (value === 'dog') return '狗狗'
  if (value === 'cat') return '猫咪'
  return '其他宠物'
}

function reminderTypeLabel(value: CareReminder['type']) {
  const map: Record<CareReminder['type'], string> = {
    feeding: '喂食',
    water: '饮水',
    deworming: '驱虫',
    vaccination: '疫苗',
    grooming: '美容',
    medication: '用药',
    vet_follow_up: '复诊',
    other: '其他',
  }
  return map[value]
}

function formatDate(value: string) {
  if (!value) return '待定'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function selectProvider(value: string) {
  chat.setProvider(value as ProviderId)
}

async function logout() {
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <main class="app-shell" :class="{ 'copilot-open': isCopilotOpen }">
    <aside class="desktop-sidebar">
      <div class="brand">
        <div class="brand-mark">PM</div>
        <div>
          <p>Pet AI Manager</p>
          <strong>宠物 AI 管家</strong>
        </div>
      </div>

      <section class="pet-switcher">
        <div class="section-label">
          <span>当前宠物</span>
          <el-button :icon="Plus" size="small" circle @click="openPetDialog()" />
        </div>
        <button
          v-for="pet in chat.pets"
          :key="pet.id"
          type="button"
          class="pet-switch-card"
          :class="{ active: pet.id === chat.activePetId }"
          @click="chat.setActivePet(pet.id)"
        >
          <img v-if="pet.avatarUrl" :src="pet.avatarUrl" alt="" />
          <span v-else>{{ pet.species === 'dog' ? 'D' : pet.species === 'cat' ? 'C' : 'P' }}</span>
          <div>
            <strong>{{ pet.name }}</strong>
            <small>{{ speciesLabel(pet.species) }} · {{ pet.breed || '品种待补充' }}</small>
          </div>
        </button>
        <p v-if="!chat.pets.length" class="empty-copy">还没有宠物档案。</p>
      </section>

      <nav class="module-nav" aria-label="宠物管理模块">
        <button
          v-for="item in navItems"
          :key="item.id"
          type="button"
          :class="{ active: activeModule === item.id }"
          @click="setModule(item.id)"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          <span>
            <strong>{{ item.label }}</strong>
            <small>{{ item.hint }}</small>
          </span>
        </button>
      </nav>

      <div class="sidebar-footer">
        <el-button :icon="ChatDotRound" @click="openCopilot()">AI 咨询</el-button>
        <el-button :icon="Setting" circle @click="settingsVisible = true" />
      </div>
    </aside>

    <section class="mobile-topbar">
      <button type="button" class="mobile-pet-pill" @click="mobilePetSwitcherOpen = !mobilePetSwitcherOpen">
        <span class="pet-avatar-small">{{ chat.activePet?.species === 'dog' ? 'D' : 'C' }}</span>
        <span>{{ chat.activePet?.name || '选择宠物' }}</span>
      </button>
      <el-button type="primary" :icon="ChatDotRound" @click="openCopilot()">AI 咨询</el-button>
      <div v-if="mobilePetSwitcherOpen" class="mobile-pet-menu">
        <button
          v-for="pet in chat.pets"
          :key="pet.id"
          type="button"
          @click="
            chat.setActivePet(pet.id)
            mobilePetSwitcherOpen = false
          "
        >
          {{ pet.name }} · {{ speciesLabel(pet.species) }}
        </button>
        <button type="button" @click="openPetDialog()">新增宠物</button>
      </div>
    </section>

    <section class="content-shell">
      <header class="page-header">
        <div>
          <p class="eyebrow">Pet family OS</p>
          <h1>{{ activeModuleMeta.label }}</h1>
          <span>{{ activeModuleMeta.hint }}</span>
        </div>
        <div class="page-actions">
          <el-button :icon="DocumentAdd" @click="openHealthLogDialog">记录健康</el-button>
          <el-button type="primary" :icon="ChatDotRound" @click="openCopilot()">Ask AI / AI 咨询</el-button>
        </div>
      </header>

      <section v-if="activeModule === 'overview'" class="module-page overview-page">
        <article class="selected-pet-header">
          <div class="pet-identity">
            <img v-if="chat.activePet?.avatarUrl" :src="chat.activePet.avatarUrl" alt="" />
            <span v-else>{{ chat.activePet?.species === 'dog' ? 'D' : 'C' }}</span>
            <div>
              <p class="eyebrow">Selected pet</p>
              <h2>{{ chat.activePet?.name || '未选择宠物' }}</h2>
              <small>{{ currentPetSummary }}</small>
            </div>
          </div>
          <el-tag :class="`status-${healthStatus.tone}`" effect="light">{{ healthStatus.label }}</el-tag>
          <div class="header-buttons">
            <el-button @click="openHealthLogDialog">Add Log</el-button>
            <el-button @click="generateCarePlan">Generate Care Plan</el-button>
            <el-button type="primary" @click="openCopilot()">Ask AI</el-button>
          </div>
        </article>

        <div class="overview-grid">
          <article class="panel care-today">
            <div class="panel-title">
              <h3>Care Today / 今日照护</h3>
              <el-button :icon="Bell" size="small" @click="openReminderDialog">提醒</el-button>
            </div>
            <div v-if="todayTasks.length" class="task-list compact">
              <button
                v-for="task in todayTasks"
                :key="task.id"
                type="button"
                class="task-item"
                @click="chat.toggleCareReminderDone(task.id)"
              >
                <span class="task-check"><CircleCheck /></span>
                <span>
                  <strong>{{ task.title }}</strong>
                  <small :class="{ overdue: new Date(task.dueAt).getTime() < Date.now() }"
                    >{{ formatDate(task.dueAt) }} · {{ reminderTypeLabel(task.type) }}</small
                  >
                </span>
              </button>
            </div>
            <p v-else class="empty-copy">今天没有待办。可以添加喂食、饮水、驱虫、疫苗或复诊提醒。</p>
          </article>

          <article class="panel health-snapshot">
            <div class="panel-title">
              <h3>Health Snapshot / 健康快照</h3>
              <el-tag v-if="latestLog?.symptoms" type="warning" effect="plain">有症状记录</el-tag>
            </div>
            <div class="snapshot-grid">
              <div :class="{ abnormal: latestLog?.appetite && /差|少|拒/.test(latestLog.appetite) }">
                <span>食欲</span><strong>{{ latestLog?.appetite || '待记录' }}</strong>
              </div>
              <div :class="{ abnormal: latestLog?.poop && /软|稀|血/.test(latestLog.poop) }">
                <span>便便</span><strong>{{ latestLog?.poop || '待记录' }}</strong>
              </div>
              <div :class="{ abnormal: latestLog?.waterIntake && /少|低/.test(latestLog.waterIntake) }">
                <span>饮水</span><strong>{{ latestLog?.waterIntake || '待记录' }}</strong>
              </div>
              <div :class="{ abnormal: latestLog && latestLog.energyLevel <= 2 }">
                <span>精神</span><strong>{{ latestLog ? `${latestLog.energyLevel}/5` : '待记录' }}</strong>
              </div>
              <div>
                <span>体重趋势</span><strong>{{ weightTrend }}</strong>
              </div>
            </div>
          </article>

          <article class="panel ai-insights">
            <div class="panel-title">
              <h3>AI Insights / AI 洞察</h3>
              <el-button
                size="small"
                @click="openCopilot('请基于当前宠物档案和最近健康日志，生成一段简短照护洞察。')"
                >深入分析</el-button
              >
            </div>
            <ul>
              <li v-for="insight in aiInsights" :key="insight">{{ insight }}</li>
            </ul>
            <p class="disclaimer">AI 不能替代兽医诊断；持续或严重异常请联系执业兽医。</p>
          </article>

          <article class="panel recent-logs">
            <div class="panel-title">
              <h3>Recent Logs / 最近日志</h3>
              <div class="filter-chips"><span>全部</span><span>症状</span><span>体重</span></div>
            </div>
            <div v-if="recentLogs.length" class="timeline">
              <div v-for="log in recentLogs.slice(0, 4)" :key="log.id" class="timeline-card">
                <strong>{{ new Date(log.loggedAt).toLocaleDateString('zh-CN') }}</strong>
                <p>
                  食欲 {{ log.appetite || '未填' }} · 便便 {{ log.poop || '未填' }} · 呕吐
                  {{ log.vomiting || '未填' }} · 精神 {{ log.energyLevel }}/5
                </p>
                <small>{{ log.symptoms || log.notes || '暂无异常' }}</small>
              </div>
            </div>
            <p v-else class="empty-copy">还没有健康日志。</p>
          </article>

          <article class="panel quick-actions">
            <h3>Quick Actions / 快捷操作</h3>
            <div class="quick-grid">
              <button type="button" @click="openHealthLogDialog">Record Health Log</button>
              <button type="button" @click="generateCarePlan">Create Feeding Plan</button>
              <button type="button" @click="prepareVetVisit">Prepare Vet Visit</button>
              <button type="button" @click="comparePetFood">Compare Pet Food</button>
              <button type="button" @click="fileInputEl?.click()">Upload Medical Report</button>
              <button type="button" @click="openReminderDialog">Set Reminder</button>
            </div>
          </article>
        </div>
      </section>

      <section v-else-if="activeModule === 'health'" class="module-page">
        <div class="module-toolbar">
          <div>
            <h2>健康日志</h2>
            <p>记录食欲、饮水、便便、呕吐、精神、症状和体重，形成长期趋势。</p>
          </div>
          <el-button type="primary" :icon="Plus" @click="openHealthLogDialog">新增日志</el-button>
        </div>
        <div class="trend-row">
          <article class="trend-card">
            <span>最近食欲</span><strong>{{ latestLog?.appetite || '待记录' }}</strong>
          </article>
          <article class="trend-card">
            <span>最近饮水</span><strong>{{ latestLog?.waterIntake || '待记录' }}</strong>
          </article>
          <article class="trend-card">
            <span>最近便便</span><strong>{{ latestLog?.poop || '待记录' }}</strong>
          </article>
          <article class="trend-card">
            <span>体重</span><strong>{{ latestWeight ? `${latestWeight}kg` : '待记录' }}</strong>
          </article>
        </div>
        <div v-if="recentLogs.length" class="timeline large">
          <article v-for="log in chat.activePetHealthLogs" :key="log.id" class="log-detail-card">
            <header>
              <strong>{{ new Date(log.loggedAt).toLocaleString('zh-CN') }}</strong
              ><el-tag v-if="log.symptoms" type="warning">异常</el-tag>
            </header>
            <p>
              食欲 {{ log.appetite }} · 饮水 {{ log.waterIntake }} · 便便 {{ log.poop }} · 呕吐
              {{ log.vomiting }} · 精神 {{ log.energyLevel }}/5 · 情绪 {{ log.mood }}
            </p>
            <small
              >症状：{{ log.symptoms || '无' }}；用药：{{ log.medication || '无' }}；异常行为：{{
                log.abnormalBehavior || '无'
              }}</small
            >
            <small>{{ log.notes || '无备注' }}</small>
          </article>
        </div>
        <p v-else class="empty-state">还没有日志。先记录今天的食欲、饮水、便便和精神状态。</p>
      </section>

      <section v-else-if="activeModule === 'care'" class="module-page">
        <div class="module-toolbar">
          <div>
            <h2>护理计划</h2>
            <p>喂养、日常护理、运动、美容、用药、疫苗和驱虫安排。</p>
          </div>
          <el-button type="primary" :icon="Food" @click="generateCarePlan">生成/更新计划</el-button>
        </div>
        <article v-if="chat.activePetCarePlan" class="care-plan-card">
          <h3>{{ chat.activePetCarePlan.title }}</h3>
          <p>{{ chat.activePetCarePlan.summary }}</p>
          <div class="plan-columns">
            <section>
              <h4>Feeding / 喂养</h4>
              <ul>
                <li v-for="item in chat.activePetCarePlan.feeding" :key="item">{{ item }}</li>
              </ul>
            </section>
            <section>
              <h4>Routine / 日常护理</h4>
              <ul>
                <li v-for="item in chat.activePetCarePlan.care" :key="item">{{ item }}</li>
              </ul>
            </section>
            <section>
              <h4>Warnings / 警讯</h4>
              <ul>
                <li v-for="item in chat.activePetCarePlan.warnings" :key="item">{{ item }}</li>
              </ul>
            </section>
            <section>
              <h4>Reminder Suggestions / 提醒建议</h4>
              <ul>
                <li v-for="item in chat.activePetCarePlan.reminders" :key="item">{{ item }}</li>
              </ul>
            </section>
          </div>
        </article>
        <p v-else class="empty-state">
          还没有护理计划。点击生成后会基于档案、体重、过敏和近期日志创建第一版。
        </p>
      </section>

      <section v-else-if="activeModule === 'vet'" class="module-page">
        <div class="module-toolbar">
          <div>
            <h2>就医助手</h2>
            <p>把症状、健康日志和资料整理成问诊清单，不做诊断或处方。</p>
          </div>
          <el-button type="primary" :icon="FirstAidKit" @click="prepareVetVisit">生成就医清单</el-button>
        </div>
        <div class="vet-grid">
          <article class="panel">
            <h3>Symptom Triage / 症状分诊</h3>
            <p>基于近期日志识别需要观察的症状、发生频率和就医紧急度。</p>
            <el-button @click="openCopilot('请根据最近健康日志做一次症状分诊。')">Ask AI</el-button>
          </article>
          <article class="panel">
            <h3>Vet Checklist / 就诊清单</h3>
            <p>整理一句话病情摘要、时间线、需要携带的资料、照片或样本。</p>
            <el-button @click="prepareVetVisit">生成</el-button>
          </article>
          <article class="panel">
            <h3>Report Explanation / 报告解释</h3>
            <p>上传化验单、疫苗记录或病历，AI 用主人能理解的语言解释。</p>
            <el-button @click="fileInputEl?.click()">上传资料</el-button>
          </article>
          <article class="panel warning-panel">
            <WarningFilled />
            <h3>Emergency Warning Signs / 急症警讯</h3>
            <p>
              持续呕吐/腹泻、呼吸困难、抽搐、疑似中毒、无法排尿、明显疼痛、精神沉郁或拒食超过 24
              小时，请尽快联系执业兽医或急诊医院。
            </p>
          </article>
        </div>
      </section>

      <section v-else-if="activeModule === 'products'" class="module-page">
        <div class="module-toolbar">
          <div>
            <h2>商品决策</h2>
            <p>比较食品、猫砂/狗用品、保险、智能设备和本地服务。</p>
          </div>
          <el-button type="primary" :icon="ChatDotRound" @click="comparePetFood">开始比较</el-button>
        </div>
        <div class="decision-grid">
          <article
            class="decision-card"
            @click="openCopilot('请比较两款猫粮/狗粮，结合当前宠物体重、过敏和病史输出表格。')"
          >
            <Food /><strong>Food comparison</strong><small>主粮、湿粮、冻干、零食</small>
          </article>
          <article
            class="decision-card"
            @click="openCopilot('请比较两种猫砂或宠物用品，关注安全、维护、成本和适配性。')"
          >
            <Document /><strong>Supplies</strong><small>猫砂、牵引、玩具、航空箱</small>
          </article>
          <article
            class="decision-card"
            @click="openCopilot('请比较宠物保险方案，列出等待期、免赔额、既往症、报销范围和预算。')"
          >
            <Files /><strong>Insurance</strong><small>保险方案和报销范围</small>
          </article>
          <article
            class="decision-card"
            @click="openCopilot('请比较智能喂食器、饮水机或猫砂盆，关注数据、清洁和多宠识别。')"
          >
            <Bell /><strong>Smart devices</strong><small>喂食器、饮水机、猫砂盆</small>
          </article>
        </div>
        <p class="empty-state compact">推荐历史将在下一版沉淀为决策记录。</p>
      </section>

      <section v-else-if="activeModule === 'files'" class="module-page">
        <div class="module-toolbar">
          <div>
            <h2>资料库</h2>
            <p>集中管理检查报告、疫苗记录、发票、保险文件和病历。</p>
          </div>
          <el-button type="primary" :icon="UploadFilled" @click="fileInputEl?.click()">上传资料</el-button>
        </div>
        <div v-if="chat.pendingFiles.length" class="file-grid">
          <article v-for="file in chat.pendingFiles" :key="file.id" class="file-card">
            <Document /><strong>{{ file.name }}</strong
            ><small>{{ file.kind }} · {{ Math.round(file.size / 1024) }}KB</small>
            <el-button size="small" @click="chat.removePendingFile(file.id)">移除</el-button>
          </article>
        </div>
        <p v-else class="empty-state">还没有资料。上传报告后可从 AI 护理助手中解释并关联到当前宠物。</p>
      </section>

      <section v-else class="module-page">
        <div class="module-toolbar">
          <div>
            <h2>提醒</h2>
            <p>喂食、饮水、用药、驱虫、疫苗、美容和复诊提醒。</p>
          </div>
          <el-button type="primary" :icon="Bell" @click="openReminderDialog">新增提醒</el-button>
        </div>
        <div v-if="chat.activePetReminders.length" class="reminder-list">
          <article
            v-for="reminder in chat.activePetReminders"
            :key="reminder.id"
            class="reminder-card"
            :class="{ done: reminder.status === 'done' }"
          >
            <div>
              <strong>{{ reminder.title }}</strong>
              <p>
                {{ reminderTypeLabel(reminder.type) }} · {{ formatDate(reminder.dueAt) }} ·
                {{ reminder.repeat }}
              </p>
              <small>{{ reminder.notes || '无备注' }}</small>
            </div>
            <el-button @click="chat.toggleCareReminderDone(reminder.id)">{{
              reminder.status === 'done' ? '恢复' : '完成'
            }}</el-button>
          </article>
        </div>
        <p v-else class="empty-state">还没有提醒。先添加喂食、饮水、驱虫、疫苗或复诊提醒。</p>
      </section>
    </section>

    <aside class="copilot-panel" :class="{ open: isCopilotOpen }" aria-label="AI 护理助手">
      <header class="copilot-header">
        <div>
          <p class="eyebrow">AI Copilot</p>
          <h2>AI 护理助手</h2>
        </div>
        <el-button :icon="Close" circle @click="closeCopilot" />
      </header>
      <section class="copilot-pet-context">
        <span class="pet-avatar-small">{{ chat.activePet?.species === 'dog' ? 'D' : 'C' }}</span>
        <div>
          <strong>{{ chat.activePet?.name || '未选择宠物' }}</strong>
          <small>{{ currentPetSummary }}</small>
        </div>
      </section>
      <div class="copilot-chips">
        <button v-for="chip in promptChips" :key="chip" type="button" @click="openCopilot(chip)">
          {{ chip }}
        </button>
      </div>
      <div class="copilot-chips templates">
        <button
          v-for="template in petTemplates.slice(0, 4)"
          :key="template.id"
          type="button"
          @click="openCopilot(template.name, template)"
        >
          {{ template.name }}
        </button>
      </div>
      <div ref="messagesEl" class="copilot-messages">
        <p v-if="!chat.visibleMessages.length" class="empty-copy">
          打开一个问题，AI 会带着当前宠物档案、健康日志和提醒来回答。
        </p>
        <MessageBubble
          v-for="message in chat.visibleMessages"
          :key="message.id"
          :message="message"
          :is-sending="chat.isSending"
          :copied-message-id="copiedMessageId"
          :copied-code-block="copiedCodeBlock"
          :is-editing="editingMessageId === message.id"
          :editing-content="editingContent"
          @update:editing-content="(value) => (editingContent = value)"
          @start-inline-edit="startInlineEdit"
          @cancel-inline-edit="cancelInlineEdit"
          @submit-inline-edit="submitInlineEdit"
          @copy-message="copyMessage"
          @copy-code-block="copyCodeBlock"
          @regenerate-message="chat.regenerateMessage"
          @open-attachment="() => ElMessage.info('附件已加入 AI 上下文')"
        />
      </div>
      <footer class="copilot-footer">
        <input ref="fileInputEl" type="file" multiple class="sr-only" @change="handleFiles" />
        <div v-if="activeComposerTemplate" class="active-template">
          {{ activeComposerTemplate.name }}
          <button type="button" @click="activeComposerTemplate = null">移除</button>
        </div>
        <div v-if="chat.pendingFiles.length" class="file-chip-row">
          <el-tag
            v-for="file in chat.pendingFiles"
            :key="file.id"
            closable
            @close="chat.removePendingFile(file.id)"
            >{{ file.name }}</el-tag
          >
        </div>
        <div class="copilot-input-row">
          <el-button :icon="UploadFilled" circle @click="fileInputEl?.click()" />
          <el-input
            v-model="copilotInput"
            class="copilot-composer"
            type="textarea"
            resize="none"
            :autosize="{ minRows: 2, maxRows: 5 }"
            placeholder="向 AI 护理助手描述症状、产品、报告或护理目标..."
            @keydown.enter.exact.prevent="submitCopilot"
          />
          <el-button type="primary" :icon="Promotion" :disabled="!canSend" @click="submitCopilot"
            >发送</el-button
          >
        </div>
      </footer>
    </aside>

    <button class="mobile-ai-fab" type="button" @click="openCopilot()"><ChatDotRound />AI</button>

    <nav class="mobile-bottom-nav">
      <button
        v-for="item in navItems"
        :key="item.id"
        type="button"
        :class="{ active: activeModule === item.id }"
        @click="setModule(item.id)"
      >
        <component :is="item.icon" />
        <span>{{ item.label }}</span>
      </button>
    </nav>

    <el-dialog v-model="petDialogVisible" title="宠物档案" width="720px" class="pet-dialog">
      <div class="form-grid">
        <label>名字<el-input v-model="petDraft.name" placeholder="糯米 / Lucky" /></label>
        <label
          >物种<el-select v-model="petDraft.species"
            ><el-option label="猫" value="cat" /><el-option label="狗" value="dog" /><el-option
              label="其他"
              value="other" /></el-select
        ></label>
        <label>品种<el-input v-model="petDraft.breed" /></label>
        <label
          >性别<el-select v-model="petDraft.gender"
            ><el-option label="未知" value="unknown" /><el-option label="母" value="female" /><el-option
              label="公"
              value="male" /></el-select
        ></label>
        <label>生日<el-input v-model="petDraft.birthday" placeholder="2022-04-18" /></label>
        <label>年龄描述<el-input v-model="petDraft.ageLabel" placeholder="4 岁左右" /></label>
        <label>体重 kg<el-input-number v-model="petDraft.weightKg" :min="0" :precision="2" /></label>
        <label
          >绝育<el-select v-model="petDraft.sterilizationStatus"
            ><el-option label="待补充" value="unknown" /><el-option
              label="已绝育"
              value="sterilized" /><el-option label="未绝育" value="not_sterilized" /></el-select
        ></label>
      </div>
      <div class="form-stack">
        <label>过敏<el-input v-model="petDraft.allergies" /></label>
        <label>病史<el-input v-model="petDraft.medicalHistory" type="textarea" :rows="2" /></label>
        <label>疫苗状态<el-input v-model="petDraft.vaccinationStatus" /></label>
        <label>驱虫状态<el-input v-model="petDraft.dewormingStatus" /></label>
        <label>食物偏好<el-input v-model="petDraft.foodPreferences" type="textarea" :rows="2" /></label>
        <input
          ref="petAvatarInputEl"
          type="file"
          accept="image/*"
          class="sr-only"
          @change="handlePetAvatar"
        />
        <el-button @click="petAvatarInputEl?.click()">上传头像/照片</el-button>
      </div>
      <template #footer>
        <el-button @click="petDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="savePet">保存档案</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="healthLogDialogVisible" title="新增健康日志" width="640px">
      <div class="form-grid">
        <label>食欲<el-input v-model="logDraft.appetite" /></label>
        <label>饮水<el-input v-model="logDraft.waterIntake" /></label>
        <label>便便<el-input v-model="logDraft.poop" /></label>
        <label>呕吐<el-input v-model="logDraft.vomiting" /></label>
        <label>精神 1-5<el-input-number v-model="logDraft.energyLevel" :min="1" :max="5" /></label>
        <label>体重 kg<el-input-number v-model="logDraft.weightKg" :min="0" :precision="2" /></label>
      </div>
      <div class="form-stack">
        <label>情绪<el-input v-model="logDraft.mood" /></label>
        <label>症状<el-input v-model="logDraft.symptoms" /></label>
        <label>用药<el-input v-model="logDraft.medication" /></label>
        <label>异常行为<el-input v-model="logDraft.abnormalBehavior" /></label>
        <label>备注<el-input v-model="logDraft.notes" type="textarea" :rows="3" /></label>
      </div>
      <template #footer>
        <el-button @click="healthLogDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveHealthLog">保存日志</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="reminderDialogVisible" title="新增照护提醒" width="560px">
      <div class="form-stack">
        <label>标题<el-input v-model="reminderDraft.title" placeholder="喂食、换水、驱虫、复诊..." /></label>
        <label
          >类型<el-select v-model="reminderDraft.type"
            ><el-option label="喂食" value="feeding" /><el-option label="饮水" value="water" /><el-option
              label="驱虫"
              value="deworming" /><el-option label="疫苗" value="vaccination" /><el-option
              label="美容"
              value="grooming" /><el-option label="用药" value="medication" /><el-option
              label="复诊"
              value="vet_follow_up" /><el-option label="其他" value="other" /></el-select
        ></label>
        <label>时间<el-input v-model="reminderDraft.dueAt" type="datetime-local" /></label>
        <label>重复<el-input v-model="reminderDraft.repeat" placeholder="一次 / 每日 / 每月 / 每年" /></label>
        <label>备注<el-input v-model="reminderDraft.notes" type="textarea" :rows="3" /></label>
      </div>
      <template #footer>
        <el-button @click="reminderDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveReminder">保存提醒</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="settingsVisible" title="AI 与账户设置" width="720px">
      <SettingsPanel
        :providers="chat.providers"
        :selected-provider-id="chat.selectedProviderId"
        :selected-provider="chat.selectedProvider"
        :api-key="chat.apiKey"
        :model="chat.model"
        :current-model-options="chat.currentModelOptions"
        :inference-mode="chat.inferenceMode"
        :local-model="chat.localModel"
        :local-model-options="chat.localModelOptions"
        :local-model-status="chat.localModelStatus"
        :hybrid-fallback-to-cloud="chat.hybridFallbackToCloud"
        :is-refreshing-local-models="chat.isRefreshingLocalModels"
        @select-provider="selectProvider"
        @update-api-key="chat.setApiKey"
        @select-model="chat.setModel"
        @select-inference-mode="chat.setInferenceMode"
        @select-local-model="chat.setLocalModel"
        @update-hybrid-fallback="chat.setHybridFallbackToCloud"
        @refresh-local-models="chat.refreshLocalModels"
        @clear-history="chat.clearAllSessions"
      />
      <template #footer>
        <el-button @click="logout">退出登录</el-button>
        <el-button type="primary" @click="settingsVisible = false">完成</el-button>
      </template>
    </el-dialog>
  </main>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 284px minmax(0, 1fr);
  background: #f6f3ee;
  color: #20251f;
}
.desktop-sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px;
  border-right: 1px solid #e0d9ce;
  background: #fffaf3;
}
.brand,
.sidebar-footer,
.page-header,
.module-toolbar,
.panel-title,
.selected-pet-header,
.header-buttons,
.copilot-header,
.copilot-input-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.brand {
  justify-content: flex-start;
}
.brand-mark,
.pet-avatar-small,
.pet-switch-card > span,
.pet-identity > span {
  display: grid;
  place-items: center;
  background: #2f624d;
  color: #fff;
  font-weight: 800;
}
.brand-mark {
  width: 44px;
  height: 44px;
  border-radius: 8px;
}
.brand p,
.eyebrow {
  margin: 0 0 4px;
  color: #728074;
  font-size: 12px;
  letter-spacing: 0;
}
.brand strong,
h1,
h2,
h3,
h4,
p {
  margin-top: 0;
}
.section-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  color: #536052;
  font-size: 13px;
  font-weight: 700;
}
.pet-switcher {
  border-bottom: 1px solid #eee6dc;
  padding-bottom: 12px;
}
.pet-switch-card {
  width: 100%;
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: 10px;
  align-items: center;
  margin-bottom: 8px;
  padding: 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.pet-switch-card.active {
  background: #e9f5ed;
  border-color: #c7dfcf;
}
.pet-switch-card img,
.pet-switch-card > span {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}
.pet-switch-card strong,
.pet-switch-card small,
.module-nav strong,
.module-nav small {
  display: block;
}
small {
  color: #69756c;
}
.module-nav {
  display: grid;
  gap: 4px;
  overflow-y: auto;
}
.module-nav button {
  display: grid;
  grid-template-columns: 24px 1fr;
  gap: 10px;
  align-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  padding: 10px;
  text-align: left;
  cursor: pointer;
}
.module-nav button.active {
  background: #2f624d;
  color: #fff;
}
.module-nav button.active small {
  color: #dbece1;
}
.sidebar-footer {
  margin-top: auto;
}
.content-shell {
  min-width: 0;
  padding: 24px;
  overflow-y: auto;
}
.page-header {
  margin-bottom: 20px;
}
.page-header h1 {
  margin-bottom: 4px;
  font-size: 30px;
}
.module-page {
  max-width: 1180px;
}
.selected-pet-header,
.panel,
.trend-card,
.care-plan-card,
.log-detail-card,
.decision-card,
.file-card,
.reminder-card {
  border: 1px solid #e4ded3;
  border-radius: 8px;
  background: #fffdf9;
}
.selected-pet-header {
  padding: 18px;
  margin-bottom: 16px;
}
.pet-identity {
  display: flex;
  align-items: center;
  gap: 14px;
}
.pet-identity img,
.pet-identity > span {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  object-fit: cover;
  font-size: 24px;
}
.pet-identity h2 {
  margin-bottom: 4px;
  font-size: 28px;
}
.status-good {
  --el-tag-bg-color: #e7f6ec;
  --el-tag-text-color: #276342;
  --el-tag-border-color: #c7e5d1;
}
.status-warn {
  --el-tag-bg-color: #fff3df;
  --el-tag-text-color: #8a5715;
  --el-tag-border-color: #f2d3a5;
}
.status-neutral {
  --el-tag-bg-color: #eef1ef;
  --el-tag-text-color: #59645d;
  --el-tag-border-color: #d6ddd8;
}
.overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
  gap: 16px;
}
.panel {
  padding: 16px;
}
.recent-logs,
.quick-actions {
  grid-column: 1 / -1;
}
.task-list,
.timeline,
.reminder-list,
.file-grid {
  display: grid;
  gap: 10px;
}
.task-item {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 10px;
  align-items: start;
  border: 1px solid #e9e2d8;
  border-radius: 8px;
  background: #fbfaf7;
  padding: 10px;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.task-check svg {
  width: 20px;
  height: 20px;
  color: #2f624d;
}
.overdue,
.abnormal strong {
  color: #9a4d22;
}
.snapshot-grid,
.trend-row,
.decision-grid,
.file-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.snapshot-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.snapshot-grid div,
.trend-card {
  padding: 12px;
  border-radius: 8px;
  background: #f7f5f0;
}
.snapshot-grid span,
.trend-card span {
  display: block;
  margin-bottom: 8px;
  color: #69756c;
  font-size: 13px;
}
.snapshot-grid strong,
.trend-card strong {
  font-size: 20px;
}
.abnormal {
  background: #fff3df !important;
  border: 1px solid #f0cf9b;
}
.ai-insights ul,
.care-plan-card ul {
  padding-left: 18px;
}
.disclaimer {
  margin-bottom: 0;
  color: #756454;
  font-size: 13px;
}
.filter-chips,
.quick-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.filter-chips span {
  padding: 4px 9px;
  border-radius: 999px;
  background: #eef4ef;
  color: #47604f;
  font-size: 12px;
}
.timeline-card,
.log-detail-card,
.reminder-card {
  padding: 12px;
}
.timeline-card {
  border-left: 3px solid #9abca5;
  background: #fbfaf7;
  border-radius: 8px;
}
.quick-grid {
  margin-top: 12px;
}
.quick-grid button,
.decision-card {
  border: 1px solid #e4ded3;
  border-radius: 8px;
  background: #fbfaf7;
  padding: 12px;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.quick-grid button {
  min-width: 180px;
}
.module-toolbar {
  margin-bottom: 16px;
}
.module-toolbar h2 {
  margin-bottom: 6px;
}
.timeline.large {
  gap: 12px;
}
.log-detail-card header,
.reminder-card {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.log-detail-card p,
.reminder-card p {
  margin-bottom: 6px;
}
.care-plan-card {
  padding: 18px;
}
.plan-columns,
.vet-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.plan-columns section {
  padding: 12px;
  border-radius: 8px;
  background: #f8f5ef;
}
.warning-panel {
  background: #fff6eb;
  border-color: #efd3aa;
}
.warning-panel svg,
.decision-card svg,
.file-card svg {
  width: 24px;
  height: 24px;
  color: #2f624d;
}
.decision-card,
.file-card {
  display: grid;
  gap: 8px;
}
.reminder-card.done {
  opacity: 0.58;
}
.empty-copy,
.empty-state {
  color: #70796f;
}
.empty-state {
  padding: 22px;
  border: 1px dashed #d8d0c4;
  border-radius: 8px;
  background: #fffdf9;
}
.empty-state.compact {
  margin-top: 14px;
}
.copilot-panel {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 40;
  width: min(440px, 100vw);
  height: 100vh;
  display: grid;
  grid-template-rows: auto auto auto auto 1fr auto;
  gap: 12px;
  padding: 18px;
  background: #fffdf9;
  border-left: 1px solid #ded8cd;
  box-shadow: -18px 0 48px rgba(34, 39, 34, 0.14);
  transform: translateX(104%);
  transition: transform 180ms ease;
}
.copilot-panel.open {
  transform: translateX(0);
}
.copilot-header h2 {
  margin-bottom: 0;
}
.copilot-pet-context {
  display: grid;
  grid-template-columns: 42px 1fr;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border-radius: 8px;
  background: #edf7f0;
}
.pet-avatar-small {
  width: 36px;
  height: 36px;
  border-radius: 50%;
}
.copilot-chips,
.file-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.copilot-chips button {
  border: 1px solid #d9e2d9;
  border-radius: 999px;
  background: #f7fbf8;
  color: #385844;
  padding: 7px 10px;
  cursor: pointer;
}
.copilot-chips.templates button {
  background: #fff8ec;
}
.copilot-messages {
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}
.copilot-footer {
  border-top: 1px solid #e6ded3;
  padding-top: 10px;
}
.active-template {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  color: #2f624d;
  font-size: 13px;
}
.active-template button {
  border: 0;
  background: transparent;
  color: #2f624d;
  cursor: pointer;
}
.copilot-composer {
  flex: 1;
}
.mobile-topbar,
.mobile-bottom-nav,
.mobile-ai-fab {
  display: none;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.form-stack {
  display: grid;
  gap: 12px;
  margin-top: 12px;
}
label {
  display: grid;
  gap: 6px;
  color: #4e574f;
  font-size: 13px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
@media (max-width: 1060px) {
  .desktop-sidebar {
    display: none;
  }
  .app-shell {
    display: block;
    padding-bottom: 78px;
  }
  .mobile-topbar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 14px;
    background: rgba(255, 250, 243, 0.96);
    border-bottom: 1px solid #e1d9cf;
  }
  .mobile-pet-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid #d8e3d9;
    border-radius: 999px;
    background: #fff;
    padding: 6px 10px;
    color: inherit;
  }
  .mobile-pet-menu {
    position: absolute;
    top: 58px;
    left: 14px;
    right: 14px;
    display: grid;
    gap: 6px;
    padding: 10px;
    border: 1px solid #e4ded3;
    border-radius: 8px;
    background: #fffdf9;
    box-shadow: 0 12px 30px rgba(33, 37, 32, 0.12);
  }
  .mobile-pet-menu button {
    border: 0;
    border-radius: 8px;
    background: #f7f5f0;
    padding: 10px;
    text-align: left;
  }
  .content-shell {
    padding: 16px;
  }
  .page-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .page-actions {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .selected-pet-header,
  .module-toolbar,
  .log-detail-card header,
  .reminder-card {
    align-items: flex-start;
    flex-direction: column;
  }
  .overview-grid,
  .plan-columns,
  .vet-grid,
  .snapshot-grid,
  .trend-row,
  .decision-grid,
  .file-grid,
  .form-grid {
    grid-template-columns: 1fr;
  }
  .header-buttons {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr;
  }
  .mobile-bottom-nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 30;
    display: flex;
    gap: 4px;
    overflow-x: auto;
    padding: 8px;
    background: #fffdf9;
    border-top: 1px solid #ded8cd;
  }
  .mobile-bottom-nav button {
    min-width: 82px;
    display: grid;
    place-items: center;
    gap: 2px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #657067;
    padding: 6px 4px;
    font-size: 12px;
  }
  .mobile-bottom-nav button.active {
    background: #e9f5ed;
    color: #2f624d;
    font-weight: 700;
  }
  .mobile-bottom-nav svg {
    width: 20px;
    height: 20px;
  }
  .mobile-ai-fab {
    position: fixed;
    right: 16px;
    bottom: 86px;
    z-index: 31;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    border-radius: 999px;
    background: #2f624d;
    color: #fff;
    padding: 12px 14px;
    box-shadow: 0 10px 28px rgba(47, 98, 77, 0.28);
  }
  .mobile-ai-fab svg {
    width: 18px;
    height: 18px;
  }
  .copilot-panel {
    width: 100vw;
    border-left: 0;
  }
}
</style>
