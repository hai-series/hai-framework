/**
 * @h-ai/storage — Local Provider 实现
 *
 * 基于本地文件系统的存储 Provider。
 * @module storage-provider-local
 */

import type { Result } from '@h-ai/core'
import type { LocalConfig, StorageConfig } from '../storage-config.js'
import type {
  DirOperations,
  FileMetadata,
  FileOperations,
  ListResult,
  PresignOperations,
  StorageError,
  StorageProvider,
} from '../storage-types.js'
import { Buffer } from 'node:buffer'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'

import * as path from 'node:path'
import { core, err, ok } from '@h-ai/core'

import { StorageErrorCode } from '../storage-config.js'

import { storageM } from '../storage-i18n.js'
import { MIME_TYPE_DEFAULT, MIME_TYPES } from '../storage-mime.js'

const logger = core.logger.child({ module: 'storage', scope: 'provider-local' })

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
function toStorageError(error: unknown, key?: string): StorageError {
  const e = error as NodeJS.ErrnoException

  if (e.code === 'ENOENT') {
    return {
      code: StorageErrorCode.NOT_FOUND,
      message: storageM('storage_fileNotFound', { params: { key: key ?? '' } }),
      key,
      cause: error,
    }
  }

  if (e.code === 'EACCES' || e.code === 'EPERM') {
    return {
      code: StorageErrorCode.PERMISSION_DENIED,
      message: storageM('storage_permissionDenied', { params: { key: key ?? '' } }),
      key,
      cause: error,
    }
  }

  if (e.code === 'ENOSPC') {
    return {
      code: StorageErrorCode.QUOTA_EXCEEDED,
      message: storageM('storage_diskSpaceInsufficient'),
      key,
      cause: error,
    }
  }

  if (e.code === 'EISDIR') {
    return {
      code: StorageErrorCode.INVALID_PATH,
      message: storageM('storage_pathIsDir', { params: { key: key ?? '' } }),
      key,
      cause: error,
    }
  }

  return {
    code: StorageErrorCode.IO_ERROR,
    message: storageM('storage_ioError', { params: { error: e.message ?? '' } }),
    key,
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
  return key.endsWith('.meta.json')
}

/**
 * 安全的路径解析，防止路径穿越攻击
 *
 * 处理流程：
 * 1. 规范化 key，移除前导 `../` 模式
 * 2. 拼接 root + key 得到完整路径
 * 3. resolve 后确认路径仍在 root 目录下
 *
 * @param root - 存储根目录绝对路径
 * @param key - 用户提供的文件键
 * @returns 安全的完整文件路径
 * @throws 当解析后路径超出 root 范围时抛出异常
 */
function safePath(root: string, key: string): string {
  // 拒绝绝对路径输入，防止 Windows 盘符绕过（如 D:\etc\passwd）
  if (path.isAbsolute(key)) {
    throw new Error(storageM('storage_pathTraversal'))
  }

  // 规范化路径，移除 ../ 等
  const normalized = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, '')
  const fullPath = path.join(root, normalized)

  // 确保路径在 root 目录下
  const realRoot = path.resolve(root)
  const realPath = path.resolve(fullPath)

  if (!realPath.startsWith(realRoot)) {
    throw new Error(storageM('storage_pathTraversal'))
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
 * - list 不支持 continuationToken 分页（仅支持 maxKeys 截断）
 * - presign 返回虚拟 `local://` URL，应用层需自行处理
 * - publicUrl 始终返回 null
 *
 * @returns Local Provider 实例
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

  /**
   * 将输入数据统一转为 Buffer
   *
   * @param data - 字符串、Buffer 或 Uint8Array
   * @returns Buffer 实例
   */
  function toBuffer(data: Buffer | Uint8Array | string): Buffer {
    if (typeof data === 'string') {
      return Buffer.from(data)
    }
    if (data instanceof Buffer) {
      return data
    }
    return Buffer.from(data)
  }

  // -------------------------------------------------------------------------
  // 文件操作实现
  // -------------------------------------------------------------------------

  const file: FileOperations = {
    async put(key, data, options = {}): Promise<Result<FileMetadata, StorageError>> {
      if (isMetaFile(key)) {
        return err({
          code: StorageErrorCode.INVALID_PATH,
          message: storageM('storage_metaFileAccess', { params: { key } }),
          key,
        })
      }
      try {
        const filePath = fullPath(key)
        const buffer = toBuffer(data)
        logger.debug('Putting file', { key, size: buffer.length })

        // 确保目录存在
        const dir = path.dirname(filePath)
        await fsp.mkdir(dir, { recursive: true, mode: getConfig().directoryMode })

        // 写入文件
        await fsp.writeFile(filePath, buffer, { mode: getConfig().fileMode })

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
        if (options.metadata) {
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
    },

    async get(key, options = {}): Promise<Result<Buffer, StorageError>> {
      if (isMetaFile(key)) {
        return err({
          code: StorageErrorCode.INVALID_PATH,
          message: storageM('storage_metaFileAccess', { params: { key } }),
          key,
        })
      }
      try {
        const filePath = fullPath(key)

        // 检查范围请求
        if (options.rangeStart !== undefined || options.rangeEnd !== undefined) {
          const stat = await fsp.stat(filePath)
          const start = options.rangeStart ?? 0
          const end = options.rangeEnd !== undefined ? options.rangeEnd : stat.size - 1

          // 使用流读取指定范围
          return new Promise((resolve) => {
            const chunks: Buffer[] = []
            const stream = fs.createReadStream(filePath, { start, end })

            stream.on('data', (chunk: Buffer) => chunks.push(chunk))
            stream.on('end', () => resolve(ok(Buffer.concat(chunks))))
            stream.on('error', error => resolve(err(toStorageError(error, key))))
          })
        }

        const data = await fsp.readFile(filePath)
        return ok(data)
      }
      catch (error) {
        return err(toStorageError(error, key))
      }
    },

    async head(key): Promise<Result<FileMetadata, StorageError>> {
      if (isMetaFile(key)) {
        return err({
          code: StorageErrorCode.INVALID_PATH,
          message: storageM('storage_metaFileAccess', { params: { key } }),
          key,
        })
      }
      try {
        const filePath = fullPath(key)
        const stat = await fsp.stat(filePath)

        if (stat.isDirectory()) {
          return err({
            code: StorageErrorCode.INVALID_PATH,
            message: storageM('storage_pathIsDir', { params: { key } }),
            key,
          })
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

    async exists(key): Promise<Result<boolean, StorageError>> {
      if (isMetaFile(key)) {
        return err({
          code: StorageErrorCode.INVALID_PATH,
          message: storageM('storage_metaFileAccess', { params: { key } }),
          key,
        })
      }
      try {
        const filePath = fullPath(key)
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

    async delete(key): Promise<Result<void, StorageError>> {
      if (isMetaFile(key)) {
        return err({
          code: StorageErrorCode.INVALID_PATH,
          message: storageM('storage_metaFileAccess', { params: { key } }),
          key,
        })
      }
      try {
        const filePath = fullPath(key)
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

    async deleteMany(keys): Promise<Result<void, StorageError>> {
      const errors: StorageError[] = []

      for (const key of keys) {
        const result = await file.delete(key)
        if (!result.success) {
          errors.push(result.error)
        }
      }

      if (errors.length > 0) {
        return err({
          code: StorageErrorCode.OPERATION_FAILED,
          message: storageM('storage_deleteManyFailed', { params: { count: errors.length } }),
          cause: errors,
        })
      }

      return ok(undefined)
    },

    async copy(sourceKey, destKey, options = {}): Promise<Result<FileMetadata, StorageError>> {
      if (isMetaFile(sourceKey) || isMetaFile(destKey)) {
        return err({
          code: StorageErrorCode.INVALID_PATH,
          message: storageM('storage_metaFileAccess', { params: { key: sourceKey } }),
          key: sourceKey,
        })
      }
      try {
        const sourcePath = fullPath(sourceKey)
        const destPath = fullPath(destKey)
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
    async list(options = {}): Promise<Result<ListResult, StorageError>> {
      try {
        const cfg = getConfig()
        const prefix = options.prefix || ''
        const delimiter = options.delimiter || ''
        const maxKeys = options.maxKeys || 1000

        const basePath = path.join(cfg.root, prefix)
        const files: FileMetadata[] = []
        const commonPrefixes = new Set<string>()

        // 递归读取目录
        async function readDir(dirPath: string): Promise<void> {
          let entries: fs.Dirent[]
          try {
            entries = await fsp.readdir(dirPath, { withFileTypes: true })
          }
          catch {
            return // 目录不存在，返回空
          }

          for (const entry of entries) {
            if (files.length >= maxKeys)
              return

            const fullEntryPath = path.join(dirPath, entry.name)
            const key = path.relative(cfg.root, fullEntryPath).replace(/\\/g, '/')

            // 跳过元数据文件
            if (entry.name.endsWith('.meta.json'))
              continue

            if (entry.isDirectory()) {
              if (delimiter) {
                // 有分隔符时，目录作为公共前缀
                commonPrefixes.add(`${key}/`)
              }
              else {
                // 无分隔符时，递归遍历
                await readDir(fullEntryPath)
              }
            }
            else if (entry.isFile()) {
              const stat = await fsp.stat(fullEntryPath)
              files.push({
                key,
                size: stat.size,
                contentType: getMimeType(key),
                lastModified: stat.mtime,
              })
            }
          }
        }

        await readDir(basePath)

        return ok({
          files,
          commonPrefixes: Array.from(commonPrefixes),
          isTruncated: files.length >= maxKeys,
        })
      }
      catch (error) {
        return err(toStorageError(error))
      }
    },

    async delete(prefix): Promise<Result<void, StorageError>> {
      try {
        const dirPath = fullPath(prefix)

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
    async getUrl(key, options?): Promise<Result<string, StorageError>> {
      // 本地存储不支持真正的签名 URL
      // 返回一个带签名参数的虚拟 URL，应用层需要自行处理
      const expiresIn = options?.expiresIn || 3600
      const expires = Math.floor(Date.now() / 1000) + expiresIn
      const signature = crypto
        .createHash('sha256')
        .update(`${key}:${expires}`)
        .digest('hex')
        .slice(0, 16)

      return ok(`local://${key}?expires=${expires}&signature=${signature}`)
    },

    async putUrl(key, options?): Promise<Result<string, StorageError>> {
      // 同上，返回虚拟 URL
      const expiresIn = options?.expiresIn || 3600
      const expires = Math.floor(Date.now() / 1000) + expiresIn
      const signature = crypto
        .createHash('sha256')
        .update(`put:${key}:${expires}`)
        .digest('hex')
        .slice(0, 16)

      return ok(`local://${key}?action=put&expires=${expires}&signature=${signature}`)
    },

    publicUrl(_key): string | null {
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

    async connect(cfg: StorageConfig): Promise<Result<void, StorageError>> {
      if (cfg.type !== 'local') {
        return err({
          code: StorageErrorCode.CONFIG_ERROR,
          message: storageM('storage_localConfigTypeError'),
        })
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
