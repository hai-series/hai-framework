/**
 * =============================================================================
 * @h-ai/core - Logger（Node.js 版本，基于 pino）
 * =============================================================================
 * 提供统一的日志接口，Node.js 环境使用 pino 实现。
 *
 * @example
 * ```ts
 * import { logger } from './core-function-logger.node.js'
 *
 * const appLogger = logger.createLogger({ name: 'my-service' })
 * appLogger.info('Hello', { userId: 123 })
 *
 * // 动态调整级别
 * logger.setLogLevel('debug')
 * ```
 * =============================================================================
 */
import type { LoggerFunctions } from '../core-types.js'
/**
 * Node.js Logger 函数集合。
 *
 * @example
 * ```ts
 * logger.createLogger({ name: 'service' }).info('boot')
 * ```
 */
export declare const logger: LoggerFunctions
// # sourceMappingURL=core-function-logger.node.d.ts.map
