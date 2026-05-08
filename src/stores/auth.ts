import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getSecureJson, getStoredJson, setSecureJson, setStoredJson } from '../lib/clientStorage'

export type AuthProvider = 'account' | 'phone' | 'wechat' | 'qq'

export interface AuthUser {
  id: string
  name: string
  phone: string
  provider: AuthProvider
  avatarText: string
  linkedProviders: AuthProvider[]
  createdAt: string
}

interface AccountRecord {
  id: string
  username: string
  phone: string
  passwordHash: string
  salt: string
  createdAt: string
  linkedProviders: AuthProvider[]
}

interface SmsChallenge {
  phone: string
  code: string
  expiresAt: number
  purpose: 'login' | 'register'
}

const STORAGE_KEYS = {
  accounts: 'twentys1x:auth-accounts',
  currentUser: 'twentys1x:auth-current-user',
}

const SMS_CODE_TTL_MS = 5 * 60 * 1000

export const useAuthStore = defineStore('auth', () => {
  const currentUser = ref<AuthUser | null>(null)
  const accounts = ref<AccountRecord[]>([])
  const smsChallenge = ref<SmsChallenge | null>(null)
  const isHydrated = ref(false)

  const isAuthenticated = computed(() => Boolean(currentUser.value))

  async function hydrate() {
    if (isHydrated.value) return
    const [storedAccounts, storedUser] = await Promise.all([
      getSecureJson<AccountRecord[]>(STORAGE_KEYS.accounts, []),
      getStoredJson<AuthUser | null>(STORAGE_KEYS.currentUser, null),
    ])
    accounts.value = storedAccounts
    currentUser.value = storedUser
    isHydrated.value = true
  }

  async function requestSmsCode(phone: string, purpose: SmsChallenge['purpose']) {
    const normalizedPhone = normalizePhone(phone)
    if (!isValidMainlandPhone(normalizedPhone)) {
      throw new Error('请输入有效的 11 位手机号')
    }

    const code = String(Math.floor(100000 + Math.random() * 900000))
    smsChallenge.value = {
      phone: normalizedPhone,
      code,
      purpose,
      expiresAt: Date.now() + SMS_CODE_TTL_MS,
    }
    return code
  }

  async function loginWithPhone(phone: string, code: string) {
    const normalizedPhone = normalizePhone(phone)
    verifySmsChallenge(normalizedPhone, code, 'login')

    const existing = accounts.value.find((account) => account.phone === normalizedPhone)
    if (existing) {
      await setCurrentUser(recordToUser(existing, 'phone'))
      return
    }

    const createdAt = new Date().toISOString()
    const account: AccountRecord = {
      id: createId('usr'),
      username: `手机用户${normalizedPhone.slice(-4)}`,
      phone: normalizedPhone,
      passwordHash: '',
      salt: '',
      createdAt,
      linkedProviders: ['phone'],
    }
    accounts.value = [...accounts.value, account]
    await persistAccounts()
    await setCurrentUser(recordToUser(account, 'phone'))
  }

  async function registerWithAccount(username: string, phone: string, code: string, password: string) {
    const normalizedUsername = username.trim()
    const normalizedPhone = normalizePhone(phone)
    if (normalizedUsername.length < 3) throw new Error('账号至少需要 3 个字符')
    if (password.length < 6) throw new Error('密码至少需要 6 位')
    verifySmsChallenge(normalizedPhone, code, 'register')
    if (accounts.value.some((account) => account.username === normalizedUsername)) {
      throw new Error('这个账号名已被注册')
    }
    if (accounts.value.some((account) => account.phone === normalizedPhone)) {
      throw new Error('这个手机号已关联其他账号')
    }

    const salt = createId('salt')
    const account: AccountRecord = {
      id: createId('usr'),
      username: normalizedUsername,
      phone: normalizedPhone,
      passwordHash: await hashPassword(password, salt),
      salt,
      createdAt: new Date().toISOString(),
      linkedProviders: ['account', 'phone'],
    }
    accounts.value = [...accounts.value, account]
    await persistAccounts()
    await setCurrentUser(recordToUser(account, 'account'))
  }

  async function loginWithAccount(identifier: string, password: string) {
    const normalizedIdentifier = identifier.trim()
    const account = accounts.value.find(
      (candidate) =>
        candidate.username === normalizedIdentifier ||
        candidate.phone === normalizePhone(normalizedIdentifier),
    )
    if (!account?.passwordHash || !account.salt) throw new Error('账号或密码不正确')

    const passwordHash = await hashPassword(password, account.salt)
    if (passwordHash !== account.passwordHash) throw new Error('账号或密码不正确')
    await setCurrentUser(recordToUser(account, 'account'))
  }

  async function loginWithQr(provider: Extract<AuthProvider, 'wechat' | 'qq'>) {
    const linkedPhone = `13${String(Math.floor(100000000 + Math.random() * 900000000)).slice(0, 9)}`
    const createdAt = new Date().toISOString()
    const account: AccountRecord = {
      id: createId('usr'),
      username: provider === 'wechat' ? '微信用户' : 'QQ 用户',
      phone: linkedPhone,
      passwordHash: '',
      salt: '',
      createdAt,
      linkedProviders: [provider],
    }
    accounts.value = [...accounts.value, account]
    await persistAccounts()
    await setCurrentUser(recordToUser(account, provider))
  }

  async function logout() {
    currentUser.value = null
    await setStoredJson(STORAGE_KEYS.currentUser, null)
  }

  async function persistAccounts() {
    await setSecureJson(STORAGE_KEYS.accounts, accounts.value)
  }

  async function setCurrentUser(user: AuthUser) {
    currentUser.value = user
    await setStoredJson(STORAGE_KEYS.currentUser, user)
  }

  function verifySmsChallenge(phone: string, code: string, purpose: SmsChallenge['purpose']) {
    if (
      !smsChallenge.value ||
      smsChallenge.value.phone !== phone ||
      smsChallenge.value.purpose !== purpose ||
      smsChallenge.value.expiresAt < Date.now()
    ) {
      throw new Error('验证码已过期，请重新获取')
    }
    if (smsChallenge.value.code !== code.trim()) throw new Error('验证码不正确')
    smsChallenge.value = null
  }

  return {
    currentUser,
    isAuthenticated,
    hydrate,
    requestSmsCode,
    loginWithPhone,
    registerWithAccount,
    loginWithAccount,
    loginWithQr,
    logout,
  }
})

function recordToUser(record: AccountRecord, provider: AuthProvider): AuthUser {
  return {
    id: record.id,
    name: record.username,
    phone: record.phone,
    provider,
    avatarText: record.username.slice(0, 1).toUpperCase(),
    linkedProviders: Array.from(new Set([...record.linkedProviders, provider])),
    createdAt: record.createdAt,
  }
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '')
}

function isValidMainlandPhone(phone: string) {
  return /^1[3-9]\d{9}$/.test(phone)
}

function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

async function hashPassword(password: string, salt: string) {
  const data = new TextEncoder().encode(`${salt}:${password}`)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
