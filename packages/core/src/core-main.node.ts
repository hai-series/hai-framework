/**
 * @h-ai/core — Core 服务聚合（Node.js）
 *
 * 提供 Node.js 环境的 core 对象，聚合常用功能。 所有功能统一通过 core 对象访问，并提供配置加载能力。
 * @module core-main.node
 */

import type { CoreOptions, HaiError, HaiResult, LogContext, NodeCoreFunctions } from './core-types.js'
import { AsyncLocalStorage } from 'node:async_hooks'
import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { YAMLParseError } from 'yaml'
import { CoreConfigSchema } from './core-config.js'
import { createCore } from './core-main.js'
import { access } from './functions/core-function-access.node.js'
import { config, loadConfigStructure } from './functions/core-function-config.node.js'
import { installRequestContext } from './functions/core-function-context.js'
import { logger } from './functions/core-function-logger.node.js'
import { worker } from './functions/core-function-worker.node.js'
import { installRequestLocales } from './i18n/core-i18n-utils.js'

// 请求语言跨 await 保持隔离，避免并行 SSR 修改另一个请求的默认语言。
installRequestLocales(new AsyncLocalStorage())
installRequestContext(new AsyncLocalStorage())

const YAML_EXTENSION_REGEX = /\.ya?ml$/
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
    /** Node 专属的可信地址、策略文件读取与已编译访问检查。 */
    access,
    worker,
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
 * if (!required.success) core.logger.error('Required config unavailable', { code: required.error.code })
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
  /** 配置文件路径，与调用方传入的配置目录使用同一相对或绝对基准。 */
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
 * 显式日志选项优先。指定配置目录时先加载并校验 core 配置，再加载其余 YAML。
 * 启用 `watchConfig` 后为本次成功加载的配置注册监听。
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
 * if (!required.success) core.logger.error('Required config unavailable', { code: required.error.code })
 * ```
 */
function initCore(options: CoreOptions = {}): void {
  const startTime = Date.now()
  const logger = core.logger

  if (options.logging) {
    logger.configure(options.logging)
  }

  const configItems = options.configDir
    ? scanConfigDir(options.configDir)
    : []

  // 先应用 core 的日志配置，避免其它配置加载日志使用初始化前的级别与格式。
  configItems.sort((left, right) => Number(right.name === 'core') - Number(left.name === 'core'))

  const loadedItems: ConfigLoadItem[] = []
  for (const item of configItems) {
    let result: HaiResult<unknown>
    if (item.name === 'core') {
      const loaded = config.load(item.name, item.filePath, CoreConfigSchema)
      if (loaded.success && !options.logging && loaded.data.logging)
        logger.configure(loaded.data.logging)
      result = loaded
    }
    else {
      result = loadConfigStructure(item.name, item.filePath, options.configSchemas?.[item.name])
    }
    if (!result.success) {
      logger.error(`[core] Config load failed: ${item.name}`, configDiagnostic(item, result.error))
      continue
    }
    loadedItems.push(item)
    logger.info(`[core] Config loaded: ${item.name} <- ${item.filePath}`)
  }

  if (options.watchConfig) {
    setupConfigWatch(loadedItems)
  }

  const duration = Date.now() - startTime
  logger.info(`[core] Initialized (${duration}ms)`)
}

/**
 * 保留配置失败的位置、错误码和关联编号。YAML 解析异常的消息与堆栈可能包含配置原文。
 * @param item - 正在加载或监听的配置项
 * @param error - 保留完整原因的内部错误结果
 * @returns 可记录的诊断字段
 */
function configDiagnostic(item: ConfigLoadItem, error: HaiError): LogContext {
  const position = error.cause instanceof YAMLParseError
    ? error.cause.linePos?.[0]
    : undefined
  return {
    filePath: item.filePath,
    code: error.code,
    traceId: error.traceId,
    ...(position
      ? { line: position.line, column: position.col }
      : {}),
  }
}

/**
 * 为成功加载的配置注册监听。重载只更新缓存，每次变更均记录结果。
 * @param configs - 本次启动加载成功的配置项列表
 */
function setupConfigWatch(configs: ConfigLoadItem[]): void {
  const logger = core.logger

  for (const item of configs) {
    config.watch(item.name, (_config, error) => {
      if (error) {
        logger.error(`[core] Config watch or reload failed: ${item.name}`, configDiagnostic(item, error))
        return
      }
      logger.info(`[core] Config reloaded: ${item.name}`)
    })

    if (config.isWatching(item.name))
      logger.debug(`[core] Config watch enabled: ${item.name}`)
  }
}
