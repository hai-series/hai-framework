import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { parseEnv } from 'node:util'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { deploy, DeploymentArtifactSchema, getDeployCommandState, HaiDeployError } from '../src/index.js'

const ssh = vi.hoisted(() => ({ ping: vi.fn(), exec: vi.fn(), upload: vi.fn() }))
vi.mock('../src/container/deploy-ssh.js', () => ({ createSshExecutor: () => ssh }))
vi.mock('../src/container/deploy-command.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/container/deploy-command.js')>()
  return { ...original, runCommand: async (command: string, args: string[]) => {
    if (command === 'tar')
      return original.runCommand(command, args)
    if (args[0] === 'save')
      writeFileSync(args[args.indexOf('-o') + 1]!, 'middleware archive')
    return { success: true, data: { code: 0, stdout: '', stderr: '', stdoutTruncated: false, stderrTruncated: false } }
  } }
})
let root: string
let artifacts: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'hai-fullstack-deploy-'))
  artifacts = join(root, '.hai/build/docker/release-1')
  mkdirSync(artifacts, { recursive: true })
  mkdirSync(join(root, 'config'))
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: \'9.0\'\nimporters:\n  .: {}\n')
  writeFileSync(join(root, '.env.test'), 'HAI_ADMIN_DEFAULT_PASSWORD=test-private-password\n')
  writeFileSync(join(root, 'config/_serv.yml'), 'http:\n  apiPrefix: /custom-api/v2\ncors:\n  origin: "*"\n')
  writeFileSync(join(root, '.hai/build/docker/latest'), 'release-1\n')
  writeArtifact()
  ssh.ping.mockResolvedValue({ success: true, data: undefined })
  ssh.upload.mockResolvedValue({ success: true, data: undefined })
  ssh.exec.mockResolvedValue({ success: true, data: { code: 0, stdout: '', stderr: '', stdoutTruncated: false, stderrTruncated: false } })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('ok')))
})
afterEach(async () => {
  await deploy.close()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  rmSync(root, { recursive: true, force: true })
})

/** 模拟已经完成的构建产物，不提供任何源码或构建工具。 */
function writeArtifact(web = true, appVersion = '1.2.3'): void {
  const images = (web ? ['app', 'web'] : ['app']).map((name) => {
    const file = `${name}-${appVersion}.tar`
    writeFileSync(join(artifacts, file), `prebuilt-${name}`)
    return { name, file, imageRef: `localhost/example-${name}:release-1`, sha256: createHash('sha256').update(`prebuilt-${name}`).digest('hex'), containerPort: name === 'web' ? 8080 : 3000 }
  })
  writeFileSync(join(artifacts, 'manifest.json'), JSON.stringify({ version: 3, appVersion, buildId: 'release-1', images }))
}
async function initialize(online = true, containerPort = 3000): Promise<void> {
  expect(await deploy.init({ provider: { type: 'docker-ssh', ...(online ? { ssh: { host: '127.0.0.1', username: 'deploy' } } : {}), remote: { runtime: 'docker' }, expose: { hostPort: 18080, containerPort } } })).toMatchObject({ success: true })
}

it('存储初始化是内部任务，不能作为独立部署服务', async () => {
  writeFileSync(join(root, 'pnpm-lock.yaml'), JSON.stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies: { '@h-ai/storage': { version: '1' } } } }, packages: { '@h-ai/storage@1': {} }, snapshots: { '@h-ai/storage@1': {} } }))
  writeFileSync(join(root, 'config/_storage.yml'), 'type: s3\nbucket: test-bucket\n')
  await initialize(false)
  expect(await deploy.deployApp(root, { environment: 'test', bundleOnly: true, selectedServices: ['storage-init'] })).toMatchObject({ success: false, error: { code: HaiDeployError.CONFIG_ERROR.code, message: expect.stringContaining('storage-init') } })
  expect(ssh.ping).not.toHaveBeenCalled()
})

it('部署只上传一个完整 tar，API/Web 使用已有构建且私有配置仅进入 API', async () => {
  await initialize()
  mkdirSync(join(root, '.hai/deploy/test'), { recursive: true })
  writeFileSync(join(root, '.hai/deploy/test/.env.runtime'), 'REMOVED_SETTING=stale\n')
  const result = await deploy.deployApp(root, { environment: 'test', skipMiddleware: true })
  expect(result).toMatchObject({ success: true, data: { url: 'http://127.0.0.1:18080', healthCheck: 'passed' } })
  expect(ssh.upload).toHaveBeenCalledTimes(1)
  const directory = join(root, '.hai/deploy/test')
  const compose = parse(readFileSync(join(directory, 'docker-compose-1.2.3.yml'), 'utf8'))
  expect(compose['x-hai-version']).toBe('1.2.3')
  expect(compose.services.app.labels['org.opencontainers.image.version']).toBe('1.2.3')
  expect(result.success && result.data.bundlePath).toMatch(/-1\.2\.3\.tar$/)
  expect(compose.services.app.ports).toBeUndefined()
  expect(compose.services.app.env_file).toEqual(['.env.runtime'])
  expect(compose.services.app.image).toBe('localhost/example-app:release-1')
  expect(compose.services.web).toMatchObject({ image: 'localhost/example-web:release-1', ports: ['18080:8080'], depends_on: ['app'], pull_policy: 'never' })
  expect(compose.services.web.env_file).toBeUndefined()
  expect(readFileSync(join(directory, 'web.conf'), 'utf8')).toContain('location /custom-api/v2/')
  expect(readFileSync(join(directory, '.env.runtime'), 'utf8')).toContain('test-private-password')
  expect(readFileSync(join(directory, '.env.runtime'), 'utf8')).not.toContain('REMOVED_SETTING')
  expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(['http://127.0.0.1:18080/health', 'http://127.0.0.1:18080/_hai/web-health', 'http://127.0.0.1:18080/'])
  expect(ssh.exec.mock.calls.some(([command]) => /build|pnpm/.test(String(command)))).toBe(false)
  writeFileSync(join(root, 'config/_serv.yml'), 'http:\n  apiPrefix: /custom-api/v2\ncors:\n  origin: https://app.example.test\n')
  expect(await deploy.deployApp(root, { environment: 'test', skipMiddleware: true })).toMatchObject({ success: true })
  expect(JSON.parse(parseEnv(readFileSync(join(directory, '.env.runtime'), 'utf8')).HAI_SERV!)).toMatchObject({ cors: { origin: 'https://app.example.test' } })
})

it('仅打包不需要 SSH 或本地容器引擎，tar 可搬运且暂存目录自动清理', async () => {
  await initialize(false)
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true, output: join(root, 'release-test.tar') })
  expect(result).toMatchObject({ success: true, data: { status: 'packaged', url: '', healthCheck: 'skipped' } })
  if (!result.success)
    return
  expect(ssh.ping).not.toHaveBeenCalled()
  expect(ssh.exec).not.toHaveBeenCalled()
  expect(ssh.upload).not.toHaveBeenCalled()
  expect(result.data.bundlePath).toBe(join(root, 'release-test-1.2.3.tar'))
  const files = execFileSync('tar', ['-tf', result.data.bundlePath!], { encoding: 'utf8' })
  for (const file of ['compose.json', 'manifest.json', '.env.runtime', 'images/app-1.2.3.tar', 'images/web-1.2.3.tar', 'web.conf', 'SHA256SUMS', 'README.txt', 'apply.sh'])
    expect(files).toContain(file)
  expect(result.data.instructions).toContain('apply.sh')
  const extracted = join(root, 'extracted')
  mkdirSync(extracted)
  execFileSync('tar', ['-xf', result.data.bundlePath!, '-C', extracted])
  const script = readFileSync(join(extracted, 'apply.sh'), 'utf8')
  expect(script).toContain('HAI_DEPLOY_ENVIRONMENT=\'test\'')
  expect(script).toContain('sha256sum -c SHA256SUMS')
  expect(script).toContain('image inspect')
  expect(script).toContain('compose-files')
  expect(readFileSync(join(extracted, 'README.txt'), 'utf8')).toContain('1.2.3')
  expect(JSON.parse(readFileSync(join(extracted, 'manifest.json'), 'utf8')).appVersion).toBe('1.2.3')
  expect(script).not.toContain(' build ')
  expect(existsSync(`${result.data.bundlePath}.partial`)).toBe(false)
  expect(readdirSync(join(root, '.hai/deploy/test')).some(file => file.startsWith('.bundle-'))).toBe(false)
})

it('制品缺失或校验失败不连接服务器，不尝试重新构建', async () => {
  await initialize()
  writeFileSync(join(artifacts, 'web-1.2.3.tar'), 'corrupt')
  expect(await deploy.deployApp(root, { environment: 'test' })).toMatchObject({ success: false, error: { code: HaiDeployError.CONFIG_ERROR.code } })
  expect(ssh.ping).not.toHaveBeenCalled()
  expect(ssh.upload).not.toHaveBeenCalled()
})

it('前端增量包只携带 Web，生成可执行脚本且不改写服务器成功状态', async () => {
  await initialize(false)
  writeFileSync(join(root, 'pnpm-lock.yaml'), JSON.stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies: { '@h-ai/cache': { version: '1' } } } }, packages: { '@h-ai/cache@1': {} }, snapshots: { '@h-ai/cache@1': {} } }))
  writeFileSync(join(root, 'config/_cache.yml'), 'type: redis\n')
  const manifestPath = join(artifacts, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.images = manifest.images.filter((image: { name: string }) => image.name === 'web')
  writeFileSync(manifestPath, JSON.stringify({ ...manifest, partial: true, hasWeb: true }))
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true })
  expect(result.success).toBe(true)
  if (!result.success)
    return
  const files = execFileSync('tar', ['-tf', result.data.bundlePath!], { encoding: 'utf8' })
  expect(files).toContain('images/web-1.2.3.tar')
  expect(files).not.toContain('images/app-1.2.3.tar')
  expect(files).not.toContain('middleware-')
  expect(existsSync(join(root, '.hai/deploy/runtime'))).toBe(false)
  expect(files).toContain('compose.json')
  const scripts = `${result.data.bundlePath!.slice(0, -4)}-deploy`
  expect(existsSync(join(scripts, 'deploy.ps1'))).toBe(true)
  expect(existsSync(join(scripts, 'deploy.sh'))).toBe(true)
  expect(ssh.ping).not.toHaveBeenCalled()
})

it.each([
  { selected: 'web', appContainerPort: 4100, webContainerPort: 8181 },
  { selected: 'app', appContainerPort: 4100, webContainerPort: 8181 },
  { selected: 'web', appContainerPort: undefined, webContainerPort: undefined },
])('部分交付保持完整布局端口；未显式指定时使用部署默认值（$selected/$appContainerPort/$webContainerPort）', async ({ selected, appContainerPort, webContainerPort }) => {
  await initialize(false, 4300)
  const manifestPath = join(artifacts, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.hasWeb = true
  manifest.appContainerPort = appContainerPort
  manifest.webContainerPort = webContainerPort
  manifest.images = manifest.images.map((image: { name: string }) => ({ ...image, containerPort: image.name === 'app' ? appContainerPort : webContainerPort }))
  writeFileSync(manifestPath, JSON.stringify(manifest))
  const full = await deploy.deployApp(root, { environment: 'test', bundleOnly: true })
  expect(full.success).toBe(true)
  if (!full.success)
    return
  const layout = execFileSync('tar', ['-xOf', full.data.bundlePath!, './layout'], { encoding: 'utf8' })
  manifest.images = manifest.images.filter((image: { name: string }) => image.name === selected)
  writeFileSync(manifestPath, JSON.stringify({ ...manifest, partial: true }))
  const partial = await deploy.deployApp(root, { environment: 'test', bundleOnly: true })
  expect(partial.success).toBe(true)
  if (!partial.success)
    return
  expect(execFileSync('tar', ['-xOf', partial.data.bundlePath!, './layout'], { encoding: 'utf8' })).toBe(layout)
  const directory = join(root, '.hai/deploy/test')
  const proxy = readFileSync(join(directory, 'web.conf'), 'utf8')
  expect(proxy).toContain(`proxy_pass http://app:${appContainerPort ?? 4300};`)
  expect(proxy).toContain(`listen ${webContainerPort ?? 8080};`)
  const compose = parse(readFileSync(join(directory, 'docker-compose-1.2.3.yml'), 'utf8'))
  expect(compose.services.web.ports).toEqual([`18080:${webContainerPort ?? 8080}`])
  expect(parseEnv(readFileSync(join(directory, '.env.runtime'), 'utf8')).PORT).toBe(String(appContainerPort ?? 4300))
})

it('完整离线包自动携带自建数据库镜像，不依赖目标服务器拉取', async () => {
  writeArtifact(false)
  writeFileSync(join(root, 'pnpm-lock.yaml'), JSON.stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies: { '@h-ai/reldb': { version: '1' } } } }, packages: { '@h-ai/reldb@1': {} }, snapshots: { '@h-ai/reldb@1': {} } }))
  writeFileSync(join(root, 'config/_db.yml'), 'type: postgresql\n')
  await initialize(false)
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true })
  expect(result.success).toBe(true)
  if (!result.success)
    return
  const files = execFileSync('tar', ['-tf', result.data.bundlePath!], { encoding: 'utf8' })
  expect(files).toContain('images/middleware-2.tar')
  expect(files).toContain('compose.json')
})

it('跳过中间件配置时，完整包仍携带已保存的自建 Redis', async () => {
  writeArtifact(false)
  writeFileSync(join(root, 'pnpm-lock.yaml'), JSON.stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies: { '@h-ai/cache': { version: '1' } } } }, packages: { '@h-ai/cache@1': {} }, snapshots: { '@h-ai/cache@1': {} } }))
  writeFileSync(join(root, 'config/_cache.yml'), 'type: redis\nurl: redis://cache:6379\n')
  await initialize(false)
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true, skipMiddleware: true })
  expect(result.success).toBe(true)
  if (!result.success)
    return
  const extracted = join(root, 'offline-cache')
  mkdirSync(extracted)
  execFileSync('tar', ['-xf', result.data.bundlePath!, '-C', extracted])
  const compose = JSON.parse(readFileSync(join(extracted, 'compose.json'), 'utf8'))
  expect(compose.services.cache.image).toMatch(/^docker.io\/library\/redis:/)
  expect(readFileSync(join(extracted, 'image-list'), 'utf8')).toContain('redis:')
  expect(existsSync(join(extracted, 'images/middleware-2.tar'))).toBe(true)
})

// Git Bash 不提供 Linux flock；Windows 在 deploy-lock.e2e.test.ts 的真实 Linux 容器门禁执行此流程。
it.skipIf(process.platform === 'win32')('实际执行交付脚本：拒绝首次增量，支持同版本更新，健康失败不推进成功状态', async () => {
  writeArtifact(false)
  await initialize(false)
  const destination = join(root, 'server').replaceAll('\\', '/')
  const bin = join(root, 'bin')
  mkdirSync(bin)
  const engine = `#!/bin/sh
printf '%s\\n' "$*" >> "$HAI_TEST_COMMANDS"
case "$*" in
  *'up --help'*) printf 'never\\n';;
  *'config --services'*) printf 'app\\n';;
  *'image inspect --format'*) printf 'amd64\\n';;
  *'{{.Image}} {{.Config.Image}}'*) printf 'previous-image localhost/example-app:release-1\\n';;
  *'inspect --format'*) printf 'true\\n';;
  *'ps -aq'*) printf 'previous-container\\n';;
  *'ps -q'*) printf 'running-container\\n';;
esac
`
  writeFileSync(join(bin, 'docker'), engine, { mode: 0o700 })
  writeFileSync(join(bin, 'curl'), '#!/bin/sh\nif [ "$HAI_TEST_HTTP_FAIL" = 1 ]; then exit 22; fi\n', { mode: 0o700 })
  writeFileSync(join(bin, 'sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o700 })
  const commands = join(root, 'commands.txt')
  const env = { ...process.env, PATH: `${bin}${process.platform === 'win32' ? ';C:/Program Files/Git/usr/bin;' : ':'}${process.env.PATH}`, HAI_TEST_COMMANDS: commands.replaceAll('\\', '/'), HAI_TEST_HTTP_FAIL: '0' }
  const shell = process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/bash.exe' : '/bin/sh'
  const pack = async (selectedServices?: string[]) => {
    const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true, selectedServices })
    expect(result.success).toBe(true)
    if (!result.success)
      throw new Error(result.error.message)
    const extracted = join(root, result.data.deploymentId)
    mkdirSync(extracted)
    execFileSync('tar', ['-xf', result.data.bundlePath!, '-C', extracted])
    return { id: result.data.deploymentId, script: join(extracted, 'apply.sh').replaceAll('\\', '/') }
  }
  const firstPartial = await pack(['app'])
  expect(() => execFileSync(shell, [firstPartial.script, destination], { env, stdio: 'pipe' })).toThrow()
  expect(existsSync(join(destination, 'current'))).toBe(false)
  const full = await pack()
  execFileSync(shell, [full.script, destination], { env, stdio: 'pipe' })
  expect(readFileSync(join(destination, 'current'), 'utf8').trim()).toBe(full.id)
  const partial = await pack(['app'])
  execFileSync(shell, [partial.script, destination], { env, stdio: 'pipe' })
  expect(readFileSync(join(destination, 'current'), 'utf8').trim()).toBe(partial.id)
  const failed = await pack(['app'])
  expect(() => execFileSync(shell, [failed.script, destination], { env: { ...env, HAI_TEST_HTTP_FAIL: '1' }, stdio: 'pipe' })).toThrow()
  expect(readFileSync(join(destination, 'current'), 'utf8').trim()).toBe(partial.id)
  expect(JSON.parse(readFileSync(join(destination, `result-${failed.id}.json`), 'utf8'))).toMatchObject({ stage: 'health', exitCode: 1 })
  expect(existsSync(join(destination, `diagnostics-${failed.id}.log`))).toBe(true)
  const calls = readFileSync(commands, 'utf8')
  expect(calls).not.toMatch(/\bdown\b|\bpull\s+(?!never)/)
  expect(calls).toContain('--no-deps --no-build --pull never --force-recreate --remove-orphans app')
  expect(calls).toContain('rm -f previous-container')
  expect(calls).toContain('--no-deps --no-build --pull never --no-recreate app')
  expect(calls).toContain('tag previous-image localhost/example-app:release-1')
  expect(calls).toContain('logs --tail 80 previous-container')
}, 30_000)

it('aPI workspace 服务包的环境目录独立时，默认消费工程根的构建产物', async () => {
  writeArtifact(false)
  const service = join(root, 'apps/service')
  mkdirSync(service, { recursive: true })
  writeFileSync(join(service, '.env.test'), 'HAI_CORE_ENV=test\n')
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: \'9.0\'\nimporters:\n  .: {}\n  apps/service: {}\n')
  await initialize(false)
  expect(await deploy.deployApp(service, { environment: 'test', bundleOnly: true })).toMatchObject({ success: true, data: { status: 'packaged' } })
  expect(readFileSync(join(service, '.hai/deploy/test/docker-compose-1.2.3.yml'), 'utf8')).toContain('localhost/example-app:release-1')
})
it('完整 tar 上传失败不启动半份部署', async () => {
  await initialize()
  ssh.upload.mockResolvedValue({ success: false, error: { ...HaiDeployError.IMAGE_TRANSFER_FAILED, message: 'transfer failed' } })
  expect(await deploy.deployApp(root, { environment: 'test' })).toMatchObject({ success: false, error: { code: HaiDeployError.IMAGE_TRANSFER_FAILED.code } })
  expect(ssh.exec.mock.calls.some(([command]) => String(command).includes('start-test.sh'))).toBe(false)
})

it.each(['missing', 'mismatch', 'truncated', 'finished-failure', 'finished-success'])('ssh 失败只读核对匹配终态结果，保留准确执行状态且不重跑 (%s)', async (mode) => {
  await initialize()
  let applyCalls = 0
  ssh.exec.mockImplementation(async (command: string) => {
    const data = { code: 0, stdout: '', stderr: '', stdoutTruncated: false, stderrTruncated: false }
    if (command.includes('apply.sh')) {
      applyCalls++
      return { success: false, error: { ...HaiDeployError.REMOTE_COMMAND_FAILED, message: 'SSH disconnected', ext: { commandExecution: { reason: 'timeout', localTermination: 'confirmed', remoteExecution: 'unknown' } } } }
    }
    if (command.includes('result-')) {
      const id = /result-([a-z0-9-]+)\.json/.exec(command)?.[1]
      data.stdout = mode === 'missing' ? '' : JSON.stringify({ deploymentId: mode === 'mismatch' ? 'older-deployment' : id, stage: 'health', exitCode: mode === 'finished-success' ? 0 : 1, durationSeconds: 1 })
      data.stdoutTruncated = mode === 'truncated'
    }
    return { success: true, data }
  })
  const result = await deploy.deployApp(root, { environment: 'test', skipMiddleware: true })
  expect(result.success).toBe(false)
  if (result.success)
    throw new Error('Connection failure must remain visible')
  const state = getDeployCommandState(result.error)
  expect(state).toMatchObject({ reason: 'timeout', localTermination: 'confirmed', remoteExecution: mode.startsWith('finished') ? 'finished' : 'unknown' })
  expect(state?.resultFile).toContain(`result-${state?.deploymentId}.json`)
  if (mode.startsWith('finished'))
    expect(state?.remoteExitCode).toBe(mode === 'finished-success' ? 0 : 1)
  expect(applyCalls).toBe(1)
})
it('aPI 正常但 Web 不健康时不会报告部署成功', async () => {
  await initialize()
  vi.useFakeTimers()
  vi.mocked(fetch).mockImplementation(async input => new Response('health', { status: String(input).endsWith('/_hai/web-health') ? 503 : 200 }))
  const pending = deploy.deployApp(root, { environment: 'test' })
  await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled(), { timeout: 5000 })
  await vi.runAllTimersAsync()
  expect(await pending).toMatchObject({ success: false, error: { code: HaiDeployError.HEALTH_CHECK_FAILED.code } })
})
it('单服务制品仅部署 API；未提供 SSH 时提示仅打包选项', async () => {
  writeArtifact(false)
  await initialize()
  expect(await deploy.deployApp(root, { environment: 'test' })).toMatchObject({ success: true })
  const compose = parse(readFileSync(join(root, '.hai/deploy/test/docker-compose-1.2.3.yml'), 'utf8'))
  expect(compose.services.app.ports).toEqual(['18080:3000'])
  expect(compose.services.web).toBeUndefined()
  await initialize(false)
  expect(await deploy.deployApp(root, { environment: 'test' })).toMatchObject({ success: false, error: { code: HaiDeployError.CONFIG_ERROR.code } })
})
it('非法 API 前缀不会写入代理配置或上传', async () => {
  await initialize()
  writeFileSync(join(root, 'config/_serv.yml'), 'http:\n  apiPrefix: "/api; injection"\n')
  expect(await deploy.deployApp(root, { environment: 'test' })).toMatchObject({ success: false, error: { code: HaiDeployError.CONFIG_ERROR.code } })
  expect(ssh.upload).not.toHaveBeenCalled()
})

it('完整离线包包含中间件归档，打包不会创建服务器成功状态', async () => {
  writeArtifact(false)
  writeFileSync(join(root, 'pnpm-lock.yaml'), JSON.stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies: { '@h-ai/reldb': { version: '1' } } } }, packages: { '@h-ai/reldb@1': {} }, snapshots: { '@h-ai/reldb@1': {} } }))
  writeFileSync(join(root, 'config/_db.yml'), 'type: mysql\n')
  await initialize(false)
  expect(await deploy.deployApp(root, { environment: 'test', bundleOnly: true })).toMatchObject({ success: true })
  const directory = join(root, '.hai/deploy/test')
  const previous = parse(readFileSync(join(directory, 'docker-compose-1.2.3.yml'), 'utf8'))
  expect(previous.services.db.image).toContain('mysql:8.4')
  writeArtifact(false, '1.2.4')
  const output = join(root, 'release-1.2.4.tar')
  expect(await deploy.deployApp(root, { environment: 'test', bundleOnly: true, skipMiddleware: true, output })).toMatchObject({ success: true, data: { bundlePath: output } })
  const next = parse(readFileSync(join(directory, 'docker-compose-1.2.4.yml'), 'utf8'))
  expect(next['x-hai-version']).toBe('1.2.4')
  expect(existsSync(join(directory, 'latest'))).toBe(false)
  const packed = execFileSync('tar', ['-tf', output], { encoding: 'utf8' })
  expect(packed).toContain('apply.sh')
  expect(previous.volumes).toBeDefined()
})

it('缺少应用版本、路径伪装或镜像 tar 版本不一致的清单被拒绝', () => {
  const artifact = JSON.parse(readFileSync(join(artifacts, 'manifest.json'), 'utf8'))
  expect(DeploymentArtifactSchema.safeParse(artifact).success).toBe(true)
  for (const appVersion of [undefined, '../outside', '1.2.4'])
    expect(DeploymentArtifactSchema.safeParse({ ...artifact, appVersion }).success).toBe(false)
  expect(DeploymentArtifactSchema.safeParse({ ...artifact, version: 1 }).success).toBe(false)
  for (const name of ['appContainerPort', 'webContainerPort']) {
    for (const port of [0, 65536, 1.5, '3000'])
      expect(DeploymentArtifactSchema.safeParse({ ...artifact, [name]: port }).success).toBe(false)
  }
})
