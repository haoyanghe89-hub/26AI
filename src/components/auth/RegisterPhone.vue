<script setup lang="ts">
import { Key, Message, Phone } from '@element-plus/icons-vue'
import AuthButton from './AuthButton.vue'
import AuthInput from './AuthInput.vue'

export interface RegisterPhoneForm {
  phone: string
  code: string
  password: string
  confirmPassword: string
  acceptedTerms: boolean
}

defineProps<{
  errors: Partial<Record<keyof RegisterPhoneForm | 'form', string>>
  loading: boolean
  sendingCode: boolean
  countdown: number
}>()

const form = defineModel<RegisterPhoneForm>({ required: true })

defineEmits<{
  back: []
  submit: []
  sendCode: []
  passwordLogin: []
}>()
</script>

<template>
  <section class="auth-sheet" aria-label="手机号注册">
    <button class="auth-back" type="button" @click="$emit('back')">返回</button>
    <div class="auth-sheet__header">
      <span class="auth-kicker">Create account</span>
      <h2>手机号注册</h2>
      <p>用手机号绑定你的宠物家庭档案，之后可用账号密码继续登录。</p>
    </div>

    <form class="auth-form" @submit.prevent="$emit('submit')">
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

      <div class="auth-code-row">
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
        <AuthButton
          class="auth-code-button"
          variant="secondary"
          :loading="sendingCode"
          :disabled="countdown > 0"
          @click="$emit('sendCode')"
        >
          {{ countdown > 0 ? `${countdown}s` : '发送验证码' }}
        </AuthButton>
      </div>

      <AuthInput
        v-model="form.password"
        label="设置密码"
        type="password"
        placeholder="至少 10 位，建议包含字母和数字"
        autocomplete="new-password"
        password-toggle
        :error="errors.password"
      >
        <template #icon><Key /></template>
      </AuthInput>
      <AuthInput
        v-model="form.confirmPassword"
        label="确认密码"
        type="password"
        placeholder="请再次输入密码"
        autocomplete="new-password"
        password-toggle
        :error="errors.confirmPassword"
      >
        <template #icon><Key /></template>
      </AuthInput>

      <label class="auth-check" :class="{ 'has-error': errors.form }">
        <input v-model="form.acceptedTerms" type="checkbox" />
        <span
          >我已阅读并同意 <a href="/TERMS.md" target="_blank" rel="noreferrer">《用户协议》</a> 与
          <a href="/PRIVACY.md" target="_blank" rel="noreferrer">《隐私政策》</a></span
        >
      </label>
      <p v-if="errors.form" class="auth-inline-error">{{ errors.form }}</p>

      <AuthButton variant="primary" type="submit" :loading="loading">注册并登录</AuthButton>
    </form>

    <button class="auth-sheet__link" type="button" @click="$emit('passwordLogin')">
      已有账号？账号密码登录
    </button>
  </section>
</template>
