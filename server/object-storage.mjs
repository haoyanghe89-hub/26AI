import crypto from 'node:crypto'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

let s3Client

export function getObjectStorageConfig() {
  return {
    enabled: isObjectStorageConfigured(),
    provider: process.env.OBJECT_STORAGE_PROVIDER || 's3',
    bucket: process.env.OBJECT_STORAGE_BUCKET || '',
    region: process.env.OBJECT_STORAGE_REGION || 'auto',
    publicBaseUrl: trimTrailingSlash(process.env.OBJECT_STORAGE_PUBLIC_BASE_URL || ''),
  }
}

export function isObjectStorageConfigured() {
  return Boolean(
    process.env.OBJECT_STORAGE_BUCKET &&
    process.env.OBJECT_STORAGE_ACCESS_KEY_ID &&
    process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
  )
}

export async function putObject({ key, body, contentType, metadata = {} }) {
  assertStorageConfigured()
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: process.env.OBJECT_STORAGE_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
      Metadata: sanitizeMetadata(metadata),
    }),
  )
  return {
    key,
    url: buildPublicUrl(key),
  }
}

export async function createPresignedUpload({ key, contentType, expiresInSeconds = 300 }) {
  assertStorageConfigured()
  const command = new PutObjectCommand({
    Bucket: process.env.OBJECT_STORAGE_BUCKET,
    Key: key,
    ContentType: contentType || 'application/octet-stream',
  })
  return {
    key,
    url: await getSignedUrl(getS3Client(), command, { expiresIn: expiresInSeconds }),
    publicUrl: buildPublicUrl(key),
    expiresInSeconds,
  }
}

export async function createPresignedDownload({ key, expiresInSeconds = 300 }) {
  assertStorageConfigured()
  const command = new GetObjectCommand({
    Bucket: process.env.OBJECT_STORAGE_BUCKET,
    Key: key,
  })
  return {
    key,
    url: await getSignedUrl(getS3Client(), command, { expiresIn: expiresInSeconds }),
    expiresInSeconds,
  }
}

export async function deleteObject(key) {
  assertStorageConfigured()
  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: process.env.OBJECT_STORAGE_BUCKET,
      Key: key,
    }),
  )
  return { deleted: true, key }
}

export function buildUserObjectKey(userId, filename) {
  const extension = safeExtension(filename)
  const suffix = crypto.randomUUID()
  return `users/${userId}/${new Date().toISOString().slice(0, 10)}/${suffix}${extension}`
}

function getS3Client() {
  if (s3Client) return s3Client
  s3Client = new S3Client({
    region: process.env.OBJECT_STORAGE_REGION || 'auto',
    endpoint: process.env.OBJECT_STORAGE_ENDPOINT || undefined,
    forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID,
      secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
    },
  })
  return s3Client
}

function assertStorageConfigured() {
  if (!isObjectStorageConfigured()) {
    const error = new Error('对象存储尚未配置')
    error.status = 503
    throw error
  }
}

function buildPublicUrl(key) {
  const baseUrl = trimTrailingSlash(process.env.OBJECT_STORAGE_PUBLIC_BASE_URL || '')
  if (!baseUrl) return ''
  return `${baseUrl}/${encodeURIComponent(key).replace(/%2F/g, '/')}`
}

function sanitizeMetadata(metadata) {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  )
}

function safeExtension(filename) {
  const match = String(filename || '')
    .toLowerCase()
    .match(/\.[a-z0-9]{1,12}$/)
  return match ? match[0] : ''
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/$/, '')
}
