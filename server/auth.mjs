import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const PROJECT_ROOT = process.cwd()
const DATA_DIR = path.join(PROJECT_ROOT, 'data')
const AUTH_DIR = path.join(DATA_DIR, 'auth')
const USERS_PATH = path.join(AUTH_DIR, 'users.json')
const TOKEN_TTL_SECONDS = Number(process.env.AUTH_TOKEN_TTL_SECONDS || 7 * 24 * 60 * 60)
const TOKEN_SECRET =
  process.env.AUTH_TOKEN_SECRET ||
  crypto.createHash('sha256').update(`dev-secret:${PROJECT_ROOT}`).digest('hex')
const PBKDF2_ITERATIONS = Number(process.env.AUTH_PBKDF2_ITERATIONS || 210_000)
const SMS_CODE_TTL_MS = 5 * 60 * 1000
const SMS_WEBHOOK_URL = process.env.AUTH_SMS_WEBHOOK_URL || ''
const SMS_WEBHOOK_TOKEN = process.env.AUTH_SMS_WEBHOOK_TOKEN || ''
const ALIYUN_SMS_ENDPOINT = process.env.AUTH_ALIYUN_SMS_ENDPOINT || 'dysmsapi.aliyuncs.com'
const ALIYUN_SMS_ACCESS_KEY_ID = process.env.AUTH_ALIYUN_SMS_ACCESS_KEY_ID || ''
const ALIYUN_SMS_ACCESS_KEY_SECRET = process.env.AUTH_ALIYUN_SMS_ACCESS_KEY_SECRET || ''
const ALIYUN_SMS_SIGN_NAME = process.env.AUTH_ALIYUN_SMS_SIGN_NAME || ''
const ALIYUN_SMS_TEMPLATE_CODE = process.env.AUTH_ALIYUN_SMS_TEMPLATE_CODE || ''
const ALIYUN_SMS_TEMPLATE_PARAM_NAME = process.env.AUTH_ALIYUN_SMS_TEMPLATE_PARAM_NAME || 'code'
const OAUTH_TICKET_TTL_MS = 2 * 60 * 1000
const smsChallenges = new Map()
const oauthStates = new Map()
const oauthTickets = new Map()

let cachedUsers

if (!process.env.AUTH_TOKEN_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('AUTH_TOKEN_SECRET is not configured; using a derived development secret.')
}

export async function requestSmsCode(payload) {
  const phone = normalizePhone(payload?.phone)
  const purpose = normalizePurpose(payload?.purpose)
  if (!isValidMainlandPhone(phone)) throw httpError(400, '请输入有效的 11 位手机号')
  if (!isSmsConfigured()) {
    throw httpError(503, '当前站点尚未开通真实短信服务')
  }

  const code = String(crypto.randomInt(100000, 1000000))
  await sendSmsCode({ phone, code, purpose })
  smsChallenges.set(challengeKey(phone, purpose), {
    code,
    phone,
    purpose,
    expiresAt: Date.now() + SMS_CODE_TTL_MS,
  })

  return {
    sent: true,
    expiresInSeconds: SMS_CODE_TTL_MS / 1000,
  }
}

export async function loginWithPhone(payload) {
  const phone = normalizePhone(payload?.phone)
  verifySmsChallenge(phone, payload?.code, 'login')

  const users = await loadUsers()
  let user = users.find((candidate) => candidate.phone === phone)
  if (!user) {
    user = createUser({
      username: `手机用户${phone.slice(-4)}`,
      phone,
      linkedProviders: ['phone'],
    })
    users.unshift(user)
    await saveUsers(users)
  }

  return createAuthResponse(user, 'phone')
}

export async function registerWithAccount(payload) {
  const username = String(payload?.username || '').trim()
  const password = String(payload?.password || '')

  if (username.length < 3) throw httpError(400, '账号至少需要 3 个字符')
  if (password.length < 8) throw httpError(400, '密码至少需要 8 位')

  const users = await loadUsers()
  if (users.some((candidate) => candidate.username === username)) {
    throw httpError(409, '这个账号名已被注册')
  }

  const { passwordHash, salt } = await hashPassword(password)
  const user = createUser({
    username,
    phone: '',
    passwordHash,
    salt,
    linkedProviders: ['account'],
  })
  users.unshift(user)
  await saveUsers(users)
  return createAuthResponse(user, 'account')
}

export async function loginWithAccount(payload) {
  const identifier = String(payload?.identifier || '').trim()
  const password = String(payload?.password || '')
  if (!identifier || !password) throw httpError(400, '账号或密码不正确')

  const users = await loadUsers()
  const normalizedPhone = normalizePhone(identifier)
  const user = users.find(
    (candidate) => candidate.username === identifier || candidate.phone === normalizedPhone,
  )
  if (!user?.passwordHash || !user.salt) throw httpError(401, '账号或密码不正确')
  if (!(await verifyPassword(password, user.passwordHash, user.salt))) {
    throw httpError(401, '账号或密码不正确')
  }

  return createAuthResponse(user, 'account')
}

export async function loginWithDevQr(payload) {
  const provider = payload?.provider === 'qq' ? 'qq' : 'wechat'
  throw httpError(501, `${provider === 'wechat' ? '微信' : 'QQ'}扫码登录需要接入真实 OAuth 回调，当前未启用`)
}

export function getAuthCapabilities() {
  return {
    accountPassword: true,
    phoneSms: isSmsConfigured(),
    oauth: {
      wechat: isOAuthConfigured('wechat'),
      qq: isOAuthConfigured('qq'),
    },
  }
}

export function startOAuthLogin(req, providerId) {
  const provider = getOAuthProvider(providerId)
  if (!provider) throw httpError(404, '不支持的扫码登录方式')
  if (!isOAuthConfigured(provider.id)) {
    throw httpError(503, `${provider.label}扫码登录未配置 OAuth 凭据`)
  }

  const state = crypto.randomBytes(24).toString('base64url')
  oauthStates.set(state, {
    provider: provider.id,
    expiresAt: Date.now() + OAUTH_TICKET_TTL_MS,
  })

  const url = new URL(provider.authUrl)
  for (const [key, value] of Object.entries(provider.authParams(req, state))) {
    url.searchParams.set(key, value)
  }

  return url.toString()
}

export async function handleOAuthCallback(req, providerId) {
  const provider = getOAuthProvider(providerId)
  if (!provider) throw httpError(404, '不支持的扫码登录方式')

  const url = new URL(req.url || '/', getRequestOrigin(req))
  const state = url.searchParams.get('state') || ''
  const code = url.searchParams.get('code') || ''
  const error = url.searchParams.get('error') || ''
  if (error) throw httpError(400, `${provider.label}授权失败：${error}`)
  if (!code || !state) throw httpError(400, 'OAuth 回调缺少 code 或 state')

  const savedState = oauthStates.get(state)
  oauthStates.delete(state)
  if (!savedState || savedState.provider !== provider.id || savedState.expiresAt < Date.now()) {
    throw httpError(400, 'OAuth state 已过期，请重新扫码')
  }

  const token = await provider.exchangeToken(req, code)
  const profile = await provider.fetchProfile(token)
  const user = await upsertOAuthUser(provider, profile)
  const ticket = crypto.randomBytes(24).toString('base64url')
  oauthTickets.set(ticket, {
    provider: provider.id,
    userId: user.id,
    expiresAt: Date.now() + OAUTH_TICKET_TTL_MS,
  })

  return `${getClientOrigin(req)}/login?auth_ticket=${encodeURIComponent(ticket)}`
}

export async function completeOAuthTicket(payload) {
  const ticket = String(payload?.ticket || '').trim()
  const savedTicket = oauthTickets.get(ticket)
  oauthTickets.delete(ticket)
  if (!savedTicket || savedTicket.expiresAt < Date.now()) {
    throw httpError(400, '扫码登录凭证已过期，请重新授权')
  }

  const users = await loadUsers()
  const user = users.find((candidate) => candidate.id === savedTicket.userId)
  if (!user) throw httpError(401, '扫码登录账号不存在')
  return createAuthResponse(user, savedTicket.provider)
}

export async function authenticateRequest(req) {
  const token = getBearerToken(req)
  if (!token) throw httpError(401, '请先登录')

  const payload = verifyToken(token)
  const users = await loadUsers()
  const user = users.find((candidate) => candidate.id === payload.sub)
  if (!user) throw httpError(401, '登录状态已失效')

  return toAuthUser(user, payload.provider || 'account')
}

function createAuthResponse(user, provider) {
  const safeUser = toAuthUser(user, provider)
  return {
    user: safeUser,
    token: signToken({
      sub: user.id,
      provider,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    }),
    expiresInSeconds: TOKEN_TTL_SECONDS,
  }
}

function createUser({ username, phone, passwordHash = '', salt = '', linkedProviders }) {
  const now = new Date().toISOString()
  return {
    id: `usr_${crypto.randomUUID()}`,
    username,
    phone,
    passwordHash,
    salt,
    linkedProviders,
    createdAt: now,
    updatedAt: now,
  }
}

async function upsertOAuthUser(provider, profile) {
  const users = await loadUsers()
  const existing = users.find((candidate) => candidate.externalIdentities?.[provider.id]?.id === profile.id)
  const now = new Date().toISOString()
  if (existing) {
    existing.username = profile.name || existing.username
    existing.avatarUrl = profile.avatarUrl || existing.avatarUrl
    existing.linkedProviders = Array.from(new Set([...(existing.linkedProviders || []), provider.id]))
    existing.externalIdentities = {
      ...(existing.externalIdentities || {}),
      [provider.id]: {
        id: profile.id,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        updatedAt: now,
      },
    }
    existing.updatedAt = now
    await saveUsers(users)
    return existing
  }

  const user = {
    ...createUser({
      username: profile.name || `${provider.label}用户`,
      phone: '',
      linkedProviders: [provider.id],
    }),
    avatarUrl: profile.avatarUrl || '',
    externalIdentities: {
      [provider.id]: {
        id: profile.id,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        updatedAt: now,
      },
    },
  }
  users.unshift(user)
  await saveUsers(users)
  return user
}

async function sendSmsCode({ phone, code, purpose }) {
  if (isAliyunSmsConfigured()) return sendAliyunSmsCode({ phone, code })
  if (!SMS_WEBHOOK_URL) throw httpError(503, '当前站点尚未开通真实短信服务')

  const response = await fetch(SMS_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(SMS_WEBHOOK_TOKEN ? { Authorization: `Bearer ${SMS_WEBHOOK_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      phone,
      code,
      purpose,
      expiresInSeconds: SMS_CODE_TTL_MS / 1000,
    }),
    signal: AbortSignal.timeout(5000),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw httpError(502, text.trim() || `短信服务发送失败：${response.status}`)
  }
}

async function sendAliyunSmsCode({ phone, code }) {
  const query = {
    PhoneNumbers: phone,
    SignName: ALIYUN_SMS_SIGN_NAME,
    TemplateCode: ALIYUN_SMS_TEMPLATE_CODE,
    TemplateParam: JSON.stringify({ [ALIYUN_SMS_TEMPLATE_PARAM_NAME]: code }),
  }
  const queryString = canonicalQueryString(query)
  const contentHash = sha256Hex('')
  const headers = {
    host: ALIYUN_SMS_ENDPOINT,
    'x-acs-action': 'SendSms',
    'x-acs-content-sha256': contentHash,
    'x-acs-date': new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    'x-acs-signature-nonce': crypto.randomUUID(),
    'x-acs-version': '2017-05-25',
  }
  const signedHeaders = Object.keys(headers).sort().join(';')
  const canonicalHeaders = Object.entries(headers)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${String(value).trim()}\n`)
    .join('')
  const canonicalRequest = ['POST', '/', queryString, canonicalHeaders, signedHeaders, contentHash].join('\n')
  const stringToSign = `ACS3-HMAC-SHA256\n${sha256Hex(canonicalRequest)}`
  const signature = crypto
    .createHmac('sha256', ALIYUN_SMS_ACCESS_KEY_SECRET)
    .update(stringToSign)
    .digest('hex')
  const response = await fetch(`https://${ALIYUN_SMS_ENDPOINT}/?${queryString}`, {
    method: 'POST',
    headers: {
      ...headers,
      Authorization: `ACS3-HMAC-SHA256 Credential=${ALIYUN_SMS_ACCESS_KEY_ID},SignedHeaders=${signedHeaders},Signature=${signature}`,
    },
    signal: AbortSignal.timeout(8000),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || data?.Code !== 'OK') {
    throw httpError(502, data?.Message || data?.Code || `阿里云短信发送失败：${response.status}`, data)
  }
}

function isSmsConfigured() {
  return Boolean(SMS_WEBHOOK_URL || isAliyunSmsConfigured())
}

function isAliyunSmsConfigured() {
  return Boolean(
    ALIYUN_SMS_ACCESS_KEY_ID &&
    ALIYUN_SMS_ACCESS_KEY_SECRET &&
    ALIYUN_SMS_SIGN_NAME &&
    ALIYUN_SMS_TEMPLATE_CODE,
  )
}

function canonicalQueryString(params) {
  return Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join('&')
}

function percentEncode(value) {
  return encodeURIComponent(String(value)).replace(/\+/g, '%20').replace(/\*/g, '%2A').replace(/%7E/g, '~')
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function toAuthUser(user, provider) {
  return {
    id: user.id,
    name: user.username,
    phone: user.phone,
    provider,
    avatarText: user.username.slice(0, 1).toUpperCase(),
    linkedProviders: Array.from(new Set([...(user.linkedProviders || []), provider])),
    createdAt: user.createdAt,
  }
}

function getOAuthProvider(providerId) {
  const id = providerId === 'qq' ? 'qq' : providerId === 'wechat' ? 'wechat' : ''
  if (!id) return null

  const providers = {
    wechat: {
      id: 'wechat',
      label: '微信',
      clientId: process.env.AUTH_WECHAT_CLIENT_ID || '',
      clientSecret: process.env.AUTH_WECHAT_CLIENT_SECRET || '',
      authUrl: process.env.AUTH_WECHAT_AUTH_URL || 'https://open.weixin.qq.com/connect/qrconnect',
      tokenUrl: process.env.AUTH_WECHAT_TOKEN_URL || 'https://api.weixin.qq.com/sns/oauth2/access_token',
      userInfoUrl: process.env.AUTH_WECHAT_USERINFO_URL || 'https://api.weixin.qq.com/sns/userinfo',
      scope: process.env.AUTH_WECHAT_SCOPE || 'snsapi_login',
      authParams(req, state) {
        return {
          appid: this.clientId,
          redirect_uri: getOAuthRedirectUri(req, this.id),
          response_type: 'code',
          scope: this.scope,
          state,
        }
      },
      async exchangeToken(req, code) {
        const url = new URL(this.tokenUrl)
        url.searchParams.set('appid', this.clientId)
        url.searchParams.set('secret', this.clientSecret)
        url.searchParams.set('code', code)
        url.searchParams.set('grant_type', 'authorization_code')
        const data = await fetchOAuthJson(url)
        if (!data.access_token || !data.openid) {
          throw httpError(502, data.errmsg || '微信 OAuth token 响应无效', data)
        }
        return data
      },
      async fetchProfile(token) {
        const url = new URL(this.userInfoUrl)
        url.searchParams.set('access_token', token.access_token)
        url.searchParams.set('openid', token.openid)
        url.searchParams.set('lang', 'zh_CN')
        const data = await fetchOAuthJson(url)
        return {
          id: String(data.openid || token.openid),
          name: String(data.nickname || '微信用户'),
          avatarUrl: String(data.headimgurl || ''),
        }
      },
    },
    qq: {
      id: 'qq',
      label: 'QQ',
      clientId: process.env.AUTH_QQ_CLIENT_ID || '',
      clientSecret: process.env.AUTH_QQ_CLIENT_SECRET || '',
      authUrl: process.env.AUTH_QQ_AUTH_URL || 'https://graph.qq.com/oauth2.0/authorize',
      tokenUrl: process.env.AUTH_QQ_TOKEN_URL || 'https://graph.qq.com/oauth2.0/token',
      meUrl: process.env.AUTH_QQ_ME_URL || 'https://graph.qq.com/oauth2.0/me',
      userInfoUrl: process.env.AUTH_QQ_USERINFO_URL || 'https://graph.qq.com/user/get_user_info',
      scope: process.env.AUTH_QQ_SCOPE || 'get_user_info',
      authParams(req, state) {
        return {
          client_id: this.clientId,
          redirect_uri: getOAuthRedirectUri(req, this.id),
          response_type: 'code',
          scope: this.scope,
          state,
        }
      },
      async exchangeToken(req, code) {
        const url = new URL(this.tokenUrl)
        url.searchParams.set('grant_type', 'authorization_code')
        url.searchParams.set('client_id', this.clientId)
        url.searchParams.set('client_secret', this.clientSecret)
        url.searchParams.set('code', code)
        url.searchParams.set('redirect_uri', getOAuthRedirectUri(req, this.id))
        const data = await fetchOAuthBody(url)
        if (!data.access_token)
          throw httpError(502, data.error_description || 'QQ OAuth token 响应无效', data)
        return data
      },
      async fetchProfile(token) {
        const meUrl = new URL(this.meUrl)
        meUrl.searchParams.set('access_token', token.access_token)
        const me = await fetchOAuthJsonp(meUrl)
        if (!me.openid) throw httpError(502, 'QQ OAuth openid 响应无效', me)

        const profileUrl = new URL(this.userInfoUrl)
        profileUrl.searchParams.set('access_token', token.access_token)
        profileUrl.searchParams.set('oauth_consumer_key', this.clientId)
        profileUrl.searchParams.set('openid', me.openid)
        const data = await fetchOAuthJson(profileUrl)
        return {
          id: String(me.openid),
          name: String(data.nickname || 'QQ 用户'),
          avatarUrl: String(data.figureurl_qq_2 || data.figureurl_qq_1 || data.figureurl || ''),
        }
      },
    },
  }

  return providers[id]
}

function isOAuthConfigured(providerId) {
  const provider = getOAuthProvider(providerId)
  return Boolean(provider?.clientId && provider.clientSecret)
}

async function fetchOAuthJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  })
  const text = await response.text()
  const data = parseOAuthPayload(text)
  if (!response.ok)
    throw httpError(502, extractOAuthError(data) || `OAuth 请求失败：${response.status}`, data)
  if (extractOAuthError(data)) throw httpError(502, extractOAuthError(data), data)
  return data
}

async function fetchOAuthBody(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  })
  const text = await response.text()
  const data = parseOAuthPayload(text)
  if (!response.ok)
    throw httpError(502, extractOAuthError(data) || `OAuth 请求失败：${response.status}`, data)
  return data
}

async function fetchOAuthJsonp(url) {
  const data = await fetchOAuthBody(url)
  if (extractOAuthError(data)) throw httpError(502, extractOAuthError(data), data)
  return data
}

function parseOAuthPayload(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return {}

  try {
    return JSON.parse(trimmed)
  } catch {
    const jsonpMatch = trimmed.match(/^[^(]*\((.*)\);?$/s)
    if (jsonpMatch) return JSON.parse(jsonpMatch[1])
    return Object.fromEntries(new URLSearchParams(trimmed))
  }
}

function extractOAuthError(data) {
  if (!data || typeof data !== 'object') return ''
  return String(data.errmsg || data.error_description || data.error || '').trim()
}

function getOAuthRedirectUri(req, providerId) {
  return `${getRequestOrigin(req)}/api/auth/oauth/${providerId}/callback`
}

function getRequestOrigin(req) {
  if (process.env.AUTH_PUBLIC_BASE_URL) return process.env.AUTH_PUBLIC_BASE_URL.replace(/\/$/, '')
  const proto = req.headers['x-forwarded-proto'] || 'http'
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost'
  return `${proto}://${host}`
}

function getClientOrigin(req) {
  if (process.env.AUTH_CLIENT_BASE_URL) return process.env.AUTH_CLIENT_BASE_URL.replace(/\/$/, '')
  const referer = req.headers.referer || ''
  if (referer) return new URL(referer).origin
  return getRequestOrigin(req)
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString('base64url')) {
  const passwordHash = await new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, PBKDF2_ITERATIONS, 32, 'sha256', (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey.toString('base64url'))
    })
  })
  return { passwordHash, salt }
}

async function verifyPassword(password, expectedHash, salt) {
  const { passwordHash } = await hashPassword(password, salt)
  const actual = Buffer.from(passwordHash)
  const expected = Buffer.from(expectedHash)
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

function verifySmsChallenge(phone, code, purpose) {
  if (!isValidMainlandPhone(phone)) throw httpError(400, '请输入有效的 11 位手机号')
  const key = challengeKey(phone, purpose)
  const challenge = smsChallenges.get(key)
  if (!challenge || challenge.expiresAt < Date.now()) {
    smsChallenges.delete(key)
    throw httpError(400, '验证码已过期，请重新获取')
  }
  if (challenge.code !== String(code || '').trim()) throw httpError(400, '验证码不正确')
  smsChallenges.delete(key)
}

function signToken(payload) {
  const encodedPayload = base64UrlJson(payload)
  const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(encodedPayload).digest('base64url')
  return `${encodedPayload}.${signature}`
}

function verifyToken(token) {
  const [encodedPayload, signature] = String(token || '').split('.')
  if (!encodedPayload || !signature) throw httpError(401, '登录状态已失效')

  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(encodedPayload).digest('base64url')
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw httpError(401, '登录状态已失效')
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
  if (!payload?.sub || Number(payload.exp || 0) < Math.floor(Date.now() / 1000)) {
    throw httpError(401, '登录状态已过期')
  }
  return payload
}

async function loadUsers() {
  if (cachedUsers) return cachedUsers
  try {
    const raw = await fs.readFile(USERS_PATH, 'utf8')
    cachedUsers = JSON.parse(raw)
    return Array.isArray(cachedUsers) ? cachedUsers : []
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    cachedUsers = []
    return cachedUsers
  }
}

async function saveUsers(users) {
  cachedUsers = users
  await fs.mkdir(AUTH_DIR, { recursive: true })
  await fs.writeFile(USERS_PATH, JSON.stringify(users, null, 2))
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '')
}

function normalizePurpose(purpose) {
  return purpose === 'register' ? 'register' : 'login'
}

function isValidMainlandPhone(phone) {
  return /^1[3-9]\d{9}$/.test(phone)
}

function challengeKey(phone, purpose) {
  return `${purpose}:${phone}`
}

function getBearerToken(req) {
  const authorization = req.headers.authorization || ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ''
}

function base64UrlJson(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

function httpError(status, message, details) {
  const error = new Error(message)
  error.status = status
  error.details = details
  return error
}
