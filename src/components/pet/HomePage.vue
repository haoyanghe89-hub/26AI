<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import type { DailyCheckInSummary } from '../../composables/useDailyCheckIn'
import type { HealthLog, PetProfile } from '../../stores/chat'
import {
  careExperienceHomeContent,
  normalizeCareExperienceLevel,
  type CareExperienceLevel,
} from '../../config/careExperienceContent'

type HomeMode = 'mobile' | 'desktop'
type QuickRecordType = 'appetite' | 'water' | 'stool' | 'walk' | 'mood'
type DetailSheetType = 'meal' | 'insight' | null
type MealIngredient = { name: string; grams: number; note: string }
type MealPlan = {
  main: string
  mainLabel: string
  snack: string
  water: string
  tip: string
  detail: string
  calories: string
  basis: string
  ingredients: MealIngredient[]
  cautions: string[]
}

const props = withDefaults(
  defineProps<{
    mode?: HomeMode
    pets: PetProfile[]
    activePet: PetProfile | null
    activePetId: string
    activePetSummary: string
    companionDays: number
    latestLog: HealthLog | null
    recentLogs: HealthLog[]
    hasTodayLog: boolean
    aiInsight: string
    checkInSummary: DailyCheckInSummary
    careExperienceLevel?: CareExperienceLevel
  }>(),
  {
    mode: 'mobile',
    careExperienceLevel: 'beginner',
  },
)

const emit = defineEmits<{
  (event: 'selectPet', value: string): void
  (event: 'addPet'): void
  (event: 'saveRecord', value: Partial<HealthLog>): void
  (event: 'openAi', value?: string): void
  (event: 'generatePlan'): void
  (event: 'openRecords'): void
}>()

const quickRecordOpen = ref(false)
const quickRecordType = ref<QuickRecordType>('appetite')
const quickRecordValue = ref('')
const quickRecordNote = ref('')
const toastMessage = ref('')
const mealRefreshing = ref(false)
const detailSheet = ref<DetailSheetType>(null)
const selectedDiscovery = ref<HomeDiscovery | null>(null)

const petName = computed(() => props.activePet?.name || '毛孩子')
const petInitial = computed(() => petName.value.slice(0, 1) || '宠')
const experienceContent = computed(
  () => careExperienceHomeContent[normalizeCareExperienceLevel(props.careExperienceLevel)],
)
const experienceCards = computed(() => experienceContent.value.cards.slice(0, 3))

const todayStatus = computed(() => {
  if (props.latestLog) {
    if (props.latestLog.appetite.includes('少') || props.latestLog.waterIntake.includes('少'))
      return '轻微留意'
    if (props.latestLog.poop.includes('稀') || props.latestLog.vomiting !== '无') return '需要留意'
    return '状态平稳'
  }
  return props.hasTodayLog ? '已记录' : '待记录'
})

const todayReminder = computed(() => {
  if (props.latestLog?.waterIntake.includes('少')) return '今天留意饮水'
  if (props.latestLog?.appetite.includes('少')) return '晚点看食欲'
  if (props.activePet?.species === 'cat') return '晚点看尿团'
  if (!props.latestLog) return '记一条小状态'
  return '外出后补水'
})

const aiDetailLine = computed(() => {
  if (props.aiInsight) return softenHomeCopy(props.aiInsight)
  if (props.latestLog?.waterIntake.includes('少')) return '今天饮水看起来少了一点，可以顺手换一碗新鲜水。'
  if (props.activePet?.species === 'cat') return '晚一点可以留意尿团和精神，记录多一点，我会更懂它。'
  return '最近两天散步记录少了一点，如果天气合适，可以带它走走，顺便观察精神状态。'
})

const mealPlan = computed<MealPlan>(() => buildMealPlan(props.activePet, props.latestLog))
const foodKindLabel = computed(() => (props.activePet?.species === 'cat' ? '猫粮' : '狗粮'))
const foodRecommendationPrompt = computed(
  () =>
    `请根据${petName.value}的品种、体重、年龄、过敏和食物偏好，推荐适合的${foodKindLabel.value}，并说明每日克重和换粮注意事项。`,
)

interface HomeDiscovery {
  id: string
  icon: string
  title: string
  status: string
  detail: string
  prompt?: string
  route?: string
}

const discoveryItems = computed<HomeDiscovery[]>(() => experienceCards.value.map(compactDiscovery))

const quickRecordChips: Array<{ type: QuickRecordType; label: string; icon: string }> = [
  { type: 'appetite', label: '吃饭', icon: 'food' },
  { type: 'water', label: '喝水', icon: 'water' },
  { type: 'stool', label: '便便', icon: 'log' },
  { type: 'walk', label: '散步', icon: 'walk' },
  { type: 'mood', label: '心情', icon: 'heart' },
]

const lifeMoments = computed(() => [
  {
    id: 'breakfast',
    title: '早餐',
    icon: 'food',
    status: shortStatus(props.latestLog?.appetite || '还没记'),
    type: 'appetite' as QuickRecordType,
  },
  {
    id: 'water',
    title: '喝水',
    icon: 'water',
    status: shortStatus(props.latestLog?.waterIntake || '正常'),
    type: 'water' as QuickRecordType,
  },
  {
    id: 'stool',
    title: '便便',
    icon: 'log',
    status: shortStatus(props.latestLog?.poop || '晚点看'),
    type: 'stool' as QuickRecordType,
  },
  {
    id: 'walk',
    title: props.activePet?.species === 'cat' ? '玩一会' : '散步',
    icon: props.activePet?.species === 'cat' ? 'play' : 'walk',
    status: props.checkInSummary.selectedMode === 'training' ? '可互动' : '晚点看',
    type: 'walk' as QuickRecordType,
  },
  {
    id: 'mood',
    title: '心情',
    icon: 'heart',
    status: shortStatus(props.latestLog?.mood || '平稳'),
    type: 'mood' as QuickRecordType,
  },
])

const quickRecordOptions = computed(() => {
  const options: Record<QuickRecordType, Array<{ label: string; value: string; note: string }>> = {
    appetite: [
      { label: '很好', value: '很好', note: '吃饭很香' },
      { label: '正常', value: '正常', note: '正常吃完' },
      { label: '吃得少', value: '少量进食', note: '今天吃得少，晚点再看看' },
      { label: '没胃口', value: '没胃口', note: '需要留意精神和饮水' },
    ],
    water: [
      { label: '正常', value: '正常', note: '喝水正常' },
      { label: '偏多', value: '偏多', note: '比平时喝得多' },
      { label: '偏少', value: '偏少', note: '今天喝水偏少' },
    ],
    stool: [
      { label: '正常', value: '成形', note: '便便成形' },
      { label: '偏软', value: '略软', note: '便便略软，晚上继续看' },
      { label: '拉稀', value: '拉稀', note: '便便异常，留意精神和食欲' },
      { label: '未看到', value: '未排便', note: '今天还没看到便便' },
    ],
    walk: [
      { label: '走过啦', value: '已散步', note: '今天已经散步' },
      { label: '短短走', value: '短散步', note: '短时间散步，状态平稳' },
      { label: '晚点走', value: '待观察', note: '晚点天气合适再出门' },
    ],
    mood: [
      { label: '开心', value: '开心', note: '今天心情不错' },
      { label: '平稳', value: '平稳', note: '状态平稳' },
      { label: '有点累', value: '有点累', note: '今天偏安静' },
    ],
  }
  return options[quickRecordType.value]
})

const quickRecordTitle = computed(
  () => quickRecordChips.find((chip) => chip.type === quickRecordType.value)?.label || '记录',
)
const latestRecordText = computed(() => {
  const log = props.recentLogs[0] || props.latestLog
  if (!log) return '暂无记录'
  return `${formatDay(log.loggedAt)} · 食欲/饮水/便便${recordTone(log)}`
})

const detailSheetOpen = computed(() => Boolean(detailSheet.value))

watch(
  () => props.activePetId,
  () => {
    quickRecordOpen.value = false
    detailSheet.value = null
  },
)

watch([quickRecordOpen, detailSheetOpen], ([quickOpen, detailOpen]) => {
  const isOpen = quickOpen || detailOpen
  document.documentElement.classList.toggle('sheet-open', isOpen)
  document.body.classList.toggle('sheet-open', isOpen)
})

onUnmounted(() => {
  document.documentElement.classList.remove('sheet-open')
  document.body.classList.remove('sheet-open')
})

function showToast(message: string) {
  toastMessage.value = message
  window.setTimeout(() => {
    if (toastMessage.value === message) toastMessage.value = ''
  }, 1800)
}

function openQuickRecord(type: QuickRecordType) {
  quickRecordType.value = type
  quickRecordValue.value = quickRecordOptions.value[0]?.value || ''
  quickRecordNote.value = quickRecordOptions.value[0]?.note || ''
  quickRecordOpen.value = true
}

function selectQuickRecordOption(option: { value: string; note: string }) {
  quickRecordValue.value = option.value
  quickRecordNote.value = option.note
}

function saveQuickRecord() {
  const payload: Partial<HealthLog> = {
    appetite: props.latestLog?.appetite || '正常',
    waterIntake: props.latestLog?.waterIntake || '正常',
    poop: props.latestLog?.poop || '成形',
    vomiting: props.latestLog?.vomiting || '无',
    energyLevel: props.latestLog?.energyLevel || 4,
    mood: props.latestLog?.mood || '平稳',
    weightKg: props.activePet?.weightKg ?? props.latestLog?.weightKg ?? null,
    notes: quickRecordNote.value,
  }
  if (quickRecordType.value === 'appetite') payload.appetite = quickRecordValue.value
  if (quickRecordType.value === 'water') payload.waterIntake = quickRecordValue.value
  if (quickRecordType.value === 'stool') payload.poop = quickRecordValue.value
  if (quickRecordType.value === 'mood') {
    payload.mood = quickRecordValue.value
    payload.energyLevel = quickRecordValue.value === '开心' ? 5 : quickRecordValue.value === '有点累' ? 3 : 4
  }
  if (quickRecordType.value === 'walk') payload.notes = `${quickRecordValue.value} · ${quickRecordNote.value}`
  emit('saveRecord', payload)
  quickRecordOpen.value = false
  showToast('已帮你记下')
}

function refreshMealPlan() {
  mealRefreshing.value = true
  window.setTimeout(() => {
    mealRefreshing.value = false
    showToast('配餐已更新')
  }, 650)
}

function openDiscovery(item: HomeDiscovery) {
  selectedDiscovery.value = item
  detailSheet.value = 'insight'
}

function openMealDetail() {
  detailSheet.value = 'meal'
}

function closeDetailSheet() {
  detailSheet.value = null
}

function openRecordsFromSheet() {
  closeDetailSheet()
  emit('openRecords')
}

function openAiFromSheet() {
  closeDetailSheet()
  emit(
    'openAi',
    selectedDiscovery.value?.prompt || selectedDiscovery.value?.title || '请展开今天的照看建议。',
  )
}

function buildMealPlan(pet: PetProfile | null, latestLog: HealthLog | null): MealPlan {
  const species = pet?.species === 'cat' ? 'cat' : 'dog'
  const weightKg = normalizeWeightKg(pet, latestLog)
  const ageMonths = getAgeMonths(pet)
  const lifeStage = ageMonths > 0 && ageMonths < 12 ? '幼龄' : '成年'
  const breedProfile = getBreedProfile(pet)
  const sterilized = /已|是|done|yes|true/i.test(pet?.sterilizationStatus || '')
  const dailyCalories = estimateDailyCaloriesForHome(species, weightKg, ageMonths, sterilized, breedProfile)
  const dryKcalPerGram = species === 'cat' ? 3.8 : breedProfile.size === 'large' ? 3.35 : 3.6
  const wetKcalPerGram = species === 'cat' ? 0.95 : 1.15
  const dryRatio = species === 'cat' ? 0.72 : 0.78
  const topperRatio = species === 'cat' ? 0.18 : 0.14
  const dryGrams = roundToFive((dailyCalories * dryRatio) / dryKcalPerGram)
  const topper = pickMealTopper(pet, breedProfile)
  const topperGrams = roundToFive((dailyCalories * topperRatio) / wetKcalPerGram)
  const fiber = pickFiberIngredient(pet, breedProfile)
  const fiberGrams =
    species === 'cat' ? Math.max(5, roundToFive(weightKg * 2)) : Math.max(10, roundToFive(weightKg * 1.5))
  const snackKcal = Math.max(8, Math.round(dailyCalories * 0.08))
  const waterMl = species === 'cat' ? roundToTen(weightKg * 45) : roundToTen(weightKg * 55)
  const poorAppetite = latestLog?.appetite.includes('少') || latestLog?.appetite.includes('没')
  const lowWater = latestLog?.waterIntake.includes('少')
  const softStool = latestLog?.poop.includes('软') || latestLog?.poop.includes('稀')
  const ingredients: MealIngredient[] = [
    {
      name: species === 'cat' ? '成猫/幼猫主粮' : '成犬/幼犬主粮',
      grams: dryGrams,
      note: `${dryRatio * 100}% 热量来自主粮`,
    },
    {
      name: topper,
      grams: topperGrams,
      note: species === 'cat' ? '增加湿润度与适口性' : '作为蛋白搭配，不替代主粮',
    },
    { name: fiber, grams: fiberGrams, note: softStool ? '便便偏软时先减半观察' : '少量增加纤维和饱腹感' },
  ]
  const cautions = [
    pet?.allergies ? `已记录过敏/不耐受：${pet.allergies}，新食材先避开。` : '',
    softStool ? '最近便便异常，今天不要突然加新食材，搭配量先减半。' : '',
    poorAppetite ? '如果持续没胃口、精神差或不喝水，应尽快咨询兽医。' : '',
    '克重为日常估算，不替代处方粮、减重处方或疾病期饮食建议。',
  ].filter(Boolean)

  return {
    main: `${dryGrams}g`,
    mainLabel: '主粮',
    snack: `≤${snackKcal}kcal`,
    water: `${waterMl}ml+`,
    tip: lowWater ? `${topper}加到${topperGrams}g` : `${topper}${topperGrams}g`,
    calories: `${dailyCalories}kcal`,
    basis: `${pet?.breed || (species === 'cat' ? '猫' : '犬')} · ${lifeStage} · ${formatWeight(weightKg)}`,
    detail: [
      `按 ${formatWeight(weightKg)}、${pet?.breed || '未填写品种'}、${lifeStage}${sterilized ? '、已绝育' : ''} 估算，今日约 ${dailyCalories}kcal。`,
      `建议：主粮 ${dryGrams}g + ${topper} ${topperGrams}g + ${fiber} ${fiberGrams}g，零食不超过 ${snackKcal}kcal。`,
      lowWater
        ? `今天饮水偏少，优先把干粮的一小部分换成湿润搭配，并保持 ${waterMl}ml 以上新鲜水。`
        : `饮水目标约 ${waterMl}ml 以上，继续观察体重和便便。`,
    ].join(''),
    ingredients,
    cautions,
  }
}

function normalizeWeightKg(pet: PetProfile | null, latestLog: HealthLog | null) {
  const value = Number(pet?.weightKg ?? latestLog?.weightKg ?? 0)
  if (Number.isFinite(value) && value > 0) return value
  return pet?.species === 'cat' ? 4 : 10
}

function getAgeMonths(pet: PetProfile | null) {
  if (!pet?.birthday) return 0
  const birthday = new Date(pet.birthday)
  if (Number.isNaN(birthday.getTime())) return 0
  const now = new Date()
  return Math.max(0, (now.getFullYear() - birthday.getFullYear()) * 12 + now.getMonth() - birthday.getMonth())
}

function getBreedProfile(pet: PetProfile | null) {
  const breed = `${pet?.breed || ''} ${pet?.ageLabel || ''}`.toLowerCase()
  const species = pet?.species === 'cat' ? 'cat' : 'dog'
  if (species === 'cat') {
    return {
      size: 'cat',
      trait: /英短|British|加菲|exotic|橘|蓝猫/i.test(breed)
        ? 'weight-prone'
        : /布偶|ragdoll|缅因|maine|长毛|波斯|persian/i.test(breed)
          ? 'long-hair'
          : 'balanced',
    }
  }
  if (/金毛|拉布拉多|德牧|阿拉斯加|萨摩|哈士奇|边牧|大型|golden|labrador|husky|shepherd/i.test(breed)) {
    return { size: 'large', trait: 'joint-support' }
  }
  if (/泰迪|贵宾|比熊|博美|约克夏|吉娃娃|小型|poodle|bichon|pomeranian|yorkshire|chihuahua/i.test(breed)) {
    return { size: 'small', trait: 'small-breed' }
  }
  return { size: 'medium', trait: 'balanced' }
}

function estimateDailyCaloriesForHome(
  species: 'cat' | 'dog',
  weightKg: number,
  ageMonths: number,
  sterilized: boolean,
  breedProfile: { size: string; trait: string },
) {
  const rer = 70 * Math.pow(weightKg, 0.75)
  let multiplier = species === 'cat' ? 1.2 : 1.45
  if (ageMonths > 0 && ageMonths < 12) multiplier = species === 'cat' ? 2 : 2.2
  if (sterilized) multiplier -= species === 'cat' ? 0.1 : 0.08
  if (breedProfile.trait === 'weight-prone') multiplier -= 0.08
  if (breedProfile.size === 'large') multiplier += 0.08
  if (breedProfile.size === 'small') multiplier -= 0.05
  return Math.max(60, Math.round(rer * multiplier))
}

function pickMealTopper(pet: PetProfile | null, breedProfile: { trait: string }) {
  const avoid = `${pet?.allergies || ''} ${pet?.foodPreferences || ''}`.toLowerCase()
  if (pet?.species === 'cat') {
    if (!/鱼|fish|三文鱼|salmon/.test(avoid))
      return breedProfile.trait === 'long-hair' ? '三文鱼湿粮' : '鸡肉湿粮'
    if (!/鸡|chicken/.test(avoid)) return '鸡肉湿粮'
    return '鸭肉湿粮'
  }
  if (!/鸡|chicken/.test(avoid)) return '熟鸡胸'
  if (!/羊|lamb/.test(avoid)) return '熟羊肉'
  return '熟白鱼'
}

function pickFiberIngredient(pet: PetProfile | null, breedProfile: { trait: string }) {
  const avoid = `${pet?.allergies || ''} ${pet?.foodPreferences || ''}`.toLowerCase()
  if (pet?.species === 'cat') return breedProfile.trait === 'long-hair' ? '化毛片/南瓜泥' : '南瓜泥'
  if (/南瓜|pumpkin/.test(avoid)) return '胡萝卜泥'
  return breedProfile.trait === 'joint-support' ? '南瓜泥' : '胡萝卜泥'
}

function roundToFive(value: number) {
  return Math.max(5, Math.round(value / 5) * 5)
}

function roundToTen(value: number) {
  return Math.max(50, Math.round(value / 10) * 10)
}

function formatWeight(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}kg`
}

function softenHomeCopy(value: string) {
  return value
    .replaceAll('完成一个轻量互动', '安排一个轻量互动')
    .replaceAll('完成', '记下')
    .replaceAll('任务', '小安排')
    .replaceAll('打卡', '记录')
    .replaceAll('待办', '照看')
    .replaceAll('进度', '状态')
}

function shortStatus(value: string) {
  if (!value) return '正常'
  if (value.includes('还没')) return '待记'
  if (value.includes('少')) return '偏少'
  if (value.includes('多')) return '偏多'
  if (value.includes('成形')) return '成形'
  if (value.includes('软')) return '偏软'
  if (value.includes('稀')) return '异常'
  if (value.includes('没')) return '留意'
  if (value.includes('未')) return '晚点看'
  if (value.length > 4) return value.slice(0, 4)
  return value
}

function compactDiscovery(card: {
  id: string
  title: string
  description: string
  icon: string
  prompt?: string
  route?: string
}) {
  const preset: Record<string, { title: string; status: string }> = {
    social: { title: '社交练习', status: '从短时开始' },
    'home-appetite': { title: '食欲留意', status: '先看精神' },
    vaccine: { title: '驱虫疫苗', status: '按月龄安排' },
    'walk-trend': { title: '散步少了', status: '晚点可以走走' },
    'diet-stable': { title: '饮食稳定', status: '继续观察体重' },
    training: { title: '可加互动', status: '轻松训练5分钟' },
    'food-compare': { title: '口粮对比', status: '看成分热量' },
    report: { title: '报告解读', status: '整理异常项' },
    export: { title: '记录导出', status: '就医前整理' },
    hospital: { title: '附近医院', status: '先备急诊电话' },
  }
  const compact = preset[card.id]
  return {
    id: card.id,
    icon: card.icon,
    title: compact?.title || trimText(card.title, 8),
    status: compact?.status || trimText(card.description, 12),
    detail: card.description,
    prompt: card.prompt,
    route: card.route,
  }
}

function trimText(value: string, maxLength: number) {
  const compact = value.replace(/\s+/g, '').trim()
  return compact.length > maxLength ? compact.slice(0, maxLength) : compact
}

function recordTone(log: HealthLog) {
  return [log.appetite, log.waterIntake, log.poop].some(
    (value) => value.includes('少') || value.includes('稀') || value.includes('没'),
  )
    ? '需留意'
    : '正常'
}

function formatDay(value?: string) {
  if (!value) return '最近'
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}
</script>

<template>
  <section class="home-page" :class="`mode-${mode}`">
    <div v-if="toastMessage" class="home-toast">{{ toastMessage }}</div>

    <article class="pet-status-card">
      <div class="hero-top-actions" aria-hidden="true">
        <span><AppIcon name="more" :size="18" /></span>
        <span><AppIcon name="reminder" :size="17" /></span>
      </div>

      <button class="pet-avatar" type="button" @click="emit('selectPet', activePetId)">
        <img v-if="activePet?.avatarUrl" :src="activePet.avatarUrl" alt="" />
        <span v-else>{{ petInitial }}</span>
      </button>

      <div class="hero-side-metrics" aria-label="今日状态概览">
        <button
          v-for="item in lifeMoments.slice(1, 4)"
          :key="`hero-${item.id}`"
          type="button"
          @click="openQuickRecord(item.type)"
        >
          <AppIcon :name="item.icon" :size="15" />
          <small>{{ item.status }}</small>
        </button>
      </div>

      <div class="pet-status-copy">
        <p class="today-eyebrow">Living pulse</p>
        <div class="pet-title-row">
          <h1>{{ petName }}</h1>
          <strong>{{ todayStatus }}</strong>
        </div>
        <p>{{ todayReminder }}</p>
      </div>
    </article>

    <section class="life-flow-section">
      <div class="compact-section-head">
        <h2>生活快照</h2>
        <button type="button" aria-label="查看生活记录" @click="emit('openRecords')">查看</button>
      </div>
      <div class="life-flow-row">
        <button v-for="item in lifeMoments" :key="item.id" type="button" @click="openQuickRecord(item.type)">
          <span><AppIcon :name="item.icon" :size="18" /></span>
          <strong>{{ item.title }}</strong>
          <small>{{ item.status }}</small>
        </button>
      </div>
    </section>

    <article class="meal-summary-card" :class="{ loading: mealRefreshing }">
      <div class="compact-section-head">
        <div>
          <h2>今日配餐</h2>
          <p>{{ mealPlan.basis }} · {{ mealPlan.calories }}</p>
        </div>
        <div class="meal-head-actions">
          <button type="button" aria-label="查看今日配餐详情" @click="openMealDetail">详情</button>
          <button type="button" aria-label="调整今日配餐" @click="refreshMealPlan">调整</button>
        </div>
      </div>
      <div class="meal-visual" aria-label="今日推荐食材">
        <div class="ingredient-orbit" aria-hidden="true">
          <span
            v-for="(ingredient, index) in mealPlan.ingredients"
            :key="ingredient.name"
            :style="{ '--ingredient-index': index }"
          >
            {{ ingredient.name.slice(0, 1) }}
          </span>
        </div>
        <div class="meal-ingredient-stack">
          <span v-for="ingredient in mealPlan.ingredients" :key="`visual-${ingredient.name}`">
            <strong>{{ ingredient.name }}</strong>
            <small>{{ ingredient.grams }}g</small>
          </span>
        </div>
        <button type="button" class="food-recommend-action" @click="emit('openAi', foodRecommendationPrompt)">
          要不要推荐{{ foodKindLabel }}？
        </button>
      </div>
      <div class="meal-lines">
        <span class="meal-line-primary">
          <small>{{ mealPlan.mainLabel }}</small>
          <strong>{{ mealPlan.main }}</strong>
        </span>
        <span v-for="ingredient in mealPlan.ingredients.slice(1)" :key="ingredient.name">
          <small>{{ ingredient.name }}</small>
          <strong>{{ ingredient.grams }}g</strong>
        </span>
        <span>
          <small>零食</small>
          <strong>{{ mealPlan.snack }}</strong>
        </span>
      </div>
      <footer>
        <p>建议搭配：{{ mealPlan.tip }}，饮水 {{ mealPlan.water }}。</p>
      </footer>
    </article>

    <section class="recommend-section" :class="`tone-${experienceContent.tone}`">
      <div class="compact-section-head">
        <h2>今天留意</h2>
        <button
          type="button"
          aria-label="查看更多今日留意建议"
          @click="emit('openAi', experienceContent.primaryAction.prompt)"
        >
          更多
        </button>
      </div>
      <div class="recommend-list">
        <button
          v-for="item in discoveryItems"
          :key="item.id"
          type="button"
          class="recommend-item"
          @click="openDiscovery(item)"
        >
          <span><AppIcon :name="item.icon" :size="17" /></span>
          <div>
            <strong>{{ item.title }}</strong>
            <small>{{ item.status }}</small>
          </div>
        </button>
      </div>
    </section>

    <article class="recent-record-card">
      <div>
        <strong>最近记录</strong>
        <p>{{ latestRecordText }}</p>
      </div>
      <button type="button" aria-label="查看最近记录" @click="emit('openRecords')">查看</button>
    </article>

    <div v-if="detailSheet" class="record-sheet-backdrop" @click.self="closeDetailSheet">
      <section class="record-sheet detail-sheet" role="dialog" aria-modal="true" aria-label="详情">
        <header>
          <div>
            <p>{{ detailSheet === 'meal' ? '配餐详情' : '发现详情' }}</p>
            <h2>{{ detailSheet === 'meal' ? '今日配餐' : selectedDiscovery?.title || '今天留意' }}</h2>
          </div>
          <button type="button" @click="closeDetailSheet">收起</button>
        </header>

        <template v-if="detailSheet === 'meal'">
          <div class="detail-metric-grid">
            <span v-for="ingredient in mealPlan.ingredients" :key="ingredient.name">
              <small>{{ ingredient.name }}</small>
              <strong>{{ ingredient.grams }}g</strong>
            </span>
            <span>
              <small>零食</small>
              <strong>{{ mealPlan.snack }}</strong>
            </span>
            <span>
              <small>补水</small>
              <strong>{{ mealPlan.water }}</strong>
            </span>
          </div>
          <p class="detail-copy">{{ mealPlan.detail }}</p>
          <ul class="meal-caution-list">
            <li v-for="caution in mealPlan.cautions" :key="caution">{{ caution }}</li>
          </ul>
          <button class="sheet-save" type="button" @click="emit('generatePlan')">详情</button>
        </template>

        <template v-else>
          <p class="detail-copy">{{ selectedDiscovery?.detail || aiDetailLine }}</p>
          <button
            v-if="selectedDiscovery?.route === 'records'"
            class="sheet-save"
            type="button"
            @click="openRecordsFromSheet"
          >
            查看
          </button>
          <button v-else class="sheet-save" type="button" @click="openAiFromSheet">更多</button>
        </template>
      </section>
    </div>

    <div v-if="quickRecordOpen" class="record-sheet-backdrop" @click.self="quickRecordOpen = false">
      <section class="record-sheet" role="dialog" aria-modal="true" :aria-label="`记录${quickRecordTitle}`">
        <header>
          <div>
            <p>记一笔</p>
            <h2>{{ quickRecordTitle }}</h2>
          </div>
          <button type="button" @click="quickRecordOpen = false">收起</button>
        </header>
        <div class="sheet-options">
          <button
            v-for="option in quickRecordOptions"
            :key="option.value"
            type="button"
            :class="{ active: option.value === quickRecordValue }"
            @click="selectQuickRecordOption(option)"
          >
            <strong>{{ option.label }}</strong>
            <span>{{ option.note }}</span>
          </button>
        </div>
        <label>
          补充一句
          <textarea v-model="quickRecordNote" rows="3" placeholder="例如：晚饭后精神很好"></textarea>
        </label>
        <button class="sheet-save" type="button" @click="saveQuickRecord">记一笔</button>
      </section>
    </div>
  </section>
</template>

<style scoped>
.home-page {
  position: relative;
  display: grid;
  gap: 12px;
  color: #332820;
}

.pet-status-card,
.ai-discovery-card,
.meal-summary-card,
.recommend-section,
.recent-record-card {
  border: 1px solid rgba(145, 116, 78, 0.1);
  background: rgba(255, 255, 255, 0.68);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.72) inset,
    0 10px 28px rgba(91, 66, 38, 0.06);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.pet-status-card {
  position: relative;
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr);
  gap: 8px 12px;
  align-items: center;
  min-height: 124px;
  max-height: 136px;
  padding: 12px;
  border-radius: 24px;
  background: linear-gradient(135deg, rgba(255, 248, 237, 0.96), rgba(255, 238, 216, 0.9)), #fff7ed;
}

.pet-avatar {
  display: grid;
  width: 54px;
  height: 54px;
  place-items: center;
  overflow: hidden;
  border: 2px solid #fff;
  border-radius: 19px;
  background: linear-gradient(135deg, #eca350, #d9783d);
  color: #fffaf3;
  font: inherit;
  font-size: 20px;
  font-weight: 950;
  box-shadow: 0 8px 18px rgba(217, 120, 61, 0.22);
}

.pet-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pet-status-copy {
  min-width: 0;
  padding-bottom: 26px;
}

.pet-title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.pet-title-row h1,
.compact-section-head h2,
.record-sheet h2 {
  margin: 0;
  letter-spacing: 0;
}

.pet-title-row h1 {
  overflow: hidden;
  color: #2f281f;
  font-size: 22px;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pet-title-row small {
  flex: 0 0 auto;
  color: #b97135;
  font-size: 11px;
  font-weight: 950;
}

.pet-status-copy p,
.pet-status-copy strong,
.pet-status-copy span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pet-status-copy p {
  margin: 3px 0 0;
  color: #8b7967;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.2;
}

.pet-status-copy strong {
  margin-top: 5px;
  color: #3c3027;
  font-size: 13px;
  line-height: 1.2;
}

.pet-status-copy span {
  margin-top: 3px;
  color: #9b6a38;
  font-size: 12px;
  font-weight: 850;
  line-height: 1.25;
}

.status-actions {
  position: absolute;
  right: 12px;
  bottom: 10px;
  left: 78px;
  display: flex;
  gap: 6px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.status-actions::-webkit-scrollbar {
  display: none;
}

.status-actions button,
.quick-record-strip button,
.compact-section-head button,
.meal-actions button,
.recent-record-card button,
.record-sheet header button,
.sheet-save {
  border: 0;
  font: inherit;
  font-weight: 950;
}

.status-actions button {
  flex: 0 0 auto;
  min-height: 26px;
  border-radius: 14px;
  padding: 0 9px;
  background: rgba(255, 255, 255, 0.62);
  color: #a66432;
  font-size: 11px;
}

.ai-discovery-card {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-height: 78px;
  padding: 12px 13px;
  border-radius: 22px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.88), rgba(250, 244, 255, 0.7)), rgba(255, 255, 255, 0.7);
}

.ai-discovery-card > span {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 14px;
  background: #f4eefb;
  color: #6656af;
}

.ai-discovery-card strong,
.recent-record-card strong {
  display: block;
  color: #332820;
  font-size: 13px;
}

.ai-discovery-card p,
.meal-summary-card p,
.recent-record-card p {
  margin: 3px 0 0;
  color: #766655;
  font-size: 13px;
  line-height: 1.38;
}

.ai-discovery-card p,
.meal-summary-card p {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.ai-discovery-card button {
  min-height: 34px;
  border: 0;
  border-radius: 999px;
  padding: 0 10px;
  background: rgba(255, 255, 255, 0.74);
  color: #6656af;
  font: inherit;
  font-size: 12px;
  font-weight: 950;
  white-space: nowrap;
}

.quick-record-strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  margin: 0 -16px;
  padding: 0 16px 2px;
  scrollbar-width: none;
}

.quick-record-strip::-webkit-scrollbar,
.life-flow-row::-webkit-scrollbar {
  display: none;
}

.quick-record-strip button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 38px;
  min-width: 68px;
  border-radius: 999px;
  padding: 0 13px;
  background: rgba(255, 255, 255, 0.7);
  color: #8f6238;
  font-size: 13px;
  box-shadow: 0 6px 16px rgba(91, 66, 38, 0.04);
}

.life-flow-section {
  display: grid;
  gap: 9px;
  min-width: 0;
}

.compact-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.compact-section-head p,
.record-sheet p {
  margin: 0;
  color: #bd7932;
  font-size: 11px;
  font-weight: 950;
}

.compact-section-head h2 {
  margin-top: 2px;
  color: #2f281f;
  font-size: 19px;
  line-height: 1.18;
}

.compact-section-head button {
  flex: 0 0 auto;
  min-height: 32px;
  border-radius: 999px;
  padding: 0 10px;
  background: rgba(255, 255, 255, 0.64);
  color: #a66432;
  font-size: 12px;
}

.life-flow-row {
  display: flex;
  gap: 9px;
  overflow-x: auto;
  margin: 0 -16px;
  padding: 0 16px 4px;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
}

.life-flow-row button {
  display: grid;
  flex: 0 0 102px;
  height: 92px;
  align-content: center;
  gap: 6px;
  border: 1px solid rgba(145, 116, 78, 0.1);
  border-radius: 18px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.66);
  color: #332820;
  font: inherit;
  text-align: left;
  scroll-snap-align: start;
  box-shadow: 0 8px 20px rgba(91, 66, 38, 0.05);
}

.life-flow-row span {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 12px;
  background: #fff0dc;
  color: #c9782b;
}

.life-flow-row strong {
  font-size: 13px;
  line-height: 1.15;
}

.life-flow-row small {
  overflow: hidden;
  color: #8b7b68;
  font-size: 11px;
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meal-summary-card {
  display: grid;
  gap: 8px;
  min-height: 132px;
  padding: 13px 14px;
  border-radius: 23px;
  background:
    linear-gradient(135deg, rgba(255, 248, 237, 0.9), rgba(255, 255, 255, 0.7)), rgba(255, 255, 255, 0.68);
}

.meal-summary-card.loading {
  opacity: 0.78;
}

.meal-lines {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.meal-lines strong,
.meal-lines span,
.meal-lines button {
  min-height: 26px;
  border: 0;
  border-radius: 999px;
  padding: 5px 9px;
  background: #fff8ef;
  color: #7c6048;
  font: inherit;
  font-size: 12px;
  font-weight: 900;
}

.meal-lines strong {
  color: #332820;
}

.meal-lines .primary-action {
  background: linear-gradient(135deg, #df8544, #c96f3a);
  color: #fffaf3;
  box-shadow: 0 8px 18px rgba(217, 130, 75, 0.2);
}

.meal-actions {
  display: flex;
  align-items: center;
  margin-top: -2px;
}

.meal-actions button {
  min-height: 28px;
  border-radius: 14px;
  padding: 0;
  background: transparent;
  color: #a66432;
  font-size: 12px;
}

.recommend-section {
  display: grid;
  gap: 10px;
  padding: 15px;
  border-radius: 23px;
}

.recommend-section.tone-gentle {
  background: linear-gradient(135deg, rgba(255, 246, 232, 0.9), rgba(255, 255, 255, 0.72));
}

.recommend-section.tone-observant {
  background: linear-gradient(135deg, rgba(246, 251, 244, 0.88), rgba(255, 249, 240, 0.72));
}

.recommend-section.tone-direct {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(246, 242, 235, 0.72));
}

.recommend-list {
  display: grid;
  gap: 8px;
}

.recommend-item {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  min-height: 62px;
  border: 1px solid rgba(145, 116, 78, 0.09);
  border-radius: 17px;
  padding: 9px 10px;
  background: rgba(255, 255, 255, 0.62);
  color: #332820;
  font: inherit;
  text-align: left;
}

.recommend-item > span {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 13px;
  background: #fff0dc;
  color: #c9782b;
}

.tone-observant .recommend-item > span {
  background: #edf7ec;
  color: #6e8f56;
}

.tone-direct .recommend-item > span {
  background: #f2eee8;
  color: #7f624b;
}

.recommend-item strong,
.recommend-item small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recommend-item strong {
  color: #332820;
  font-size: 13px;
}

.recommend-item small {
  margin-top: 2px;
  color: #7e6d5c;
  font-size: 12px;
  font-weight: 750;
}

.recent-record-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  min-height: 70px;
  padding: 13px 14px;
  border-radius: 22px;
}

.recent-record-card button {
  min-height: 34px;
  border-radius: 999px;
  padding: 0 12px;
  background: #fff0dc;
  color: #a66432;
  font-size: 12px;
  white-space: nowrap;
}

.home-toast {
  position: fixed;
  right: 18px;
  bottom: calc(130px + env(safe-area-inset-bottom));
  left: 18px;
  z-index: 40;
  max-width: 420px;
  margin: 0 auto;
  padding: 11px 14px;
  border-radius: 17px;
  background: rgba(54, 42, 32, 0.92);
  color: #fff8ef;
  font-size: 13px;
  font-weight: 900;
  text-align: center;
  box-shadow: 0 18px 40px rgba(53, 39, 27, 0.18);
  animation: toast-rise 0.22s ease both;
}

.record-sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 35;
  display: grid;
  align-items: end;
  background: rgba(42, 32, 23, 0.22);
  backdrop-filter: blur(10px);
}

.record-sheet {
  display: grid;
  gap: 14px;
  width: min(100%, 560px);
  margin: 0 auto;
  padding: 18px 16px max(18px, env(safe-area-inset-bottom));
  border-radius: 26px 26px 0 0;
  background: #fffaf4;
  box-shadow: 0 -22px 44px rgba(48, 35, 24, 0.16);
}

.record-sheet header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.record-sheet h2 {
  margin-top: 2px;
  color: #2f281f;
  font-size: 20px;
}

.record-sheet header button {
  min-height: 44px;
  border-radius: 999px;
  padding: 0 10px;
  background: rgba(255, 240, 220, 0.72);
  color: #9f6a3c;
  font-size: 13px;
}

.sheet-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.sheet-options button {
  display: grid;
  min-height: 68px;
  gap: 5px;
  place-items: center;
  border: 1px solid rgba(145, 116, 78, 0.12);
  border-radius: 17px;
  background: #fff;
  color: #332820;
  font: inherit;
}

.sheet-options button.active {
  border-color: rgba(217, 130, 75, 0.42);
  background: #fff0dc;
  box-shadow: 0 0 0 3px rgba(217, 130, 75, 0.1);
}

.sheet-options strong {
  font-size: 14px;
}

.sheet-options span {
  color: #8b7b68;
  font-size: 11px;
  font-weight: 850;
}

.record-sheet label {
  display: grid;
  gap: 8px;
  color: #7e6d5c;
  font-size: 12px;
  font-weight: 950;
}

.record-sheet textarea {
  width: 100%;
  border: 1px solid rgba(145, 116, 78, 0.12);
  border-radius: 14px;
  padding: 11px 12px;
  background: #fffaf4;
  color: #332820;
  font: inherit;
  font-size: 16px;
  resize: vertical;
}

.sheet-save {
  min-height: 44px;
  border-radius: 15px;
  background: linear-gradient(135deg, #df8544, #c96f3a);
  color: #fff;
  font-size: 13px;
  box-shadow: 0 8px 18px rgba(217, 130, 75, 0.22);
}

button:active {
  transform: scale(0.97);
}

.home-page {
  gap: 13px;
}

.pet-status-card,
.meal-summary-card,
.recommend-section,
.recent-record-card {
  border-color: rgba(59, 47, 41, 0.08);
  background: rgba(255, 255, 255, 0.78);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.78) inset,
    0 8px 20px rgba(82, 62, 38, 0.055);
}

.pet-status-card {
  grid-template-columns: 52px minmax(0, 1fr) auto;
  min-height: 88px;
  max-height: none;
  gap: 12px;
  padding: 14px;
  border-radius: 22px;
  background: rgba(255, 252, 247, 0.86);
}

.pet-avatar {
  width: 52px;
  height: 52px;
  border-radius: 17px;
  box-shadow: 0 7px 14px rgba(217, 120, 61, 0.14);
}

.pet-status-copy {
  padding-bottom: 0;
}

.pet-title-row {
  justify-content: flex-start;
}

.pet-title-row h1 {
  max-width: 48vw;
  font-size: 20px;
  line-height: 1.12;
}

.pet-title-row strong {
  display: inline-flex;
  flex: 0 0 auto;
  min-height: 23px;
  align-items: center;
  border-radius: 999px;
  padding: 0 8px;
  background: #fff0dc;
  color: #a66432;
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
  white-space: nowrap;
}

.pet-status-copy p {
  margin-top: 7px;
  color: #7f705f;
  font-size: 13px;
  font-weight: 700;
}

.status-action {
  min-height: 44px;
  border: 0;
  border-radius: 999px;
  padding: 0 13px;
  background: #d9824b;
  color: #fffaf3;
  font: inherit;
  font-size: 13px;
  font-weight: 850;
  white-space: nowrap;
  box-shadow: 0 8px 16px rgba(217, 130, 75, 0.16);
}

.life-flow-section {
  gap: 8px;
}

.compact-section-head h2 {
  color: #2f281f;
  font-size: 18px;
  font-weight: 800;
  line-height: 1.2;
}

.compact-section-head button,
.recent-record-card button {
  min-height: 44px;
  border-radius: 999px;
  padding: 0 10px;
  background: rgba(255, 255, 255, 0.52);
  color: #9b6a38;
  font-size: 13px;
  font-weight: 800;
}

.meal-head-actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
}

.meal-head-actions button:last-child {
  min-height: 44px;
  border-radius: 999px;
  padding: 0 14px;
  background: #d9824b;
  color: #fffaf3;
  box-shadow: 0 8px 16px rgba(217, 130, 75, 0.14);
}

.life-flow-row {
  gap: 8px;
  padding-bottom: 6px;
}

.life-flow-row button {
  flex-basis: 102px;
  min-height: 104px;
  height: auto;
  align-content: start;
  gap: 7px;
  border-color: rgba(59, 47, 41, 0.08);
  border-radius: 22px;
  padding: 12px 12px 10px;
  background: rgba(255, 255, 255, 0.74);
  box-shadow: none;
}

.life-flow-row span {
  width: 32px;
  height: 32px;
  border-radius: 13px;
  background: #f4efe8;
  color: #9b7657;
}

.life-flow-row strong {
  overflow: hidden;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.18;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.life-flow-row small {
  color: #7f705f;
  font-size: 12px;
  font-weight: 750;
  line-height: 1.18;
}

.meal-summary-card {
  gap: 6px;
  min-height: 0;
  padding: 12px;
  border-radius: 22px;
  background: rgba(255, 252, 247, 0.84);
}

.meal-lines {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.meal-lines span {
  display: grid;
  min-width: 0;
  min-height: 38px;
  align-content: center;
  gap: 2px;
  border: 1px solid rgba(59, 47, 41, 0.07);
  border-radius: 14px;
  padding: 4px 7px;
  background: #fff8ef;
}

.meal-lines small,
.detail-metric-grid small {
  overflow: hidden;
  color: #9b8d7c;
  font-size: 10px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meal-lines strong,
.detail-metric-grid strong {
  min-height: 0;
  border: 0;
  border-radius: 0;
  padding: 0;
  background: transparent;
  overflow: hidden;
  color: #332820;
  font-size: 13px;
  font-weight: 850;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meal-summary-card footer {
  display: block;
}

.meal-summary-card footer p {
  display: block;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: #7f705f;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recommend-section {
  gap: 6px;
  min-height: 0;
  max-height: none;
  padding: 10px 12px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.78) !important;
}

.recommend-list {
  gap: 4px;
}

.recommend-item {
  min-height: 48px;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 8px;
  border-color: rgba(59, 47, 41, 0.07);
  border-radius: 14px;
  padding: 6px 9px;
  background: rgba(255, 252, 247, 0.72);
}

.recommend-item > span,
.tone-observant .recommend-item > span,
.tone-direct .recommend-item > span {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  background: #f4efe8;
  color: #8f765f;
}

.recommend-item strong {
  font-size: 13px;
  font-weight: 850;
  line-height: 1.05;
}

.recommend-item small {
  max-width: 100%;
  margin-top: 1px;
  color: #7f705f;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.05;
}

.recent-record-card {
  min-height: 78px;
  padding: 14px;
  border-radius: 22px;
}

.recent-record-card strong {
  font-size: 16px;
  font-weight: 800;
}

.recent-record-card p {
  display: block;
  margin-top: 5px;
  overflow: hidden;
  color: #7f705f;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record-sheet-backdrop {
  overscroll-behavior: contain;
}

.record-sheet {
  gap: 13px;
  padding: 17px 16px max(18px, env(safe-area-inset-bottom));
  border-radius: 24px 24px 0 0;
  background: #fffaf4;
}

.detail-sheet {
  max-height: min(76vh, 520px);
  overflow-y: auto;
}

.detail-metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.detail-metric-grid span {
  display: grid;
  min-width: 0;
  gap: 4px;
  border: 1px solid rgba(59, 47, 41, 0.08);
  border-radius: 15px;
  padding: 10px;
  background: #fff8ef;
}

.detail-copy {
  margin: 0;
  color: #5f5145;
  font-size: 14px;
  font-weight: 650;
  line-height: 1.62;
}

.record-sheet h2 {
  font-size: 20px;
}

.sheet-save {
  font-weight: 850;
  box-shadow: 0 8px 18px rgba(217, 130, 75, 0.16);
}

.home-page {
  --ritual-ink: #342b22;
  --ritual-muted: #7b705f;
  --ritual-green: #77805a;
  --ritual-moss: #59603f;
  --ritual-cream: rgba(255, 251, 243, 0.82);
}

.pet-status-card {
  isolation: isolate;
  display: grid;
  grid-template-columns: 1fr;
  align-items: end;
  min-height: clamp(318px, 58vh, 440px);
  overflow: hidden;
  padding: 16px;
  border-color: rgba(74, 68, 45, 0.12);
  border-radius: 32px;
  background:
    radial-gradient(circle at 50% 22%, rgba(255, 247, 226, 0.92) 0 19%, transparent 29%),
    radial-gradient(circle at 78% 20%, rgba(242, 166, 83, 0.42), transparent 19%),
    linear-gradient(
      165deg,
      rgba(254, 245, 229, 0.92) 0%,
      rgba(175, 160, 112, 0.5) 52%,
      rgba(242, 236, 218, 0.94) 100%
    );
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.86) inset,
    0 26px 58px rgba(87, 71, 45, 0.16);
}

.pet-status-card::before,
.pet-status-card::after {
  position: absolute;
  right: -18%;
  bottom: 32%;
  left: -18%;
  z-index: -1;
  height: 150px;
  border-radius: 50% 50% 0 0;
  background: linear-gradient(180deg, rgba(112, 125, 78, 0.72), rgba(91, 99, 64, 0.62));
  content: '';
}

.pet-status-card::after {
  right: -28%;
  bottom: 25%;
  left: 12%;
  height: 122px;
  background: linear-gradient(180deg, rgba(91, 101, 63, 0.62), rgba(74, 82, 51, 0.42));
}

.hero-top-actions {
  position: absolute;
  top: 14px;
  right: 14px;
  left: 14px;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  pointer-events: none;
}

.hero-top-actions span,
.hero-side-metrics button {
  display: grid;
  place-items: center;
  border: 1px solid rgba(74, 68, 45, 0.09);
  background: rgba(255, 252, 246, 0.62);
  color: rgba(68, 59, 45, 0.74);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.72) inset,
    0 12px 24px rgba(66, 55, 37, 0.1);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.hero-top-actions span {
  width: 40px;
  height: 40px;
  border-radius: 16px;
}

.pet-status-card .pet-avatar {
  position: relative;
  z-index: 2;
  align-self: start;
  justify-self: center;
  width: clamp(132px, 39vw, 172px);
  height: clamp(132px, 39vw, 172px);
  margin-top: 42px;
  border: 5px solid rgba(255, 250, 241, 0.92);
  border-radius: 50%;
  background: linear-gradient(135deg, #e1a157, #c7783f);
  box-shadow:
    0 0 0 18px rgba(255, 252, 246, 0.18),
    0 22px 42px rgba(61, 48, 31, 0.22);
}

.pet-status-card .pet-avatar span {
  color: #fffaf3;
  font-size: 46px;
}

.hero-side-metrics {
  position: absolute;
  top: 76px;
  right: 15px;
  z-index: 3;
  display: grid;
  gap: 9px;
}

.hero-side-metrics button {
  min-width: 48px;
  min-height: 48px;
  border-radius: 18px;
  padding: 6px 7px;
  font: inherit;
  gap: 2px;
}

.hero-side-metrics small {
  max-width: 42px;
  overflow: hidden;
  color: rgba(81, 74, 58, 0.68);
  font-size: 9px;
  font-weight: 850;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pet-status-card .pet-status-copy {
  z-index: 2;
  display: grid;
  width: 100%;
  gap: 5px;
  padding: 14px 16px;
  border: 1px solid rgba(255, 255, 255, 0.64);
  border-radius: 24px;
  background: rgba(255, 252, 246, 0.72);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.78) inset,
    0 18px 38px rgba(66, 55, 37, 0.12);
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
}

.pet-status-card .today-eyebrow {
  margin: 0;
  color: rgba(112, 119, 79, 0.88);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pet-status-card .pet-title-row {
  justify-content: space-between;
}

.pet-status-card .pet-title-row h1 {
  max-width: none;
  color: var(--ritual-ink);
  font-size: 26px;
  font-weight: 950;
}

.pet-status-card .pet-title-row strong {
  background: rgba(237, 232, 210, 0.74);
  color: #6c744d;
}

.pet-status-card .pet-status-copy > p:not(.today-eyebrow) {
  margin: 0;
  color: var(--ritual-muted);
  font-size: 13px;
  font-weight: 760;
}

.pet-status-card .status-action {
  z-index: 2;
  display: inline-flex;
  width: fit-content;
  min-height: 40px;
  align-items: center;
  justify-self: center;
  gap: 6px;
  margin-top: -2px;
  border: 1px solid rgba(255, 255, 255, 0.52);
  background: rgba(255, 252, 246, 0.78);
  color: #7a7f55;
  box-shadow: 0 14px 28px rgba(66, 55, 37, 0.12);
}

.meal-summary-card {
  overflow: hidden;
  border-radius: 28px;
  background: linear-gradient(180deg, rgba(255, 249, 237, 0.9), rgba(239, 232, 210, 0.88)), #fffaf3;
}

.meal-visual {
  position: relative;
  display: grid;
  min-height: 132px;
  align-items: center;
  gap: 12px;
  overflow: hidden;
  border-radius: 24px;
  padding: 18px 14px 14px;
  background:
    radial-gradient(circle at 12% 18%, rgba(255, 255, 255, 0.7), transparent 18%),
    radial-gradient(circle at 82% 22%, rgba(220, 132, 66, 0.22), transparent 18%),
    linear-gradient(135deg, rgba(244, 239, 225, 0.92), rgba(230, 236, 219, 0.78));
}

.ingredient-orbit {
  position: absolute;
  right: 14px;
  bottom: 14px;
  width: 78px;
  height: 58px;
  pointer-events: none;
}

.ingredient-orbit span {
  position: absolute;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(220, 132, 66, 0.92), rgba(177, 121, 73, 0.88));
  color: #fffaf3;
  font-size: 14px;
  font-weight: 950;
  opacity: 0.36;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.58) inset,
    0 10px 18px rgba(68, 55, 35, 0.14);
  animation: ingredient-float 2.8s ease-in-out infinite;
  animation-delay: calc(var(--ingredient-index) * -0.45s);
  transform: translate(calc(var(--ingredient-index) * -24px), calc(var(--ingredient-index) * 13px));
}

.meal-ingredient-stack {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 8px;
  padding-right: 0;
}

.meal-ingredient-stack span {
  display: flex;
  min-height: 34px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid rgba(255, 255, 255, 0.66);
  border-radius: 999px;
  padding: 7px 10px 7px 12px;
  background: rgba(255, 252, 246, 0.68);
  box-shadow: 0 8px 18px rgba(77, 62, 38, 0.07);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.meal-ingredient-stack strong {
  overflow: hidden;
  color: #3b3128;
  font-size: 13px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meal-ingredient-stack small {
  flex: 0 0 auto;
  color: #7c7f56;
  font-size: 12px;
  font-weight: 950;
}

.food-recommend-action {
  position: relative;
  z-index: 1;
  width: fit-content;
  min-height: 36px;
  border: 0;
  border-radius: 999px;
  padding: 0 13px;
  background: rgba(255, 252, 246, 0.78);
  color: #9a6739;
  font: inherit;
  font-size: 12px;
  font-weight: 950;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.74) inset,
    0 10px 20px rgba(66, 55, 37, 0.1);
}

.meal-lines span {
  border-radius: 18px;
  background: rgba(255, 252, 246, 0.74);
}

.meal-lines {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.meal-lines .meal-line-primary {
  background: rgba(255, 246, 226, 0.84);
}

.meal-caution-list {
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.meal-caution-list li {
  border-radius: 13px;
  padding: 9px 10px;
  background: rgba(255, 246, 232, 0.82);
  color: #7a6049;
  font-size: 12px;
  font-weight: 720;
  line-height: 1.45;
}

@media (max-width: 370px) {
  .pet-status-card {
    grid-template-columns: 48px minmax(0, 1fr);
    padding: 12px;
  }

  .pet-avatar {
    width: 48px;
    height: 48px;
  }

  .pet-title-row h1 {
    max-width: 42vw;
    font-size: 18px;
  }

  .status-action {
    grid-column: 1 / -1;
    width: 100%;
  }

  .life-flow-row button {
    flex-basis: 88px;
  }

  .meal-lines {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .recommend-section {
    padding: 10px;
  }
}

@media (min-width: 900px) {
  .mode-desktop {
    gap: 16px;
  }

  .mode-desktop .pet-status-card {
    grid-template-columns: 58px minmax(0, 1fr) auto;
  }

  .mode-desktop .status-actions {
    grid-column: auto;
  }

  .mode-desktop .quick-record-strip {
    margin: 0;
    padding: 0;
    overflow: visible;
  }

  .mode-desktop .life-flow-row {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    margin: 0;
    padding: 0;
    overflow: visible;
  }

  .mode-desktop .life-flow-row button {
    width: auto;
  }

  .mode-desktop .record-sheet-backdrop {
    align-items: center;
  }

  .mode-desktop .record-sheet {
    border-radius: 26px;
  }
}

@media (max-width: 370px) {
  .pet-status-card {
    grid-template-columns: 1fr;
    min-height: 304px;
    padding: 12px;
  }

  .pet-status-card .pet-avatar {
    width: 118px;
    height: 118px;
    margin-top: 40px;
  }

  .pet-status-card .pet-title-row h1 {
    max-width: none;
    font-size: 23px;
  }

  .pet-status-card .status-action {
    grid-column: auto;
    width: fit-content;
  }

  .hero-side-metrics {
    right: 12px;
  }

  .hero-side-metrics button {
    min-width: 42px;
    min-height: 42px;
  }

  .meal-visual {
    min-height: 128px;
    padding-right: 10px;
    padding-left: 10px;
  }

  .meal-ingredient-stack {
    padding-right: 0;
  }

  .ingredient-orbit {
    right: 8px;
    bottom: 10px;
    width: 64px;
    opacity: 0.72;
  }

  .ingredient-orbit span {
    width: 28px;
    height: 28px;
    font-size: 12px;
  }
}

@media (min-width: 900px) {
  .mode-desktop .pet-status-card {
    grid-template-columns: 1fr;
    min-height: 360px;
  }

  .mode-desktop .pet-status-card .pet-avatar {
    width: 168px;
    height: 168px;
  }
}

@keyframes toast-rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

@keyframes ingredient-float {
  0%,
  100% {
    translate: 0 0;
  }

  50% {
    translate: 0 -6px;
  }
}
</style>
