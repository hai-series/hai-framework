import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { deploy, HaiDeployError } from '../src/index.js'

const ssh = vi.hoisted(() => ({ ping: vi.fn(), exec: vi.fn(), upload: vi.fn() }))
vi.mock('../src/container/deploy-ssh.js', () => ({ createSshExecutor: () => ssh }))
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
  ssh.exec.mockResolvedValue({ success: true, data: { code: 0, stdout: '', stderr: '' } })
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
function writeArtifact(web = true): void {
  const images = (web ? ['app', 'web'] : ['app']).map((name) => {
    const file = `${name}.tar`
    writeFileSync(join(artifacts, file), `prebuilt-${name}`)
    return { name, file, imageRef: `localhost/example-${name}:release-1`, sha256: createHash('sha256').update(`prebuilt-${name}`).digest('hex'), containerPort: name === 'web' ? 8080 : 3000 }
  })
  writeFileSync(join(artifacts, 'manifest.json'), JSON.stringify({ version: 1, buildId: 'release-1', images }))
}
async function initialize(online = true): Promise<void> {
  expect(await deploy.init({ provider: { type: 'docker-ssh', ...(online ? { ssh: { host: '127.0.0.1', username: 'deploy' } } : {}), remote: { runtime: 'docker' }, expose: { hostPort: 18080 } } })).toMatchObject({ success: true })
}

it('部署只上传一个完整 tar，API/Web 使用已有构建且私有配置仅进入 API', async () => {
  await initialize()
  const result = await deploy.deployApp(root, { environment: 'test', skipProvision: true })
  expect(result).toMatchObject({ success: true, data: { url: 'http://127.0.0.1:18080', healthCheck: 'passed' } })
  expect(ssh.upload).toHaveBeenCalledTimes(1)
  const directory = join(root, '.hai/deploy/test')
  const compose = parse(readFileSync(join(directory, 'compose.yml'), 'utf8'))
  expect(compose.services.app.ports).toBeUndefined()
  expect(compose.services.app.env_file).toEqual(['.env.runtime'])
  expect(compose.services.app.image).toBe('localhost/example-app:release-1')
  expect(compose.services.web).toMatchObject({ image: 'localhost/example-web:release-1', ports: ['18080:8080'], depends_on: ['app'], pull_policy: 'never' })
  expect(compose.services.web.env_file).toBeUndefined()
  expect(readFileSync(join(directory, 'web.conf'), 'utf8')).toContain('location /custom-api/v2/')
  expect(readFileSync(join(directory, '.env.runtime'), 'utf8')).toContain('test-private-password')
  expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(['http://127.0.0.1:18080/health', 'http://127.0.0.1:18080/_hai/web-health', 'http://127.0.0.1:18080/'])
  expect(ssh.exec.mock.calls.some(([command]) => /build|pnpm/.test(String(command)))).toBe(false)
  writeFileSync(join(root, 'config/_serv.yml'), 'http:\n  apiPrefix: /custom-api/v2\ncors:\n  origin: https://app.example.test\n')
  expect(await deploy.deployApp(root, { environment: 'test', skipProvision: true })).toMatchObject({ success: true })
  expect(JSON.parse(parseEnv(readFileSync(join(directory, '.env.runtime'), 'utf8')).HAI_SERV)).toMatchObject({ cors: { origin: 'https://app.example.test' } })
})

it('仅打包不需要 SSH 或本地容器引擎，tar 可搬运且暂存目录自动清理', async () => {
  await initialize(false)
  const result = await deploy.deployApp(root, { environment: 'test', bundleOnly: true })
  expect(result).toMatchObject({ success: true, data: { status: 'packaged', url: '', healthCheck: 'skipped' } })
  if (!result.success)
    return
  expect(ssh.ping).not.toHaveBeenCalled()
  expect(ssh.exec).not.toHaveBeenCalled()
  expect(ssh.upload).not.toHaveBeenCalled()
  const files = execFileSync('tar', ['-tf', result.data.bundlePath!], { encoding: 'utf8' })
  for (const file of ['compose.yml', '.env.runtime', 'images/app.tar', 'images/web.tar', 'web.conf', 'SHA256SUMS', 'README.txt', 'start-test.sh'])
    expect(files).toContain(file)
  expect(result.data.instructions).toContain('start-test.sh')
  const extracted = join(root, 'extracted')
  mkdirSync(extracted)
  execFileSync('tar', ['-xf', result.data.bundlePath!, '-C', extracted])
  const script = readFileSync(join(extracted, 'start-test.sh'), 'utf8')
  expect(script).toContain('HAI_DEPLOY_ENVIRONMENT=\'test\'')
  expect(script).toContain('sha256sum -c SHA256SUMS')
  expect(script).toContain('image inspect')
  expect(script).not.toContain(' build ')
  expect(existsSync(`${result.data.bundlePath}.partial`)).toBe(false)
  expect(readdirSync(join(root, '.hai/deploy/test')).some(file => file.startsWith('.bundle-'))).toBe(false)
})

it('制品缺失或校验失败不连接服务器，不尝试重新构建', async () => {
  await initialize()
  writeFileSync(join(artifacts, 'web.tar'), 'corrupt')
  expect(await deploy.deployApp(root, { environment: 'test' })).toMatchObject({ success: false, error: { code: HaiDeployError.CONFIG_ERROR.code } })
  expect(ssh.ping).not.toHaveBeenCalled()
  expect(ssh.upload).not.toHaveBeenCalled()
})

it('aPI workspace 服务包的环境目录独立时，默认消费工程根的构建产物', async () => {
  writeArtifact(false)
  const service = join(root, 'apps/service')
  mkdirSync(service, { recursive: true })
  writeFileSync(join(service, '.env.test'), 'HAI_CORE_ENV=test\n')
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: \'9.0\'\nimporters:\n  .: {}\n  apps/service: {}\n')
  await initialize(false)
  expect(await deploy.deployApp(service, { environment: 'test', bundleOnly: true })).toMatchObject({ success: true, data: { status: 'packaged' } })
  expect(readFileSync(join(service, '.hai/deploy/test/compose.yml'), 'utf8')).toContain('localhost/example-app:release-1')
})
it('完整 tar 上传失败不启动半份部署', async () => {
  await initialize()
  ssh.upload.mockResolvedValue({ success: false, error: { ...HaiDeployError.IMAGE_TRANSFER_FAILED, message: 'transfer failed' } })
  expect(await deploy.deployApp(root, { environment: 'test' })).toMatchObject({ success: false, error: { code: HaiDeployError.IMAGE_TRANSFER_FAILED.code } })
  expect(ssh.exec.mock.calls.some(([command]) => String(command).includes('start-test.sh'))).toBe(false)
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
  const compose = parse(readFileSync(join(root, '.hai/deploy/test/compose.yml'), 'utf8'))
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
