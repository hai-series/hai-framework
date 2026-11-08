/** 部署向导：逐项配置实际依赖的中间件，不以文件存在代替有效连接配置。 */
import type { DeploymentEnvironment, MiddlewareMode, ScanResult } from '@h-ai/deploy'
import { writeFileSync } from 'node:fs'
import prompts from 'prompts'
import { cliM } from '../cli-i18n.js'
import { writeCliMessage } from '../cli-utils.js'
import { moduleEnvironmentVariables } from './cli-config-environment.js'
import { projectConfigPath, readProjectConfig } from './cli-project-config.js'

/**
 * 部署包的真实运行时命名空间类型，仅供向导依赖注入，不重新仿造部署 API。
 * @example 模块内部上下文
 * ```ts
 * const module: DeployModule = await import('@h-ai/deploy')
 * const backends = module.DEPLOY_MIDDLEWARE.db
 * ```
 */
type DeployModule = typeof import('@h-ai/deploy')

/** S3 字段使用针对服务端 API 与对象寻址的说明。 */
const s3FieldPrompts: Partial<Record<string, Parameters<typeof cliM>[0]>> = {
  endpoint: 'cli_deploy_s3_endpoint',
  bucket: 'cli_deploy_s3_bucket',
  region: 'cli_deploy_s3_region',
  accessKeyId: 'cli_deploy_s3_access_key',
  secretAccessKey: 'cli_deploy_s3_secret_key',
  forcePathStyle: 'cli_deploy_s3_path_style',
}

/** 支持 URL 和分字段配置的后端，以及完整连接串替代的字段。 */
const connectionUrlOptions = {
  postgresql: {
    fields: [
      'host',
      'port',
      'database',
      'user',
      'password',
    ],
    example: 'postgresql://user:password@db.example.com:5432/app',
  },
  mysql: {
    fields: [
      'host',
      'port',
      'database',
      'user',
      'password',
    ],
    example: 'mysql://user:password@db.example.com:3306/app',
  },
  pgvector: {
    fields: [
      'host',
      'port',
      'database',
      'user',
      'password',
    ],
    example: 'postgresql://user:password@db.example.com:5432/vectors',
  },
  redis: {
    fields: [
      'host',
      'port',
      'password',
      'db',
      'cluster',
      'sentinel',
    ],
    example: 'rediss://user:password@redis.example.com:6379/0',
  },
} satisfies Record<string, { fields: string[], example: string }>

/** 检查向导所选连接串的协议和地址，并确保可为 PostgreSQL 系后端填入数据库名。 */
function parseConnectionUrl(value: string, backend: string): URL | undefined {
  try {
    const url = new URL(value)
    if (!url.hostname)
      return undefined
    if (backend === 'mysql') {
      return url.protocol === 'mysql:' && !value.includes('?') && !value.includes('#')
        ? url
        : undefined
    }
    if (backend === 'redis') {
      return ['redis:', 'rediss:'].includes(url.protocol)
        ? url
        : undefined
    }
    if (['postgres:', 'postgresql:'].includes(url.protocol) && decodeURIComponent(url.pathname.slice(1)))
      return url
  }
  catch { /* URL 解析错误可能包含输入值。 */ }
  return undefined
}

/** 用户取消与缺少非交互输入都必须停止，禁止使用未回答的隐含默认值。 */
async function ask(question: prompts.PromptObject): Promise<unknown> {
  const answer = await prompts({ ...question, name: 'value' })
  if (answer.value === undefined)
    throw new Error(cliM('cli_deploy_cancelled'))
  return answer.value
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
  const existingServices = config.services && typeof config.services === 'object'
    ? config.services as Record<string, unknown>
    : {}
  const provider = config.provider as { type?: string } | undefined
  for (const requirement of scan.middlewares ?? []) {
    const choices = module.DEPLOY_MIDDLEWARE[requirement.service]
    const current = choices.find(item => item.backend === requirement.backend)
    if (!current) {
      throw new Error(cliM('cli_deploy_cloud_unsupported', {
        params: { backend: requirement.backend },
      }))
    }
    writeCliMessage(cliM('cli_deploy_middleware', {
      params: {
        service: requirement.service,
        backend: current.label,
        purpose: module.describeMiddlewareBackend(current),
        source: requirement.source,
      },
    }))
    const canKeep = module.canKeepMiddleware(requirement, current, environment)
    const mode = yes
      ? canKeep ? 'keep' : 'default'
      : await ask({
        type: 'select',
        name: 'value',
        message: cliM('cli_deploy_action', {
          params: { service: requirement.service },
        }),
        choices: [
          {
            title: cliM('cli_deploy_default'),
            value: 'default',
          },
          {
            title: cliM('cli_deploy_custom'),
            value: 'custom',
          },
          ...(canKeep
            ? [
                {
                  title: cliM('cli_deploy_keep'),
                  value: 'keep',
                },
              ]
            : []),
        ],
      }) as MiddlewareMode
    modes[requirement.envPrefix] = mode
    // 同类服务可有多个 Provider；保留每项选择，聚合值仅用于选择云开通器。
    const previous = modes[requirement.service]
    modes[requirement.service] = previous === 'default' || mode === 'default'
      ? 'default'
      : previous === 'custom' || mode === 'custom'
        ? 'custom'
        : 'keep'
    if (mode === 'keep') {
      if (!canKeep) {
        throw new Error(cliM('cli_deploy_missing_keep', {
          params: { service: requirement.service },
        }))
      }
      continue
    }
    const backendName = yes
      ? current.backend
      : String(await ask({
          type: 'select',
          name: 'value',
          message: cliM('cli_deploy_backend', {
            params: { service: requirement.service },
          }),
          initial: choices.indexOf(current),
          choices: choices.map(item => ({ title: `${item.label} — ${module.describeMiddlewareBackend(item)}`, value: item.backend })),
        }))
    const backend = choices.find(item => item.backend === backendName)
    if (!backend)
      throw new Error(cliM('cli_deploy_invalid_value'))
    requirement.backend = backendName
    const updates: Record<string, unknown> = {}
    let configuration: Record<string, unknown> | undefined
    let connectionAddress: string | undefined
    for (const option of mode === 'default' && provider?.type === 'docker-ssh'
      ? backend.containerOptions ?? []
      : []) {
      const container = config.container && typeof config.container === 'object'
        ? config.container as Record<string, unknown>
        : {}
      const currentValue = String(container[option.field] ?? option.defaultValue)
      const selected = yes
        ? currentValue
        : String(await ask({
            type: 'select',
            name: 'value',
            message: module.describeMiddlewareBackend(option),
            initial: Math.max(0, option.choices.findIndex(item => item.value === currentValue)),
            choices: option.choices.map(item => ({ title: item.label, value: item.value })),
          }))
      if (!option.choices.some(item => item.value === selected))
        throw new Error(cliM('cli_deploy_invalid_value'))
      config.container = { ...container, [option.field]: selected }
      updates[option.variable] = selected
      const deploymentFile = projectConfigPath(scan.appDir ?? environment.envDir)
      const project: { deploy?: { container?: Record<string, unknown> | null } } = readProjectConfig(deploymentFile)
      project.deploy ??= {}
      if (project.deploy.container != null && (typeof project.deploy.container !== 'object' || Array.isArray(project.deploy.container))) {
        throw new Error(cliM('cli_deploy_config_node', {
          params: { path: deploymentFile, field: 'deploy.container' },
        }))
      }
      project.deploy.container ??= {}
      if (!(option.field in project.deploy.container)) {
        project.deploy.container[option.field] = `\${${option.variable}:${option.defaultValue}}`
        writeFileSync(deploymentFile, `${JSON.stringify(project, null, 2)}\n`)
      }
    }
    if (mode === 'default' && provider?.type === 'vercel') {
      if (!backend.provisioner) {
        throw new Error(cliM('cli_deploy_cloud_unsupported', {
          params: { backend: backend.label },
        }))
      }
      const prior = existingServices[requirement.service]
      const priorConfig = prior && typeof prior === 'object'
        ? prior as Record<string, unknown>
        : {}
      const cloud: Record<string, string> = { provisioner: backend.provisioner }
      for (const name of backend.cloudFields ?? []) {
        const key = `HAI_DEPLOY_SERVICES_${requirement.service.toUpperCase()}_${name.toUpperCase()}`
        const initial = String(priorConfig[name] ?? environment.values[key] ?? '')
        const label = `${backend.label} — ${cliM(`cli_deploy_cloud_input_${name}` as Parameters<typeof cliM>[0])}`
        const value = yes
          ? initial
          : String(await ask({
              type: /key|token|secret/i.test(name)
                ? 'password'
                : 'text',
              name: 'value',
              message: label,
              initial,
              validate: input => Boolean(input) || cliM('cli_deploy_required'),
            }))
        if (!value)
          throw new Error(`${label}: ${cliM('cli_deploy_required')}`)
        cloud[name] = value
        updates[key] = value
      }
      services[requirement.service] = cloud
    }
    else {
      if (mode === 'default' && backend.containerSupported === false) {
        throw new Error(cliM('cli_deploy_cloud_unsupported', {
          params: { backend: backend.label },
        }))
      }
      // 默认与自定义都从同后端的有效配置继续，不能用表单字段重建并丢失未展示选项。
      const connection: Record<string, unknown> = backendName === current.backend
        ? { ...requirement.config }
        : requirement.config.name === undefined
          ? {}
          : { name: requirement.config.name }
      const custom = mode === 'custom' && !yes
      const urlOptions = custom && Object.hasOwn(connectionUrlOptions, backendName)
        ? connectionUrlOptions[backendName as keyof typeof connectionUrlOptions]
        : undefined
      let fields = backend.fields
      if (urlOptions) {
        const method = await ask({
          type: 'select',
          name: 'value',
          message: cliM('cli_deploy_connection_method', {
            params: { backend: backend.label },
          }),
          initial: connection.url ? 1 : 0,
          choices: [
            {
              title: cliM('cli_deploy_connection_fields'),
              value: 'fields',
            },
            {
              title: cliM('cli_deploy_connection_url'),
              value: 'url',
            },
          ],
        })
        if (method === 'url') {
          const reason = cliM(backendName === 'mysql'
            ? 'cli_deploy_mysql_url_invalid'
            : backendName === 'redis'
              ? 'cli_deploy_redis_url_invalid'
              : 'cli_deploy_postgres_url_invalid')
          const invalid = cliM('cli_deploy_middleware_field_error', {
            params: { variable: `${requirement.envPrefix}_URL`, reason },
          })
          const value = String(await ask({
            type: 'password',
            name: 'value',
            message: cliM('cli_deploy_connection_url_prompt', {
              params: { example: urlOptions.example },
            }),
            initial: typeof connection.url === 'string'
              ? connection.url
              : '',
            validate: input => Boolean(parseConnectionUrl(String(input), backendName)) || invalid,
          }))
          const url = parseConnectionUrl(value, backendName)
          if (!url)
            throw new Error(invalid)
          for (const name of urlOptions.fields)
            delete connection[name]
          connection.url = value
          // 现有 PostgreSQL 和 pgvector Schema 要求 database；直接复用连接串中的值。
          if (backendName === 'postgresql' || backendName === 'pgvector')
            connection.database = decodeURIComponent(url.pathname.slice(1))
          connectionAddress = `${url.protocol}//${url.host}`
          fields = fields.filter(field => field.name !== 'url' && !urlOptions.fields.includes(field.name))
        }
        else {
          if (method !== 'fields')
            throw new Error(cliM('cli_deploy_invalid_value'))
          delete connection.url
          fields = fields.filter(field => field.name !== 'url')
        }
      }
      for (const field of fields) {
        const previous = backendName === current.backend
          ? requirement.config[field.name]
          : undefined
        const initial = previous === undefined
          ? field.defaultValue ?? ''
          : typeof previous === 'object'
            ? JSON.stringify(previous)
            : String(previous)
        const variable = `${requirement.envPrefix}_${field.name.toUpperCase()}`
        const info = moduleEnvironmentVariables(requirement.configName).find(item => item.name === variable)
        const prompt = backendName === 's3'
          ? s3FieldPrompts[field.name]
          : undefined
        const message = prompt
          ? cliM(prompt)
          : cliM('cli_deploy_field', {
              params: { description: info?.description ?? field.name, constraint: info?.constraint ?? field.kind ?? 'string' },
            })
        const value = custom
          ? String(await ask({
              type: field.secret ? 'password' : 'text',
              name: 'value',
              message,
              initial,
              validate: (input) => {
                const result = module.parseMiddlewareField({
                  value: String(input),
                  field,
                  backend: backendName,
                })
                return result.success || cliM('cli_deploy_middleware_field_error', {
                  params: { variable, reason: result.error.message },
                })
              },
            }))
          : initial
        const parsed = module.parseMiddlewareField({
          value,
          field,
          backend: backendName,
          managed: mode === 'default',
        })
        if (!parsed.success) {
          throw new Error(cliM('cli_deploy_middleware_field_error', {
            params: { variable, reason: parsed.error.message },
          }))
        }
        if (parsed.data === undefined)
          delete connection[field.name]
        else connection[field.name] = parsed.data
      }
      configuration = connection
    }
    const saved = module.saveMiddlewareEnvironment(environment, {
      appDir: scan.appDir ?? '.',
      requirement,
      backend: backendName,
      configuration,
      updates,
    })
    if (!saved.success) {
      throw new Error(cliM('cli_deploy_middleware_field_error', {
        params: { variable: requirement.envPrefix, reason: saved.error.message },
      }))
    }
    if (connectionAddress) {
      writeCliMessage(cliM('cli_deploy_connection_address', {
        params: { service: requirement.service, address: connectionAddress },
      }))
    }
    writeCliMessage(cliM('cli_deploy_saved', {
      params: { service: requirement.service },
    }))
  }
  // 仅默认选项对应的云服务参与初始化/开通；custom/keep 不认证、不创建。
  config.services = Object.keys(services).length
    ? services
    : undefined
  return modes
}
