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

const mealPlan = computed(() => {
  if (props.activePet?.species === 'cat') {
    return {
      main: '35g',
      mainLabel: '主粮',
      snack: '≤3块',
      water: '换新水',
      tip: props.latestLog?.waterIntake.includes('少') ? '多给湿粮' : '先不调整',
      detail: props.latestLog?.waterIntake.includes('少')
        ? '今天饮水偏少，可以把一部分干粮换成湿粮，并保持水碗新鲜。'
        : '今天状态平稳，先维持原来的喂食节奏，继续观察饮水和体重。',
    }
  }
  return {
    main: '120g',
    mainLabel: '主粮',
    snack: '≤40kcal',
    water: '外出后补水',
    tip: '先不调整',
    detail: '把部分零食换成训练奖励会更稳，外出后记得补水，今天先不急着调整主粮。',
  }
})

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
      <button class="pet-avatar" type="button" @click="emit('selectPet', activePetId)">
        <img v-if="activePet?.avatarUrl" :src="activePet.avatarUrl" alt="" />
        <span v-else>{{ petInitial }}</span>
      </button>
      <div class="pet-status-copy">
        <div class="pet-title-row">
          <h1>{{ petName }}</h1>
          <strong>{{ todayStatus }}</strong>
        </div>
        <p>{{ todayReminder }}</p>
      </div>
      <button
        class="status-action"
        type="button"
        aria-label="快速记录宠物状态"
        @click="openQuickRecord('appetite')"
      >
        记一笔
      </button>
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
        <h2>今日配餐</h2>
        <div class="meal-head-actions">
          <button type="button" aria-label="查看今日配餐详情" @click="openMealDetail">详情</button>
          <button type="button" aria-label="调整今日配餐" @click="refreshMealPlan">调整</button>
        </div>
      </div>
      <div class="meal-lines">
        <span>
          <small>{{ mealPlan.mainLabel }}</small>
          <strong>{{ mealPlan.main }}</strong>
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
      <footer>
        <p>状态平稳，{{ mealPlan.tip }}。</p>
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
            <span>
              <small>{{ mealPlan.mainLabel }}</small>
              <strong>{{ mealPlan.main }}</strong>
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
  padding-bottom: 3px;
}

.life-flow-row button {
  flex-basis: 94px;
  height: 84px;
  gap: 5px;
  border-color: rgba(59, 47, 41, 0.08);
  border-radius: 18px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.74);
  box-shadow: none;
}

.life-flow-row span {
  width: 28px;
  height: 28px;
  border-radius: 11px;
  background: #f4efe8;
  color: #9b7657;
}

.life-flow-row strong {
  font-size: 13px;
  font-weight: 800;
}

.life-flow-row small {
  color: #7f705f;
  font-size: 12px;
  font-weight: 750;
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
    grid-template-columns: 1fr;
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

@keyframes toast-rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}
</style>
