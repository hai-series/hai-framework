/**
 * @h-ai/cli — 部署命令
 *
 * 使用: hai deploy [appDir]
 * @module cli-deploy
 */

import type { DeploymentEnvironment } from '@h-ai/deploy'
import type { GlobalOptions } from '../cli-types.js'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { core } from '@h-ai/core'
import chalk from 'chalk'
import ora from 'ora'
import prompts from 'prompts'
import { cliM } from '../cli-i18n.js'
import { configureDeployMiddleware, displayDeployValue } from './cli-deploy-middleware.js'

/** deploy 命令选项 */
export interface DeployCommandOptions extends GlobalOptions {
  /** 部署环境；省略时必须交互输入。 */
  env?: string
  /** 环境文件目录，默认扫描应用/workspace 根。 */
  envDir?: string
  /** 非交互模式：保留完整的目标配置，其余采用当前后端默认配置。 */
  yes?: boolean
  /** 应用目录 */
  appDir?: string
  /** 项目名称（覆盖自动检测） */
  projectName?: string
  /** 跳过基础设施开通 */
  skipProvision?: boolean
  /** 已配置完备，跳过全部中间件处理并直接部署。 */
  skipMiddleware?: boolean
  /** 已构建镜像目录。 */
  artifactDir?: string
  /** 只生成 tar，手工搬运。 */
  bundleOnly?: boolean
  /** 部署 tar 输出路径。 */
  output?: string
}

/** 配置输入中的可选对象；不让未完成的配置绕过最终 Provider Schema。 */
function configObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/**
 * 补齐部署目标，完整配置直接复用；本机 SSH 参数和平台 Token 只写 `.env.local`。
 * @example 首次输入主机和密钥路径后，下次执行 `hai deploy --env prod` 自动复用。
 */
async function configureDeployTarget(module: typeof import('@h-ai/deploy'), config: Record<string, unknown>, environment: DeploymentEnvironment, nonInteractive?: boolean, bundleOnly?: boolean): Promise<void> {
  if (bundleOnly) {
    const existing = configObject(config.provider)
    if (existing.type && existing.type !== 'docker-ssh')
      throw new Error(cliM('cli_deploy_bundle_provider'))
    config.provider = { type: 'docker-ssh', remote: { runtime: 'auto' }, expose: { hostPort: 3000 }, ...existing }
  }
  const current = module.ProviderConfigSchema.safeParse(config.provider)
  if (current.success && (bundleOnly || current.data.type !== 'docker-ssh' || current.data.ssh)) {
    config.provider = current.data
    core.logger.info(cliM('cli_deploy_target_reused', { params: { target: current.data.type === 'docker-ssh' ? current.data.ssh ? `${current.data.ssh.username}@${current.data.ssh.host}:${current.data.ssh.port}` : cliM('cli_deploy_bundle_local') : 'Vercel' } }))
    return
  }
  if (nonInteractive)
    throw new Error(cliM('cli_deploy_target_missing', { params: { fields: current.success ? 'provider.ssh' : current.error.issues.map(issue => `provider.${issue.path.join('.')}`).join(', ') } }))

  const original = configObject(config.provider)
  const platform = await prompts({
    type: 'select',
    name: 'value',
    message: cliM('cli_deploy_target_platform'),
    choices: [{ title: cliM('cli_deploy_target_ssh'), value: 'docker-ssh' }, { title: 'Vercel', value: 'vercel' }],
    initial: original.type === 'vercel' ? 1 : 0,
  })
  if (!platform.value)
    throw new Error(cliM('cli_deploy_cancelled'))

  const input = async (name: string, initial: unknown, options: { optional?: boolean, secret?: boolean, port?: boolean } = {}): Promise<string> => {
    const answer = await prompts({
      type: options.secret ? 'password' : 'text',
      name: 'value',
      message: cliM('cli_deploy_target_field', { params: { name } }),
      initial: options.secret ? undefined : initial === undefined ? '' : String(initial),
      validate: (value: string) => options.port
        ? (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535) || cliM('cli_deploy_invalid_value')
        : options.optional || !!value.trim() || cliM('cli_deploy_invalid_value'),
    })
    if (answer.value === undefined)
      throw new Error(cliM('cli_deploy_cancelled'))
    return String(answer.value).trim()
  }
  let provider: Record<string, unknown>
  if (platform.value === 'docker-ssh') {
    core.logger.info(cliM('cli_deploy_target_ssh_hint'))
    const ssh = configObject(original.ssh)
    const remote = configObject(original.remote)
    const expose = configObject(original.expose)
    const host = await input('HAI_DEPLOY_PROVIDER_SSH_HOST', ssh.host)
    const port = Number(await input('HAI_DEPLOY_PROVIDER_SSH_PORT', ssh.port ?? 22, { port: true }))
    const username = await input('HAI_DEPLOY_PROVIDER_SSH_USERNAME', ssh.username)
    const identityFile = await input('HAI_DEPLOY_PROVIDER_SSH_IDENTITYFILE', ssh.identityFile, { optional: true })
    const knownHostsFile = await input('HAI_DEPLOY_PROVIDER_SSH_KNOWNHOSTSFILE', ssh.knownHostsFile, { optional: true })
    const baseDir = await input('HAI_DEPLOY_PROVIDER_REMOTE_BASEDIR', remote.baseDir || '/opt/hai/apps')
    const runtime = await prompts({ type: 'select', name: 'value', message: cliM('cli_deploy_target_runtime'), choices: ['auto', 'podman', 'docker'].map(value => ({ title: value, value })), initial: ['auto', 'podman', 'docker'].indexOf(String(remote.runtime ?? 'auto')) })
    if (!runtime.value)
      throw new Error(cliM('cli_deploy_cancelled'))
    const hostPort = Number(await input('HAI_DEPLOY_PROVIDER_EXPOSE_HOSTPORT', expose.hostPort || 3000, { port: true }))
    const containerPort = Number(await input('HAI_DEPLOY_PROVIDER_EXPOSE_CONTAINERPORT', expose.containerPort || 3000, { port: true }))
    provider = {
      type: 'docker-ssh',
      ssh: { ...ssh, host, port, username, identityFile: identityFile || undefined, knownHostsFile: knownHostsFile || undefined },
      remote: { ...remote, baseDir, runtime: runtime.value },
      expose: { type: 'port', hostPort, containerPort },
    }
  }
  else {
    provider = { type: 'vercel', token: await input('HAI_DEPLOY_PROVIDER_TOKEN', undefined, { secret: true }) }
  }
  const validated = module.ProviderConfigSchema.safeParse(provider)
  if (!validated.success)
    throw new Error(cliM('cli_deploy_invalid_value'))
  const saved = module.saveDeploymentEnvironment(environment, { HAI_DEPLOY_PROVIDER: JSON.stringify(validated.data) }, { private: true })
  if (!saved.success)
    throw new Error(saved.error.message)
  config.provider = validated.data
  core.logger.info(cliM('cli_deploy_target_saved'))
}

/**
 * 执行部署命令
 *
 * @param options - 部署选项
 * @example `await deployCommand({ env: 'prod', skipMiddleware: true, yes: true })`
 */
export async function deployCommand(options: DeployCommandOptions): Promise<void> {
  const spinner = ora()
  const cwd = options.cwd ?? process.cwd()
  let appDir = resolve(cwd, options.appDir ?? '.')
  let closeDeploy: (() => Promise<void>) | null = null
  const originalEnv = { ...process.env }

  try {
    // 环境选择是第一步；取消、无 TTY 或缺文件均不能继续认证/开通资源。
    let environmentName = options.env
    if (!environmentName) {
      if (!process.stdin.isTTY)
        throw new Error(cliM('cli_deploy_environment_hint'))
      const answer = await prompts({ type: 'text', name: 'environment', message: cliM('cli_deploy_environment'), initial: 'prod' })
      environmentName = answer.environment
      if (!environmentName)
        throw new Error(cliM('cli_deploy_cancelled'))
    }
    if (!options.yes && !process.stdin.isTTY)
      throw new Error(cliM('cli_deploy_environment_hint'))
    // 动态导入 @h-ai/deploy（允许 CLI 在未安装 deploy 时仍可使用其他命令）
    let deployModule: typeof import('@h-ai/deploy')
    try {
      // 全局安装的 CLI 先使用目标工程的 deploy 版本，不依赖 CLI 的开发依赖。
      const localRequire = createRequire(resolve(appDir, 'package.json'))
      let localModule: string | undefined
      try {
        localModule = localRequire.resolve('@h-ai/deploy')
      }
      catch { /* 源码仓库或直接模块测试可使用 CLI 本身可解析的安装。 */ }
      deployModule = localModule ? await import(pathToFileURL(localModule).href) : await import('@h-ai/deploy')
    }
    catch {
      core.logger.error(chalk.red(cliM('cli_deploy_module_missing')))
      core.logger.info(chalk.cyan('  pnpm add @h-ai/deploy'))
      throw new Error(cliM('cli_deploy_module_missing'))
    }

    const { deploy } = deployModule

    const scanResult = await deploy.scan(appDir, { environment: environmentName, envDir: options.envDir ? resolve(cwd, options.envDir) : undefined })
    if (!scanResult.success)
      throw new Error(cliM('cli_deploy_scan_failed', { params: { message: scanResult.error.message } }))
    const scan = scanResult.data
    appDir = scan.appDir ?? appDir
    const environment = deployModule.loadDeploymentEnvironment({ environment: environmentName, envDir: scan.envDir ?? appDir })
    if (!environment.success)
      throw new Error(environment.error.message)
    Object.assign(process.env, environment.data.values)

    // 1. 加载凭证
    spinner.start(cliM('cli_deploy_load_credentials'))
    const credResult = deploy.credentials.load()
    if (!credResult.success) {
      throw new Error(cliM('cli_deploy_credentials_failed', { params: { message: credResult.error.message } }))
    }
    spinner.succeed(cliM('cli_deploy_credentials_loaded', { params: { count: credResult.data.length } }))

    // 2. 读取部署配置
    spinner.start(cliM('cli_deploy_load_config'))
    const configPath = resolve(appDir, 'config', '_deploy.yml')
    if (!existsSync(configPath)) {
      spinner.fail(chalk.red(cliM('cli_deploy_config_missing', { params: { path: configPath } })))
      core.logger.info(chalk.cyan(cliM('cli_deploy_config_hint')))
      throw new Error(cliM('cli_deploy_config_missing', { params: { path: configPath } }))
    }

    const loadedConfig = deployModule.loadDeploymentConfig('deploy', configPath, process.env)
    if (!loadedConfig.success)
      throw new Error(loadedConfig.error.message)
    const deployConfig = loadedConfig.data
    spinner.succeed(cliM('cli_deploy_config_loaded'))
    await configureDeployTarget(deployModule, deployConfig, environment.data, options.yes, options.bundleOnly)

    spinner.succeed(cliM('cli_deploy_scanned', { params: { name: scan.appName, sveltekit: String(scan.isSvelteKit), services: scan.requiredServices.join(', ') || cliM('cli_deploy_none') } }))

    let skipMiddleware = options.skipMiddleware || options.skipProvision
    if (!skipMiddleware && !options.yes && scan.requiredServices.length) {
      const action = await prompts({
        type: 'select',
        name: 'value',
        message: cliM('cli_deploy_middleware_plan'),
        choices: [{ title: cliM('cli_deploy_middleware_configure'), value: 'configure' }, { title: cliM('cli_deploy_middleware_skip'), value: 'skip' }],
      })
      if (!action.value)
        throw new Error(cliM('cli_deploy_cancelled'))
      skipMiddleware = action.value === 'skip'
    }
    if (skipMiddleware)
      core.logger.info(cliM('cli_deploy_middleware_skipped'))
    const serviceModes = skipMiddleware
      ? Object.fromEntries(scan.requiredServices.map(service => [service, 'keep' as const]))
      : await configureDeployMiddleware(deployModule, scan, environment.data, deployConfig, options.yes)
    if (skipMiddleware)
      deployConfig.services = undefined
    // 刚写入文件的值不能被本次命令之前注入的快照覆盖；保留用户原有进程变量优先级。
    for (const key of Object.keys(process.env)) {
      if (originalEnv[key] === undefined)
        delete process.env[key]
    }
    Object.assign(process.env, originalEnv)
    const refreshed = deployModule.loadDeploymentEnvironment({ environment: environment.data.environment, envDir: environment.data.envDir })
    if (!refreshed.success)
      throw new Error(refreshed.error.message)
    Object.assign(process.env, refreshed.data.values)

    // 4. 初始化 deploy 模块
    spinner.start(cliM('cli_deploy_initializing'))
    const validatedConfig = deployModule.DeployConfigSchema.safeParse(deployConfig)
    if (!validatedConfig.success)
      throw new Error(cliM('cli_deploy_init_failed', { params: { message: cliM('cli_deploy_invalid_value') } }))
    const initResult = await deploy.init(validatedConfig.data)
    if (!initResult.success) {
      throw new Error(cliM('cli_deploy_init_failed', { params: { message: initResult.error.message } }))
    }
    closeDeploy = () => deploy.close()
    spinner.succeed(cliM('cli_deploy_initialized'))

    // 5. 执行部署
    spinner.start(cliM('cli_deploy_deploying'))
    const deployResult = await deploy.deployApp(appDir, {
      projectName: options.projectName,
      skipProvision: skipMiddleware,
      artifactDir: options.artifactDir ? resolve(cwd, options.artifactDir) : undefined,
      bundleOnly: options.bundleOnly,
      output: options.output ? resolve(cwd, options.output) : undefined,
      environment: environment.data.environment,
      envDir: environment.data.envDir,
      serviceModes,
    })

    if (!deployResult.success) {
      if (deployResult.error.ext?.recovery) {
        core.logger.warn(deployResult.error.suggestion ?? cliM('cli_deploy_command_failed'), {
          recovery: deployResult.error.ext.recovery,
        })
      }
      throw new Error(cliM('cli_deploy_failed', { params: { message: deployResult.error.message } }))
    }

    spinner.succeed(chalk.green(cliM(deployResult.data.status === 'packaged' ? 'cli_deploy_bundle_ready' : 'cli_deploy_success')))
    for (const key of Object.keys(process.env)) {
      if (originalEnv[key] === undefined)
        delete process.env[key]
    }
    Object.assign(process.env, originalEnv)
    const completedEnvironment = deployModule.loadDeploymentEnvironment({ environment: environment.data.environment, envDir: environment.data.envDir })
    if (!completedEnvironment.success)
      throw new Error(completedEnvironment.error.message)
    for (const requirement of scan.middlewares ?? []) {
      if ((serviceModes[requirement.envPrefix] ?? serviceModes[requirement.service]) === 'keep')
        continue
      const value = completedEnvironment.data.values[requirement.envPrefix]
      if (value !== undefined)
        core.logger.info(cliM('cli_deploy_saved', { params: { name: requirement.envPrefix, value: displayDeployValue(requirement.envPrefix, value) } }))
    }
    core.logger.info('')
    if (deployResult.data.bundlePath)
      core.logger.info(cliM('cli_deploy_bundle_path', { params: { path: deployResult.data.bundlePath } }))
    if (deployResult.data.status === 'packaged')
      core.logger.info(deployResult.data.instructions ?? '')
    else
      core.logger.info(chalk.cyan(cliM('cli_deploy_url', { params: { url: deployResult.data.url } })))
    core.logger.info(chalk.gray(cliM('cli_deploy_id', { params: { id: deployResult.data.deploymentId } })))
    if (deployResult.data.envVarsSet.length > 0) {
      core.logger.info(chalk.gray(cliM('cli_deploy_env', { params: { names: deployResult.data.envVarsSet.join(', ') } })))
    }
    core.logger.info('')
  }
  catch (error) {
    spinner.fail(chalk.red(cliM('cli_deploy_command_failed')))
    core.logger.error(error instanceof Error ? error.message : String(error))
    throw error
  }
  finally {
    if (closeDeploy) {
      try {
        await closeDeploy()
      }
      catch (error) {
        core.logger.error('Failed to close deploy module', { error })
        process.exitCode = 1
      }
    }
    for (const key of Object.keys(process.env)) {
      if (originalEnv[key] === undefined)
        delete process.env[key]
    }
    Object.assign(process.env, originalEnv)
  }
}
