<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChatDotRound, Check, Key, Lock, Message, Phone, Promotion, User } from '@element-plus/icons-vue'
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

const loginMode = ref<LoginMode>('qr')
const accountMode = ref<AccountMode>('login')
const qrProvider = ref<QrProvider>('wechat')
const isSubmitting = ref(false)
const isSendingCode = ref(false)
const lastSmsCode = ref('')

const phoneForm = ref({
  phone: '',
  code: '',
})
const accountForm = ref({
  identifier: '',
  username: '',
  phone: '',
  code: '',
  password: '',
})

const loginModeOptions: Array<{ id: LoginMode; label: string }> = [
  { id: 'qr', label: '扫码登录' },
  { id: 'phone', label: '手机验证码' },
  { id: 'account', label: '账号密码' },
]

const qrProviderOptions: Array<{ id: QrProvider; label: string }> = [
  { id: 'wechat', label: '微信' },
  { id: 'qq', label: 'QQ' },
]

const qrProviderLabel = computed(() => (qrProvider.value === 'wechat' ? '微信' : 'QQ'))
const accountSubmitLabel = computed(() => (accountMode.value === 'login' ? '登录' : '注册并登录'))

async function sendPhoneCode() {
  await withFeedback(async () => {
    lastSmsCode.value = await auth.requestSmsCode(phoneForm.value.phone, 'login')
    ElMessage.success(`验证码已发送：${lastSmsCode.value}`)
  }, true)
}

async function sendRegisterCode() {
  await withFeedback(async () => {
    lastSmsCode.value = await auth.requestSmsCode(accountForm.value.phone, 'register')
    ElMessage.success(`验证码已发送：${lastSmsCode.value}`)
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
      await auth.registerWithAccount(
        accountForm.value.username,
        accountForm.value.phone,
        accountForm.value.code,
        accountForm.value.password,
      )
    }
    await router.replace('/')
  })
}

async function confirmQrLogin() {
  await withFeedback(async () => {
    await auth.loginWithQr(qrProvider.value)
    await router.replace('/')
  })
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
</script>

<template>
  <main id="main-content" class="login-shell">
    <div class="login-brand">
      <div class="logo-mark">T1</div>
      <div>
        <strong>Twentys1x</strong>
        <span>AI Studio</span>
      </div>
    </div>

    <section class="login-center" aria-label="登录 Twentys1x">
      <div class="login-copy">
        <p>欢迎来到 Twentys1x AI Studio！</p>
        <h1>登录后继续你的会话、项目与 AI 工作流。</h1>
        <span>支持扫码、验证码和账号密码登录。注册账号时会同步绑定手机号，方便后续找回与安全验证。</span>
      </div>

      <section class="login-panel" aria-label="登录表单">
        <div class="login-mode-tabs" role="tablist" aria-label="选择登录方式">
          <button
            v-for="option in loginModeOptions"
            :key="option.id"
            type="button"
            :class="{ active: loginMode === option.id }"
            @click="loginMode = option.id"
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
              :class="{ active: qrProvider === provider.id }"
              @click="qrProvider = provider.id"
            >
              {{ provider.label }}
            </button>
          </div>

          <div class="qr-card" :class="`provider-${qrProvider}`">
            <div class="qr-code" aria-label="模拟扫码二维码">
              <span
                v-for="index in 49"
                :key="index"
                :class="{ filled: (index + qrProvider.length) % 3 !== 0 }"
              ></span>
            </div>
            <div class="qr-status">
              <el-icon><ChatDotRound /></el-icon>
              使用{{ qrProviderLabel }}扫码确认
            </div>
          </div>

          <el-button type="primary" size="large" :loading="isSubmitting" @click="confirmQrLogin">
            <el-icon><Check /></el-icon>
            已扫码并确认
          </el-button>
          <p class="login-note">当前为本地开发扫码占位；接入真实微信/QQ 后替换授权回调即可。</p>
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
          <label>
            <span>验证码</span>
            <div class="code-row">
              <el-input
                v-model="phoneForm.code"
                :prefix-icon="Message"
                maxlength="6"
                placeholder="6 位验证码"
              />
              <el-button plain :loading="isSendingCode" @click="sendPhoneCode">获取验证码</el-button>
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
              <span>关联手机号</span>
              <el-input
                v-model="accountForm.phone"
                :prefix-icon="Phone"
                maxlength="11"
                placeholder="注册必须绑定手机号"
              />
            </label>
            <label>
              <span>手机验证码</span>
              <div class="code-row">
                <el-input
                  v-model="accountForm.code"
                  :prefix-icon="Message"
                  maxlength="6"
                  placeholder="6 位验证码"
                />
                <el-button plain :loading="isSendingCode" @click="sendRegisterCode">获取验证码</el-button>
              </div>
            </label>
            <label>
              <span>密码</span>
              <el-input
                v-model="accountForm.password"
                :prefix-icon="Key"
                show-password
                type="password"
                placeholder="至少 6 位"
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
