/** 原生工具在 Node 边界解析 Core 名称，不初始化服务或导出完整配置。 */
import process from 'node:process'
import { core, CoreConfigSchema } from '@h-ai/core'

/**
 * 只将显式名称和环境模式传给原生构建子进程，父 JSON 中的其他字段不透传。
 * @param {string} [envDir] 指定时先读取该目录的环境文件，供隔离容器的名称输入使用。
 * @returns {Record<string, string>} 原生名称的公开构建输入。
 */
export function nativeNameEnvironment(envDir) {
  let inputs = process.env
  /** @type {string | undefined} */
  let selectedMode
  if (envDir) {
    const explicit = core.config.resolve({ name: 'core', value: {}, schema: CoreConfigSchema })
    if (!explicit.success)
      throw new Error(explicit.error.message)
    selectedMode = /** @type {{ env?: string }} */ (explicit.data).env ?? 'production'
    const loaded = core.config.loadEnvFiles({ envDir, mode: selectedMode })
    if (!loaded.success)
      throw new Error(loaded.error.message)
    inputs = loaded.data
  }
  const resolved = core.config.resolve({ name: 'core', value: {}, schema: CoreConfigSchema, environment: inputs })
  if (!resolved.success)
    throw new Error(resolved.error.message)
  const value = /** @type {Record<string, unknown>} */ (resolved.data)
  /** @type {Record<string, string>} */
  const environment = {}
  for (const key of ['name', 'env']) {
    if (value[key] === undefined)
      continue
    const schema = key === 'name' ? CoreConfigSchema.shape.name : CoreConfigSchema.shape.env
    const parsed = schema.safeParse(value[key])
    if (!parsed.success)
      throw new Error(`Invalid HAI_CORE_${key.toUpperCase()}`)
    environment[`HAI_CORE_${key.toUpperCase()}`] = parsed.data
  }
  // 保留本次入口选择的模式，避免 dotenv 的运行环境字段改变子进程二次加载的文件集合。
  if (selectedMode)
    environment.HAI_CORE_ENV = selectedMode
  return environment
}

/**
 * 按 Core 统一的 dotenv 优先级加载名称；环境只在同步解析期间注入并在结束后还原。
 * @param {string} envDir 环境文件目录。
 * @param {string} configFile Core YAML 的绝对路径。
 * @param {string} [mode] 未指定时使用显式 Core 模式、NODE_ENV，最后默认为 prod。
 * @returns {string} 应用显示名称。
 */
export function resolveNativeName(envDir, configFile, mode) {
  const overrides = nativeNameEnvironment()
  const loaded = core.config.loadEnvFiles({ mode: overrides.HAI_CORE_ENV ?? mode ?? process.env.NODE_ENV ?? 'prod', envDir })
  if (!loaded.success)
    throw new Error(loaded.error.message)
  const previous = new Map(Object.keys(loaded.data).map(key => [key, process.env[key]]))
  try {
    Object.assign(process.env, loaded.data)
    const result = core.config.load('core', configFile, CoreConfigSchema)
    if (!result.success)
      throw new Error(result.error.message)
    if (!result.data.name.trim())
      throw new Error('Invalid HAI_CORE_NAME: expected a nonempty application name')
    return result.data.name
  }
  finally {
    for (const [key, value] of previous) {
      if (value === undefined)
        delete process.env[key]
      else
        process.env[key] = value
    }
  }
}
