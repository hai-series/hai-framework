/**
 * =============================================================================
 * @hai/config - 配置管理器
 * =============================================================================
 * 提供单例配置管理器，支持配置热重载
 * =============================================================================
 */

import type { Result } from '@hai/core'
import { createLogger, err, ok } from '@hai/core'
import type { ZodSchema } from 'zod'
import type { ConfigError, LoadConfigOptions } from './loader.js'
import { loadConfig, parseConfig } from './loader.js'

/** Logger for config manager */
const logger = createLogger({ name: 'config-manager' })

/**
 * 配置缓存项
 */
interface CacheEntry<T> {
    /** 配置数据 */
    data: T
    /** 加载时间 */
    loadedAt: number
    /** 加载选项 */
    options: LoadConfigOptions<T>
}

/**
 * 配置管理器
 * 
 * 提供配置的集中管理、缓存和热重载功能
 * 
 * @example
 * ```ts
 * const manager = ConfigManager.getInstance()
 * 
 * // 注册并加载配置
 * const result = manager.load({
 *   basePath: './config',
 *   name: 'app',
 *   schema: AppConfigSchema,
 * })
 * 
 * // 获取配置
 * const appConfig = manager.get<AppConfig>('app')
 * 
 * // 重载配置
 * manager.reload('app')
 * ```
 */
export class ConfigManager {
    private static instance: ConfigManager | null = null

    /** 配置缓存 */
    private cache: Map<string, CacheEntry<unknown>> = new Map()

    /** 配置变更监听器 */
    private listeners: Map<string, Set<(config: unknown) => void>> = new Map()

    private constructor() {
        logger.debug('ConfigManager initialized')
    }

    /**
     * 获取单例实例
     */
    static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager()
        }
        return ConfigManager.instance
    }

    /**
     * 重置单例（仅用于测试）
     */
    static resetInstance(): void {
        ConfigManager.instance = null
    }

    /**
     * 加载并注册配置
     * 
     * @param options - 加载选项
     * @returns 加载结果
     */
    load<T>(options: LoadConfigOptions<T>): Result<T, ConfigError> {
        const result = loadConfig(options)

        if (result.ok) {
            this.cache.set(options.name, {
                data: result.value,
                loadedAt: Date.now(),
                options: options as LoadConfigOptions<unknown>,
            })
            logger.info(`Config registered: ${options.name}`)
        }

        return result
    }

    /**
     * 直接设置配置（不从文件加载）
     * 
     * @param name - 配置名称
     * @param data - 配置数据
     * @param schema - 验证 schema
     * @returns 设置结果
     */
    set<T>(name: string, data: unknown, schema: ZodSchema<T>): Result<T, ConfigError> {
        const result = parseConfig(data, schema)

        if (result.ok) {
            this.cache.set(name, {
                data: result.value,
                loadedAt: Date.now(),
                options: {
                    basePath: '',
                    name,
                    schema,
                },
            })

            // 通知监听器
            this.notifyListeners(name, result.value)

            logger.info(`Config set directly: ${name}`)
        }

        return result
    }

    /**
     * 获取配置
     * 
     * @param name - 配置名称
     * @returns 配置数据，如果不存在返回 undefined
     */
    get<T>(name: string): T | undefined {
        const entry = this.cache.get(name)
        return entry?.data as T | undefined
    }

    /**
     * 获取配置（必须存在）
     * 
     * @param name - 配置名称
     * @returns 配置数据
     * @throws 如果配置不存在
     */
    require<T>(name: string): T {
        const config = this.get<T>(name)
        if (config === undefined) {
            throw new Error(`Config '${name}' not found. Make sure to load it first.`)
        }
        return config
    }

    /**
     * 检查配置是否已加载
     * 
     * @param name - 配置名称
     * @returns 是否已加载
     */
    has(name: string): boolean {
        return this.cache.has(name)
    }

    /**
     * 重载配置
     * 
     * @param name - 配置名称
     * @returns 重载结果
     */
    reload(name: string): Result<unknown, ConfigError> {
        const entry = this.cache.get(name)

        if (!entry) {
            return err({
                type: 'FILE_NOT_FOUND',
                message: `Config '${name}' not found in cache`,
            })
        }

        const result = loadConfig(entry.options)

        if (result.ok) {
            entry.data = result.value
            entry.loadedAt = Date.now()

            // 通知监听器
            this.notifyListeners(name, result.value)

            logger.info(`Config reloaded: ${name}`)
        }

        return result
    }

    /**
     * 重载所有配置
     * 
     * @returns 重载结果
     */
    reloadAll(): Result<void, ConfigError> {
        for (const name of this.cache.keys()) {
            const result = this.reload(name)
            if (!result.ok) {
                return result as Result<void, ConfigError>
            }
        }
        return ok(undefined)
    }

    /**
     * 监听配置变更
     * 
     * @param name - 配置名称
     * @param callback - 变更回调
     * @returns 取消监听函数
     */
    onChange<T>(name: string, callback: (config: T) => void): () => void {
        if (!this.listeners.has(name)) {
            this.listeners.set(name, new Set())
        }

        const listeners = this.listeners.get(name)!
        listeners.add(callback as (config: unknown) => void)

        return () => {
            listeners.delete(callback as (config: unknown) => void)
        }
    }

    /**
     * 通知配置变更
     * 
     * @param name - 配置名称
     * @param config - 新配置
     */
    private notifyListeners(name: string, config: unknown): void {
        const listeners = this.listeners.get(name)
        if (listeners) {
            for (const listener of listeners) {
                try {
                    listener(config)
                }
                catch (error) {
                    logger.error({ error }, `Error in config change listener for '${name}'`)
                }
            }
        }
    }

    /**
     * 获取配置加载时间
     * 
     * @param name - 配置名称
     * @returns 加载时间戳，如果不存在返回 undefined
     */
    getLoadedAt(name: string): number | undefined {
        return this.cache.get(name)?.loadedAt
    }

    /**
     * 获取所有已加载配置的名称
     * 
     * @returns 配置名称列表
     */
    getLoadedNames(): string[] {
        return Array.from(this.cache.keys())
    }

    /**
     * 清除配置缓存
     * 
     * @param name - 配置名称，如果不提供则清除所有
     */
    clear(name?: string): void {
        if (name) {
            this.cache.delete(name)
            this.listeners.delete(name)
            logger.info(`Config cleared: ${name}`)
        }
        else {
            this.cache.clear()
            this.listeners.clear()
            logger.info('All configs cleared')
        }
    }
}

/**
 * 获取配置管理器实例
 */
export function getConfigManager(): ConfigManager {
    return ConfigManager.getInstance()
}
