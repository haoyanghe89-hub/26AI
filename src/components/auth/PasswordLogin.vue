<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Key, Message, Phone, User } from '@element-plus/icons-vue'
import AuthButton from './AuthButton.vue'
import AuthInput from './AuthInput.vue'

export interface PasswordLoginForm {
  identifier: string
  password: string
  phone: string
  code: string
  forgotPhone: string
  forgotCode: string
}

export type PasswordPanelMode = 'password' | 'sms' | 'forgot'

const props = withDefaults(
  defineProps<{
    errors: Partial<Record<keyof PasswordLoginForm | 'form', string>>
    loading: boolean
    sendingCode: boolean
    countdown: number
    forgotCountdown: number
    initialMode?: PasswordPanelMode
  }>(),
  {
    initialMode: 'password',
  },
)

const form = defineModel<PasswordLoginForm>({ required: true })
const panelMode = ref<PasswordPanelMode>(props.initialMode)
const title = computed(() => {
  if (panelMode.value === 'sms') return '手机验证码登录'
  if (panelMode.value === 'forgot') return '找回密码'
  return '账号密码登录'
})

defineEmits<{
  back: []
  loginPassword: []
  loginSms: []
  sendSmsCode: []
  sendForgotCode: []
  register: []
}>()

watch(
  () => props.initialMode,
  (mode) => {
    panelMode.value = mode
  },
)
</script>

<template>
  <section class="auth-sheet" aria-label="账号密码登录">
    <button class="auth-back" type="button" @click="$emit('back')">返回</button>
    <div class="auth-sheet__header">
      <span class="auth-kicker">Welcome back</span>
      <h2>{{ title }}</h2>
      <p v-if="panelMode === 'password'">继续查看宠物档案、健康日志和智能照护提醒。</p>
      <p v-else-if="panelMode === 'sms'">输入手机号和验证码，快速回到你的宠物家庭空间。</p>
      <p v-else>先验证手机号。重置密码接口接入后，可在这里继续完成新密码设置。</p>
    </div>

    <form v-if="panelMode === 'password'" class="auth-form" @submit.prevent="$emit('loginPassword')">
      <AuthInput
        v-model="form.identifier"
        label="手机号 / 账号"
        placeholder="请输入手机号或账号"
        autocomplete="username"
        :error="errors.identifier"
      >
        <template #icon><User /></template>
      </AuthInput>
      <AuthInput
        v-model="form.password"
        label="密码"
        type="password"
        placeholder="请输入密码"
        autocomplete="current-password"
        password-toggle
        :error="errors.password"
      >
        <template #icon><Key /></template>
      </AuthInput>

      <div class="auth-form-links">
        <button type="button" @click="panelMode = 'forgot'">忘记密码</button>
        <button type="button" @click="panelMode = 'sms'">手机验证码登录</button>
      </div>

      <p v-if="errors.form" class="auth-inline-error">{{ errors.form }}</p>
      <AuthButton variant="primary" type="submit" :loading="loading">登录</AuthButton>
    </form>

    <form v-else-if="panelMode === 'sms'" class="auth-form" @submit.prevent="$emit('loginSms')">
      <div class="auth-code-row">
        <AuthInput
          v-model="form.phone"
          label="手机号"
          placeholder="请输入手机号"
          inputmode="tel"
          autocomplete="tel"
          :maxlength="11"
          :error="errors.phone"
        >
          <template #icon><Phone /></template>
        </AuthInput>
        <AuthButton
          class="auth-code-button"
          variant="secondary"
          :loading="sendingCode"
          :disabled="countdown > 0"
          @click="$emit('sendSmsCode')"
        >
          {{ countdown > 0 ? `${countdown}s` : '发送验证码' }}
        </AuthButton>
      </div>
      <AuthInput
        v-model="form.code"
        label="验证码"
        placeholder="请输入验证码"
        inputmode="numeric"
        autocomplete="one-time-code"
        :maxlength="6"
        :error="errors.code"
      >
        <template #icon><Message /></template>
      </AuthInput>

      <div class="auth-form-links">
        <button type="button" @click="panelMode = 'password'">账号密码登录</button>
        <button type="button" @click="$emit('register')">去注册</button>
      </div>

      <p v-if="errors.form" class="auth-inline-error">{{ errors.form }}</p>
      <AuthButton variant="primary" type="submit" :loading="loading">登录</AuthButton>
    </form>

    <form v-else class="auth-form" @submit.prevent="$emit('sendForgotCode')">
      <div class="auth-code-row">
        <AuthInput
          v-model="form.forgotPhone"
          label="手机号"
          placeholder="请输入绑定手机号"
          inputmode="tel"
          autocomplete="tel"
          :maxlength="11"
          :error="errors.forgotPhone"
        >
          <template #icon><Phone /></template>
        </AuthInput>
        <AuthButton
          class="auth-code-button"
          variant="secondary"
          :loading="sendingCode"
          :disabled="forgotCountdown > 0"
          @click="$emit('sendForgotCode')"
        >
          {{ forgotCountdown > 0 ? `${forgotCountdown}s` : '发送验证码' }}
        </AuthButton>
      </div>
      <AuthInput
        v-model="form.forgotCode"
        label="验证码"
        placeholder="请输入验证码"
        inputmode="numeric"
        autocomplete="one-time-code"
        :maxlength="6"
        :error="errors.forgotCode"
      >
        <template #icon><Message /></template>
      </AuthInput>
      <p class="auth-helper">验证码发送后会在站内提示。密码重置能力接入后，这里可继续设置新密码。</p>

      <div class="auth-form-links">
        <button type="button" @click="panelMode = 'password'">返回登录</button>
        <button type="button" @click="$emit('register')">去注册</button>
      </div>
    </form>

    <button v-if="panelMode === 'password'" class="auth-sheet__link" type="button" @click="$emit('register')">
      没有账号？去注册
    </button>
  </section>
</template>
