<script setup lang="ts">
import { Key, Message, Right, StarFilled } from '@element-plus/icons-vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { PasswordLoginForm } from './PasswordLogin.vue'

defineProps<{
  wechatEnabled: boolean
  qqEnabled: boolean
  errors: Partial<Record<keyof PasswordLoginForm | 'form', string>>
  loading: boolean
}>()

const form = defineModel<PasswordLoginForm>({ required: true })
const greeting = ref('你好')
const activeInput = ref<'account' | 'password' | null>(null)
const currentTime = ref('')
let clockTimer: number | undefined

defineEmits<{
  wechat: []
  qq: []
  login: []
  forgot: []
  phoneCode: []
  register: []
}>()

function updateClock() {
  currentTime.value = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}

onMounted(() => {
  const hour = new Date().getHours()
  if (hour < 12) greeting.value = '早安'
  else if (hour < 18) greeting.value = '午后好'
  else greeting.value = '晚安'

  updateClock()
  clockTimer = window.setInterval(updateClock, 30_000)
})

onBeforeUnmount(() => {
  if (clockTimer) window.clearInterval(clockTimer)
})
</script>

<template>
  <section class="auth-welcome" aria-label="宠物 AI 管家登录欢迎页">
    <div class="auth-statusbar" aria-hidden="true">
      <span>{{ currentTime }}</span>
      <span class="auth-statusbar__signal"></span>
    </div>

    <div class="auth-login-card" :class="{ 'is-input-focused': activeInput }">
      <div class="auth-brand">
        <span class="auth-brand__mark" aria-hidden="true"></span>
        <div>
          <p>Pet AI Manager</p>
          <h1>宠物 AI 管家</h1>
        </div>
      </div>

      <div class="auth-greeting">
        <div class="auth-greeting__title">
          <StarFilled />
          <h1>{{ greeting }}</h1>
        </div>
        <p>毛孩子正在家等你回来呢</p>
      </div>

      <form class="auth-cloud-form" @submit.prevent="$emit('login')">
        <label
          class="auth-cloud-field"
          :class="{ active: activeInput === 'account', error: errors.identifier }"
        >
          <span class="auth-cloud-field__icon"><Message /></span>
          <span class="auth-cloud-field__body">
            <span>专属通讯号码</span>
            <input
              v-model="form.identifier"
              type="text"
              placeholder="输入手机号 / 账号"
              autocomplete="username"
              @focus="activeInput = 'account'"
              @blur="activeInput = null"
            />
          </span>
        </label>
        <p v-if="errors.identifier" class="auth-inline-error">{{ errors.identifier }}</p>

        <div class="auth-password-line">
          <label
            class="auth-cloud-field"
            :class="{ active: activeInput === 'password', error: errors.password }"
          >
            <span class="auth-cloud-field__icon"><Key /></span>
            <span class="auth-cloud-field__body">
              <span>回家钥匙</span>
              <input
                v-model="form.password"
                type="password"
                placeholder="输入密码"
                autocomplete="current-password"
                @focus="activeInput = 'password'"
                @blur="activeInput = null"
              />
            </span>
          </label>
          <button class="auth-arrow-login" type="submit" :disabled="loading" aria-label="登录">
            <Right />
          </button>
        </div>
        <p v-if="errors.password" class="auth-inline-error">{{ errors.password }}</p>
        <p v-if="errors.form" class="auth-inline-error">{{ errors.form }}</p>
      </form>

      <div class="auth-helper-row">
        <div class="auth-helper-links">
          <button type="button" @click="$emit('forgot')">忘记密码</button>
          <button type="button" @click="$emit('phoneCode')">
            <Message />
            验证码登录
          </button>
        </div>
      </div>

      <div class="auth-bottom-row">
        <button class="auth-register-soft" type="button" @click="$emit('register')">
          <span>还没有账号？</span>
          <strong>去注册</strong>
        </button>
        <div class="auth-social-line" aria-label="第三方登录">
          <button class="auth-icon-button" type="button" aria-label="QQ 登录" @click="$emit('qq')">
            <svg class="auth-alt-icon auth-alt-icon--qq" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="8" />
              <path d="M8.8 14.2s1.2 1.5 3.2 1.5 3.2-1.5 3.2-1.5" />
              <path d="M9.1 9.4h.01M14.9 9.4h.01" />
            </svg>
          </button>
          <button class="auth-icon-button" type="button" aria-label="微信登录" @click="$emit('wechat')">
            <svg
              class="auth-alt-icon auth-alt-icon--wechat"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path d="M8.6 14.4A2.4 2.4 0 1 0 8.6 9.6a2.4 2.4 0 0 0 0 4.8Z" />
              <path d="M15.6 11.4a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
              <path d="M21 15a2 2 0 0 1-2 2H7.2L3 20.6V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
