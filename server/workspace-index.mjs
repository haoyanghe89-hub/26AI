import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import path from 'node:path'

const PROJECT_ROOT = process.cwd()
const DATA_DIR = path.join(PROJECT_ROOT, 'data')
const INDEX_PATH = path.join(DATA_DIR, 'workspace-index.json')
const PROJECTS_DIR = path.join(DATA_DIR, 'projects')
const PROJECTS_META_PATH = path.join(PROJECTS_DIR, 'projects.json')

const IGNORED_DIRS = new Set(['.git', '.idea', '.vscode', 'coverage', 'data', 'dist', 'node_modules'])
const TEXT_DOTFILES = new Set([
  '.browserslistrc',
  '.editorconfig',
  '.env',
  '.env.development',
  '.env.local',
  '.env.online',
  '.env.preview',
  '.env.production',
  '.env.test',
  '.eslintrc',
  '.gitignore',
  '.npmrc',
  '.prettierrc',
])

const TEXT_EXTENSIONS = new Set([
  '.c',
  '.cpp',
  '.css',
  '.csv',
  '.go',
  '.html',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.py',
  '.rs',
  '.scss',
  '.sh',
  '.sql',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
  '.xml',
  '.yaml',
  '.yml',
])

const MAX_FILE_BYTES = 256 * 1024
const MAX_FILES = 5000
const CHUNK_CHARS = 3200
const CHUNK_OVERLAP = 420

let cachedIndex
let cachedProjects

export async function listProjects() {
  return dedupeImportedProjects(await loadProjects())
}

export async function importProject(payload) {
  const rawFiles = Array.isArray(payload?.files) ? payload.files : []
  const name = sanitizeProjectName(payload?.name || inferProjectName(rawFiles) || 'imported-project')
  const originalRoot = String(payload?.originalRoot || '').trim() || undefined
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const importedAt = new Date().toISOString()
  const projectDir = path.join(PROJECTS_DIR, id)
  const filesDir = path.join(projectDir, 'files')
  const commonRoot = inferProjectName(rawFiles)
  const acceptedFiles = rawFiles
    .filter((file) => isSafeRelativePath(file?.path))
    .filter((file) => isIndexableFile(file.path))
    .filter((file) => Number(file.size || 0) <= MAX_FILE_BYTES)
    .slice(0, MAX_FILES)
    .map((file) => ({
      relativePath: stripCommonRoot(normalizeRelativePath(file.path), commonRoot),
      text: String(file.text || ''),
    }))

  const fingerprintableFiles = acceptedFiles.filter((file) => file.text.trim())
  const fingerprint = createProjectFingerprint(name, fingerprintableFiles)
  const pathFingerprint = createProjectPathFingerprint(name, acceptedFiles)
  const duplicateMatch = await findExistingImportedProject(fingerprint, pathFingerprint)
  if (duplicateMatch) {
    const projects = await loadProjects()
    const duplicateIds = new Set([duplicateMatch.project.id, ...duplicateMatch.duplicateIds])
    cachedProjects = [duplicateMatch.project, ...projects.filter((project) => !duplicateIds.has(project.id))]
    await saveProjects(cachedProjects)
    return duplicateMatch.project
  }

  await fs.mkdir(filesDir, { recursive: true })

  const chunks = []
  for (const file of acceptedFiles) {
    const destination = path.join(filesDir, file.relativePath)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.writeFile(destination, file.text)
    if (file.text.trim()) chunks.push(...chunkText(file.relativePath, file.text))
  }

  const index = {
    version: 1,
    id,
    name,
    root: name,
    originalRoot,
    importedAt,
    updatedAt: importedAt,
    fileCount: acceptedFiles.length,
    fingerprint,
    pathFingerprint,
    chunks,
  }
  await fs.writeFile(path.join(projectDir, 'index.json'), JSON.stringify(index, null, 2))

  const projects = await loadProjects()
  const summary = projectSummary(index)
  projects.unshift(summary)
  cachedProjects = projects
  await saveProjects(projects)

  return summary
}

export async function importProjectFromLocalRoot(rootPath) {
  const originalRoot = path.resolve(String(rootPath || '').trim())
  const stat = await fs.stat(originalRoot).catch(() => null)
  if (!stat?.isDirectory()) return null

  const files = await collectFiles(originalRoot)
  const rawFiles = []
  for (const filePath of files) {
    const text = await fs.readFile(filePath, 'utf8').catch(() => '')
    rawFiles.push({
      path: path.relative(originalRoot, filePath).replace(/\\/g, '/'),
      text,
      size: Buffer.byteLength(text, 'utf8'),
    })
  }

  return importProject({
    name: path.basename(originalRoot) || 'imported-project',
    files: rawFiles,
    originalRoot,
  })
}

export async function getProjectStatus(projectId) {
  const index = await loadProjectIndex(projectId)
  if (!index) return null
  return projectSummary(index)
}

export async function searchProject(projectId, query, limit = 8) {
  const index = await loadProjectIndex(projectId)
  return searchIndex(index, query, limit)
}

export async function analyzeProject(projectId) {
  const index = await loadProjectIndex(projectId)
  if (!index) return null

  const paths = index.chunks.map((chunk) => chunk.path)
  const packageJson = await readProjectFile(projectId, 'package.json')
  const tsconfig = await readProjectFile(projectId, 'tsconfig.json')
  const viteConfig = paths.find((item) => /^vite\.config\.(js|mjs|ts)$/.test(item))
  const srcFiles = paths.filter((item) => item.startsWith('src/'))
  const testFiles = paths.filter(
    (item) => /(\.|\/)(test|spec)\.[jt]sx?$/.test(item) || item.includes('__tests__/'),
  )
  const frameworks = detectFrameworks(paths, packageJson)
  const packageInfo = parseJson(packageJson)
  const scripts = packageInfo?.scripts ? Object.keys(packageInfo.scripts) : []
  const dependencies = {
    ...packageInfo?.dependencies,
    ...packageInfo?.devDependencies,
  }
  const notableDeps = Object.keys(dependencies || {}).slice(0, 24)

  return [
    `# ${index.name} 项目框架分析`,
    '',
    `- 文件数：${index.fileCount}`,
    `- 可检索片段：${index.chunks.length}`,
    `- 主要框架：${frameworks.length ? frameworks.join('、') : '暂未识别'}`,
    `- 源码目录：${srcFiles.length ? '存在 src/' : '未发现 src/'}`,
    `- 测试文件：${testFiles.length}`,
    viteConfig ? `- Vite 配置：${viteConfig}` : '',
    tsconfig ? '- TypeScript 配置：存在 tsconfig.json' : '',
    scripts.length ? `- package scripts：${scripts.join(', ')}` : '',
    notableDeps.length ? `- 主要依赖：${notableDeps.join(', ')}` : '',
    '',
    '## 建议下一步',
    '- 先让 Agent 读取入口文件、路由、状态管理和构建配置，形成模块地图。',
    '- 再按功能目标检索相关文件，生成修改计划。',
    '- 修改时先产出 diff，再执行测试或构建验证。',
  ]
    .filter(Boolean)
    .join('\n')
}

export async function getProjectTree(projectId) {
  const projectRoot = await getProjectFilesRoot(projectId)
  if (!projectRoot) return null

  const root = {
    name: 'root',
    path: '',
    isDirectory: true,
    children: [],
  }

  async function walk(dir, node) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    for (const entry of sorted) {
      const fullPath = path.join(dir, entry.name)
      const relativePath = path.relative(projectRoot, fullPath).replace(/\\/g, '/')
      if (!isSafeRelativePath(relativePath)) continue

      const child = {
        name: entry.name,
        path: relativePath,
        isDirectory: entry.isDirectory(),
      }

      if (entry.isDirectory()) {
        child.children = []
        await walk(fullPath, child)
        if (!child.children.length) delete child.children
      }

      node.children.push(child)
    }
  }

  await walk(projectRoot, root)
  return root.children
}

export { getProjectFilePath, getProjectFilesRoot, getProjectOriginalRoot, readProjectFile }

export async function previewProjectFileWrite(projectId, relativePath, content) {
  const previous = await readProjectFile(projectId, relativePath)
  if (previous === null) return null

  return {
    path: normalizeRelativePath(relativePath),
    changed: previous !== content,
    diff: createUnifiedDiff(normalizeRelativePath(relativePath), previous, content),
  }
}

export async function writeProjectFile(projectId, relativePath, content) {
  const filesRoot = await getProjectFilesRoot(projectId)
  if (!filesRoot || !isSafeRelativePath(relativePath)) return null

  const safePath = normalizeRelativePath(relativePath)
  const destination = path.resolve(filesRoot, safePath)
  if (!destination.startsWith(`${filesRoot}${path.sep}`) && destination !== filesRoot) return null

  const previous = await fs.readFile(destination, 'utf8').catch(() => null)
  if (previous === null) return null

  await fs.writeFile(destination, String(content || ''))
  const summary = await rebuildProjectIndex(projectId)

  return {
    ...summary,
    path: safePath,
    changed: previous !== content,
    diff: createUnifiedDiff(safePath, previous, String(content || '')),
  }
}

export async function deleteProject(projectId) {
  const id = String(projectId || '')
  if (!/^[a-z0-9-]+$/i.test(id)) return false

  await fs.rm(path.join(PROJECTS_DIR, id), { recursive: true, force: true })
  const projects = (await loadProjects()).filter((project) => project.id !== id)
  cachedProjects = projects
  await saveProjects(projects)
  return true
}

export async function getWorkspaceStatus() {
  const index = await loadIndex()
  if (!index) {
    return {
      indexed: false,
      root: PROJECT_ROOT,
      fileCount: 0,
      chunkCount: 0,
      updatedAt: null,
    }
  }

  return {
    indexed: true,
    root: index.root,
    fileCount: index.fileCount,
    chunkCount: index.chunks.length,
    updatedAt: index.updatedAt,
  }
}

export async function indexWorkspace() {
  const files = await collectFiles(PROJECT_ROOT)
  const chunks = []

  for (const filePath of files) {
    const text = await fs.readFile(filePath, 'utf8').catch(() => '')
    if (!text.trim()) continue

    chunks.push(...chunkFile(filePath, text))
  }

  const index = {
    version: 1,
    root: PROJECT_ROOT,
    updatedAt: new Date().toISOString(),
    fileCount: files.length,
    chunks,
  }

  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.writeFile(INDEX_PATH, JSON.stringify(index, null, 2))
  cachedIndex = index

  return {
    indexed: true,
    root: index.root,
    fileCount: index.fileCount,
    chunkCount: index.chunks.length,
    updatedAt: index.updatedAt,
  }
}

export async function searchWorkspace(query, limit = 8) {
  const index = await loadIndex()
  return searchIndex(index, query, limit)
}

export function buildWorkspaceContext(hits) {
  if (!hits.length) return ''

  const blocks = []
  let size = 0

  for (const hit of hits) {
    const block = [
      `文件: ${hit.path}:${hit.startLine}-${hit.endLine}`,
      hit.language ? `语言: ${hit.language}` : '',
      '内容:',
      hit.text.trim(),
    ]
      .filter(Boolean)
      .join('\n')

    if (size + block.length > 14000) break
    blocks.push(block)
    size += block.length
  }

  return blocks.join('\n\n---\n\n')
}

async function loadIndex() {
  if (cachedIndex) return cachedIndex

  const raw = await fs.readFile(INDEX_PATH, 'utf8').catch(() => '')
  if (!raw) return null

  try {
    cachedIndex = JSON.parse(raw)
    return cachedIndex
  } catch {
    return null
  }
}

async function loadProjects() {
  if (cachedProjects) return cachedProjects

  const raw = await fs.readFile(PROJECTS_META_PATH, 'utf8').catch(() => '')
  if (!raw) {
    cachedProjects = []
    return cachedProjects
  }

  try {
    const parsed = JSON.parse(raw)
    cachedProjects = Array.isArray(parsed) ? parsed : []
    return cachedProjects
  } catch {
    cachedProjects = []
    return cachedProjects
  }
}

async function saveProjects(projects) {
  await fs.mkdir(PROJECTS_DIR, { recursive: true })
  await fs.writeFile(PROJECTS_META_PATH, JSON.stringify(projects, null, 2))
}

async function loadProjectIndex(projectId) {
  const id = String(projectId || '')
  if (!/^[a-z0-9-]+$/i.test(id)) return null

  const raw = await fs.readFile(path.join(PROJECTS_DIR, id, 'index.json'), 'utf8').catch(() => '')
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function readProjectFile(projectId, relativePath) {
  const filePath = await getProjectFilePath(projectId, relativePath)
  if (!filePath) return null
  return fs.readFile(filePath, 'utf8').catch(() => null)
}

async function getProjectFilePath(projectId, relativePath) {
  const filesRoot = await getProjectFilesRoot(projectId)
  if (!filesRoot || !isSafeRelativePath(relativePath)) return null

  const safePath = normalizeRelativePath(relativePath)
  const filePath = path.resolve(filesRoot, safePath)
  if (!filePath.startsWith(`${filesRoot}${path.sep}`) && filePath !== filesRoot) return null
  const stat = await fs.stat(filePath).catch(() => null)
  return stat?.isFile() ? filePath : null
}

async function getProjectFilesRoot(projectId) {
  const id = String(projectId || '')
  if (!/^[a-z0-9-]+$/i.test(id)) return null

  const filesRoot = path.resolve(PROJECTS_DIR, id, 'files')
  const stat = await fs.stat(filesRoot).catch(() => null)
  return stat?.isDirectory() ? filesRoot : null
}

async function getProjectOriginalRoot(projectId) {
  const id = String(projectId || '')
  if (!/^[a-z0-9-]+$/i.test(id)) return null

  const indexPath = path.resolve(PROJECTS_DIR, id, 'index.json')
  const raw = await fs.readFile(indexPath, 'utf8').catch(() => null)
  if (!raw) return null

  try {
    const index = JSON.parse(raw)
    const root = String(index?.originalRoot || '').trim()
    if (!root) return null
    const stat = await fs.stat(root).catch(() => null)
    return stat?.isDirectory() ? root : null
  } catch {
    return null
  }
}

async function rebuildProjectIndex(projectId) {
  const index = await loadProjectIndex(projectId)
  const filesRoot = await getProjectFilesRoot(projectId)
  if (!index || !filesRoot) return null

  const files = await collectFiles(filesRoot)
  const chunks = []
  for (const filePath of files) {
    const text = await fs.readFile(filePath, 'utf8').catch(() => '')
    if (!text.trim()) continue

    chunks.push(...chunkText(path.relative(filesRoot, filePath).replace(/\\/g, '/'), text))
  }

  const updated = {
    ...index,
    updatedAt: new Date().toISOString(),
    fileCount: files.length,
    chunks,
  }

  await fs.writeFile(path.join(PROJECTS_DIR, projectId, 'index.json'), JSON.stringify(updated, null, 2))
  const projects = (await loadProjects()).map((project) =>
    project.id === projectId ? projectSummary(updated) : project,
  )
  cachedProjects = projects
  await saveProjects(projects)
  return projectSummary(updated)
}

function searchIndex(index, query, limit = 8) {
  if (!index || !String(query || '').trim()) return []

  const queryText = String(query)
  const queryTokens = tokenize(queryText)
  if (!queryTokens.length) return []

  return index.chunks
    .map((chunk) => ({
      chunk,
      score: scoreChunk(chunk, queryText, queryTokens),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ chunk, score }) => ({
      path: chunk.path,
      language: chunk.language,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      score,
      text: chunk.text,
    }))
}

async function collectFiles(root) {
  const files = []

  async function walk(dir) {
    if (files.length >= MAX_FILES) return

    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (files.length >= MAX_FILES) return
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) await walk(fullPath)
        continue
      }

      if (!entry.isFile()) continue
      if (!isIndexableFile(fullPath)) continue

      const stat = await fs.stat(fullPath).catch(() => null)
      if (!stat || stat.size > MAX_FILE_BYTES) continue
      files.push(fullPath)
    }
  }

  await walk(root)
  return files
}

function isIndexableFile(filePath) {
  const basename = path.basename(filePath)
  if (basename === 'package-lock.json') return false
  if (TEXT_DOTFILES.has(basename.toLowerCase()) || basename.toLowerCase().startsWith('.env.')) return true
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

function chunkFile(filePath, text) {
  const relativePath = path.relative(PROJECT_ROOT, filePath)
  return chunkText(relativePath, text)
}

function chunkText(relativePath, text) {
  const language = path.extname(relativePath).replace(/^\./, '')
  const lineStarts = getLineStarts(text)
  const chunks = []

  for (let start = 0; start < text.length; start += CHUNK_CHARS - CHUNK_OVERLAP) {
    const end = Math.min(start + CHUNK_CHARS, text.length)
    const chunkText = text.slice(start, end)
    const startLine = offsetToLine(lineStarts, start)
    const endLine = offsetToLine(lineStarts, end)

    chunks.push({
      id: `${relativePath}:${startLine}-${endLine}`,
      path: relativePath,
      language,
      startLine,
      endLine,
      text: chunkText,
    })

    if (end === text.length) break
  }

  return chunks
}

function scoreChunk(chunk, queryText, queryTokens) {
  const pathText = chunk.path.toLowerCase()
  const bodyText = chunk.text.toLowerCase()
  let score = 0

  if (pathText.includes(queryText.toLowerCase())) score += 12

  for (const token of queryTokens) {
    if (pathText.includes(token)) score += 8
    score += countOccurrences(bodyText, token)
  }

  return score
}

function tokenize(value) {
  const normalized = String(value).toLowerCase()
  const tokens = normalized.match(/[\p{L}\p{N}_-]{2,}/gu) || []
  return [...new Set(tokens)].slice(0, 32)
}

function countOccurrences(value, token) {
  let count = 0
  let index = value.indexOf(token)

  while (index !== -1 && count < 20) {
    count += 1
    index = value.indexOf(token, index + token.length)
  }

  return count
}

function getLineStarts(text) {
  const starts = [0]
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') starts.push(index + 1)
  }
  return starts
}

function offsetToLine(lineStarts, offset) {
  let low = 0
  let high = lineStarts.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (lineStarts[mid] <= offset) low = mid + 1
    else high = mid - 1
  }

  return Math.max(1, high + 1)
}

function inferProjectName(files) {
  const firstPath = files.find((file) => file?.path)?.path || ''
  return normalizeRelativePath(firstPath).split('/')[0] || ''
}

function stripCommonRoot(relativePath, commonRoot) {
  const normalizedRoot = normalizeRelativePath(commonRoot)
  if (!normalizedRoot) return relativePath
  return relativePath.startsWith(`${normalizedRoot}/`)
    ? relativePath.slice(normalizedRoot.length + 1)
    : relativePath
}

function sanitizeProjectName(value) {
  const clean = String(value || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  return clean.slice(0, 80) || 'imported-project'
}

function normalizeRelativePath(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
}

function isSafeRelativePath(value) {
  const normalized = normalizeRelativePath(value)
  if (!normalized || normalized.includes('\0')) return false
  if (path.isAbsolute(normalized)) return false
  return !normalized.split('/').some((part) => part === '..')
}

async function findExistingImportedProject(fingerprint, pathFingerprint) {
  if (!fingerprint && !pathFingerprint) return null

  const projects = await dedupeImportedProjects(await loadProjects())
  let projectMatch = null
  const duplicateIds = []

  for (const project of projects) {
    const index = await loadProjectIndex(project.id)
    if (!index) continue

    const existingFingerprint = index.fingerprint || (await createStoredProjectFingerprint(index))
    const existingPathFingerprint = index.pathFingerprint || (await createStoredProjectPathFingerprint(index))
    if (existingFingerprint !== fingerprint && existingPathFingerprint !== pathFingerprint) continue

    const summary = projectSummary({
      ...index,
      fingerprint: existingFingerprint,
      pathFingerprint: existingPathFingerprint,
    })

    if (!projectMatch) projectMatch = summary
    else duplicateIds.push(summary.id)
  }

  return projectMatch ? { project: projectMatch, duplicateIds } : null
}

async function dedupeImportedProjects(projects) {
  const seenFingerprints = new Set()
  const seenPathFingerprints = new Set()
  const dedupedProjects = []
  let changed = false

  for (const project of projects) {
    const index = await loadProjectIndex(project.id)
    if (!index) {
      dedupedProjects.push(project)
      continue
    }

    const fingerprint = index.fingerprint || (await createStoredProjectFingerprint(index))
    const pathFingerprint = index.pathFingerprint || (await createStoredProjectPathFingerprint(index))
    if (
      (fingerprint && seenFingerprints.has(fingerprint)) ||
      (pathFingerprint && seenPathFingerprints.has(pathFingerprint))
    ) {
      changed = true
      continue
    }

    if (fingerprint) seenFingerprints.add(fingerprint)
    if (pathFingerprint) seenPathFingerprints.add(pathFingerprint)
    const summary = projectSummary({
      ...index,
      fingerprint,
      pathFingerprint,
    })
    dedupedProjects.push(summary)

    if (summary.updatedAt !== project.updatedAt || summary.fileCount !== project.fileCount) changed = true
  }

  if (changed || dedupedProjects.length !== projects.length) {
    cachedProjects = dedupedProjects
    await saveProjects(dedupedProjects)
  }

  return dedupedProjects
}

async function createStoredProjectPathFingerprint(index) {
  const filesRoot = await getProjectFilesRoot(index.id)
  if (!filesRoot) return ''

  const files = await collectFiles(filesRoot)
  const projectFiles = files.map((filePath) => ({
    relativePath: path.relative(filesRoot, filePath).replace(/\\/g, '/'),
  }))

  const pathFingerprint = createProjectPathFingerprint(index.root || index.name, projectFiles)
  if (pathFingerprint) {
    const currentIndex = (await loadProjectIndex(index.id)) || index
    const updated = { ...currentIndex, pathFingerprint }
    await fs.writeFile(path.join(PROJECTS_DIR, index.id, 'index.json'), JSON.stringify(updated, null, 2))
  }
  return pathFingerprint
}

async function createStoredProjectFingerprint(index) {
  const filesRoot = await getProjectFilesRoot(index.id)
  if (!filesRoot) return ''

  const files = await collectFiles(filesRoot)
  const projectFiles = []
  for (const filePath of files) {
    const text = await fs.readFile(filePath, 'utf8').catch(() => '')
    if (!text.trim()) continue
    projectFiles.push({
      relativePath: path.relative(filesRoot, filePath).replace(/\\/g, '/'),
      text,
    })
  }

  const fingerprint = createProjectFingerprint(index.root || index.name, projectFiles)
  if (fingerprint) {
    const currentIndex = (await loadProjectIndex(index.id)) || index
    const updated = { ...currentIndex, fingerprint }
    await fs.writeFile(path.join(PROJECTS_DIR, index.id, 'index.json'), JSON.stringify(updated, null, 2))
  }
  return fingerprint
}

function createProjectFingerprint(name, files) {
  if (!Array.isArray(files) || !files.length) return ''

  const hash = crypto.createHash('sha256')
  hash.update(`root:${sanitizeProjectName(name)}\n`)

  for (const file of [...files].sort((a, b) => a.relativePath.localeCompare(b.relativePath))) {
    hash.update(`path:${normalizeRelativePath(file.relativePath)}\n`)
    hash.update(`size:${Buffer.byteLength(file.text, 'utf8')}\n`)
    hash.update(file.text)
    hash.update('\n')
  }

  return hash.digest('hex')
}

function createProjectPathFingerprint(name, files) {
  if (!Array.isArray(files) || !files.length) return ''

  const hash = crypto.createHash('sha256')
  hash.update(`root:${sanitizeProjectName(name)}\n`)

  for (const file of [...files].sort((a, b) => a.relativePath.localeCompare(b.relativePath))) {
    hash.update(`path:${normalizeRelativePath(file.relativePath)}\n`)
  }

  return hash.digest('hex')
}

function projectSummary(index) {
  return {
    id: index.id,
    name: index.name,
    root: index.root,
    originalRoot: index.originalRoot || undefined,
    importedAt: index.importedAt,
    updatedAt: index.updatedAt,
    fileCount: index.fileCount,
    chunkCount: index.chunks.length,
  }
}

export async function setProjectOriginalRoot(projectId, originalRoot) {
  const id = String(projectId || '')
  if (!/^[a-z0-9-]+$/i.test(id)) return false

  const indexPath = path.resolve(PROJECTS_DIR, id, 'index.json')
  const raw = await fs.readFile(indexPath, 'utf8').catch(() => null)
  if (!raw) return false

  try {
    const index = JSON.parse(raw)
    const root = String(originalRoot || '').trim()
    if (root) {
      const stat = await fs.stat(root).catch(() => null)
      if (!stat?.isDirectory()) return false
      index.originalRoot = root
    } else {
      delete index.originalRoot
    }
    index.updatedAt = new Date().toISOString()
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2))

    // 刷新 projects.json 缓存
    const projects = (await loadProjects()).map((project) =>
      project.id === id ? projectSummary(index) : project,
    )
    cachedProjects = projects
    await saveProjects(projects)
    return true
  } catch {
    return false
  }
}

function parseJson(value) {
  try {
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}

function detectFrameworks(paths, packageJson) {
  const packageInfo = parseJson(packageJson)
  const dependencies = {
    ...packageInfo?.dependencies,
    ...packageInfo?.devDependencies,
  }
  const names = new Set()

  if (dependencies.vue || paths.some((item) => item.endsWith('.vue'))) names.add('Vue')
  if (dependencies.react || paths.some((item) => item.endsWith('.jsx') || item.endsWith('.tsx')))
    names.add('React')
  if (dependencies.next) names.add('Next.js')
  if (dependencies.nuxt) names.add('Nuxt')
  if (dependencies.vite || paths.some((item) => /^vite\.config\./.test(item))) names.add('Vite')
  if (dependencies.typescript || paths.includes('tsconfig.json')) names.add('TypeScript')
  if (dependencies.pinia) names.add('Pinia')
  if (dependencies.vuex) names.add('Vuex')
  if (dependencies.express) names.add('Express')
  if (dependencies.fastify) names.add('Fastify')

  return [...names]
}

function createUnifiedDiff(relativePath, previous, next) {
  const before = String(previous || '').split('\n')
  const after = String(next || '').split('\n')
  const lines = [`--- a/${relativePath}`, `+++ b/${relativePath}`, '@@']
  const max = Math.max(before.length, after.length)

  for (let index = 0; index < max; index += 1) {
    const oldLine = before[index]
    const newLine = after[index]

    if (oldLine === newLine) {
      lines.push(` ${oldLine ?? ''}`)
      continue
    }

    if (oldLine !== undefined) lines.push(`-${oldLine}`)
    if (newLine !== undefined) lines.push(`+${newLine}`)
  }

  return lines.join('\n')
}
