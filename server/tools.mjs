import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

/**
 * MCP 风格工具注册表
 * 每个工具包含 OpenAI-compatible function schema + 执行函数
 */

const ALLOWED_SHELL_COMMANDS = new Set([
  'ls',
  'cat',
  'head',
  'tail',
  'grep',
  'find',
  'wc',
  'diff',
  'npm',
  'node',
  'npx',
  'pnpm',
  'yarn',
  'vitest',
  'eslint',
  'prettier',
  'git',
  'tsc',
  'vite',
  'python3',
  'python',
  'pip',
])

const DISALLOWED_PATTERNS = [
  /rm\s+-rf\s*\//,
  />\s*\/etc\/\w+/,
  /curl\s+.*\|\s*sh/,
  /wget\s+.*\|\s*sh/,
  /eval\s*\(/,
  /\$\(.*curl/,
]

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取指定文件的内容。用于查看代码、配置文件、文档等。',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: '要读取的文件相对路径（相对于项目根目录）',
          },
        },
        required: ['file_path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '写入或覆盖指定文件的内容。用于创建新文件或修改现有文件。',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: '要写入的文件相对路径（相对于项目根目录）',
          },
          content: {
            type: 'string',
            description: '要写入的完整文件内容',
          },
        },
        required: ['file_path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: '列出指定目录下的文件和子目录。用于了解项目结构。',
      parameters: {
        type: 'object',
        properties: {
          dir_path: {
            type: 'string',
            description: '要列出的目录相对路径，不传则列出项目根目录',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_code',
      description: '在项目代码中搜索匹配文本。支持按文件名、内容关键词搜索。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词',
          },
          file_pattern: {
            type: 'string',
            description: '可选的文件名匹配模式，如 *.vue、*.ts',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: '在项目根目录下执行一条安全的 shell 命令。支持 npm、node、git、grep 等常见命令。',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: '要执行的命令（如 "npm run build"、"git status"）',
          },
        },
        required: ['command'],
      },
    },
  },
]

/**
 * 执行单个工具调用
 * @param {string} name - 工具名
 * @param {object} args - 工具参数
 * @param {object} context - 执行上下文 { projectRoot }
 */
export async function executeTool(name, args, context) {
  try {
    switch (name) {
      case 'read_file':
        return await toolReadFile(args, context)
      case 'write_file':
        return await toolWriteFile(args, context)
      case 'list_directory':
        return await toolListDirectory(args, context)
      case 'search_code':
        return await toolSearchCode(args, context)
      case 'run_command':
        return await toolRunCommand(args, context)
      default:
        return { error: `未知工具: ${name}` }
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

async function toolReadFile(args, context) {
  const filePath = String(args.file_path || '').trim()
  if (!filePath) return { error: 'file_path 不能为空' }

  const absolutePath = resolveProjectPath(context.projectRoot, filePath)
  if (!absolutePath) return { error: '文件路径不在项目范围内' }

  try {
    const content = await fs.readFile(absolutePath, 'utf8')
    const maxLength = 10000
    const truncated =
      content.length > maxLength
        ? content.slice(0, maxLength) + '\n\n[文件过长，已截断。总大小: ' + content.length + ' 字节]'
        : content
    return { content: truncated, file_path: filePath, truncated: content.length > maxLength }
  } catch (error) {
    if (error?.code === 'ENOENT') return { error: `文件不存在: ${filePath}` }
    if (error?.code === 'EISDIR') return { error: `路径是目录而非文件: ${filePath}` }
    return { error: `读取失败: ${error instanceof Error ? error.message : String(error)}` }
  }
}

async function toolWriteFile(args, context) {
  const filePath = String(args.file_path || '').trim()
  const content = String(args.content || '')
  if (!filePath) return { error: 'file_path 不能为空' }

  const absolutePath = resolveProjectPath(context.projectRoot, filePath)
  if (!absolutePath) return { error: '文件路径不在项目范围内' }

  try {
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, content, 'utf8')
    return { success: true, file_path: filePath, bytes_written: Buffer.byteLength(content, 'utf8') }
  } catch (error) {
    return { error: `写入失败: ${error instanceof Error ? error.message : String(error)}` }
  }
}

async function toolListDirectory(args, context) {
  const dirPath = String(args.dir_path || '.').trim()
  const absolutePath = resolveProjectPath(context.projectRoot, dirPath)
  if (!absolutePath) return { error: '目录路径不在项目范围内' }

  try {
    const entries = await fs.readdir(absolutePath, { withFileTypes: true })
    const items = entries
      .filter((entry) => !entry.name.startsWith('.') && entry.name !== 'node_modules')
      .map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
      }))
      .sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name)
        return a.type === 'directory' ? -1 : 1
      })
    return { items, dir_path: dirPath, count: items.length }
  } catch (error) {
    if (error?.code === 'ENOENT') return { error: `目录不存在: ${dirPath}` }
    return { error: `列出失败: ${error instanceof Error ? error.message : String(error)}` }
  }
}

async function toolSearchCode(args, context) {
  const query = String(args.query || '').trim()
  const filePattern = String(args.file_pattern || '').trim()
  if (!query) return { error: 'query 不能为空' }

  try {
    const { execSync } = await import('node:child_process')
    const grepPattern = filePattern
      ? `grep -ri --include="${filePattern}" -n "${escapeShellArg(query)}" "${context.projectRoot}" 2>/dev/null | head -30`
      : `grep -ri --include="*.js" --include="*.ts" --include="*.vue" --include="*.jsx" --include="*.tsx" --include="*.json" --include="*.md" --include="*.py" --include="*.go" --include="*.java" -n "${escapeShellArg(query)}" "${context.projectRoot}" 2>/dev/null | head -30`

    const output = execSync(grepPattern, { encoding: 'utf8', timeout: 5000 })
    const lines = output.trim().split('\n').filter(Boolean)

    if (!lines.length) return { results: [], query, message: '未找到匹配结果' }

    const results = lines.map((line) => {
      const match = line.match(/^(.+?):(\d+):(.+)$/)
      if (!match) return { path: line, line: 0, content: '' }
      const relativePath = path.relative(context.projectRoot, match[1])
      return { path: relativePath, line: Number(match[2]), content: match[3].trim() }
    })

    return { results, query, count: results.length }
  } catch {
    return { results: [], query, message: '搜索未返回结果' }
  }
}

async function toolRunCommand(args, context) {
  const command = String(args.command || '').trim()
  if (!command) return { error: 'command 不能为空' }

  // 安全检查 1：命令白名单
  const cmdName = command.split(/\s+/)[0]
  if (!ALLOWED_SHELL_COMMANDS.has(cmdName)) {
    return {
      error: `命令 "${cmdName}" 不在允许列表中。允许: ${Array.from(ALLOWED_SHELL_COMMANDS).join(', ')}`,
    }
  }

  // 安全检查 2：危险模式
  for (const pattern of DISALLOWED_PATTERNS) {
    if (pattern.test(command)) {
      return { error: '检测到潜在危险命令，已拒绝执行。' }
    }
  }

  // 安全检查 3：禁止删除根目录、系统目录
  if (/rm\s+-rf\s+\//.test(command)) {
    return { error: '禁止删除根目录。' }
  }

  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', command], {
      cwd: context.projectRoot,
      env: { ...process.env, PATH: process.env.PATH },
      timeout: 30000,
      killSignal: 'SIGTERM',
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => {
      stdout += data
      if (stdout.length > 20000) {
        stdout = stdout.slice(0, 20000) + '\n[输出过长，已截断]'
        child.kill('SIGTERM')
      }
    })

    child.stderr.on('data', (data) => {
      stderr += data
      if (stderr.length > 10000) {
        stderr = stderr.slice(0, 10000) + '\n[错误输出过长，已截断]'
      }
    })

    child.on('close', (code) => {
      resolve({
        command,
        exit_code: code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      })
    })

    child.on('error', (error) => {
      resolve({ error: `执行失败: ${error.message}` })
    })
  })
}

function resolveProjectPath(projectRoot, relativePath) {
  if (!projectRoot) return null
  const resolved = path.resolve(projectRoot, relativePath)
  if (!resolved.startsWith(path.resolve(projectRoot))) return null
  return resolved
}

function escapeShellArg(arg) {
  return arg.replace(/["\\$`]/g, '\\$&')
}
