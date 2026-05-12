<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  ChatDotRound,
  Check,
  Key,
  Lock,
  Message,
  Phone,
  Promotion,
  User,
  Warning,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import ElButton from 'element-plus/es/components/button/index.mjs'
import ElIcon from 'element-plus/es/components/icon/index.mjs'
import ElInput from 'element-plus/es/components/input/index.mjs'
import ElSelect, { ElOption } from 'element-plus/es/components/select/index.mjs'
import { localeOptions, setLocale, type AppLocale } from '../i18n'
import { useAuthStore, type AuthProvider } from '../stores/auth'

type LoginMode = 'qr' | 'phone' | 'account'
type AccountMode = 'login' | 'register'
type QrProvider = Extract<AuthProvider, 'wechat' | 'qq'>

const router = useRouter()
const auth = useAuthStore()
const { t, locale } = useI18n()

const loginMode = ref<LoginMode>('account')
const accountMode = ref<AccountMode>('login')
const qrProvider = ref<QrProvider>('wechat')
const isSubmitting = ref(false)
const isSendingCode = ref(false)
const cursorX = ref(50)
const cursorY = ref(50)
const fallbackCapabilities = {
  accountPassword: true,
  phoneSms: false,
  oauth: {
    wechat: false,
    qq: false,
  },
}
const matrixRows = [
  '0X93A7R8F9YZEQ4T1LMNODE7K2S91AXIS_TOKEN_ORBIT',
  'KIMI_LOCAL_AGENT_AUTH_VECTOR_21F9E7C4A0D3B6',
  'TWENTYS1X SECURE SESSION PBKDF2 HMAC BEARER',
  'XIAOMI MIMO ORBIT INSPIRED FIELD 1000000000',
  'AUTH GATEWAY REAL ONLY NO MOCK LOGIN PATH',
  'POST /API/AUTH LOGIN REGISTER SMS OAUTH READY',
]

const phoneForm = ref({
  phone: '',
  code: '',
})
const accountForm = ref({
  identifier: '',
  username: '',
  password: '',
})

const safeCapabilities = computed(() => auth.capabilities || fallbackCapabilities)
const loginModeOptions = computed<Array<{ id: LoginMode; label: string; unavailable?: boolean }>>(() => [
  { id: 'account', label: t('auth.accountPassword') },
  { id: 'phone', label: t('auth.phoneSms'), unavailable: !safeCapabilities.value.phoneSms },
  { id: 'qr', label: t('auth.qrLogin'), unavailable: !hasEnabledQrProvider.value },
])

const qrProviderOptions = computed<Array<{ id: QrProvider; label: string }>>(() => [
  { id: 'wechat', label: t('auth.wechat') },
  { id: 'qq', label: t('auth.qq') },
])

const qrProviderLabel = computed(() => (qrProvider.value === 'wechat' ? t('auth.wechat') : t('auth.qq')))
const accountSubmitLabel = computed(() =>
  accountMode.value === 'login' ? t('auth.login') : t('auth.registerAndLogin'),
)
const hasEnabledQrProvider = computed(() => Object.values(safeCapabilities.value.oauth).some(Boolean))
const activeQrProviderEnabled = computed(() => Boolean(safeCapabilities.value.oauth[qrProvider.value]))

async function sendPhoneCode() {
  await withFeedback(async () => {
    await auth.requestSmsCode(phoneForm.value.phone, 'login')
    ElMessage.success(t('auth.codeSent'))
  }, true)
}

async function submitPhoneLogin() {
  await withFeedback(async () => {
    await auth.loginWithPhone(phoneForm.value.phone, phoneForm.value.code)
    await router.replace('/')
  })
}

async function submitAccount() {
  await withFeedback(async () => {
    if (accountMode.value === 'login') {
      await auth.loginWithAccount(accountForm.value.identifier, accountForm.value.password)
    } else {
      await auth.registerWithAccount(accountForm.value.username, accountForm.value.password)
    }
    await router.replace('/')
  })
}

async function confirmQrLogin() {
  await withFeedback(async () => {
    await auth.loginWithQr(qrProvider.value)
  })
}

function selectLoginMode(option: { id: LoginMode }) {
  loginMode.value = option.id
}

async function withFeedback(action: () => Promise<void>, sendingCode = false) {
  try {
    if (sendingCode) isSendingCode.value = true
    else isSubmitting.value = true
    await action()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('auth.operationFailed'))
  } finally {
    isSendingCode.value = false
    isSubmitting.value = false
  }
}

function updateCursor(event: MouseEvent) {
  cursorX.value = event.clientX
  cursorY.value = event.clientY
}

function handleLocaleChange(value: string) {
  setLocale(value as AppLocale)
}

onMounted(async () => {
  const ticket = new URLSearchParams(window.location.search).get('auth_ticket')
  if (!ticket) return

  await withFeedback(async () => {
    await auth.completeOAuthLogin(ticket)
    await router.replace('/')
  })
})
</script>

<template>
  <main
    id="main-content"
    class="login-shell"
    :style="{ '--cursor-x': `${cursorX}px`, '--cursor-y': `${cursorY}px` }"
    @mousemove="updateCursor"
  >
    <div class="login-cursor-glow" aria-hidden="true"></div>
    <div class="login-bg-code" aria-hidden="true">
      <span v-for="row in 28" :key="row">
        {{ matrixRows[row % matrixRows.length] }} {{ matrixRows[(row + 2) % matrixRows.length] }}
      </span>
    </div>

    <div class="login-brand">
      <div class="logo-mark">T1</div>
      <div>
        <strong>Twentys1x</strong>
        <span>{{ t('auth.authenticating') }}</span>
      </div>
    </div>

    <div class="login-top-actions" :aria-label="t('auth.status')">
      <span>{{ t('auth.localAccount') }}</span>
      <span>{{ safeCapabilities.phoneSms ? t('auth.smsReady') : t('auth.smsPending') }}</span>
      <el-select
        class="locale-select"
        :model-value="locale"
        size="small"
        :aria-label="t('common.language')"
        @change="handleLocaleChange"
      >
        <el-option v-for="item in localeOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
    </div>

    <section class="login-center" :aria-label="t('auth.loginTwentys1x')">
      <div class="login-copy">
        <p>Twentys1x AI Studio</p>
        <!-- <h1>Secure Local Orbit</h1> -->
        <strong>{{ t('auth.welcome') }}</strong>
        <span>{{ t('auth.intro') }}</span>
      </div>

      <section class="login-panel" :aria-label="t('auth.form')">
        <div class="login-mode-tabs" role="tablist" :aria-label="t('auth.chooseLoginMode')">
          <button
            v-for="option in loginModeOptions"
            :key="option.id"
            type="button"
            :class="{ active: loginMode === option.id, unavailable: option.unavailable }"
            @click="selectLoginMode(option)"
          >
            {{ option.label }}
          </button>
        </div>

        <div v-if="loginMode === 'qr'" class="login-qr-pane">
          <div class="qr-provider-tabs" :aria-label="t('auth.selectQrProvider')">
            <button
              v-for="provider in qrProviderOptions"
              :key="provider.id"
              type="button"
              :disabled="!safeCapabilities.oauth[provider.id]"
              :class="{ active: qrProvider === provider.id }"
              @click="qrProvider = provider.id"
            >
              {{ provider.label }}
            </button>
          </div>

          <div class="auth-status-card" :class="{ enabled: activeQrProviderEnabled }">
            <div class="auth-status-mark">
              <el-icon>
                <ChatDotRound v-if="activeQrProviderEnabled" />
                <Warning v-else />
              </el-icon>
            </div>
            <div>
              <strong>{{
                activeQrProviderEnabled
                  ? t('auth.qrReady', { provider: qrProviderLabel })
                  : t('auth.qrUnavailable', { provider: qrProviderLabel })
              }}</strong>
              <span>
                {{
                  activeQrProviderEnabled
                    ? t('auth.qrReadyDesc', { provider: qrProviderLabel })
                    : t('auth.qrUnavailableDesc')
                }}
              </span>
            </div>
          </div>

          <el-button
            type="primary"
            size="large"
            :disabled="!activeQrProviderEnabled"
            :loading="isSubmitting"
            @click="confirmQrLogin"
          >
            <el-icon><Check /></el-icon>
            {{ t('auth.goAuthorize', { provider: qrProviderLabel }) }}
          </el-button>
          <p class="login-note">
            {{
              activeQrProviderEnabled
                ? t('auth.qrReadyNote', { provider: qrProviderLabel })
                : t('auth.qrUnavailableNote', { provider: qrProviderLabel })
            }}
          </p>
        </div>

        <div v-else-if="loginMode === 'phone'" class="login-form">
          <label>
            <span>{{ t('auth.phone') }}</span>
            <el-input
              v-model="phoneForm.phone"
              :prefix-icon="Phone"
              maxlength="11"
              :placeholder="t('auth.phonePlaceholder')"
            />
          </label>
          <p v-if="!safeCapabilities.phoneSms" class="login-note">
            {{ t('auth.smsUnavailable') }}
          </p>
          <label>
            <span>{{ t('auth.code') }}</span>
            <div class="code-row">
              <el-input
                v-model="phoneForm.code"
                :prefix-icon="Message"
                maxlength="6"
                :placeholder="t('auth.codePlaceholder')"
              />
              <el-button
                plain
                :disabled="!safeCapabilities.phoneSms"
                :loading="isSendingCode"
                @click="sendPhoneCode"
              >
                {{ t('auth.getCode') }}
              </el-button>
            </div>
          </label>
          <el-button type="primary" size="large" :loading="isSubmitting" @click="submitPhoneLogin">
            <el-icon><Promotion /></el-icon>
            {{ t('auth.login') }}
          </el-button>
        </div>

        <div v-else class="login-form">
          <div class="account-switch" :aria-label="t('auth.accountSwitch')">
            <button type="button" :class="{ active: accountMode === 'login' }" @click="accountMode = 'login'">
              {{ t('auth.login') }}
            </button>
            <button
              type="button"
              :class="{ active: accountMode === 'register' }"
              @click="accountMode = 'register'"
            >
              {{ t('auth.register') }}
            </button>
          </div>

          <template v-if="accountMode === 'login'">
            <label>
              <span>{{ t('auth.accountOrPhone') }}</span>
              <el-input
                v-model="accountForm.identifier"
                :prefix-icon="User"
                :placeholder="t('auth.accountOrPhonePlaceholder')"
              />
            </label>
            <label>
              <span>{{ t('auth.password') }}</span>
              <el-input
                v-model="accountForm.password"
                :prefix-icon="Lock"
                show-password
                type="password"
                :placeholder="t('auth.passwordPlaceholder')"
              />
            </label>
          </template>

          <template v-else>
            <label>
              <span>{{ t('auth.account') }}</span>
              <el-input
                v-model="accountForm.username"
                :prefix-icon="User"
                :placeholder="t('auth.accountPlaceholder')"
              />
            </label>
            <label>
              <span>{{ t('auth.password') }}</span>
              <el-input
                v-model="accountForm.password"
                :prefix-icon="Key"
                show-password
                type="password"
                :placeholder="t('auth.passwordRegisterPlaceholder')"
              />
            </label>
          </template>

          <el-button type="primary" size="large" :loading="isSubmitting" @click="submitAccount">
            <el-icon><Promotion /></el-icon>
            {{ accountSubmitLabel }}
          </el-button>
        </div>
      </section>
    </section>
  </main>
</template>
