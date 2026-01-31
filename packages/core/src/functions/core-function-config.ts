/**
 * =============================================================================
 * @hai/core - 配置管理（Node.js 专用）
 * =============================================================================
 * 提供 YAML 配置文件加载、环境变量插值、缓存管理
 *
 * @example
 * ```ts
 * import { config } from '@hai/core'
 *
 * // 加载配置
 * const result = config.load('core', './config/_core.yml', CoreConfigSchema)
 *
 * // 获取配置
 * const coreConfig = config.get<CoreConfig>('core')
 *
 * // 监听变更
 * config.onChange('app', (cfg) => {
 *     // 在此处理配置变更（例如：热更新某些运行时参数）
 * })
 * ```
 * =============================================================================
 */

import type { ZodSchema } from 'zod'
import type { Result } from '../core-types.js'

import { existsSync, readFileSync, watch } from 'node:fs'
import process from 'node:process'
import { parse } from 'yaml'

// =============================================================================
// 配置文件监听
// =============================================================================

import messagesEnUS from '../../messages/en-US.json'
import messagesZhCN from '../../messages/zh-CN.json'
import { ConfigErrorCode } from '../core-config.js'
import { err, ok } from '../core-types.js'
import { createMessageGetter } from '../i18n/i18n-utils.js'

// 内部消息获取器
type CoreMessageKey = keyof typeof messagesZhCN
const { getMessage: getCoreMessage } = createMessageGetter<CoreMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})

// =============================================================================
// 类型定义
// =============================================================================

/** 配置错误 */
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
  schema: ZodSchema<T>
  loadedAt: number
}

// =============================================================================
// 内部工具
// =============================================================================

/** 环境变量插值正则 */
const ENV_VAR_PATTERN = /\$\{([^}:]+)(?::([^}]*))?\}/g

/** 检查是否为纯对象 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 递归替换环境变量 */
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

      if (envValue === undefined && defaultValue === undefined) {
        return err({
          code: ConfigErrorCode.ENV_VAR_MISSING,
          message: getCoreMessage('config_envVarMissing', undefined, { varName }),
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

  if (isPlainObject(value)) {
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

/** 变更监听器 */
const configListeners = new Map<string, Set<(config: unknown) => void>>()

/**
 * 加载 YAML 配置文件（不带验证）
 */
export function loadYaml(filePath: string): Result<unknown, ConfigError> {
  if (!existsSync(filePath)) {
    return err({
      code: ConfigErrorCode.FILE_NOT_FOUND,
      message: getCoreMessage('config_fileNotExist', undefined, { filePath }),
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
      message: getCoreMessage('config_parseFailed', undefined, { filePath }),
      path: filePath,
      details: error,
    })
  }
}

/**
 * 加载并验证配置文件
 */
export function loadConfig<T>(
  filePath: string,
  schema: ZodSchema<T>,
): Result<T, ConfigError> {
  const yamlResult = loadYaml(filePath)
  if (!yamlResult.success)
    return yamlResult

  const parseResult = schema.safeParse(yamlResult.data)
  if (!parseResult.success) {
    return err({
      code: ConfigErrorCode.VALIDATION_ERROR,
      message: getCoreMessage('config_validationFailed'),
      path: filePath,
      details: parseResult.error.issues,
    })
  }

  return ok(parseResult.data)
}

/**
 * 配置管理对象
 */
export const config = {
  /**
   * 加载配置到缓存
   */
  load<T>(name: string, filePath: string, schema: ZodSchema<T>): Result<T, ConfigError> {
    const result = loadConfig(filePath, schema)
    if (result.success) {
      configCache.set(name, {
        data: result.data,
        filePath,
        schema: schema as ZodSchema<unknown>,
        loadedAt: Date.now(),
      })
    }
    return result
  },

  /**
   * 获取已加载的配置
   */
  get<T>(name: string): T | undefined {
    return configCache.get(name)?.data as T | undefined
  },

  /**
   * 获取配置，不存在时抛出错误
   */
  getOrThrow<T>(name: string): T {
    const data = this.get<T>(name)
    if (data === undefined) {
      throw new Error(getCoreMessage('config_notLoaded', undefined, { name }))
    }
    return data
  },

  /**
   * 重新加载配置
   */
  reload(name: string): Result<unknown, ConfigError> {
    const entry = configCache.get(name)
    if (!entry) {
      return err({
        code: ConfigErrorCode.NOT_LOADED,
        message: getCoreMessage('config_notLoaded', undefined, { name }),
      })
    }

    const result = loadConfig(entry.filePath, entry.schema)
    if (result.success) {
      configCache.set(name, {
        ...entry,
        data: result.data,
        loadedAt: Date.now(),
      })
      // 通知监听器
      const listeners = configListeners.get(name)
      if (listeners) {
        for (const fn of listeners) {
          fn(result.data)
        }
      }
    }
    return result
  },

  /**
   * 监听配置变更
   */
  onChange<T>(name: string, callback: (config: T) => void): () => void {
    if (!configListeners.has(name)) {
      configListeners.set(name, new Set())
    }
    configListeners.get(name)!.add(callback as (config: unknown) => void)

    // 返回取消监听函数
    return () => {
      configListeners.get(name)?.delete(callback as (config: unknown) => void)
    }
  },

  /**
   * 检查配置是否已加载
   */
  has(name: string): boolean {
    return configCache.has(name)
  },

  /**
   * 清除配置缓存
   */
  clear(name?: string): void {
    if (name) {
      configCache.delete(name)
      configListeners.delete(name)
    }
    else {
      configCache.clear()
      configListeners.clear()
    }
  },

  /**
   * 获取所有已加载的配置名称
   */
  keys(): string[] {
    return Array.from(configCache.keys())
  },
}

/** 文件监听器 */
const configWatchers = new Map<string, ReturnType<typeof watch>>()

/** Watch 回调类型 */
export type ConfigWatchCallback = (name: string, success: boolean, error?: unknown) => void

/**
 * 启用配置文件监听
 * @param name - 配置名称
 * @param callback - 重新加载后的回调
 */
export function watchConfig(name: string, callback?: ConfigWatchCallback): boolean {
  // 避免重复监听
  if (configWatchers.has(name)) {
    return true
  }

  const entry = configCache.get(name)
  if (!entry) {
    return false
  }

  try {
    const watcher = watch(entry.filePath, (eventType) => {
      if (eventType === 'change') {
        const result = config.reload(name)
        callback?.(name, result.success, result.success ? undefined : result.error)
      }
    })

    configWatchers.set(name, watcher)
    return true
  }
  catch {
    return false
  }
}

/**
 * 批量启用配置文件监听
 * @param names - 配置名称列表
 * @param callback - 重新加载后的回调
 */
export function watchConfigs(names: string[], callback?: ConfigWatchCallback): void {
  for (const name of names) {
    watchConfig(name, callback)
  }
}

/**
 * 停止配置文件监听
 * @param name - 配置名称，不传则停止所有
 */
export function unwatchConfig(name?: string): void {
  if (name) {
    const watcher = configWatchers.get(name)
    if (watcher) {
      watcher.close()
      configWatchers.delete(name)
    }
  }
  else {
    for (const watcher of configWatchers.values()) {
      watcher.close()
    }
    configWatchers.clear()
  }
}

/**
 * 检查配置是否正在被监听
 */
export function isWatchingConfig(name: string): boolean {
  return configWatchers.has(name)
}
