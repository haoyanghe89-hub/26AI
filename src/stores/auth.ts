import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getStoredJson, setStoredJson } from '../lib/clientStorage'

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

type SmsPurpose = 'login' | 'register'

interface AuthResponse {
  user: AuthUser
  token: string
  expiresInSeconds: number
}

export interface AuthCapabilities {
  accountPassword: boolean
  phoneSms: boolean
  oauth: Record<'wechat' | 'qq', boolean>
}

const STORAGE_KEYS = {
  currentUser: 'twentys1x:auth-current-user',
  token: 'twentys1x:auth-token',
}

export const AUTH_TOKEN_STORAGE_KEY = STORAGE_KEYS.token
const DEFAULT_CAPABILITIES: AuthCapabilities = {
  accountPassword: true,
  phoneSms: false,
  oauth: {
    wechat: false,
    qq: false,
  },
}

export const useAuthStore = defineStore('auth', () => {
  const currentUser = ref<AuthUser | null>(null)
  const token = ref('')
  const capabilities = ref<AuthCapabilities>(DEFAULT_CAPABILITIES)
  const isHydrated = ref(false)

  const isAuthenticated = computed(() => Boolean(currentUser.value && token.value))

  async function hydrate() {
    if (isHydrated.value) return

    token.value = readToken()
    currentUser.value = await getStoredJson<AuthUser | null>(STORAGE_KEYS.currentUser, null)
    await refreshCapabilities()
    if (token.value) {
      try {
        const data = await authRequest<{ user: AuthUser }>('/api/auth/me', { method: 'GET' })
        currentUser.value = data.user
        await setStoredJson(STORAGE_KEYS.currentUser, data.user)
      } catch {
        await clearAuthState()
      }
    } else {
      currentUser.value = null
    }

    isHydrated.value = true
  }

  async function requestSmsCode(phone: string, purpose: SmsPurpose) {
    const data = await publicAuthRequest<{ sent: boolean }>('/api/auth/sms', {
      phone,
      purpose,
    })
    return data.sent
  }

  async function loginWithPhone(phone: string, code: string) {
    await applyAuthResponse(
      await publicAuthRequest<AuthResponse>('/api/auth/phone-login', {
        phone,
        code,
      }),
    )
  }

  async function registerWithAccount(username: string, password: string) {
    await applyAuthResponse(
      await publicAuthRequest<AuthResponse>('/api/auth/register', {
        username,
        password,
      }),
    )
  }

  async function loginWithAccount(identifier: string, password: string) {
    await applyAuthResponse(
      await publicAuthRequest<AuthResponse>('/api/auth/login', {
        identifier,
        password,
      }),
    )
  }

  async function loginWithQr(provider: Extract<AuthProvider, 'wechat' | 'qq'>) {
    window.location.assign(`/api/auth/oauth/${provider}/start`)
  }

  async function completeOAuthLogin(ticket: string) {
    await applyAuthResponse(await publicAuthRequest<AuthResponse>('/api/auth/oauth/complete', { ticket }))
  }

  async function logout() {
    try {
      if (token.value) await authRequest('/api/auth/logout', { method: 'POST' })
    } finally {
      await clearAuthState()
    }
  }

  async function applyAuthResponse(response: AuthResponse) {
    token.value = response.token
    currentUser.value = response.user
    writeToken(response.token)
    await setStoredJson(STORAGE_KEYS.currentUser, response.user)
  }

  async function clearAuthState() {
    token.value = ''
    currentUser.value = null
    writeToken('')
    await setStoredJson(STORAGE_KEYS.currentUser, null)
  }

  async function refreshCapabilities() {
    try {
      capabilities.value = normalizeCapabilities(
        await authRequest<AuthCapabilities>('/api/auth/capabilities', { method: 'GET' }),
      )
    } catch {
      capabilities.value = DEFAULT_CAPABILITIES
    }
  }

  return {
    currentUser,
    capabilities,
    isAuthenticated,
    hydrate,
    requestSmsCode,
    loginWithPhone,
    registerWithAccount,
    loginWithAccount,
    loginWithQr,
    completeOAuthLogin,
    logout,
  }
})

async function publicAuthRequest<T>(url: string, body: Record<string, unknown>): Promise<T> {
  return authRequest<T>(url, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

async function authRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const authToken = readToken()
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...init.headers,
    },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || `认证请求失败：${response.status}`)
  return data as T
}

function readToken() {
  return localStorage.getItem(STORAGE_KEYS.token) || ''
}

function writeToken(value: string) {
  if (value) localStorage.setItem(STORAGE_KEYS.token, value)
  else localStorage.removeItem(STORAGE_KEYS.token)
}

function normalizeCapabilities(value: AuthCapabilities | null | undefined): AuthCapabilities {
  return {
    accountPassword: value?.accountPassword !== false,
    phoneSms: Boolean(value?.phoneSms),
    oauth: {
      wechat: Boolean(value?.oauth?.wechat),
      qq: Boolean(value?.oauth?.qq),
    },
  }
}
