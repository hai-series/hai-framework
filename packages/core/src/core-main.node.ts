/**
 * @h-ai/core — Core 服务聚合（Node.js）
 *
 * 提供 Node.js 环境的 core 对象，聚合常用功能。 所有功能统一通过 core 对象访问，并提供配置加载能力。
 * @module core-main.node
 */

import type { CoreOptions, NodeCoreFunctions } from './core-types.js'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createCore } from './core-main.js'
import { access } from './functions/core-function-access.node.js'
import { config, loadStartupConfig } from './functions/core-function-config.node.js'
import { installRequestContext } from './functions/core-function-context.js'
import { logger } from './functions/core-function-logger.node.js'
import { worker } from './functions/core-function-worker.node.js'
import { installRequestLocales } from './i18n/core-i18n-utils.js'
import { constantTimeEqual } from './utils/core-util-string.node.js'

// 请求语言跨 await 保持隔离，避免并行 SSR 修改另一个请求的默认语言。
installRequestLocales(new AsyncLocalStorage())
installRequestContext(new AsyncLocalStorage())

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
      constantTimeEqual,
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
 * import { CoreConfigSchema, core } from '@h-ai/core'
 * core.init({ configDir: './config' }) // 单项加载失败记录日志并继续。
 * const required = core.config.validate('core', CoreConfigSchema)
 * if (!required.success) core.logger.error('Required config unavailable', { code: required.error.code })
 * else core.logger.info('Application ready', { name: required.data.name })
 * ```
 */
export const core: NodeCoreFunctions = createNodeCore()

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
  loadStartupConfig(options, logger)

  const duration = Date.now() - startTime
  logger.info(`[core] Initialized (${duration}ms)`)
}
