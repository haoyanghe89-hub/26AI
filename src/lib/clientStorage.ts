import localforage from 'localforage'

const store = localforage.createInstance({
  name: 'twentys1x',
  storeName: 'client_state',
  description: 'Twentys1x local client state',
})

const keyStore = localforage.createInstance({
  name: 'twentys1x',
  storeName: 'secure_keys',
  description: 'Twentys1x origin-scoped encryption keys',
})

const CRYPTO_KEY_ID = 'api-key-encryption-key'

interface EncryptedPayload {
  iv: string
  data: string
}

export async function getStoredString(key: string) {
  const value = await store.getItem<string>(key)
  return typeof value === 'string' ? value : null
}

export async function setStoredString(key: string, value: string) {
  await store.setItem(key, value)
}

export async function getStoredJson<T>(key: string, fallback: T) {
  const raw = await getStoredString(key)
  if (!raw) return fallback

  try {
    return JSON.parse(raw) as T
  } catch {
    await store.removeItem(key)
    return fallback
  }
}

export async function setStoredJson<T>(key: string, value: T) {
  await setStoredString(key, JSON.stringify(value))
}

export async function getSecureJson<T>(key: string, fallback: T) {
  const payload = await store.getItem<EncryptedPayload>(key)
  if (!payload?.iv || !payload.data) return fallback

  try {
    return JSON.parse(await decryptString(payload)) as T
  } catch {
    await store.removeItem(key)
    return fallback
  }
}

export async function setSecureJson<T>(key: string, value: T) {
  await store.setItem(key, await encryptString(JSON.stringify(value)))
}

async function getCryptoKey() {
  const existing = await keyStore.getItem<CryptoKey>(CRYPTO_KEY_ID)
  if (existing) return existing

  const generated = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
  await keyStore.setItem(CRYPTO_KEY_ID, generated)
  return generated
}

async function encryptString(value: string): Promise<EncryptedPayload> {
  const key = await getCryptoKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(value)
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)

  return {
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
  }
}

async function decryptString(payload: EncryptedPayload) {
  const key = await getCryptoKey()
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(payload.iv) },
    key,
    base64ToBytes(payload.data),
  )
  return new TextDecoder().decode(decrypted)
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}
