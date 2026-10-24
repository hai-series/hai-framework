/**
 * @h-ai/cli — 部署命令
 *
 * 使用: hai deploy [appDir]
 * @module cli-deploy
 */

import type { DeploymentEnvironment } from '@h-ai/deploy'
import type { GlobalOptions } from '../cli-types.js'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'
import { core } from '@h-ai/core'
import chalk from 'chalk'
import ora from 'ora'
import prompts from 'prompts'
import { cliM } from '../cli-i18n.js'
import { writeCliError, writeCliMessage } from '../cli-utils.js'
import { buildCommand } from './cli-build.js'
import { configureDeployMiddleware } from './cli-deploy-middleware.js'
import { projectConfigPath, readProjectConfig } from './cli-project-config.js'

/**
 * deploy 命令选项
 * 构建与部署分离；bundleOnly 只打包，不表示服务已上线。SSH 中断后的远端状态需按部署 ID 与结果文件核对。
 * @example 模块内部上下文
 * ```ts
 * const options: DeployCommandOptions = { cwd: '/workspace/shop', appDir: 'packages/shop-serv', env: 'prod', yes: true, bundleOnly: true, output: '.hai/shop.tar' }
 * ```
 */
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
  /** 已配置完备，跳过全部中间件处理并直接部署。 */
  skipMiddleware?: boolean
  /** 已构建镜像目录。 */
  artifactDir?: string
  /** 本次更新的服务，逗号分隔。 */
  services?: string
  /** 先构建镜像。 */
  build?: boolean
  /** 本地容器引擎。 */
  runtime?: 'auto' | 'podman' | 'docker'
  /** 构建阶段的网络与原生依赖设置。 */
  network?: string
  sqlitePrebuildMirror?: string
  httpProxy?: boolean
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
 * 补齐部署目标，完整配置直接复用；SSH 参数和平台 Token 只写 `.env.<环境>.local`。
 * @example 首次输入主机和密钥或密码后，下次执行 `hai deploy --env prod` 自动复用。
 */
async function configureDeployTarget(module: typeof import('@h-ai/deploy'), config: Record<string, unknown>, environment: DeploymentEnvironment, nonInteractive?: boolean, bundleOnly?: boolean): Promise<void> {
  if (bundleOnly) {
    const existing = configObject(config.provider)
    if (existing.type && existing.type !== 'docker-ssh')
      throw new Error(cliM('cli_deploy_bundle_provider'))
    config.provider = { type: 'docker-ssh', remote: { runtime: 'auto' }, expose: { hostPort: 3000 }, ...existing }
    const candidate = module.ProviderConfigSchema.safeParse(config.provider)
    // 仅打包不依赖 SSH；未填写完整的连接由交付目录中的目标文件补齐。
    if (!candidate.success && candidate.error.issues.some(issue => issue.path[0] === 'ssh')) {
      const provider = configObject(config.provider)
      delete provider.ssh
    }
  }
  const current = module.ProviderConfigSchema.safeParse(config.provider)
  if (current.success && (bundleOnly || current.data.type !== 'docker-ssh' || current.data.ssh)) {
    config.provider = current.data
    writeCliMessage(bundleOnly
      ? cliM('cli_deploy_bundle_target')
      : cliM('cli_deploy_target_reused', { params: { target: current.data.type === 'docker-ssh' && current.data.ssh ? `${current.data.ssh.username}@${current.data.ssh.host}:${current.data.ssh.port}` : 'Vercel' } }))
    return
  }
  if (nonInteractive || bundleOnly)
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

  const input = async (name: string, initial: unknown, options: { optional?: boolean, secret?: boolean, port?: boolean, trim?: boolean } = {}): Promise<string> => {
    const answer = await prompts({
      type: options.secret ? 'password' : 'text',
      name: 'value',
      message: cliM(`cli_deploy_input${name.split('_').at(-1)}` as Parameters<typeof cliM>[0]),
      initial: options.secret ? undefined : initial === undefined ? '' : String(initial),
      validate: (value: string) => options.port
        ? (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535) || cliM('cli_deploy_port_invalid')
        : options.optional || !!(options.trim === false ? value : value.trim()) || cliM('cli_deploy_invalid_value'),
    })
    if (answer.value === undefined)
      throw new Error(cliM('cli_deploy_cancelled'))
    return options.trim === false ? String(answer.value) : String(answer.value).trim()
  }
  let provider: Record<string, unknown>
  if (platform.value === 'docker-ssh') {
    writeCliMessage(cliM('cli_deploy_target_ssh_hint'))
    const ssh = configObject(original.ssh)
    const remote = configObject(original.remote)
    const expose = configObject(original.expose)
    const host = await input('HAI_DEPLOY_PROVIDER_SSH_HOST', ssh.host)
    const port = Number(await input('HAI_DEPLOY_PROVIDER_SSH_PORT', ssh.port ?? 22, { port: true }))
    const username = await input('HAI_DEPLOY_PROVIDER_SSH_USERNAME', ssh.username)
    const previousPasswordMode = ssh.auth === 'password' || (ssh.auth !== 'key' && typeof ssh.password === 'string' && ssh.password.length > 0)
    const authentication = await prompts({
      type: 'select',
      name: 'value',
      message: cliM('cli_deploy_target_auth'),
      choices: [{ title: cliM('cli_deploy_target_auth_key'), value: 'key' }, { title: cliM('cli_deploy_target_auth_password'), value: 'password' }],
      initial: previousPasswordMode ? 1 : 0,
    })
    if (!['key', 'password'].includes(authentication.value))
      throw new Error(cliM('cli_deploy_cancelled'))
    const auth = authentication.value as 'key' | 'password'
    const password = auth === 'password'
      ? previousPasswordMode && typeof ssh.password === 'string' && ssh.password.length > 0 ? ssh.password : await input('HAI_DEPLOY_PROVIDER_SSH_PASSWORD', undefined, { secret: true, trim: false })
      : undefined
    const identityFile = auth === 'key' ? await input('HAI_DEPLOY_PROVIDER_SSH_IDENTITYFILE', ssh.identityFile, { optional: true }) : undefined
    const knownHostsFile = await input('HAI_DEPLOY_PROVIDER_SSH_KNOWNHOSTSFILE', ssh.knownHostsFile, { optional: true })
    const baseDir = await input('HAI_DEPLOY_PROVIDER_REMOTE_BASEDIR', remote.baseDir || '/opt/hai/apps')
    const runtime = await prompts({ type: 'select', name: 'value', message: cliM('cli_deploy_target_runtime'), choices: ['auto', 'podman', 'docker'].map(value => ({ title: value, value })), initial: ['auto', 'podman', 'docker'].indexOf(String(remote.runtime ?? 'auto')) })
    if (!runtime.value)
      throw new Error(cliM('cli_deploy_cancelled'))
    const hostPort = Number(await input('HAI_DEPLOY_PROVIDER_EXPOSE_HOSTPORT', expose.hostPort || 3000, { port: true }))
    const containerPort = Number(await input('HAI_DEPLOY_PROVIDER_EXPOSE_CONTAINERPORT', expose.containerPort || 3000, { port: true }))
    provider = {
      type: 'docker-ssh',
      ssh: { ...ssh, host, port, username, auth, password, identityFile: identityFile || undefined, knownHostsFile: knownHostsFile || undefined },
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
  writeCliMessage(cliM('cli_deploy_target_saved'))
}

/**
 * 执行部署命令
 *
 * @param options - 部署选项
 * 显式加载目标环境、配置中间件并检查 HaiResult；退出时恢复原进程环境并关闭部署模块。
 * @throws Error - 扫描、配置、构建、打包或部署失败；SSH 本地终止不等于远端部署已停止。
 * @returns 部署或仅打包流程结束；具体模式见 bundleOnly。
 * @example 模块内部上下文
 * ```ts
 * // 前提：当前工程已构建镜像产物，且有根 hai.json.deploy 与生产公共/私有环境。
 * await deployCommand({ cwd: process.cwd(), env: 'prod', yes: true, bundleOnly: true, output: '.hai/shop.tar' })
 * // 等价：hai deploy --env prod --yes --bundle-only --output .hai/shop.tar。
 * ```
 */
export async function deployCommand(options: DeployCommandOptions): Promise<void> {
  const spinner = ora()
  const cwd = options.cwd ?? process.cwd()
  let appDir = resolve(cwd, options.appDir ?? '.')
  let closeDeploy: (() => Promise<void>) | null = null
  let restoreProjectLogger: (() => void) | undefined
  const originalEnv = { ...process.env }
  const previousLogLevel = core.logger.getLevel()
  core.logger.setLevel('fatal')

  try {
    if (options.runtime && !['auto', 'podman', 'docker'].includes(options.runtime))
      throw new Error(cliM('cli_build_runtime_missing'))
    if (options.artifactDir && options.build)
      throw new Error(cliM('cli_deploy_build_artifact_conflict'))
    if (!options.build && (options.network !== undefined || options.sqlitePrebuildMirror !== undefined || options.httpProxy === false))
      throw new Error(cliM('cli_deploy_build_options_required'))
    let selectedServices = options.services?.split(',').map(name => name.trim())
    if (selectedServices && (!selectedServices.length || selectedServices.some(name => !/^[a-z][a-z0-9-]*$/.test(name)) || new Set(selectedServices).size !== selectedServices.length))
      throw new Error(cliM('cli_build_selection_invalid'))
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
      try {
        const { core: projectCore } = await import(pathToFileURL(localRequire.resolve('@h-ai/core')).href) as typeof import('@h-ai/core')
        if (projectCore !== core) {
          const level = projectCore.logger.getLevel()
          projectCore.logger.setLevel('fatal')
          restoreProjectLogger = () => projectCore.logger.setLevel(level)
        }
      }
      catch { /* 未安装项目依赖时，由 deploy 导入错误统一提示。 */ }
      let localModule: string | undefined
      try {
        localModule = localRequire.resolve('@h-ai/deploy')
      }
      catch { /* 源码仓库或直接模块测试可使用 CLI 本身可解析的安装。 */ }
      deployModule = localModule ? await import(pathToFileURL(localModule).href) : await import('@h-ai/deploy')
    }
    catch {
      writeCliError(chalk.red(cliM('cli_deploy_module_missing')))
      writeCliMessage(chalk.cyan('  pnpm add -D @h-ai/deploy'))
      throw new Error(cliM('cli_deploy_module_missing'))
    }

    const { deploy } = deployModule

    const scanResult = await deploy.scan(appDir, { environment: environmentName, envDir: options.envDir ? resolve(cwd, options.envDir) : undefined })
    if (!scanResult.success)
      throw new Error(cliM('cli_deploy_scan_failed', { params: { message: scanResult.error.message } }))
    const scan = scanResult.data
    appDir = scan.appDir ?? appDir
    const buildFile = projectConfigPath(appDir)
    const buildRoot = dirname(buildFile)
    const project = existsSync(buildFile) ? readProjectConfig(buildFile) : {}
    const buildConfig = configObject(project.build)
    const imageNames = Array.isArray(buildConfig.images)
      ? buildConfig.images.flatMap((image) => {
          const name = configObject(image).name
          return typeof name === 'string' ? [name] : []
        })
      : ['app', 'web']
    const names = [...imageNames, ...(scan.middlewares ?? []).filter(item => !['sqlite', 'local', 'memory', 'disabled', 'console', 'lancedb'].includes(item.backend)).map(item => item.service)]
    const available = [...new Set(names)]
    if (selectedServices?.some(name => !available.includes(name)))
      throw new Error(cliM('cli_deploy_services_invalid', { params: { services: available.join(', ') } }))
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
    const configPath = buildFile
    if (!existsSync(configPath)) {
      spinner.fail(chalk.red(cliM('cli_deploy_config_missing', { params: { path: configPath } })))
      writeCliMessage(chalk.cyan(cliM('cli_deploy_config_hint')))
      throw new Error(cliM('cli_deploy_config_missing', { params: { path: configPath } }))
    }

    const loadedConfig = deployModule.loadDeploymentConfig('deploy', configPath, process.env)
    if (!loadedConfig.success)
      throw new Error(loadedConfig.error.message)
    const deployConfig = loadedConfig.data
    spinner.succeed(cliM('cli_deploy_config_loaded'))
    if (!options.build && !selectedServices && configObject(deployConfig.provider).type === 'docker-ssh') {
      let artifactDirectory = options.artifactDir ? resolve(cwd, options.artifactDir) : resolve(buildRoot, '.hai/build/docker')
      if (existsSync(resolve(artifactDirectory, 'latest'))) {
        const pointer = readFileSync(resolve(artifactDirectory, 'latest'), 'utf8').trim()
        if (!/^[a-z0-9][\w.+-]*$/i.test(pointer))
          throw new Error(cliM('cli_deploy_artifact_invalid'))
        artifactDirectory = resolve(artifactDirectory, pointer)
      }
      if (existsSync(resolve(artifactDirectory, 'manifest.json'))) {
        try {
          const artifact = await deployModule.readDeploymentArtifact(artifactDirectory)
          if (artifact.partial)
            selectedServices = artifact.images.map(image => image.name)
        }
        catch {
          throw new Error(cliM('cli_deploy_artifact_invalid'))
        }
      }
    }
    await configureDeployTarget(deployModule, deployConfig, environment.data, options.yes, options.bundleOnly)
    if (configObject(deployConfig.provider).type !== 'docker-ssh' && (selectedServices || options.build))
      throw new Error(cliM('cli_deploy_bundle_provider'))

    if (!options.yes && !selectedServices && configObject(deployConfig.provider).type === 'docker-ssh') {
      if (existsSync(buildFile)) {
        if (available.length > 1) {
          const choice = await prompts({ type: 'multiselect', name: 'value', message: cliM('cli_deploy_choose_services'), choices: available.map(name => ({ title: name, value: name, selected: true })), min: 1 })
          if (!Array.isArray(choice.value) || choice.value.length === 0)
            throw new Error(cliM('cli_deploy_cancelled'))
          if (choice.value.length !== available.length)
            selectedServices = choice.value
        }
      }
    }

    spinner.succeed(cliM('cli_deploy_scanned', { params: { name: scan.appName, sveltekit: String(scan.isSvelteKit), services: scan.requiredServices.join(', ') || cliM('cli_deploy_none') } }))

    if (options.build) {
      if (!existsSync(buildFile))
        throw new Error(cliM('cli_build_images_missing'))
      const imageNames = selectedServices?.filter(name => ['app', 'web'].includes(name))
      if (!selectedServices || imageNames?.length) {
        writeCliMessage(cliM('cli_deploy_build_started'))
        await buildCommand({ cwd: buildRoot, target: 'docker', images: imageNames?.join(','), runtime: options.runtime, network: options.network, sqlitePrebuildMirror: options.sqlitePrebuildMirror, httpProxy: options.httpProxy })
      }
    }
    if (selectedServices)
      writeCliMessage(cliM('cli_deploy_services', { params: { services: selectedServices.join(', ') } }))
    let skipMiddleware = options.skipMiddleware || selectedServices?.every(name => ['app', 'web'].includes(name))
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
      writeCliMessage(cliM('cli_deploy_middleware_skipped'))
    const serviceModes = skipMiddleware
      ? Object.fromEntries(scan.requiredServices.map(service => [service, 'keep' as const]))
      : await configureDeployMiddleware(deployModule, { ...scan, middlewares: scan.middlewares?.filter(item => !selectedServices || selectedServices.includes(item.service)) }, environment.data, deployConfig, options.yes)
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
      throw new Error(cliM('cli_deploy_config_invalid', { params: { path: configPath, fields: validatedConfig.error.issues.map(issue => issue.path.join('.')).join(', ') } }))
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
      selectedServices,
      runtime: options.runtime,
      onProgress: stage => writeCliMessage(cliM(`cli_deploy_stage_${stage}`)),
      skipMiddleware,
      artifactDir: options.artifactDir ? resolve(cwd, options.artifactDir) : undefined,
      bundleOnly: options.bundleOnly,
      output: options.output ? resolve(cwd, options.output) : undefined,
      environment: environment.data.environment,
      envDir: environment.data.envDir,
      serviceModes,
    })

    if (!deployResult.success) {
      const execution = deployModule.getDeployCommandState(deployResult.error)
      if (execution) {
        const localKey = execution.localTermination === 'not-started' ? 'cli_deploy_local_not_started' : execution.localTermination === 'confirmed' ? 'cli_deploy_local_confirmed' : 'cli_deploy_local_unknown'
        writeCliMessage(cliM(localKey))
        if (execution.remoteExecution)
          writeCliMessage(cliM(execution.remoteExecution === 'finished' ? 'cli_deploy_remote_finished' : 'cli_deploy_remote_unknown'))
        if (execution.deploymentId && execution.resultFile)
          writeCliMessage(cliM('cli_deploy_result_check', { params: { id: execution.deploymentId, path: execution.resultFile } }))
      }
      if (deployResult.error.ext?.recovery) {
        writeCliMessage(deployResult.error.suggestion ?? cliM('cli_deploy_command_failed'))
      }
      throw new Error(cliM('cli_deploy_failed', { params: { message: deployResult.error.message } }))
    }

    spinner.succeed(chalk.green(cliM(deployResult.data.status === 'packaged' ? 'cli_deploy_bundle_ready' : 'cli_deploy_success')))
    writeCliMessage('')
    if (deployResult.data.bundlePath && (deployResult.data.status !== 'packaged' || !deployResult.data.instructions))
      writeCliMessage(cliM('cli_deploy_bundle_path', { params: { path: deployResult.data.bundlePath } }))
    if (deployResult.data.status === 'packaged')
      writeCliMessage(deployResult.data.instructions ?? '')
    else
      writeCliMessage(chalk.cyan(cliM('cli_deploy_url', { params: { url: deployResult.data.url } })))
    writeCliMessage(chalk.gray(cliM('cli_deploy_id', { params: { id: deployResult.data.deploymentId } })))
    if (refreshed.data.values.HAI_ADMIN_DEFAULT_PASSWORD && (!selectedServices || selectedServices.includes('app'))) {
      const passwordKey = 'HAI_ADMIN_DEFAULT_PASSWORD'
      const source = originalEnv[passwordKey] !== undefined
        ? cliM('cli_deploy_processEnvironment')
        : [`.env.${refreshed.data.environment}.local`, '.env.local', `.env.${refreshed.data.environment}`, '.env']
            .map(file => resolve(refreshed.data.envDir, file))
            .find(file => existsSync(file) && parseEnv(readFileSync(file, 'utf8'))[passwordKey] !== undefined)
      if (source)
        writeCliMessage(chalk.cyan(cliM('cli_deploy_adminPasswordSource', { params: { source } })))
    }
    writeCliMessage('')
  }
  catch (error) {
    spinner.fail(chalk.red(cliM('cli_deploy_command_failed')))
    writeCliError(error instanceof Error ? error.message : String(error))
    throw error
  }
  finally {
    if (closeDeploy) {
      try {
        await closeDeploy()
      }
      catch (error) {
        writeCliError('Failed to close deploy module', error)
        process.exitCode = 1
      }
    }
    for (const key of Object.keys(process.env)) {
      if (originalEnv[key] === undefined)
        delete process.env[key]
    }
    Object.assign(process.env, originalEnv)
    core.logger.setLevel(previousLogLevel)
    restoreProjectLogger?.()
  }
}
