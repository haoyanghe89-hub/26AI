import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { translate } from '../i18n'
import { getStoredJson, setStoredJson } from '../lib/clientStorage'
import { apiUrl } from '../lib/request'
import {
  DEFAULT_CARE_EXPERIENCE_LEVEL,
  DEFAULT_GUIDANCE_PREFERENCE,
  normalizeCareExperienceLevel,
  normalizeGuidancePreference,
  type CareExperienceLevel,
  type GuidancePreference,
} from '../config/careExperienceContent'

export type AuthProvider = 'account' | 'phone' | 'wechat' | 'qq'

export interface AuthUser {
  id: string
  name: string
  phone: string
  provider: AuthProvider
  avatarText: string
  linkedProviders: AuthProvider[]
  createdAt: string
  careExperienceLevel: CareExperienceLevel
  guidancePreference: GuidancePreference
  onboardingCompleted: boolean
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
  onboardingPreference: 'twentys1x:auth-onboarding-preference',
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
  const hasCompletedOnboarding = computed(() => currentUser.value?.onboardingCompleted === true)
  const careExperienceLevel = computed(() =>
    normalizeCareExperienceLevel(currentUser.value?.careExperienceLevel),
  )
  const guidancePreference = computed(() =>
    normalizeGuidancePreference(currentUser.value?.guidancePreference),
  )

  async function hydrate() {
    if (isHydrated.value) return

    token.value = readToken()
    currentUser.value = normalizeAuthUser(
      await getStoredJson<AuthUser | null>(STORAGE_KEYS.currentUser, null),
    )
    await refreshCapabilities()
    if (token.value) {
      try {
        const data = await authRequest<{ user: AuthUser }>('/api/auth/me', { method: 'GET' })
        currentUser.value = await mergeStoredOnboardingFallback(normalizeAuthUser(data.user))
        await setStoredJson(STORAGE_KEYS.currentUser, currentUser.value)
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

  async function registerWithPhone(phone: string, code: string, password: string) {
    await applyAuthResponse(
      await publicAuthRequest<AuthResponse>('/api/auth/register-phone', {
        phone,
        code,
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
    const url = apiUrl(`/api/auth/oauth/${provider}/start`)
    window.location.assign(typeof url === 'string' ? url : url.toString())
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

  async function saveOnboardingPreference(payload: {
    careExperienceLevel?: CareExperienceLevel
    guidancePreference?: GuidancePreference
    onboardingCompleted?: boolean
  }) {
    const normalized = {
      careExperienceLevel: normalizeCareExperienceLevel(payload.careExperienceLevel),
      guidancePreference: normalizeGuidancePreference(payload.guidancePreference),
      onboardingCompleted: payload.onboardingCompleted !== false,
    }

    try {
      const data = await authRequest<{ user: AuthUser }>('/api/auth/preferences', {
        method: 'PUT',
        body: JSON.stringify(normalized),
      })
      currentUser.value = normalizeAuthUser(data.user)
    } catch {
      currentUser.value = normalizeAuthUser({
        ...(currentUser.value || createFallbackUser()),
        ...normalized,
      })
    }

    await setStoredJson(STORAGE_KEYS.currentUser, currentUser.value)
    await setStoredJson(STORAGE_KEYS.onboardingPreference, normalized)
  }

  async function applyAuthResponse(response: AuthResponse) {
    token.value = response.token
    currentUser.value = await mergeStoredOnboardingFallback(normalizeAuthUser(response.user))
    writeToken(response.token)
    await setStoredJson(STORAGE_KEYS.currentUser, currentUser.value)
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
    hasCompletedOnboarding,
    careExperienceLevel,
    guidancePreference,
    hydrate,
    requestSmsCode,
    loginWithPhone,
    registerWithAccount,
    registerWithPhone,
    loginWithAccount,
    loginWithQr,
    completeOAuthLogin,
    saveOnboardingPreference,
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
  const response = await fetch(apiUrl(url), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...init.headers,
    },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok)
    throw new Error(data?.error || translate('errors.authRequestFailed', { status: response.status }))
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

function normalizeAuthUser(user: Partial<AuthUser> | null | undefined): AuthUser | null {
  if (!user?.id) return null
  return {
    id: String(user.id),
    name: String(user.name || '用户'),
    phone: String(user.phone || ''),
    provider: normalizeProvider(user.provider),
    avatarText: String(user.avatarText || user.name?.slice(0, 1) || '宠').slice(0, 1),
    linkedProviders: Array.isArray(user.linkedProviders) ? user.linkedProviders : [],
    createdAt: String(user.createdAt || new Date().toISOString()),
    careExperienceLevel: normalizeCareExperienceLevel(user.careExperienceLevel),
    guidancePreference: normalizeGuidancePreference(user.guidancePreference),
    onboardingCompleted: user.onboardingCompleted === true,
  }
}

async function mergeStoredOnboardingFallback(user: AuthUser | null) {
  if (!user) return null
  if (user.onboardingCompleted) return user

  const fallback = await getStoredJson<{
    careExperienceLevel?: CareExperienceLevel
    guidancePreference?: GuidancePreference
    onboardingCompleted?: boolean
  } | null>(STORAGE_KEYS.onboardingPreference, null)
  if (!fallback?.onboardingCompleted) return user

  return {
    ...user,
    careExperienceLevel: normalizeCareExperienceLevel(fallback.careExperienceLevel),
    guidancePreference: normalizeGuidancePreference(fallback.guidancePreference),
    onboardingCompleted: true,
  }
}

function createFallbackUser(): AuthUser {
  return {
    id: 'local-user',
    name: '用户',
    phone: '',
    provider: 'account',
    avatarText: '宠',
    linkedProviders: ['account'],
    createdAt: new Date().toISOString(),
    careExperienceLevel: DEFAULT_CARE_EXPERIENCE_LEVEL,
    guidancePreference: DEFAULT_GUIDANCE_PREFERENCE,
    onboardingCompleted: false,
  }
}

function normalizeProvider(value: unknown): AuthProvider {
  return value === 'phone' || value === 'wechat' || value === 'qq' || value === 'account'
    ? value
    : 'account'
}
