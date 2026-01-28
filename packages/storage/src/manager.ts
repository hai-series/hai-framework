/**
 * =============================================================================
 * @hai/storage - 存储管理器
 * =============================================================================
 * 统一存储管理，支持多驱动切换
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { createLogger, err } from '@hai/core'
import { createLocalStorageDriver } from './local.js'
import { createMemoryStorageDriver } from './memory.js'
import type {
  CopyOptions,
  DownloadOptions,
  FileMetadata,
  ListOptions,
  ListResult,
  LocalStorageOptions,
  MemoryStorageOptions,
  MoveOptions,
  StorageConfig,
  StorageDriver,
  StorageError,
  UploadOptions,
} from './types.js'

const logger = createLogger({ name: 'storage-manager' })

/**
 * 存储管理器
 * 
 * 提供统一的存储接口，支持多种存储驱动
 */
export class StorageManager implements StorageDriver {
  readonly name = 'manager'
  private driver: StorageDriver
  private config: StorageConfig
  
  constructor(config: StorageConfig) {
    this.config = config
    this.driver = this.createDriver(config)
    
    logger.info({ driver: config.driver }, 'Storage manager initialized')
  }
  
  /**
   * 创建存储驱动
   */
  private createDriver(config: StorageConfig): StorageDriver {
    switch (config.driver) {
      case 'local':
        return createLocalStorageDriver(config.options as LocalStorageOptions)
      case 'memory':
        return createMemoryStorageDriver(config.options as MemoryStorageOptions)
      case 's3':
        // S3 驱动需要额外实现
        throw new Error('S3 driver not implemented yet')
      default:
        throw new Error(`Unknown storage driver: ${config.driver}`)
    }
  }
  
  /**
   * 获取当前驱动
   */
  getDriver(): StorageDriver {
    return this.driver
  }
  
  /**
   * 获取配置
   */
  getConfig(): StorageConfig {
    return { ...this.config }
  }
  
  /**
   * 切换驱动
   */
  switchDriver(config: StorageConfig): void {
    this.driver = this.createDriver(config)
    this.config = config
    
    logger.info({ driver: config.driver }, 'Storage driver switched')
  }
  
  // ========== 委托方法 ==========
  
  async exists(path: string): Promise<Result<boolean, StorageError>> {
    return this.driver.exists(path)
  }
  
  async getMetadata(path: string): Promise<Result<FileMetadata, StorageError>> {
    return this.driver.getMetadata(path)
  }
  
  async read(path: string, options?: DownloadOptions): Promise<Result<Uint8Array, StorageError>> {
    return this.driver.read(path, options)
  }
  
  async readText(path: string, encoding?: BufferEncoding): Promise<Result<string, StorageError>> {
    return this.driver.readText(path, encoding)
  }
  
  async readJson<T = unknown>(path: string): Promise<Result<T, StorageError>> {
    return this.driver.readJson<T>(path)
  }
  
  async write(
    path: string,
    data: Uint8Array | string,
    options?: UploadOptions,
  ): Promise<Result<FileMetadata, StorageError>> {
    return this.driver.write(path, data, options)
  }
  
  async writeJson(
    path: string,
    data: unknown,
    options?: UploadOptions,
  ): Promise<Result<FileMetadata, StorageError>> {
    return this.driver.writeJson(path, data, options)
  }
  
  async append(path: string, data: Uint8Array | string): Promise<Result<void, StorageError>> {
    return this.driver.append(path, data)
  }
  
  async delete(path: string): Promise<Result<void, StorageError>> {
    return this.driver.delete(path)
  }
  
  async copy(
    source: string,
    destination: string,
    options?: CopyOptions,
  ): Promise<Result<FileMetadata, StorageError>> {
    return this.driver.copy(source, destination, options)
  }
  
  async move(
    source: string,
    destination: string,
    options?: MoveOptions,
  ): Promise<Result<FileMetadata, StorageError>> {
    return this.driver.move(source, destination, options)
  }
  
  async list(path: string, options?: ListOptions): Promise<Result<ListResult, StorageError>> {
    return this.driver.list(path, options)
  }
  
  async createDirectory(path: string): Promise<Result<void, StorageError>> {
    return this.driver.createDirectory(path)
  }
  
  async deleteDirectory(path: string, recursive?: boolean): Promise<Result<void, StorageError>> {
    return this.driver.deleteDirectory(path, recursive)
  }
  
  async getSignedUrl(
    path: string,
    options: { expiresIn: number; method?: 'GET' | 'PUT' },
  ): Promise<Result<string, StorageError>> {
    if (this.driver.getSignedUrl) {
      return this.driver.getSignedUrl(path, options)
    }
    
    return err({
      type: 'IO_ERROR',
      message: 'Signed URLs not supported by this driver',
      path,
    })
  }
}

/**
 * 创建存储管理器
 * 
 * @param config - 存储配置
 */
export function createStorageManager(config: StorageConfig): StorageManager {
  return new StorageManager(config)
}

/**
 * 创建本地存储管理器
 * 
 * @param root - 根目录
 */
export function createLocalStorage(root: string): StorageManager {
  return createStorageManager({
    driver: 'local',
    options: { root },
  })
}

/**
 * 创建内存存储管理器
 * 
 * @param maxSize - 最大大小 (bytes)
 */
export function createMemoryStorage(maxSize?: number): StorageManager {
  return createStorageManager({
    driver: 'memory',
    options: { maxSize },
  })
}

// 单例管理
let defaultStorage: StorageManager | null = null

/**
 * 获取默认存储管理器
 */
export function getStorage(): StorageManager {
  if (!defaultStorage) {
    throw new Error('Storage not initialized. Call initStorage() first.')
  }
  return defaultStorage
}

/**
 * 初始化默认存储
 */
export function initStorage(config: StorageConfig): StorageManager {
  defaultStorage = createStorageManager(config)
  return defaultStorage
}

/**
 * 重置默认存储
 */
export function resetStorage(): void {
  defaultStorage = null
}
