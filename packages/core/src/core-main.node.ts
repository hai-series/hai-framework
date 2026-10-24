/**
 * @h-ai/core — Core 服务聚合（Node.js）
 *
 * 提供 Node.js 环境的 core 对象，聚合常用功能。 所有功能统一通过 core 对象访问，并提供配置加载能力。
 * @module core-main.node
 */

import type { CoreFunctions, CoreOptions } from './core-types.js'
import { AsyncLocalStorage } from 'node:async_hooks'
import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { CoreConfigSchema } from './core-config.js'
import { createCore } from './core-main.js'
import { config } from './functions/core-function-config.node.js'
import { installRequestContext } from './functions/core-function-context.js'
import { logger } from './functions/core-function-logger.node.js'
import { installRequestLocales } from './i18n/core-i18n-utils.js'

// 请求语言跨 await 保持隔离，避免并行 SSR 修改另一个请求的默认语言。
installRequestLocales(new AsyncLocalStorage())
installRequestContext(new AsyncLocalStorage())

const YAML_EXTENSION_REGEX = /\.ya?ml$/
/**
 * Node 入口的 Core 扩展：提供文件配置和初始化；不是额外的公开工厂。
 * @example 模块内部上下文
 * ```ts
 * const tools: NodeCoreFunctions = core
 * tools.init({ logging: { level: 'info' } })
 * tools.logger.info('Core ready')
 * ```
 */
type NodeCoreFunctions = CoreFunctions & {
  readonly config: typeof config
  readonly init: typeof initCore
}

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
function createNodeCore(): NodeCoreFunctions {
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
    string: {
      ...baseCore.string,
      /**
       * Node 凭证比较使用原生恒时原语；不同长度直接失败，长度本身不受保护。
       * UTF-16LE 保留孤立代理项，避免 UTF-8 替换字符把两个不同字符串误判为相等。
       * @param a - 第一个原始字符串，不做 Unicode 归一化。
       * @param b - 第二个原始字符串，不做 Unicode 归一化。
       * @returns 字符串的 UTF-16 单元是否完全一致。
       * @example
       * ```ts
       * import { core } from '@h-ai/core'
       * const matches = core.string.constantTimeEqual('example-only', 'example-only')
       * ```
       */
      constantTimeEqual(a: string, b: string): boolean {
        return a.length === b.length && timingSafeEqual(Buffer.from(a, 'utf16le'), Buffer.from(b, 'utf16le'))
      },
    },
    /** Zod 校验错误 → i18n 消息映射工具（kit / serv / api-client 共享）。 */
    zodValidation: baseCore.zodValidation,
    /** 配置管理 */
    config,
    /** 初始化 Core */
    init: initCore,
  }
}

/**
 * Core 服务对象 - 聚合常用功能（Node.js）。
 * @example
 * ```ts
 * import { core, CoreConfigSchema } from '@h-ai/core'
 * core.init({ configDir: './config' }) // 单项加载失败记录日志并继续。
 * const required = core.config.validate('core', CoreConfigSchema)
 * if (!required.success) core.logger.error('Required config unavailable', { error: required.error })
 * else core.logger.info('Application ready', { name: required.data.name })
 * ```
 */
export const core: NodeCoreFunctions = createNodeCore()

// ─── Initialization ───

/**
 * 配置加载项（描述单个待加载的配置文件）。
 * @example 模块内部上下文
 * ```ts
 * const item: ConfigLoadItem = { name: 'core', filePath: join('/srv/app', 'config', '_core.yml') }
 * const cacheName = item.name
 * ```
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
 * - `_deploy.yml` / `_deploy.yaml` 留给部署 CLI 独立解析，不参与运行时加载和监听；业务 `deploy.yml` 不受影响
 *
 * @param configDir - 配置目录路径
 * @returns 配置加载项列表；目录不存在时返回空数组并输出警告
 * @throws 目录存在但不可读取等文件系统异常会向调用方传播。
 *
 * @example 模块内部上下文
 * ```ts
 * const items = scanConfigDir('./config')
 * core.logger.debug('Runtime configs selected', { names: items.map(item => item.name) })
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
    // 部署凭据由 CLI 按目标环境加载，不能要求应用启动时提供 SSH / 云平台参数。
    if (file === '_deploy.yml' || file === '_deploy.yaml')
      continue
    const filePath = join(configDir, file)
    const baseName = file.replace(YAML_EXTENSION_REGEX, '')

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
 * 2. 扫描并加载运行时 YAML，跳过保留部署文件 `_deploy.yml` / `_deploy.yaml`
 * 3. 启用配置文件监听（若 `options.watchConfig` 为 true）
 *
 * 单项 `config.load` 返回失败时记录日志并继续；必需配置由调用方 `config.validate` 并检查 success。
 *
 * @param options - 初始化选项
 * @throws 目录扫描、日志设置等异常仍会传播；不把单项配置的失败结果改为异常。
 *
 * @example 模块内部上下文
 * ```ts
 * core.init({ configDir: './config', watchConfig: true })
 * const required = core.config.validate('core', CoreConfigSchema)
 * if (!required.success) core.logger.error('Required config unavailable', { error: required.error })
 * ```
 */
function initCore(options: CoreOptions = {}): void {
  const startTime = Date.now()
  const logger = core.logger

  // 1. Configure logging
  if (options.logging) {
    core.logger.configure(options.logging)
  }

  let configItems: ConfigLoadItem[] = []

  if (options.configDir) {
    // 约定优于配置模式
    configItems = scanConfigDir(options.configDir)
  }

  // 先应用 core 的日志配置，避免其它配置加载日志使用初始化前的级别与格式。
  configItems.sort((left, right) => Number(right.name === 'core') - Number(left.name === 'core'))

  // 2. Load config files
  for (const item of configItems) {
    if (item.name === 'core') {
      const result = config.load(item.name, item.filePath, CoreConfigSchema)
      if (result.success) {
        if (!options.logging) {
          core.logger.configure(result.data.logging || {})
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
