/** 部署向导：逐项配置实际依赖的中间件，不以文件存在代替有效连接配置。 */
import type { DeploymentEnvironment, MiddlewareBackend, MiddlewareField, MiddlewareMode, MiddlewareRequirement, ScanResult } from '@h-ai/deploy'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MysqlSslConfigSchema, ReldbConfigSchema, SslConfigSchema } from '@h-ai/reldb/schemas'
import prompts from 'prompts'
import { isMap, isScalar, parseDocument } from 'yaml'
import { cliM } from '../cli-i18n.js'
import { writeCliMessage } from '../cli-utils.js'
import { moduleEnvironmentVariables } from './cli-config-environment.js'

/**
 * 部署包的真实运行时命名空间类型，仅供向导依赖注入，不重新仿造部署 API。
 * @example 模块内部上下文
 * ```ts
 * const module: DeployModule = await import('@h-ai/deploy')
 * const backends = module.DEPLOY_MIDDLEWARE.db
 * ```
 */
type DeployModule = typeof import('@h-ai/deploy')

/**
 * 展示连接配置时保留可核对的后端/地址，隐藏密码、令牌和 URL 认证部分。
 * @param name - 配置、模板或生成对象的名称，具体约束见函数用途。
 * @param value - 待展示的连接值。
 * @returns 保留连接识别信息且隐藏已识别凭据的显示文本。
 * @example 模块内部上下文
 * ```ts
 * const value = displayDeployValue('HAI_DB', JSON.stringify({ type: 'mysql', password: 'example-only' }))
 * // password 显示为本地化的隐藏标记，不输出原值。
 * ```
 */
export function displayDeployValue(name: string, value: string): string {
  if (/PASSWORD|SECRET|TOKEN|APIKEY|PRIVATEKEY|ACCESSKEY|AUTHORIZATION/i.test(name.replace(/[^a-z0-9]/gi, '')) || /(?:^|_)PASS$/i.test(name) || value.includes('PRIVATE KEY'))
    return cliM('cli_deploy_secret')
  try {
    const parsed: unknown = JSON.parse(value)
    if (parsed && typeof parsed === 'object') {
      const sanitize = (object: unknown): unknown => {
        if (Array.isArray(object))
          return object.map(sanitize)
        if (object && typeof object === 'object')
          return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, /PASSWORD|SECRET|TOKEN|APIKEY|PRIVATEKEY|ACCESSKEY|AUTHORIZATION/i.test(key.replace(/[^a-z0-9]/gi, '')) || /(?:^|_)PASS$/i.test(key) ? cliM('cli_deploy_secret') : typeof item === 'string' ? displayDeployValue(key, item) : sanitize(item)]))
        return object
      }
      return JSON.stringify(sanitize(parsed))
    }
  }
  catch { /* 普通连接字符串无需 JSON 处理。 */ }
  try {
    const url = new URL(value)
    if (url.username || url.password) {
      url.username = '***'
      url.password = '***'
    }
    for (const key of url.searchParams.keys()) {
      if (/password|secret|token|key|authorization/i.test(key))
        url.searchParams.set(key, '***')
    }
    return url.toString()
  }
  catch {
    return value
  }
}

/** 凭据输入字段，名称与 deploy 公开配置 Schema 相同。 */
const CLOUD_FIELDS: Record<string, string[]> = {
  'neon': ['apiKey'],
  'upstash': ['email', 'apiKey'],
  'cloudflare-r2': ['accountId', 'apiToken', 'accessKeyId', 'secretAccessKey'],
  'resend': ['apiKey', 'from'],
  'aliyun': ['accessKeyId', 'accessKeySecret', 'signName'],
}

/** 解析目标环境显式声明的配置，仅用于判断是否允许跳过。 */
function targetConfig(requirement: MiddlewareRequirement, environment: DeploymentEnvironment): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const parent = environment.targetValues[requirement.envPrefix]
  if (parent) {
    try {
      Object.assign(result, JSON.parse(parent))
    }
    catch { return {} }
  }
  for (const [key, value] of Object.entries(environment.targetValues)) {
    if (key.startsWith(`${requirement.envPrefix}_`))
      result[key.slice(requirement.envPrefix.length + 1).toLowerCase()] = value
  }
  return result
}

/**
 * 只有目标文件显式声明了当前后端及必要连接项，才允许保持不变。
 * 凭据仍可来自 .env.local/进程；其他环境的配置不能让此选项出现。
 * @param requirement - 扫描出的实际中间件需求。
 * @param backend - 部署目录中选定的后端。
 * @param environment - 已合并变量与目标文件显式值的环境快照。
 * @returns 仅当目标文件明确声明后端与必要连接项时为 true。
 * @example 模块内部上下文
 * ```ts
 * const module = await import('@h-ai/deploy')
 * const requirement: MiddlewareRequirement = { service: 'db', backend: 'postgresql', source: '@h-ai/reldb', configName: 'db', configPath: [], envPrefix: 'HAI_DB', config: { host: 'db', port: 5432, database: 'shop' } }
 * const environment: DeploymentEnvironment = { environment: 'prod', envDir: '/workspace/shop', values: {}, targetValues: { HAI_DB_TYPE: 'postgresql', HAI_DB_HOST: 'db', HAI_DB_PORT: '5432', HAI_DB_DATABASE: 'shop' } }
 * const backend = module.DEPLOY_MIDDLEWARE.db.find(item => item.backend === 'postgresql')
 * if (backend) {
 *   const keep = canKeepMiddleware(requirement, backend, environment)
 * }
 * ```
 */
export function canKeepMiddleware(requirement: MiddlewareRequirement, backend: MiddlewareBackend, environment: DeploymentEnvironment): boolean {
  const target = targetConfig(requirement, environment)
  if (requirement.service === 'ldap' && backend.backend === 'disabled')
    return environment.targetValues.HAI_IAM_LOGIN_LDAP === 'false'
  if (requirement.service === 'ldap') {
    if (!Object.keys(target).length)
      return false
  }
  else if (target.type !== backend.backend) {
    return false
  }
  return backend.fields.filter(field => field.required && !field.secret).every((field) => {
    if ((target.url || (requirement.config.url && Object.keys(target).length)) && ['host', 'port'].includes(field.name))
      return true
    return (target[field.name] !== undefined && target[field.name] !== '') || (target[field.name.toLowerCase()] !== undefined && target[field.name.toLowerCase()] !== '')
  }) && backend.fields.filter(field => field.required && field.secret).every(field => Boolean(requirement.config[field.name] || environment.values[`${requirement.envPrefix}_${field.name.toUpperCase()}`]))
}

/** 用户取消与缺少非交互输入都必须停止，禁止使用未回答的隐含默认值。 */
async function ask(question: prompts.PromptObject): Promise<unknown> {
  const answer = await prompts({ ...question, name: 'value' })
  if (answer.value === undefined)
    throw new Error(cliM('cli_deploy_cancelled'))
  return answer.value
}

/** 校验连接字段；数据库 TLS 复用所选后端的真实公开 Schema。 */
function validateField(value: string, field: MiddlewareField, backend: string): boolean | string {
  if (value === '')
    return field.required ? cliM('cli_deploy_required') : true
  if (field.kind === 'port')
    return (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535) || cliM('cli_deploy_invalid_value')
  if (field.kind === 'number')
    return (/^\d+$/.test(value) && Number(value) >= (field.minimum ?? 0) && Number(value) <= (field.maximum ?? Number.MAX_SAFE_INTEGER)) || cliM('cli_deploy_invalid_value')
  if (field.kind === 'boolean')
    return ['true', 'false'].includes(value) || cliM('cli_deploy_invalid_value')
  if (field.kind === 'url') {
    try {
      return Boolean(new URL(value).protocol)
    }
    catch { return cliM('cli_deploy_invalid_value') }
  }
  if (field.name === 'ssl') {
    const parsed = parseDocument(value)
    const schema = backend === 'mysql' ? MysqlSslConfigSchema : SslConfigSchema
    return (parsed.errors.length === 0 && schema.safeParse(parsed.toJS()).success) || cliM('cli_deploy_invalid_value')
  }
  if (field.name === 'headers') {
    try {
      const headers: unknown = JSON.parse(value)
      return (headers !== null && typeof headers === 'object' && !Array.isArray(headers) && Object.values(headers).every(item => typeof item === 'string')) || cliM('cli_deploy_invalid_value')
    }
    catch {
      return cliM('cli_deploy_invalid_value')
    }
  }
  if (field.name === 'method')
    return ['POST', 'PUT'].includes(value) || cliM('cli_deploy_invalid_value')
  return true
}

/** 连接配置的声明节点必须存在，约定变量才能覆盖原 YAML 未启用的可选功能。 */
function ensureConfigNode(appDir: string, requirement: MiddlewareRequirement, backend: string): void {
  if (requirement.service === 'ldap' && backend === 'disabled')
    return
  const directory = join(appDir, 'config')
  mkdirSync(directory, { recursive: true })
  const path = join(directory, `_${requirement.configName}.yml`)
  const document = parseDocument(existsSync(path) ? readFileSync(path, 'utf8') : '{}\n')
  if (document.errors.length)
    throw new Error(cliM('cli_deploy_invalid_value'))
  if (requirement.configPath.length && !document.hasIn(requirement.configPath))
    document.setIn(requirement.configPath, document.createNode(requirement.configName === 'reach' ? { name: requirement.config.name ?? requirement.service, type: backend } : {}))
  if (requirement.service === 'ldap') {
    if (!document.hasIn(['login']))
      document.set('login', document.createNode({}))
    if (!document.hasIn(['login', 'ldap']))
      document.setIn(['login', 'ldap'], `\${HAI_IAM_LOGIN_LDAP:false}`)
  }
  const content = document.toString()
  if (!existsSync(path) || readFileSync(path, 'utf8') !== content)
    writeFileSync(path, content)
}

/** 保存单个连接对象；整体覆盖可避免旧 URL 或不兼容后端字段残留。 */
function connectionEnv(requirement: MiddlewareRequirement, backend: string, config: Record<string, unknown>): Record<string, string> {
  if (requirement.service === 'ldap')
    return backend === 'disabled' ? { HAI_IAM_LOGIN_LDAP: 'false' } : { HAI_IAM_LOGIN_LDAP: 'true', [requirement.envPrefix]: JSON.stringify(config) }
  return { [requirement.envPrefix]: JSON.stringify({ ...config, type: backend }) }
}

/**
 * 逐项收集处理方式、后端和连接参数；返回值用于过滤云开通器和 Compose 服务。
 * 会持久化公共连接信息与私有凭据；yes 仅跳过已可确定的选择，缺少必要输入仍抛错。
 * @throws Error - 用户取消、必要非交互输入缺失、字段校验或配置持久化失败。
 * @param module - 实际加载的 @h-ai/deploy 运行时命名空间。
 * @param scan - 扫描得到的应用和中间件需求。
 * @param environment - 已合并变量与目标文件显式值的环境快照。
 * @param config - 正在补齐的部署配置对象。
 * @param yes - 非交互模式；不能绕过必需输入缺失。
 * @returns 每项中间件的最终处理模式。
 * @example 模块内部上下文
 * ```ts
 * const module: DeployModule = await import('@h-ai/deploy')
 * const result = await module.deploy.scan(process.cwd(), { environment: 'prod' })
 * if (!result.success) throw new Error(result.error.message)
 * const environment = module.loadDeploymentEnvironment({ environment: 'prod', envDir: process.cwd() })
 * if (!environment.success) throw new Error(environment.error.message)
 * const modes = await configureDeployMiddleware(module, result.data, environment.data, {}, true)
 * ```
 */
export async function configureDeployMiddleware(module: DeployModule, scan: ScanResult, environment: DeploymentEnvironment, config: Record<string, unknown>, yes = false): Promise<Partial<Record<string, MiddlewareMode>>> {
  const modes: Partial<Record<string, MiddlewareMode>> = {}
  const services: Record<string, unknown> = {}
  const existingServices = config.services && typeof config.services === 'object' ? config.services as Record<string, unknown> : {}
  const provider = config.provider as { type?: string } | undefined
  for (const requirement of scan.middlewares ?? []) {
    const choices = module.DEPLOY_MIDDLEWARE[requirement.service]
    const current = choices.find(item => item.backend === requirement.backend)
    if (!current)
      throw new Error(cliM('cli_deploy_cloud_unsupported', { params: { backend: requirement.backend } }))
    writeCliMessage(cliM('cli_deploy_middleware', { params: { service: requirement.service, backend: current.label, purpose: module.describeMiddlewareBackend(current), source: requirement.source } }))
    const canKeep = canKeepMiddleware(requirement, current, environment)
    const mode = yes
      ? canKeep ? 'keep' : 'default'
      : await ask({
        type: 'select',
        name: 'value',
        message: cliM('cli_deploy_action', { params: { service: requirement.service } }),
        choices: [
          { title: cliM('cli_deploy_default'), value: 'default' },
          { title: cliM('cli_deploy_custom'), value: 'custom' },
          ...(canKeep ? [{ title: cliM('cli_deploy_keep'), value: 'keep' }] : []),
        ],
      }) as MiddlewareMode
    modes[requirement.envPrefix] = mode
    // 同类服务可有多个 Provider；保留每项选择，聚合值仅用于选择云开通器。
    const previous = modes[requirement.service]
    modes[requirement.service] = previous === 'default' || mode === 'default' ? 'default' : previous === 'custom' || mode === 'custom' ? 'custom' : 'keep'
    if (mode === 'keep') {
      if (!canKeep)
        throw new Error(cliM('cli_deploy_missing_keep', { params: { service: requirement.service } }))
      continue
    }
    const backendName = yes ? current.backend : String(await ask({ type: 'select', name: 'value', message: cliM('cli_deploy_backend', { params: { service: requirement.service } }), initial: choices.indexOf(current), choices: choices.map(item => ({ title: `${item.label} — ${module.describeMiddlewareBackend(item)}`, value: item.backend })) }))
    const backend = choices.find(item => item.backend === backendName)
    if (!backend)
      throw new Error(cliM('cli_deploy_invalid_value'))
    requirement.backend = backendName
    const updates: Record<string, string> = {}
    if (mode === 'default' && backendName === 's3' && provider?.type === 'docker-ssh') {
      const container = config.container && typeof config.container === 'object' ? config.container as Record<string, unknown> : {}
      const currentEngine = container.s3Engine === 'minio' ? 'minio' : 'rustfs'
      const engine = yes ? currentEngine : String(await ask({ type: 'select', name: 'value', message: cliM('cli_deploy_s3_engine'), initial: currentEngine === 'rustfs' ? 0 : 1, choices: [{ title: 'RustFS', value: 'rustfs' }, { title: 'MinIO', value: 'minio' }] }))
      if (!['rustfs', 'minio'].includes(engine))
        throw new Error(cliM('cli_deploy_invalid_value'))
      config.container = { ...container, s3Engine: engine }
      updates.HAI_DEPLOY_CONTAINER_S3ENGINE = engine
      const deploymentFile = join(scan.appDir ?? '.', 'config', '_deploy.yml')
      const deployment = parseDocument(readFileSync(deploymentFile, 'utf8'))
      if (deployment.errors.length)
        throw new Error(cliM('cli_deploy_invalid_value'))
      if (!deployment.hasIn(['container', 's3Engine'])) {
        const node = deployment.get('container', true)
        if (node === undefined || (isScalar(node) && node.value === null))
          deployment.set('container', deployment.createNode({}))
        else if (!isMap(node))
          throw new Error(cliM('cli_deploy_yaml_node', { params: { path: deploymentFile, field: 'container' } }))
        deployment.setIn(['container', 's3Engine'], `\${HAI_DEPLOY_CONTAINER_S3ENGINE:rustfs}`)
        writeFileSync(deploymentFile, deployment.toString())
      }
    }
    if (mode === 'default' && provider?.type === 'vercel') {
      if (!backend.provisioner)
        throw new Error(cliM('cli_deploy_cloud_unsupported', { params: { backend: backend.label } }))
      const prior = existingServices[requirement.service]
      const priorConfig = prior && typeof prior === 'object' ? prior as Record<string, unknown> : {}
      const cloud: Record<string, string> = { provisioner: backend.provisioner }
      for (const name of CLOUD_FIELDS[backend.provisioner]) {
        const key = `HAI_DEPLOY_SERVICES_${requirement.service.toUpperCase()}_${name.toUpperCase()}`
        const initial = String(priorConfig[name] ?? environment.values[key] ?? '')
        const label = `${backend.label} — ${cliM(`cli_deploy_cloud_input_${name}` as Parameters<typeof cliM>[0])}`
        const value = yes ? initial : String(await ask({ type: /key|token|secret/i.test(name) ? 'password' : 'text', name: 'value', message: label, initial, validate: input => Boolean(input) || cliM('cli_deploy_required') }))
        if (!value)
          throw new Error(`${label}: ${cliM('cli_deploy_required')}`)
        cloud[name] = value
        updates[key] = value
      }
      services[requirement.service] = cloud
    }
    else {
      if (mode === 'default' && (requirement.service === 'sms' || backendName === 'api'))
        throw new Error(cliM('cli_deploy_cloud_unsupported', { params: { backend: backend.label } }))
      const connection: Record<string, unknown> = mode === 'custom' && backendName === current.backend ? { ...requirement.config } : requirement.configName === 'reach' ? { name: requirement.config.name ?? requirement.service } : {}
      for (const field of backend.fields) {
        const previous = backendName === current.backend ? requirement.config[field.name] : undefined
        const initial = previous === undefined ? field.defaultValue ?? '' : typeof previous === 'object' ? JSON.stringify(previous) : String(previous)
        const variable = `${requirement.envPrefix}_${field.name.toUpperCase()}`
        const info = moduleEnvironmentVariables(requirement.configName).find(item => item.name === variable)
        const value = mode === 'custom' && !yes ? String(await ask({ type: field.secret ? 'password' : 'text', name: 'value', message: cliM('cli_deploy_field', { params: { name: variable, description: info?.description ?? field.name, constraint: info?.constraint ?? field.kind ?? 'string' } }), initial, validate: input => validateField(String(input), field, backendName) })) : initial
        // TLS 交互返回值与非交互值保存前再次校验，不依赖 prompts UI 曾调用 validate。
        if (field.name === 'ssl' && validateField(value, field, backendName) !== true)
          throw new Error(cliM('cli_deploy_invalid_value'))
        // 默认的服务端凭据由 sidecar/云开通器生成，不要求用户填写。
        if (value !== '') {
          connection[field.name] = field.kind === 'number' || field.kind === 'port' ? Number(value) : field.kind === 'boolean' ? value === 'true' : field.name === 'headers' || field.name === 'ssl' ? parseDocument(value).toJS() : value
        }
        else {
          delete connection[field.name]
        }
      }
      if (requirement.service === 'db') {
        const validated = ReldbConfigSchema.safeParse({ ...connection, type: backendName })
        if (!validated.success)
          throw new Error(cliM('cli_deploy_config_invalid', { params: { path: join(scan.appDir ?? '.', 'config', '_db.yml'), fields: validated.error.issues.map(issue => issue.path.join('.')).join(', ') } }))
      }
      Object.assign(updates, connectionEnv(requirement, backendName, connection))
    }
    ensureConfigNode(scan.appDir ?? '.', requirement, backendName)
    const saved = module.saveDeploymentEnvironment(environment, updates)
    if (!saved.success)
      throw new Error(saved.error.message)
    for (const [name, value] of Object.entries(updates)) {
      writeCliMessage(cliM('cli_deploy_saved', { params: { name, value: displayDeployValue(name, value) } }))
    }
  }
  // 仅默认选项对应的云服务参与初始化/开通；custom/keep 不认证、不创建。
  config.services = Object.keys(services).length ? services : undefined
  return modes
}
