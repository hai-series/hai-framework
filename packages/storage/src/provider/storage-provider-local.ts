/**
 * =============================================================================
 * @hai/storage - Local Provider 实现
 * =============================================================================
 *
 * 基于本地文件系统的存储 Provider。
 * 将文件存储在服务器本地文件系统中。
 *
 * @example
 * ```ts
 * import { createLocalProvider } from '@hai/storage'
 *
 * const provider = createLocalProvider()
 * await provider.connect({
 *     type: 'local',
 *     root: '/data/uploads'
 * })
 *
 * // 上传文件
 * await provider.file.put('images/photo.jpg', imageBuffer)
 *
 * // 下载文件
 * const data = await provider.file.get('images/photo.jpg')
 * ```
 *
 * @module storage-provider-local
 * =============================================================================
 */

import type { Result } from '@hai/core'
import type {
  DirOperations,
  FileMetadata,
  FileOperations,
  ListResult,
  LocalConfig,
  PresignOperations,
  StorageConfig,
  StorageError,
  StorageProvider,
} from '../storage-types.js'
import { Buffer } from 'node:buffer'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'

import * as fsp from 'node:fs/promises'
import * as path from 'node:path'

import { err, ok } from '@hai/core'

import { StorageErrorCode } from '../storage-config.js'

// =============================================================================
// 辅助函数
// =============================================================================

/**
 * 将 Node.js 错误转换为 StorageError
 */
function toStorageError(error: unknown, key?: string): StorageError {
  const e = error as NodeJS.ErrnoException

  if (e.code === 'ENOENT') {
    return {
      code: StorageErrorCode.NOT_FOUND,
      message: `文件不存在: ${key}`,
      key,
      cause: error,
    }
  }

  if (e.code === 'EACCES' || e.code === 'EPERM') {
    return {
      code: StorageErrorCode.PERMISSION_DENIED,
      message: `权限不足: ${key}`,
      key,
      cause: error,
    }
  }

  if (e.code === 'ENOSPC') {
    return {
      code: StorageErrorCode.QUOTA_EXCEEDED,
      message: '磁盘空间不足',
      key,
      cause: error,
    }
  }

  if (e.code === 'EISDIR') {
    return {
      code: StorageErrorCode.INVALID_PATH,
      message: `路径是目录: ${key}`,
      key,
      cause: error,
    }
  }

  return {
    code: StorageErrorCode.IO_ERROR,
    message: e.message ? `IO 错误: ${e.message}` : 'IO 错误',
    key,
    cause: error,
  }
}

/**
 * 获取文件的 MIME 类型
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.wav': 'audio/wav',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
  }
  return mimeTypes[ext] || 'application/octet-stream'
}

/**
 * 计算文件的 ETag
 */
function calculateEtag(data: Buffer): string {
  const hash = crypto.createHash('md5').update(data).digest('hex')
  return `"${hash}"`
}

/**
 * 安全的路径解析，防止路径穿越攻击
 */
function safePath(root: string, key: string): string {
  // 规范化路径，移除 ../ 等
  const normalized = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, '')
  const fullPath = path.join(root, normalized)

  // 确保路径在 root 目录下
  const realRoot = path.resolve(root)
  const realPath = path.resolve(fullPath)

  if (!realPath.startsWith(realRoot)) {
    throw new Error('检测到路径穿越攻击')
  }

  return fullPath
}

// =============================================================================
// Local Provider 实现
// =============================================================================

/**
 * 创建本地存储 Provider
 *
 * @returns Local Provider 实例
 */
export function createLocalProvider(): StorageProvider {
  let config: LocalConfig | null = null
  let connected = false

  // -------------------------------------------------------------------------
  // 辅助方法
  // -------------------------------------------------------------------------

  function getConfig(): LocalConfig {
    if (!config) {
      throw new Error('本地存储未初始化')
    }
    return config
  }

  function fullPath(key: string): string {
    return safePath(getConfig().root, key)
  }

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
      try {
        const filePath = fullPath(key)
        const buffer = toBuffer(data)

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
          etag: calculateEtag(buffer),
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
        return err(toStorageError(error, key))
      }
    },

    async get(key, options = {}): Promise<Result<Buffer, StorageError>> {
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
      try {
        const filePath = fullPath(key)
        const stat = await fsp.stat(filePath)

        if (stat.isDirectory()) {
          return err({
            code: StorageErrorCode.INVALID_PATH,
            message: `路径是目录: ${key}`,
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

        // 计算 ETag
        const data = await fsp.readFile(filePath)
        const etag = calculateEtag(data)

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
      try {
        const filePath = fullPath(key)
        await fsp.access(filePath, fs.constants.F_OK)
        return ok(true)
      }
      catch {
        return ok(false)
      }
    },

    async delete(key): Promise<Result<void, StorageError>> {
      try {
        const filePath = fullPath(key)
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
          message: `删除 ${errors.length} 个文件失败`,
          cause: errors,
        })
      }

      return ok(undefined)
    },

    async copy(sourceKey, destKey, options = {}): Promise<Result<FileMetadata, StorageError>> {
      try {
        const sourcePath = fullPath(sourceKey)
        const destPath = fullPath(destKey)

        // 确保目标目录存在
        await fsp.mkdir(path.dirname(destPath), { recursive: true, mode: getConfig().directoryMode })

        // 复制文件
        await fsp.copyFile(sourcePath, destPath)

        // 获取新文件的元数据
        const data = await fsp.readFile(destPath)
        const stat = await fsp.stat(destPath)

        const metadata: FileMetadata = {
          key: destKey,
          size: stat.size,
          contentType: options.contentType || getMimeType(destKey),
          lastModified: stat.mtime,
          etag: calculateEtag(data),
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
          message: '配置类型错误：Local provider 仅支持 type=local',
        })
      }

      try {
        config = cfg

        // 确保根目录存在
        await fsp.mkdir(cfg.root, { recursive: true, mode: cfg.directoryMode })

        connected = true
        return ok(undefined)
      }
      catch (error) {
        config = null
        return err(toStorageError(error))
      }
    },

    async close(): Promise<void> {
      config = null
      connected = false
    },

    isConnected(): boolean {
      return connected
    },
  }
}
