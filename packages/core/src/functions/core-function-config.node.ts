import type { ZodType } from 'zod'
/**
 * @h-ai/core — 配置管理（Node.js 专用）
 *
 * 提供 YAML 配置文件加载、约定式环境变量映射、显式环境变量插值、缓存管理。
 * @module core-function-config.node
 */

import type { HaiError, HaiResult, WatchCallback } from '../core-types.js'

import { existsSync, readFileSync, watch } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { parse } from 'yaml'

// ─── 配置文件监听 ───

import { err, HaiCommonError, HaiConfigError, ok } from '../core-types.js'
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
  return {
    ...HaiConfigError.CONFIG_NOT_LOADED,
    message: i18n.coreM('core_configNotLoaded', {
      params: { name },
    }),
  }
}

/**
 * 把文件监听的系统异常转换成可重试的错误，已缓存的配置仍可使用。
 * @param name - 配置名称
 * @param cause - 原始监听异常，供调用方诊断
 * @returns SERVICE_UNAVAILABLE 错误
 */
function createWatchError(name: string, cause: unknown): HaiError {
  return {
    ...HaiCommonError.SERVICE_UNAVAILABLE,
    message: i18n.coreM('core_configWatchUnavailable', {
      params: { name },
    }),
    cause,
  }
}

/**
 * 向订阅方报告同一次重载或监听失败。单个回调抛错时仍通知其余回调。
 *
 * @param callbacks - 本次需要通知的回调
 * @param result - 重载结果（成功时传配置数据，失败时传错误）
 */
function notifyWatchCallbacks(callbacks: Iterable<WatchCallback<unknown>>, result: HaiResult<unknown>): void {
  for (const callback of callbacks) {
    try {
      if (result.success)
        callback(result.data, undefined)
      else
        callback(null, result.error)
    }
    catch { /* 隔离单个回调异常，不影响其他回调 */ }
  }
}

/**
 * 加载 YAML 配置文件（不带 Schema 验证）。
 *
 * 流程：检查文件存在 → 读取 YAML → 约定式环境变量映射与显式插值。
 *
 * @param name - 配置名称，用于生成 `HAI_<配置名>_<YAML 路径>` 环境变量名
 * @param filePath - YAML 文件路径
 * @param schema - 可选结构提示，用于识别路径与类型
 * @returns 解析后的配置，或读取、解析及环境覆盖的错误
 */
function loadYaml(name: string, filePath: string, schema?: ZodType): HaiResult<unknown> {
  if (!existsSync(filePath)) {
    return err(HaiConfigError.CONFIG_FILE_NOT_FOUND, i18n.coreM('core_configFileNotExist', {
      params: { filePath },
    }))
  }

  try {
    const content = readFileSync(filePath, 'utf-8')
    const parsed = parse(content)
    return resolveEnvironment({ name, value: parsed, schema })
  }
  catch (error) {
    return err(HaiConfigError.CONFIG_PARSE_ERROR, i18n.coreM('core_configParseFailed', {
      params: { filePath },
    }), error)
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
  return yamlResult.success
    ? validateConfig(yamlResult.data, schema)
    : yamlResult
}

/**
 * 在同步配置 API 的边界统一转换 Schema 失败。
 * @param value - 环境覆盖后的值
 * @param schema - Zod 校验和转换规则
 * @returns 校验后的数据；失败时保留 Zod issues 或自定义校验抛出的异常
 */
function validateConfig<T>(value: unknown, schema: ZodType<T>): HaiResult<T> {
  try {
    const parsed = schema.safeParse(value)
    if (parsed.success)
      return ok(parsed.data)
    return err(HaiConfigError.CONFIG_VALIDATION_ERROR, i18n.coreM('core_configValidationFailed'), parsed.error.issues)
  }
  catch (cause) {
    return err(HaiConfigError.CONFIG_VALIDATION_ERROR, i18n.coreM('core_configValidationFailed'), cause)
  }
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
  const result = schema
    ? loadConfig(name, filePath, schema)
    : loadYaml(name, filePath) as HaiResult<T>
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
 * 读取配置并写入缓存。扫描时只用宿主 Schema 识别环境变量路径和类型，完整校验由模块执行。
 * @param name - 缓存名称
 * @param filePath - YAML 文件路径
 * @param schemaHint - 供读取和重载使用的结构提示
 * @returns 应用环境覆盖后的配置或失败原因；失败保留旧缓存
 * @example 模块内部上下文
 * ```ts
 * const loaded = loadConfigStructure('app', '/srv/app/config/app.yml')
 * if (!loaded.success) loaded.error.message
 * ```
 */
export function loadConfigStructure(name: string, filePath: string, schemaHint?: ZodType): HaiResult<unknown> {
  const result = loadYaml(name, filePath, schemaHint)
  if (result.success) {
    configCache.set(name, {
      data: result.data,
      filePath,
      schemaHint,
      loadedAt: Date.now(),
    })
  }
  return result
}

/**
 * 校验已加载的配置并写回缓存。
 *
 * 基于当前缓存数据应用约定式环境覆盖，再用 Schema 校验。成功后保存校验结果和 Schema，供后续重载使用。
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
  const validated = validateConfig(resolved.data, schema)
  if (!validated.success)
    return validated

  configCache.set(name, {
    ...entry,
    data: validated.data,
    schema,
    loadedAt: Date.now(),
  })

  return validated
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
  if (!entry)
    return err(createNotLoadedError(name))

  // 无 Schema 时直接加载 YAML（不做校验），避免 schema 为 undefined 导致运行时崩溃
  const result = entry.schema
    ? loadConfig(name, entry.filePath, entry.schema)
    : loadYaml(name, entry.filePath, entry.schemaHint)
  if (result.success) {
    configCache.set(name, {
      ...entry,
      data: result.data,
      loadedAt: Date.now(),
    })
  }
  const subscribed = watchEntries.get(name)
  if (subscribed)
    notifyWatchCallbacks(subscribed.callbacks, result)
  return result
}

/**
 * 启动配置文件监听。
 *
 * 使用 `fs.watch` 监听父目录并筛选目标文件，支持原子替换及删除后重建。
 * @param name - 配置名称
 * @param path - 配置文件路径
 * @returns 供同名配置的订阅方共享的监听条目
 * @throws 操作系统无法启动监听时抛出，由注册方法交给回调
 */
function startFileWatcher(name: string, path: string): WatchEntry {
  const filePath = resolve(path)
  const fileName = basename(filePath)
  // 监听目录避免绑定已被 rename 替换的旧文件；无文件名时保守地检查目标配置。
  const watcher = watch(dirname(filePath))
  const entry: WatchEntry = {
    watcher,
    callbacks: new Set(),
    debounceTimer: null,
  }
  watcher.on('change', (_eventType, changedName) => {
    if (changedName !== null && changedName !== fileName)
      return
    if (entry.debounceTimer)
      clearTimeout(entry.debounceTimer)
    entry.debounceTimer = setTimeout(() => {
      entry.debounceTimer = null
      if (watchEntries.get(name) === entry)
        reloadAndNotify(name)
    }, 100)
  })
  watcher.on('error', (cause) => {
    if (watchEntries.get(name) !== entry)
      return
    // 先释放监听，再通知订阅方，允许回调在底层恢复后注册新的监听。
    stopWatching(name)
    notifyWatchCallbacks(entry.callbacks, err(createWatchError(name, cause)))
  })
  watchEntries.set(name, entry)
  return entry
}

/**
 * 为一个已加载的配置注册监听回调。底层监听由当前配置名的回调共享。
 *
 * @param name - 配置名称
 * @param callback - 重载或监听失败的通知函数
 * @returns 取消本次订阅的函数；最后一个回调取消时关闭底层监听
 */
function registerWatch<T>(name: string, callback: WatchCallback<T>): () => void {
  const cached = configCache.get(name)
  if (!cached) {
    callback(null, createNotLoadedError(name))
    return () => { }
  }
  let entry: WatchEntry
  try {
    entry = watchEntries.get(name) ?? startFileWatcher(name, cached.filePath)
  }
  catch (cause) {
    callback(null, createWatchError(name, cause))
    return () => { }
  }

  entry.callbacks.add(callback as WatchCallback<unknown>)

  return () => {
    const current = watchEntries.get(name)
    if (current !== entry)
      return

    current.callbacks.delete(callback as WatchCallback<unknown>)
    if (current.callbacks.size === 0)
      stopWatching(name)
  }
}

/**
 * 停止监听（内部实现）。
 *
 * @param name - 配置名称；不传则停止所有监听并清空映射
 */
function stopWatching(name?: string): void {
  for (const key of name === undefined
    ? watchEntries.keys()
    : [name]) {
    const entry = watchEntries.get(key)
    if (!entry)
      continue
    watchEntries.delete(key)
    if (entry.debounceTimer)
      clearTimeout(entry.debounceTimer)
    entry.watcher.close()
  }
}

/**
 * 清理缓存（同时停止对应监听）。
 *
 * @param name - 配置名称；不传则清理全部缓存并停止所有监听
 */
function clearCache(name?: string): void {
  if (name !== undefined) {
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
   * 编码 dotenv，父变量排在细项前。Node dotenv 解析器会规范化单引号字面值中的回车。
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
   * 进程环境参与合并的键包括 HAI_ 前缀变量和 dotenv 文件已经声明的变量。
   * 返回值可能包含私有配置，仅在 Node 启动/构建边界注入，不下发浏览器。
   * @param options - 文件所在目录及环境模式
   * @param options.mode - dev/test/prod 或 Vite 的 development/production
   * @param options.envDir - dotenv 所在目录，默认进程工作目录
   * @returns 已合并的变量；非法模式或读取失败返回配置错误，不包含文件内容
   * @example
   * ```ts
   * import { core } from '@h-ai/core'
   * const env = core.config.loadEnvFiles({ mode: 'dev', envDir: '.' })
   * if (!env.success) throw new Error(env.error.message, { cause: env.error })
   * Object.assign(process.env, env.data)
   * core.init({ configDir: './config' })
   * ```
   */
  loadEnvFiles(options: { mode: string, envDir?: string }): HaiResult<Record<string, string>> {
    const mode = options.mode === 'development'
      ? 'dev'
      : options.mode === 'production'
        ? 'prod'
        : options.mode
    if (!/^[a-z0-9][\w-]*$/i.test(mode))
      return err(HaiConfigError.CONFIG_VALIDATION_ERROR, i18n.coreM('core_configValidationFailed'))
    const envDir = options.envDir ?? process.cwd()
    try {
      const layers: Array<Record<string, string | undefined>> = []
      for (const name of [
        '.env',
        `.env.${mode}`,
        '.env.local',
        `.env.${mode}.local`,
      ]) {
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
      return err(HaiConfigError.CONFIG_PARSE_ERROR, i18n.coreM('core_configParseFailed', {
        params: { filePath: envDir },
      }))
    }
  },

  /**
   * 加载配置到缓存。
   *
   * 读取 YAML、应用环境覆盖，再按可选 Schema 同步校验。校验成功后缓存数据和 Schema。
   *
   * @param name - 配置名称（缓存 key）
   * @param filePath - YAML 文件路径
   * @param schema - 可选 Zod Schema；环境变量按字段类型转换，同步校验可执行业务规则
   * @returns 解析或校验后的配置。校验失败保留原始 issues 或异常，旧缓存仍可读取。
   *
   * @example
   * ```ts
   * import { core, CoreConfigSchema } from '@h-ai/core'
   * const result = core.config.load('core', './config/_core.yml', CoreConfigSchema)
   * if (!result.success) throw new Error(result.error.message, { cause: result.error })
   * core.i18n.setGlobalLocale(result.data.defaultLocale)
   * ```
   */
  load<T>(name: string, filePath: string, schema?: ZodType<T>): HaiResult<T> {
    return loadAndCache(name, filePath, schema)
  },

  /**
   * 验证已加载的配置数据。
   *
   * 用 Schema 校验当前缓存数据，成功后以校验结果替换缓存，并为 reload 保存 Schema。
   * 需要按 Schema 解析 YAML 插值时，在 init 时提供结构提示，或直接将 Schema 传给 load。
   *
   * @param name - 配置名称
   * @param schema - 接受当前缓存值作为输入的同步 Zod Schema
   * @returns 校验后的配置；未加载返回 CONFIG_NOT_LOADED，Schema 失败返回 CONFIG_VALIDATION_ERROR
   *
   * @example
   * ```ts
   * import { core } from '@h-ai/core'
   * import { z } from 'zod'
   * const schema = z.object({ port: z.number().int().positive() })
   * core.init({ configDir: './config', configSchemas: { app: schema } })
   * const result = core.config.validate('app', schema)
   * if (!result.success) throw new Error(result.error.message, { cause: result.error })
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
      throw new Error(i18n.coreM('core_configNotLoaded', {
        params: { name },
      }))
    }
    return data
  },

  /**
   * 重新加载配置。
   *
   * 从磁盘重新读取配置，应用当前环境及缓存的 Schema。成功更新缓存，失败保留最近成功的值。两种结果均通知订阅方。
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
   * 监听父目录中的目标文件，支持普通写入、原子替换及删除后重建。重载失败保留最近成功的缓存。
   * 配置未加载时立即回调 CONFIG_NOT_LOADED。系统无法启动监听或已运行的监听出错时，回调收到 SERVICE_UNAVAILABLE，
   * 此时可以读取旧缓存，也可以在监听目录恢复后重新注册。
   *
   * @param name - 配置名称
   * @param callback - 配置变更回调，接收新配置或错误
   * @returns 取消监听函数
   *
   * @example
   * ```ts
   * import { core } from '@h-ai/core'
   * const stop = core.config.watch('app', (_settings, error) => {
   *   if (error) core.logger.warn('App config unavailable', { code: error.code })
   *   else core.logger.info('App config reloaded')
   * })
   * // 停止使用配置时解除本次订阅。
   * stop()
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
