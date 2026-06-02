<script setup lang="ts">
import { computed, ref } from 'vue'
import CheckInMascot from './CheckInMascot.vue'
import type { DailyCheckInMode } from '../../composables/useDailyCheckIn'
import type { PetProfile } from '../../stores/chat'

const props = defineProps<{
  pet: PetProfile | null
  companionDays: number
  streakCount: number
}>()

const emit = defineEmits<{
  (event: 'complete', value: DailyCheckInMode): void
  (event: 'addPet'): void
}>()

const selectedMode = ref<DailyCheckInMode>('relaxed')
const isSuccess = ref(false)

const petName = computed(() => props.pet?.name || '毛孩子')
const hasPet = computed(() => Boolean(props.pet))
const modes: Array<{ id: DailyCheckInMode; title: string; hint: string }> = [
  { id: 'relaxed', title: '轻松陪伴', hint: '慢慢来，也很好' },
  { id: 'care', title: '认真护理', hint: '把小照顾做稳' },
  { id: 'training', title: '训练一下', hint: '练出一点默契' },
  { id: 'memory', title: '记录瞬间', hint: '留下今天的可爱' },
]

function complete() {
  if (!hasPet.value) {
    emit('addPet')
    return
  }
  if (isSuccess.value) return
  isSuccess.value = true
  window.setTimeout(() => emit('complete', selectedMode.value), 760)
}
</script>

<template>
  <main class="check-in-screen" :class="{ success: isSuccess }">
    <section class="check-in-card">
      <div class="check-in-copy">
        <p>今日陪伴打卡</p>
        <h1>{{ hasPet ? `${petName} 正在等你` : '先添加一位宠物伙伴' }}</h1>
        <span>{{
          hasPet ? `今天和 ${petName} 的第 ${companionDays} 天` : '添加档案后，就能开启每天的陪伴打卡'
        }}</span>
      </div>

      <CheckInMascot
        :species="pet?.species || 'dog'"
        :avatar-url="pet?.avatarUrl || ''"
        :initial="petName.slice(0, 1)"
        :success="isSuccess"
      />

      <article v-if="hasPet" class="streak-card">
        <span>陪伴第 {{ companionDays }} 天</span>
        <strong>连续陪伴 {{ streakCount }} 天</strong>
        <small>今天也一起好好生活吧</small>
      </article>
      <article v-else class="streak-card empty-pet-card">
        <span>新用户第一步</span>
        <strong>建立宠物档案</strong>
        <small>名字、品种和生日会让每天的建议更贴近它。</small>
      </article>

      <section v-if="hasPet" class="mode-selector" aria-label="今天想怎么陪它">
        <div>
          <h2>今天想怎么陪它？</h2>
          <p>选一个今天的节奏，Home 会优先推荐相关任务。</p>
        </div>
        <div class="mode-grid">
          <button
            v-for="mode in modes"
            :key="mode.id"
            type="button"
            :class="{ active: selectedMode === mode.id }"
            @click="selectedMode = mode.id"
          >
            <strong>{{ mode.title }}</strong>
            <span>{{ mode.hint }}</span>
          </button>
        </div>
      </section>

      <div class="check-in-actions">
        <button class="primary-action" type="button" @click="complete">
          {{ !hasPet ? '添加宠物档案' : isSuccess ? '打卡成功，今天也有好好陪它' : `进入 ${petName} 的今天` }}
        </button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.check-in-screen {
  min-height: 100vh;
  min-height: 100svh;
  display: grid;
  place-items: center;
  padding: max(18px, env(safe-area-inset-top)) 16px max(18px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top, rgba(255, 255, 255, 0.9), transparent 36%),
    linear-gradient(180deg, #fffaf3 0%, #fff0dc 100%);
  color: #332820;
  animation: check-in-enter 320ms ease both;
}

.check-in-card {
  display: grid;
  width: min(100%, 520px);
  gap: 18px;
  padding: 24px 18px 20px;
  border: 1px solid rgba(145, 116, 78, 0.12);
  border-radius: 32px;
  background: rgba(255, 252, 247, 0.84);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.8) inset,
    0 26px 64px rgba(91, 66, 38, 0.12);
  backdrop-filter: blur(18px);
}

.check-in-copy {
  display: grid;
  gap: 6px;
  text-align: center;
}

.check-in-copy p,
.mode-selector p,
.streak-card small {
  margin: 0;
}

.check-in-copy p {
  color: #bd7932;
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0;
}

.check-in-copy h1 {
  margin: 0;
  color: #2f281f;
  font-size: clamp(28px, 8vw, 42px);
  line-height: 1.1;
  letter-spacing: 0;
}

.check-in-copy span,
.mode-selector p,
.streak-card small {
  color: #877664;
  font-size: 13px;
  font-weight: 800;
}

.streak-card {
  display: grid;
  gap: 5px;
  padding: 15px 16px;
  border: 1px solid rgba(217, 130, 75, 0.16);
  border-radius: 22px;
  background: linear-gradient(135deg, #fff8ef, #fff1de);
  text-align: center;
}

.streak-card span {
  color: #bd7932;
  font-size: 12px;
  font-weight: 950;
}

.streak-card strong {
  color: #342b22;
  font-size: 19px;
}

.mode-selector {
  display: grid;
  gap: 12px;
}

.mode-selector h2 {
  margin: 0;
  color: #2f281f;
  font-size: 18px;
  letter-spacing: 0;
  text-align: center;
}

.mode-selector p {
  margin-top: 4px;
  text-align: center;
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.mode-grid button {
  display: grid;
  gap: 5px;
  min-height: 74px;
  align-content: center;
  border: 1px solid rgba(145, 116, 78, 0.12);
  border-radius: 18px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.72);
  color: #342b22;
  font: inherit;
  text-align: left;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
}

.mode-grid button.active {
  border-color: rgba(217, 130, 75, 0.42);
  background: #fff0dc;
  box-shadow: 0 0 0 3px rgba(217, 130, 75, 0.1);
}

.mode-grid button:active,
.primary-action:active {
  transform: scale(0.98);
}

.mode-grid strong {
  font-size: 14px;
}

.mode-grid span {
  color: #897967;
  font-size: 12px;
  font-weight: 800;
}

.check-in-actions {
  display: grid;
  gap: 10px;
}

.primary-action {
  min-height: 54px;
  border: 0;
  border-radius: 20px;
  font: inherit;
  font-weight: 950;
}

.primary-action {
  background: linear-gradient(135deg, #df8544, #c96f3a);
  color: #fffaf3;
  box-shadow: 0 16px 28px rgba(170, 96, 36, 0.18);
}

@media (max-width: 480px) {
  .check-in-screen {
    align-items: start;
    padding: max(12px, env(safe-area-inset-top)) 14px max(12px, env(safe-area-inset-bottom));
  }

  .check-in-card {
    gap: 12px;
    padding: 18px 16px 16px;
    border-radius: 28px;
  }

  .check-in-card :deep(.mascot-stage) {
    width: min(58vw, 252px);
  }

  .check-in-copy h1 {
    font-size: clamp(26px, 10vw, 36px);
  }

  .streak-card {
    padding: 12px 14px;
    border-radius: 20px;
  }

  .streak-card strong {
    font-size: 17px;
  }

  .mode-selector {
    gap: 10px;
  }

  .mode-selector h2 {
    font-size: 17px;
  }

  .mode-grid {
    gap: 8px;
  }

  .mode-grid button {
    min-height: 64px;
    border-radius: 17px;
    padding: 10px;
  }

  .primary-action {
    min-height: 52px;
    border-radius: 18px;
  }
}

.success .check-in-card {
  animation: success-lift 760ms ease both;
}

@media (min-width: 900px) {
  .check-in-screen {
    padding: 44px;
  }

  .check-in-card {
    grid-template-columns: 1fr 1fr;
    width: min(100%, 860px);
    max-width: 860px;
    align-items: center;
    padding: 32px;
  }

  .check-in-copy h1 {
    max-width: 360px;
    font-size: 36px;
  }

  .check-in-copy,
  .streak-card,
  .mode-selector,
  .check-in-actions {
    grid-column: 1;
    text-align: left;
  }

  .check-in-copy,
  .mode-selector h2,
  .mode-selector p {
    text-align: left;
  }

  .check-in-card :deep(.mascot-stage) {
    grid-column: 2;
    grid-row: 1 / span 4;
    width: min(34vw, 340px);
  }
}

@keyframes check-in-enter {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}

@keyframes success-lift {
  70% {
    transform: translateY(-8px);
  }
}
</style>
