/**
 * =============================================================================
 * @hai/storage - 内存存储驱动
 * =============================================================================
 * 基于内存的存储实现，适用于测试和缓存
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { createLogger, err, ok } from '@hai/core'
import { lookup as mimeLookup } from './mime.js'
import type {
  CopyOptions,
  DirectoryMetadata,
  DownloadOptions,
  FileMetadata,
  ListOptions,
  ListResult,
  MemoryStorageOptions,
  MoveOptions,
  StorageDriver,
  StorageError,
  UploadOptions,
} from './types.js'

const logger = createLogger({ name: 'storage-memory' })

/**
 * 内存文件条目
 */
interface MemoryFileEntry {
  data: Uint8Array
  metadata: FileMetadata
}

/**
 * 内存存储驱动
 */
export class MemoryStorageDriver implements StorageDriver {
  readonly name = 'memory'
  private files: Map<string, MemoryFileEntry> = new Map()
  private directories: Set<string> = new Set()
  private maxSize: number
  private currentSize: number = 0
  
  constructor(options: MemoryStorageOptions = {}) {
    this.maxSize = options.maxSize ?? Infinity
    this.directories.add('/') // 根目录
    
    logger.info({ maxSize: this.maxSize }, 'Memory storage driver initialized')
  }
  
  /**
   * 规范化路径
   */
  private normalizePath(filePath: string): string {
    // 确保以 / 开头
    const normalized = '/' + filePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
    return normalized
  }
  
  /**
   * 获取父目录
   */
  private getParentDir(filePath: string): string {
    const parts = filePath.split('/')
    parts.pop()
    return parts.join('/') || '/'
  }
  
  /**
   * 获取文件名
   */
  private getFileName(filePath: string): string {
    const parts = filePath.split('/')
    return parts[parts.length - 1]
  }
  
  /**
   * 检查文件是否存在
   */
  async exists(filePath: string): Promise<Result<boolean, StorageError>> {
    const normalized = this.normalizePath(filePath)
    return ok(this.files.has(normalized))
  }
  
  /**
   * 获取文件元数据
   */
  async getMetadata(filePath: string): Promise<Result<FileMetadata, StorageError>> {
    const normalized = this.normalizePath(filePath)
    const entry = this.files.get(normalized)
    
    if (!entry) {
      return err({
        type: 'NOT_FOUND',
        message: `File not found: ${filePath}`,
        path: filePath,
      })
    }
    
    return ok({ ...entry.metadata })
  }
  
  /**
   * 读取文件
   */
  async read(filePath: string, _options?: DownloadOptions): Promise<Result<Uint8Array, StorageError>> {
    const normalized = this.normalizePath(filePath)
    const entry = this.files.get(normalized)
    
    if (!entry) {
      return err({
        type: 'NOT_FOUND',
        message: `File not found: ${filePath}`,
        path: filePath,
      })
    }
    
    return ok(new Uint8Array(entry.data))
  }
  
  /**
   * 读取文件为文本
   */
  async readText(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<Result<string, StorageError>> {
    const readResult = await this.read(filePath)
    
    if (readResult.isErr()) {
      return err(readResult.error)
    }
    
    const decoder = new TextDecoder(encoding)
    return ok(decoder.decode(readResult.value))
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
    const normalized = this.normalizePath(filePath)
    
    // 检查是否已存在
    if (!options?.overwrite && this.files.has(normalized)) {
      return err({
        type: 'ALREADY_EXISTS',
        message: `File already exists: ${filePath}`,
        path: filePath,
      })
    }
    
    // 转换数据
    const bytes = typeof data === 'string'
      ? new TextEncoder().encode(data)
      : new Uint8Array(data)
    
    // 检查配额
    const existingEntry = this.files.get(normalized)
    const newSize = this.currentSize - (existingEntry?.data.length ?? 0) + bytes.length
    
    if (newSize > this.maxSize) {
      return err({
        type: 'QUOTA_EXCEEDED',
        message: `Storage quota exceeded (max: ${this.maxSize} bytes)`,
        path: filePath,
      })
    }
    
    // 确保父目录存在
    this.ensureDirectoryExists(this.getParentDir(normalized))
    
    const now = new Date()
    const metadata: FileMetadata = {
      path: filePath,
      name: this.getFileName(normalized),
      size: bytes.length,
      mimeType: options?.contentType ?? mimeLookup(filePath),
      createdAt: existingEntry?.metadata.createdAt ?? now,
      updatedAt: now,
      customMetadata: options?.metadata,
    }
    
    this.files.set(normalized, { data: bytes, metadata })
    this.currentSize = newSize
    
    return ok(metadata)
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
    const normalized = this.normalizePath(filePath)
    const entry = this.files.get(normalized)
    
    // 转换新数据
    const newBytes = typeof data === 'string'
      ? new TextEncoder().encode(data)
      : new Uint8Array(data)
    
    if (entry) {
      // 追加到现有文件
      const combinedSize = entry.data.length + newBytes.length
      
      if (this.currentSize - entry.data.length + combinedSize > this.maxSize) {
        return err({
          type: 'QUOTA_EXCEEDED',
          message: `Storage quota exceeded`,
          path: filePath,
        })
      }
      
      const combined = new Uint8Array(combinedSize)
      combined.set(entry.data, 0)
      combined.set(newBytes, entry.data.length)
      
      entry.data = combined
      entry.metadata.size = combinedSize
      entry.metadata.updatedAt = new Date()
      this.currentSize = this.currentSize - entry.data.length + combinedSize
    }
    else {
      // 创建新文件
      const writeResult = await this.write(filePath, newBytes, { overwrite: true })
      if (writeResult.isErr()) {
        return err(writeResult.error)
      }
    }
    
    return ok(undefined)
  }
  
  /**
   * 删除文件
   */
  async delete(filePath: string): Promise<Result<void, StorageError>> {
    const normalized = this.normalizePath(filePath)
    const entry = this.files.get(normalized)
    
    if (!entry) {
      return err({
        type: 'NOT_FOUND',
        message: `File not found: ${filePath}`,
        path: filePath,
      })
    }
    
    this.files.delete(normalized)
    this.currentSize -= entry.data.length
    
    return ok(undefined)
  }
  
  /**
   * 复制文件
   */
  async copy(
    source: string,
    destination: string,
    options?: CopyOptions,
  ): Promise<Result<FileMetadata, StorageError>> {
    const srcNormalized = this.normalizePath(source)
    const entry = this.files.get(srcNormalized)
    
    if (!entry) {
      return err({
        type: 'NOT_FOUND',
        message: `Source not found: ${source}`,
        path: source,
      })
    }
    
    return this.write(destination, entry.data, {
      overwrite: options?.overwrite,
      metadata: options?.preserveMetadata ? entry.metadata.customMetadata : undefined,
    })
  }
  
  /**
   * 移动文件
   */
  async move(
    source: string,
    destination: string,
    options?: MoveOptions,
  ): Promise<Result<FileMetadata, StorageError>> {
    const copyResult = await this.copy(source, destination, { overwrite: options?.overwrite })
    
    if (copyResult.isErr()) {
      return err(copyResult.error)
    }
    
    await this.delete(source)
    
    return ok(copyResult.value)
  }
  
  /**
   * 列出目录内容
   */
  async list(dirPath: string, options?: ListOptions): Promise<Result<ListResult, StorageError>> {
    const normalized = this.normalizePath(dirPath)
    
    if (!this.directories.has(normalized) && normalized !== '/') {
      return err({
        type: 'NOT_FOUND',
        message: `Directory not found: ${dirPath}`,
        path: dirPath,
      })
    }
    
    const files: FileMetadata[] = []
    const directories: DirectoryMetadata[] = []
    const prefix = normalized === '/' ? '/' : normalized + '/'
    
    // 收集文件
    for (const [path, entry] of this.files) {
      if (!path.startsWith(prefix)) continue
      
      const relativePath = path.slice(prefix.length)
      
      // 非递归模式：只包含直接子项
      if (!options?.recursive && relativePath.includes('/')) continue
      
      // 应用前缀过滤
      if (options?.prefix && !entry.metadata.name.startsWith(options.prefix)) continue
      
      files.push({ ...entry.metadata })
    }
    
    // 收集目录
    for (const dir of this.directories) {
      if (!dir.startsWith(prefix) || dir === normalized) continue
      
      const relativePath = dir.slice(prefix.length)
      
      // 非递归模式：只包含直接子目录
      if (!options?.recursive && relativePath.includes('/')) continue
      
      const dirName = relativePath.split('/')[0]
      
      // 应用前缀过滤
      if (options?.prefix && !dirName.startsWith(options.prefix)) continue
      
      // 避免重复
      if (!directories.some(d => d.name === dirName)) {
        directories.push({
          path: prefix + dirName,
          name: dirName,
          createdAt: new Date(),
        })
      }
    }
    
    // 应用分页
    let resultFiles = files
    if (options?.limit) {
      const startIndex = options.cursor ? parseInt(options.cursor, 10) : 0
      resultFiles = files.slice(startIndex, startIndex + options.limit)
    }
    
    return ok({
      files: resultFiles,
      directories,
      hasMore: options?.limit ? files.length > (options.cursor ? parseInt(options.cursor, 10) : 0) + (options.limit || 0) : false,
      nextCursor: options?.limit ? String((options.cursor ? parseInt(options.cursor, 10) : 0) + (options.limit || 0)) : undefined,
    })
  }
  
  /**
   * 创建目录
   */
  async createDirectory(dirPath: string): Promise<Result<void, StorageError>> {
    const normalized = this.normalizePath(dirPath)
    this.ensureDirectoryExists(normalized)
    return ok(undefined)
  }
  
  /**
   * 删除目录
   */
  async deleteDirectory(dirPath: string, recursive = false): Promise<Result<void, StorageError>> {
    const normalized = this.normalizePath(dirPath)
    
    if (!this.directories.has(normalized)) {
      return err({
        type: 'NOT_FOUND',
        message: `Directory not found: ${dirPath}`,
        path: dirPath,
      })
    }
    
    const prefix = normalized + '/'
    
    // 检查是否有内容
    const hasContent = Array.from(this.files.keys()).some(p => p.startsWith(prefix))
      || Array.from(this.directories).some(d => d.startsWith(prefix))
    
    if (hasContent && !recursive) {
      return err({
        type: 'IO_ERROR',
        message: `Directory not empty: ${dirPath}`,
        path: dirPath,
      })
    }
    
    if (recursive) {
      // 删除所有子文件
      for (const [path, entry] of this.files) {
        if (path.startsWith(prefix)) {
          this.files.delete(path)
          this.currentSize -= entry.data.length
        }
      }
      
      // 删除所有子目录
      for (const dir of this.directories) {
        if (dir.startsWith(prefix)) {
          this.directories.delete(dir)
        }
      }
    }
    
    this.directories.delete(normalized)
    
    return ok(undefined)
  }
  
  /**
   * 确保目录存在
   */
  private ensureDirectoryExists(dirPath: string): void {
    const parts = dirPath.split('/').filter(Boolean)
    let current = ''
    
    for (const part of parts) {
      current += '/' + part
      this.directories.add(current)
    }
  }
  
  /**
   * 清空存储
   */
  clear(): void {
    this.files.clear()
    this.directories.clear()
    this.directories.add('/')
    this.currentSize = 0
  }
  
  /**
   * 获取当前使用大小
   */
  get usedSize(): number {
    return this.currentSize
  }
  
  /**
   * 获取文件数量
   */
  get fileCount(): number {
    return this.files.size
  }
}

/**
 * 创建内存存储驱动
 */
export function createMemoryStorageDriver(options?: MemoryStorageOptions): MemoryStorageDriver {
  return new MemoryStorageDriver(options)
}
