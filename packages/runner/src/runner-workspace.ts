import { Buffer } from 'node:buffer'

/**
 * 单个 Runner 工作区快照允许的普通文件数量。
 * @example 模块内部上下文
 * ```ts
 * const tooMany = ['src/main.ts'].length > maxWorkspaceFiles
 * ```
 */
export const maxWorkspaceFiles = 512
/**
 * 单个 Runner 工作区快照允许的最大字节数。
 * @example 模块内部上下文
 * ```ts
 * const budget = Math.min(maxWorkspaceBytes, 2 * 1024 * 1024)
 * ```
 */
export const maxWorkspaceBytes = 50 * 1024 * 1024

/**
 * 工作区使用相对 POSIX 普通文件路径；Git 元数据不经过容器此入口。
 * @example 模块内部上下文
 * ```ts
 * const allowed = workspacePath('src/main.ts')
 * ```
 */
export function workspacePath(path: string): boolean {
  return path.length > 0 && path.length <= 512 && !/[\p{Cc}\\]/u.test(path)
    && path.split('/').every(part => part.length > 0 && part.length <= 128
      && part !== '.' && part !== '..' && part.toLowerCase() !== '.git')
}

/**
 * 解码后再检查总量；返回的目录树只包含传入的普通文件。
 * @example 模块内部上下文
 * ```ts
 * const files = decodeWorkspace({ 'src/main.txt': 'aGk=' }, 1024)
 * ```
 */
export function decodeWorkspace(files: Readonly<Record<string, string>>, budget: number) {
  const entries = Object.entries(files)
  if (entries.length > maxWorkspaceFiles
    || entries.reduce((total, [, value]) => total + value.length, 0) > 4 * (Math.ceil(budget / 3) + entries.length)) {
    return undefined
  }
  const decoded = entries.map(([name, value]) => ({
    name,
    value,
    bytes: Buffer.from(value, 'base64'),
  }))
  if (decoded.some(file => !workspacePath(file.name) || file.bytes.toString('base64') !== file.value)
    || decoded.reduce((total, file) => total + file.bytes.length, 0) > budget) {
    return undefined
  }
  return decoded
}

/**
 * 在容器内从已打开的目录描述符读取普通文件，跳过符号链接、Git 元数据及特殊文件。
 * @example 模块内部上下文
 * ```ts
 * const command = ['node', '-e', captureWorkspace, '4096', '30']
 * ```
 */
export const captureWorkspace = String.raw`
const fs = require('node:fs')
const { O_DIRECTORY, O_RDONLY, O_NOFOLLOW, O_NONBLOCK } = fs.constants
const limit = Number(process.argv[1])
const fileLimit = Number(process.argv[2])
const result = Object.create(null)
let bytes = 0
let entries = 0
let files = 0
function visit(fd, parent) {
  const directory = '/proc/self/fd/' + fd
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (++entries > fileLimit * 8) throw new Error('Workspace entry limit')
    const name = entry.name
    if (name.toLowerCase() === '.git') continue
    const file = parent ? parent + '/' + name : name
    if (file.length > 512 || name.length > 128 || /[\p{Cc}\\]/u.test(name)) throw new Error('Invalid workspace path')
    if (!entry.isDirectory() && !entry.isFile()) continue
    const child = fs.openSync(directory + '/' + name, O_RDONLY | O_NOFOLLOW | O_NONBLOCK | (entry.isDirectory() ? O_DIRECTORY : 0))
    try {
      if (entry.isDirectory()) {
        visit(child, file)
        continue
      }
      const stat = fs.fstatSync(child)
      if (!stat.isFile() || ++files > fileLimit || stat.size > limit - bytes) throw new Error('Workspace file limit')
      const data = Buffer.alloc(stat.size + 1)
      let offset = 0
      while (offset < data.length) {
        const size = fs.readSync(child, data, offset, data.length - offset)
        if (!size) break
        offset += size
      }
      if (offset !== stat.size) throw new Error('Workspace changed while reading')
      bytes += offset
      result[file] = data.subarray(0, offset).toString('base64')
    } finally {
      fs.closeSync(child)
    }
  }
}
const root = fs.openSync('/workspace', O_RDONLY | O_NOFOLLOW | O_DIRECTORY)
try { visit(root, '') } finally { fs.closeSync(root) }
process.stdout.write(JSON.stringify(result))
`
