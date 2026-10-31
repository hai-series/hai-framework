import type { Buffer } from 'node:buffer'
/** 完整或增量交付包，包含所选服务需要的全部镜像及跨平台部署入口。 */
import type { DeploymentArtifact } from '../deploy-artifact.js'
import type { DockerSshProviderConfig } from '../deploy-config.js'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, createReadStream, createWriteStream, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { parse } from 'yaml'
import { artifactChecksum } from '../deploy-artifact.js'
import { deployM } from '../deploy-i18n.js'
import { createBackendStateAssets } from './deploy-backend-state.js'
import { runCommand } from './deploy-command.js'
import { createManagedSecretAssets } from './deploy-managed-secrets.js'
import { createApplyScript, createLocalInstallScript, createUploadScripts } from './deploy-scripts.js'
import { usesSshPassword } from './deploy-ssh.js'

/**
 * 打包所选服务；完整交付自动导出中间件，服务器启动时禁止联网拉取。
 * @throws Error - 制品、Compose、文件读取、镜像导出或打包失败；包含私有运行环境的 tar 必须按秘密传输与保存。
 * @param options - 本次操作选项；字段含义见各子项。
 * @param options.directory - 包含已准备制品或部署文件的目录；具体见函数用途。
 * @param options.artifactDir - 已经验证的镜像 tar 与 manifest 所在目录。
 * @param options.artifact - 已通过结构、路径和文件摘要验证的构建清单。
 * @param options.projectName - 已归一化的项目名称。
 * @param options.deploymentId - 本次不可变部署标识，用于结果匹配和发布目录。
 * @param options.environment - 部署环境标识，通常为 prod。
 * @param options.config - 已通过 Schema 解析的 docker-ssh 配置。
 * @param options.runtime - 容器引擎策略；auto 探测可用引擎并优先 Podman。
 * @param options.output - 本次独立交付目录内的最终 tar 输出路径。
 * @param options.selected - 本次选择更新的 Compose 服务。
 * @param options.partial - 是否为增量服务部署；不能据此执行首次全量安装。
 * @param options.middlewareEnv - 应用增量继承的框架 HAI_* dotenv；镜像原生变量从独立文件读取。
 * @param options.accountSources - 初始账号变量名及来源，不包含密码值。
 * @param options.healthPaths - 允许执行的应用健康检查路径。
 * @param options.hasWebConfig - 是否挂载公开Nginx配置，包含前后端代理或独立Vite目录路由。
 * @param options.proxyService - 挂载 Nginx 配置的服务；缺省为 web，SSR/API 的存储网关为 gateway。
 * @param options.storageRouting - 自建 S3 非敏感连接/访问配置摘要，阻止增量配置与已装基线不一致。
 * @param options.containerPort - 应用容器的实际监听端口。
 * @param options.httpsAssets - 已校验的 HTTPS 证书与脚本附件。
 * @param options.cacheDirectory - 按镜像内容身份组织的私有归档缓存。
 * @returns tar 路径、手工执行说明及启动脚本名。
 * @example 模块内部上下文
 * ```ts
 * const { readDeploymentArtifact } = await import('../deploy-artifact.js')
 * const artifactDir = '.hai/build/docker/build-id'
 * const artifact = await readDeploymentArtifact(artifactDir)
 * // directory 已由 Provider 准备好 docker-compose-<版本>.yml 与 .env.runtime。
 * const directory = '.hai/deploy/prod/prepared-id'
 * const result = await createDeploymentBundle({ directory, artifactDir, artifact, projectName: 'shop', deploymentId: 'shop-prod-001', environment: 'prod', config: { type: 'docker-ssh', remote: { baseDir: '/opt/hai/apps', runtime: 'auto' }, expose: { type: 'port', hostPort: 8080, containerPort: 3000 } }, runtime: 'auto', output: '.hai/deploy/shop.tar', selected: ['serv'], partial: false, middlewareEnv: '', healthPaths: ['/health'], hasWebConfig: false, containerPort: 3000 })
 * ```
 */
export async function createDeploymentBundle(options: {
  directory: string
  artifactDir: string
  artifact: DeploymentArtifact
  projectName: string
  deploymentId: string
  environment: string
  config: DockerSshProviderConfig
  runtime: 'auto' | 'podman' | 'docker'
  output: string
  selected: string[]
  partial: boolean
  middlewareEnv: string
  /** 初始账号变量名与配置来源，不包含变量值。 */
  accountSources?: string
  healthPaths: string[]
  hasWebConfig: boolean
  proxyService?: 'web' | 'gateway'
  storageRouting?: string
  containerPort: number
  /** HTTPS 附件已在写入交付目录前校验证书与域名。 */
  httpsAssets?: Record<string, string>
  /** 按镜像内容身份复用的本地归档缓存；命中仍核验实际归档。 */
  cacheDirectory?: string
}): Promise<{ bundlePath: string, instructions: string, startName: string }> {
  const { directory, artifactDir, artifact, projectName, environment, config, selected } = options
  const output = resolve(options.output)
  if (!/^[\w.+-]+\.tar(?:\.gz)?$/.test(basename(output)))
    throw new Error(deployM('deploy_bundleNameInvalid'))
  const staging = mkdtempSync(join(directory, '.bundle-'))
  const temporaryTar = `${output}.partial`
  mkdirSync(dirname(output), { recursive: true, mode: 0o700 })
  chmodSync(staging, 0o700)
  const files: string[] = []
  const fileHashes = new Map<string, string>()
  const put = (file: string, content: string): void => {
    mkdirSync(dirname(join(staging, file)), { recursive: true })
    writeFileSync(join(staging, file), content, { mode: 0o600 })
    files.push(file)
  }
  try {
    mkdirSync(join(staging, 'images'))
    const compose = parse(readFileSync(join(directory, `docker-compose-${artifact.appVersion}.yml`), 'utf8')) as {
      services: Record<string, Record<string, unknown>>
      networks?: Record<string, unknown>
      volumes?: Record<string, unknown>
    }
    const dependencies = new Set<string>()
    const references = new Set<string>()
    for (const name of selected) {
      const service = compose.services[name]
      if (!service)
        throw new Error(deployM('deploy_selectionInvalid', { params: { service: name } }))
      if (typeof service.image === 'string')
        references.add(service.image)
      if (service.depends_on) {
        for (const dependency of Array.isArray(service.depends_on) ? service.depends_on as string[] : Object.keys(service.depends_on))
          dependencies.add(dependency)
      }
      if (service.env_file) {
        service.env_file = name === artifact.primaryService
          ? [`../${options.deploymentId}/.env.runtime`, `../${options.deploymentId}/middleware.env`]
          : [`../${options.deploymentId}/middleware-runtime.env`]
      }
      if (Array.isArray(service.volumes))
        service.volumes = service.volumes.map(mount => typeof mount === 'string' ? mount.replace(/\.\/(web\.conf|request-access\.yml|tls|https-start\.sh|renew-https\.sh|\.env\.runtime|middleware\.env|runtime-env\.mjs):/g, `../${options.deploymentId}/$1:`) : mount)
    }
    put('compose.json', JSON.stringify({ ...compose, services: Object.fromEntries(selected.map(name => [name, compose.services[name]])) }))
    // 合并入口仅保存 extends 指向；更新服务时整体切换定义，避免旧 env_file/卷列表累加。
    put('compose-entry.json', JSON.stringify({ ...compose, services: Object.fromEntries(selected.map(name => [name, { extends: { file: `../${options.deploymentId}/compose.json`, service: name } }])) }))
    let runtime: 'podman' | 'docker' | undefined
    const imageList: string[] = []
    for (const reference of references) {
      if (!/:[^/:]+$/.test(reference) || /:latest$/i.test(reference))
        throw new Error(deployM('deploy_imageVersionRequired', { params: { image: reference } }))
      const built = artifact.images.find(image => image.imageRef === reference)
      const file = built?.file ?? `middleware-${imageList.length + 1}.tar`
      const destination = join(staging, 'images', file)
      if (built) {
        const checksum = await copyArchive(join(artifactDir, file), destination)
        if (checksum !== built.sha256)
          throw new Error(deployM('deploy_artifactInvalid'))
        fileHashes.set(`images/${file}`, checksum)
      }
      else {
        if (!runtime) {
          const candidates = options.runtime === 'auto' ? ['podman', 'docker'] as const : [options.runtime]
          for (const candidate of candidates) {
            if ((await runCommand(candidate, ['version'])).success) {
              runtime = candidate
              break
            }
          }
          if (!runtime)
            throw new Error(deployM('deploy_bundleRuntimeRequired'))
        }
        let inspected = await runCommand(runtime, ['image', 'inspect', '--format', '{{.Id}}', reference])
        if (!inspected.success) {
          const pulled = await runCommand(runtime, ['pull', reference], { timeoutMs: 600_000 })
          if (!pulled.success)
            throw new Error(pulled.error.message)
          inspected = await runCommand(runtime, ['image', 'inspect', '--format', '{{.Id}}', reference])
        }
        const identity = inspected.success && !inspected.data.stdoutTruncated ? inspected.data.stdout.trim().replace(/^sha256:/, '') : ''
        // 导出的归档保留请求的镜像标签；相同内容的不同引用不能直接共用该归档。
        const cacheIdentity = createHash('sha256').update(identity).update('\0').update(reference).digest('hex')
        const cache = options.cacheDirectory && /^[a-f0-9]{64}$/.test(identity) ? join(options.cacheDirectory, `${runtime}-${cacheIdentity}.tar`) : undefined
        let checksum: string | undefined
        if (cache && existsSync(cache) && existsSync(`${cache}.sha256`) && lstatSync(cache).isFile() && !lstatSync(cache).isSymbolicLink()) {
          const copied = await copyArchive(cache, destination)
          if (copied === readFileSync(`${cache}.sha256`, 'utf8').trim())
            checksum = copied
        }
        if (!checksum) {
          const saved = await runCommand(runtime, ['save', ...(runtime === 'podman' ? ['--format', 'docker-archive'] : []), '-o', destination, reference], { timeoutMs: 600_000 })
          if (!saved.success)
            throw new Error(saved.error.message)
          checksum = await artifactChecksum(destination)
          if (cache) {
            mkdirSync(dirname(cache), { recursive: true, mode: 0o700 })
            // 不发布半写入缓存；并发打包使用各自的临时文件。
            const temporary = `${cache}.${basename(staging)}`
            try {
              copyFileSync(destination, temporary)
              renameSync(temporary, cache)
              writeFileSync(`${cache}.sha256`, `${checksum}\n`, { mode: 0o600 })
            }
            finally {
              rmSync(temporary, { force: true })
            }
          }
        }
        fileHashes.set(`images/${file}`, checksum)
      }
      files.push(`images/${file}`)
      imageList.push(`${file} ${reference}`)
    }
    put('.env.runtime', readFileSync(join(directory, '.env.runtime'), 'utf8'))
    if (selected.includes(artifact.primaryService) && existsSync(join(directory, 'request-access.yml')))
      put('request-access.yml', readFileSync(join(directory, 'request-access.yml'), 'utf8'))
    put('middleware.env', options.middlewareEnv)
    if (selected.includes(artifact.primaryService) && !compose.services[artifact.primaryService]?.env_file)
      put('runtime-env.mjs', readFileSync(new URL('./deploy-runtime-env.mjs', import.meta.url), 'utf8'))
    const middlewareRuntime = join(directory, 'middleware-runtime.env')
    const nativeEnvironment = existsSync(middlewareRuntime) ? readFileSync(middlewareRuntime, 'utf8') : ''
    put('middleware-runtime.env', nativeEnvironment)
    for (const [file, content] of Object.entries(createManagedSecretAssets(projectName, nativeEnvironment, compose)))
      put(file, content)
    if (options.hasWebConfig)
      put('web.conf', readFileSync(join(directory, 'web.conf'), 'utf8'))
    for (const [file, content] of Object.entries(options.httpsAssets ?? {}))
      put(file, content)
    put('manifest.json', `${JSON.stringify({ ...artifact, images: artifact.images.filter(image => references.has(image.imageRef)), deploymentId: options.deploymentId, selectedServices: selected, partial: options.partial }, null, 2)}\n`)
    if (options.hasWebConfig) {
      // 增量部署复用当前 Web 镜像，只覆盖公开代理配置；无需重新构建或打包 Web 镜像。
      put('proxy-entry.json', JSON.stringify({ services: { [options.proxyService ?? 'web']: { volumes: [`../${options.deploymentId}/web.conf:/etc/nginx/conf.d/default.conf:ro`] } } }))
    }
    put('storage-routing', `${options.storageRouting ?? ''}\n`)
    const httpsFingerprint = config.expose.https ? createHash('sha256').update(JSON.stringify({ ...config.expose.https, certificateFile: undefined, privateKeyFile: undefined, certificate: options.httpsAssets?.['tls/fullchain.pem'] })).digest('hex') : ''
    put('layout', `${config.expose.hostPort}:${options.containerPort}:${options.hasWebConfig ? options.proxyService === 'gateway' ? 'gateway' : 'true' : 'false'}:${artifact.primaryService}:${options.hasWebConfig ? await artifactChecksum(join(directory, 'web.conf')) : ''}${httpsFingerprint ? `:${httpsFingerprint}` : ''}\n`)
    put('web-base-path', `${artifact.webBasePath ?? ''}\n`)
    put('health-paths', `${options.healthPaths.join('\n')}\n`)
    put('image-list', `${imageList.join('\n')}\n`)
    put('dependencies', `${[...dependencies].join('\n')}\n`)
    // 卷身份和引擎随校验和交付；服务器持久账本不会随暂时移除服务而删除。
    for (const [file, content] of Object.entries(createBackendStateAssets(projectName, compose, selected)))
      put(file, content)
    put('apply.sh', createApplyScript({ deploymentId: options.deploymentId, projectName, environment, directory: `${config.remote.baseDir}/${projectName}`, runtime: config.remote.runtime, partial: options.partial, selected, primaryService: artifact.primaryService, hostPort: config.expose.hostPort, healthPaths: options.healthPaths }))
    const instructionParams = { file: basename(output), start: 'apply.sh', images: [...references].join('\n'), compose: 'compose.json' }
    const mode = deployM(options.partial ? 'deploy_bundlePartial' : 'deploy_bundleFull')
    const selection = deployM('deploy_bundleSelection', { params: { mode, services: selected.join(', ') } })
    const instructions = `${selection}\n${deployM('deploy_bundleInstructions', { params: instructionParams })}`
    const runtimeGuide = deployM('deploy_bundleRuntime', { params: { directory: `${config.remote.baseDir}/${projectName}`, deploymentId: options.deploymentId } })
    const https = config.expose.https
    const serverDirectory = `${config.remote.baseDir}/${projectName}`
    const certificates = https?.type === 'files' ? `${serverDirectory}/releases/${options.deploymentId}/tls` : `${serverDirectory}/https/certificates/${https?.domain}`
    const httpsGuide = https
      ? deployM('deploy_bundleHttps', { params: { domain: https.domain, port: https.port, mode: https.type, certificates, environment } })
      + (https.type === 'letsencrypt' ? `\n${deployM('deploy_bundleAcme', { params: { state: `${serverDirectory}/https/acme`, domain: https.domain } })}` : '')
      : deployM('deploy_bundleHttpOnly', { params: { port: config.expose.hostPort } })
    const accountGuide = deployM('deploy_bundleAccounts', { params: { sources: options.accountSources || '—' } })
    const guides = [runtimeGuide, httpsGuide, accountGuide, deployM('deploy_bundleDirectories', { params: { directory: serverDirectory, deploymentId: options.deploymentId } })].join('\n\n')
    const readme = `${deployM('deploy_bundleMetadata', { params: { version: artifact.appVersion, buildId: artifact.buildId, deploymentId: options.deploymentId, compose: 'compose.json' } })}\n${instructions}\n\n${guides}\n`
    const checksums = []
    for (const file of files)
      checksums.push(`${fileHashes.get(file) ?? await artifactChecksum(join(staging, file))}  ${file}`)
    writeFileSync(join(staging, 'SHA256SUMS'), `${checksums.join('\n')}\n`)
    const tar = await runCommand('tar', [output.endsWith('.gz') ? '-czf' : '-cf', temporaryTar, '-C', staging, '.'])
    if (!tar.success)
      throw new Error(tar.error.message)
    chmodSync(temporaryTar, 0o600)
    renameSync(temporaryTar, output)
    const upload = createUploadScripts()
    const scripts = directory
    // 部署配置、清单和镜像只保存在 tar 中，外层仅保留实际入口、目标与说明。
    writeFileSync(join(scripts, 'deploy.sh'), upload.sh, { mode: 0o700 })
    writeFileSync(join(scripts, 'deploy-local.sh'), createLocalInstallScript({ bundle: basename(output), directory: `${config.remote.baseDir}/${projectName}` }), { mode: 0o700 })
    writeFileSync(join(scripts, 'deploy.ps1'), upload.ps1)
    writeFileSync(join(scripts, 'read-target.awk'), upload.reader)
    const target = {
      host: config.ssh?.host ?? 'SERVER_HOST',
      port: config.ssh?.port ?? 22,
      username: config.ssh?.username ?? 'deploy',
      auth: config.ssh && usesSshPassword(config.ssh) ? 'password' : 'key',
      passwordEnv: 'HAI_DEPLOY_PROVIDER_SSH_PASSWORD',
      identityFile: config.ssh?.identityFile ?? '',
      knownHostsFile: config.ssh?.knownHostsFile ?? '',
      strictHostKeyChecking: config.ssh?.strictHostKeyChecking ?? true,
      connectTimeoutSeconds: config.ssh?.connectTimeoutSeconds ?? 10,
      directory: `${config.remote.baseDir}/${projectName}`,
      bundle: basename(output),
    }
    const comments = {
      host: deployM('deploy_targetHost'),
      port: deployM('deploy_targetPort'),
      username: deployM('deploy_targetUsername'),
      auth: deployM('deploy_targetAuth'),
      passwordEnv: deployM('deploy_targetPasswordEnv'),
      identityFile: deployM('deploy_targetIdentityFile'),
      knownHostsFile: deployM('deploy_targetKnownHostsFile'),
      strictHostKeyChecking: deployM('deploy_targetStrictHostKeyChecking'),
      connectTimeoutSeconds: deployM('deploy_targetConnectTimeoutSeconds'),
      directory: deployM('deploy_targetDirectory'),
      bundle: deployM('deploy_targetBundle'),
    }
    writeFileSync(join(scripts, 'deploy-target.json'), `${JSON.stringify({ ...target, _comments: comments }, null, 2)}\n`)
    writeFileSync(join(scripts, 'README.txt'), readme)
    for (const file of [`docker-compose-${artifact.appVersion}.yml`, '.env.runtime', 'middleware-runtime.env', 'request-access.yml', ...(options.hasWebConfig ? ['web.conf'] : [])])
      rmSync(join(directory, file), { force: true })
    return { bundlePath: output, instructions: `${selection}\n${deployM('deploy_bundleInstructions', { params: { ...instructionParams, file: output } })}\n${guides}\n${scripts}`, startName: 'apply.sh' }
  }
  finally {
    rmSync(staging, { recursive: true, force: true })
    rmSync(temporaryTar, { force: true })
  }
}

/** 复制与计算摘要共用一次顺序读取，避免每个大镜像复制后再读取一遍。 */
async function copyArchive(source: string, destination: string): Promise<string> {
  const hash = createHash('sha256')
  const digest = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk)
      callback(null, chunk)
    },
  })
  await pipeline(createReadStream(source), digest, createWriteStream(destination, { mode: 0o600 }))
  return hash.digest('hex')
}
