/** 部署环境的加载和持久化；公开环境文件不保存真实凭据。 */
import type { HaiResult } from '@h-ai/core'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { parseEnv } from 'node:util'
import { core, err, ok } from '@h-ai/core'
import { LineCounter, parse, parseDocument } from 'yaml'
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

/** 与 Core 一致，普通字符串如 CORS 的 `*` 不能因 YAML 标量解析失败而使配置加载失败。 */
function environmentValue(value: string): unknown {
  try {
    return parse(value) ?? value
  }
  catch {
    return value
  }
}

/** 在已解析的 YAML 结构上处理覆盖，避免密码中的冒号、引号、井号变成 YAML 语法。 */
function resolveConfig(value: unknown, prefix: string, env: Record<string, string | undefined>): unknown {
  if (env[prefix] !== undefined)
    return environmentValue(env[prefix])
  if (Array.isArray(value))
    return value.map((item, index) => resolveConfig(item, `${prefix}_${index}`, env))
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, resolveConfig(nested, `${prefix}_${key.toUpperCase()}`, env)]))
  if (typeof value !== 'string')
    return value
  const resolved = value.replace(/\$\{([^:}]+)(?::([^}]*))?\}/g, (_match, name: string, fallback?: string) => env[name] ?? fallback ?? '')
  return /^\$\{[^}]+\}$/.test(value) ? environmentValue(resolved) : resolved
}

/**
 * 按部署环境解析配置；未选择的可选 Provisioner 缺少凭据时保留空值，选择完成后由 Schema 校验。
 * 不修改 core 缓存或进程变量，不在 YAML 文本上拼接凭据。
 * @param name - 模块配置名，例如 deploy/db/iam
 * @param path - YAML 文件绝对路径
 * @param values - 已加载的目标环境变量
 * @returns 配置对象；解析错误已脱敏
 * @example
 * ```ts
 * import { loadDeploymentConfig, loadDeploymentEnvironment } from '@h-ai/deploy'
 * const environment = loadDeploymentEnvironment({ environment: 'prod', envDir: process.cwd() })
 * if (!environment.success) throw new Error(environment.error.message)
 * const config = loadDeploymentConfig('deploy', `${process.cwd()}/config/_deploy.yml`, environment.data.values)
 * if (!config.success) throw new Error(config.error.message)
 * // 返回对象仍需经 DeployConfigSchema 或 deploy.init 验证。
 * ```
 */
export function loadDeploymentConfig(name: string, path: string, values: Record<string, string | undefined>): HaiResult<Record<string, unknown>> {
  try {
    const lineCounter = new LineCounter()
    const document = parseDocument(readFileSync(path, 'utf8'), { lineCounter, prettyErrors: false })
    if (document.errors.length)
      return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_configFileInvalid', { params: { path, line: String(lineCounter.linePos(document.errors[0]!.pos[0]).line) } }))
    const config = resolveConfig(document.toJS(), `HAI_${name.toUpperCase()}`, values)
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
 * 进程环境优先于 .env.local、目标环境文件、基础文件；targetValues 只记录目标文件显式项，不包含其它覆盖。
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
    const values = { ...loaded.data }
    // 只传递应用配置和显式声明的运行变量，不上传整个调用者进程环境。
    for (const [name, value] of Object.entries(process.env)) {
      if (/^(?:HAI_|PUBLIC_|VITE_)/.test(name) && value !== undefined)
        values[name] = value
    }
    values.HAI_DEPLOY_ENVIRONMENT = environment
    values.HAI_CORE_ENV ??= environment === 'prod' ? 'production' : environment === 'dev' ? 'development' : environment === 'test' ? 'test' : 'staging'
    const targetValues: Record<string, string> = {}
    if (existsSync(target)) {
      for (const [name, value] of Object.entries(parseEnv(readFileSync(target, 'utf8')))) {
        if (value !== undefined)
          targetValues[name] = value
      }
    }
    return ok({ environment, envDir, values, targetValues })
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

/** 将 JSON 中的凭据剥离，公共文件仍保留可审查的后端/连接结构。 */
function publicConfig(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(publicConfig)
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).filter(([name, item]) => !isSecret(name, typeof item === 'string' ? item : '')).map(([name, item]) => [name, publicConfig(item)]))
  return value
}

/** dotenv 引号保留空格、注释符、美元符号和 JSON；非法换行键由调用边界拒绝。 */
function quoteEnv(value: string): string {
  // JSON 内用 Unicode 转义表示单引号，dotenv 单引号即可无损保存复杂密码。
  try {
    const parsed: unknown = JSON.parse(value)
    if (parsed && typeof parsed === 'object')
      return `'${JSON.stringify(parsed).replaceAll('\'', '\\u0027')}'`
  }
  catch { /* 标量按 dotenv 原生引号规则处理。 */ }
  if (!value.includes('\''))
    return `'${value}'`
  if (!value.includes('"'))
    return `"${value}"`
  if (!value.includes('`'))
    return `\`${value}\``
  if (!/[\r\n#]/.test(value))
    return value
  throw new Error('Unsupported dotenv value')
}

/** 按原有行更新键，保留注释与其他配置；更新私有文件时要求权限 600。 */
function updateFile(path: string, values: Record<string, string>, privateFile: boolean): void {
  let content = existsSync(path) ? readFileSync(path, 'utf8') : '# Local private deployment configuration; do not commit.\n'
  for (const [name, value] of Object.entries(values)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name))
      throw new Error('Invalid environment variable name')
    const line = `${name}=${quoteEnv(value)}`
    // parseEnv 支持多行引号；替换时一起消费原值，避免遗留秘密片段。
    const pattern = new RegExp(`^(?:export\\s+)?${name}\\s*=\\s*(?:'[^']*'|"[^"]*"|\`[^\`]*\`|[^\\r\\n]*)[^\\r\\n]*`, 'gm')
    if (pattern.test(content))
      content = content.replace(pattern, () => line)
    else
      content = `${content.trimEnd()}\n${line}\n`
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
    content = content.replace(new RegExp(`^(?:export\\s+)?${name}\\s*=\\s*(?:'[^']*'|"[^"]*"|\`[^\`]*\`|[^\\r\\n]*)[^\\r\\n]*(?:\\r?\\n|$)`, 'gm'), '')
  writeFileSync(path, content, { mode: privateFile ? 0o600 : 0o644 })
  chmodSync(path, privateFile ? 0o600 : 0o644)
}

/**
 * 保存部署产生的变量：公共值写目标环境文件，凭据写 `.env.local`。
 * 返回实际写入的变量名，调用者只展示名称或脱敏值。
 * @param environment - 已加载的目标环境快照
 * @param values - 需要更新的变量；未提供的项保持原状
 * @param options - private 为 true 时所有值只保存在本机；适用于 SSH 地址、端口及密钥路径
 * @param options.private - 是否将全部值仅保存到 .env.local
 * @returns 已保存的变量名或脱敏错误
 * @example
 * ```ts
 * import { loadDeploymentEnvironment, saveDeploymentEnvironment } from '@h-ai/deploy'
 * const loaded = loadDeploymentEnvironment({ environment: 'prod', envDir: process.cwd() })
 * if (!loaded.success) throw new Error(loaded.error.message)
 * const saved = saveDeploymentEnvironment(loaded.data, { HAI_DB_HOST: 'db' })
 * if (!saved.success) throw new Error(saved.error.message)
 * // 密钥应以 { private: true } 写入被忽略的 .env.local，不能放公共环境文件。
 * ```
 */
export function saveDeploymentEnvironment(environment: DeploymentEnvironment, values: Record<string, string>, options: { private?: boolean } = {}): HaiResult<string[]> {
  try {
    const shared: Record<string, string> = {}
    const privateValues: Record<string, string> = {}
    for (const [name, value] of Object.entries(values)) {
      if (options.private) {
        privateValues[name] = value
      }
      else if (isSecret(name, value)) {
        privateValues[name] = value
        try {
          const parsed: unknown = JSON.parse(value)
          if (parsed && typeof parsed === 'object')
            shared[name] = JSON.stringify(publicConfig(parsed))
        }
        catch { /* 标量秘密仅写私有文件。 */ }
      }
      else {
        shared[name] = value
      }
    }
    if (Object.keys(shared).length)
      updateFile(join(environment.envDir, `.env.${environment.environment}`), shared, false)
    if (Object.keys(privateValues).length)
      updateFile(join(environment.envDir, '.env.local'), privateValues, true)
    removeOverrides(join(environment.envDir, `.env.${environment.environment}`), Object.keys(privateValues).filter(name => !(name in shared)), false)
    removeOverrides(join(environment.envDir, '.env.local'), Object.keys(shared).filter(name => !(name in privateValues)))
    if (Object.keys(privateValues).length) {
      const ignorePath = join(environment.envDir, '.gitignore')
      const ignore = existsSync(ignorePath) ? readFileSync(ignorePath, 'utf8') : ''
      if (!ignore.split(/\r?\n/).includes('.env.local'))
        writeFileSync(ignorePath, `${ignore.trimEnd()}\n.env.local\n.hai/deploy/\n`)
    }
    return ok(Object.keys(values))
  }
  catch {
    return err(HaiDeployError.ENV_VAR_FAILED, deployM('deploy_environmentWriteFailed'))
  }
}
