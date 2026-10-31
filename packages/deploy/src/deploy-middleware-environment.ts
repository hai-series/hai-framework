/** 中间件表单值与模块配置之间的部署适配；CLI 仅收集输入，不解释模块字段。 */
import type { HaiResult } from '@h-ai/core'
import type { DeploymentEnvironment } from './deploy-environment.js'
import type { MiddlewareBackend, MiddlewareField } from './deploy-middleware.js'
import type { MiddlewareRequirement } from './deploy-types.js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { core, err, ok } from '@h-ai/core'
import { MysqlSslConfigSchema, ReldbConfigSchema, SslConfigSchema } from '@h-ai/reldb/schemas'
import { parseDocument } from 'yaml'
import configurationShapes from './deploy-config-shapes.json' with { type: 'json' }
import { saveDeploymentEnvironment } from './deploy-environment.js'
import { deployM } from './deploy-i18n.js'
import { HaiDeployError } from './deploy-types.js'

/**
 * 判断目标模式是否显式配置了所选连接，凭据可来自更高优先级的私有来源。
 * @param requirement - 扫描得到的连接需求。
 * @param backend - 选择的后端及连接字段目录。
 * @param environment - 合并值与目标文件的原始值。
 * @returns 目标文件声明后端和必要连接字段时为 true。
 * @example
 * ```ts
 * import { canKeepMiddleware, DEPLOY_MIDDLEWARE } from '@h-ai/deploy'
 * const keep = canKeepMiddleware({ service: 'cache', backend: 'memory', source: 'cache', configName: 'cache', configPath: [], envPrefix: 'HAI_CACHE', config: {} }, DEPLOY_MIDDLEWARE.cache[0]!, { environment: 'test', envDir: '.', values: {}, targetValues: { HAI_CACHE_TYPE: 'memory' } })
 * ```
 */
export function canKeepMiddleware(requirement: MiddlewareRequirement, backend: MiddlewareBackend, environment: DeploymentEnvironment): boolean {
  if (requirement.service === 'ldap' && backend.backend === 'disabled')
    return environment.targetValues.HAI_IAM_LOGIN_LDAP === 'false'
  const structures: Record<string, Record<string, unknown>> = configurationShapes
  function empty(value: unknown): unknown {
    if (Array.isArray(value))
      return value.map(empty)
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([name, child]) => [name, empty(child)]))
    return undefined
  }
  let seed = empty(requirement.config)
  for (const part of [...requirement.configPath].reverse())
    seed = /^\d+$/.test(part) ? Array.from({ length: Number(part) + 1 }, (_, index) => index === Number(part) ? seed : null) : { [part]: seed }
  const resolved = core.config.resolve({ name: requirement.configName, value: seed, environment: environment.targetValues, shape: structures[requirement.configName], missing: 'empty' })
  if (!resolved.success)
    return false
  let value = resolved.data
  for (const part of requirement.configPath)
    value = value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false
  const target = value as Record<string, unknown>
  if (requirement.service !== 'ldap' && target.type !== backend.backend)
    return false
  return backend.fields.filter(field => field.required && !field.secret).every((field) => {
    if ((target.url || (requirement.config.url && Object.values(target).some(item => item !== undefined))) && ['host', 'port'].includes(field.name))
      return true
    return target[field.name] !== undefined && target[field.name] !== ''
  }) && backend.fields.filter(field => field.required && field.secret).every(field => Boolean(requirement.config[field.name] || environment.values[`${requirement.envPrefix}_${field.name.toUpperCase()}`]))
}

/**
 * 校验部署连接字段，TLS 复用数据库模块的公开 Schema。
 * @param options - 原始值、字段定义及实际后端。
 * @param options.value - 字面输入值。
 * @param options.field - 已声明的连接字段。
 * @param options.backend - 实际后端名称。
 * @returns 输入有效时为 true，不包含输入值或凭据。
 * @example
 * ```ts
 * import { validateMiddlewareField } from '@h-ai/deploy'
 * const valid = validateMiddlewareField({ value: '5432', field: { name: 'port', kind: 'port' }, backend: 'postgresql' })
 * ```
 */
export function validateMiddlewareField(options: { value: string, field: MiddlewareField, backend: string }): boolean {
  const { value, field, backend } = options
  if (value === '')
    return !field.required
  if (field.kind === 'port')
    return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535
  if (field.kind === 'number')
    return /^\d+$/.test(value) && Number(value) >= (field.minimum ?? 0) && Number(value) <= (field.maximum ?? Number.MAX_SAFE_INTEGER)
  if (field.kind === 'boolean')
    return ['true', 'false'].includes(value)
  if (field.kind === 'url') {
    try {
      return Boolean(new URL(value).protocol)
    }
    catch { return false }
  }
  if (field.name === 'ssl') {
    const document = parseDocument(value)
    return !document.errors.length && (backend === 'mysql' ? MysqlSslConfigSchema : SslConfigSchema).safeParse(document.toJS()).success
  }
  if (field.name === 'headers') {
    try {
      const headers: unknown = JSON.parse(value)
      return headers !== null && typeof headers === 'object' && !Array.isArray(headers) && Object.values(headers).every(item => typeof item === 'string')
    }
    catch { return false }
  }
  return field.name !== 'method' || ['POST', 'PUT'].includes(value)
}

/**
 * 将已校验表单值还原为连接字段类型，不进行 dotenv 序列化。
 * @param options - 输入值、字段和后端。
 * @param options.value - 字面输入值。
 * @param options.field - 已声明的连接字段。
 * @param options.backend - 实际后端名称。
 * @param options.managed - 默认开通时允许托管秘密尚未生成。
 * @returns 类型化值或配置错误；空值表示移除该可选字段。
 * @example
 * ```ts
 * import { parseMiddlewareField } from '@h-ai/deploy'
 * const parsed = parseMiddlewareField({ value: 'false', field: { name: 'secure', kind: 'boolean' }, backend: 'smtp' })
 * if (!parsed.success) throw new Error(parsed.error.message)
 * ```
 */
export function parseMiddlewareField(options: { value: string, field: MiddlewareField, backend: string, managed?: boolean }): HaiResult<unknown> {
  if (options.managed && (options.field.secret || options.field.managed) && options.value === '')
    return ok(undefined)
  if (!validateMiddlewareField(options))
    return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_middlewareFieldInvalid', { params: { fields: options.field.name } }))
  const { value, field } = options
  if (value === '')
    return ok(undefined)
  if (field.kind === 'port' || field.kind === 'number')
    return ok(Number(value))
  if (field.kind === 'boolean')
    return ok(value === 'true')
  return ok(field.name === 'ssl' || field.name === 'headers' ? parseDocument(value).toJS() : value)
}

/**
 * 保存选择后的完整连接，声明配置节点并清理该模式中被替换的旧连接字段。
 * @param environment - 目标环境快照，不修改进程环境。
 * @param options - 应用目录、扫描需求、后端、可选连接和其他生成项。
 * @param options.appDir - 应用配置文件所在根目录。
 * @param options.requirement - 扫描的中间件配置路径。
 * @param options.backend - 选定的后端。
 * @param options.configuration - 本次完整连接；云开通前可不提供。
 * @param options.updates - 同次选择需要保存的其他配置。
 * @returns 实际写入的变量名；错误不包含配置值。
 * @example
 * ```ts
 * import { loadDeploymentEnvironment, saveMiddlewareEnvironment } from '@h-ai/deploy'
 * const loaded = loadDeploymentEnvironment({ environment: 'test', envDir: process.cwd() })
 * if (!loaded.success) throw new Error(loaded.error.message)
 * const saved = saveMiddlewareEnvironment(loaded.data, { appDir: process.cwd(), requirement: { service: 'cache', backend: 'memory', source: 'cache', configName: 'cache', configPath: [], envPrefix: 'HAI_CACHE', config: {} }, backend: 'memory', configuration: { type: 'memory' } })
 * ```
 */
export function saveMiddlewareEnvironment(environment: DeploymentEnvironment, options: { appDir: string, requirement: MiddlewareRequirement, backend: string, configuration?: Record<string, unknown>, updates?: Record<string, unknown> }): HaiResult<string[]> {
  try {
    const { requirement, backend } = options
    const updates = { ...options.updates }
    if (options.configuration) {
      const configuration = requirement.service === 'ldap' ? options.configuration : { ...options.configuration, type: backend }
      if (requirement.service === 'db') {
        const validated = ReldbConfigSchema.safeParse(configuration)
        if (!validated.success)
          return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_middlewareFieldInvalid', { params: { fields: validated.error.issues.map(issue => issue.path.join('.')).join(', ') } }))
      }
      if (requirement.service === 'ldap') {
        updates.HAI_IAM_LOGIN_LDAP = backend !== 'disabled'
        if (backend !== 'disabled')
          updates[requirement.envPrefix] = configuration
      }
      else {
        updates[requirement.envPrefix] = configuration
      }
    }
    const directory = join(options.appDir, 'config')
    mkdirSync(directory, { recursive: true })
    const path = join(directory, `_${requirement.configName}.yml`)
    const document = parseDocument(existsSync(path) ? readFileSync(path, 'utf8') : '{}\n')
    if (document.errors.length)
      return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_environmentWriteFailed'))
    // 禁用可选后端时保持节点缺省，避免下次构建把空连接当作已配置连接校验。
    if (backend !== 'disabled' && requirement.configPath.length && !document.hasIn(requirement.configPath))
      document.setIn(requirement.configPath, document.createNode(requirement.config.name ? { name: requirement.config.name, type: backend } : {}))
    if (requirement.service === 'ldap' && !document.hasIn(['login', 'ldap']))
      document.setIn(['login', 'ldap'], false)
    const content = document.toString()
    if (!existsSync(path) || readFileSync(path, 'utf8') !== content)
      writeFileSync(path, content)
    return saveDeploymentEnvironment(environment, updates, { replace: options.configuration ? [requirement.envPrefix] : [] })
  }
  catch {
    return err(HaiDeployError.ENV_VAR_FAILED, deployM('deploy_environmentWriteFailed'))
  }
}
