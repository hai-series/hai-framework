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
  const existingServices = config.services && typeof config.services === 'object' ? config.services as Record<string, unknown> : {}
  const provider = config.provider as { type?: string } | undefined
  for (const requirement of scan.middlewares ?? []) {
    const choices = module.DEPLOY_MIDDLEWARE[requirement.service]
    const current = choices.find(item => item.backend === requirement.backend)
    if (!current)
      throw new Error(cliM('cli_deploy_cloud_unsupported', { params: { backend: requirement.backend } }))
    writeCliMessage(cliM('cli_deploy_middleware', { params: { service: requirement.service, backend: current.label, purpose: module.describeMiddlewareBackend(current), source: requirement.source } }))
    const canKeep = module.canKeepMiddleware(requirement, current, environment)
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
    const updates: Record<string, unknown> = {}
    let configuration: Record<string, unknown> | undefined
    for (const option of mode === 'default' && provider?.type === 'docker-ssh' ? backend.containerOptions ?? [] : []) {
      const container = config.container && typeof config.container === 'object' ? config.container as Record<string, unknown> : {}
      const currentValue = String(container[option.field] ?? option.defaultValue)
      const selected = yes ? currentValue : String(await ask({ type: 'select', name: 'value', message: module.describeMiddlewareBackend(option), initial: Math.max(0, option.choices.findIndex(item => item.value === currentValue)), choices: option.choices.map(item => ({ title: item.label, value: item.value })) }))
      if (!option.choices.some(item => item.value === selected))
        throw new Error(cliM('cli_deploy_invalid_value'))
      config.container = { ...container, [option.field]: selected }
      updates[option.variable] = selected
      const deploymentFile = projectConfigPath(scan.appDir ?? environment.envDir)
      const project: { deploy?: { container?: Record<string, unknown> | null } } = readProjectConfig(deploymentFile)
      project.deploy ??= {}
      if (project.deploy.container != null && (typeof project.deploy.container !== 'object' || Array.isArray(project.deploy.container)))
        throw new Error(cliM('cli_deploy_config_node', { params: { path: deploymentFile, field: 'deploy.container' } }))
      project.deploy.container ??= {}
      if (!(option.field in project.deploy.container)) {
        project.deploy.container[option.field] = `\${${option.variable}:${option.defaultValue}}`
        writeFileSync(deploymentFile, `${JSON.stringify(project, null, 2)}\n`)
      }
    }
    if (mode === 'default' && provider?.type === 'vercel') {
      if (!backend.provisioner)
        throw new Error(cliM('cli_deploy_cloud_unsupported', { params: { backend: backend.label } }))
      const prior = existingServices[requirement.service]
      const priorConfig = prior && typeof prior === 'object' ? prior as Record<string, unknown> : {}
      const cloud: Record<string, string> = { provisioner: backend.provisioner }
      for (const name of backend.cloudFields ?? []) {
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
      if (mode === 'default' && backend.containerSupported === false)
        throw new Error(cliM('cli_deploy_cloud_unsupported', { params: { backend: backend.label } }))
      // 默认与自定义都从同后端的有效配置继续，不能用表单字段重建并丢失未展示选项。
      const connection: Record<string, unknown> = backendName === current.backend ? { ...requirement.config } : requirement.config.name === undefined ? {} : { name: requirement.config.name }
      for (const field of backend.fields) {
        const previous = backendName === current.backend ? requirement.config[field.name] : undefined
        const initial = previous === undefined ? field.defaultValue ?? '' : typeof previous === 'object' ? JSON.stringify(previous) : String(previous)
        const variable = `${requirement.envPrefix}_${field.name.toUpperCase()}`
        const info = moduleEnvironmentVariables(requirement.configName).find(item => item.name === variable)
        const value = mode === 'custom' && !yes ? String(await ask({ type: field.secret ? 'password' : 'text', name: 'value', message: cliM('cli_deploy_field', { params: { description: info?.description ?? field.name, constraint: info?.constraint ?? field.kind ?? 'string' } }), initial, validate: input => module.validateMiddlewareField({ value: String(input), field, backend: backendName }) || cliM('cli_deploy_invalid_value') })) : initial
        const parsed = module.parseMiddlewareField({ value, field, backend: backendName, managed: mode === 'default' })
        if (!parsed.success)
          throw new Error(parsed.error.message)
        if (parsed.data === undefined)
          delete connection[field.name]
        else connection[field.name] = parsed.data
      }
      configuration = connection
    }
    const saved = module.saveMiddlewareEnvironment(environment, { appDir: scan.appDir ?? '.', requirement, backend: backendName, configuration, updates })
    if (!saved.success)
      throw new Error(saved.error.message)
    writeCliMessage(cliM('cli_deploy_saved', { params: { service: requirement.service } }))
  }
  // 仅默认选项对应的云服务参与初始化/开通；custom/keep 不认证、不创建。
  config.services = Object.keys(services).length ? services : undefined
  return modes
}
