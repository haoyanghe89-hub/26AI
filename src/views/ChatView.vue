<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ElButton from 'element-plus/es/components/button/index.mjs'
import ElDialog from 'element-plus/es/components/dialog/index.mjs'
import ElInput from 'element-plus/es/components/input/index.mjs'
import ElInputNumber from 'element-plus/es/components/input-number/index.mjs'
import ElSelect, { ElOption } from 'element-plus/es/components/select/index.mjs'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs'
import AppIcon from '../components/pet/AppIcon.vue'
import DesktopSidebar from '../components/pet/DesktopSidebar.vue'
import EmptyState from '../components/pet/EmptyState.vue'
import FeatureEntryCard from '../components/pet/FeatureEntryCard.vue'
import HomePage from '../components/pet/HomePage.vue'
import MobileTabBar from '../components/pet/MobileTabBar.vue'
import PetSwitcher from '../components/pet/PetSwitcher.vue'
import SettingsPanel from '../components/chat/SettingsPanel.vue'
import DailyCheckInScreen from '../components/pet/DailyCheckInScreen.vue'
import { useDailyCheckIn, type DailyCheckInMode } from '../composables/useDailyCheckIn'
import { parseMessageSegments } from '../lib/messageSegments'
import {
  messagePreviewContent,
  type CareReminder,
  type ChatMessage,
  type ChatSession,
  type HealthLog,
  type PetProfile,
  type PetSpecies,
  type ReminderType,
  useChatStore,
} from '../stores/chat'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'

type MobileTab = 'home' | 'log' | 'ai' | 'plan' | 'profile'
type DesktopModule =
  | 'overview'
  | 'records'
  | 'ai'
  | 'plan'
  | 'vet'
  | 'files'
  | 'memories'
  | 'products'
  | 'hospitals'
  | 'settings'
type RecordTab = 'quick' | 'timeline'
type QuickRecordField = 'appetite' | 'waterIntake' | 'poop' | 'vomiting' | 'mood'
type AiEntry = {
  title: string
  description: string
  icon: string
  prompt: string
  tone?: 'warm' | 'care' | 'ai'
}

const chat = useChatStore()
const auth = useAuthStore()
const ui = useUiStore()
const router = useRouter()
const dailyCheckIn = useDailyCheckIn()

const activeMobileTab = ref<MobileTab>('home')
const activeDesktopModule = ref<DesktopModule>('overview')
const aiDrawerOpen = ref(false)
const petDialogVisible = ref(false)
const reminderDialogVisible = ref(false)
const settingsVisible = ref(false)
const recordSaved = ref(false)
const activeRecordTab = ref<RecordTab>('quick')
const moreRecordFieldsOpen = ref(false)
const mobilePetSwitcherOpen = ref(false)
const aiInput = ref('')
const chatSearchOpen = ref(false)
const chatSearchQuery = ref('')
const moreMenuOpen = ref(false)
const chatShellReady = ref(false)
const previousMobileTabBeforeAi = ref<MobileTab>('home')
const messagesEl = ref<HTMLElement | null>(null)
const fileInputEl = ref<HTMLInputElement | null>(null)
const petAvatarInputEl = ref<HTMLInputElement | null>(null)
const recordPhotoName = ref('')
const petDraft = reactive(createEmptyPetDraft())
const quickLogDraft = reactive(createEmptyLogDraft())
const reminderDraft = reactive(createEmptyReminderDraft())

const mobileTabs: Array<{ id: MobileTab; label: string; icon: string }> = [
  { id: 'home', label: '首页', icon: 'home' },
  { id: 'log', label: '记录', icon: 'log' },
  { id: 'ai', label: 'AI', icon: 'ai' },
  { id: 'plan', label: '计划', icon: 'plan' },
  { id: 'profile', label: '我的', icon: 'profile' },
]

const desktopModules: Array<{ id: DesktopModule; label: string; hint: string; icon: string }> = [
  { id: 'overview', label: '总览', hint: '今日陪伴工作台', icon: 'home' },
  { id: 'records', label: '记录', hint: '健康与生活时间线', icon: 'log' },
  { id: 'ai', label: 'AI 助手', hint: 'PetExpert 咨询', icon: 'ai' },
  { id: 'plan', label: '护理计划', hint: '日程、提醒与食谱', icon: 'plan' },
  { id: 'memories', label: '回忆空间', hint: '照片和生活片段', icon: 'memory' },
  { id: 'settings', label: '设置', hint: '账户、模型与偏好', icon: 'settings' },
]

const aiPromptChips = [
  '今天适合和它玩什么？',
  '帮我写一段今日宠物日记',
  '新手训练“等待”怎么做？',
  '根据最近记录给今日护理建议',
  '生成本周陪伴回顾',
  '便便略软要怎么观察？',
]

const suggestionSets: Record<string, string[]> = {
  beginner: [
    '便便正常吗？',
    '今天怎么配餐？',
    '怎么训练社交？',
    '突然呕吐怎么办？',
    '第一次驱虫怎么安排？',
    '每天要玩多久？',
  ],
  intermediate: [
    '便便正常吗？',
    '今天怎么配餐？',
    '狗粮帮我对比',
    '最近健康趋势怎么样？',
    '怎么训练社交？',
    '突然呕吐怎么办？',
  ],
  advanced: [
    '体检报告帮我解释',
    '狗粮帮我对比',
    '导出近期记录摘要',
    '配餐怎么优化？',
    '健康风险帮我排查',
    '附近宠物医院',
  ],
  default: [
    '便便正常吗？',
    '今天怎么配餐？',
    '狗粮帮我对比',
    '怎么训练社交？',
    '附近宠物医院',
    '突然呕吐怎么办？',
  ],
}

const aiEntryCards: AiEntry[] = [
  {
    title: 'AI 配餐',
    description: '结合档案、体重、近期记录和口粮库生成餐次建议',
    icon: 'food',
    tone: 'warm',
    prompt:
      '请调用 Pet AI Orchestrator 为当前宠物生成 AI 配餐建议：结合 PetProfile、最近 7 天记录、当前口粮和口粮数据库，输出适用条件、每日估算、餐次拆分、观察点和需要咨询兽医的情况。',
  },
  {
    title: '口粮对比',
    description: '按成分、过敏、热量、价格和健康目标比较',
    icon: 'product',
    prompt:
      '请调用 Pet AI Orchestrator 做口粮对比：从结构化 FoodProduct 数据库中选择适合当前宠物的两款候选口粮，结合过敏、病史、体重、近期便便和健康目标输出对比与风险点。',
  },
  {
    title: '健康问答',
    description: '结合日志和 RAG 做风险分级与观察清单',
    icon: 'vet',
    tone: 'care',
    prompt:
      '请调用 Pet AI Orchestrator 做健康问答：结合当前宠物档案、最近 7 天健康/饮食/便便/体重/运动记录和 PetKnowledge RAG，进行风险分级、观察清单和就医边界说明。',
  },
  {
    title: '训练/行为建议',
    description: '按物种、年龄、精力和近期状态给训练方案',
    icon: 'ai',
    tone: 'ai',
    prompt:
      '请调用 Pet AI Orchestrator 给出训练/行为建议：结合当前宠物档案、活动水平、最近日志和训练/护理知识库，给出短时可执行步骤、奖励方式、注意事项和何时需要专业行为咨询。',
  },
]

const mockMemories = [
  { title: '阳台晒太阳', date: '05/25', note: '精神很好，主动玩逗猫棒' },
  { title: '第一次公园散步', date: '05/18', note: '遇到陌生狗狗时稍紧张' },
  { title: '换粮第 3 天', date: '05/14', note: '便便状态稳定' },
]

const mockHospitals = [
  { name: '安和宠物医院', distance: '1.8km', focus: '内科、影像、夜间急诊', phone: '021-0000-1024' },
  { name: '瑞宠动物诊疗中心', distance: '3.2km', focus: '猫科、皮肤科、齿科', phone: '021-0000-2048' },
  { name: '城市宠物急诊', distance: '5.6km', focus: '24 小时急诊、住院观察', phone: '021-0000-4096' },
]

const mockProducts = [
  { name: '低敏鸡肉配方主粮', fit: '适合肠胃敏感观察期', risk: '需确认鸡肉是否为过敏源' },
  { name: '自动喂食器', fit: '适合固定餐次和外出补喂', risk: '多宠家庭需关注识别能力' },
  { name: '宠物医疗险基础版', fit: '适合年轻健康宠物建立保障', risk: '等待期和既往症条款需细看' },
]

const quickRecordGroups: Array<{
  field: QuickRecordField
  title: string
  icon: string
  tone: 'food' | 'water' | 'poop' | 'care' | 'mood'
  options: Array<{ emoji: string; label: string; value: string; energyLevel?: number }>
}> = [
  {
    field: 'appetite',
    title: '食欲',
    icon: '🦴',
    tone: 'food',
    options: [
      { emoji: '😋', label: '干饭王', value: '干饭王', energyLevel: 5 },
      { emoji: '🙂', label: '正常吃', value: '正常' },
      { emoji: '🙁', label: '剩一点', value: '少量进食' },
      { emoji: '🥺', label: '没胃口', value: '没胃口', energyLevel: 2 },
    ],
  },
  {
    field: 'waterIntake',
    title: '饮水',
    icon: '💧',
    tone: 'water',
    options: [
      { emoji: '💧', label: '喝很多', value: '偏多' },
      { emoji: '👍', label: '正常', value: '正常' },
      { emoji: '📉', label: '喝得少', value: '偏少' },
      { emoji: '🏜️', label: '没怎么喝', value: '几乎没喝' },
    ],
  },
  {
    field: 'poop',
    title: '便便',
    icon: '〽️',
    tone: 'poop',
    options: [
      { emoji: '💩', label: '完美', value: '成形' },
      { emoji: '🍦', label: '略软', value: '略软' },
      { emoji: '💦', label: '拉稀', value: '拉稀' },
      { emoji: '🩸', label: '需要注意', value: '异常/带血' },
    ],
  },
  {
    field: 'vomiting',
    title: '呕吐',
    icon: '✚',
    tone: 'care',
    options: [
      { emoji: '✅', label: '没有', value: '无' },
      { emoji: '🤢', label: '一次', value: '一次' },
      { emoji: '⚠️', label: '多次', value: '多次', energyLevel: 2 },
      { emoji: '📸', label: '已拍照', value: '有呕吐，已留照片' },
    ],
  },
  {
    field: 'mood',
    title: '精神',
    icon: '✨',
    tone: 'mood',
    options: [
      { emoji: '🤩', label: '超活跃', value: '活跃', energyLevel: 5 },
      { emoji: '😌', label: '平稳', value: '平稳', energyLevel: 4 },
      { emoji: '😴', label: '有点困', value: '嗜睡', energyLevel: 3 },
      { emoji: '😟', label: '不太对劲', value: '异常', energyLevel: 2 },
    ],
  },
]

const activeDesktopMeta = computed(
  () => desktopModules.find((item) => item.id === activeDesktopModule.value) || desktopModules[0],
)
const activePet = computed(() => chat.activePet)
const activePetSummary = computed(() => {
  const pet = activePet.value
  if (!pet) return '先建立宠物档案'
  return [
    speciesLabel(pet.species),
    pet.breed,
    pet.ageLabel || pet.birthday,
    pet.weightKg ? `${pet.weightKg}kg` : '体重待补充',
  ]
    .filter(Boolean)
    .join(' · ')
})
const latestLog = computed(() => chat.activePetHealthLogs[0] || null)
const recentLogs = computed(() => chat.activePetHealthLogs.slice(0, 6))
const todayKey = computed(() => localDateKey(new Date()))
const pendingTasks = computed(() => chat.activePetReminders.filter((task) => task.status !== 'done'))
const upcomingTasks = computed(() => pendingTasks.value.slice(0, 6))
const hasTodayLog = computed(() =>
  latestLog.value ? localDateKey(latestLog.value.loggedAt) === todayKey.value : false,
)
const companionDays = computed(() => {
  const pet = activePet.value
  const start = pet?.birthday || pet?.createdAt
  if (!start) return 1
  const diff = Date.now() - new Date(start).getTime()
  return Math.max(1, Math.floor(diff / 86_400_000) + 1)
})
const checkInSummary = computed(() => dailyCheckIn.getSummary(chat.activePetId, companionDays.value))
const carePreferenceLabel = computed(() => {
  const map = {
    beginner: '刚开始养宠',
    intermediate: '已经比较熟悉',
    advanced: '资深养宠人',
  }
  return map[auth.careExperienceLevel]
})
const shouldShowCheckIn = computed(() => {
  if (activeMobileTab.value !== 'home' || activeDesktopModule.value !== 'overview') return false
  if (!activePet.value) return true
  return !checkInSummary.value.checkedIn
})
const aiInsight = computed(() => {
  const log = latestLog.value
  if (!log)
    return '今天先留下一条小记录吧。食欲、饮水、便便和精神状态越完整，PetExpert 越能给出贴近日常的陪伴建议。'
  if (log.vomiting && !/无|没有|正常/.test(log.vomiting)) {
    return '最近记录里出现呕吐。建议记录发生时间、次数、呕吐物状态和食欲变化；如 24 小时内重复发生或精神变差，请联系兽医。'
  }
  if (log.waterIntake.includes('少')) return '最近饮水偏少，可以检查水碗位置和新鲜度，同时观察尿量变化。'
  return `最近一次记录显示食欲 ${log.appetite}、便便 ${log.poop}、精神 ${log.energyLevel}/5。今天适合完成一个轻量互动，再补一条可爱瞬间。`
})
const canSendAi = computed(
  () =>
    chat.isProviderReady &&
    !chat.isSending &&
    (aiInput.value.trim().length > 0 || chat.pendingFiles.length > 0),
)
const activePetName = computed(() => activePet.value?.name || '宝贝')
const chatPlaceholder = computed(() =>
  chatShellReady.value ? `描述${activePetName.value}的情况，或问我怎么照看它...` : '问问 AI',
)
const aiSuggestions = computed(() => {
  const level = auth.careExperienceLevel || 'default'
  return suggestionSets[level] || suggestionSets.default
})
const chatHistoryItems = computed(() =>
  chat.sessions.map(toHistoryItem).filter((item) => item.messageCount > 0),
)
const filteredChatHistoryItems = computed(() => {
  const query = chatSearchQuery.value.trim().toLowerCase()
  if (!query) return chatHistoryItems.value
  return chatHistoryItems.value.filter((item) =>
    [item.title, item.petName, item.lastMessage, item.timeText, item.tags.join(' ')]
      .join(' ')
      .toLowerCase()
      .includes(query),
  )
})
const hasActiveConversationContent = computed(
  () => Boolean(aiInput.value.trim()) || Boolean(chat.activeSession?.messages?.length),
)

let chatReadyTimer: number | null = null

watch(
  () => chat.visibleMessages.length,
  () => scrollAiMessages(),
)

watch(
  activeMobileTab,
  (tab, previous) => {
    if (tab === 'ai') {
      if (previous !== 'ai') previousMobileTabBeforeAi.value = previous || 'home'
      startChatOpening()
      return
    }
    chatSearchOpen.value = false
    moreMenuOpen.value = false
    chatShellReady.value = false
    ui.leaveChatImmersive()
  },
  { immediate: true },
)

watch(chatSearchOpen, (open) => {
  ui.setActiveOverlay(open ? 'chat-search' : null)
  if (!open) chatSearchQuery.value = ''
})

watch(
  () => router.currentRoute.value.query.tab,
  (tab) => {
    if (tab === 'ai') {
      if (activeMobileTab.value !== 'ai') {
        previousMobileTabBeforeAi.value = activeMobileTab.value
        activeMobileTab.value = 'ai'
        activeDesktopModule.value = 'ai'
      }
      return
    }
    if (activeMobileTab.value === 'ai') closeImmersiveChat(false)
  },
)

onMounted(async () => {
  await auth.hydrate()
  await chat.hydrateClientState(auth.currentUser?.id || '')
  await chat.refreshProviderServerConfig()
  await chat.refreshLocalModels()
  applyLaunchTab()
  window.addEventListener('popstate', handleSystemBack)
})

onBeforeUnmount(() => {
  if (chatReadyTimer) window.clearTimeout(chatReadyTimer)
  window.removeEventListener('popstate', handleSystemBack)
  ui.leaveChatImmersive()
})

watch(
  () => auth.currentUser?.id || '',
  async (userId) => {
    await chat.hydrateClientState(userId)
  },
)

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

function openPetDialog(pet?: PetProfile) {
  resetObject(petDraft, pet ? { ...pet } : createEmptyPetDraft())
  petDialogVisible.value = true
}

function savePet() {
  if (!String(petDraft.name || '').trim()) {
    ElMessage.warning('请填写宠物名字')
    return
  }
  const pet = chat.savePetProfile({ ...petDraft })
  chat.setActivePet(pet.id)
  petDialogVisible.value = false
  ElMessage.success('宠物档案已保存')
}

function saveQuickLog(payload?: Partial<HealthLog>) {
  const log = chat.addHealthLog({ ...(payload || quickLogDraft), petId: chat.activePetId })
  if (!log) return
  if (!payload) resetObject(quickLogDraft, createEmptyLogDraft())
  recordPhotoName.value = ''
  recordSaved.value = true
  window.setTimeout(() => (recordSaved.value = false), 1800)
  ElMessage.success(payload ? '已记录，今天也有好好关注它' : '今日记录已保存')
}

function selectQuickLogOption(field: QuickRecordField, option: { value: string; energyLevel?: number }) {
  quickLogDraft[field] = option.value
  if (option.energyLevel) quickLogDraft.energyLevel = option.energyLevel
}

function isQuickLogOptionSelected(field: QuickRecordField, value: string) {
  return quickLogDraft[field] === value
}

function openReminderDialog() {
  resetObject(reminderDraft, createEmptyReminderDraft())
  reminderDialogVisible.value = true
}

function saveReminder() {
  if (!String(reminderDraft.title || '').trim()) {
    ElMessage.warning('请填写提醒标题')
    return
  }
  const dueAt = reminderDraft.dueAt
    ? new Date(String(reminderDraft.dueAt)).toISOString()
    : new Date().toISOString()
  chat.saveCareReminder({ ...reminderDraft, petId: chat.activePetId, dueAt })
  reminderDialogVisible.value = false
  ElMessage.success('提醒已创建')
}

function generateCarePlan() {
  const plan = chat.generateCarePlanForActivePet()
  if (plan) {
    activeMobileTab.value = 'plan'
    activeDesktopModule.value = 'plan'
    ElMessage.success('护理计划已生成')
  }
}

function completeDailyCheckIn(mode: DailyCheckInMode) {
  if (!chat.activePetId) return
  dailyCheckIn.completeCheckIn(chat.activePetId, companionDays.value, mode)
  activeMobileTab.value = 'home'
  activeDesktopModule.value = 'overview'
}

function startChatOpening() {
  ensurePetExpertProvider()
  ui.enterChatImmersive()
  chatShellReady.value = false
  if (chatReadyTimer) window.clearTimeout(chatReadyTimer)
  chatReadyTimer = window.setTimeout(() => {
    chatShellReady.value = true
    scrollAiMessages()
  }, 260)
}

function setMobileTab(tab: MobileTab) {
  if (tab === activeMobileTab.value) return
  if (tab === 'ai') {
    openAi()
    return
  }
  activeMobileTab.value = tab
  if (tab === 'log') activeDesktopModule.value = 'records'
  if (tab === 'plan') activeDesktopModule.value = 'plan'
  if (tab === 'home') activeDesktopModule.value = 'overview'
}

function openAi(prompt = '') {
  ensurePetExpertProvider()
  if (prompt) aiInput.value = prompt
  if (activeMobileTab.value !== 'ai') previousMobileTabBeforeAi.value = activeMobileTab.value
  activeMobileTab.value = 'ai'
  activeDesktopModule.value = 'ai'
  aiDrawerOpen.value = true
  if (router.currentRoute.value.query.tab !== 'ai') {
    void router.push({ name: 'chat', query: { ...router.currentRoute.value.query, tab: 'ai' } })
  }
  nextTick(() => {
    scrollAiMessages()
  })
}

function closeImmersiveChat(syncRoute = true) {
  if (chatSearchOpen.value) {
    chatSearchOpen.value = false
    return
  }
  const activeElement = document.activeElement as HTMLElement | null
  if (activeElement && ['INPUT', 'TEXTAREA'].includes(activeElement.tagName)) {
    activeElement.blur()
    return
  }
  moreMenuOpen.value = false
  activeMobileTab.value = previousMobileTabBeforeAi.value === 'ai' ? 'home' : previousMobileTabBeforeAi.value
  activeDesktopModule.value =
    activeMobileTab.value === 'log' ? 'records' : activeMobileTab.value === 'plan' ? 'plan' : 'overview'
  if (syncRoute && router.currentRoute.value.query.tab === 'ai') {
    const query = { ...router.currentRoute.value.query }
    delete query.tab
    void router.replace({ name: 'chat', query })
  }
}

function handleSystemBack() {
  if (chatSearchOpen.value) {
    chatSearchOpen.value = false
  }
}

function openCarePreferenceOnboarding() {
  settingsVisible.value = false
  mobilePetSwitcherOpen.value = false
  router.push({ name: 'careExperienceOnboarding' })
}

async function sendAi() {
  ensurePetExpertProvider()
  const content = aiInput.value.trim()
  aiInput.value = ''
  const sent = await chat.sendMessage(content)
  if (!sent) {
    aiInput.value = content
    ElMessage.warning('请先确认 PetExpert AI 的模型配置可用')
  }
}

async function startNewChat() {
  moreMenuOpen.value = false
  if (hasActiveConversationContent.value) {
    try {
      await ElMessageBox.confirm('当前内容会保存在历史里。', '开始新的对话？', {
        confirmButtonText: '开始新对话',
        cancelButtonText: '取消',
        type: 'warning',
      })
    } catch {
      return
    }
  }
  chat.newSession()
  aiInput.value = ''
  await nextTick()
  scrollAiMessages()
}

function openChatSearch() {
  moreMenuOpen.value = false
  chatSearchOpen.value = true
  nextTick(() => document.querySelector<HTMLInputElement>('.ai-chat-search-input')?.focus())
}

function useSuggestion(prompt: string) {
  aiInput.value = prompt
  void sendAi()
}

function openHistorySession(id: string) {
  chat.setActiveSession(id)
  chatSearchOpen.value = false
  nextTick(scrollAiMessages)
}

async function runAiFlow(prompt: string, module?: DesktopModule) {
  if (module) activeDesktopModule.value = module
  openAi(prompt)
}

function ensurePetExpertProvider() {
  if (chat.selectedProviderId !== 'pet_expert') chat.setProvider('pet_expert')
}

function applyLaunchTab() {
  const tab = String(router.currentRoute.value.query.tab || '')
  if (tab === 'ai') {
    activeMobileTab.value = 'ai'
    activeDesktopModule.value = 'ai'
  }
  if (tab === 'log') {
    activeMobileTab.value = 'log'
    activeDesktopModule.value = 'records'
  }
}

async function handleFiles(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files || [])
  ;(event.target as HTMLInputElement).value = ''
  if (!files.length) return
  await chat.prepareFiles(files)
  openAi('请解释我上传的宠物资料或检查报告，并整理对当前宠物档案、护理计划和就医准备有用的信息。')
}

async function handlePetAvatar(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (!file) return
  petDraft.avatarUrl = await readFileAsDataUrl(file)
}

function handleRecordPhoto(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  recordPhotoName.value = file?.name || ''
  if (file) ElMessage.success('图片已作为本次记录素材占位，后续可关联到资料库')
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function messageText(message: ChatMessage) {
  return typeof message.content === 'string' ? message.content : messagePreviewContent(message.content)
}

function messageSegments(message: ChatMessage) {
  return parseMessageSegments(message.content)
}

function toHistoryItem(session: ChatSession) {
  const messages = session.messages || []
  const lastMessage = [...messages].reverse().find((message) => messageText(message).trim())
  const fallbackTitle = messages[0] ? messageText(messages[0]).slice(0, 12) : '和 AI 的新对话'
  const summary = session.summary?.content || ''
  return {
    id: session.id,
    title: safeText(session.title, fallbackTitle || '和 AI 的新对话'),
    petName: activePet.value?.name || '当前宠物',
    lastMessage: safeText(lastMessage ? messageText(lastMessage) : summary, '还没有摘要'),
    timeText: formatChatTime(session.updatedAt || session.createdAt),
    tags: (session.tags || []).filter(Boolean).slice(0, 3),
    messageCount: messages.length,
  }
}

function safeText(value: unknown, fallback = '') {
  const text = String(value ?? '').trim()
  if (!text || text === 'undefined' || text === 'null' || text === 'NaN') return fallback
  return text
}

function formatChatTime(value?: string) {
  if (!value) return '刚刚'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '刚刚'
  const today = localDateKey(new Date())
  const target = localDateKey(date)
  const yesterdayDate = new Date()
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  if (target === today) {
    return `今天 ${new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)}`
  }
  if (target === localDateKey(yesterdayDate)) return '昨天'
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(date)
}

function scrollAiMessages() {
  nextTick(() => {
    if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  })
}

function speciesLabel(value?: PetSpecies) {
  if (value === 'dog') return '狗狗'
  if (value === 'cat') return '猫咪'
  return '其他宠物'
}

function reminderTypeLabel(value?: ReminderType) {
  const map: Record<ReminderType, string> = {
    feeding: '喂食',
    water: '饮水',
    deworming: '驱虫',
    vaccination: '疫苗',
    grooming: '美容',
    medication: '用药',
    vet_follow_up: '复诊',
    other: '其他',
  }
  return value ? map[value] : '其他'
}

function formatDate(value?: string) {
  if (!value) return '待定'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatDay(value?: string) {
  if (!value) return '今天'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).format(new Date(value))
}

function localDateKey(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

async function logout() {
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <main class="pet-product">
    <input ref="fileInputEl" type="file" multiple class="sr-only" @change="handleFiles" />

    <DailyCheckInScreen
      v-if="shouldShowCheckIn"
      :pet="activePet"
      :companion-days="companionDays"
      :streak-count="checkInSummary.streakCount"
      @complete="completeDailyCheckIn"
      @add-pet="openPetDialog()"
    />

    <template v-else>
      <section class="mobile-app" :class="{ 'is-chat-immersive': ui.isChatImmersive }">
        <header class="mobile-header" :class="{ 'is-hidden': ui.isAppHeaderHidden }">
          <div class="mobile-header-row">
            <button
              class="pet-context-button"
              type="button"
              @click="mobilePetSwitcherOpen = !mobilePetSwitcherOpen"
            >
              <img v-if="activePet?.avatarUrl" :src="activePet.avatarUrl" alt="" />
              <span v-else>{{ activePet?.name?.slice(0, 1) || '宠' }}</span>
              <strong>{{ activePet?.name || '选择宠物' }}</strong>
            </button>
            <button class="icon-button" type="button" aria-label="打开 AI 宠物管家" @click="openAi()">
              <AppIcon name="ai" />
            </button>
          </div>
          <PetSwitcher
            v-if="mobilePetSwitcherOpen"
            :pets="chat.pets"
            :active-pet-id="chat.activePetId"
            @select-pet="
              (id) => {
                chat.setActivePet(id)
                mobilePetSwitcherOpen = false
              }
            "
            @add-pet="openPetDialog()"
          />
        </header>

        <div class="mobile-scroll app-scroll" :class="{ 'is-chat-immersive': ui.isChatImmersive }">
          <section v-if="activeMobileTab === 'home'" class="screen-stack">
            <HomePage
              mode="mobile"
              :pets="chat.pets"
              :active-pet="activePet"
              :active-pet-id="chat.activePetId"
              :active-pet-summary="activePetSummary"
              :companion-days="companionDays"
              :latest-log="latestLog"
              :recent-logs="recentLogs"
              :has-today-log="hasTodayLog"
              :ai-insight="aiInsight"
              :check-in-summary="checkInSummary"
              :care-experience-level="auth.careExperienceLevel"
              @select-pet="chat.setActivePet"
              @add-pet="openPetDialog()"
              @toggle-care-task="chat.toggleCareReminderDone"
              @save-record="(payload) => saveQuickLog(payload)"
              @open-ai="(prompt) => openAi(prompt)"
              @generate-plan="generateCarePlan"
              @open-records="activeMobileTab = 'log'"
            />
          </section>

          <section v-else-if="activeMobileTab === 'log'" class="record-page">
            <article class="record-hero-card">
              <h1>记录今天</h1>
              <div class="record-tabs" role="tablist" aria-label="记录视图">
                <button
                  type="button"
                  :class="{ active: activeRecordTab === 'quick' }"
                  @click="activeRecordTab = 'quick'"
                >
                  快速记录
                </button>
                <button
                  type="button"
                  :class="{ active: activeRecordTab === 'timeline' }"
                  @click="activeRecordTab = 'timeline'"
                >
                  时间线
                </button>
              </div>
            </article>

            <template v-if="activeRecordTab === 'quick'">
              <p class="record-subtitle">记录一下 {{ activePet?.name || '宠物' }} 今天的状态吧～</p>
              <section class="record-quick-stack">
                <article v-for="group in quickRecordGroups" :key="group.field" class="record-choice-card">
                  <header>
                    <span :class="`tone-${group.tone}`">{{ group.icon }}</span>
                    <h2>{{ group.title }}</h2>
                  </header>
                  <div class="record-option-grid">
                    <button
                      v-for="option in group.options"
                      :key="option.value"
                      type="button"
                      :class="{ active: isQuickLogOptionSelected(group.field, option.value) }"
                      @click="selectQuickLogOption(group.field, option)"
                    >
                      <strong>{{ option.emoji }}</strong>
                      <span>{{ option.label }}</span>
                    </button>
                  </div>
                </article>
              </section>

              <button
                class="record-more-button"
                type="button"
                :aria-expanded="moreRecordFieldsOpen"
                @click="moreRecordFieldsOpen = !moreRecordFieldsOpen"
              >
                <AppIcon name="log" />
                {{ moreRecordFieldsOpen ? '收起护理笔记' : '更多护理笔记' }}
              </button>

              <article v-if="moreRecordFieldsOpen" class="app-card log-form record-extra-form">
                <div class="form-grid">
                  <label>精神<el-input-number v-model="quickLogDraft.energyLevel" :min="1" :max="5" /></label>
                  <label
                    >体重 kg<el-input-number v-model="quickLogDraft.weightKg" :min="0" :precision="2"
                  /></label>
                </div>
                <label
                  >症状<el-input v-model="quickLogDraft.symptoms" placeholder="咳嗽、打喷嚏、皮肤红点等"
                /></label>
                <label
                  >用药 / 美容<el-input v-model="quickLogDraft.medication" placeholder="药名、剂量或护理项目"
                /></label>
                <label
                  >备注<el-input
                    v-model="quickLogDraft.notes"
                    type="textarea"
                    :rows="3"
                    placeholder="饮食变化、异常行为、照片说明..."
                /></label>
                <label class="photo-upload">
                  <input type="file" accept="image/*" @change="handleRecordPhoto" />
                  <AppIcon name="upload" />
                  <span>{{ recordPhotoName || '添加便便、呕吐物、皮肤或报告照片占位' }}</span>
                </label>
              </article>

              <div class="sticky-save record-save-bar">
                <span v-if="recordSaved">已保存到时间线</span>
                <el-button type="primary" size="large" @click="() => saveQuickLog()">保存今日记录</el-button>
              </div>
            </template>

            <section v-else class="section-block">
              <div v-if="recentLogs.length" class="timeline">
                <article v-for="log in recentLogs" :key="log.id" class="timeline-card">
                  <time>{{ formatDay(log.loggedAt) }}</time>
                  <strong>食欲 {{ log.appetite }} · 精神 {{ log.energyLevel }}/5</strong>
                  <p>饮水 {{ log.waterIntake }} · 便便 {{ log.poop }} · 呕吐 {{ log.vomiting }}</p>
                  <small v-if="log.symptoms || log.notes">{{ log.symptoms || log.notes }}</small>
                </article>
              </div>
              <EmptyState
                v-else
                icon="log"
                title="还没有记录"
                description="第一次记录会成为 PetExpert 后续建议的基础。"
              />
            </section>
          </section>

          <section
            v-else-if="activeMobileTab === 'ai'"
            class="ai-chat-shell"
            :class="{ 'is-ready': chatShellReady }"
            :aria-busy="chat.isSending"
          >
            <header class="ai-chat-header ai-chat-card-reveal">
              <button
                class="ai-chat-icon-button ai-chat-back"
                type="button"
                aria-label="返回"
                @click="closeImmersiveChat()"
              >
                <AppIcon name="back" />
              </button>
              <div class="ai-chat-title">
                <strong>AI 宠物管家</strong>
                <span>正在陪你照看{{ activePetName }}</span>
              </div>
              <div class="ai-chat-actions">
                <button
                  class="ai-chat-text-button"
                  type="button"
                  aria-label="开始新对话"
                  @click="startNewChat"
                >
                  新对话
                </button>
                <button
                  class="ai-chat-icon-button"
                  type="button"
                  aria-label="搜索历史"
                  @click="openChatSearch"
                >
                  <AppIcon name="search" />
                </button>
                <button
                  class="ai-chat-icon-button ai-chat-more"
                  type="button"
                  aria-label="更多"
                  @click="moreMenuOpen = !moreMenuOpen"
                >
                  <AppIcon name="more" />
                </button>
                <div v-if="moreMenuOpen" class="ai-chat-more-menu">
                  <button type="button" @click="startNewChat">新对话</button>
                  <button type="button" @click="openChatSearch">搜索历史</button>
                  <button type="button" @click="aiInput = ''">清空当前输入</button>
                </div>
              </div>
            </header>

            <section class="ai-chat-context ai-chat-card-reveal">
              <AppIcon name="ai" />
              <div>
                <strong>{{ activePet?.name || '当前宠物' }} · PetExpert 在线</strong>
                <p>{{ aiInsight }}</p>
              </div>
            </section>

            <main ref="messagesEl" class="ai-chat-messages ai-chat-card-reveal" aria-live="polite">
              <section v-if="!chat.visibleMessages.length" class="ai-chat-empty">
                <span><AppIcon name="ai" :size="24" /></span>
                <h1>想问{{ activePetName }}的什么事？</h1>
                <p>我可以帮你看症状、配餐、训练、狗粮对比和突发情况。</p>
                <div class="ai-chat-suggestions">
                  <button
                    v-for="chip in aiSuggestions"
                    :key="chip"
                    type="button"
                    @click="useSuggestion(chip)"
                  >
                    {{ chip }}
                  </button>
                </div>
                <small>紧急症状请及时联系宠物医院，AI 建议不能替代兽医诊断。</small>
              </section>
              <template v-else>
                <article
                  v-for="message in chat.visibleMessages"
                  :key="message.id"
                  class="message-card"
                  :class="message.role"
                >
                  <strong>{{ message.role === 'assistant' ? 'PetExpert AI' : '我' }}</strong>
                  <template v-if="message.role === 'assistant'">
                    <template v-for="(segment, index) in messageSegments(message)" :key="index">
                      <div
                        v-if="segment.type === 'text'"
                        class="message-content"
                        v-html="segment.content"
                      ></div>
                      <pre v-else class="message-code-block"><code>{{ segment.content }}</code></pre>
                    </template>
                  </template>
                  <p v-else>{{ messageText(message) }}</p>
                </article>
                <div v-if="chat.isSending" class="ai-chat-loading">
                  <span>正在查看{{ activePetName }}的记录...</span>
                  <i></i><i></i><i></i>
                </div>
              </template>
            </main>

            <footer class="ai-chat-composer ai-composer-expand">
              <button
                class="ai-chat-icon-button"
                type="button"
                aria-label="上传资料"
                @click="fileInputEl?.click()"
              >
                <AppIcon name="upload" />
              </button>
              <el-input
                v-model="aiInput"
                class="ai-composer"
                type="textarea"
                resize="none"
                :autosize="{ minRows: 1, maxRows: 4 }"
                :placeholder="chatPlaceholder"
                @keydown.enter.exact.prevent="sendAi"
              />
              <button
                class="ai-chat-send"
                type="button"
                :disabled="!canSendAi"
                aria-label="发送"
                @click="sendAi"
              >
                <AppIcon name="send" />
              </button>
            </footer>

            <Transition name="ai-search-sheet">
              <section v-if="chatSearchOpen" class="ai-chat-search-sheet" role="dialog" aria-modal="true">
                <header>
                  <button
                    class="ai-chat-icon-button"
                    type="button"
                    aria-label="关闭搜索"
                    @click="chatSearchOpen = false"
                  >
                    <AppIcon name="back" />
                  </button>
                  <input
                    v-model="chatSearchQuery"
                    class="ai-chat-search-input"
                    type="search"
                    placeholder="搜索历史对话"
                  />
                  <button type="button" @click="chatSearchOpen = false">取消</button>
                </header>
                <main>
                  <h2>{{ chatSearchQuery ? '搜索结果' : '最近对话' }}</h2>
                  <div v-if="filteredChatHistoryItems.length" class="ai-chat-history-list">
                    <button
                      v-for="item in filteredChatHistoryItems"
                      :key="item.id"
                      class="ai-chat-history-item"
                      type="button"
                      @click="openHistorySession(item.id)"
                    >
                      <div>
                        <strong>{{ item.title }}</strong>
                        <span>{{ item.petName }} · {{ item.timeText }} · {{ item.messageCount }} 条</span>
                      </div>
                      <p>{{ item.lastMessage }}</p>
                      <small v-if="item.tags.length">{{ item.tags.join(' · ') }}</small>
                    </button>
                  </div>
                  <section v-else class="ai-chat-search-empty">
                    <AppIcon name="search" />
                    <strong>还没有找到相关对话</strong>
                    <p>换个关键词试试</p>
                  </section>
                </main>
              </section>
            </Transition>
          </section>

          <section v-else-if="activeMobileTab === 'plan'" class="screen-stack">
            <div class="screen-heading">
              <p class="eyebrow">护理计划</p>
              <h1>把照护变成稳定习惯</h1>
            </div>
            <article class="app-card calendar-card">
              <div v-for="day in ['一', '二', '三', '四', '五', '六', '日']" :key="day" class="day-pill">
                <span>{{ day }}</span>
                <b></b>
              </div>
            </article>
            <section class="section-block">
              <div class="section-title">
                <h2>护理日程</h2>
                <button type="button" @click="openReminderDialog">新增</button>
              </div>
              <div v-if="upcomingTasks.length" class="reminder-stack">
                <article
                  v-for="task in upcomingTasks"
                  :key="task.id"
                  class="reminder-card"
                  :class="{ done: task.status === 'done' }"
                >
                  <span><AppIcon :name="task.type === 'feeding' ? 'food' : 'reminder'" /></span>
                  <div>
                    <strong>{{ task.title }}</strong>
                    <p>
                      {{ formatDate(task.dueAt) }} · {{ reminderTypeLabel(task.type) }} · {{ task.repeat }}
                    </p>
                  </div>
                  <button type="button" @click="chat.toggleCareReminderDone(task.id)">
                    {{ task.status === 'done' ? '恢复' : '完成' }}
                  </button>
                </article>
              </div>
              <EmptyState
                v-else
                icon="plan"
                title="还没有护理提醒"
                description="添加喂食、驱虫、疫苗、美容、用药或复诊提醒。"
              />
            </section>
            <article class="app-card care-plan-card">
              <div class="section-title">
                <h2>喂养与护理计划</h2>
                <button type="button" @click="generateCarePlan">AI 生成</button>
              </div>
              <template v-if="chat.activePetCarePlan">
                <p>{{ chat.activePetCarePlan.summary }}</p>
                <ul>
                  <li v-for="item in chat.activePetCarePlan.feeding.slice(0, 3)" :key="item">{{ item }}</li>
                </ul>
              </template>
              <p v-else>点击生成后，会结合档案、体重、过敏和最近日志创建第一版计划。</p>
            </article>
          </section>

          <section v-else class="screen-stack">
            <div class="screen-heading">
              <p class="eyebrow">宠物家庭中心</p>
              <h1>我的宠物与资料</h1>
            </div>
            <section class="pet-family-list">
              <article
                v-for="pet in chat.pets"
                :key="pet.id"
                class="profile-pet-card"
                @click="openPetDialog(pet)"
              >
                <img v-if="pet.avatarUrl" :src="pet.avatarUrl" alt="" />
                <span v-else>{{ pet.name.slice(0, 1) }}</span>
                <div>
                  <strong>{{ pet.name }}</strong>
                  <p>
                    {{ speciesLabel(pet.species) }} · {{ pet.breed || '品种待补充' }} ·
                    {{ pet.weightKg || '待补充' }}kg
                  </p>
                </div>
              </article>
              <button class="add-pet-card" type="button" @click="openPetDialog()">
                <AppIcon name="plus" /> 添加宠物
              </button>
            </section>
            <section class="profile-entry-grid">
              <FeatureEntryCard
                icon="file"
                title="资料库"
                description="报告、疫苗、发票、保险"
                @click="activeDesktopModule = 'files'"
              />
              <FeatureEntryCard
                icon="memory"
                title="回忆空间"
                description="照片、成长和生活片段"
                tone="warm"
                @click="activeDesktopModule = 'memories'"
              />
              <FeatureEntryCard
                icon="hospital"
                title="常用医院"
                description="附近医院与急诊电话"
                tone="care"
                @click="activeDesktopModule = 'hospitals'"
              />
              <FeatureEntryCard
                icon="product"
                title="收藏商品"
                description="口粮、用品和保险方案"
                @click="activeDesktopModule = 'products'"
              />
              <FeatureEntryCard
                icon="heart"
                title="养宠偏好"
                :description="carePreferenceLabel"
                tone="warm"
                @click="openCarePreferenceOnboarding"
              />
              <FeatureEntryCard
                icon="ai"
                title="会员权益"
                description="高级咨询、报告解释、家庭共享"
                tone="ai"
              />
              <FeatureEntryCard
                icon="settings"
                title="设置"
                description="账户、模型和通知偏好"
                @click="settingsVisible = true"
              />
            </section>
          </section>
        </div>

        <MobileTabBar
          :tabs="mobileTabs"
          :active-tab="activeMobileTab"
          :hidden="ui.isTabBarHidden"
          @update:active-tab="(tab) => setMobileTab(tab as MobileTab)"
        />
      </section>

      <section class="desktop-workspace">
        <DesktopSidebar
          :modules="desktopModules"
          :active-module="activeDesktopModule"
          :pets="chat.pets"
          :active-pet-id="chat.activePetId"
          @update:active-module="(module) => (activeDesktopModule = module as DesktopModule)"
          @select-pet="chat.setActivePet"
          @add-pet="openPetDialog()"
          @open-settings="settingsVisible = true"
        />
        <main class="desktop-main">
          <header class="desktop-header">
            <div>
              <p class="eyebrow">Pet AI Manager</p>
              <h1>{{ activeDesktopMeta.label }}</h1>
              <span>{{ activeDesktopMeta.hint }}</span>
            </div>
            <div class="desktop-actions">
              <el-button @click="activeDesktopModule = 'records'">记录今天</el-button>
              <el-button type="primary" @click="openAi()">PetExpert AI</el-button>
            </div>
          </header>

          <section v-if="activeDesktopModule === 'overview'" class="desktop-home-overview">
            <HomePage
              mode="desktop"
              :pets="chat.pets"
              :active-pet="activePet"
              :active-pet-id="chat.activePetId"
              :active-pet-summary="activePetSummary"
              :companion-days="companionDays"
              :latest-log="latestLog"
              :recent-logs="recentLogs"
              :has-today-log="hasTodayLog"
              :ai-insight="aiInsight"
              :check-in-summary="checkInSummary"
              :care-experience-level="auth.careExperienceLevel"
              @select-pet="chat.setActivePet"
              @add-pet="openPetDialog()"
              @toggle-care-task="chat.toggleCareReminderDone"
              @save-record="(payload) => saveQuickLog(payload)"
              @open-ai="(prompt) => openAi(prompt)"
              @generate-plan="generateCarePlan"
              @open-records="activeDesktopModule = 'records'"
            />
          </section>

          <section v-else-if="activeDesktopModule === 'records'" class="desktop-record-page">
            <article class="record-hero-card">
              <h1>记录今天</h1>
              <div class="record-tabs" role="tablist" aria-label="记录视图">
                <button
                  type="button"
                  :class="{ active: activeRecordTab === 'quick' }"
                  @click="activeRecordTab = 'quick'"
                >
                  快速记录
                </button>
                <button
                  type="button"
                  :class="{ active: activeRecordTab === 'timeline' }"
                  @click="activeRecordTab = 'timeline'"
                >
                  时间线
                </button>
              </div>
            </article>

            <template v-if="activeRecordTab === 'quick'">
              <p class="record-subtitle">记录一下 {{ activePet?.name || '宠物' }} 今天的状态吧～</p>
              <section class="record-quick-stack desktop-record-stack">
                <article v-for="group in quickRecordGroups" :key="group.field" class="record-choice-card">
                  <header>
                    <span :class="`tone-${group.tone}`">{{ group.icon }}</span>
                    <h2>{{ group.title }}</h2>
                  </header>
                  <div class="record-option-grid">
                    <button
                      v-for="option in group.options"
                      :key="option.value"
                      type="button"
                      :class="{ active: isQuickLogOptionSelected(group.field, option.value) }"
                      @click="selectQuickLogOption(group.field, option)"
                    >
                      <strong>{{ option.emoji }}</strong>
                      <span>{{ option.label }}</span>
                    </button>
                  </div>
                </article>
              </section>

              <button
                class="record-more-button"
                type="button"
                @click="moreRecordFieldsOpen = !moreRecordFieldsOpen"
              >
                <AppIcon name="log" />
                {{ moreRecordFieldsOpen ? '收起护理笔记' : '添加更多护理笔记（体重/用药等）' }}
              </button>

              <article v-if="moreRecordFieldsOpen" class="workspace-card log-form record-extra-form">
                <div class="form-grid">
                  <label>精神<el-input-number v-model="quickLogDraft.energyLevel" :min="1" :max="5" /></label>
                  <label
                    >体重 kg<el-input-number v-model="quickLogDraft.weightKg" :min="0" :precision="2"
                  /></label>
                </div>
                <label>症状<el-input v-model="quickLogDraft.symptoms" /></label>
                <label>备注<el-input v-model="quickLogDraft.notes" type="textarea" :rows="4" /></label>
              </article>

              <div class="sticky-save record-save-bar">
                <span v-if="recordSaved">已保存到时间线</span>
                <el-button type="primary" size="large" @click="() => saveQuickLog()">保存今日记录</el-button>
              </div>
            </template>

            <article v-else class="workspace-card">
              <div v-if="recentLogs.length" class="timeline desktop-timeline">
                <article v-for="log in chat.activePetHealthLogs" :key="log.id" class="timeline-card">
                  <time>{{ formatDay(log.loggedAt) }}</time>
                  <strong>食欲 {{ log.appetite }} · 饮水 {{ log.waterIntake }} · 便便 {{ log.poop }}</strong>
                  <p>
                    呕吐 {{ log.vomiting }} · 精神 {{ log.energyLevel }}/5 ·
                    {{ log.symptoms || '无明显症状' }}
                  </p>
                </article>
              </div>
              <EmptyState v-else icon="log" title="还没有记录" />
            </article>
          </section>

          <section v-else-if="activeDesktopModule === 'ai'" class="desktop-ai-page">
            <div class="screen-heading">
              <p class="eyebrow">PetExpert AI</p>
              <h1>宠物护理咨询</h1>
              <span>{{ activePet?.name || '当前宠物' }} · {{ activePetSummary }}</span>
            </div>
            <section class="ai-entry-grid desktop-ai-entry-grid" aria-label="PetExpert 专属能力入口">
              <button
                v-for="entry in aiEntryCards"
                :key="entry.title"
                class="ai-entry-card"
                :class="entry.tone ? `tone-${entry.tone}` : ''"
                type="button"
                @click="openAi(entry.prompt)"
              >
                <span><AppIcon :name="entry.icon" /></span>
                <strong>{{ entry.title }}</strong>
                <small>{{ entry.description }}</small>
              </button>
            </section>
            <div class="prompt-chip-row">
              <button v-for="chip in aiPromptChips" :key="chip" type="button" @click="openAi(chip)">
                {{ chip }}
              </button>
            </div>
            <section ref="messagesEl" class="ai-messages desktop-messages">
              <EmptyState
                v-if="!chat.visibleMessages.length"
                icon="ai"
                title="开始一次 PetExpert 咨询"
                description="AI 会结合宠物档案、最近记录、护理计划和上传资料。"
              />
              <article
                v-for="message in chat.visibleMessages"
                v-else
                :key="message.id"
                class="message-card"
                :class="message.role"
              >
                <strong>{{ message.role === 'assistant' ? 'PetExpert AI' : '我' }}</strong>
                <template v-if="message.role === 'assistant'">
                  <template v-for="(segment, index) in messageSegments(message)" :key="index">
                    <div
                      v-if="segment.type === 'text'"
                      class="message-content"
                      v-html="segment.content"
                    ></div>
                    <pre v-else class="message-code-block"><code>{{ segment.content }}</code></pre>
                  </template>
                </template>
                <p v-else>{{ messageText(message) }}</p>
              </article>
              <div v-if="chat.isSending" class="typing-indicator">
                <span></span><span></span><span></span>
              </div>
            </section>
            <footer class="ai-input-bar desktop-ai-input">
              <button type="button" @click="fileInputEl?.click()"><AppIcon name="upload" /></button>
              <el-input
                v-model="aiInput"
                class="ai-composer"
                type="textarea"
                resize="none"
                :autosize="{ minRows: 1, maxRows: 4 }"
                placeholder="向 PetExpert 描述问题..."
                @keydown.enter.exact.prevent="sendAi"
              />
              <el-button type="primary" :disabled="!canSendAi" @click="sendAi">发送</el-button>
            </footer>
          </section>

          <section v-else-if="activeDesktopModule === 'plan'" class="desktop-grid two-col">
            <article class="workspace-card care-plan-card">
              <div class="section-title">
                <h2>喂养与护理计划</h2>
                <button type="button" @click="generateCarePlan">AI 生成</button>
              </div>
              <template v-if="chat.activePetCarePlan">
                <p>{{ chat.activePetCarePlan.summary }}</p>
                <h3>喂养</h3>
                <ul>
                  <li v-for="item in chat.activePetCarePlan.feeding" :key="item">{{ item }}</li>
                </ul>
                <h3>日常护理</h3>
                <ul>
                  <li v-for="item in chat.activePetCarePlan.care" :key="item">{{ item }}</li>
                </ul>
                <h3>提醒建议</h3>
                <ul>
                  <li v-for="item in chat.activePetCarePlan.reminders" :key="item">{{ item }}</li>
                </ul>
              </template>
              <EmptyState
                v-else
                icon="plan"
                title="还没有护理计划"
                description="点击生成，创建一份适合当前宠物的喂养、护理和提醒建议。"
              />
            </article>
            <article class="workspace-card">
              <div class="section-title">
                <h2>提醒列表</h2>
                <button type="button" @click="openReminderDialog">新增</button>
              </div>
              <div v-if="chat.activePetReminders.length" class="reminder-stack">
                <article
                  v-for="task in chat.activePetReminders"
                  :key="task.id"
                  class="reminder-card"
                  :class="{ done: task.status === 'done' }"
                >
                  <span><AppIcon :name="task.type === 'feeding' ? 'food' : 'reminder'" /></span>
                  <div>
                    <strong>{{ task.title }}</strong>
                    <p>
                      {{ formatDate(task.dueAt) }} · {{ reminderTypeLabel(task.type) }} · {{ task.repeat }}
                    </p>
                  </div>
                  <button type="button" @click="chat.toggleCareReminderDone(task.id)">
                    {{ task.status === 'done' ? '恢复' : '完成' }}
                  </button>
                </article>
              </div>
              <EmptyState v-else icon="reminder" title="还没有提醒" />
            </article>
          </section>

          <section v-else-if="activeDesktopModule === 'vet'" class="desktop-grid card-grid">
            <FeatureEntryCard
              icon="vet"
              title="症状分诊"
              description="整理近期日志、症状频率和观察重点。"
              tone="care"
              @click="runAiFlow('根据当前宠物档案和最近日志做一次症状分诊。', 'vet')"
            />
            <FeatureEntryCard
              icon="log"
              title="就诊问题清单"
              description="生成要问医生的问题和携带资料。"
              @click="runAiFlow('根据当前宠物档案和最近日志，生成就医问题清单。', 'vet')"
            />
            <FeatureEntryCard
              icon="file"
              title="报告解释"
              description="上传检查报告后用主人能理解的语言解释。"
              tone="ai"
              @click="fileInputEl?.click()"
            />
            <article class="workspace-card warning-card">
              <AppIcon name="vet" />
              <h2>急症警讯</h2>
              <p>
                持续呕吐或腹泻、呼吸困难、抽搐、疑似中毒、无法排尿、明显疼痛、精神沉郁或拒食超过 24
                小时，请尽快联系执业兽医或急诊医院。
              </p>
              <small>AI 建议仅供护理参考，不能替代兽医诊断。</small>
            </article>
          </section>

          <section v-else-if="activeDesktopModule === 'files'" class="desktop-grid card-grid">
            <FeatureEntryCard
              icon="upload"
              title="上传医疗资料"
              description="检查报告、疫苗本、发票、保险文件。"
              tone="warm"
              @click="fileInputEl?.click()"
            />
            <article v-for="file in chat.pendingFiles" :key="file.id" class="workspace-card file-card">
              <AppIcon name="file" />
              <strong>{{ file.name }}</strong>
              <p>{{ file.kind }} · {{ Math.round(file.size / 1024) }}KB</p>
              <button type="button" @click="chat.removePendingFile(file.id)">移除</button>
            </article>
            <EmptyState
              v-if="!chat.pendingFiles.length"
              icon="file"
              title="还没有上传资料"
              description="上传后可让 PetExpert 解释并关联到当前宠物。"
            />
          </section>

          <section v-else-if="activeDesktopModule === 'memories'" class="desktop-grid card-grid">
            <article v-for="memory in mockMemories" :key="memory.title" class="workspace-card memory-card">
              <span><AppIcon name="memory" /></span>
              <time>{{ memory.date }}</time>
              <strong>{{ memory.title }}</strong>
              <p>{{ memory.note }}</p>
            </article>
          </section>

          <section v-else-if="activeDesktopModule === 'products'" class="desktop-grid card-grid">
            <FeatureEntryCard
              icon="food"
              title="比较两款口粮"
              description="按成分、过敏、预算和适配性输出表格。"
              tone="warm"
              @click="runAiFlow('请比较两款宠物口粮，并结合当前宠物档案输出适配性表格。', 'products')"
            />
            <article v-for="product in mockProducts" :key="product.name" class="workspace-card product-card">
              <AppIcon name="product" />
              <strong>{{ product.name }}</strong>
              <p>{{ product.fit }}</p>
              <small>{{ product.risk }}</small>
            </article>
          </section>

          <section v-else-if="activeDesktopModule === 'hospitals'" class="desktop-grid card-grid">
            <article
              v-for="hospital in mockHospitals"
              :key="hospital.name"
              class="workspace-card hospital-card"
            >
              <AppIcon name="hospital" />
              <strong>{{ hospital.name }}</strong>
              <p>{{ hospital.distance }} · {{ hospital.focus }}</p>
              <small>{{ hospital.phone }}</small>
            </article>
          </section>

          <section v-else class="workspace-card settings-page">
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
              @clear-history="chat.clearAllSessions"
            />
          </section>
        </main>

        <aside v-if="aiDrawerOpen && activeDesktopModule !== 'ai'" class="ai-drawer">
          <header>
            <div>
              <p class="eyebrow">PetExpert AI</p>
              <h2>护理助手</h2>
            </div>
            <button type="button" @click="aiDrawerOpen = false">关闭</button>
          </header>
          <section class="ai-context-card">
            <AppIcon name="pet" />
            <p>{{ activePet?.name || '当前宠物' }} · {{ activePetSummary }}</p>
          </section>
          <div class="prompt-chip-row compact">
            <button v-for="chip in aiPromptChips.slice(0, 4)" :key="chip" type="button" @click="openAi(chip)">
              {{ chip }}
            </button>
          </div>
          <section ref="messagesEl" class="ai-messages drawer-messages">
            <EmptyState v-if="!chat.visibleMessages.length" icon="ai" title="打开一个护理问题" />
            <article
              v-for="message in chat.visibleMessages"
              v-else
              :key="message.id"
              class="message-card"
              :class="message.role"
            >
              <strong>{{ message.role === 'assistant' ? 'PetExpert AI' : '我' }}</strong>
              <template v-if="message.role === 'assistant'">
                <template v-for="(segment, index) in messageSegments(message)" :key="index">
                  <div v-if="segment.type === 'text'" class="message-content" v-html="segment.content"></div>
                  <pre v-else class="message-code-block"><code>{{ segment.content }}</code></pre>
                </template>
              </template>
              <p v-else>{{ messageText(message) }}</p>
            </article>
          </section>
          <footer class="ai-input-bar">
            <button type="button" @click="fileInputEl?.click()"><AppIcon name="upload" /></button>
            <el-input
              v-model="aiInput"
              class="ai-composer"
              type="textarea"
              resize="none"
              :autosize="{ minRows: 1, maxRows: 3 }"
              placeholder="问 PetExpert..."
              @keydown.enter.exact.prevent="sendAi"
            />
            <el-button type="primary" :disabled="!canSendAi" @click="sendAi">发送</el-button>
          </footer>
        </aside>
      </section>
    </template>

    <el-dialog v-model="petDialogVisible" title="宠物档案" width="720px">
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

    <el-dialog v-model="settingsVisible" title="设置" width="720px">
      <section class="preference-mini-card">
        <div>
          <strong>养宠偏好</strong>
          <p>
            {{ carePreferenceLabel }} ·
            {{
              auth.guidancePreference === 'minimal'
                ? '少打扰'
                : auth.guidancePreference === 'more_guidance'
                  ? '多提醒'
                  : '平衡建议'
            }}
          </p>
        </div>
        <el-button @click="openCarePreferenceOnboarding">修改</el-button>
      </section>
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
.pet-product {
  min-height: 100vh;
  min-height: 100svh;
  background:
    radial-gradient(circle at 15% 50%, rgba(255, 228, 196, 0.6), transparent 40%),
    radial-gradient(circle at 85% 30%, rgba(255, 209, 209, 0.5), transparent 40%),
    radial-gradient(circle at 50% 80%, rgba(212, 238, 255, 0.5), transparent 50%),
    linear-gradient(180deg, #fdfbf7 0%, #f4eee6 100%);
  color: #2f281f;
  position: relative;
  overflow-x: hidden;
  -webkit-tap-highlight-color: transparent;
}

.pet-product::before {
  content: '';
  position: absolute;
  inset: 0;
  background: url('data:image/svg+xml;utf8,<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M20 20 Q 30 10 40 20 Q 30 30 20 20 Z" fill="rgba(217, 130, 75, 0.03)"/></svg>')
    repeat;
  pointer-events: none;
  z-index: 0;
}

button {
  cursor: pointer;
}

.preference-mini-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 16px;
  padding: 14px;
  border: 1px solid rgba(154, 105, 58, 0.12);
  border-radius: 18px;
  background: #fff8ef;
}

.preference-mini-card strong {
  display: block;
  color: #332820;
  font-size: 14px;
}

.preference-mini-card p {
  margin: 4px 0 0;
  color: #8c735d;
  font-size: 13px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

.mobile-app {
  display: flex;
  height: 100vh;
  height: 100svh;
  min-height: 100vh;
  min-height: 100svh;
  flex-direction: column;
  overflow: hidden;
}

.desktop-workspace {
  display: none;
}

.mobile-header {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: max(10px, env(safe-area-inset-top)) 16px 8px;
  border-bottom: 1px solid rgba(150, 118, 76, 0.1);
  background: rgba(255, 251, 246, 0.94);
  box-shadow: 0 10px 24px rgba(82, 62, 38, 0.05);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  transition:
    transform 260ms cubic-bezier(0.2, 0, 0, 1),
    opacity 220ms ease;
  will-change: transform, opacity;
}

.mobile-app.is-chat-immersive .mobile-header {
  position: fixed;
  right: 0;
  left: 0;
}

.mobile-header.is-hidden {
  pointer-events: none;
  opacity: 0;
  transform: translateY(-100%);
}

.mobile-header-row,
.desktop-header,
.section-title,
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pet-context-button,
.icon-button {
  border: 1px solid rgba(145, 116, 78, 0.12);
  background: rgba(255, 255, 255, 0.78);
  color: #2f281f;
}

.pet-context-button {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  min-height: 44px;
  padding: 6px 12px 6px 6px;
  border-radius: 15px;
  font: inherit;
  font-weight: 950;
}

.pet-context-button img,
.pet-context-button span,
.pet-avatar-xl img,
.pet-avatar-xl span {
  display: grid;
  place-items: center;
  object-fit: cover;
  color: #fff;
  font-weight: 900;
}

.pet-context-button img,
.pet-context-button span {
  width: 30px;
  height: 30px;
  border-radius: 11px;
  background: #e09245;
}

.icon-button {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 15px;
}

.mobile-scroll {
  min-height: 0;
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 12px 16px 20px;
  padding-bottom: calc(92px + env(safe-area-inset-bottom));
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
}

.mobile-scroll.is-chat-immersive {
  padding: 0;
  overflow: hidden;
  background: linear-gradient(180deg, #fffaf4 0%, #f5eee7 100%);
}

.screen-stack {
  display: grid;
  gap: 12px;
  animation: fade-up 0.22s ease both;
}

.screen-heading {
  display: grid;
  gap: 5px;
}

.screen-heading h1,
.desktop-header h1 {
  margin: 0;
  font-size: 26px;
  letter-spacing: 0;
}

.screen-heading span,
.desktop-header span {
  color: #8e7e6b;
  font-size: 13px;
}

.eyebrow {
  margin: 0;
  color: #bd7932;
  font-size: 12px;
  font-weight: 900;
}

.daily-hero,
.workspace-hero {
  overflow: hidden;
  border: 1px solid rgba(229, 165, 89, 0.18);
  border-radius: 28px;
  background: linear-gradient(135deg, rgba(255, 247, 236, 0.96), rgba(255, 238, 216, 0.92)), #fff8ee;
  box-shadow: 0 20px 42px rgba(132, 92, 48, 0.09);
}

.daily-hero {
  display: grid;
  gap: 14px;
  padding: 22px;
}

.daily-hero h1,
.workspace-hero h2 {
  margin: 0;
  color: #2f281f;
  font-size: 25px;
  line-height: 1.18;
  letter-spacing: 0;
}

.daily-hero p,
.workspace-hero p,
.app-card p,
.workspace-card p {
  margin: 0;
  color: #7f705f;
  line-height: 1.6;
}

.hero-progress {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px 12px;
  align-items: center;
  color: #8a7764;
  font-size: 13px;
  font-weight: 800;
}

.hero-progress i {
  grid-column: 1 / -1;
  height: 8px;
  overflow: hidden;
  border-radius: 99px;
  background: rgba(164, 118, 65, 0.14);
}

.hero-progress b {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #e09a43, #d8753e);
  transition: width 0.28s ease;
}

.app-card,
.workspace-card {
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.65);
  box-shadow:
    0 8px 32px rgba(142, 104, 60, 0.04),
    inset 0 0 0 1px rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  transition:
    transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.3s ease;
  position: relative;
  z-index: 1;
}

.app-card:hover,
.workspace-card:hover {
  transform: none;
}

.app-card {
  padding: 18px;
}

.pet-summary-card {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: center;
}

.pet-avatar-xl {
  display: grid;
  width: 58px;
  height: 58px;
  place-items: center;
  overflow: hidden;
  border-radius: 20px;
  background: #e09245;
  box-shadow: 0 12px 24px rgba(170, 96, 36, 0.16);
}

.pet-avatar-xl img,
.pet-avatar-xl span {
  width: 100%;
  height: 100%;
}

.pet-summary-card strong,
.desktop-pet-card strong {
  display: block;
  font-size: 17px;
}

.status-good {
  --el-tag-bg-color: #fff0dc;
  --el-tag-border-color: #f2c99d;
  --el-tag-text-color: #a9582f;
}

.status-warning {
  --el-tag-bg-color: #fff2e7;
  --el-tag-border-color: #f3cba4;
  --el-tag-text-color: #b46b25;
}

.status-neutral {
  --el-tag-bg-color: #f6efe7;
  --el-tag-border-color: #e6d7c6;
  --el-tag-text-color: #8b7b68;
}

.section-block,
.quick-actions,
.profile-entry-grid,
.pet-family-list {
  display: grid;
  gap: 12px;
}

.section-title h2,
.card-head h2 {
  margin: 0;
  font-size: 18px;
  letter-spacing: 0;
}

.section-title button,
.suggestion-card button,
.reminder-card button,
.file-card button,
.ai-drawer header button {
  border: 0;
  background: transparent;
  color: #bd7431;
  font: inherit;
  font-size: 13px;
  font-weight: 900;
}

.task-list,
.reminder-stack,
.timeline {
  display: grid;
  gap: 10px;
}

.task-row,
.reminder-card,
.timeline-card,
.profile-pet-card,
.add-pet-card {
  border: 1px solid rgba(145, 116, 78, 0.1);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
}

.task-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px;
  color: #342b22;
  font: inherit;
  text-align: left;
}

.task-row > span,
.reminder-card > span,
.card-head span {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 14px;
  background: #fff0dd;
  color: #c9782b;
}

.task-row strong,
.reminder-card strong,
.timeline-card strong {
  display: block;
  color: #342b22;
  font-size: 14px;
}

.task-row small,
.timeline-card small,
.reminder-card p,
.hospital-card small,
.product-card small {
  color: #8c7d6d;
  font-size: 12px;
}

.suggestion-card {
  display: grid;
  gap: 12px;
}

.quick-actions,
.profile-entry-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

.form-stack,
.log-form {
  display: grid;
  gap: 12px;
}

label {
  display: grid;
  gap: 7px;
  color: #6f604f;
  font-size: 12px;
  font-weight: 900;
}

.photo-upload {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 54px;
  padding: 12px;
  border: 1px dashed rgba(151, 118, 78, 0.28);
  border-radius: 18px;
  background: #fffaf4;
  color: #8a7a67;
}

.photo-upload input {
  display: none;
}

:deep(.el-input__wrapper),
:deep(.el-textarea__inner),
:deep(.el-select__wrapper),
:deep(.el-input-number) {
  min-height: 48px;
  border-radius: 14px;
}

:deep(.el-input__inner),
:deep(.el-textarea__inner) {
  font-size: 16px;
}

:deep(.el-input-number) {
  width: 100%;
}

.record-page,
.desktop-record-page {
  display: grid;
  gap: var(--space-4);
  animation: fade-up var(--motion-slow) var(--ease-standard) both;
}

.record-hero-card {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-card);
  box-shadow: var(--shadow-card);
}

.record-hero-card h1 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-2xl);
  font-weight: 950;
  letter-spacing: 0;
}

.record-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-1);
  padding: var(--space-1);
  border-radius: var(--radius-lg);
  background: #f3f1ef;
}

.record-tabs button {
  min-height: 48px;
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  background: transparent;
  font: inherit;
  font-size: var(--font-base);
  font-weight: 950;
  transition:
    background var(--motion-normal) var(--ease-standard),
    box-shadow var(--motion-normal) var(--ease-standard),
    color var(--motion-normal) var(--ease-standard),
    transform var(--motion-fast) var(--ease-standard);
}

.record-tabs button.active {
  color: var(--color-text);
  background: #fff;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.9) inset,
    0 6px 18px rgba(68, 51, 35, 0.12);
}

.record-subtitle {
  margin: var(--space-1) var(--space-2) 0;
  color: var(--color-text-muted);
  font-size: var(--font-base);
  font-weight: 850;
}

.record-quick-stack {
  display: grid;
  gap: var(--space-4);
}

.record-choice-card {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-card);
  box-shadow: var(--shadow-card);
}

.record-choice-card header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.record-choice-card header > span {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: var(--radius-pill);
  font-size: var(--font-xl);
}

.record-choice-card header > span.tone-food {
  background: #fff8df;
}

.record-choice-card header > span.tone-water {
  background: #eefaff;
}

.record-choice-card header > span.tone-poop {
  background: #f7f7f6;
}

.record-choice-card header > span.tone-care {
  background: #fff0dc;
}

.record-choice-card header > span.tone-mood {
  background: #f4f0ff;
}

.record-choice-card h2 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-xl);
  font-weight: 950;
}

.record-option-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.record-option-grid button {
  display: grid;
  place-items: center;
  gap: var(--space-2);
  min-height: 76px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-2);
  color: var(--color-text);
  background: #faf9f8;
  font: inherit;
  box-shadow: 0 6px 14px rgba(82, 62, 38, 0.04);
  transition:
    transform var(--motion-fast) var(--ease-standard),
    border-color var(--motion-normal) var(--ease-standard),
    background var(--motion-normal) var(--ease-standard),
    box-shadow var(--motion-normal) var(--ease-standard);
}

.record-option-grid button.active {
  border-color: rgba(217, 130, 75, 0.42);
  background: #fff0dc;
  box-shadow:
    0 0 0 3px rgba(217, 130, 75, 0.1),
    0 8px 18px rgba(169, 88, 47, 0.12);
}

.record-option-grid button:active {
  transform: scale(0.98);
}

.record-option-grid strong {
  font-size: var(--font-2xl);
  line-height: 1;
}

.record-option-grid span {
  font-size: var(--font-sm);
  font-weight: 950;
  line-height: 1.2;
}

.record-more-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 48px;
  border: 0;
  border-radius: var(--radius-lg);
  padding: 0 var(--space-4);
  color: #d85f1f;
  background: #fff2e5;
  font: inherit;
  font-size: var(--font-base);
  font-weight: 950;
}

.record-extra-form {
  animation: fade-up 0.18s ease both;
}

.sticky-save {
  position: static;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 64px;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-card);
  box-shadow: var(--shadow-card);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.sticky-save .el-button {
  min-width: 128px;
  min-height: 48px;
  border-radius: var(--radius-md);
}

.sticky-save span {
  color: var(--color-primary-strong);
  font-size: var(--font-sm);
  font-weight: 900;
}

.timeline-card {
  display: grid;
  gap: 6px;
  padding: 14px;
}

.timeline-card time {
  color: #bd7932;
  font-size: 12px;
  font-weight: 900;
}

.ai-context-card {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 14px;
  border: 1px solid rgba(129, 102, 201, 0.16);
  border-radius: 20px;
  background: #f4f0ff;
  color: #6555ad;
}

.ai-context-card p {
  margin: 0;
  color: #665b84;
  line-height: 1.55;
}

.ai-entry-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.ai-entry-card {
  display: grid;
  min-height: 118px;
  gap: 7px;
  align-content: start;
  padding: 14px;
  border: 1px solid rgba(129, 102, 201, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.84);
  color: #3f335f;
  font: inherit;
  text-align: left;
  box-shadow: 0 12px 28px rgba(74, 55, 34, 0.07);
}

.ai-entry-card span {
  display: inline-grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 8px;
  background: #f4f0ff;
  color: #6b5ab5;
}

.ai-entry-card strong {
  color: #322a49;
  font-size: 14px;
  font-weight: 1000;
}

.ai-entry-card small {
  color: #746b83;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.45;
}

.ai-entry-card.tone-warm span {
  background: #fff3df;
  color: #b66c1d;
}

.ai-entry-card.tone-care span {
  background: #eaf8f0;
  color: #27805c;
}

.ai-entry-card.tone-ai span {
  background: #edf4ff;
  color: #3c66c4;
}

.prompt-chip-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.prompt-chip-row button {
  flex: 0 0 auto;
  padding: 9px 12px;
  border: 1px solid rgba(129, 102, 201, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.82);
  color: #6656af;
  font: inherit;
  font-size: 12px;
  font-weight: 900;
}

.ai-messages {
  display: grid;
  gap: 10px;
  min-height: 240px;
  max-height: calc(100svh - 330px);
  overflow: auto;
  padding: 2px 0;
}

.message-card {
  display: grid;
  gap: 6px;
  max-width: 88%;
  padding: 13px 14px;
  border-radius: 18px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.message-card.assistant {
  justify-self: start;
  background: #fff;
  color: #3a3027;
}

.message-card.user {
  justify-self: end;
  background: #d9824b;
  color: #fff;
}

.message-card p {
  margin: 0;
}

.message-content {
  display: grid;
  gap: 10px;
  color: inherit;
}

.message-content + .message-content {
  margin-top: 10px;
}

.message-card.assistant .message-content {
  color: #312821;
  font-size: 15px;
  line-height: 1.78;
}

.message-card.assistant :deep(.message-content > :first-child) {
  margin-top: 0;
}

.message-card.assistant :deep(.message-content > :last-child) {
  margin-bottom: 0;
}

.message-card.assistant :deep(p) {
  margin: 0;
}

.message-card.assistant :deep(h2),
.message-card.assistant :deep(h3) {
  margin: 16px 0 4px;
  color: #2b241d;
  font-weight: 950;
  letter-spacing: 0;
}

.message-card.assistant :deep(h2) {
  font-size: 18px;
}

.message-card.assistant :deep(h3) {
  font-size: 16px;
}

.message-card.assistant :deep(ul),
.message-card.assistant :deep(ol) {
  display: grid;
  gap: 6px;
  margin: 2px 0 0;
  padding-left: 20px;
}

.message-card.assistant :deep(li) {
  padding-left: 2px;
}

.message-card.assistant :deep(strong) {
  color: #2f281f;
  font-weight: 950;
}

.message-card.assistant :deep(blockquote) {
  margin: 8px 0;
  padding: 10px 12px;
  border-left: 3px solid #d9824b;
  border-radius: 12px;
  background: #fff7ed;
  color: #7a604b;
}

.message-card.assistant :deep(code) {
  border-radius: 7px;
  padding: 2px 5px;
  background: #fff0dc;
  color: #9d542e;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9em;
}

.message-code-block {
  overflow: auto;
  margin: 10px 0 0;
  border-radius: 14px;
  padding: 12px;
  background: #2b211c;
  color: #fff7ed;
  font-size: 13px;
  line-height: 1.65;
}

.ai-input-bar {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: end;
  padding: 10px;
  border: 1px solid rgba(145, 116, 78, 0.12);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 12px 28px rgba(82, 62, 38, 0.08);
}

.ai-input-bar > button {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border: 0;
  border-radius: 12px;
  background: #f7efe5;
  color: #bd7431;
}

.ai-input-bar :deep(.el-button) {
  min-height: 40px;
  border-radius: 13px;
  padding: 0 14px;
  font-weight: 950;
}

.medical-disclaimer {
  margin: 0;
  color: #9a8773;
  font-size: 12px;
  line-height: 1.55;
}

.ai-chat-shell {
  position: relative;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  width: 100%;
  height: 100svh;
  min-height: 100svh;
  overflow: hidden;
  background:
    radial-gradient(circle at 10% 10%, rgba(255, 221, 181, 0.72), transparent 34%),
    linear-gradient(180deg, #fffaf4 0%, #f5eee7 100%);
  opacity: 0;
  transform: translateY(16px) scale(0.94);
  transform-origin: 50% 82%;
  transition:
    opacity 320ms ease,
    transform 340ms cubic-bezier(0.2, 0, 0, 1);
  will-change: transform, opacity;
}

.ai-chat-shell.is-ready {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.ai-chat-header {
  position: sticky;
  top: 0;
  z-index: 12;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-height: calc(58px + env(safe-area-inset-top));
  padding: max(10px, env(safe-area-inset-top)) 14px 8px;
  border-bottom: 1px solid rgba(145, 116, 78, 0.1);
  background: rgba(255, 251, 246, 0.86);
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
}

.ai-chat-icon-button,
.ai-chat-send {
  display: grid;
  width: 44px;
  height: 44px;
  min-width: 44px;
  place-items: center;
  border: 1px solid rgba(145, 116, 78, 0.12);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.8);
  color: #604832;
  font: inherit;
}

.ai-chat-back {
  background: #fff4e7;
  color: #bd7431;
}

.ai-chat-title {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.ai-chat-title strong {
  overflow: hidden;
  color: #2f281f;
  font-size: 16px;
  font-weight: 1000;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-chat-title span {
  overflow: hidden;
  color: #8e7e6b;
  font-size: 12px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-chat-actions {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
}

.ai-chat-text-button {
  min-height: 44px;
  border: 1px solid rgba(145, 116, 78, 0.12);
  border-radius: 14px;
  padding: 0 11px;
  background: rgba(255, 255, 255, 0.82);
  color: #bd7431;
  font: inherit;
  font-size: 12px;
  font-weight: 950;
}

.ai-chat-more {
  display: none;
}

.ai-chat-more-menu {
  position: absolute;
  top: 46px;
  right: 0;
  z-index: 16;
  display: grid;
  min-width: 148px;
  padding: 8px;
  border: 1px solid rgba(145, 116, 78, 0.12);
  border-radius: 18px;
  background: rgba(255, 252, 247, 0.98);
  box-shadow: 0 16px 34px rgba(82, 62, 38, 0.16);
}

.ai-chat-more-menu button {
  border: 0;
  border-radius: 12px;
  min-height: 44px;
  padding: 10px 12px;
  background: transparent;
  color: #4b3c2e;
  font: inherit;
  font-size: 13px;
  font-weight: 900;
  text-align: left;
}

.ai-chat-more-menu button:active {
  background: #fff0dc;
}

.ai-chat-context {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 10px 14px 0;
  padding: 12px;
  border: 1px solid rgba(129, 102, 201, 0.14);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 10px 24px rgba(82, 62, 38, 0.05);
}

.ai-chat-context > .app-icon {
  flex: 0 0 auto;
  color: #6656af;
}

.ai-chat-context strong {
  display: block;
  color: #3f335f;
  font-size: 13px;
  font-weight: 950;
}

.ai-chat-context p {
  display: -webkit-box;
  overflow: hidden;
  margin: 3px 0 0;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: #776b84;
  font-size: 12px;
  line-height: 1.5;
}

.ai-chat-card-reveal {
  opacity: 0;
  transform: translateY(8px) scale(0.96);
  transition:
    opacity 260ms ease,
    transform 300ms cubic-bezier(0.2, 0, 0, 1);
  will-change: transform, opacity;
}

.ai-chat-shell.is-ready .ai-chat-card-reveal {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.ai-chat-shell.is-ready .ai-chat-context {
  transition-delay: 45ms;
}

.ai-chat-shell.is-ready .ai-chat-messages {
  transition-delay: 90ms;
}

.ai-chat-messages {
  display: grid;
  align-content: end;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  gap: 10px;
  padding: 14px 14px calc(18px + env(safe-area-inset-bottom));
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
}

.ai-chat-messages .message-card.user {
  max-width: 78%;
  border-radius: 18px 18px 6px 18px;
  background: #d9824b;
}

.ai-chat-messages .message-card.assistant {
  max-width: 88%;
  border: 1px solid rgba(145, 116, 78, 0.1);
  border-radius: 18px 18px 18px 6px;
  box-shadow: 0 10px 22px rgba(82, 62, 38, 0.06);
}

.ai-chat-empty {
  align-self: center;
  display: grid;
  gap: 12px;
  justify-items: center;
  padding: 24px 8px 10px;
  text-align: center;
}

.ai-chat-empty > span {
  display: grid;
  width: 54px;
  height: 54px;
  place-items: center;
  border-radius: 20px;
  background: #fff0dc;
  color: #bd7431;
  box-shadow: 0 12px 24px rgba(169, 88, 47, 0.1);
}

.ai-chat-empty h1 {
  margin: 0;
  color: #2f281f;
  font-size: 23px;
  font-weight: 1000;
  letter-spacing: 0;
}

.ai-chat-empty p {
  max-width: 290px;
  margin: 0;
  color: #7f705f;
  font-size: 14px;
  line-height: 1.55;
}

.ai-chat-empty small {
  max-width: 300px;
  color: #9a765d;
  font-size: 12px;
  line-height: 1.5;
}

.ai-chat-suggestions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  max-width: 360px;
}

.ai-chat-suggestions button {
  min-height: 44px;
  border: 1px solid rgba(129, 102, 201, 0.14);
  border-radius: 999px;
  padding: 0 11px;
  background: rgba(255, 255, 255, 0.82);
  color: #6656af;
  font: inherit;
  font-size: 12px;
  font-weight: 900;
}

.ai-chat-loading {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 88%;
  padding: 11px 13px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.84);
  color: #7a6d5d;
  font-size: 13px;
  font-weight: 850;
}

.ai-chat-loading i {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: #bd7431;
  animation: typing 0.9s ease-in-out infinite;
}

.ai-chat-loading i:nth-child(3) {
  animation-delay: 0.12s;
}

.ai-chat-loading i:nth-child(4) {
  animation-delay: 0.24s;
}

.ai-chat-composer {
  position: sticky;
  bottom: 0;
  z-index: 12;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  gap: 8px;
  align-items: end;
  margin: 0 12px;
  padding: 10px 10px calc(10px + env(safe-area-inset-bottom));
  border: 1px solid rgba(145, 116, 78, 0.12);
  border-radius: 22px 22px 0 0;
  background: rgba(255, 252, 247, 0.94);
  box-shadow: 0 -12px 30px rgba(82, 62, 38, 0.1);
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
  transform: scaleX(0.46);
  transform-origin: 50% 100%;
  opacity: 0.72;
  transition:
    opacity 240ms ease,
    transform 320ms cubic-bezier(0.2, 0, 0, 1);
  will-change: transform, opacity;
}

.ai-chat-shell.is-ready .ai-chat-composer {
  opacity: 1;
  transform: scaleX(1);
}

.ai-chat-composer > button,
.ai-chat-composer .ai-composer {
  transition:
    opacity 220ms ease,
    transform 240ms ease;
}

.ai-chat-shell:not(.is-ready) .ai-chat-composer > button {
  opacity: 0;
  transform: scale(0.92);
}

.ai-chat-send {
  border: 0;
  background: #d9824b;
  color: #fff;
}

.ai-chat-send:disabled {
  background: #eaded1;
  color: #aa9a89;
}

.ai-chat-composer :deep(.el-textarea__inner) {
  min-height: 44px !important;
  border: 0;
  border-radius: 15px;
  padding: 10px 12px;
  background: #fff8ef;
  box-shadow: none;
  color: #342b22;
  line-height: 1.35;
}

.ai-chat-search-sheet {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  background: #fffaf4;
  color: #2f281f;
}

.ai-chat-search-sheet header {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: max(10px, env(safe-area-inset-top)) 14px 10px;
  border-bottom: 1px solid rgba(145, 116, 78, 0.1);
  background: rgba(255, 251, 246, 0.94);
}

.ai-chat-search-sheet header > button:last-child {
  border: 0;
  min-height: 44px;
  background: transparent;
  color: #bd7431;
  font: inherit;
  font-size: 14px;
  font-weight: 950;
}

.ai-chat-search-input {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  border: 1px solid rgba(145, 116, 78, 0.1);
  border-radius: 14px;
  padding: 0 12px;
  outline: 0;
  background: #fff;
  color: #342b22;
  font: inherit;
  font-size: 16px;
}

.ai-chat-search-sheet main {
  min-height: 0;
  overflow: auto;
  padding: 16px 14px calc(24px + env(safe-area-inset-bottom));
}

.ai-chat-search-sheet h2 {
  margin: 0 0 12px;
  color: #6f604f;
  font-size: 13px;
  font-weight: 950;
}

.ai-chat-history-list {
  display: grid;
  gap: 10px;
}

.ai-chat-history-item {
  display: grid;
  gap: 8px;
  width: 100%;
  min-height: 72px;
  border: 1px solid rgba(145, 116, 78, 0.1);
  border-radius: 18px;
  padding: 13px;
  background: rgba(255, 255, 255, 0.78);
  color: #342b22;
  font: inherit;
  text-align: left;
}

.ai-chat-history-item div {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.ai-chat-history-item strong {
  font-size: 14px;
  font-weight: 1000;
}

.ai-chat-history-item span,
.ai-chat-history-item small {
  color: #967f69;
  font-size: 12px;
  font-weight: 850;
}

.ai-chat-history-item p {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: #6f604f;
  font-size: 13px;
  line-height: 1.45;
}

.ai-chat-search-empty {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 45vh;
  color: #8e7e6b;
  text-align: center;
}

.ai-chat-search-empty strong {
  color: #3f3429;
}

.ai-chat-search-empty p {
  margin: 0;
  font-size: 13px;
}

.ai-search-sheet-enter-active,
.ai-search-sheet-leave-active {
  transition:
    opacity 220ms ease,
    transform 260ms cubic-bezier(0.2, 0, 0, 1);
}

.ai-search-sheet-enter-from,
.ai-search-sheet-leave-to {
  opacity: 0;
  transform: translateY(16px);
}

.typing-indicator {
  display: flex;
  gap: 5px;
  align-items: center;
  padding: 10px 4px;
}

.typing-indicator span {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #b8a790;
  animation: typing 0.9s ease-in-out infinite;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.12s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.24s;
}

.calendar-card {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 7px;
}

.day-pill {
  display: grid;
  place-items: center;
  gap: 8px;
  color: #7c6d5d;
  font-size: 12px;
  font-weight: 900;
}

.day-pill b {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #e09a43;
}

.reminder-card {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 13px;
}

.reminder-card.done {
  opacity: 0.58;
}

.care-plan-card {
  display: grid;
  gap: 12px;
}

.care-plan-card ul {
  display: grid;
  gap: 8px;
  margin: 0;
  padding-left: 18px;
  color: #675847;
  line-height: 1.55;
}

.pet-family-list {
  grid-template-columns: 1fr;
}

.profile-pet-card,
.add-pet-card {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 76px;
  padding: 14px;
  color: #342b22;
  font: inherit;
  text-align: left;
}

.profile-pet-card img,
.profile-pet-card > span {
  display: grid;
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 16px;
  background: #e09245;
  color: #fff;
  object-fit: cover;
  font-weight: 900;
}

.profile-pet-card p {
  margin: 4px 0 0;
  color: #8c7d6d;
  font-size: 12px;
}

.add-pet-card {
  justify-content: center;
  border-style: dashed;
  background: rgba(255, 250, 244, 0.58);
  color: #bd7431;
  font-weight: 900;
}

:global(.el-dialog) {
  border-radius: 26px;
}

:global(.el-dialog__header) {
  padding: 20px 20px 8px;
}

:global(.el-dialog__body) {
  padding: 12px 20px 18px;
}

:global(.el-dialog__footer) {
  padding: 0 20px 20px;
}

:global(.el-dialog__footer .el-button) {
  min-height: 44px;
  border-radius: 14px;
}

@media (max-width: 899px) {
  .pet-product {
    width: 100%;
    height: 100vh;
    height: 100svh;
    overflow: hidden;
  }

  :global(.el-dialog) {
    width: calc(100vw - 24px) !important;
    max-height: calc(100svh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
    margin: max(12px, env(safe-area-inset-top)) auto max(12px, env(safe-area-inset-bottom)) !important;
    overflow: hidden;
    border-radius: 24px;
  }

  :global(.el-dialog__body) {
    max-height: calc(100svh - 184px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
    overflow: auto;
    overscroll-behavior: contain;
  }

  :global(.el-dialog__footer .dialog-footer),
  :global(.el-dialog__footer) {
    display: grid;
    gap: 8px;
  }

  :global(.el-dialog__footer .el-button) {
    width: 100%;
    margin-left: 0 !important;
  }
}

@media (min-width: 900px) {
  .mobile-app {
    display: none;
  }

  .desktop-workspace {
    display: flex;
    min-height: 100vh;
  }

  .desktop-main {
    width: 100%;
    min-width: 0;
    padding: 28px;
  }

  .desktop-header {
    margin-bottom: 22px;
  }

  .desktop-actions {
    display: flex;
    gap: 10px;
  }

  .desktop-grid {
    display: grid;
    gap: 18px;
  }

  .overview-grid {
    grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.6fr);
  }

  .two-col {
    grid-template-columns: minmax(360px, 0.85fr) minmax(0, 1.15fr);
  }

  .card-grid {
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  }

  .workspace-hero {
    display: grid;
    grid-template-columns: 1fr 240px;
    gap: 28px;
    padding: 28px;
  }

  .workspace-card {
    padding: 20px;
  }

  .form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .desktop-record-page {
    max-width: 920px;
    margin: 0 auto;
  }

  .desktop-record-page .record-hero-card {
    border-radius: 28px;
    padding: 30px 30px 24px;
  }

  .desktop-record-stack {
    grid-template-columns: 1fr;
  }

  .desktop-record-page .record-option-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .span-2 {
    grid-column: 1 / span 1;
  }

  .desktop-pet-card {
    display: grid;
    place-items: center;
    gap: 8px;
    padding: 20px;
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.58);
    text-align: center;
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 18px;
  }

  .stat-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .stat-grid span {
    display: grid;
    gap: 6px;
    padding: 14px;
    border-radius: 18px;
    background: #fff8ef;
    color: #8c7d6d;
    font-size: 12px;
  }

  .stat-grid strong {
    color: #342b22;
    font-size: 18px;
  }

  .desktop-timeline {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .desktop-ai-page {
    display: grid;
    max-width: 980px;
    gap: 16px;
  }

  .desktop-ai-entry-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .desktop-messages {
    max-height: calc(100vh - 320px);
    padding: 16px;
    border: 1px solid rgba(145, 116, 78, 0.12);
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.48);
  }

  .desktop-ai-input {
    position: sticky;
    bottom: 20px;
  }

  .ai-drawer {
    position: sticky;
    top: 0;
    display: flex;
    width: 420px;
    height: 100vh;
    flex: 0 0 420px;
    flex-direction: column;
    gap: 14px;
    padding: 22px;
    border-left: 1px solid rgba(146, 118, 86, 0.14);
    background: rgba(255, 252, 247, 0.92);
    box-shadow: -22px 0 48px rgba(80, 59, 36, 0.08);
    backdrop-filter: blur(24px);
    animation: drawer-in 0.2s ease both;
  }

  .ai-drawer header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .ai-drawer h2 {
    margin: 0;
  }

  .drawer-messages {
    min-height: 0;
    max-height: none;
    flex: 1;
    padding-right: 4px;
  }

  .memory-card,
  .product-card,
  .hospital-card,
  .file-card,
  .warning-card {
    display: grid;
    gap: 10px;
  }

  .memory-card span {
    display: grid;
    width: 48px;
    height: 48px;
    place-items: center;
    border-radius: 16px;
    background: #fff0dd;
    color: #c9782b;
  }

  .warning-card {
    border-color: rgba(181, 97, 45, 0.2);
    background: #fff4ec;
  }

  .settings-page {
    max-width: 920px;
  }
}

@media (max-width: 520px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .record-option-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .record-choice-card {
    padding: 18px 14px;
  }

  .record-option-grid button {
    min-height: 88px;
    border-radius: 18px;
  }

  .record-option-grid strong {
    font-size: 24px;
  }

  .record-option-grid span {
    font-size: 12px;
  }

  .quick-actions,
  .profile-entry-grid {
    grid-template-columns: 1fr 1fr;
  }

  .message-card {
    max-width: 94%;
  }

  .ai-chat-actions .ai-chat-text-button,
  .ai-chat-actions > .ai-chat-icon-button:not(.ai-chat-more) {
    display: none;
  }

  .ai-chat-more {
    display: grid;
  }

  .ai-chat-header {
    grid-template-columns: 44px minmax(0, 1fr) 44px;
  }

  .ai-chat-empty h1 {
    font-size: 21px;
  }

  .ai-chat-history-item div {
    display: grid;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mobile-header,
  .ai-chat-shell,
  .ai-chat-card-reveal,
  .ai-chat-composer,
  .ai-search-sheet-enter-active,
  .ai-search-sheet-leave-active {
    transition-duration: 80ms;
  }

  .ai-chat-shell,
  .ai-chat-shell.is-ready,
  .ai-chat-card-reveal,
  .ai-chat-shell.is-ready .ai-chat-card-reveal,
  .ai-chat-composer,
  .ai-chat-shell.is-ready .ai-chat-composer {
    transform: none;
  }

  .typing-indicator span,
  .ai-chat-loading i {
    animation: none;
  }
}

@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes drawer-in {
  from {
    opacity: 0;
    transform: translateX(16px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes typing {
  0%,
  80%,
  100% {
    transform: translateY(0);
    opacity: 0.4;
  }

  40% {
    transform: translateY(-4px);
    opacity: 1;
  }
}
</style>
