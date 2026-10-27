/** 只读部署预检；inspectRemote 仅通过 SSH 读取成功基线，不执行目标写入。 */
import type { DeployConfigInput } from './deploy-config.js'
import type { DeployAppOptions } from './deploy-types.js'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { err, ok } from '@h-ai/core'
import { z } from 'zod'
import { planSidecars, resolveSidecarOptions } from './container/deploy-container-compose.js'
import { shellArgument } from './container/deploy-scripts.js'
import { createSshExecutor } from './container/deploy-ssh.js'
import { DeploymentArtifactSchema, readDeploymentArtifact } from './deploy-artifact.js'
import { DeployConfigSchema } from './deploy-config.js'
import { loadDeploymentEnvironment } from './deploy-environment.js'
import { normalizeProjectName, resolveArtifactDirectory, resolveProjectDirectory, usesDefaultMiddleware } from './deploy-functions.js'
import { deployM } from './deploy-i18n.js'
import { scanApp } from './deploy-scanner.js'
import { HaiDeployError } from './deploy-types.js'

/**
 * 查看与执行入口相同的扫描、环境、项目身份和制品校验结果。远端 current 只报告为待执行时核验。
 * @example
 * ```ts
 * import { createDeploymentPlan } from '@h-ai/deploy'
 * const plan = await createDeploymentPlan('/workspace/shop', { provider: { type: 'docker-ssh', expose: { hostPort: 8080 } } }, { environment: 'prod' })
 * ```
 */
export async function createDeploymentPlan(appDir: string, input: DeployConfigInput, options: DeployAppOptions & { inspectRemote?: boolean } = {}) {
  if ('projectName' in options && options.projectName !== undefined)
    return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_projectNameOverrideRemoved'))
  const parsed = DeployConfigSchema.safeParse(input)
  if (!parsed.success)
    return err({ ...HaiDeployError.CONFIG_ERROR, message: deployM('deploy_artifactInvalid'), ext: { fields: parsed.error.issues.map(issue => issue.path.join('.')) } })
  const config = parsed.data
  const scan = await scanApp(appDir, { environment: options.environment ?? config.environment, envDir: options.envDir })
  if (!scan.success)
    return scan
  const app = scan.data
  const directory = app.appDir ?? appDir
  const environment = await loadDeploymentEnvironment({ environment: options.environment ?? config.environment ?? 'prod', envDir: app.envDir ?? directory, requireFile: true })
  if (!environment.success)
    return environment
  const root = resolveProjectDirectory(directory)
  const projectName = normalizeProjectName(`${normalizeProjectName(app.appName)}${options.environment ?? config.environment ? `-${environment.data.environment}` : ''}`)
  const provider = config.provider
  try {
    let artifactDir = options.artifactDir ?? resolveArtifactDirectory(directory)
    if (existsSync(join(artifactDir, 'latest'))) {
      const latest = readFileSync(join(artifactDir, 'latest'), 'utf8').trim()
      if (!/^[a-z0-9][\w.+-]*$/i.test(latest))
        throw new Error('Invalid pointer')
      artifactDir = join(artifactDir, latest)
    }
    const artifact = provider.type === 'docker-ssh' ? await readDeploymentArtifact(artifactDir) : undefined
    let images: string[]
    if (artifact) {
      images = [...new Set([artifact.primaryService, ...(artifact.hasWeb ? ['web'] : [])])]
    }
    else {
      // 平台部署没有 OCI 制品时，仍使用工程显式声明的角色，不能把静态或 SSR 站点改叫后端。
      const file = join(root, 'hai.json')
      const project = existsSync(file)
        ? z.object({ build: z.object({ images: z.array(z.object({ name: DeploymentArtifactSchema.shape.primaryService })).min(1).max(2).refine(items => new Set(items.map(item => item.name)).size === items.length).optional() }).optional() }).parse(JSON.parse(readFileSync(file, 'utf8')))
        : undefined
      images = project?.build?.images?.map(image => image.name) ?? [app.isSvelteKit ? 'web' : 'serv']
    }
    const middlewares = (app.middlewares ?? []).filter(item => !['sqlite', 'local', 'memory', 'disabled', 'console', 'lancedb'].includes(item.backend))
    const available = [...new Set([...images, ...app.requiredServices])]
    const selected = options.selectedServices ?? (artifact?.partial ? artifact.images.map(image => image.name) : available)
    if (!selected.length || new Set(selected).size !== selected.length || selected.some(name => !available.includes(name)))
      return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_artifactInvalid'))
    if (artifact && selected.some(name => images.includes(name) && !artifact.images.some(image => image.name === name)))
      return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_artifactInvalid'))
    const remoteDirectory = provider.type === 'docker-ssh' ? `${provider.remote.baseDir}/${projectName}` : undefined
    const baseline = { required: Boolean(artifact?.partial || options.selectedServices), state: 'not-inspected', current: remoteDirectory ? `${remoteDirectory}/current` : undefined, release: undefined as string | undefined }
    if (options.inspectRemote) {
      if (provider.type !== 'docker-ssh' || !provider.ssh || !remoteDirectory)
        return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_sshRequired'))
      // 仅读取 current 和成功发布目录；不能创建目录、锁、凭据或触发恢复。
      const command = `root=${shellArgument(remoteDirectory)}; if [ -f "$root/current" ]; then id=$(head -c 129 "$root/current"); case "$id" in ''|*[!a-zA-Z0-9._-]*) exit 2;; esac; test -f "$root/releases/$id/compose-files" || exit 3; printf '%s' "$id"; fi`
      const result = await createSshExecutor(provider.ssh).exec(command, { timeoutMs: 15000, maxCaptureChars: 1024 })
      if (!result.success) {
        baseline.state = 'unavailable'
      }
      else {
        const release = result.data.stdout.trim()
        if (release && !/^[\w.-]{1,128}$/.test(release))
          return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_artifactInvalid'))
        baseline.state = release ? 'verified' : 'missing'
        baseline.release = release || undefined
      }
    }
    const configFiles = ['.env', '.env.local', `.env.${environment.data.environment}`, `.env.${environment.data.environment}.local`].map(name => join(environment.data.envDir, name)).filter(existsSync)
    const configDirectory = join(directory, 'config')
    if (existsSync(configDirectory))
      configFiles.push(...readdirSync(configDirectory, { withFileTypes: true }).filter(entry => entry.isFile() && /\.ya?ml$/i.test(entry.name)).map(entry => join(configDirectory, entry.name)).sort())
    const serviceModes = { ...(options.skipMiddleware ? {} : options.serviceModes), ...Object.fromEntries(app.requiredServices.filter(service => options.skipMiddleware || !selected.includes(service)).map(service => [service, 'keep' as const])) }
    const effective = resolveSidecarOptions(app, { ...options, selectedServices: selected, serviceModes })
    // 只标记将由 Provisioner 提供的配置，不认证、不请求云资源，也不读取或创建本地凭据。
    const provisionKeys = { db: 'HAI_DB', cache: 'HAI_CACHE', storage: 'HAI_STORAGE', email: 'HAI_REACH_PROVIDERS', sms: 'HAI_REACH_PROVIDERS' } as const
    const provisionEnv: Record<string, string> = {}
    const provisioners = new Map<string, string>()
    for (const service of Object.keys(provisionKeys) as Array<keyof typeof provisionKeys>) {
      const provisioner = config.services?.[service]
      if (provisioner && !options.skipMiddleware && usesDefaultMiddleware(app, service, effective)) {
        provisionEnv[provisionKeys[service]] = 'planned'
        provisioners.set(service, provisioner.provisioner)
      }
    }
    const sidecar = provider.type === 'docker-ssh' ? planSidecars(directory, projectName, app, provisionEnv, effective, config.container?.s3Engine, { dbPassword: '', storagePassword: '', ldapPassword: '' }) : undefined
    const services = Object.entries(sidecar?.composeServices ?? {}).filter(([name]) => selected.includes(name))
    return ok({
      projectName,
      root,
      appDir: directory,
      environment: environment.data.environment,
      target: provider.type === 'docker-ssh' ? { provider: provider.type, host: provider.ssh?.host, port: provider.ssh?.port, directory: remoteDirectory, runtime: provider.remote.runtime, hostPort: provider.expose.hostPort } : { provider: provider.type },
      artifact: artifact ? { directory: artifactDir, version: artifact.appVersion, buildId: artifact.buildId, verified: true, images: artifact.images.map(image => ({ name: image.name, reference: image.imageRef, sha256: image.sha256 })) } : undefined,
      selected,
      retained: available.filter(name => !selected.includes(name)),
      containers: provider.type === 'docker-ssh' ? [...selected.filter(name => images.includes(name)).map(name => `hai-${projectName}-${name}`), ...services.flatMap(([, service]) => typeof service.container_name === 'string' ? [service.container_name] : [])] : [],
      composeManagedServices: services.filter(([, service]) => typeof service.container_name !== 'string').map(([name]) => name),
      logicalVolumes: Object.keys(sidecar?.volumes ?? {}),
      middleware: middlewares.map(item => ({ service: item.service, backend: item.backend, configuration: item.envPrefix, action: effective.serviceModes?.[item.envPrefix] ?? effective.serviceModes?.[item.service] ?? 'default', provisioner: provisioners.get(item.service) })),
      configuration: { files: [join(root, 'hai.json'), ...configFiles].filter(existsSync), environmentKeys: Object.keys(environment.data.values).sort() },
      baseline,
      recovery: { releases: remoteDirectory ? `${remoteDirectory}/releases` : undefined, point: baseline.release ?? 'previous-successful-release', preservesVolumes: true, databaseRollback: false },
    })
  }
  catch {
    return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_artifactInvalid'))
  }
}
