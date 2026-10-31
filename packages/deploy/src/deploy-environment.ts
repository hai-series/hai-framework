/** 部署环境的加载和持久化；公开环境文件不保存真实凭据。 */
import type { HaiResult } from '@h-ai/core'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import process from 'node:process'
import { core, err, ok } from '@h-ai/core'
import { LineCounter, parseDocument } from 'yaml'
import configurationShapes from './deploy-config-shapes.json' with { type: 'json' }
import { deployM } from './deploy-i18n.js'
import { HaiDeployError } from './deploy-types.js'

/**
 * 部署环境快照；例如 prod 的 targetValues 只来自 `.env.prod`，不包含基础/私有覆盖。
 * @example
 * ```ts
 * import type { DeploymentEnvironment } from '@h-ai/deploy'
 * const environment: DeploymentEnvironment = { environment: 'prod', envDir: '/workspace/shop', values: { HAI_DB_TYPE: 'postgresql' }, targetValues: { HAI_DB_TYPE: 'postgresql' } }
 * // values 可能还含私有凭据，不能整体写入日志。
 * ```
 */
export interface DeploymentEnvironment {
  /** 文件模式（dev/test/prod 或其他合法模式名）。 */
  environment: string
  /** 环境文件的绝对目录。 */
  envDir: string
  /** 合并后的部署变量，可能含私有值，不得直接记录日志。 */
  values: Record<string, string>
  /** 仅目标环境文件显式声明的变量，用于判断能否“保持不变”。 */
  targetValues: Record<string, string>
}

/** 结构由模块公开 Schema 自动生成；SDK 不维护模块字段解析规则。 */
const shapes: Record<string, Record<string, unknown>> = configurationShapes

/** 读取单层 dotenv；所有错误由调用边界转换为脱敏 HaiResult。 */
function environmentFile(path: string): Record<string, string> {
  const values: Record<string, string> = {}
  if (existsSync(path)) {
    for (const [name, value] of Object.entries(core.config.parseEnv(readFileSync(path, 'utf8')))) {
      if (value !== undefined)
        values[name] = value
    }
  }
  return values
}

/**
 * 按来源归并环境变量；HAI 高层父配置清除旧叶，同层按父→叶处理。
 * @param layers - 从低到高优先级的环境来源。
 * @param prefix - 可选变量前缀，仅归并该模块。
 * @returns 归并后的字面量环境变量，可能包含秘密。
 * @example 模块内部上下文
 * ```ts
 * const env = mergeEnvironmentLayers([{ HAI_CACHE_TYPE: 'memory' }, { HAI_CACHE: '{"type":"redis"}' }])
 * ```
 */
export function mergeEnvironmentLayers(layers: Array<Record<string, string | undefined>>, prefix?: string): Record<string, string> {
  return core.config.mergeEnv(layers.map(layer => Object.fromEntries(Object.entries(layer).filter(([name]) => !prefix || name === prefix || name.startsWith(`${prefix}_`)))))
}

/**
 * 只描述变量名与来源，不把初始密码等变量值带入交付说明。
 * @param directory - 打包源工程的环境文件目录。
 * @param environment - 本次交付选择的环境名。
 * @param values - 已解析的有效环境变量，可能包含私密值。
 * @param names - 需要在交付说明中解释的变量名。
 * @returns 已配置变量的名称及来源，不含变量值。
 * @example 模块内部上下文
 * ```ts
 * const environment = loadDeploymentEnvironment({ environment: 'prod', envDir: process.cwd() })
 * if (environment.success) {
 *   const sources = describeDeploymentVariableSources(environment.data.envDir, 'prod', environment.data.values, ['HAI_CONFIG_ADMIN_PASSWORD'])
 *   // sources 仅包含变量名和来源，可以写入交付说明。
 * }
 * ```
 */
export function describeDeploymentVariableSources(directory: string, environment: string, values: Record<string, string>, names: readonly string[]): string {
  const files = [`.env.${environment}.local`, '.env.local', `.env.${environment}`, '.env']
    .map(name => ({ path: join(directory, name), values: environmentFile(join(directory, name)) }))
  return names.filter(name => values[name]).map((name) => {
    const source = process.env[name] !== undefined ? 'process.env' : files.find(file => Object.hasOwn(file.values, name))?.path
    return `${name}: ${source ?? '.env.runtime'}`
  }).join('\n')
}

/**
 * 按部署环境解析配置；未选择的可选 Provisioner 缺少凭据时保留空值，选择完成后由 Schema 校验。
 * hai.json 只读取对应的根分区；运行时模块继续读取 YAML。不修改 core 缓存或进程变量。
 * @param name - 模块配置名，例如 deploy/db/iam
 * @param path - hai.json 或运行时 YAML 文件的绝对路径
 * @param values - 已加载的目标环境变量
 * @returns 配置对象；解析错误已脱敏
 * @example
 * ```ts
 * import { loadDeploymentConfig, loadDeploymentEnvironment } from '@h-ai/deploy'
 * const environment = loadDeploymentEnvironment({ environment: 'prod', envDir: process.cwd() })
 * if (!environment.success) throw new Error(environment.error.message)
 * const config = loadDeploymentConfig('deploy', `${process.cwd()}/hai.json`, environment.data.values)
 * if (!config.success) throw new Error(config.error.message)
 * // 返回对象仍需经 DeployConfigSchema 或 deploy.init 验证。
 * ```
 */
export function loadDeploymentConfig(name: string, path: string, values: Record<string, string | undefined>): HaiResult<Record<string, unknown>> {
  try {
    const content = readFileSync(path, 'utf8')
    let input: unknown
    if (extname(path).toLowerCase() === '.json') {
      try {
        const project: unknown = JSON.parse(content)
        input = project && typeof project === 'object' && !Array.isArray(project) ? (project as Record<string, unknown>)[name] : undefined
      }
      catch {
        return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_configFileInvalid', { params: { path, line: '1' } }))
      }
      if (!input || typeof input !== 'object' || Array.isArray(input))
        return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_configFileInvalid', { params: { path, line: '1' } }))
    }
    else {
      const lineCounter = new LineCounter()
      const document = parseDocument(content, { lineCounter, prettyErrors: false })
      if (document.errors.length)
        return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_configFileInvalid', { params: { path, line: String(lineCounter.linePos(document.errors[0]!.pos[0]).line) } }))
      input = document.toJS()
    }
    const resolved = core.config.resolve({ name, value: input, environment: values, shape: shapes[name], missing: 'empty' })
    if (!resolved.success)
      return resolved
    const config = resolved.data
    if (config !== null && (typeof config !== 'object' || Array.isArray(config)))
      return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_configFileInvalid', { params: { path, line: '1' } }))
    return ok(config && typeof config === 'object' && !Array.isArray(config) ? config as Record<string, unknown> : {})
  }
  catch {
    return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_configFileUnreadable', { params: { path } }))
  }
}

/**
 * 加载部署环境；指定环境文件缺失时返回错误并要求用户创建。
 * 统一按进程 > 模式私有 > 全局私有 > 模式公共 > 基础归并；targetValues 仅记录模式公共项。
 * @param options - 模式、环境目录与是否强制存在目标文件
 * @param options.environment - dev/test/prod 或自定义模式
 * @param options.envDir - 环境文件所在目录
 * @param options.requireFile - 默认 true；扫描无显式环境时可只读取已有基础文件
 * @returns 环境快照，可能包含私有值，不得直接输出
 * @example
 * ```ts
 * import { loadDeploymentEnvironment } from '@h-ai/deploy'
 * const loaded = loadDeploymentEnvironment({ environment: 'prod', envDir: process.cwd() })
 * if (!loaded.success) throw new Error(loaded.error.message)
 * const explicitlyConfigured = loaded.data.targetValues.HAI_DB_TYPE
 * ```
 */
export function loadDeploymentEnvironment(options: { environment: string, envDir: string, requireFile?: boolean }): HaiResult<DeploymentEnvironment> {
  const environment = options.environment === 'production' ? 'prod' : options.environment === 'development' ? 'dev' : options.environment
  if (!/^[a-z0-9][\w-]*$/i.test(environment) || ['local', 'example'].includes(environment.toLowerCase()))
    return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_invalidEnvironment'))
  const envDir = resolve(options.envDir)
  const target = join(envDir, `.env.${environment}`)
  if (options.requireFile !== false && !existsSync(target))
    return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_environmentMissing', { params: { path: target } }))
  const loaded = core.config.loadEnvFiles({ mode: environment, envDir })
  if (!loaded.success)
    return loaded
  try {
    const selected = environmentFile(target)
    const values = { ...loaded.data }
    // Core 负责所有 HAI 配置的统一来源归并；公开构建入口仅携带显式进程注入。
    for (const [name, value] of Object.entries(process.env)) {
      if (/^(?:PUBLIC_|VITE_)/.test(name) && value !== undefined)
        values[name] = value
    }
    values.HAI_DEPLOY_ENVIRONMENT = environment
    if (values.HAI_CORE_ENV === undefined) {
      const fallback = environment === 'prod' ? 'production' : environment === 'dev' ? 'development' : environment === 'test' ? 'test' : 'staging'
      const configured = core.config.resolve({ name: 'core', value: { env: fallback }, environment: values, shape: shapes.core })
      const settings = configured.success && configured.data && typeof configured.data === 'object' ? configured.data as Record<string, unknown> : undefined
      values.HAI_CORE_ENV = typeof settings?.env === 'string' ? settings.env : fallback
    }
    return ok({ environment, envDir, values, targetValues: selected })
  }
  catch {
    return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_environmentReadFailed'))
  }
}

/** 判断值是否包含凭据；连接 URL 和 JSON 配置需要递归检查。 */
function isSecret(name: string, value: string): boolean {
  if (/PASSWORD|SECRET|TOKEN|APIKEY|PRIVATEKEY|ACCESSKEY|AUTHORIZATION/i.test(name.replace(/[^a-z0-9]/gi, '')) || /(?:^|_)PASS$/i.test(name) || value.includes('PRIVATE KEY'))
    return true
  try {
    const url = new URL(value)
    if (url.username || url.password || [...url.searchParams.keys()].some(key => /password|secret|token|key|authorization/i.test(key)))
      return true
  }
  catch { /* 非 URL 配置继续按结构检查。 */ }
  try {
    const parsed: unknown = JSON.parse(value)
    if (parsed && typeof parsed === 'object')
      return Object.entries(parsed).some(([key, nested]) => isSecret(key, typeof nested === 'string' ? nested : JSON.stringify(nested)))
  }
  catch { /* 普通字符串无需 JSON 处理。 */ }
  return false
}

/**
 * 生成端优先细项；字符串字段的含义仍由模块结构决定。
 * @example 模块内部上下文
 * ```ts
 * const values = generatedVariables({ HAI_STORAGE: { type: 's3', bucket: 'files' } })
 * ```
 */
export function generatedVariables(values: Record<string, unknown>): Record<string, string> {
  const generated: Record<string, string> = {}
  const groups = new Map<string, Record<string, string>>()
  const structures = new Set<string>()
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined)
      continue
    const text = typeof value === 'string' ? value : value === null || typeof value === 'object' ? JSON.stringify(value) : String(value)
    generated[name] = text
    const module = /^HAI_([A-Z0-9]+)(?:_|$)/.exec(name)?.[1]?.toLowerCase()
    if (!module || !shapes[module])
      continue
    const group = groups.get(module) ?? {}
    group[name] = text
    groups.set(module, group)
    try {
      const parsed: unknown = JSON.parse(text)
      if (parsed !== null && typeof parsed === 'object')
        structures.add(name)
    }
    catch { /* 标量保持原样，不猜测字符串业务含义。 */ }
  }
  for (const [module, group] of groups) {
    const structuredNames = Object.keys(group).filter(name => structures.has(name))
    if (!structuredNames.length)
      continue
    const resolved = core.config.resolve({ name: module, value: {}, environment: group, shape: shapes[module], missing: 'empty' })
    if (resolved.success) {
      const flattened = core.config.toEnv({ prefix: `HAI_${module.toUpperCase()}`, value: resolved.data, shape: shapes[module] })
      const represented = structuredNames.every(name => Object.entries(flattened).some(([key, value]) => key === name || key.startsWith(`${name}_`) || (name.startsWith(`${key}_`) && value.startsWith('['))))
      if (represented) {
        for (const name of Object.keys(group)) {
          if (structures.has(name) || Object.keys(flattened).some(key => name === key || key.startsWith(`${name}_`)))
            delete generated[name]
        }
        Object.assign(generated, flattened)
        // 展开父对象仍保留最小空节点，明确替换 YAML，防止旧可选字段重新出现。
        const replacements = structuredNames.filter((name) => {
          const parsed: unknown = JSON.parse(group[name]!)
          return parsed !== null && !Array.isArray(parsed) && typeof parsed === 'object' && Object.keys(flattened).some(key => key.startsWith(`${name}_`))
        }).sort((left, right) => left.length - right.length)
        const ancestors: string[] = []
        for (const name of replacements) {
          if (!ancestors.some(parent => name.startsWith(`${parent}_`))) {
            generated[name] = '{}'
            ancestors.push(name)
          }
        }
        continue
      }
    }
    // 未声明完整列表时，只展开已有数组项；不猜测或创建列表长度。
    for (const name of structuredNames.filter(name => /_\d+$/.test(name))) {
      delete generated[name]
      const flattened = core.config.toEnv({ prefix: name, value: JSON.parse(group[name]!) })
      Object.assign(generated, flattened)
      if (Object.keys(flattened).some(key => key.startsWith(`${name}_`)))
        generated[name] = '{}'
    }
  }
  return generated
}

/** 按原有行更新键，保留注释与其他配置；更新私有文件时要求权限 600。 */
function updateFile(path: string, values: Record<string, string>, privateFile: boolean): void {
  let content = existsSync(path) ? readFileSync(path, 'utf8') : '# Local private deployment configuration; do not commit.\n'
  for (const [name, value] of Object.entries(values)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name))
      throw new Error('Invalid environment variable name')
    const line = core.config.stringifyEnv({ [name]: value }).trimEnd()
    // parseEnv 支持多行引号；替换时一起消费原值，避免遗留秘密片段。
    const pattern = new RegExp(`^(?:export\\s+)?${name}\\s*=\\s*(?:'[^']*'|"(?:[^"\\\\]|\\\\.)*"|\`[^\`]*\`|[^\\r\\n]*)[^\\r\\n]*`, 'gm')
    if (pattern.test(content))
      content = content.replace(pattern, () => line)
    else
      content = `${content.trimEnd()}\n${line}\n`
  }
  // 手工内容和注释保留；结构基础移动到其细项前，文件阅读顺序与合并顺序一致。
  for (const [name, value] of Object.entries(core.config.parseEnv(content)).sort(([left], [right]) => left.length - right.length)) {
    if (!name.startsWith('HAI_') || !/^\s*[[{]/.test(value))
      continue
    const parent = new RegExp(`^(?:export\\s+)?${name}\\s*=\\s*(?:'[^']*'|"(?:[^"\\\\]|\\\\.)*"|\`[^\`]*\`|[^\\r\\n]*)[^\\r\\n]*(?:\\r?\\n|$)`, 'm').exec(content)
    const child = new RegExp(`^(?:export\\s+)?${name}_[A-Z0-9_]+\\s*=`, 'm').exec(content)
    if (parent && child && parent.index > child.index) {
      const withoutParent = content.slice(0, parent.index) + content.slice(parent.index + parent[0].length)
      content = withoutParent.slice(0, child.index) + parent[0].replace(/\r?\n?$/, '\n') + withoutParent.slice(child.index)
    }
  }
  writeFileSync(path, content, { mode: privateFile ? 0o600 : 0o644 })
  if (privateFile)
    chmodSync(path, 0o600)
}

/** 明确修改的公共项必须清掉同名旧私有覆盖，避免重新加载后仍用旧后端。 */
function removeOverrides(path: string, names: string[], privateFile = true): void {
  if (!existsSync(path) || names.length === 0)
    return
  let content = readFileSync(path, 'utf8')
  for (const name of names)
    content = content.replace(new RegExp(`^(?:export\\s+)?${name}\\s*=\\s*(?:'[^']*'|"(?:[^"\\\\]|\\\\.)*"|\`[^\`]*\`|[^\\r\\n]*)[^\\r\\n]*(?:\\r?\\n|$)`, 'gm'), '')
  writeFileSync(path, content, { mode: privateFile ? 0o600 : 0o644 })
  chmodSync(path, privateFile ? 0o600 : 0o644)
}

/**
 * 保存部署变量：公共值写目标环境文件，凭据写 `.env.<environment>.local`；旧共享私有文件不删除。
 * 返回实际写入的变量名，调用者只展示名称或脱敏值。
 * @param environment - 已加载的目标环境快照
 * @param values - 需要更新的变量；未提供的项保持原状
 * @param options - private 为 true 时所有值只保存在本机；适用于 SSH 地址、端口及密钥路径
 * @param options.private - 是否将全部值保存到选中模式的私有文件
 * @param options.replace - 本次完整替换的配置前缀，只清理该模式中对应项。
 * @returns 已保存的变量名或脱敏错误
 * @example
 * ```ts
 * import { loadDeploymentEnvironment, saveDeploymentEnvironment } from '@h-ai/deploy'
 * const loaded = loadDeploymentEnvironment({ environment: 'prod', envDir: process.cwd() })
 * if (!loaded.success) throw new Error(loaded.error.message)
 * const saved = saveDeploymentEnvironment(loaded.data, { HAI_DB_HOST: 'db' })
 * if (!saved.success) throw new Error(saved.error.message)
 * // 密钥应以 { private: true } 写入被忽略的 .env.prod.local，不能放公共环境文件。
 * ```
 */
export function saveDeploymentEnvironment(environment: DeploymentEnvironment, values: Record<string, unknown>, options: { private?: boolean, replace?: readonly string[] } = {}): HaiResult<string[]> {
  try {
    const shared: Record<string, string> = {}
    const privateValues: Record<string, string> = {}
    // 数组保留一个公共结构，秘密仅以索引细项写私有文件，不复制完整数组。
    function splitArrayValue(name: string, value: unknown): unknown {
      const literal = typeof value === 'string' ? value : JSON.stringify(value)
      if (!isSecret(name, literal))
        return value
      if (Array.isArray(value))
        return value.map((item, index) => splitArrayValue(`${name}_${index}`, item) ?? null)
      if (value && typeof value === 'object' && !isSecret(name, '') && Object.keys(value).every(key => /^[a-z][a-zA-Z0-9]*$/.test(key)))
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, splitArrayValue(`${name}_${key.toUpperCase()}`, item)]).filter(([, item]) => item !== undefined))
      privateValues[name] = literal
      return undefined
    }
    const generated = generatedVariables(values)
    for (const prefix of options.replace ?? []) {
      for (const file of [`.env.${environment.environment}`, `.env.${environment.environment}.local`]) {
        const path = join(environment.envDir, file)
        removeOverrides(path, Object.keys(environmentFile(path)).filter(name => name === prefix || name.startsWith(`${prefix}_`)), file.endsWith('.local'))
      }
    }
    for (const [name, value] of Object.entries(generated)) {
      if (options.private) {
        privateValues[name] = value
        continue
      }
      if (!isSecret(name, value)) {
        shared[name] = value
        continue
      }
      let array: unknown
      try {
        array = JSON.parse(value)
      }
      catch { /* 标量秘密只保存到私有文件。 */ }
      if (Array.isArray(array))
        shared[name] = JSON.stringify(splitArrayValue(name, array))
      else privateValues[name] = value
    }
    // 替换生成端负责的整段配置时清理同模式父对象，避免私有父对象遮蔽新细项。
    const expanded = Object.keys(values).filter(name => !Object.hasOwn(generated, name))
    removeOverrides(join(environment.envDir, `.env.${environment.environment}`), expanded, false)
    removeOverrides(join(environment.envDir, `.env.${environment.environment}.local`), expanded)
    const privatePath = join(environment.envDir, `.env.${environment.environment}.local`)
    const globalPrivate = environmentFile(join(environment.envDir, '.env.local'))
    // 非部署模块保留旧 private 优先级；显式换后端时在当前模式遮盖旧值，不破坏其它环境的 fallback。
    for (const [name, value] of Object.entries(shared)) {
      if (!(name in privateValues) && Object.keys(globalPrivate).some(parent => name === parent || name.startsWith(`${parent}_`))) {
        privateValues[name] = value
        delete shared[name]
      }
    }
    if (Object.keys(shared).length)
      updateFile(join(environment.envDir, `.env.${environment.environment}`), shared, false)
    if (Object.keys(privateValues).length)
      updateFile(privatePath, privateValues, true)
    removeOverrides(join(environment.envDir, `.env.${environment.environment}`), Object.keys(privateValues).filter(name => !(name in shared)), false)
    removeOverrides(privatePath, Object.keys(shared).filter(name => !(name in privateValues)))
    if (Object.keys(privateValues).length) {
      const ignorePath = join(environment.envDir, '.gitignore')
      const ignore = existsSync(ignorePath) ? readFileSync(ignorePath, 'utf8') : ''
      const missing = ['.env.local', '.env.*.local', '.hai/deploy/'].filter(line => !ignore.split(/\r?\n/).includes(line))
      if (missing.length)
        writeFileSync(ignorePath, `${ignore.trimEnd()}\n${missing.join('\n')}\n`)
    }
    return ok(Object.keys(values))
  }
  catch {
    return err(HaiDeployError.ENV_VAR_FAILED, deployM('deploy_environmentWriteFailed'))
  }
}
