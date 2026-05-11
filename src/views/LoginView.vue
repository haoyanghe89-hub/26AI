<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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
import { useAuthStore, type AuthProvider } from '../stores/auth'

type LoginMode = 'qr' | 'phone' | 'account'
type AccountMode = 'login' | 'register'
type QrProvider = Extract<AuthProvider, 'wechat' | 'qq'>

const router = useRouter()
const auth = useAuthStore()

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
  { id: 'account', label: '账号密码' },
  { id: 'phone', label: '手机验证码', unavailable: !safeCapabilities.value.phoneSms },
  { id: 'qr', label: '扫码登录', unavailable: !hasEnabledQrProvider.value },
])

const qrProviderOptions: Array<{ id: QrProvider; label: string }> = [
  { id: 'wechat', label: '微信' },
  { id: 'qq', label: 'QQ' },
]

const qrProviderLabel = computed(() => (qrProvider.value === 'wechat' ? '微信' : 'QQ'))
const accountSubmitLabel = computed(() => (accountMode.value === 'login' ? '登录' : '注册并登录'))
const hasEnabledQrProvider = computed(() => Object.values(safeCapabilities.value.oauth).some(Boolean))
const activeQrProviderEnabled = computed(() => Boolean(safeCapabilities.value.oauth[qrProvider.value]))

async function sendPhoneCode() {
  await withFeedback(async () => {
    await auth.requestSmsCode(phoneForm.value.phone, 'login')
    ElMessage.success('验证码已发送')
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
    ElMessage.error(error instanceof Error ? error.message : '操作失败，请稍后再试')
  } finally {
    isSendingCode.value = false
    isSubmitting.value = false
  }
}

function updateCursor(event: MouseEvent) {
  cursorX.value = event.clientX
  cursorY.value = event.clientY
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
        <span>真实认证进行中</span>
      </div>
    </div>

    <div class="login-top-actions" aria-label="登录能力状态">
      <span>本地真实账号</span>
      <span>{{ safeCapabilities.phoneSms ? '短信已接入' : '短信待接入' }}</span>
    </div>

    <section class="login-center" aria-label="登录 Twentys1x">
      <div class="login-copy">
        <p>Twentys1x AI Studio</p>
        <!-- <h1>Secure Local Orbit</h1> -->
        <strong>欢迎一起构建</strong>
        <span>登录后继续你的会话、项目与 AI 工作流，把灵感、代码和知识沉淀成可以反复使用的创作空间。</span>
      </div>

      <section class="login-panel" aria-label="登录表单">
        <div class="login-mode-tabs" role="tablist" aria-label="选择登录方式">
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
          <div class="qr-provider-tabs" aria-label="选择扫码平台">
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
                  ? `${qrProviderLabel}官方授权已就绪`
                  : `${qrProviderLabel}扫码登录未开通`
              }}</strong>
              <span>
                {{
                  activeQrProviderEnabled
                    ? `点击下方按钮进入${qrProviderLabel}官方授权页。`
                    : '该能力需要站点管理员接入第三方开放平台后才会显示真实二维码。'
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
            前往{{ qrProviderLabel }}授权
          </el-button>
          <p class="login-note">
            {{
              activeQrProviderEnabled
                ? `将跳转到${qrProviderLabel}官方授权页，完成后自动回到 Twentys1x。`
                : `${qrProviderLabel}扫码登录暂未开通，请先使用账号密码登录，或联系管理员开通第三方登录。`
            }}
          </p>
        </div>

        <div v-else-if="loginMode === 'phone'" class="login-form">
          <label>
            <span>手机号</span>
            <el-input
              v-model="phoneForm.phone"
              :prefix-icon="Phone"
              maxlength="11"
              placeholder="请输入手机号"
            />
          </label>
          <p v-if="!safeCapabilities.phoneSms" class="login-note">
            手机验证码由站点短信服务发送。当前站点尚未开通，请先使用账号密码登录。
          </p>
          <label>
            <span>验证码</span>
            <div class="code-row">
              <el-input
                v-model="phoneForm.code"
                :prefix-icon="Message"
                maxlength="6"
                placeholder="6 位验证码"
              />
              <el-button
                plain
                :disabled="!safeCapabilities.phoneSms"
                :loading="isSendingCode"
                @click="sendPhoneCode"
              >
                获取验证码
              </el-button>
            </div>
          </label>
          <el-button type="primary" size="large" :loading="isSubmitting" @click="submitPhoneLogin">
            <el-icon><Promotion /></el-icon>
            登录
          </el-button>
        </div>

        <div v-else class="login-form">
          <div class="account-switch" aria-label="账号密码登录注册切换">
            <button type="button" :class="{ active: accountMode === 'login' }" @click="accountMode = 'login'">
              登录
            </button>
            <button
              type="button"
              :class="{ active: accountMode === 'register' }"
              @click="accountMode = 'register'"
            >
              注册
            </button>
          </div>

          <template v-if="accountMode === 'login'">
            <label>
              <span>账号 / 手机号</span>
              <el-input
                v-model="accountForm.identifier"
                :prefix-icon="User"
                placeholder="请输入账号或手机号"
              />
            </label>
            <label>
              <span>密码</span>
              <el-input
                v-model="accountForm.password"
                :prefix-icon="Lock"
                show-password
                type="password"
                placeholder="请输入密码"
              />
            </label>
          </template>

          <template v-else>
            <label>
              <span>账号</span>
              <el-input v-model="accountForm.username" :prefix-icon="User" placeholder="至少 3 个字符" />
            </label>
            <label>
              <span>密码</span>
              <el-input
                v-model="accountForm.password"
                :prefix-icon="Key"
                show-password
                type="password"
                placeholder="至少 8 位"
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
