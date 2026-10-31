import type { ZodType } from 'zod'
/**
 * @h-ai/core — 配置管理（Node.js 专用）
 *
 * 提供 YAML 配置文件加载、约定式环境变量映射、显式环境变量插值、缓存管理。
 * @module core-function-config.node
 */

import type { HaiError, HaiResult, WatchCallback } from '../core-types.js'

import { existsSync, readFileSync, watch } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { parse } from 'yaml'

// ─── 配置文件监听 ───

import { err, HaiConfigError, ok } from '../core-types.js'
import { i18n } from '../i18n/core-i18n-utils.js'
import { mergeEnv, parseEnvironment, resolveEnvironment, stringifyEnv, toEnv } from './core-function-environment.node.js'

/**
 * 缓存项（存储已加载的配置及其元信息）
 * @example 模块内部上下文
 * ```ts
 * const entry: CacheEntry<{ enabled: boolean }> = { data: { enabled: true }, filePath: '/srv/app/config/app.yml', loadedAt: Date.now() }
 * const enabled = entry.data.enabled
 * ```
 */
interface CacheEntry<T = unknown> {
  /** 解析后的配置数据 */
  data: T
  /** 配置文件路径 */
  filePath: string
  /** Zod 校验 Schema（重载时复用，无 Schema 加载时为 undefined） */
  schema?: ZodType<T>
  /** 宿主提供的结构提示；模块仍自行执行完整业务校验。 */
  schemaHint?: ZodType
  /** 加载时间戳（毫秒） */
  loadedAt: number
}

// ─── 内部工具 ───

// ─── 配置管理器 ───

/** 配置缓存 */
const configCache = new Map<string, CacheEntry>()

/**
 * 配置监听条目（包含文件 watcher 和回调集合）
 * @example 模块内部上下文
 * ```ts
 * const watcher = watch('/srv/app/config/app.yml', () => {})
 * const entry: WatchEntry = { watcher, callbacks: new Set(), debounceTimer: null }
 * entry.watcher.close()
 * ```
 */
interface WatchEntry {
  /** fs.watch 返回的 watcher 实例 */
  watcher: ReturnType<typeof watch>
  /** 已注册的回调函数集合 */
  callbacks: Set<WatchCallback<unknown>>
  /** 防抖定时器（用于 stopWatching 时清理） */
  debounceTimer: ReturnType<typeof setTimeout> | null
}

/** 配置监听映射 */
const watchEntries = new Map<string, WatchEntry>()

/**
 * 创建未加载错误。
 *
 * @param name - 配置名称
 * @returns HaiError，错误码为 NOT_LOADED
 */
function createNotLoadedError(name: string): HaiError {
  const result = err(HaiConfigError.CONFIG_NOT_LOADED, i18n.coreM('core_configNotLoaded', { params: { name } }))
  if (!result.success)
    return result.error

  throw new Error('unreachable')
}

/**
 * 通知监听回调。
 *
 * @param name - 配置名称
 * @param result - 重载结果（成功时传配置数据，失败时传错误）
 */
function notifyWatchCallbacks(name: string, result: HaiResult<unknown>): void {
  const entry = watchEntries.get(name)
  if (!entry)
    return

  if (result.success) {
    for (const callback of entry.callbacks) {
      try {
        callback(result.data, undefined)
      }
      catch { /* 隔离单个回调异常，不影响其他回调 */ }
    }
  }
  else {
    for (const callback of entry.callbacks) {
      try {
        callback(null, result.error)
      }
      catch { /* 隔离单个回调异常，不影响其他回调 */ }
    }
  }
}

/**
 * 加载 YAML 配置文件（不带 Schema 验证）。
 *
 * 流程：检查文件存在 → 读取 YAML → 约定式环境变量映射与显式插值。
 *
 * @param name - 配置名称，用于生成 `HAI_<配置名>_<YAML 路径>` 环境变量名
 * @param filePath - YAML 文件路径
 * @returns 解析结果；可能的错误码：FILE_NOT_FOUND / PARSE_ERROR / ENV_VAR_MISSING
 */
function loadYaml(name: string, filePath: string, schema?: ZodType): HaiResult<unknown> {
  if (!existsSync(filePath)) {
    return err(HaiConfigError.CONFIG_FILE_NOT_FOUND, i18n.coreM('core_configFileNotExist', { params: { filePath } }))
  }

  try {
    const content = readFileSync(filePath, 'utf-8')
    const parsed = parse(content)
    return resolveEnvironment({ name, value: parsed, schema })
  }
  catch (error) {
    return err(HaiConfigError.CONFIG_PARSE_ERROR, i18n.coreM('core_configParseFailed', { params: { filePath } }), error)
  }
}

/**
 * 加载并验证配置文件。
 *
 * 流程：加载 YAML → 环境变量映射与插值 → Zod Schema 校验。
 *
 * @param name - 配置名称
 * @param filePath - YAML 文件路径
 * @param schema - Zod 校验 Schema
 * @returns 校验后的配置数据；可能的错误码：FILE_NOT_FOUND / PARSE_ERROR / ENV_VAR_MISSING / VALIDATION_ERROR
 */
function loadConfig<T>(
  name: string,
  filePath: string,
  schema: ZodType<T>,
): HaiResult<T> {
  const yamlResult = loadYaml(name, filePath, schema)
  if (!yamlResult.success)
    return yamlResult

  const parseResult = schema.safeParse(yamlResult.data)
  if (!parseResult.success) {
    return err(HaiConfigError.CONFIG_VALIDATION_ERROR, i18n.coreM('core_configValidationFailed'), parseResult.error.issues)
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
): HaiResult<T> {
  const result = schema ? loadConfig(name, filePath, schema) : loadYaml(name, filePath) as HaiResult<T>
  if (result.success) {
    configCache.set(name, {
      data: result.data,
      filePath,
      schema: schema as ZodType<unknown> | undefined,
      loadedAt: Date.now(),
    })
  }
  return result
}

/**
 * 扫描时仅借助宿主 Schema 识别路径和类型，保留原有模块初始化校验边界。
 * @example 模块内部上下文
 * ```ts
 * const loaded = loadConfigStructure('app', '/srv/app/config/app.yml')
 * if (!loaded.success) loaded.error.message
 * ```
 */
export function loadConfigStructure(name: string, filePath: string, schemaHint?: ZodType): HaiResult<unknown> {
  const result = loadYaml(name, filePath, schemaHint)
  if (result.success)
    configCache.set(name, { data: result.data, filePath, schemaHint, loadedAt: Date.now() })
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
function validateLoadedConfig<T>(name: string, schema: ZodType<T>): HaiResult<T> {
  const entry = configCache.get(name)
  if (!entry) {
    return err(createNotLoadedError(name))
  }

  const resolved = resolveEnvironment({ name, value: entry.data, schema }, true)
  if (!resolved.success)
    return resolved
  const parseResult = schema.safeParse(resolved.data)
  if (!parseResult.success) {
    return err(HaiConfigError.CONFIG_VALIDATION_ERROR, i18n.coreM('core_configValidationFailed'), parseResult.error.issues)
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
function reloadAndNotify(name: string): HaiResult<unknown> {
  const entry = configCache.get(name)
  if (!entry) {
    const result = err(createNotLoadedError(name))
    notifyWatchCallbacks(name, result)
    return result
  }

  // 无 Schema 时直接加载 YAML（不做校验），避免 schema 为 undefined 导致运行时崩溃
  const result = entry.schema ? loadConfig(name, entry.filePath, entry.schema) : loadYaml(name, entry.filePath, entry.schemaHint)
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
    const watchEntry: WatchEntry = {
      watcher: null!,
      callbacks: new Set(),
      debounceTimer: null,
    }

    // 防抖定时器：fs.watch 可能对同一次文件保存触发多次 'change' 事件
    const watcher = watch(entry.filePath, (eventType) => {
      if (eventType === 'change') {
        if (watchEntry.debounceTimer)
          clearTimeout(watchEntry.debounceTimer)
        watchEntry.debounceTimer = setTimeout(() => {
          watchEntry.debounceTimer = null
          reloadAndNotify(name)
        }, 100)
      }
    })

    watchEntry.watcher = watcher
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
      if (current.debounceTimer)
        clearTimeout(current.debounceTimer)
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
      if (entry.debounceTimer)
        clearTimeout(entry.debounceTimer)
      entry.watcher.close()
      watchEntries.delete(name)
    }
  }
  else {
    for (const entry of watchEntries.values()) {
      if (entry.debounceTimer)
        clearTimeout(entry.debounceTimer)
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
 * @example 模块内部上下文
 * ```ts
 * const result = config.load('app', '/srv/app/config/app.yml')
 * if (!result.success) result.error.message
 * ```
 */
export const config = {
  /**
   * 合并从低到高的环境来源；高来源父项替换旧节点，同来源细项覆盖父 JSON。
   * @param layers - 按优先级排列的字面变量。
   * @returns 合并后的变量，可能含秘密。
   * @example
   * ```ts
   * import { core } from '@h-ai/core'
   * const value = core.config.mergeEnv([{ HAI_APP_NAME: 'base' }, { HAI_APP_NAME: 'test' }])
   * ```
   */
  mergeEnv,
  /**
   * 解析 dotenv 字面文本，拒绝重复键，不执行 shell 或变量展开。
   * @param text - dotenv 文本，可能包含秘密。
   * @returns 字面变量；重复键抛出不含变量值的错误。
   * @example
   * ```ts
   * import { core } from '@h-ai/core'
   * const value = core.config.parseEnv('HAI_APP_NAME=Example\n')
   * ```
   */
  parseEnv: parseEnvironment,
  /**
   * 无损编码 dotenv，父变量排在细项前；含秘密时只能写入受保护文件。
   * @param values - 字面变量，不进行脱敏。
   * @param options - 输出语法目标，默认 Node dotenv。
   * @param options.target - Compose 目标同时处理其美元符号插值规则。
   * @returns dotenv 文本；非法变量名抛错。
   * @example
   * ```ts
   * import { core } from '@h-ai/core'
   * const value = core.config.stringifyEnv({ HAI_APP_NAME: 'Example' })
   * ```
   */
  stringifyEnv,
  /**
   * 按已有结构或 Schema 解析父 JSON 和细项，不修改缓存或进程环境。
   * @param options - 配置名、原始结构、变量、可选 Schema 和缺失插值规则。
   * @returns 解析结果；调用方仍须执行最终 Schema 校验。
   * @example
   * ```ts
   * import { core } from '@h-ai/core'
   * const value = core.config.resolve({ name: 'app', value: { name: 'Example' }, environment: { HAI_APP_NAME: 'Test' } })
   * ```
   */
  resolve: (options: Parameters<typeof resolveEnvironment>[0]) => resolveEnvironment(options),
  /**
   * 默认将对象展开为细项；数组、动态字典和空对象保留 JSON。
   * @param options - 完整变量前缀、配置值和可选 Schema。
   * @returns 字面环境变量，不脱敏；非法名称抛错。
   * @example
   * ```ts
   * import { core } from '@h-ai/core'
   * const value = core.config.toEnv({ prefix: 'HAI_APP', value: { name: 'Example', tags: ['demo'] } })
   * ```
   */
  toEnv,
  /**
   * 读取 dotenv 文件并按统一顺序合并，不修改进程环境。
   *
   * 优先级：已有进程环境 > .env.<mode>.local > .env.local > .env.<mode> > .env。
   * development/production 分别映射到 dev/prod；不存在的文件跳过。
   * 返回值可能包含私有配置，仅在 Node 启动/构建边界注入，不下发浏览器。
   * @param options - 文件所在目录及环境模式
   * @param options.mode - dev/test/prod 或 Vite 的 development/production
   * @param options.envDir - dotenv 所在目录，默认进程工作目录
   * @returns 已合并的变量；非法模式或读取失败返回配置错误，不包含文件内容
   * @example
   * ```ts
   * const env = core.config.loadEnvFiles({ mode: 'dev', envDir: '.' })
   * if (!env.success) throw new Error(env.error.message)
   * Object.assign(process.env, env.data)
   * core.init({ configDir: './config' })
   * ```
   */
  loadEnvFiles(options: { mode: string, envDir?: string }): HaiResult<Record<string, string>> {
    const mode = options.mode === 'development' ? 'dev' : options.mode === 'production' ? 'prod' : options.mode
    if (!/^[a-z0-9][\w-]*$/i.test(mode))
      return err(HaiConfigError.CONFIG_VALIDATION_ERROR, i18n.coreM('core_configValidationFailed'))
    const envDir = options.envDir ?? process.cwd()
    try {
      const layers: Array<Record<string, string | undefined>> = []
      for (const name of ['.env', `.env.${mode}`, '.env.local', `.env.${mode}.local`]) {
        const file = join(envDir, name)
        if (existsSync(file))
          layers.push(parseEnvironment(readFileSync(file, 'utf8')))
      }
      const declared = new Set(layers.flatMap(layer => Object.keys(layer)))
      layers.push(Object.fromEntries(Object.entries(process.env).filter(([name]) => declared.has(name) || name.startsWith('HAI_'))))
      const merged = mergeEnv(layers)
      return ok(merged)
    }
    catch {
      // dotenv 解析异常可能携带原始行，错误边界不暴露文件内容。
      return err(HaiConfigError.CONFIG_PARSE_ERROR, i18n.coreM('core_configParseFailed', { params: { filePath: envDir } }))
    }
  },

  /**
   * 加载配置到缓存。
   *
   * 加载 YAML 文件并可选地用 Zod Schema 校验，成功后写入缓存。
   *
   * @param name - 配置名称（缓存 key）
   * @param filePath - YAML 文件路径
   * @param schema - 可选 Zod Schema（不传则跳过校验）
   * @returns 成功时返回解析后的配置数据；失败时返回 HaiError
   *
   * @example
   * ```ts
   * const result = config.load('core', './config/_core.yml', CoreConfigSchema)
   * if (result.success) {
   *   // result.data 为校验后的配置
   * }
   * ```
   */
  load<T>(name: string, filePath: string, schema?: ZodType<T>): HaiResult<T> {
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
  validate<T>(name: string, schema: ZodType<T>): HaiResult<T> {
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
  reload(name: string): HaiResult<unknown> {
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
