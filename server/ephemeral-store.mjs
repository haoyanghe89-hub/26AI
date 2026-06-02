import { initRedis, isRedisConfigured } from './redis.mjs'

const memoryStore = new Map()
const MEMORY_CLEANUP_INTERVAL = setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of memoryStore) {
    if (entry.expiresAt && entry.expiresAt <= now) memoryStore.delete(key)
  }
}, 60_000)
if (MEMORY_CLEANUP_INTERVAL.unref) MEMORY_CLEANUP_INTERVAL.unref()

export async function setEphemeralJson(key, value, ttlMs) {
  const redis = await readyRedis()
  const payload = JSON.stringify(value)
  if (redis) {
    await redis.set(namespacedKey(key), payload, 'PX', ttlMs)
    return
  }
  memoryStore.set(namespacedKey(key), {
    value: payload,
    expiresAt: Date.now() + ttlMs,
  })
}

export async function getEphemeralJson(key) {
  const redis = await readyRedis()
  const value = redis ? await redis.get(namespacedKey(key)) : readMemory(namespacedKey(key))
  if (!value) return null
  return JSON.parse(value)
}

export async function consumeEphemeralJson(key) {
  const value = await getEphemeralJson(key)
  await deleteEphemeral(key)
  return value
}

export async function deleteEphemeral(key) {
  const redis = await readyRedis()
  if (redis) {
    await redis.del(namespacedKey(key))
    return
  }
  memoryStore.delete(namespacedKey(key))
}

export async function incrementEphemeralCounter(key, ttlMs) {
  const redis = await readyRedis()
  const scopedKey = namespacedKey(key)
  if (redis) {
    const count = await redis.incr(scopedKey)
    if (count === 1) await redis.pexpire(scopedKey, ttlMs)
    const ttl = await redis.pttl(scopedKey)
    return { count, ttlMs: ttl > 0 ? ttl : ttlMs }
  }

  const now = Date.now()
  const existing = memoryStore.get(scopedKey)
  if (!existing || existing.expiresAt <= now) {
    memoryStore.set(scopedKey, { value: '1', expiresAt: now + ttlMs })
    return { count: 1, ttlMs }
  }
  const count = Number(existing.value || 0) + 1
  existing.value = String(count)
  return { count, ttlMs: Math.max(0, existing.expiresAt - now) }
}

async function readyRedis() {
  if (!isRedisConfigured()) return null
  return initRedis().catch((error) => {
    if (process.env.NODE_ENV === 'production') throw error
    console.warn('[redis] falling back to in-memory ephemeral store:', error.message)
    return null
  })
}

function readMemory(key) {
  const entry = memoryStore.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    memoryStore.delete(key)
    return null
  }
  return entry.value
}

function namespacedKey(key) {
  return `${process.env.REDIS_KEY_PREFIX || 'pet-ai'}:${key}`
}
