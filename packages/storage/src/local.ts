/**
 * =============================================================================
 * @hai/storage - 本地文件系统驱动
 * =============================================================================
 * 基于 Node.js fs 模块的本地存储实现
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { createLogger, err, ok } from '@hai/core'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { lookup as mimeLookup } from './mime.js'
import type {
  CopyOptions,
  DownloadOptions,
  FileMetadata,
  ListOptions,
  ListResult,
  LocalStorageOptions,
  MoveOptions,
  StorageDriver,
  StorageError,
  UploadOptions,
} from './types.js'

const logger = createLogger({ name: 'storage-local' })

/**
 * 本地文件系统存储驱动
 */
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local'
  private root: string
  private directoryMode: number
  private fileMode: number
  
  constructor(options: LocalStorageOptions) {
    this.root = path.resolve(options.root)
    this.directoryMode = options.directoryMode ?? 0o755
    this.fileMode = options.fileMode ?? 0o644
    
    logger.info({ root: this.root }, 'Local storage driver initialized')
  }
  
  /**
   * 解析完整路径
   */
  private resolvePath(filePath: string): string {
    // 规范化路径，防止目录穿越攻击
    const normalized = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '')
    return path.join(this.root, normalized)
  }
  
  /**
   * 相对路径
   */
  private relativePath(fullPath: string): string {
    return path.relative(this.root, fullPath).replace(/\\/g, '/')
  }
  
  /**
   * 检查文件是否存在
   */
  async exists(filePath: string): Promise<Result<boolean, StorageError>> {
    try {
      const fullPath = this.resolvePath(filePath)
      await fs.access(fullPath)
      return ok(true)
    }
    catch {
      return ok(false)
    }
  }
  
  /**
   * 获取文件元数据
   */
  async getMetadata(filePath: string): Promise<Result<FileMetadata, StorageError>> {
    try {
      const fullPath = this.resolvePath(filePath)
      const stats = await fs.stat(fullPath)
      
      if (!stats.isFile()) {
        return err({
          type: 'NOT_FOUND',
          message: `Not a file: ${filePath}`,
          path: filePath,
        })
      }
      
      return ok({
        path: filePath,
        name: path.basename(filePath),
        size: stats.size,
        mimeType: mimeLookup(filePath),
        createdAt: stats.birthtime,
        updatedAt: stats.mtime,
      })
    }
    catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return err({
          type: 'NOT_FOUND',
          message: `File not found: ${filePath}`,
          path: filePath,
        })
      }
      
      logger.error({ error, path: filePath }, 'Failed to get metadata')
      
      return err({
        type: 'IO_ERROR',
        message: `Failed to get metadata: ${error instanceof Error ? error.message : String(error)}`,
        path: filePath,
      })
    }
  }
  
  /**
   * 读取文件
   */
  async read(filePath: string, _options?: DownloadOptions): Promise<Result<Uint8Array, StorageError>> {
    try {
      const fullPath = this.resolvePath(filePath)
      const data = await fs.readFile(fullPath)
      
      return ok(new Uint8Array(data))
    }
    catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return err({
          type: 'NOT_FOUND',
          message: `File not found: ${filePath}`,
          path: filePath,
        })
      }
      
      logger.error({ error, path: filePath }, 'Failed to read file')
      
      return err({
        type: 'IO_ERROR',
        message: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
        path: filePath,
      })
    }
  }
  
  /**
   * 读取文件为文本
   */
  async readText(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<Result<string, StorageError>> {
    try {
      const fullPath = this.resolvePath(filePath)
      const data = await fs.readFile(fullPath, { encoding })
      
      return ok(data)
    }
    catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return err({
          type: 'NOT_FOUND',
          message: `File not found: ${filePath}`,
          path: filePath,
        })
      }
      
      logger.error({ error, path: filePath }, 'Failed to read text file')
      
      return err({
        type: 'IO_ERROR',
        message: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
        path: filePath,
      })
    }
  }
  
  /**
   * 读取 JSON 文件
   */
  async readJson<T = unknown>(filePath: string): Promise<Result<T, StorageError>> {
    const textResult = await this.readText(filePath)
    
    if (textResult.isErr()) {
      return err(textResult.error)
    }
    
    try {
      const data = JSON.parse(textResult.value) as T
      return ok(data)
    }
    catch (error) {
      return err({
        type: 'IO_ERROR',
        message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        path: filePath,
      })
    }
  }
  
  /**
   * 写入文件
   */
  async write(
    filePath: string,
    data: Uint8Array | string,
    options?: UploadOptions,
  ): Promise<Result<FileMetadata, StorageError>> {
    try {
      const fullPath = this.resolvePath(filePath)
      
      // 检查是否已存在
      if (!options?.overwrite) {
        try {
          await fs.access(fullPath)
          return err({
            type: 'ALREADY_EXISTS',
            message: `File already exists: ${filePath}`,
            path: filePath,
          })
        }
        catch {
          // 文件不存在，可以写入
        }
      }
      
      // 确保目录存在
      await fs.mkdir(path.dirname(fullPath), { recursive: true, mode: this.directoryMode })
      
      // 写入文件
      const buffer = typeof data === 'string' ? data : Buffer.from(data)
      await fs.writeFile(fullPath, buffer, { mode: this.fileMode })
      
      // 返回元数据
      return this.getMetadata(filePath)
    }
    catch (error) {
      logger.error({ error, path: filePath }, 'Failed to write file')
      
      return err({
        type: 'IO_ERROR',
        message: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
        path: filePath,
      })
    }
  }
  
  /**
   * 写入 JSON 文件
   */
  async writeJson(
    filePath: string,
    data: unknown,
    options?: UploadOptions,
  ): Promise<Result<FileMetadata, StorageError>> {
    const json = JSON.stringify(data, null, 2)
    return this.write(filePath, json, {
      ...options,
      contentType: 'application/json',
    })
  }
  
  /**
   * 追加内容
   */
  async append(filePath: string, data: Uint8Array | string): Promise<Result<void, StorageError>> {
    try {
      const fullPath = this.resolvePath(filePath)
      
      // 确保目录存在
      await fs.mkdir(path.dirname(fullPath), { recursive: true, mode: this.directoryMode })
      
      const buffer = typeof data === 'string' ? data : Buffer.from(data)
      await fs.appendFile(fullPath, buffer)
      
      return ok(undefined)
    }
    catch (error) {
      logger.error({ error, path: filePath }, 'Failed to append to file')
      
      return err({
        type: 'IO_ERROR',
        message: `Failed to append: ${error instanceof Error ? error.message : String(error)}`,
        path: filePath,
      })
    }
  }
  
  /**
   * 删除文件
   */
  async delete(filePath: string): Promise<Result<void, StorageError>> {
    try {
      const fullPath = this.resolvePath(filePath)
      await fs.unlink(fullPath)
      
      return ok(undefined)
    }
    catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return err({
          type: 'NOT_FOUND',
          message: `File not found: ${filePath}`,
          path: filePath,
        })
      }
      
      logger.error({ error, path: filePath }, 'Failed to delete file')
      
      return err({
        type: 'IO_ERROR',
        message: `Failed to delete: ${error instanceof Error ? error.message : String(error)}`,
        path: filePath,
      })
    }
  }
  
  /**
   * 复制文件
   */
  async copy(
    source: string,
    destination: string,
    options?: CopyOptions,
  ): Promise<Result<FileMetadata, StorageError>> {
    try {
      const srcPath = this.resolvePath(source)
      const destPath = this.resolvePath(destination)
      
      // 检查源文件
      try {
        const stats = await fs.stat(srcPath)
        if (!stats.isFile()) {
          return err({
            type: 'NOT_FOUND',
            message: `Source is not a file: ${source}`,
            path: source,
          })
        }
      }
      catch {
        return err({
          type: 'NOT_FOUND',
          message: `Source not found: ${source}`,
          path: source,
        })
      }
      
      // 检查目标是否存在
      if (!options?.overwrite) {
        try {
          await fs.access(destPath)
          return err({
            type: 'ALREADY_EXISTS',
            message: `Destination already exists: ${destination}`,
            path: destination,
          })
        }
        catch {
          // 目标不存在，可以复制
        }
      }
      
      // 确保目标目录存在
      await fs.mkdir(path.dirname(destPath), { recursive: true, mode: this.directoryMode })
      
      // 复制文件
      await fs.copyFile(srcPath, destPath)
      
      return this.getMetadata(destination)
    }
    catch (error) {
      logger.error({ error, source, destination }, 'Failed to copy file')
      
      return err({
        type: 'IO_ERROR',
        message: `Failed to copy: ${error instanceof Error ? error.message : String(error)}`,
        path: source,
      })
    }
  }
  
  /**
   * 移动文件
   */
  async move(
    source: string,
    destination: string,
    options?: MoveOptions,
  ): Promise<Result<FileMetadata, StorageError>> {
    try {
      const srcPath = this.resolvePath(source)
      const destPath = this.resolvePath(destination)
      
      // 检查目标是否存在
      if (!options?.overwrite) {
        try {
          await fs.access(destPath)
          return err({
            type: 'ALREADY_EXISTS',
            message: `Destination already exists: ${destination}`,
            path: destination,
          })
        }
        catch {
          // 目标不存在，可以移动
        }
      }
      
      // 确保目标目录存在
      await fs.mkdir(path.dirname(destPath), { recursive: true, mode: this.directoryMode })
      
      // 移动文件
      await fs.rename(srcPath, destPath)
      
      return this.getMetadata(destination)
    }
    catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return err({
          type: 'NOT_FOUND',
          message: `Source not found: ${source}`,
          path: source,
        })
      }
      
      logger.error({ error, source, destination }, 'Failed to move file')
      
      return err({
        type: 'IO_ERROR',
        message: `Failed to move: ${error instanceof Error ? error.message : String(error)}`,
        path: source,
      })
    }
  }
  
  /**
   * 列出目录内容
   */
  async list(dirPath: string, options?: ListOptions): Promise<Result<ListResult, StorageError>> {
    try {
      const fullPath = this.resolvePath(dirPath)
      const files: FileMetadata[] = []
      const directories: { path: string; name: string; createdAt: Date }[] = []
      
      const entries = await fs.readdir(fullPath, { withFileTypes: true })
      
      for (const entry of entries) {
        // 应用前缀过滤
        if (options?.prefix && !entry.name.startsWith(options.prefix)) {
          continue
        }
        
        const entryPath = path.join(dirPath, entry.name).replace(/\\/g, '/')
        
        if (entry.isFile()) {
          const metaResult = await this.getMetadata(entryPath)
          if (metaResult.isOk()) {
            files.push(metaResult.value)
          }
        }
        else if (entry.isDirectory()) {
          const stats = await fs.stat(path.join(fullPath, entry.name))
          directories.push({
            path: entryPath,
            name: entry.name,
            createdAt: stats.birthtime,
          })
          
          // 递归列出
          if (options?.recursive) {
            const subResult = await this.list(entryPath, options)
            if (subResult.isOk()) {
              files.push(...subResult.value.files)
              directories.push(...subResult.value.directories)
            }
          }
        }
      }
      
      // 应用分页
      let resultFiles = files
      let resultDirs = directories
      
      if (options?.limit) {
        const startIndex = options.cursor ? parseInt(options.cursor, 10) : 0
        resultFiles = files.slice(startIndex, startIndex + options.limit)
        resultDirs = directories.slice(
          Math.max(0, startIndex - files.length),
          Math.max(0, startIndex - files.length + options.limit - resultFiles.length),
        )
      }
      
      return ok({
        files: resultFiles,
        directories: resultDirs,
        hasMore: options?.limit ? (files.length + directories.length) > (options.cursor ? parseInt(options.cursor, 10) : 0) + (options.limit || 0) : false,
        nextCursor: options?.limit ? String((options.cursor ? parseInt(options.cursor, 10) : 0) + (options.limit || 0)) : undefined,
      })
    }
    catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return err({
          type: 'NOT_FOUND',
          message: `Directory not found: ${dirPath}`,
          path: dirPath,
        })
      }
      
      logger.error({ error, path: dirPath }, 'Failed to list directory')
      
      return err({
        type: 'IO_ERROR',
        message: `Failed to list: ${error instanceof Error ? error.message : String(error)}`,
        path: dirPath,
      })
    }
  }
  
  /**
   * 创建目录
   */
  async createDirectory(dirPath: string): Promise<Result<void, StorageError>> {
    try {
      const fullPath = this.resolvePath(dirPath)
      await fs.mkdir(fullPath, { recursive: true, mode: this.directoryMode })
      
      return ok(undefined)
    }
    catch (error) {
      logger.error({ error, path: dirPath }, 'Failed to create directory')
      
      return err({
        type: 'IO_ERROR',
        message: `Failed to create directory: ${error instanceof Error ? error.message : String(error)}`,
        path: dirPath,
      })
    }
  }
  
  /**
   * 删除目录
   */
  async deleteDirectory(dirPath: string, recursive = false): Promise<Result<void, StorageError>> {
    try {
      const fullPath = this.resolvePath(dirPath)
      
      if (recursive) {
        await fs.rm(fullPath, { recursive: true, force: true })
      }
      else {
        await fs.rmdir(fullPath)
      }
      
      return ok(undefined)
    }
    catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return err({
          type: 'NOT_FOUND',
          message: `Directory not found: ${dirPath}`,
          path: dirPath,
        })
      }
      
      if (isNodeError(error) && error.code === 'ENOTEMPTY') {
        return err({
          type: 'IO_ERROR',
          message: `Directory not empty: ${dirPath}`,
          path: dirPath,
        })
      }
      
      logger.error({ error, path: dirPath }, 'Failed to delete directory')
      
      return err({
        type: 'IO_ERROR',
        message: `Failed to delete directory: ${error instanceof Error ? error.message : String(error)}`,
        path: dirPath,
      })
    }
  }
}

/**
 * 创建本地存储驱动
 */
export function createLocalStorageDriver(options: LocalStorageOptions): LocalStorageDriver {
  return new LocalStorageDriver(options)
}

/**
 * 检查是否为 Node.js 错误
 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
