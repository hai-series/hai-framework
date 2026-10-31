/** 显式选择本门禁；使用真实引擎和下载网络，夹具只安装一个小型 npm 包。 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { runDeployTestCommand } from './helpers/deploy-test-command.js'

const enabled = process.env.HAI_CLI_RUN_GENERATE_GATES === '1'
const root = fileURLToPath(new URL('../../..', import.meta.url))

it.skipIf(!enabled)('download source gates use the generated Dockerfile, Corepack, pnpm and a container-reachable proxy', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'hai-download-gate-'))
  const project = `download-gate-${randomUUID().slice(0, 8)}`
  const logDirectory = join(root, 'tmp', 'validation', 'download-container-gate', project)
  mkdirSync(logDirectory, { recursive: true })
  let runtime: string | undefined
  let imageRef: string | undefined
  let container: string | undefined
  const failures: unknown[] = []
  const run = async (command: string, args: string[], cwd = directory): Promise<string> => {
    try {
      const result = await runDeployTestCommand(command, args, { cwd, timeoutMs: 240_000, maxOutputBytes: 4 * 1024 * 1024 })
      writeFileSync(join(logDirectory, `${randomUUID()}.log`), result)
      return result.trim()
    }
    catch (error) {
      writeFileSync(join(logDirectory, 'failure.log'), error instanceof Error ? error.message : String(error))
      throw error
    }
  }
  try {
    for (const candidate of ['podman', 'docker']) {
      try {
        await runDeployTestCommand(candidate, ['version'], { timeoutMs: 8000 })
        runtime = candidate
        break
      }
      catch { /* 仅检查已有可用引擎，不启动或修改引擎。 */ }
    }
    if (!runtime)
      throw new Error('Download gate requires a running Podman or Docker engine')
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: project, version: '1.0.0', packageManager: 'pnpm@12.11.2', dependencies: { 'is-number': '7.0.0' } }))
    writeFileSync(join(directory, 'pnpm-workspace.yaml'), 'packages: []\n')
    writeFileSync(join(directory, 'hai.json'), JSON.stringify({ build: { images: [{ name: 'serv', dockerfile: 'images/serv.Dockerfile' }] } }))
    mkdirSync(join(directory, 'images'))
    const template = readFileSync(join(root, 'packages/cli/templates/apps/api/images/serv.Dockerfile.hbs'), 'utf8')
    const header = template.slice(0, template.indexOf('COPY pnpm-lock.yaml')).replace('RUN node', `RUN node -e "process.stdout.write('${randomUUID()}')" > /tmp/download-gate\nRUN node`)
    // 直接使用生成模板的下载阶段；业务编译改为小包验证，隔离框架应用安装开销。
    const proof = 'process.stdout.write(JSON.stringify({registry:process.env.pnpm_config_registry,corepackRegistry:process.env.COREPACK_NPM_REGISTRY,proxyHost:process.env.HTTPS_PROXY?new URL(process.env.HTTPS_PROXY).hostname:null,packageWorks:require(\'is-number\')(42)}))'
    writeFileSync(join(directory, 'images/serv.Dockerfile'), `${header}COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./\nRUN pnpm fetch --ignore-scripts && pnpm install --offline --frozen-lockfile --ignore-scripts\nRUN node -e "${proof}" > /download-proof.json\nCMD ["node", "-e", "process.stdout.write(require('node:fs').readFileSync('/download-proof.json','utf8'))"]\n`)
    const pnpmArguments = ['install', '--lockfile-only', '--ignore-scripts', '--registry=https://registry.npmmirror.com']
    if (process.platform === 'win32')
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '& pnpm.cmd install --lockfile-only --ignore-scripts --registry=https://registry.npmmirror.com; exit $LASTEXITCODE'])
    else await run('pnpm', pnpmArguments)
    const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy ?? process.env.HTTP_PROXY ?? process.env.http_proxy
    const proxyOptions = proxy ? ['--proxy-mode', 'custom', '--proxy-url', proxy] : ['--proxy-mode', 'none']
    await run(process.execPath, [join(root, 'packages/cli/dist/index.js'), 'build', '--target', 'image', '--runtime', runtime, '--image-source', 'cn', '--npm-source', 'cn', '--yes', ...proxyOptions])
    const builds = join(directory, '.hai/build/docker')
    const buildId = readFileSync(join(builds, 'latest'), 'utf8').trim()
    const manifest: { images: Array<{ imageRef: string }> } = JSON.parse(readFileSync(join(builds, buildId, 'manifest.json'), 'utf8'))
    imageRef = manifest.images[0]?.imageRef
    if (!imageRef?.startsWith(`localhost/hai-${project}-serv:`))
      throw new Error('Download gate did not return its owned image reference')
    const created = await run(runtime, ['create', '--pull=never', imageRef])
    if (!/^[a-f\d]{64}$/.test(created))
      throw new Error('Download gate did not return a trusted container ID')
    container = created
    const proofResult = JSON.parse(await run(runtime, ['start', '--attach', container]))
    expect(proofResult).toMatchObject({ registry: 'https://registry.npmmirror.com', corepackRegistry: 'https://registry.npmmirror.com', packageWorks: true })
    if (proxy && ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(proxy).hostname))
      expect(proofResult.proxyHost).toBe(runtime === 'podman' ? new URL(proxy).hostname : 'host.docker.internal')
    const environment: string[] = JSON.parse(await run(runtime, ['image', 'inspect', '--format', '{{json .Config.Env}}', imageRef]))
    expect(environment.some(value => /^(?:https?_proxy|all_proxy|pnpm_config_registry|COREPACK_NPM_REGISTRY)=/i.test(value))).toBe(false)
    writeFileSync(join(logDirectory, 'result.json'), JSON.stringify({ runtime, ...proofResult, proxyNotInImageEnvironment: true }, null, 2))
  }
  catch (error) { failures.push(error) }
  finally {
    for (const args of [...container ? [['rm', '--force', container]] : [], ...imageRef ? [['image', 'rm', imageRef]] : []]) {
      try {
        if (runtime)
          await runDeployTestCommand(runtime, args, { timeoutMs: 15000 })
      }
      catch (error) { failures.push(error) }
    }
    try {
      if (dirname(directory) !== tmpdir() || !directory.includes('hai-download-gate-'))
        failures.push(new Error('Unexpected download gate cleanup path'))
      else rmSync(directory, { recursive: true, force: true })
    }
    catch (error) { failures.push(error) }
  }
  if (failures.length)
    throw new AggregateError(failures, 'Download gate or cleanup failed')
}, 360_000)
