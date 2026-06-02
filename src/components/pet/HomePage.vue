<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import type { DailyCheckInMode, DailyCheckInSummary } from '../../composables/useDailyCheckIn'
import type { HealthLog, PetProfile } from '../../stores/chat'

type HomeMode = 'mobile' | 'desktop'
type QuickRecordType = 'appetite' | 'water' | 'stool' | 'energy'
type PipelineStatus = 'done' | 'current' | 'pending'
type ActivityStatus = 'pending' | 'started' | 'done'

interface PipelineStep {
  id: string
  type: 'checkin' | 'meal' | 'record' | 'activity' | 'training' | 'care'
  title: string
  description: string
  time: string
  icon: string
  status: PipelineStatus
}

interface ActivityRecommendation {
  id: string
  type: 'play' | 'training' | 'knowledge'
  title: string
  description: string
  steps: string[]
  estimatedMinutes: number
  difficulty: string
  reason: string
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
  }>(),
  {
    mode: 'mobile',
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

const completedStepIds = ref<Set<string>>(new Set())
const activityIndexByPet = reactive<Record<string, number>>({})
const activityStatusByPet = reactive<Record<string, ActivityStatus>>({})
const quickRecordOpen = ref(false)
const quickRecordType = ref<QuickRecordType>('appetite')
const quickRecordValue = ref('')
const quickRecordNote = ref('')
const toastMessage = ref('')
const mealRefreshing = ref(false)

const petName = computed(() => props.activePet?.name || '毛孩子')
const petOptions = computed(() => props.pets.slice(0, 4))
const checkInModeLabel = computed(() =>
  props.checkInSummary.selectedMode ? modeLabel(props.checkInSummary.selectedMode) : '今日节奏待选择',
)

const mealPlan = computed(() => {
  const pet = props.activePet
  if (pet?.species === 'cat') {
    return {
      title: '今日配餐',
      breakfast: '早餐：主粮 35g',
      dinner: '晚餐：湿粮 1/2 罐 + 主粮 20g',
      snackLimit: '零食：冻干不超过 3 小块',
      waterTip: '饮水：换一碗新鲜水，观察尿团',
      nutritionTip: props.latestLog?.waterIntake.includes('少')
        ? '最近饮水偏少，可以增加湿粮比例。'
        : '今天保持稳定喂食，晚间补一条精神记录。',
    }
  }
  return {
    title: '今日配餐',
    breakfast: '早餐：鸡肉配方粮 120g',
    dinner: '晚餐：减少 5%，搭配 10 分钟互动游戏',
    snackLimit: '零食：不超过 40 kcal',
    waterTip: '饮水：外出或训练后补新鲜水',
    nutritionTip: 'Cooper 精力旺盛，今天把部分零食换成训练奖励更合适。',
  }
})

const activityRecommendations = computed<ActivityRecommendation[]>(() => {
  if (props.activePet?.species === 'cat') {
    return [
      {
        id: 'cat-wand',
        type: 'play',
        title: '逗猫棒 10 分钟',
        description: '让今天多一点小猎手的快乐。',
        steps: ['模拟小猎物贴地移动', '让它追逐和扑抓两轮', '结束后给一点小奖励'],
        estimatedMinutes: 10,
        difficulty: '轻松',
        reason: '适合健康猫咪释放精力，也能观察精神状态。',
      },
      {
        id: 'cat-water',
        type: 'knowledge',
        title: '如何让猫多喝水',
        description: '今天的小课堂：让饮水变得自然一点。',
        steps: ['把水碗远离食盆', '每天换新鲜水', '适当增加湿粮比例'],
        estimatedMinutes: 3,
        difficulty: '入门',
        reason: '饮水习惯是猫咪日常照护里很值得关注的小事。',
      },
    ]
  }
  return [
    {
      id: 'dog-sit',
      type: 'training',
      title: '坐下训练',
      description: '5 分钟练出一点默契。',
      steps: ['拿一颗小零食吸引注意', '手慢慢向上移动，让狗狗自然坐下', '坐下瞬间说“坐下”并奖励'],
      estimatedMinutes: 5,
      difficulty: '入门',
      reason: `${petName.value} 精力比较旺盛，短训练可以消耗精力，也能增强互动。`,
    },
    {
      id: 'dog-sniff',
      type: 'play',
      title: '找零食小游戏',
      description: '用嗅闻消耗精力，比单纯吃零食更有趣。',
      steps: ['准备 3-5 颗小零食', '藏在毛巾或玩具旁边', '找到后轻声夸奖并结束'],
      estimatedMinutes: 8,
      difficulty: '轻松',
      reason: '适合饭后或散步前，能让陪伴更有参与感。',
    },
  ]
})

const activeActivity = computed(() => {
  const list = sortedActivities.value
  const index = activityIndexByPet[props.activePetId] || 0
  return list[index % list.length]
})
const sortedActivities = computed(() => {
  const preferred = props.checkInSummary.selectedMode
  return [...activityRecommendations.value].sort(
    (a, b) => activityPriority(a, preferred) - activityPriority(b, preferred),
  )
})
const activityStatus = computed(() => activityStatusByPet[props.activePetId] || 'pending')

const pipelineSteps = computed<PipelineStep[]>(() => {
  const steps: PipelineStep[] = [
    {
      id: 'checkin',
      type: 'checkin',
      title: props.activePet?.species === 'cat' ? '早晨问候' : '早晨问候',
      description: props.checkInSummary.checkedIn ? '今日已打卡' : '开始今天的陪伴',
      time: '早上',
      icon: 'heart',
      status: props.checkInSummary.checkedIn || completedStepIds.value.has('checkin') ? 'done' : 'pending',
    },
    {
      id: 'meal',
      type: 'meal',
      title: props.activePet?.species === 'cat' ? '早餐/换水' : '早餐喂食',
      description: props.activePet?.species === 'cat' ? mealPlan.value.breakfast : mealPlan.value.breakfast,
      time: '08:00',
      icon: 'food',
      status: completedStepIds.value.has('meal') ? 'done' : 'pending',
    },
    {
      id: 'record',
      type: 'record',
      title: props.activePet?.species === 'cat' ? '便便记录' : '饮水记录',
      description:
        props.hasTodayLog || completedStepIds.value.has('record') ? '今天已有记录' : '10 秒记录状态',
      time: '现在',
      icon: 'log',
      status: props.hasTodayLog || completedStepIds.value.has('record') ? 'done' : 'pending',
    },
    {
      id: 'activity',
      type: activeActivity.value?.type === 'training' ? 'training' : 'activity',
      title: activeActivity.value?.type === 'training' ? '训练/散步' : '陪伴游戏',
      description: activeActivity.value?.title || '今日陪伴任务',
      time: '傍晚',
      icon: activeActivity.value?.type === 'training' ? 'trophy' : 'play',
      status: activityStatus.value === 'done' || completedStepIds.value.has('activity') ? 'done' : 'pending',
    },
    {
      id: 'care',
      type: 'care',
      title: props.activePet?.species === 'cat' ? '晚间观察' : '睡前记录',
      description: '结束今天的小照顾',
      time: '睡前',
      icon: 'sparkle',
      status: completedStepIds.value.has('care') ? 'done' : 'pending',
    },
  ]
  const firstPending = steps.find((step) => step.status === 'pending')
  return steps.map((step) => (step.id === firstPending?.id ? { ...step, status: 'current' } : step))
})
const completedPipelineCount = computed(
  () => pipelineSteps.value.filter((step) => step.status === 'done').length,
)
const currentStep = computed(
  () => pipelineSteps.value.find((step) => step.status === 'current') || pipelineSteps.value.at(-1),
)

const quickRecordOptions = computed(() => {
  const options: Record<QuickRecordType, Array<{ label: string; value: string; note: string }>> = {
    appetite: [
      { label: '很好', value: '很好', note: '食欲很好' },
      { label: '正常', value: '正常', note: '正常吃完' },
      { label: '吃得少', value: '少量进食', note: '今天吃得少' },
      { label: '没胃口', value: '没胃口', note: '需要晚点观察' },
    ],
    water: [
      { label: '正常', value: '正常', note: '饮水正常' },
      { label: '偏多', value: '偏多', note: '比平时多' },
      { label: '偏少', value: '偏少', note: '需要提醒喝水' },
    ],
    stool: [
      { label: '正常', value: '成形', note: '便便正常' },
      { label: '偏软', value: '略软', note: '晚上继续观察' },
      { label: '拉稀', value: '拉稀', note: '记录完成，注意精神和食欲' },
      { label: '未排便', value: '未排便', note: '今天还没看到' },
    ],
    energy: [
      { label: '活跃', value: '活跃', note: '精神很好' },
      { label: '平稳', value: '平稳', note: '状态平稳' },
      { label: '有点累', value: '有点累', note: '今天偏安静' },
    ],
  }
  return options[quickRecordType.value]
})

watch(
  () => props.activePetId,
  () => {
    quickRecordOpen.value = false
  },
)

function showToast(message: string) {
  toastMessage.value = message
  window.setTimeout(() => {
    if (toastMessage.value === message) toastMessage.value = ''
  }, 1800)
}

function completePipelineStep(step: PipelineStep) {
  const next = new Set(completedStepIds.value)
  next.add(step.id)
  completedStepIds.value = next
  if (step.id === 'record') openQuickRecord(props.activePet?.species === 'cat' ? 'stool' : 'water')
  if (step.id === 'activity') completeActivity()
  showToast(`${step.title} 已加入今日陪伴流水线`)
}

function refreshMealPlan() {
  mealRefreshing.value = true
  window.setTimeout(() => {
    mealRefreshing.value = false
    showToast('今日配餐已更新')
  }, 650)
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
  if (quickRecordType.value === 'energy') {
    payload.mood = quickRecordValue.value
    payload.energyLevel = quickRecordValue.value === '活跃' ? 5 : quickRecordValue.value === '有点累' ? 3 : 4
  }
  emit('saveRecord', payload)
  completedStepIds.value = new Set([...completedStepIds.value, 'record'])
  quickRecordOpen.value = false
  showToast('已记录，这条记录已加入今天的陪伴流水线')
}

function startActivity() {
  activityStatusByPet[props.activePetId] = 'started'
  showToast('任务已开始，慢慢来就好')
}

function switchActivity() {
  activityIndexByPet[props.activePetId] = (activityIndexByPet[props.activePetId] || 0) + 1
  activityStatusByPet[props.activePetId] = 'pending'
}

function completeActivity() {
  activityStatusByPet[props.activePetId] = 'done'
  completedStepIds.value = new Set([...completedStepIds.value, 'activity'])
  showToast('完成啦，今天也有好好陪它')
}

function modeLabel(mode: DailyCheckInMode) {
  const map: Record<DailyCheckInMode, string> = {
    relaxed: '轻松陪伴',
    care: '认真护理',
    training: '训练一下',
    memory: '记录瞬间',
  }
  return map[mode]
}

function activityPriority(activity: ActivityRecommendation, mode: DailyCheckInMode | null) {
  if (mode === 'training') return activity.type === 'training' ? 0 : 1
  if (mode === 'memory') return activity.type === 'knowledge' ? 0 : 1
  if (mode === 'care') return activity.type === 'knowledge' ? 0 : 1
  return activity.type === 'play' ? 0 : 1
}
</script>

<template>
  <section class="home-page" :class="`mode-${mode}`">
    <!-- Playful Background Elements -->
    <div class="bg-decorations" aria-hidden="true">
      <span class="decor-paw decor-1"><AppIcon name="heart" :size="24" /></span>
      <span class="decor-sparkle decor-2"><AppIcon name="sparkle" :size="20" /></span>
      <span class="decor-paw decor-3"><AppIcon name="food" :size="28" /></span>
    </div>

    <div v-if="toastMessage" class="home-toast">{{ toastMessage }}</div>

    <article class="compact-pet-header">
      <button class="pet-avatar" type="button" @click="emit('selectPet', activePetId)">
        <img v-if="activePet?.avatarUrl" :src="activePet.avatarUrl" alt="" />
        <span v-else>{{ activePet?.name?.slice(0, 1) || '宠' }}</span>
      </button>
      <div class="pet-header-copy">
        <h1>{{ petName }}</h1>
        <p>{{ activePetSummary }}</p>
        <strong
          >今日已打卡 · 陪伴第 {{ checkInSummary.companionDayCount }} 天 · {{ checkInModeLabel }}</strong
        >
      </div>
      <div class="pet-switcher-mini">
        <button
          v-for="pet in petOptions"
          :key="pet.id"
          type="button"
          :class="{ active: pet.id === activePetId }"
          @click="emit('selectPet', pet.id)"
        >
          {{ pet.name.slice(0, 1) }}
        </button>
        <button type="button" @click="emit('addPet')"><AppIcon name="plus" :size="16" /></button>
      </div>
    </article>

    <div class="home-dashboard">
      <section class="daily-pipeline home-card">
        <div class="section-head">
          <div>
            <p>Daily Pipeline</p>
            <h2>今日陪伴流水线</h2>
          </div>
          <span>{{ completedPipelineCount }}/{{ pipelineSteps.length }} 已完成</span>
        </div>
        <div class="pipeline-summary">
          <strong>下一步：{{ currentStep?.title }}</strong>
          <small>今天也在好好照顾它</small>
        </div>
        <div class="pipeline-steps">
          <button
            v-for="step in pipelineSteps"
            :key="step.id"
            type="button"
            class="pipeline-step"
            :class="step.status"
            @click="completePipelineStep(step)"
          >
            <span><AppIcon :name="step.status === 'done' ? 'check' : step.icon" :size="17" /></span>
            <strong>{{ step.title }}</strong>
            <small>{{ step.time }}</small>
          </button>
        </div>
      </section>

      <section class="meal-card home-card" :class="{ loading: mealRefreshing }">
        <div class="section-head">
          <div>
            <p>Meal Plan</p>
            <h2>{{ mealPlan.title }}</h2>
          </div>
          <span><AppIcon name="food" :size="18" /></span>
        </div>
        <div class="meal-hero">
          <span class="bowl-icon"><AppIcon name="food" :size="24" /></span>
          <div>
            <strong>{{ mealPlan.breakfast }}</strong>
            <small>{{ mealPlan.dinner }}</small>
          </div>
        </div>
        <div class="meal-points">
          <p>{{ mealPlan.snackLimit }}</p>
          <p>{{ mealPlan.waterTip }}</p>
          <p>{{ mealPlan.nutritionTip }}</p>
        </div>
        <div class="action-row">
          <button type="button" class="primary-action" @click="refreshMealPlan">调整配餐</button>
          <button type="button" @click="emit('generatePlan')">生成配餐</button>
          <button type="button" @click="emit('openAi', '请根据当前宠物档案给出今天的口粮与零食建议。')">
            查看口粮推荐
          </button>
        </div>
      </section>

      <section class="quick-record-card home-card">
        <div class="section-head">
          <div>
            <p>Quick Record</p>
            <h2>10 秒快速记录</h2>
          </div>
          <button type="button" @click="emit('openRecords')">更多</button>
        </div>
        <div class="quick-record-row">
          <button type="button" @click="openQuickRecord('appetite')">
            <AppIcon name="food" :size="17" /> 食欲
          </button>
          <button type="button" @click="openQuickRecord('water')">
            <AppIcon name="water" :size="17" /> 饮水
          </button>
          <button type="button" @click="openQuickRecord('stool')">
            <AppIcon name="log" :size="17" /> 便便
          </button>
          <button type="button" @click="openQuickRecord('energy')">
            <AppIcon name="heart" :size="17" /> 精神
          </button>
        </div>
      </section>

      <section v-if="activeActivity" class="activity-card home-card">
        <div class="section-head">
          <div>
            <p>
              {{
                activeActivity.type === 'training'
                  ? 'Training'
                  : activeActivity.type === 'knowledge'
                    ? 'Knowledge'
                    : 'Activity'
              }}
            </p>
            <h2>
              {{
                activeActivity.type === 'training'
                  ? '今日训练小任务'
                  : activeActivity.type === 'knowledge'
                    ? '今日宠物小课堂'
                    : '今天玩什么'
              }}
            </h2>
          </div>
          <span>{{ activityStatus === 'done' ? '已完成' : `${activeActivity.estimatedMinutes} 分钟` }}</span>
        </div>
        <div class="activity-title-row">
          <span
            ><AppIcon
              :name="
                activeActivity.type === 'training'
                  ? 'trophy'
                  : activeActivity.type === 'knowledge'
                    ? 'sparkle'
                    : 'play'
              "
              :size="20"
          /></span>
          <div>
            <strong>{{ activeActivity.title }} · {{ activeActivity.estimatedMinutes }} 分钟</strong>
            <small>难度：{{ activeActivity.difficulty }}</small>
          </div>
        </div>
        <p class="activity-description">{{ activeActivity.description }}</p>
        <ol>
          <li v-for="step in activeActivity.steps" :key="step">{{ step }}</li>
        </ol>
        <p class="activity-reason">适合原因：{{ activeActivity.reason }}</p>
        <div class="action-row">
          <button type="button" class="primary-action" @click="startActivity">开始</button>
          <button type="button" @click="switchActivity">换一个</button>
          <button type="button" @click="completeActivity">完成打卡</button>
          <button type="button" @click="emit('openAi', `请详细讲讲：${activeActivity.title}`)">
            查看知识
          </button>
        </div>
      </section>

      <section class="ai-tip-card home-card">
        <div>
          <strong>PetExpert AI</strong>
          <p>{{ aiInsight || `${petName} 今天适合做一个 5 分钟互动任务，完成后可以记录精神状态。` }}</p>
        </div>
        <button type="button" @click="emit('openAi', '根据今天的配餐、记录和活动，给我一句今日建议。')">
          问问 AI
        </button>
      </section>
    </div>

    <div v-if="quickRecordOpen" class="record-sheet-backdrop" @click.self="quickRecordOpen = false">
      <section class="record-sheet">
        <header>
          <div>
            <p>快速记录</p>
            <h2>
              {{
                quickRecordType === 'appetite'
                  ? '食欲'
                  : quickRecordType === 'water'
                    ? '饮水'
                    : quickRecordType === 'stool'
                      ? '便便'
                      : '精神'
              }}
            </h2>
          </div>
          <button type="button" @click="quickRecordOpen = false">关闭</button>
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
        <button class="sheet-save" type="button" @click="saveQuickRecord">保存记录</button>
      </section>
    </div>
  </section>
</template>

<style scoped>
.home-page {
  position: relative;
  display: grid;
  gap: 14px;
  color: #332820;
}

.bg-decorations {
  display: none;
}

.bg-decorations span {
  position: absolute;
  color: rgba(217, 130, 75, 0.15);
  animation: float-decor 6s ease-in-out infinite;
}

.decor-1 {
  top: 5%;
  right: 10%;
  transform: rotate(15deg);
  animation-delay: 0s;
}

.decor-2 {
  top: 40%;
  left: -2%;
  color: rgba(102, 86, 175, 0.12) !important;
  animation-delay: 1.5s;
}

.decor-3 {
  bottom: 15%;
  right: -5%;
  transform: rotate(-20deg);
  animation-delay: 3s;
}

@keyframes float-decor {
  0%,
  100% {
    transform: translateY(0) rotate(inherit);
  }
  50% {
    transform: translateY(-15px) rotate(calc(inherit + 10deg));
  }
}

.compact-pet-header,
.home-card {
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.65);
  box-shadow:
    0 8px 32px rgba(142, 104, 60, 0.04),
    inset 0 0 0 1px rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  transition:
    transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.3s ease;
}

.home-card:hover {
  transform: none;
}

.compact-pet-header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 11px;
  align-items: center;
  padding: 13px 12px;
  border-radius: 22px;
  background: linear-gradient(135deg, rgba(255, 249, 240, 0.96), rgba(255, 239, 219, 0.9)), #fff7ec;
}

.pet-avatar {
  display: grid;
  width: 50px;
  height: 50px;
  place-items: center;
  overflow: hidden;
  border: 2px solid #fff;
  border-radius: 20px;
  background: linear-gradient(135deg, #eea24e, #d9783d);
  color: #fff8ef;
  font: inherit;
  font-size: 18px;
  font-weight: 950;
  box-shadow: 0 8px 16px rgba(217, 120, 61, 0.25);
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.pet-avatar:hover {
  transform: none;
}

.pet-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pet-header-copy {
  min-width: 0;
}

.pet-header-copy h1,
.section-head h2,
.record-sheet h2 {
  margin: 0;
  letter-spacing: 0;
}

.pet-header-copy h1 {
  font-size: 22px;
  line-height: 1.08;
}

.pet-header-copy p,
.pet-header-copy strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pet-header-copy p {
  margin: 4px 0 0;
  color: #877664;
  font-size: 12px;
  font-weight: 800;
}

.pet-header-copy strong {
  margin-top: 5px;
  color: #bd7431;
  font-size: 12px;
  font-weight: 950;
}

.pet-switcher-mini {
  display: flex;
  gap: 6px;
}

.pet-switcher-mini button {
  display: grid;
  width: 31px;
  height: 31px;
  place-items: center;
  border: 1px solid rgba(145, 116, 78, 0.12);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  color: #a66d38;
  font: inherit;
  font-size: 12px;
  font-weight: 950;
}

.pet-switcher-mini button.active {
  background: #d9824b;
  color: #fff;
}

.home-dashboard {
  display: grid;
  gap: 14px;
}

.home-card {
  display: grid;
  gap: 13px;
  padding: 16px;
  border-radius: 22px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-head p,
.record-sheet p {
  margin: 0;
  color: #bd7932;
  font-size: 11px;
  font-weight: 950;
  letter-spacing: 0;
  text-transform: uppercase;
}

.section-head h2 {
  margin-top: 3px;
  font-size: 18px;
}

.section-head > span,
.section-head > button {
  border: 0;
  background: transparent;
  color: #bd7431;
  font: inherit;
  font-size: 12px;
  font-weight: 950;
  white-space: nowrap;
}

.pipeline-summary {
  display: grid;
  gap: 3px;
  padding: 12px;
  border-radius: 17px;
  background: #fff8ef;
}

.pipeline-summary strong {
  font-size: 15px;
}

.pipeline-summary small,
.activity-title-row small,
.meal-hero small,
.activity-description,
.activity-reason,
.ai-tip-card p {
  color: #7e6d5c;
  line-height: 1.5;
}

.pipeline-steps {
  display: grid;
  grid-template-columns: repeat(5, 96px);
  gap: 8px;
  margin: 0 -4px;
  overflow-x: auto;
  padding: 1px 4px 5px;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
}

.pipeline-steps::-webkit-scrollbar {
  display: none;
}

.pipeline-step {
  display: grid;
  min-width: 0;
  min-height: 92px;
  align-content: center;
  justify-items: center;
  gap: 6px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 20px;
  padding: 8px 5px;
  background: rgba(255, 255, 255, 0.4);
  color: #7c6c5a;
  font: inherit;
  text-align: center;
  scroll-snap-align: start;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.pipeline-step:hover:not(.done) {
  transform: none;
}

.pipeline-step:active:not(.done) {
  transform: scale(0.96);
}

.pipeline-step span,
.bowl-icon,
.activity-title-row > span {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.8);
  color: #c9782b;
  box-shadow: 0 4px 10px rgba(201, 120, 43, 0.1);
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.pipeline-step:hover:not(.done) span {
  transform: none;
}

.pipeline-step strong {
  overflow-wrap: anywhere;
  color: #342b22;
  font-size: 12px;
  line-height: 1.2;
}

.pipeline-step small {
  color: #9a8a79;
  font-size: 10px;
  font-weight: 850;
}

.pipeline-step.done {
  border-color: rgba(217, 130, 75, 0.26);
  background: #fff0dc;
}

.pipeline-step.done span {
  animation: check-pop 260ms ease both;
}

.pipeline-step.current {
  border-color: rgba(217, 130, 75, 0.5);
  background: rgba(255, 255, 255, 0.9);
  box-shadow:
    0 0 0 4px rgba(217, 130, 75, 0.15),
    0 8px 20px rgba(217, 130, 75, 0.1);
  transform: translateY(-2px);
}

.meal-card.loading {
  opacity: 0.78;
}

.meal-hero {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 13px;
  border-radius: 18px;
  background: #fff8ef;
}

.meal-hero strong,
.activity-title-row strong {
  display: block;
  color: #332820;
  font-size: 15px;
}

.meal-hero small {
  display: block;
  margin-top: 5px;
  font-size: 13px;
}

.meal-points {
  display: grid;
  gap: 7px;
}

.meal-points p {
  margin: 0;
  color: #746453;
  font-size: 13px;
  line-height: 1.45;
}

.action-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.action-row button,
.sheet-save {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 14px;
  padding: 0 14px;
  background: rgba(255, 255, 255, 0.5);
  color: #9d6534;
  font: inherit;
  font-size: 13px;
  font-weight: 950;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.action-row button:hover,
.sheet-save:hover {
  transform: none;
}

.action-row button:active,
.sheet-save:active {
  transform: scale(0.96);
}

.action-row .primary-action,
.sheet-save {
  border-color: #d9824b;
  background: linear-gradient(135deg, #df8544, #c96f3a);
  color: #fff;
  box-shadow: 0 6px 16px rgba(217, 130, 75, 0.25);
}

.action-row .primary-action:hover,
.sheet-save:hover {
  background: linear-gradient(135deg, #e69152, #d67a44);
  box-shadow: 0 8px 20px rgba(217, 130, 75, 0.35);
}

.quick-record-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.quick-record-row button {
  display: grid;
  min-height: 72px;
  place-items: center;
  gap: 6px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.4);
  color: #8f6238;
  font: inherit;
  font-size: 13px;
  font-weight: 950;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.quick-record-row button:hover {
  transform: none;
}

.quick-record-row button:hover :deep(svg) {
  transform: none;
}

.quick-record-row button:active {
  transform: scale(0.96);
}

.activity-title-row {
  display: flex;
  gap: 11px;
  align-items: center;
}

.activity-card ol {
  display: grid;
  gap: 7px;
  margin: 0;
  padding-left: 22px;
  color: #4f4033;
  font-size: 13px;
  line-height: 1.45;
}

.activity-description,
.activity-reason {
  margin: 0;
  font-size: 13px;
}

.ai-tip-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.85), rgba(247, 243, 255, 0.65));
  box-shadow:
    0 8px 24px rgba(102, 86, 175, 0.08),
    inset 0 0 0 1px rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.ai-tip-card strong {
  display: block;
  color: #6656af;
  font-size: 13px;
}

.ai-tip-card p {
  margin: 4px 0 0;
  font-size: 13px;
}

.ai-tip-card button {
  flex: 0 0 auto;
  min-height: 38px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 14px;
  padding: 0 14px;
  background: rgba(255, 255, 255, 0.6);
  color: #6656af;
  font: inherit;
  font-size: 13px;
  font-weight: 950;
  box-shadow: 0 4px 12px rgba(102, 86, 175, 0.1);
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.ai-tip-card button:hover {
  transform: none;
}

.ai-tip-card button:active {
  transform: scale(0.96);
}

.home-toast {
  position: fixed;
  right: 20px;
  bottom: 92px;
  left: 20px;
  z-index: 40;
  max-width: 420px;
  margin: 0 auto;
  padding: 12px 16px;
  border-radius: 18px;
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
  background: rgba(42, 32, 23, 0.24);
  backdrop-filter: blur(10px);
}

.record-sheet {
  display: grid;
  gap: 16px;
  width: min(100%, 560px);
  margin: 0 auto;
  padding: 20px 18px max(20px, env(safe-area-inset-bottom));
  border-radius: 28px 28px 0 0;
  background: #fffaf4;
  box-shadow: 0 -22px 44px rgba(48, 35, 24, 0.16);
}

.record-sheet header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.record-sheet header button {
  border: 0;
  background: transparent;
  color: #9f6a3c;
  font: inherit;
  font-weight: 950;
}

.sheet-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}

.sheet-options button {
  display: grid;
  min-height: 78px;
  gap: 6px;
  place-items: center;
  border: 1px solid rgba(145, 116, 78, 0.12);
  border-radius: 18px;
  background: #fff;
  color: #332820;
  font: inherit;
}

.sheet-options button.active {
  border-color: rgba(217, 130, 75, 0.42);
  background: #fff0dc;
  box-shadow: 0 0 0 3px rgba(217, 130, 75, 0.1);
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
  font-size: 13px;
  resize: vertical;
}

@media (max-width: 430px) {
  .compact-pet-header {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .pet-switcher-mini {
    grid-column: 1 / -1;
  }

  .ai-tip-card {
    grid-template-columns: 1fr;
    align-items: flex-start;
  }

  .ai-tip-card button {
    width: 100%;
    min-height: 44px;
  }
}

@media (min-width: 900px) {
  .mode-desktop .home-dashboard {
    grid-template-columns: minmax(0, 1.1fr) minmax(330px, 0.9fr);
    align-items: start;
  }

  .mode-desktop .daily-pipeline {
    grid-column: 1 / -1;
  }

  .mode-desktop .pipeline-steps {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    margin: 0;
    overflow: visible;
    padding: 0;
  }

  .mode-desktop .quick-record-row {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .mode-desktop .action-row {
    display: flex;
    flex-wrap: wrap;
  }

  .mode-desktop .activity-card {
    grid-column: 1;
  }

  .mode-desktop .quick-record-card,
  .mode-desktop .ai-tip-card {
    grid-column: 2;
  }

  .mode-desktop .record-sheet-backdrop {
    align-items: center;
  }

  .mode-desktop .record-sheet {
    border-radius: 28px;
  }

  .mode-desktop .home-toast {
    right: 34px;
    bottom: 28px;
    left: auto;
  }
}

@keyframes pet-bounce-idle {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-4px) scale(1.02);
  }
}

@keyframes check-pop {
  50% {
    transform: scale(1.12);
  }
}

@keyframes toast-rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}
</style>
