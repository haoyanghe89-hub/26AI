<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../pet/AppIcon.vue'
import { useAuthStore } from '../../stores/auth'
import {
  DEFAULT_GUIDANCE_PREFERENCE,
  type CareExperienceLevel,
  type GuidancePreference,
} from '../../config/careExperienceContent'

interface ExperienceOption {
  value: CareExperienceLevel
  guidancePreference: GuidancePreference
  title: string
  description: string
  tags: string[]
  icon: string
}

const router = useRouter()
const auth = useAuthStore()
const isSaving = ref(false)
const selectedLevel = ref<CareExperienceLevel>(auth.careExperienceLevel || 'beginner')

const options: ExperienceOption[] = [
  {
    value: 'beginner',
    guidancePreference: 'more_guidance',
    title: '刚开始养宠',
    description: '我还在学习怎么科学照顾它，希望你多提醒我。',
    icon: 'sparkle',
    tags: ['新手知识', '社会化训练', '疫苗驱虫', '常见异常', '喂养基础'],
  },
  {
    value: 'intermediate',
    guidancePreference: 'balanced',
    title: '已经比较熟悉',
    description: '日常照看没问题，希望你帮我发现细节变化。',
    icon: 'heart',
    tags: ['饮食优化', '行为习惯', '健康趋势', '训练进阶', '本周回顾'],
  },
  {
    value: 'advanced',
    guidancePreference: 'minimal',
    title: '资深养宠人',
    description: '我比较有经验，希望你少打扰，但关键时刻提醒我。',
    icon: 'settings',
    tags: ['高级分析', '粮食对比', '报告解读', '自定义记录', '紧急工具'],
  },
]

const selectedOption = computed(
  () => options.find((option) => option.value === selectedLevel.value) || options[0],
)

async function finishOnboarding(level = selectedLevel.value, guidance = selectedOption.value.guidancePreference) {
  if (isSaving.value) return
  isSaving.value = true
  try {
    await auth.saveOnboardingPreference({
      careExperienceLevel: level,
      guidancePreference: guidance,
      onboardingCompleted: true,
    })
    router.replace({ name: 'chat' })
  } finally {
    isSaving.value = false
  }
}

function skipOnboarding() {
  selectedLevel.value = 'beginner'
  finishOnboarding('beginner', DEFAULT_GUIDANCE_PREFERENCE)
}
</script>

<template>
  <main class="care-onboarding">
    <section class="onboarding-panel">
      <div class="onboarding-kicker">
        <span><AppIcon name="pet" :size="18" /></span>
        <strong>Pet AI Manager</strong>
      </div>

      <header class="onboarding-head">
        <p>欢迎回来</p>
        <h1>先让我更懂你一点</h1>
        <span>不同养宠阶段，我会用不同方式陪你照看它。</span>
      </header>

      <div class="experience-options" role="radiogroup" aria-label="养宠经验">
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          class="experience-card"
          :class="{ active: selectedLevel === option.value }"
          role="radio"
          :aria-checked="selectedLevel === option.value"
          @click="selectedLevel = option.value"
        >
          <span class="experience-icon"><AppIcon :name="option.icon" :size="22" /></span>
          <span class="experience-copy">
            <strong>{{ option.title }}</strong>
            <small>{{ option.description }}</small>
          </span>
          <span class="experience-check">
            <AppIcon :name="selectedLevel === option.value ? 'check' : 'pet'" :size="16" />
          </span>
          <span class="experience-tags">
            <em v-for="tag in option.tags" :key="tag">{{ tag }}</em>
          </span>
        </button>
      </div>
    </section>

    <footer class="onboarding-footer">
      <button class="start-care-button" type="button" :disabled="isSaving" @click="finishOnboarding()">
        {{ isSaving ? '正在记下' : '开始照看' }}
      </button>
      <button class="skip-care-button" type="button" :disabled="isSaving" @click="skipOnboarding">
        稍后再说
      </button>
    </footer>
  </main>
</template>

<style scoped>
.care-onboarding {
  min-height: 100vh;
  min-height: 100svh;
  display: grid;
  align-content: start;
  gap: 22px;
  padding: 22px 18px calc(18px + env(safe-area-inset-bottom));
  color: #332820;
  background:
    radial-gradient(circle at 18% 8%, rgba(255, 255, 255, 0.88), transparent 34%),
    radial-gradient(circle at 92% 24%, rgba(255, 210, 157, 0.5), transparent 34%),
    linear-gradient(180deg, #fffaf3 0%, #fff0df 100%);
}

.onboarding-panel {
  width: min(100%, 720px);
  margin: 0 auto;
}

.onboarding-kicker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 11px;
  border: 1px solid rgba(176, 113, 63, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.58);
  color: #9b6b45;
  font-size: 12px;
}

.onboarding-kicker span {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 50%;
  background: #fff0dc;
  color: #c56f35;
}

.onboarding-head {
  margin: 28px 0 22px;
}

.onboarding-head p {
  margin: 0 0 8px;
  color: #b06c3a;
  font-size: 13px;
  font-weight: 800;
}

.onboarding-head h1 {
  margin: 0;
  font-size: clamp(30px, 9vw, 46px);
  line-height: 1.08;
  letter-spacing: 0;
}

.onboarding-head span {
  display: block;
  max-width: 22em;
  margin-top: 12px;
  color: #8f725b;
  font-size: 15px;
  line-height: 1.7;
}

.experience-options {
  display: grid;
  gap: 12px;
}

.experience-card {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) 28px;
  gap: 12px;
  align-items: start;
  width: 100%;
  padding: 15px;
  border: 1px solid rgba(122, 86, 52, 0.12);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.68);
  color: inherit;
  text-align: left;
  box-shadow: 0 14px 34px rgba(106, 71, 38, 0.06);
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
}

.experience-card:active {
  transform: scale(0.985);
}

.experience-card.active {
  border-color: rgba(217, 130, 75, 0.62);
  background:
    linear-gradient(135deg, rgba(255, 245, 230, 0.98), rgba(255, 255, 255, 0.8)),
    #fff7ed;
  box-shadow:
    0 0 0 3px rgba(217, 130, 75, 0.12),
    0 18px 38px rgba(175, 101, 44, 0.12);
}

.experience-icon,
.experience-check {
  display: grid;
  place-items: center;
  border-radius: 16px;
}

.experience-icon {
  width: 46px;
  height: 46px;
  background: #fff0dc;
  color: #c56f35;
}

.experience-check {
  width: 28px;
  height: 28px;
  border: 1px solid rgba(177, 116, 69, 0.14);
  color: #d9824b;
}

.experience-copy {
  display: grid;
  gap: 6px;
}

.experience-copy strong {
  font-size: 17px;
}

.experience-copy small {
  color: #7d6653;
  font-size: 13px;
  line-height: 1.55;
}

.experience-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  grid-column: 2 / -1;
}

.experience-tags em {
  padding: 5px 8px;
  border-radius: 999px;
  background: rgba(255, 240, 220, 0.82);
  color: #9f663a;
  font-size: 11px;
  font-style: normal;
  font-weight: 800;
}

.onboarding-footer {
  display: grid;
  gap: 10px;
  width: min(100%, 720px);
  margin: 0 auto;
  padding-top: 18px;
}

.start-care-button,
.skip-care-button {
  width: 100%;
  border: 0;
  border-radius: 18px;
  font-weight: 900;
}

.start-care-button {
  min-height: 54px;
  background: linear-gradient(135deg, #d9824b, #b95e2f);
  color: #fffaf3;
  box-shadow: 0 16px 34px rgba(177, 94, 47, 0.24);
}

.start-care-button:disabled,
.skip-care-button:disabled {
  opacity: 0.68;
}

.skip-care-button {
  min-height: 42px;
  background: transparent;
  color: #a38469;
}

@media (min-width: 760px) {
  .care-onboarding {
    padding: 40px;
  }

  .experience-options {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .experience-card {
    min-height: 260px;
    grid-template-columns: 1fr 28px;
  }

  .experience-icon {
    grid-column: 1 / -1;
  }

  .experience-tags {
    grid-column: 1 / -1;
  }
}
</style>
