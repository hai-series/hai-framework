/**
 * =============================================================================
 * @hai/core - 配置管理（Node.js 专用）
 * =============================================================================
 * 提供 YAML 配置文件加载、环境变量插值、缓存管理。
 *
 * @example
 * ```ts
 * import { config, core } from '@hai/core'
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

import { ConfigErrorCode } from '../config/index.js'
import { err, ok } from '../core-types.js'
import { i18n } from '../i18n/index.js'
import { typeUtils } from '../utils/core-util-type.js'

// =============================================================================
// 类型定义
// =============================================================================

/**
 * 配置错误结构。
 *
 * @example
 * ```ts
 * const error: ConfigError = { code: 1100, message: 'not found' }
 * ```
 */
export interface ConfigError {
  code: number
  message: string
  path?: string
  details?: unknown
}

/** 缓存项 */
interface CacheEntry<T = unknown> {
  data: T
  filePath: string
  schema: ZodType<T>
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
 * @param value - 任意配置值
 * @returns 插值后的结果
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
          message: i18n.coreM('config_envVarMissing', { params: { varName } }),
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
 * @example
 * ```ts
 * const callback: WatchCallback = (cfg, error) => {
 *   if (error) return
 *   // 使用 cfg
 * }
 * ```
 */
export type WatchCallback<T = unknown> = (config: T | null, error?: ConfigError) => void

/** 配置监听条目 */
interface WatchEntry {
  watcher: ReturnType<typeof watch>
  callbacks: Set<WatchCallback<unknown>>
}

/** 配置监听映射 */
const watchEntries = new Map<string, WatchEntry>()

/**
 * 创建未加载错误。
 *
 * @param name - 配置名称
 */
function createNotLoadedError(name: string): ConfigError {
  return {
    code: ConfigErrorCode.NOT_LOADED,
    message: i18n.coreM('config_notLoaded', { params: { name } }),
  }
}

/**
 * 通知监听回调。
 *
 * @param name - 配置名称
 * @param result - 处理结果
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
 * 加载 YAML 配置文件（不带验证）。
 *
 * @param filePath - 文件路径
 * @returns 解析结果
 */
function loadYaml(filePath: string): Result<unknown, ConfigError> {
  if (!existsSync(filePath)) {
    return err({
      code: ConfigErrorCode.FILE_NOT_FOUND,
      message: i18n.coreM('config_fileNotExist', { params: { filePath } }),
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
      message: i18n.coreM('config_parseFailed', { params: { filePath } }),
      path: filePath,
      details: error,
    })
  }
}

/**
 * 加载并验证配置文件。
 *
 * @param filePath - 文件路径
 * @param schema - Zod schema
 * @returns 解析结果
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
      message: i18n.coreM('config_validationFailed'),
      path: filePath,
      details: parseResult.error.issues,
    })
  }

  return ok(parseResult.data)
}

/**
 * 加载配置并缓存。
 *
 * @param name - 配置名称
 * @param filePath - 文件路径
 * @param schema - 可选 schema
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
 * @param name - 配置名称
 * @param schema - Zod schema
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
      message: i18n.coreM('config_validationFailed'),
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
 * @param name - 配置名称
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
 * @param name - 配置名称
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
 * 注册监听。
 *
 * @param name - 配置名称
 * @param callback - 回调
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
 * @param name - 配置名称（可选）
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
 * 清理缓存。
 *
 * @param name - 配置名称（可选）
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
   * @example
   * ```ts
   * config.load('core', './config/_core.yml', CoreConfigSchema)
   * ```
   */
  load<T>(name: string, filePath: string, schema?: ZodType<T>): Result<T, ConfigError> {
    return loadAndCache(name, filePath, schema)
  },

  /**
   * 验证数据。
   * @param name - 配置名称（用于错误消息）
   * @param schema - Zod 验证模式
   *
   * @example
   * ```ts
   * config.validate('app', AppSchema)
   * ```
   */
  validate<T>(name: string, schema: ZodType<T>): Result<T, ConfigError> {
    return validateLoadedConfig(name, schema)
  },

  /**
   * 获取已加载的配置。
   *
   * @example
   * ```ts
   * const cfg = config.get('app')
   * ```
   */
  get<T>(name: string): T | undefined {
    return configCache.get(name)?.data as T | undefined
  },

  /**
   * 获取配置，不存在时抛出错误。
   *
   * @example
   * ```ts
   * const cfg = config.getOrThrow('app')
   * ```
   */
  getOrThrow<T>(name: string): T {
    const data = this.get<T>(name)
    if (data === undefined) {
      throw new Error(i18n.coreM('config_notLoaded', { params: { name } }))
    }
    return data
  },

  /**
   * 重新加载配置。
   *
   * @example
   * ```ts
   * config.reload('app')
   * ```
   */
  reload(name: string): Result<unknown, ConfigError> {
    return reloadAndNotify(name)
  },

  /**
   * 检查配置是否已加载。
   *
   * @example
   * ```ts
   * config.has('app')
   * ```
   */
  has(name: string): boolean {
    return configCache.has(name)
  },

  /**
   * 清除配置缓存。
   *
   * @example
   * ```ts
   * config.clear('app')
   * ```
   */
  clear(name?: string): void {
    clearCache(name)
  },

  /**
   * 获取所有已加载的配置名称。
   *
   * @example
   * ```ts
   * const names = config.keys()
   * ```
   */
  keys(): string[] {
    return Array.from(configCache.keys())
  },

  /**
   * 监听配置文件变更并自动重载。
   * @param name - 配置名称
   * @param callback - 配置变更回调，接收新配置或错误
   * @returns 取消监听函数
   *
   * @example
   * ```ts
   * const unwatch = config.watch('app', () => {})
   * unwatch()
   * ```
   */
  watch<T = unknown>(name: string, callback: WatchCallback<T>): () => void {
    return registerWatch(name, callback)
  },

  /**
   * 停止配置文件监听。
   * @param name - 配置名称，不传则停止所有
   *
   * @example
   * ```ts
   * config.unwatch('app')
   * ```
   */
  unwatch(name?: string): void {
    stopWatching(name)
  },

  /**
   * 检查是否正在监听。
   *
   * @example
   * ```ts
   * config.isWatching('app')
   * ```
   */
  isWatching(name: string): boolean {
    return watchEntries.has(name)
  },
}
