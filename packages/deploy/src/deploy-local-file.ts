/** 本机配置文件的内部 I/O 边界；元数据检查与读取绑定同一句柄，写入只替换目录项。 */
import type { BigIntStats } from 'node:fs'
import { Buffer, constants as bufferConstants } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { closeSync, constants, fchmodSync, fstatSync, fsyncSync, lstatSync, openSync, readSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import process from 'node:process'

interface ReadOptions {
  maxBytes?: number
  private?: boolean
}

function regular(metadata: BigIntStats, options: ReadOptions = {}): void {
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1n
    || metadata.size < 0n || metadata.size > BigInt(options.maxBytes ?? bufferConstants.MAX_LENGTH - 1)
    || (options.private && process.platform !== 'win32'
      && ((metadata.mode & 0o077n) !== 0n || (process.getuid?.() !== 0 && metadata.uid !== BigInt(process.getuid?.() ?? -1))))) {
    throw new Error('Unsafe local file metadata')
  }
}

function sameFile(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

/**
 * 读取单一普通文件；现有上限检查不能被替换或增长后的文件绕过。
 * @example 模块内部上下文
 * ```ts
 * const bytes = readLocalFile('/workspace/project/private.json', { maxBytes: 65536, private: true })
 * ```
 */
export function readLocalFile(path: string, options: ReadOptions = {}): Buffer {
  const before = lstatSync(path, { bigint: true })
  regular(before, options)
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
  try {
    const opened = fstatSync(fd, { bigint: true })
    regular(opened, options)
    if (!sameFile(before, opened))
      throw new Error('Local file changed before opening')
    // 最多读取已检查大小加一个字节，增长不能触发无界分配或无界读取。
    const size = Number(opened.size)
    const bytes = Buffer.alloc(size + 1)
    let length = 0
    while (length < bytes.length) {
      const read = readSync(fd, bytes, length, bytes.length - length, null)
      if (!read)
        break
      length += read
    }
    const after = fstatSync(fd, { bigint: true })
    regular(after, options)
    if (!sameFile(opened, after) || length !== size || opened.size !== after.size
      || opened.mtimeNs !== after.mtimeNs || opened.ctimeNs !== after.ctimeNs) {
      throw new Error('Local file changed while reading')
    }
    return bytes.subarray(0, length)
  }
  finally {
    closeSync(fd)
  }
}

function existingFile(path: string): BigIntStats | undefined {
  try {
    const metadata = lstatSync(path, { bigint: true })
    regular(metadata)
    return metadata
  }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
      return undefined
    throw error
  }
}

/**
 * 独占临时文件写入后原子发布；不更新既有硬链接共享的 inode，不清理未知资源。
 * @example 模块内部上下文
 * ```ts
 * writeLocalFile('/workspace/project/.env.prod.local', 'HAI_DB_PASSWORD=example\n', true)
 * ```
 */
export function writeLocalFile(path: string, content: string, privateFile = false): void {
  const previous = existingFile(path)
  const mode = privateFile
    ? 0o600
    : previous
      ? Number(previous.mode & 0o777n)
      : 0o644
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`)
  let fd: number | undefined
  let owned: BigIntStats | undefined
  let published = false
  try {
    fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, mode)
    owned = fstatSync(fd, { bigint: true })
    fchmodSync(fd, mode)
    writeFileSync(fd, content, 'utf8')
    fsyncSync(fd)
    closeSync(fd)
    fd = undefined
    existingFile(path)
    const candidate = lstatSync(temporary, { bigint: true })
    regular(candidate)
    if (!sameFile(owned, candidate))
      throw new Error('Local temporary file ownership changed')
    renameSync(temporary, path)
    published = true
  }
  finally {
    if (fd !== undefined)
      closeSync(fd)
    if (!published && owned) {
      try {
        const candidate = lstatSync(temporary, { bigint: true })
        if (candidate.isFile() && sameFile(owned, candidate))
          unlinkSync(temporary)
      }
      catch { /* 清理失败不覆盖原始失败，也不删除身份不明的文件。 */ }
    }
  }
}
