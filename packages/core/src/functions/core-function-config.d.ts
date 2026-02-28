/**
 * =============================================================================
 * @h-ai/core - 配置管理（Node.js 专用）
 * =============================================================================
 * 提供 YAML 配置文件加载、环境变量插值、缓存管理。
 *
 * @example
 * ```ts
 * import { config, core } from '@h-ai/core'
 *
 * // 加载配置
 * const result = config.load('core', './config/_core.yml', CoreConfigSchema)
 *
 * // 获取配置
 * const coreConfig = config.get<CoreConfig>('core')
 *
 * // 监听文件变更并自动重载
 * const unwatch = config.watch('app', (cfg, error) => {
 *   if (error) core.logger.error('重载失败', { error })
 *   else core.logger.info('配置已更新', { cfg })
 * })
 * // 取消监听：unwatch()
 * ```
 * =============================================================================
 */
import type { ZodType } from 'zod'
import type { Result } from '../core-types.js'
/**
 * 配置错误结构。
 *
 * 所有配置操作的失败分支均返回此类型。
 *
 * @example
 * ```ts
 * const error: ConfigError = {
 *   code: ConfigErrorCode.FILE_NOT_FOUND,
 *   message: 'Config file not found',
 *   path: './config/app.yml',
 * }
 * ```
 */
export interface ConfigError {
  /** 错误码，对应 ConfigErrorCode 中的某个值 */
  code: number
  /** 错误描述（i18n 消息） */
  message: string
  /** 配置文件路径（可选，仅文件相关错误时存在） */
  path?: string
  /** 附加详情（如 Zod issues 或原始异常） */
  details?: unknown
}
/**
 * 监听回调类型。
 *
 * @template T - 配置数据类型
 *
 * @example
 * ```ts
 * const callback: WatchCallback<AppConfig> = (cfg, error) => {
 *   if (error) { console.error(error); return }
 *   // 使用更新后的 cfg
 * }
 * ```
 */
export type WatchCallback<T = unknown> = (config: T | null, error?: ConfigError) => void
/**
 * 配置管理对象。
 *
 * @example
 * ```ts
 * const result = config.load('app', './config/app.yml')
 * if (result.success) {
 *   const cfg = config.get('app')
 * }
 * ```
 */
export declare const config: {
  /**
   * 加载配置到缓存。
   *
   * 加载 YAML 文件并可选地用 Zod Schema 校验，成功后写入缓存。
   *
   * @param name - 配置名称（缓存 key）
   * @param filePath - YAML 文件路径
   * @param schema - 可选 Zod Schema（不传则跳过校验）
   * @returns 成功时返回解析后的配置数据；失败时返回 ConfigError
   *
   * @example
   * ```ts
   * const result = config.load('core', './config/_core.yml', CoreConfigSchema)
   * if (result.success) {
   *   // result.data 为校验后的配置
   * }
   * ```
   */
  load: <T>(name: string, filePath: string, schema?: ZodType<T>) => Result<T, ConfigError>
  /**
   * 验证已加载的配置数据。
   *
   * 对缓存中的配置数据重新用 Schema 校验，校验通过后更新缓存。
   *
   * @param name - 配置名称
   * @param schema - Zod 验证模式
   * @returns 校验结果；未加载时返回 NOT_LOADED，格式错误返回 VALIDATION_ERROR
   *
   * @example
   * ```ts
   * const result = config.validate('app', AppSchema)
   * if (!result.success) {
   *   // result.error.code 可能为 NOT_LOADED 或 VALIDATION_ERROR
   * }
   * ```
   */
  validate: <T>(name: string, schema: ZodType<T>) => Result<T, ConfigError>
  /**
   * 获取已加载的配置。
   *
   * @param name - 配置名称
   * @returns 配置数据；未加载时返回 undefined
   *
   * @example
   * ```ts
   * const cfg = config.get<CoreConfig>('core')
   * if (cfg) {
   *   // 使用 cfg
   * }
   * ```
   */
  get: <T>(name: string) => T | undefined
  /**
   * 获取配置，不存在时抛出错误。
   *
   * @param name - 配置名称
   * @returns 配置数据
   * @throws 配置未加载时抛出 Error
   *
   * @example
   * ```ts
   * try {
   *   const cfg = config.getOrThrow<CoreConfig>('core')
   * } catch (e) {
   *   // 配置未加载
   * }
   * ```
   */
  getOrThrow: <T>(name: string) => T
  /**
   * 重新加载配置。
   *
   * 从磁盘重新读取配置文件并更新缓存，同时通知所有 watch 回调。
   *
   * @param name - 配置名称
   * @returns 重载结果；未加载时返回 NOT_LOADED
   *
   * @example
   * ```ts
   * const result = config.reload('app')
   * ```
   */
  reload: (name: string) => Result<unknown, ConfigError>
  /**
   * 检查配置是否已加载。
   *
   * @param name - 配置名称
   * @returns 是否已加载到缓存
   *
   * @example
   * ```ts
   * if (config.has('db')) {
   *   const dbCfg = config.get('db')
   * }
   * ```
   */
  has: (name: string) => boolean
  /**
   * 清除配置缓存（同时停止对应监听）。
   *
   * @param name - 配置名称；不传则清除全部
   *
   * @example
   * ```ts
   * config.clear('app')   // 清除单个
   * config.clear()        // 清除全部
   * ```
   */
  clear: (name?: string) => void
  /**
   * 获取所有已加载的配置名称。
   *
   * @returns 配置名称数组
   *
   * @example
   * ```ts
   * const names = config.keys() // ['core', 'db', 'app']
   * ```
   */
  keys: () => string[]
  /**
   * 监听配置文件变更并自动重载。
   *
   * 文件变更时自动重新加载并调用回调。配置未加载时立即回调 NOT_LOADED 错误。
   *
   * @param name - 配置名称
   * @param callback - 配置变更回调，接收新配置或错误
   * @returns 取消监听函数
   *
   * @example
   * ```ts
   * const unwatch = config.watch('app', (cfg, error) => {
   *   if (error) { core.logger.error('reload failed', { error }); return }
   *   core.logger.info('config updated', { cfg })
   * })
   * // 取消监听
   * unwatch()
   * ```
   */
  watch: <T = unknown>(name: string, callback: WatchCallback<T>) => () => void
  /**
   * 停止配置文件监听。
   *
   * @param name - 配置名称；不传则停止所有监听
   *
   * @example
   * ```ts
   * config.unwatch('app')  // 停止单个
   * config.unwatch()       // 停止全部
   * ```
   */
  unwatch: (name?: string) => void
  /**
   * 检查是否正在监听某个配置。
   *
   * @param name - 配置名称
   * @returns 是否有活跃的 watcher
   *
   * @example
   * ```ts
   * if (config.isWatching('app')) {
   *   config.unwatch('app')
   * }
   * ```
   */
  isWatching: (name: string) => boolean
}
// # sourceMappingURL=core-function-config.d.ts.map
