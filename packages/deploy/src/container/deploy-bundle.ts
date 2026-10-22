/** 完整或增量交付包，包含所选服务需要的全部镜像及跨平台部署入口。 */
import type { DeploymentArtifact } from '../deploy-artifact.js'
import type { DockerSshProviderConfig } from '../deploy-config.js'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { parse } from 'yaml'
import { artifactChecksum } from '../deploy-artifact.js'
import { deployM } from '../deploy-i18n.js'
import { runCommand } from './deploy-command.js'
import { createApplyScript, createUploadScripts } from './deploy-scripts.js'

/** 打包所选服务；完整交付自动导出中间件，服务器启动时禁止联网拉取。 */
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
  healthPaths: string[]
  hasWeb: boolean
  containerPort: number
}): Promise<{ bundlePath: string, instructions: string, startName: string }> {
  const { directory, artifactDir, artifact, projectName, environment, config, selected } = options
  const stem = basename(options.output).replace(/\.tar$/i, '')
  const suffix = `-${artifact.appVersion}`
  const output = resolve(dirname(options.output), `${stem.endsWith(suffix) ? stem : `${stem}${suffix}`}.tar`)
  if (!/^[\w.+-]+\.tar$/.test(basename(output)))
    throw new Error(deployM('deploy_bundleNameInvalid'))
  const staging = mkdtempSync(join(directory, '.bundle-'))
  const temporaryTar = `${output}.partial`
  mkdirSync(dirname(output), { recursive: true, mode: 0o700 })
  chmodSync(staging, 0o700)
  const files: string[] = []
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
      if (service.env_file)
        service.env_file = [`../${options.deploymentId}/.env.runtime`, `../${options.deploymentId}/middleware.env`]
      if (Array.isArray(service.volumes))
        service.volumes = service.volumes.map(mount => typeof mount === 'string' ? mount.replace('./web.conf:', `../${options.deploymentId}/web.conf:`) : mount)
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
      if (built) {
        copyFileSync(join(artifactDir, file), join(staging, 'images', file))
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
        if (!(await runCommand(runtime, ['image', 'inspect', reference])).success) {
          const pulled = await runCommand(runtime, ['pull', reference], { timeoutMs: 600_000 })
          if (!pulled.success)
            throw new Error(pulled.error.message)
        }
        const saved = await runCommand(runtime, ['save', ...(runtime === 'podman' ? ['--format', 'docker-archive'] : []), '-o', join(staging, 'images', file), reference], { timeoutMs: 600_000 })
        if (!saved.success)
          throw new Error(saved.error.message)
      }
      files.push(`images/${file}`)
      imageList.push(`${file} ${reference}`)
    }
    put('.env.runtime', readFileSync(join(directory, '.env.runtime'), 'utf8'))
    put('middleware.env', options.middlewareEnv)
    if (selected.includes('web'))
      put('web.conf', readFileSync(join(directory, 'web.conf'), 'utf8'))
    put('manifest.json', `${JSON.stringify({ ...artifact, images: artifact.images.filter(image => references.has(image.imageRef)), deploymentId: options.deploymentId, selectedServices: selected, partial: options.partial }, null, 2)}\n`)
    put('layout', `${config.expose.hostPort}:${options.containerPort}:${options.hasWeb}:${options.hasWeb ? await artifactChecksum(join(directory, 'web.conf')) : ''}\n`)
    put('image-list', `${imageList.join('\n')}\n`)
    put('dependencies', `${[...dependencies].join('\n')}\n`)
    if (selected.includes('storage-init'))
      put('initialize-storage', '')
    put('apply.sh', createApplyScript({ deploymentId: options.deploymentId, projectName, environment, directory: `${config.remote.baseDir}/${projectName}`, runtime: config.remote.runtime, partial: options.partial, selected: selected.filter(name => name !== 'storage-init'), hostPort: config.expose.hostPort, healthPaths: options.healthPaths }))
    const instructionParams = { file: basename(output), start: 'apply.sh', images: [...references].join('\n'), compose: 'compose.json' }
    const instructions = deployM('deploy_bundleInstructions', { params: instructionParams })
    put('README.txt', `${deployM('deploy_bundleMetadata', { params: { version: artifact.appVersion, buildId: artifact.buildId, compose: 'compose.json' } })}\n${instructions}\n`)
    const checksums = []
    for (const file of files)
      checksums.push(`${await artifactChecksum(join(staging, file))}  ${file}`)
    writeFileSync(join(staging, 'SHA256SUMS'), `${checksums.join('\n')}\n`)
    const tar = await runCommand('tar', ['-cf', temporaryTar, '-C', staging, '.'])
    if (!tar.success)
      throw new Error(tar.error.message)
    chmodSync(temporaryTar, 0o600)
    renameSync(temporaryTar, output)
    const upload = createUploadScripts()
    const scripts = `${output.slice(0, -4)}-deploy`
    mkdirSync(scripts, { recursive: true, mode: 0o700 })
    writeFileSync(join(scripts, 'deploy.sh'), upload.sh, { mode: 0o700 })
    writeFileSync(join(scripts, 'deploy.ps1'), upload.ps1)
    writeFileSync(join(scripts, 'read-target.awk'), upload.reader)
    const target = {
      host: config.ssh?.host ?? 'SERVER_HOST',
      port: config.ssh?.port ?? 22,
      username: config.ssh?.username ?? 'deploy',
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
      identityFile: deployM('deploy_targetIdentityFile'),
      knownHostsFile: deployM('deploy_targetKnownHostsFile'),
      strictHostKeyChecking: deployM('deploy_targetStrictHostKeyChecking'),
      connectTimeoutSeconds: deployM('deploy_targetConnectTimeoutSeconds'),
      directory: deployM('deploy_targetDirectory'),
      bundle: deployM('deploy_targetBundle'),
    }
    writeFileSync(join(scripts, 'deploy-target.json'), `${JSON.stringify({ ...target, _comments: comments }, null, 2)}\n`)
    writeFileSync(join(scripts, 'README.txt'), instructions)
    return { bundlePath: output, instructions: `${deployM('deploy_bundleInstructions', { params: { ...instructionParams, file: output } })}\n${scripts}`, startName: 'apply.sh' }
  }
  finally {
    rmSync(staging, { recursive: true, force: true })
    rmSync(temporaryTar, { force: true })
  }
}
