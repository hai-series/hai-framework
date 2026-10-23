/**
 * @h-ai/storage — Local Provider 实现
 *
 * 基于本地文件系统的存储 Provider。
 * @module storage-provider-local
 */

import type { HaiError, HaiResult } from '@h-ai/core'
import type { LocalConfig, StorageConfig } from '../storage-config.js'
import type { DirOperations, FileMetadata, FileOperations, ListResult, PresignOperations, StorageDeleteResult, StorageDeleteSummary } from '../storage-types.js'
import type { StorageProvider } from './storage-provider-types.js'
import { Buffer } from 'node:buffer'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { Readable } from 'node:stream'

import { pipeline } from 'node:stream/promises'
import { core, err, ok } from '@h-ai/core'

import { toStorageDeleteResult } from '../storage-delete.js'
import { storageM } from '../storage-i18n.js'
import { MIME_TYPE_DEFAULT, MIME_TYPES } from '../storage-mime.js'
import { toByteStream } from '../storage-stream.js'
import {

  HaiStorageError,

} from '../storage-types.js'
import { logStorageOperation } from './storage-operation-log.js'

const logger = core.logger.child({ module: 'storage', scope: 'provider-local' })
const PATH_SEGMENT_SPLIT_REGEX = /[\\/]+/

// ─── 辅助函数 ───

/**
 * 将 Node.js 文件系统错误转换为 StorageError
 *
 * 映射规则：
 * - ENOENT → NOT_FOUND
 * - EACCES / EPERM → PERMISSION_DENIED
 * - ENOSPC → QUOTA_EXCEEDED
 * - EISDIR → INVALID_PATH
 * - 其他 → IO_ERROR
 *
 * @param error - 原始错误对象
 * @param key - 相关文件键（可选，用于错误消息）
 * @returns 统一的 StorageError
 */
function toStorageError(error: unknown, key?: string): HaiError {
  const e = error as NodeJS.ErrnoException

  if (e.code === 'EEXIST') {
    return { ...HaiStorageError.ALREADY_EXISTS, message: storageM('storage_fileAlreadyExists', { params: { key: key ?? '' } }), cause: error }
  }

  if (e.code === 'ENOENT') {
    return {
      ...HaiStorageError.NOT_FOUND,
      message: storageM('storage_fileNotFound', { params: { key: key ?? '' } }),
      cause: error,
    }
  }

  if (e.code === 'EACCES' || e.code === 'EPERM') {
    return {
      ...HaiStorageError.PERMISSION_DENIED,
      message: storageM('storage_permissionDenied', { params: { key: key ?? '' } }),
      cause: error,
    }
  }

  if (e.code === 'ENOSPC') {
    return {
      ...HaiStorageError.QUOTA_EXCEEDED,
      message: storageM('storage_diskSpaceInsufficient'),
      cause: error,
    }
  }

  if (e.code === 'EISDIR') {
    return {
      ...HaiStorageError.INVALID_PATH,
      message: storageM('storage_pathIsDir', { params: { key: key ?? '' } }),
      cause: error,
    }
  }

  if (e.code === 'EINVAL') {
    return {
      ...HaiStorageError.INVALID_PATH,
      message: e.message || storageM('storage_pathTraversal'),
      cause: error,
    }
  }

  return {
    code: HaiStorageError.IO_ERROR.code,
    message: storageM('storage_ioError', { params: { error: e.message ?? '' } }),
    cause: error,
  }
}

/**
 * 根据文件扩展名获取 MIME 类型
 *
 * 使用共享 MIME_TYPES 映射表，未匹配时返回 'application/octet-stream'。
 *
 * @param filePath - 文件路径或文件名
 * @returns MIME 类型字符串
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().replace('.', '')
  return MIME_TYPES[ext] || MIME_TYPE_DEFAULT
}

/**
 * 根据文件 stat 信息计算 ETag
 *
 * 使用 "size-mtime" 格式，与 head 操作保持一致，无需读取文件内容。
 *
 * @param stat - 文件的 fs.Stats 对象
 * @returns 带双引号的 ETag 字符串，如 '"a-18f7ec3b4c0"'
 */
function calculateEtag(stat: fs.Stats): string {
  return `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`
}

/**
 * 检查 key 是否指向内部元数据文件（.meta.json）
 *
 * 拦截外部对 .meta.json 文件的直接访问，防止元数据泄漏。
 */
function isMetaFile(key: string): boolean {
  return key.endsWith('.meta.json') || key.endsWith('.upload.tmp')
}

/**
 * 创建非法路径错误（用于统一映射为 INVALID_PATH）
 */
function createInvalidPathError(): NodeJS.ErrnoException {
  const error = new Error(storageM('storage_pathTraversal')) as NodeJS.ErrnoException
  error.code = 'EINVAL'
  return error
}

/**
 * 判断路径片段中是否包含路径穿越标记（..）
 */
function hasPathTraversalSegment(key: string): boolean {
  const segments = key.split(PATH_SEGMENT_SPLIT_REGEX).filter(Boolean)
  return segments.includes('..')
}

/**
 * 安全的路径解析，防止路径穿越攻击
 *
 * 处理流程：
 * 1. 拒绝绝对路径、空字节、`..` 路径穿越片段
 * 2. resolve(root, key) 得到完整路径
 * 3. 校验完整路径必须位于 root 内部（或等于 root）
 *
 * @param root - 存储根目录绝对路径
 * @param key - 用户提供的文件键
 * @returns 安全的完整文件路径
 * @throws 当解析后路径超出 root 范围时抛出异常
 */
function safePath(root: string, key: string): string {
  // 拒绝绝对路径输入，防止 Windows 盘符绕过（如 D:\etc\passwd）
  if (path.isAbsolute(key)) {
    throw createInvalidPathError()
  }

  // 拒绝空字节与路径穿越片段
  if (key.includes('\0') || hasPathTraversalSegment(key)) {
    throw createInvalidPathError()
  }

  const normalized = path.normalize(key)
  const fullPath = path.resolve(root, normalized)

  // 确保路径在 root 目录下
  const realRoot = path.resolve(root)
  const inRoot = fullPath === realRoot || fullPath.startsWith(`${realRoot}${path.sep}`)

  if (!inRoot) {
    throw createInvalidPathError()
  }

  return fullPath
}

// ─── Local Provider 实现 ───

/**
 * 创建本地存储 Provider
 *
 * 基于本地文件系统实现的 StorageProvider。
 * connect 时会自动创建根目录；文件操作会自动创建中间目录。
 *
 * 已知限制：
 * - list 使用绑定查询范围的无状态游标；按 UTF-8 key 排序，每次仍需扫描并排序匹配目录
 * - presign.getUrl/putUrl 明确不支持，publicUrl 返回 null；HTTP 访问由应用鉴权接口提供
 * - publicUrl 始终返回 null
 *
 * @returns Local Provider 实例
 * @example 模块内部上下文
 * ```ts
 * const provider = createLocalProvider()
 * await provider.close() // 工厂尚未连接；connect 的失败结果由调用方处理。
 * ```
 */
export function createLocalProvider(): StorageProvider {
  let config: LocalConfig | null = null
  let connected = false

  // -------------------------------------------------------------------------
  // 辅助方法
  // -------------------------------------------------------------------------

  /** 获取当前 Local 配置，未初始化时抛异常 */
  function getConfig(): LocalConfig {
    if (!config) {
      throw new Error(storageM('storage_localNotInitialized'))
    }
    return config
  }

  /** 将用户 key 转为安全的绝对路径（经 safePath 防穿越处理） */
  function fullPath(key: string): string {
    return safePath(getConfig().root, key)
  }

  function logOperation(category: 'read' | 'write', operation: string, payload: unknown): void {
    logStorageOperation(logger, config?.operationLog, category, operation, payload)
  }

  // -------------------------------------------------------------------------
  // 文件操作实现
  // -------------------------------------------------------------------------

  const file: FileOperations = {
    async put(key, data, options = {}): Promise<HaiResult<FileMetadata>> {
      if (isMetaFile(key)) {
        return err(
          HaiStorageError.INVALID_PATH,
          storageM('storage_metaFileAccess', { params: { key } }),
        )
      }
      let temporaryPath: string | undefined
      try {
        const filePath = fullPath(key)
        logOperation('write', 'file.put', { key, options })

        // 确保目录存在
        const dir = path.dirname(filePath)
        await fsp.mkdir(dir, { recursive: true, mode: getConfig().directoryMode })

        // 先流式写入同目录临时文件，失败不破坏已有对象；发布采用原子文件系统操作。
        temporaryPath = `${filePath}.${crypto.randomUUID()}.upload.tmp`
        await pipeline(
          Readable.from(toByteStream(data, options.signal), { objectMode: false }),
          fs.createWriteStream(temporaryPath, { flags: 'wx', mode: getConfig().fileMode }),
          { signal: options.signal },
        )
        options.signal?.throwIfAborted()
        if (options.ifNoneMatch === '*')
          await fsp.link(temporaryPath, filePath)
        else
          await fsp.rename(temporaryPath, filePath)

        // 获取元数据
        const stat = await fsp.stat(filePath)
        const metadata: FileMetadata = {
          key,
          size: stat.size,
          contentType: options.contentType || getMimeType(key),
          lastModified: stat.mtime,
          etag: calculateEtag(stat),
          metadata: options.metadata,
        }

        // 存储自定义元数据（使用扩展属性或元数据文件）
        if (options.metadata || options.contentType) {
          const metaPath = `${filePath}.meta.json`
          await fsp.writeFile(metaPath, JSON.stringify({
            contentType: options.contentType,
            metadata: options.metadata,
          }))
        }

        return ok(metadata)
      }
      catch (error) {
        logger.warn('Put file failed', { key, error })
        return err(toStorageError(error, key))
      }
      finally {
        if (temporaryPath)
          await fsp.unlink(temporaryPath).catch(() => {})
      }
    },

    async get(key, options = {}): Promise<HaiResult<Buffer>> {
      const streamed = await file.getStream(key, options)
      if (!streamed.success)
        return streamed
      try {
        const chunks: Uint8Array[] = []
        for await (const chunk of streamed.data)
          chunks.push(chunk)
        return ok(Buffer.concat(chunks))
      }
      catch (error) {
        return err(toStorageError(error, key))
      }
    },

    async getStream(key, options = {}) {
      if (isMetaFile(key)) {
        return err(
          HaiStorageError.INVALID_PATH,
          storageM('storage_metaFileAccess', { params: { key } }),
        )
      }
      try {
        const filePath = fullPath(key)
        logOperation('read', 'file.getStream', { key, options })
        options.signal?.throwIfAborted()
        const stat = await fsp.stat(filePath)
        if (stat.isDirectory())
          return err(HaiStorageError.INVALID_PATH, storageM('storage_pathIsDir', { params: { key } }))
        // 延迟打开，未消费的返回值不会占用文件句柄；迭代错误交由流消费者处理。
        async function* read(): AsyncIterable<Uint8Array> {
          const stream = fs.createReadStream(filePath, { start: options.rangeStart, end: options.rangeEnd, signal: options.signal })
          for await (const chunk of stream)
            yield chunk
        }
        return ok(read())
      }
      catch (error) {
        return err(toStorageError(error, key))
      }
    },

    async head(key): Promise<HaiResult<FileMetadata>> {
      if (isMetaFile(key)) {
        return err(
          HaiStorageError.INVALID_PATH,
          storageM('storage_metaFileAccess', { params: { key } }),
        )
      }
      try {
        const filePath = fullPath(key)
        logOperation('read', 'file.head', { key })
        const stat = await fsp.stat(filePath)

        if (stat.isDirectory()) {
          return err(
            HaiStorageError.INVALID_PATH,
            storageM('storage_pathIsDir', { params: { key } }),
          )
        }

        // 尝试读取元数据文件
        let customMetadata: { contentType?: string, metadata?: Record<string, string> } = {}
        try {
          const metaPath = `${filePath}.meta.json`
          const metaContent = await fsp.readFile(metaPath, 'utf-8')
          customMetadata = JSON.parse(metaContent)
        }
        catch {
          // 元数据文件不存在，忽略
        }

        // 基于文件大小和修改时间生成 ETag（无需读取整个文件）
        const etag = `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`

        return ok({
          key,
          size: stat.size,
          contentType: customMetadata.contentType || getMimeType(key),
          lastModified: stat.mtime,
          etag,
          metadata: customMetadata.metadata,
        })
      }
      catch (error) {
        return err(toStorageError(error, key))
      }
    },

    async exists(key): Promise<HaiResult<boolean>> {
      if (isMetaFile(key)) {
        return err(
          HaiStorageError.INVALID_PATH,
          storageM('storage_metaFileAccess', { params: { key } }),
        )
      }
      try {
        const filePath = fullPath(key)
        logOperation('read', 'file.exists', { key })
        await fsp.access(filePath, fs.constants.F_OK)
        return ok(true)
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return ok(false)
        }
        return err(toStorageError(error, key))
      }
    },

    async delete(key): Promise<HaiResult<void>> {
      if (isMetaFile(key)) {
        return err(
          HaiStorageError.INVALID_PATH,
          storageM('storage_metaFileAccess', { params: { key } }),
        )
      }
      try {
        const filePath = fullPath(key)
        logOperation('write', 'file.delete', { key })
        logger.debug('Deleting file', { key })
        await fsp.unlink(filePath)

        // 尝试删除元数据文件
        try {
          await fsp.unlink(`${filePath}.meta.json`)
        }
        catch {
          // 忽略
        }

        return ok(undefined)
      }
      catch (error) {
        // 如果文件不存在，视为删除成功
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return ok(undefined)
        }
        logger.warn('Delete file failed', { key, error })
        return err(toStorageError(error, key))
      }
    },

    async deleteMany(keys): Promise<StorageDeleteResult> {
      logOperation('write', 'file.deleteMany', { count: keys.length, keys })
      const summary: StorageDeleteSummary = { deletedKeys: [], failures: [] }
      const uniqueKeys = [...new Set(keys)]
      // 有界并行；reject 也必须形成失败项，不能被 Promise.allSettled 静默丢弃。
      for (let offset = 0; offset < uniqueKeys.length; offset += 32) {
        const batch = uniqueKeys.slice(offset, offset + 32)
        const results = await Promise.allSettled(batch.map(key => file.delete(key)))
        for (const [index, result] of results.entries()) {
          const key = batch[index]
          if (result.status === 'rejected')
            summary.failures.push({ key, code: 'UnexpectedDeleteFailure', retryable: false, outcome: 'failed' })
          else if (!result.value.success)
            summary.failures.push({ key, code: String(result.value.error.code), retryable: false, outcome: 'failed' })
          else
            summary.deletedKeys.push(key)
        }
      }
      return toStorageDeleteResult(summary)
    },

    async copy(sourceKey, destKey, options = {}): Promise<HaiResult<FileMetadata>> {
      if (isMetaFile(sourceKey) || isMetaFile(destKey)) {
        return err(
          HaiStorageError.INVALID_PATH,
          storageM('storage_metaFileAccess', { params: { key: sourceKey } }),
          sourceKey,
        )
      }
      try {
        const sourcePath = fullPath(sourceKey)
        const destPath = fullPath(destKey)
        logOperation('write', 'file.copy', { sourceKey, destKey, options })
        logger.debug('Copying file', { sourceKey, destKey })

        // 确保目标目录存在
        await fsp.mkdir(path.dirname(destPath), { recursive: true, mode: getConfig().directoryMode })

        // 复制文件
        await fsp.copyFile(sourcePath, destPath)

        // 获取新文件的元数据（无需读取文件内容，使用 stat 计算 ETag）
        const stat = await fsp.stat(destPath)

        const metadata: FileMetadata = {
          key: destKey,
          size: stat.size,
          contentType: options.contentType || getMimeType(destKey),
          lastModified: stat.mtime,
          etag: calculateEtag(stat),
          metadata: options.metadata,
        }

        // 存储自定义元数据
        if (options.contentType || options.metadata) {
          const metaPath = `${destPath}.meta.json`
          await fsp.writeFile(metaPath, JSON.stringify({
            contentType: options.contentType,
            metadata: options.metadata,
          }))
        }

        return ok(metadata)
      }
      catch (error) {
        return err(toStorageError(error, sourceKey))
      }
    },
  }

  // -------------------------------------------------------------------------
  // 目录操作实现
  // -------------------------------------------------------------------------

  const dir: DirOperations = {
    async list(options = {}): Promise<HaiResult<ListResult>> {
      try {
        const cfg = getConfig()
        const prefix = options.prefix === undefined ? '' : options.prefix
        const delimiter = options.delimiter === undefined ? '' : options.delimiter
        const maxKeys = options.maxKeys === undefined ? 1000 : options.maxKeys
        if (typeof prefix !== 'string' || typeof delimiter !== 'string' || !Number.isInteger(maxKeys) || maxKeys < 1 || maxKeys > 1000
          || Buffer.from(prefix).toString('utf8') !== prefix || Buffer.from(delimiter).toString('utf8') !== delimiter) {
          return err(HaiStorageError.INVALID_LIST_OPTIONS, storageM('storage_listOptionsInvalid'))
        }
        logOperation('read', 'dir.list', { options })

        // 前缀只是 key 字符串，不能当作目录打开；从规范根目录遍历，子目录符号链接不会被跟随。
        safePath(cfg.root, prefix)
        const root = await fsp.realpath(cfg.root)
        const scope = crypto.createHash('sha256').update(JSON.stringify([root, prefix, delimiter])).digest('hex')
        let after = ''
        if (options.continuationToken !== undefined) {
          const token = options.continuationToken
          try {
            if (typeof token !== 'string' || token.length === 0 || token.length > 262_144)
              throw new Error('Invalid cursor encoding')
            const bytes = Buffer.from(token, 'base64url')
            if (bytes.toString('base64url') !== token)
              throw new Error('Invalid cursor encoding')
            const decoded: unknown = JSON.parse(bytes.toString('utf8'))
            if (!Array.isArray(decoded) || decoded.length !== 3 || decoded[0] !== 1 || decoded[1] !== scope
              || typeof decoded[2] !== 'string' || decoded[2].length === 0 || !decoded[2].startsWith(prefix)) {
              throw new Error('Invalid cursor scope')
            }
            after = decoded[2]
          }
          catch {
            return err(HaiStorageError.INVALID_LIST_OPTIONS, storageM('storage_listCursorInvalid'))
          }
        }
        const files: FileMetadata[] = []
        const commonPrefixes: string[] = []
        const compare = (left: string, right: string) => Buffer.compare(Buffer.from(left), Buffer.from(right))

        // 按 name + '/' 排序目录，再深度遍历，可保持完整文件 key 的字节序（a.txt 在 a/x 之前）。
        async function* readDir(dirPath: string, directoryKey: string): AsyncGenerator<{ key: string, filePath: string }> {
          const entries = await fsp.readdir(dirPath, { withFileTypes: true })
          entries.sort((left, right) => compare(left.name + (left.isDirectory() ? '/' : ''), right.name + (right.isDirectory() ? '/' : '')))
          for (const entry of entries) {
            if (isMetaFile(entry.name))
              continue
            const key = directoryKey + entry.name
            const filePath = path.join(dirPath, entry.name)
            if (entry.isDirectory()) {
              const childPrefix = `${key}/`
              if (prefix.startsWith(childPrefix) || childPrefix.startsWith(prefix)) {
                yield* readDir(filePath, childPrefix)
              }
            }
            else if (entry.isFile() && key.startsWith(prefix)) {
              yield { key, filePath }
            }
          }
        }

        let previous = ''
        let last = ''
        let count = 0
        let isTruncated = false
        for await (const entry of readDir(root, '')) {
          const index = delimiter ? entry.key.indexOf(delimiter, prefix.length) : -1
          const logicalKey = index < 0 ? entry.key : entry.key.slice(0, index + delimiter.length)
          if (logicalKey === previous)
            continue
          previous = logicalKey
          if (compare(logicalKey, after) <= 0)
            continue
          // 多读取一个逻辑条目证明存在下一页；恰好一页时不伪造 continuation。
          if (count === maxKeys) {
            isTruncated = true
            break
          }
          if (index >= 0) {
            commonPrefixes.push(logicalKey)
          }
          else {
            const stat = await fsp.stat(entry.filePath)
            files.push({ key: entry.key, size: stat.size, contentType: getMimeType(entry.key), lastModified: stat.mtime })
          }
          count++
          last = logicalKey
        }
        return ok({
          files,
          commonPrefixes,
          isTruncated,
          ...(isTruncated ? { nextContinuationToken: Buffer.from(JSON.stringify([1, scope, last])).toString('base64url') } : {}),
        })
      }
      catch (error) {
        return err(toStorageError(error))
      }
    },

    async delete(prefix): Promise<HaiResult<void>> {
      try {
        const dirPath = fullPath(prefix)
        logOperation('write', 'dir.delete', { prefix })

        // 递归删除目录
        await fsp.rm(dirPath, { recursive: true, force: true })

        return ok(undefined)
      }
      catch (error) {
        // 如果目录不存在，视为删除成功
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return ok(undefined)
        }
        return err(toStorageError(error, prefix))
      }
    },
  }

  // -------------------------------------------------------------------------
  // 签名 URL 操作实现
  // -------------------------------------------------------------------------

  const presign: PresignOperations = {
    async getUrl(key, options?): Promise<HaiResult<string>> {
      logOperation('read', 'presign.getUrl', { key, options })
      return err(HaiStorageError.UNSUPPORTED_OPERATION, storageM('storage_localPresignUnsupported'))
    },

    async putUrl(key, options?): Promise<HaiResult<string>> {
      logOperation('write', 'presign.putUrl', { key, options })
      return err(HaiStorageError.UNSUPPORTED_OPERATION, storageM('storage_localPresignUnsupported'))
    },

    publicUrl(key): string | null {
      logOperation('read', 'presign.publicUrl', { key })
      // 本地存储不支持公开 URL
      return null
    },
  }

  // -------------------------------------------------------------------------
  // Provider 接口实现
  // -------------------------------------------------------------------------

  return {
    name: 'local',

    file,
    dir,
    presign,

    async connect(cfg: StorageConfig): Promise<HaiResult<void>> {
      if (cfg.type !== 'local') {
        return err(
          HaiStorageError.CONFIG_ERROR,
          storageM('storage_localConfigTypeError'),
        )
      }

      try {
        config = cfg
        logger.info('Connecting local provider', { root: cfg.root })

        // 确保根目录存在
        await fsp.mkdir(cfg.root, { recursive: true, mode: cfg.directoryMode })

        connected = true
        logger.info('Local provider connected', { root: cfg.root })
        return ok(undefined)
      }
      catch (error) {
        logger.error('Local provider connect failed', { error })
        config = null
        return err(toStorageError(error))
      }
    },

    async close(): Promise<void> {
      logger.info('Local provider disconnected')
      config = null
      connected = false
    },

    isConnected(): boolean {
      return connected
    },
  }
}
