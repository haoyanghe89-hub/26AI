<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import LoginWelcome from '../components/auth/LoginWelcome.vue'
import PasswordLogin, {
  type PasswordLoginForm,
  type PasswordPanelMode,
} from '../components/auth/PasswordLogin.vue'
import RegisterPhone, { type RegisterPhoneForm } from '../components/auth/RegisterPhone.vue'
import VideoBackground from '../components/auth/VideoBackground.vue'
import { useAuthStore, type AuthProvider } from '../stores/auth'

type AuthScreen = 'welcome' | 'register' | 'password'
type SmsPurpose = 'login' | 'register'
type FieldErrors<T extends string> = Partial<Record<T | 'form', string>>

const router = useRouter()
const auth = useAuthStore()
const currentScreen = ref<AuthScreen>('welcome')
const passwordInitialMode = ref<PasswordPanelMode>('password')
const isSubmitting = ref(false)
const isSendingCode = ref(false)
const registerCountdown = ref(0)
const smsCountdown = ref(0)
const forgotCountdown = ref(0)
const timers = new Set<number>()

const fallbackCapabilities = {
  accountPassword: true,
  phoneSms: false,
  oauth: {
    wechat: false,
    qq: false,
  },
}

const registerForm = ref<RegisterPhoneForm>({
  phone: '',
  code: '',
  password: '',
  confirmPassword: '',
  acceptedTerms: false,
})

const passwordForm = ref<PasswordLoginForm>({
  identifier: '',
  password: '',
  phone: '',
  code: '',
  forgotPhone: '',
  forgotCode: '',
})

const registerErrors = ref<FieldErrors<keyof RegisterPhoneForm & string>>({})
const passwordErrors = ref<FieldErrors<keyof PasswordLoginForm & string>>({})
const safeCapabilities = computed(() => auth.capabilities || fallbackCapabilities)
const isDetailScreen = computed(() => currentScreen.value !== 'welcome')

async function submitWechatLogin() {
  await startOAuthLogin('wechat')
}

async function submitQqLogin() {
  await startOAuthLogin('qq')
}

async function startOAuthLogin(provider: Extract<AuthProvider, 'wechat' | 'qq'>) {
  if (!safeCapabilities.value.oauth[provider]) {
    showToast(`${provider === 'wechat' ? '微信' : 'QQ'} 登录暂未开通，请先使用账号密码登录。`, 'warning')
    return
  }
  await withFeedback(async () => {
    await auth.loginWithQr(provider)
  })
}

function openPasswordPanel(mode: PasswordPanelMode = 'password') {
  passwordInitialMode.value = mode
  currentScreen.value = 'password'
}

async function sendRegisterCode() {
  registerErrors.value = {}
  const phone = normalizePhone(registerForm.value.phone)
  if (!isValidPhone(phone)) {
    registerErrors.value.phone = '请输入有效的 11 位手机号'
    return
  }
  registerForm.value.phone = phone
  await sendCode(phone, 'register', registerCountdown)
}

async function sendSmsLoginCode() {
  passwordErrors.value = {}
  const phone = normalizePhone(passwordForm.value.phone)
  if (!isValidPhone(phone)) {
    passwordErrors.value.phone = '请输入有效的 11 位手机号'
    return
  }
  passwordForm.value.phone = phone
  await sendCode(phone, 'login', smsCountdown)
}

async function sendForgotCode() {
  passwordErrors.value = {}
  const phone = normalizePhone(passwordForm.value.forgotPhone)
  if (!isValidPhone(phone)) {
    passwordErrors.value.forgotPhone = '请输入有效的 11 位手机号'
    return
  }
  passwordForm.value.forgotPhone = phone
  await sendCode(
    phone,
    'login',
    forgotCountdown,
    '验证码已发送。当前版本已完成找回密码验证入口，重置密码接口接入后可继续设置新密码。',
  )
}

async function sendCode(
  phone: string,
  purpose: SmsPurpose,
  countdown: typeof registerCountdown,
  successText = '验证码已发送',
) {
  await withFeedback(async () => {
    await auth.requestSmsCode(phone, purpose)
    startCountdown(countdown)
    showToast(successText)
  }, true)
}

async function submitRegister() {
  registerErrors.value = validateRegisterForm()
  if (Object.keys(registerErrors.value).length) return

  await withFeedback(async () => {
    const form = registerForm.value
    await auth.registerWithPhone(normalizePhone(form.phone), form.code, form.password)
    await router.replace('/')
  })
}

async function submitPasswordLogin() {
  passwordErrors.value = validatePasswordLoginForm()
  if (Object.keys(passwordErrors.value).length) return

  await withFeedback(async () => {
    await auth.loginWithAccount(passwordForm.value.identifier.trim(), passwordForm.value.password)
    await router.replace('/')
  })
}

async function submitSmsLogin() {
  passwordErrors.value = validateSmsLoginForm()
  if (Object.keys(passwordErrors.value).length) return

  await withFeedback(async () => {
    const form = passwordForm.value
    await auth.loginWithPhone(normalizePhone(form.phone), form.code)
    await router.replace('/')
  })
}

async function withFeedback(action: () => Promise<void>, sendingCode = false) {
  try {
    if (sendingCode) isSendingCode.value = true
    else isSubmitting.value = true
    await action()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '操作失败，请稍后再试', 'error')
  } finally {
    isSendingCode.value = false
    isSubmitting.value = false
  }
}

function validateRegisterForm() {
  const errors: FieldErrors<keyof RegisterPhoneForm & string> = {}
  const form = registerForm.value
  const phone = normalizePhone(form.phone)

  if (!isValidPhone(phone)) errors.phone = '请输入有效的 11 位手机号'
  if (!/^\d{6}$/.test(form.code.trim())) errors.code = '请输入 6 位验证码'
  if (!isStrongEnoughPassword(form.password)) {
    errors.password = '密码至少 10 位，并包含大小写字母、数字、符号中的 3 类'
  }
  if (form.confirmPassword !== form.password) errors.confirmPassword = '两次输入的密码不一致'
  if (!form.acceptedTerms) errors.form = '请先阅读并同意用户协议与隐私政策'

  return errors
}

function validatePasswordLoginForm() {
  const errors: FieldErrors<keyof PasswordLoginForm & string> = {}
  const form = passwordForm.value

  if (!form.identifier.trim()) errors.identifier = '请输入手机号或账号'
  if (!form.password) errors.password = '请输入密码'

  return errors
}

function validateSmsLoginForm() {
  const errors: FieldErrors<keyof PasswordLoginForm & string> = {}
  const form = passwordForm.value

  if (!isValidPhone(normalizePhone(form.phone))) errors.phone = '请输入有效的 11 位手机号'
  if (!/^\d{6}$/.test(form.code.trim())) errors.code = '请输入 6 位验证码'

  return errors
}

function startCountdown(target: typeof registerCountdown) {
  target.value = 60
  const timer = window.setInterval(() => {
    target.value -= 1
    if (target.value <= 0) {
      window.clearInterval(timer)
      timers.delete(timer)
    }
  }, 1000)
  timers.add(timer)
}

function showToast(message: string, type: 'success' | 'warning' | 'error' = 'success') {
  ElMessage({
    message,
    type,
    plain: true,
    customClass: 'auth-toast',
  })
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '')
}

function isValidPhone(phone: string) {
  return /^1[3-9]\d{9}$/.test(phone)
}

function isStrongEnoughPassword(password: string) {
  const categories = [
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /[0-9]/.test(password),
    /[!@#$%^&*()_+\-=\]{};':"\\|,.<>/?`~]/.test(password),
  ]
  return password.length >= 10 && categories.filter(Boolean).length >= 3
}

onMounted(async () => {
  const ticket = new URLSearchParams(window.location.search).get('auth_ticket')
  if (!ticket) return

  await withFeedback(async () => {
    await auth.completeOAuthLogin(ticket)
    await router.replace('/')
  })
})

onBeforeUnmount(() => {
  for (const timer of timers) window.clearInterval(timer)
  timers.clear()
})
</script>

<template>
  <main id="main-content" class="auth-shell" :class="{ 'auth-shell--detail': isDetailScreen }">
    <VideoBackground :quiet="isDetailScreen" />

    <Transition name="auth-fade" mode="out-in">
      <LoginWelcome
        v-if="currentScreen === 'welcome'"
        key="welcome"
        v-model="passwordForm"
        :wechat-enabled="safeCapabilities.oauth.wechat"
        :qq-enabled="safeCapabilities.oauth.qq"
        :errors="passwordErrors"
        :loading="isSubmitting"
        @wechat="submitWechatLogin"
        @qq="submitQqLogin"
        @login="submitPasswordLogin"
        @forgot="openPasswordPanel('forgot')"
        @phone-code="openPasswordPanel('sms')"
        @register="currentScreen = 'register'"
      />
      <div v-else key="detail" class="auth-detail-wrap">
        <Transition name="auth-slide" mode="out-in">
          <RegisterPhone
            v-if="currentScreen === 'register'"
            key="register"
            v-model="registerForm"
            :errors="registerErrors"
            :loading="isSubmitting"
            :sending-code="isSendingCode"
            :countdown="registerCountdown"
            @back="currentScreen = 'welcome'"
            @send-code="sendRegisterCode"
            @submit="submitRegister"
            @password-login="currentScreen = 'password'"
          />
          <PasswordLogin
            v-else
            key="password"
            v-model="passwordForm"
            :errors="passwordErrors"
            :loading="isSubmitting"
            :sending-code="isSendingCode"
            :countdown="smsCountdown"
            :forgot-countdown="forgotCountdown"
            :initial-mode="passwordInitialMode"
            @back="currentScreen = 'welcome'"
            @login-password="submitPasswordLogin"
            @login-sms="submitSmsLogin"
            @send-sms-code="sendSmsLoginCode"
            @send-forgot-code="sendForgotCode"
            @register="currentScreen = 'register'"
          />
        </Transition>
      </div>
    </Transition>
  </main>
</template>
