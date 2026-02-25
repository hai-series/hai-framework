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

import { existsSync, readFileSync, watch } from 'node:fs'
import process from 'node:process'
import { parse } from 'yaml'

// =============================================================================
// 配置文件监听
// =============================================================================

import { ConfigErrorCode } from '../core-config.js'
import { err, ok } from '../core-types.js'
import { i18n } from '../i18n/core-i18n-utils.js'
import { typeUtils } from '../utils/core-util-type.js'

// =============================================================================
// 类型定义
// =============================================================================

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

/** 缓存项（存储已加载的配置及其元信息） */
interface CacheEntry<T = unknown> {
  /** 解析后的配置数据 */
  data: T
  /** 配置文件路径 */
  filePath: string
  /** Zod 校验 Schema（重载时复用） */
  schema: ZodType<T>
  /** 加载时间戳（毫秒） */
  loadedAt: number
}

// =============================================================================
// 内部工具
// =============================================================================

/** 环境变量插值正则（支持 ${VAR} 与 ${VAR:default}） */
const ENV_VAR_PATTERN = /\$\{([^}:]+)(?::([^}]*))?\}/g

/**
 * 递归替换环境变量。
 *
 * 支持 `${VAR}` 和 `${VAR:default}` 两种语法，递归处理字符串、数组和对象。
 *
 * @param value - 任意配置值（字符串、数组、对象或原始值）
 * @returns 插值后的结果；当环境变量缺失且未提供默认值时返回 ENV_VAR_MISSING 错误
 */
function interpolateEnv(value: unknown): Result<unknown, ConfigError> {
  if (typeof value === 'string') {
    let result = value
    ENV_VAR_PATTERN.lastIndex = 0

    // 避免在 while 条件中赋值（满足 lint 规则 no-cond-assign）
    while (true) {
      const match = ENV_VAR_PATTERN.exec(value)
      if (!match)
        break

      const [fullMatch, varName, defaultValue] = match
      const envValue = process.env[varName]

      // 未提供默认值且环境变量不存在时，返回错误
      if (envValue === undefined && defaultValue === undefined) {
        return err({
          code: ConfigErrorCode.ENV_VAR_MISSING,
          message: i18n.coreM('core_configEnvVarMissing', { params: { varName } }),
        })
      }
      result = result.replace(fullMatch, envValue ?? defaultValue ?? '')
    }
    return ok(result)
  }

  if (Array.isArray(value)) {
    const results: unknown[] = []
    for (const item of value) {
      const r = interpolateEnv(item)
      if (!r.success)
        return r
      results.push(r.data)
    }
    return ok(results)
  }

  if (typeUtils.isObject(value)) {
    const results: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      const r = interpolateEnv(v)
      if (!r.success)
        return r
      results[k] = r.data
    }
    return ok(results)
  }

  return ok(value)
}

// =============================================================================
// 配置管理器
// =============================================================================

/** 配置缓存 */
const configCache = new Map<string, CacheEntry>()

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

/** 配置监听条目（包含文件 watcher 和回调集合） */
interface WatchEntry {
  /** fs.watch 返回的 watcher 实例 */
  watcher: ReturnType<typeof watch>
  /** 已注册的回调函数集合 */
  callbacks: Set<WatchCallback<unknown>>
}

/** 配置监听映射 */
const watchEntries = new Map<string, WatchEntry>()

/**
 * 创建未加载错误。
 *
 * @param name - 配置名称
 * @returns ConfigError，错误码为 NOT_LOADED
 */
function createNotLoadedError(name: string): ConfigError {
  return {
    code: ConfigErrorCode.NOT_LOADED,
    message: i18n.coreM('core_configNotLoaded', { params: { name } }),
  }
}

/**
 * 通知监听回调。
 *
 * @param name - 配置名称
 * @param result - 重载结果（成功时传配置数据，失败时传错误）
 */
function notifyWatchCallbacks(name: string, result: Result<unknown, ConfigError>): void {
  const entry = watchEntries.get(name)
  if (!entry)
    return

  if (result.success) {
    for (const callback of entry.callbacks) {
      callback(result.data, undefined)
    }
  }
  else {
    for (const callback of entry.callbacks) {
      callback(null, result.error)
    }
  }
}

/**
 * 加载 YAML 配置文件（不带 Schema 验证）。
 *
 * 流程：检查文件存在 → 读取 YAML → 环境变量插值。
 *
 * @param filePath - YAML 文件路径
 * @returns 解析结果；可能的错误码：FILE_NOT_FOUND / PARSE_ERROR / ENV_VAR_MISSING
 */
function loadYaml(filePath: string): Result<unknown, ConfigError> {
  if (!existsSync(filePath)) {
    return err({
      code: ConfigErrorCode.FILE_NOT_FOUND,
      message: i18n.coreM('core_configFileNotExist', { params: { filePath } }),
      path: filePath,
    })
  }

  try {
    const content = readFileSync(filePath, 'utf-8')
    const parsed = parse(content)
    return interpolateEnv(parsed)
  }
  catch (error) {
    return err({
      code: ConfigErrorCode.PARSE_ERROR,
      message: i18n.coreM('core_configParseFailed', { params: { filePath } }),
      path: filePath,
      details: error,
    })
  }
}

/**
 * 加载并验证配置文件。
 *
 * 流程：加载 YAML → 环境变量插值 → Zod Schema 校验。
 *
 * @param filePath - YAML 文件路径
 * @param schema - Zod 校验 Schema
 * @returns 校验后的配置数据；可能的错误码：FILE_NOT_FOUND / PARSE_ERROR / ENV_VAR_MISSING / VALIDATION_ERROR
 */
function loadConfig<T>(
  filePath: string,
  schema: ZodType<T>,
): Result<T, ConfigError> {
  const yamlResult = loadYaml(filePath)
  if (!yamlResult.success)
    return yamlResult

  const parseResult = schema.safeParse(yamlResult.data)
  if (!parseResult.success) {
    return err({
      code: ConfigErrorCode.VALIDATION_ERROR,
      message: i18n.coreM('core_configValidationFailed'),
      path: filePath,
      details: parseResult.error.issues,
    })
  }

  return ok(parseResult.data)
}

/**
 * 加载配置并写入缓存。
 *
 * @param name - 配置名称（缓存 key）
 * @param filePath - YAML 文件路径
 * @param schema - 可选 Zod Schema（不传则跳过校验）
 * @returns 加载结果；成功时同时更新缓存
 */
function loadAndCache<T>(
  name: string,
  filePath: string,
  schema?: ZodType<T>,
): Result<T, ConfigError> {
  const result = schema ? loadConfig(filePath, schema) : loadYaml(filePath) as Result<T, ConfigError>
  if (result.success) {
    configCache.set(name, {
      data: result.data,
      filePath,
      schema: schema as ZodType<unknown>,
      loadedAt: Date.now(),
    })
  }
  return result
}

/**
 * 校验已加载的配置并写回缓存。
 *
 * 从缓存中取出原始数据重新用 Schema 校验，校验通过后更新缓存。
 *
 * @param name - 配置名称
 * @param schema - Zod Schema
 * @returns 校验结果；未加载时返回 NOT_LOADED，校验失败返回 VALIDATION_ERROR
 */
function validateLoadedConfig<T>(name: string, schema: ZodType<T>): Result<T, ConfigError> {
  const entry = configCache.get(name)
  if (!entry) {
    return err(createNotLoadedError(name))
  }

  const parseResult = schema.safeParse(entry.data)
  if (!parseResult.success) {
    return err({
      code: ConfigErrorCode.VALIDATION_ERROR,
      message: i18n.coreM('core_configValidationFailed'),
      path: entry.filePath,
      details: parseResult.error.issues,
    })
  }

  const validated = parseResult.data
  configCache.set(name, {
    ...entry,
    data: validated,
    schema,
    loadedAt: Date.now(),
  })

  return ok(validated)
}

/**
 * 重新加载配置并通知监听器。
 *
 * 从缓存中获取文件路径和 Schema，重新加载并触发所有 watch 回调。
 *
 * @param name - 配置名称
 * @returns 重载结果；未加载时返回 NOT_LOADED
 */
function reloadAndNotify(name: string): Result<unknown, ConfigError> {
  const entry = configCache.get(name)
  if (!entry) {
    const result = err(createNotLoadedError(name))
    notifyWatchCallbacks(name, result)
    return result
  }

  const result = loadConfig(entry.filePath, entry.schema)
  if (result.success) {
    configCache.set(name, {
      ...entry,
      data: result.data,
      loadedAt: Date.now(),
    })
  }
  notifyWatchCallbacks(name, result)
  return result
}

/**
 * 启动配置文件监听。
 *
 * 使用 `fs.watch` 监听文件变更，变更时自动重载并通知回调。
 * 同一配置名只会创建一个 watcher，多次调用返回同一实例。
 *
 * @param name - 配置名称
 * @returns WatchEntry 实例；配置未加载时返回 null
 */
function startFileWatcher(name: string): WatchEntry | null {
  const existing = watchEntries.get(name)
  if (existing)
    return existing

  const entry = configCache.get(name)
  if (!entry)
    return null

  try {
    const watcher = watch(entry.filePath, (eventType) => {
      if (eventType === 'change') {
        reloadAndNotify(name)
      }
    })

    const watchEntry: WatchEntry = {
      watcher,
      callbacks: new Set(),
    }
    watchEntries.set(name, watchEntry)
    return watchEntry
  }
  catch {
    return null
  }
}

/**
 * 注册监听回调。
 *
 * 启动文件 watcher（若尚未启动）并注册回调。
 * 配置未加载时立即回调 NOT_LOADED 错误。
 *
 * @param name - 配置名称
 * @param callback - 变更回调
 * @returns 取消监听函数；调用后自动清理（无回调时关闭 watcher）
 */
function registerWatch<T>(name: string, callback: WatchCallback<T>): () => void {
  const entry = startFileWatcher(name)
  if (!entry) {
    callback(null, createNotLoadedError(name))
    return () => { }
  }

  entry.callbacks.add(callback as WatchCallback<unknown>)

  return () => {
    const current = watchEntries.get(name)
    if (!current)
      return

    current.callbacks.delete(callback as WatchCallback<unknown>)
    if (current.callbacks.size === 0) {
      current.watcher.close()
      watchEntries.delete(name)
    }
  }
}

/**
 * 停止监听（内部实现）。
 *
 * @param name - 配置名称；不传则停止所有监听并清空映射
 */
function stopWatching(name?: string): void {
  if (name) {
    const entry = watchEntries.get(name)
    if (entry) {
      entry.watcher.close()
      watchEntries.delete(name)
    }
  }
  else {
    for (const entry of watchEntries.values()) {
      entry.watcher.close()
    }
    watchEntries.clear()
  }
}

/**
 * 清理缓存（同时停止对应监听）。
 *
 * @param name - 配置名称；不传则清理全部缓存并停止所有监听
 */
function clearCache(name?: string): void {
  if (name) {
    configCache.delete(name)
    stopWatching(name)
  }
  else {
    configCache.clear()
    stopWatching()
  }
}

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
export const config = {
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
  load<T>(name: string, filePath: string, schema?: ZodType<T>): Result<T, ConfigError> {
    return loadAndCache(name, filePath, schema)
  },

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
  validate<T>(name: string, schema: ZodType<T>): Result<T, ConfigError> {
    return validateLoadedConfig(name, schema)
  },

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
  get<T>(name: string): T | undefined {
    return configCache.get(name)?.data as T | undefined
  },

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
  getOrThrow<T>(name: string): T {
    const data = this.get<T>(name)
    if (data === undefined) {
      throw new Error(i18n.coreM('core_configNotLoaded', { params: { name } }))
    }
    return data
  },

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
  reload(name: string): Result<unknown, ConfigError> {
    return reloadAndNotify(name)
  },

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
  has(name: string): boolean {
    return configCache.has(name)
  },

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
  clear(name?: string): void {
    clearCache(name)
  },

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
  keys(): string[] {
    return Array.from(configCache.keys())
  },

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
  watch<T = unknown>(name: string, callback: WatchCallback<T>): () => void {
    return registerWatch(name, callback)
  },

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
  unwatch(name?: string): void {
    stopWatching(name)
  },

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
  isWatching(name: string): boolean {
    return watchEntries.has(name)
  },
}
