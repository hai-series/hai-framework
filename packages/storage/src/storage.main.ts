/**
 * =============================================================================
 * @hai/storage - 统一存储服务
 * =============================================================================
 * 提供统一的存储 API，支持多种 provider
 * =============================================================================
 */

import type {
    DirectoryProvider,
    FileProvider,
    StorageDriver,
    StorageService,
    StorageServiceConfig,
    UrlProvider,
} from './storage-types.js'

import {
    createHaiDirectoryProvider,
    createHaiFileProvider,
    createHaiStorageDriver,
    createHaiUrlProvider,
} from './provider/hai/storage-hai-provider.js'

// =============================================================================
// 默认配置
// =============================================================================

const defaultConfig: StorageServiceConfig = {
    provider: 'hai',
    driver: 'memory',
    options: {
        maxSize: 100 * 1024 * 1024, // 100MB
    },
}

// =============================================================================
// Provider 实例
// =============================================================================

let currentConfig: StorageServiceConfig = { ...defaultConfig }
let currentDriver: StorageDriver | null = null
let fileProvider: FileProvider | null = null
let dirProvider: DirectoryProvider | null = null
let urlProvider: UrlProvider | null = null

// =============================================================================
// Provider 工厂
// =============================================================================

function createDriver(config: StorageServiceConfig): StorageDriver {
    switch (config.provider) {
        case 'hai':
            return createHaiStorageDriver(config)
        case 'supabase':
        case 'firebase':
        case 's3':
        case 'gcs':
        case 'azure':
        case 'custom':
            // 可扩展其他实现
            return createHaiStorageDriver(config)
        default:
            return createHaiStorageDriver(config)
    }
}

// =============================================================================
// 初始化
// =============================================================================

function ensureInitialized() {
    if (!currentDriver) {
        currentDriver = createDriver(currentConfig)
    }
    if (!fileProvider) {
        fileProvider = createHaiFileProvider(currentDriver)
    }
    if (!dirProvider) {
        dirProvider = createHaiDirectoryProvider(currentDriver)
    }
    if (!urlProvider) {
        urlProvider = createHaiUrlProvider(currentDriver)
    }
}

// =============================================================================
// 统一存储服务
// =============================================================================

/**
 * 统一存储服务实例
 *
 * @example
 * ```typescript
 * import { storage } from '@hai/storage'
 *
 * // 初始化本地存储
 * await storage.init({
 *   driver: 'local',
 *   options: { root: './data' }
 * })
 *
 * // 文件操作
 * await storage.file.write('test.txt', 'Hello World')
 * const content = await storage.file.readText('test.txt')
 *
 * // 目录操作
 * await storage.dir.create('uploads')
 * const list = await storage.dir.list('/')
 *
 * // JSON 操作
 * await storage.file.writeJson('config.json', { key: 'value' })
 * const config = await storage.file.readJson('config.json')
 * ```
 */
export const storage: StorageService = {
    get file(): FileProvider {
        ensureInitialized()
        return fileProvider!
    },

    get dir(): DirectoryProvider {
        ensureInitialized()
        return dirProvider!
    },

    get url(): UrlProvider {
        ensureInitialized()
        return urlProvider!
    },

    get driver(): StorageDriver {
        ensureInitialized()
        return currentDriver!
    },

    get config(): StorageServiceConfig {
        return { ...currentConfig }
    },

    async init(config?: Partial<StorageServiceConfig>): Promise<void> {
        if (config) {
            currentConfig = { ...defaultConfig, ...config }
        }

        // 重新创建驱动和 providers
        currentDriver = createDriver(currentConfig)
        fileProvider = createHaiFileProvider(currentDriver)
        dirProvider = createHaiDirectoryProvider(currentDriver)
        urlProvider = createHaiUrlProvider(currentDriver)
    },
}

// =============================================================================
// 便捷函数导出
// =============================================================================

/**
 * 创建新的存储服务实例
 */
export function createStorageService(config?: Partial<StorageServiceConfig>): StorageService {
    const serviceConfig: StorageServiceConfig = { ...defaultConfig, ...config }
    const driver = createDriver(serviceConfig)
    const file = createHaiFileProvider(driver)
    const dir = createHaiDirectoryProvider(driver)
    const url = createHaiUrlProvider(driver)

    return {
        file,
        dir,
        url,
        driver,
        config: serviceConfig,
        async init(newConfig?: Partial<StorageServiceConfig>): Promise<void> {
            if (newConfig) {
                Object.assign(serviceConfig, newConfig)
            }
        },
    }
}
