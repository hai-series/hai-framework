/**
 * @h-ai/core — Core 服务聚合（Node.js）
 *
 * 提供 Node.js 环境的 core 对象，聚合常用功能。 所有功能统一通过 core 对象访问，并提供配置加载能力。
 * @module core-main.node
 */

import type { CoreOptions } from './core-types.js'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { CoreConfigSchema } from './core-config.js'
import { createCore } from './core-main.js'
import { config } from './functions/core-function-config.js'
import { logger } from './functions/core-function-logger.node.js'

// ─── Core 实例 ───

/**
 * 创建 Node.js 版本的 core 对象。
 *
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * core.logger.info('ready')
 * ```
 */
function createNodeCore() {
  const baseCore = createCore({
    createLogger: logger.createLogger,
    getLogger: logger.getLogger,
    configureLogger: logger.configureLogger,
    setLogLevel: logger.setLogLevel,
    getLogLevel: logger.getLogLevel,
  })

  // 扩展 config 和 init 功能
  return {
    ...baseCore,
    /** 配置管理 */
    config,
    /** 初始化 Core */
    init: initCore,
  }
}

/**
 * Core 服务对象 - 聚合常用功能（Node.js）。
 *
 * @example
 * ```ts
 * import { core } from '@h-ai/core'
 * core.init({ configDir: './config' })
 * ```
 */
export const core = createNodeCore()

// ─── Initialization ───

/**
 * 配置加载项（描述单个待加载的配置文件）。
 */
interface ConfigLoadItem {
  /** 配置名称（用作缓存 key，如 'core'、'db'、'app'） */
  name: string
  /** 配置文件绝对路径 */
  filePath: string
}

/**
 * 扫描配置目录并构建配置加载项列表。
 *
 * 约定：
 * - 以 `_` 开头的文件为内置模块配置（如 `_core.yml` → name='core'）
 * - 其他文件为业务配置（如 `app.yml` → name='app'）
 *
 * @param configDir - 配置目录路径
 * @returns 配置加载项列表；目录不存在时返回空数组并输出警告
 *
 * @example
 * ```ts
 * const items = scanConfigDir('./config')
 * // [{ name: 'core', filePath: './config/_core.yml' }, { name: 'app', filePath: './config/app.yml' }]
 * ```
 */
function scanConfigDir(
  configDir: string,
): ConfigLoadItem[] {
  const logger = core.logger
  const items: ConfigLoadItem[] = []

  if (!existsSync(configDir)) {
    logger.warn(`[core] Config directory not found: ${configDir}`)
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
      items.push({
        name: moduleName,
        filePath,
      })
    }
    else {
      // 业务配置（文件名作为配置名）
      items.push({
        name: baseName,
        filePath,
      })
    }
  }
  return items
}

/**
 * 初始化 Core（内部实现，通过 `core.init()` 调用）。
 *
 * 执行流程：
 * 1. 配置日志（若提供 `options.logging`）
 * 2. 扫描并加载配置目录中的所有 YAML 文件
 * 3. 启用配置文件监听（若 `options.watchConfig` 为 true）
 *
 * @param options - 初始化选项
 *
 * @example
 * ```ts
 * core.init({ configDir: './config', watchConfig: true })
 * ```
 */
function initCore(options: CoreOptions = {}): void {
  const startTime = Date.now()
  const logger = core.logger

  // 1. Configure logging
  if (options.logging) {
    core.configureLogger(options.logging)
  }

  logger.info('[core] Initializing...')

  let configItems: ConfigLoadItem[] = []

  if (options.configDir) {
    // 约定优于配置模式
    configItems = scanConfigDir(options.configDir)
  }

  // 2. Load config files
  for (const item of configItems) {
    if (item.name === 'core') {
      const result = config.load(item.name, item.filePath, CoreConfigSchema)
      if (result.success) {
        if (!options.logging) {
          core.configureLogger(result.data.logging || {})
        }
        logger.info(`[core] Config loaded: ${item.name} <- ${item.filePath}`)
      }
      else {
        logger.error(`[core] Config load failed: ${item.name}`, {
          error: result.error,
        })
      }
    }
    else {
      const result = config.load(item.name, item.filePath)
      if (result.success) {
        logger.info(`[core] Config loaded: ${item.name} <- ${item.filePath}`)
      }
      else {
        logger.error(`[core] Config load failed: ${item.name}`, {
          error: result.error,
        })
      }
    }
  }

  // 3. Enable config file watching
  if (options.watchConfig && configItems.length > 0) {
    setupConfigWatch(configItems)
  }

  const duration = Date.now() - startTime
  logger.info(`[core] Initialized (${duration}ms)`)
}

/**
 * 启用配置文件监听。
 *
 * 为每个已加载的配置项注册文件 watcher，变更时自动重载并输出日志。
 *
 * @param configs - 需要监听的配置项列表
 */
function setupConfigWatch(configs: ConfigLoadItem[]): void {
  const logger = core.logger

  for (const item of configs) {
    config.watch(item.name, (_config, error) => {
      if (error) {
        logger.error(`[core] Config reload failed: ${item.name}`, { error })
        return
      }
      logger.info(`[core] Config reloaded: ${item.name}`)
    })

    logger.debug(`[core] Config watch enabled: ${item.name}`)
  }
}
