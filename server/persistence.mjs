import fs from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const PROJECT_ROOT = process.cwd()
const DATA_DIR = path.join(PROJECT_ROOT, 'data')
const DB_PATH = process.env.APP_DATABASE_URL?.startsWith('sqlite:')
  ? process.env.APP_DATABASE_URL.slice('sqlite:'.length)
  : path.join(DATA_DIR, 'app.sqlite')

let db

export async function initPersistence() {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true })
  db = new DatabaseSync(DB_PATH)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      title TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      tags_infer_attempts INTEGER NOT NULL DEFAULT 0,
      summary_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, id)
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      id TEXT NOT NULL,
      position INTEGER NOT NULL,
      role TEXT NOT NULL,
      content_json TEXT NOT NULL,
      attachments_json TEXT,
      tool_logs_json TEXT,
      plan_json TEXT,
      meta_json TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, session_id, id),
      FOREIGN KEY (user_id, session_id)
        REFERENCES chat_sessions(user_id, id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS prompt_assets (
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      id TEXT NOT NULL,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, type, id)
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    );

    CREATE TABLE IF NOT EXISTS project_metadata (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, id)
    );

    CREATE TABLE IF NOT EXISTS pet_state_collections (
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      id TEXT NOT NULL,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, type, id)
    );
  `)
}

export async function loadUserState(userId) {
  ensureDb()
  const sessions = db
    .prepare(
      `SELECT id, title, tags_json, tags_infer_attempts, summary_json, created_at, updated_at
       FROM chat_sessions
       WHERE user_id = ?
       ORDER BY updated_at DESC, created_at DESC`,
    )
    .all(userId)
    .map((row) => ({
      id: row.id,
      title: row.title,
      tags: parseJson(row.tags_json, []),
      tagsInferAttempts: Number(row.tags_infer_attempts || 0),
      summary: row.summary_json ? parseJson(row.summary_json, undefined) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messages: [],
    }))

  const bySession = new Map(sessions.map((session) => [session.id, session]))
  const messages = db
    .prepare(
      `SELECT session_id, id, role, content_json, attachments_json, tool_logs_json, plan_json, meta_json, created_at
       FROM chat_messages
       WHERE user_id = ?
       ORDER BY session_id, position ASC`,
    )
    .all(userId)

  for (const row of messages) {
    const session = bySession.get(row.session_id)
    if (!session) continue
    session.messages.push({
      id: row.id,
      role: row.role,
      content: parseJson(row.content_json, ''),
      attachments: row.attachments_json ? parseJson(row.attachments_json, undefined) : undefined,
      toolLogs: row.tool_logs_json ? parseJson(row.tool_logs_json, undefined) : undefined,
      plan: row.plan_json ? parseJson(row.plan_json, undefined) : undefined,
      meta: row.meta_json ? parseJson(row.meta_json, undefined) : undefined,
      createdAt: row.created_at,
    })
  }

  return {
    empty: sessions.length === 0 && countUserRows(userId) === 0,
    sessions,
    promptTemplates: loadPromptAssets(userId, 'template'),
    customAgents: loadPromptAssets(userId, 'agent'),
    promptWorkflows: loadPromptAssets(userId, 'workflow'),
    pets: loadStateCollection(userId, 'pet'),
    healthLogs: loadStateCollection(userId, 'health_log'),
    careReminders: loadStateCollection(userId, 'care_reminder'),
    carePlans: loadStateCollection(userId, 'care_plan'),
    settings: loadSettings(userId),
    projects: db
      .prepare('SELECT value_json FROM project_metadata WHERE user_id = ? ORDER BY updated_at DESC')
      .all(userId)
      .map((row) => parseJson(row.value_json, null))
      .filter(Boolean),
  }
}

export async function saveUserState(userId, state) {
  ensureDb()
  const now = new Date().toISOString()
  const sessions = Array.isArray(state?.sessions) ? state.sessions : []
  const promptTemplates = Array.isArray(state?.promptTemplates) ? state.promptTemplates : []
  const customAgents = Array.isArray(state?.customAgents) ? state.customAgents : []
  const promptWorkflows = Array.isArray(state?.promptWorkflows) ? state.promptWorkflows : []
  const pets = Array.isArray(state?.pets) ? state.pets : []
  const healthLogs = Array.isArray(state?.healthLogs) ? state.healthLogs : []
  const careReminders = Array.isArray(state?.careReminders) ? state.careReminders : []
  const carePlans = Array.isArray(state?.carePlans) ? state.carePlans : []
  const projects = Array.isArray(state?.projects) ? state.projects : []
  const settings =
    state?.settings && typeof state.settings === 'object' && !Array.isArray(state.settings)
      ? state.settings
      : {}

  // SQLite 事务带重试，防止并发写入冲突
  const MAX_RETRIES = 3
  let transactionStarted = false
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      db.exec('BEGIN IMMEDIATE')
      transactionStarted = true
      break
    } catch (err) {
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)))
      } else {
        throw err
      }
    }
  }
  if (!transactionStarted) {
    throw new Error('Unable to begin transaction')
  }

  try {
    db.prepare('DELETE FROM chat_sessions WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM prompt_assets WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM project_metadata WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM pet_state_collections WHERE user_id = ?').run(userId)

    const insertSession = db.prepare(
      `INSERT INTO chat_sessions
       (user_id, id, title, tags_json, tags_infer_attempts, summary_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const insertMessage = db.prepare(
      `INSERT INTO chat_messages
       (user_id, session_id, id, position, role, content_json, attachments_json, tool_logs_json, plan_json, meta_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )

    for (const session of sessions) {
      if (!session?.id) continue
      insertSession.run(
        userId,
        String(session.id),
        String(session.title || '新的会话'),
        json(session.tags || []),
        Number(session.tagsInferAttempts || 0),
        session.summary ? json(session.summary) : null,
        String(session.createdAt || now),
        String(session.updatedAt || now),
      )
      const messages = Array.isArray(session.messages) ? session.messages : []
      messages.forEach((message, index) => {
        if (!message?.id) return
        insertMessage.run(
          userId,
          String(session.id),
          String(message.id),
          index,
          message.role === 'assistant' ? 'assistant' : 'user',
          safeJson(message.content ?? ''),
          message.attachments ? safeJson(message.attachments) : null,
          message.toolLogs ? safeJson(message.toolLogs) : null,
          message.plan ? safeJson(message.plan) : null,
          message.meta ? safeJson(message.meta) : null,
          String(message.createdAt || now),
        )
      })
    }

    savePromptAssets(userId, 'template', promptTemplates, now)
    savePromptAssets(userId, 'agent', customAgents, now)
    savePromptAssets(userId, 'workflow', promptWorkflows, now)
    saveStateCollection(userId, 'pet', pets, now)
    saveStateCollection(userId, 'health_log', healthLogs, now)
    saveStateCollection(userId, 'care_reminder', careReminders, now)
    saveStateCollection(userId, 'care_plan', carePlans, now)

    const insertSetting = db.prepare(
      'INSERT INTO user_settings (user_id, key, value_json, updated_at) VALUES (?, ?, ?, ?)',
    )
    for (const [key, value] of Object.entries(settings)) {
      insertSetting.run(userId, key, safeJson(value), now)
    }

    const insertProject = db.prepare(
      'INSERT INTO project_metadata (user_id, id, value_json, updated_at) VALUES (?, ?, ?, ?)',
    )
    for (const project of projects) {
      if (!project?.id) continue
      insertProject.run(userId, String(project.id), safeJson(project), String(project.updatedAt || now))
    }

    db.exec('COMMIT')
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // Preserve the original write error if the transaction is already closed.
    }
    console.error('[persistence] saveUserState error:', error)
    throw error
  }

  return { saved: true, updatedAt: now }
}

function safeJson(value) {
  try {
    return JSON.stringify(value)
  } catch (err) {
    console.error('[persistence] JSON stringify failed:', err)
    return JSON.stringify({ __serializationError: String(err.message || err) })
  }
}

function loadPromptAssets(userId, type) {
  return db
    .prepare(
      `SELECT value_json
       FROM prompt_assets
       WHERE user_id = ? AND type = ?
       ORDER BY updated_at DESC`,
    )
    .all(userId, type)
    .map((row) => parseJson(row.value_json, null))
    .filter(Boolean)
}

function savePromptAssets(userId, type, assets, now) {
  const insert = db.prepare(
    'INSERT INTO prompt_assets (user_id, type, id, value_json, updated_at) VALUES (?, ?, ?, ?, ?)',
  )
  for (const asset of assets) {
    if (!asset?.id) continue
    insert.run(userId, type, String(asset.id), json(asset), String(asset.updatedAt || now))
  }
}

function loadStateCollection(userId, type) {
  return db
    .prepare(
      `SELECT value_json
       FROM pet_state_collections
       WHERE user_id = ? AND type = ?
       ORDER BY updated_at DESC`,
    )
    .all(userId, type)
    .map((row) => parseJson(row.value_json, null))
    .filter(Boolean)
}

function saveStateCollection(userId, type, items, now) {
  const insert = db.prepare(
    'INSERT INTO pet_state_collections (user_id, type, id, value_json, updated_at) VALUES (?, ?, ?, ?, ?)',
  )
  for (const item of items) {
    if (!item?.id) continue
    insert.run(userId, type, String(item.id), safeJson(item), String(item.updatedAt || item.createdAt || now))
  }
}

function loadSettings(userId) {
  return Object.fromEntries(
    db
      .prepare('SELECT key, value_json FROM user_settings WHERE user_id = ?')
      .all(userId)
      .map((row) => [row.key, parseJson(row.value_json, null)]),
  )
}

function countUserRows(userId) {
  return Number(
    db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM prompt_assets WHERE user_id = ?) +
          (SELECT COUNT(*) FROM user_settings WHERE user_id = ?) +
          (SELECT COUNT(*) FROM project_metadata WHERE user_id = ?) +
          (SELECT COUNT(*) FROM pet_state_collections WHERE user_id = ?) AS total`,
      )
      .get(userId, userId, userId, userId).total || 0,
  )
}

function ensureDb() {
  if (!db) throw new Error('Persistence has not been initialized')
}

function json(value) {
  return JSON.stringify(value)
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(String(value))
  } catch {
    return fallback
  }
}
