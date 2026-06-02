import Redis from 'ioredis'

let redisClient
let connectPromise

export function isRedisConfigured() {
  return Boolean(process.env.REDIS_URL)
}

export async function initRedis() {
  const client = getRedisClient()
  if (!client) return null
  if (client.status === 'ready') return client
  if (!connectPromise) {
    connectPromise = client.connect().catch((error) => {
      connectPromise = null
      throw error
    })
  }
  return connectPromise
}

export function getRedisClient() {
  if (!isRedisConfigured()) return null
  if (redisClient) return redisClient

  redisClient = new Redis(process.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  })
  redisClient.on('error', (error) => {
    console.error('[redis] connection error:', error.message)
  })
  return redisClient
}
