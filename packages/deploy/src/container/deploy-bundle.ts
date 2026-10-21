/** Compose 交付包：部署器组合已有镜像和运行参数，不执行镜像构建。 */
import type { DeploymentArtifact } from '../deploy-artifact.js'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { parse } from 'yaml'
import { artifactChecksum } from '../deploy-artifact.js'
import { deployM } from '../deploy-i18n.js'
import { runCommand } from './deploy-command.js'

/** shell 字面参数，路径和配置不能被解释为指令。 */
export function shellArgument(value: string): string {
  return `'${value.replaceAll('\'', '\'"\'"\'')}'`
}

/**
 * 生成 tar 和服务器启动说明；暂存目录无论成功失败都清理。
 * @example `await createDeploymentBundle({ directory, artifactDir, artifact, projectName, environment: 'prod', runtime: 'auto', coreEnv: 'production', output })`
 */
export async function createDeploymentBundle(options: {
  directory: string
  artifactDir: string
  artifact: DeploymentArtifact
  projectName: string
  environment: string
  runtime: 'auto' | 'podman' | 'docker'
  coreEnv: string
  output: string
}): Promise<{ bundlePath: string, instructions: string, startName: string }> {
  const { directory, artifactDir, artifact, projectName, environment, runtime, coreEnv } = options
  const stem = basename(options.output).replace(/\.tar$/i, '')
  const versionSuffix = `-${artifact.appVersion}`
  const output = resolve(dirname(options.output), `${stem.endsWith(versionSuffix) ? stem : `${stem}${versionSuffix}`}.tar`)
  const composeName = `docker-compose-${artifact.appVersion}.yml`
  mkdirSync(dirname(output), { recursive: true, mode: 0o700 })
  const staging = mkdtempSync(join(directory, '.bundle-'))
  chmodSync(staging, 0o700)
  const temporaryTar = `${output}.partial`
  const startName = `start-${environment}.sh`
  try {
    mkdirSync(join(staging, 'images'))
    for (const image of artifact.images)
      copyFileSync(join(artifactDir, image.file), join(staging, 'images', image.file))
    for (const file of [composeName, '.env.runtime', ...(artifact.images.some(image => image.name === 'web') ? ['web.conf'] : [])])
      copyFileSync(join(directory, file), join(staging, file))
    const compose = parse(readFileSync(join(directory, composeName), 'utf8')) as { services: Record<string, { image?: string }> }
    const images = [...new Set(Object.values(compose.services).flatMap(service => service.image ? [service.image] : []))]
    const start = `#!/bin/sh
set -eu
cd "$(dirname "$0")"
umask 077
export HAI_DEPLOY_ENVIRONMENT=${shellArgument(environment)}
export HAI_CORE_ENV=${shellArgument(coreEnv)}
runtime=${shellArgument(runtime)}
if [ -n "\${HAI_DEPLOY_PROVIDER_REMOTE_RUNTIME:-}" ]; then runtime="$HAI_DEPLOY_PROVIDER_REMOTE_RUNTIME"; fi
if [ "$runtime" = auto ]; then
  if command -v podman >/dev/null 2>&1 && podman version >/dev/null 2>&1; then runtime=podman; else runtime=docker; fi
fi
case "$runtime" in docker|podman) ;; *) echo 'HAI_DEPLOY_PROVIDER_REMOTE_RUNTIME must be docker or podman' >&2; exit 1;; esac
"$runtime" version >/dev/null
"$runtime" compose version >/dev/null
sha256sum -c SHA256SUMS
chmod 600 .env.runtime
${artifact.images.map(image => `"$runtime" load -i ${shellArgument(`images/${image.file}`)}`).join('\n')}
# 离线服务器应先导入全部中间件镜像；禁止静默尝试联网。
for image in ${images.map(shellArgument).join(' ')}; do
  "$runtime" image inspect "$image" >/dev/null 2>&1 || { echo "Missing image: $image. Load the matching image archive before retrying." >&2; exit 1; }
done
exec "$runtime" compose -f ${shellArgument(composeName)} --env-file .env.runtime -p ${shellArgument(`hai-${projectName}`)} up -d
`
    writeFileSync(join(directory, startName), start, { mode: 0o700 })
    writeFileSync(join(staging, startName), start, { mode: 0o700 })
    const instructions = deployM('deploy_bundleInstructions', { params: { file: basename(output), start: startName, images: images.join('\n'), compose: composeName } })
    const metadata = deployM('deploy_bundleMetadata', { params: { version: artifact.appVersion, buildId: artifact.buildId, compose: composeName } })
    writeFileSync(join(staging, 'README.txt'), `${metadata}\n${instructions}\n`)
    copyFileSync(join(artifactDir, 'manifest.json'), join(staging, 'manifest.json'))
    const checksums: string[] = []
    for (const file of [composeName, 'manifest.json', '.env.runtime', startName, ...(artifact.images.some(image => image.name === 'web') ? ['web.conf'] : []), ...artifact.images.map(image => `images/${image.file}`)])
      checksums.push(`${await artifactChecksum(join(staging, file))}  ${file}`)
    writeFileSync(join(staging, 'SHA256SUMS'), `${checksums.join('\n')}\n`)
    const tar = await runCommand('tar', ['-cf', temporaryTar, '-C', staging, '.'])
    if (!tar.success)
      throw new Error(tar.error.message)
    chmodSync(temporaryTar, 0o600)
    // tar 成功后再交付；失败不留下可被误用的半份包。
    const { renameSync } = await import('node:fs')
    renameSync(temporaryTar, output)
    return { bundlePath: output, instructions, startName }
  }
  finally {
    rmSync(staging, { recursive: true, force: true })
    rmSync(temporaryTar, { force: true })
  }
}
