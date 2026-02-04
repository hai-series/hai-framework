/**
 * =============================================================================
 * @hai/core - Core 服务聚合（Node.js）
 * =============================================================================
 * 提供统一的 core 对象，聚合常用功能
 * 所有功能统一通过 core 对象访问
 *
 * @example
 * ```ts
 * import { core } from '@hai/core'
 *
 * // 约定优于配置模式（推荐）
 * core.init({ configDir: './config' })
 *
 * // 配置文件命名约定：
 * // - _db.yml     → 自动使用 DbConfigSchema
 * // - _cache.yml  → 自动使用 CacheConfigSchema
 * // - _iam.yml    → 自动使用 IamConfigSchema
 * // - app.yml     → key 为 'app'，需在 schemas 中指定
 *
 * // 日志
 * core.logger.info('Hello')
 *
 * // ID 生成
 * const myId = core.id.generate()
 *
 * // 配置管理
 * const dbConfig = core.config.get('db')
 * ```
 * =============================================================================
 */

import type { ZodSchema } from 'zod'
import type { BuiltinConfigModule, ConfigLoadItem, CoreOptions } from './core-types.js'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { CoreConfigSchema } from './config/index.js'
import { createCore } from './core-main.js'
import { config, unwatchConfig, watchConfig } from './functions/core-function-config.js'
import { configureLogger, createLogger, getLogger, getLogLevel, setLogLevel } from './functions/core-function-logger.node.js'

// =============================================================================
// 内置模块 Schema 注册表
// =============================================================================

/**
 * 内置模块 Schema 映射
 * key 为文件名前缀（不含 _），value 为对应的 Zod Schema
 */
const builtinSchemas: Record<BuiltinConfigModule, ZodSchema | null> = {
  core: CoreConfigSchema,
  db: null, // 延迟加载，避免循环依赖
  cache: null,
  iam: null,
  storage: null,
  ai: null,
  crypto: null,
}

/**
 * 注册内置模块的 Schema（供其他模块调用）
 */
export function registerBuiltinSchema(module: BuiltinConfigModule, schema: ZodSchema): void {
  builtinSchemas[module] = schema
}

/**
 * 获取内置模块的 Schema
 */
function getBuiltinSchema(module: string): ZodSchema | null {
  return builtinSchemas[module as BuiltinConfigModule] ?? null
}

// =============================================================================
// Core 实例
// =============================================================================

/**
 * 创建 Node.js 版本的 core 对象
 */
function createNodeCore() {
  const baseCore = createCore({
    createLogger,
    getLogger,
    configureLogger,
    setLogLevel,
    getLogLevel,
  })

  // 扩展 config 和 init 功能
  return {
    ...baseCore,
    /** 配置管理 */
    config,
    /** 初始化 Core */
    init: initCore,
    /** 注册内置模块 Schema */
    registerBuiltinSchema,
  }
}

/**
 * Core 服务对象 - 聚合常用功能
 */
export const core = createNodeCore()

// =============================================================================
// Initialization
// =============================================================================

/**
 * 扫描配置目录并构建配置加载项列表
 */
function scanConfigDir(
  configDir: string,
  schemas?: Record<string, ZodSchema>,
  silent?: boolean,
): ConfigLoadItem[] {
  const logger = core.logger
  const items: ConfigLoadItem[] = []

  if (!existsSync(configDir)) {
    if (!silent) {
      logger.warn(`[core] Config directory not found: ${configDir}`)
    }
    return items
  }

  const files = readdirSync(configDir).filter(f =>
    f.endsWith('.yml') || f.endsWith('.yaml'),
  )

  for (const file of files) {
    const filePath = join(configDir, file)
    const baseName = file.replace(/\.ya?ml$/, '')

    // 判断是否为内置模块配置（以 _ 开头）
    if (baseName.startsWith('_')) {
      const moduleName = baseName.slice(1) // 去掉 _ 前缀
      const schema = getBuiltinSchema(moduleName)

      if (schema) {
        items.push({
          name: moduleName,
          filePath,
          schema,
        })
      }
      else {
        if (!silent) {
          logger.warn(`[core] Unknown builtin config: ${file}, skipped`)
        }
      }
    }
    else {
      // 业务配置（文件名作为配置名）
      const schema = schemas?.[baseName]
      if (schema) {
        items.push({
          name: baseName,
          filePath,
          schema,
        })
      }
      else {
        // 没有 schema 时，仍然加载但不验证（返回原始数据）
        if (!silent) {
          logger.debug(`[core] No schema for config: ${file}, loading without validation`)
        }
        // 使用一个宽松的 schema
        items.push({
          name: baseName,
          filePath,
          schema: { parse: (x: unknown) => x, safeParse: (x: unknown) => ({ success: true, data: x }) } as unknown as ZodSchema,
        })
      }
    }
  }

  return items
}

/**
 * 初始化 Core（内部实现，通过 core.init() 调用）
 */
function initCore(options: CoreOptions = {}): void {
  const startTime = Date.now()
  const silent = options.silent ?? false
  const logger = core.logger

  // 1. Configure logging
  if (options.logging) {
    core.configureLogger(options.logging)
  }

  if (!silent) {
    logger.info('[core] Initializing...')
  }

  // 2. 确定配置加载项
  let configItems: ConfigLoadItem[] = []

  if (options.configDir) {
    // 约定优于配置模式
    configItems = scanConfigDir(options.configDir, options.schemas, silent)
  }
  else if (options.configs && options.configs.length > 0) {
    // 显式模式
    configItems = options.configs
  }

  // 3. Load config files
  for (const item of configItems) {
    const result = config.load(item.name, item.filePath, item.schema)
    if (result.success) {
      if (!silent) {
        logger.info(`[core] Config loaded: ${item.name} <- ${item.filePath}`)
      }
      // Register change callback
      if (item.onChange) {
        config.onChange(item.name, item.onChange)
      }
    }
    else {
      logger.error(`[core] Config load failed: ${item.name}`, {
        error: result.error,
      })
    }
  }

  // 4. Enable config file watching
  if (options.watchConfig && configItems.length > 0) {
    setupConfigWatch(configItems, silent)
  }

  if (!silent) {
    const duration = Date.now() - startTime
    logger.info(`[core] Initialized (${duration}ms)`)
  }
}

/**
 * Setup config file watching
 */
function setupConfigWatch(configs: ConfigLoadItem[], silent: boolean): void {
  const logger = core.logger

  for (const item of configs) {
    const success = watchConfig(item.name, (name, reloadSuccess, error) => {
      if (reloadSuccess) {
        if (!silent) {
          logger.info(`[core] Config reloaded: ${name}`)
        }
      }
      else {
        logger.error(`[core] Config reload failed: ${name}`, { error })
      }
    })

    if (success && !silent) {
      logger.debug(`[core] Config watch enabled: ${item.name}`)
    }
    else if (!success) {
      logger.warn(`[core] Cannot watch config: ${item.filePath}`)
    }
  }
}

/**
 * Stop config file watching
 */
export function stopConfigWatch(name?: string): void {
  unwatchConfig(name)
}

// Re-export types
export type { ConfigLoadItem, CoreOptions } from './core-types.js'
