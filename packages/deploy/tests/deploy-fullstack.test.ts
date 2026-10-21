import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { buildImage, saveImage } from '../src/container/deploy-container-runtime.js'
import { deploy, HaiDeployError } from '../src/index.js'

const ssh = vi.hoisted(() => ({ ping: vi.fn(), exec: vi.fn(), upload: vi.fn() }))
vi.mock('../src/container/deploy-ssh.js', () => ({ createSshExecutor: () => ssh }))
vi.mock('../src/container/deploy-container-runtime.js', () => ({ detectLocalRuntime: vi.fn(async () => ({ success: true, data: 'docker' })), buildImage: vi.fn(), saveImage: vi.fn() }))

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'hai-fullstack-deploy-'))
  mkdirSync(join(root, 'config'))
  writeFileSync(join(root, 'package.json'), '{"name":"example"}')
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: \'9.0\'\nimporters:\n  .: {}\n')
  writeFileSync(join(root, '.env.test'), 'HAI_ADMIN_DEFAULT_PASSWORD=test-private-password\n')
  writeFileSync(join(root, 'config/_serv.yml'), 'http:\n  apiPrefix: /custom-api/v2\ncors:\n  origin: "*"\n')
  writeFileSync(join(root, 'Dockerfile'), 'FROM test-api\n')
  writeFileSync(join(root, 'Web.Dockerfile'), 'FROM test-web AS web\n')
  ssh.ping.mockResolvedValue({ success: true, data: undefined })
  ssh.upload.mockResolvedValue({ success: true, data: undefined })
  ssh.exec.mockResolvedValue({ success: true, data: { code: 0, stdout: '', stderr: '' } })
  vi.mocked(buildImage).mockResolvedValue({ success: true, data: undefined })
  vi.mocked(saveImage).mockResolvedValue({ success: true, data: undefined })
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

/** 初始化同一公开部署 API，测试不替换扫描、环境加载及编排行为。 */
async function initialize(web = true): Promise<void> {
  expect(await deploy.init({
    provider: { type: 'docker-ssh', ssh: { host: '127.0.0.1', username: 'deploy' }, remote: { runtime: 'docker' }, expose: { hostPort: 18080 } },
    container: { runtime: 'docker', ...(web ? { web: { context: '.', dockerfile: 'Web.Dockerfile' } } : {}) },
  })).toMatchObject({ success: true })
}

it('一次部署构建并上传 API/Web，同源公开 Web 且私有变量仅进入 API', async () => {
  await initialize()
  expect(await deploy.deployApp(root, { environment: 'test', skipProvision: true })).toMatchObject({ success: true, data: { url: 'http://127.0.0.1:18080', healthCheck: 'passed' } })
  expect(buildImage).toHaveBeenCalledTimes(2)
  expect(buildImage).toHaveBeenLastCalledWith('docker', expect.objectContaining({ target: 'web', dockerfilePath: join(root, 'Web.Dockerfile') }))
  expect(JSON.stringify(vi.mocked(buildImage).mock.calls)).not.toContain('test-private-password')
  expect(saveImage).toHaveBeenCalledTimes(2)
  expect(ssh.upload.mock.calls.filter(([source]) => String(source).endsWith('.tar'))).toHaveLength(2)
  const directory = join(root, '.hai/deploy/test')
  const compose = parse(readFileSync(join(directory, 'compose.yml'), 'utf8'))
  expect(compose.services.app.ports).toBeUndefined()
  expect(compose.services.app.env_file).toEqual(['.env.runtime'])
  expect(compose.services.web).toMatchObject({ ports: ['18080:8080'], environment: { PUBLIC_API_BASE: '' }, depends_on: ['app'], pull_policy: 'never' })
  expect(compose.services.web.env_file).toBeUndefined()
  expect(compose.services.web.image.split(':').at(-1)).toBe(compose.services.app.image.split(':').at(-1))
  expect(readFileSync(join(directory, 'web.conf'), 'utf8')).toContain('location /custom-api/v2/')
  expect(readFileSync(join(directory, '.env.runtime'), 'utf8')).toContain('test-private-password')
  expect(readFileSync(join(directory, '.env.runtime'), 'utf8')).toContain('http://127.0.0.1:18080')
  expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(['http://127.0.0.1:18080/health', 'http://127.0.0.1:18080/_hai/web-health', 'http://127.0.0.1:18080/'])
  writeFileSync(join(root, 'config/_serv.yml'), 'http:\n  apiPrefix: /custom-api/v2\ncors:\n  origin: https://app.example.test\n')
  expect(await deploy.deployApp(root, { environment: 'test', skipProvision: true })).toMatchObject({ success: true })
  expect(JSON.parse(parseEnv(readFileSync(join(directory, '.env.runtime'), 'utf8')).HAI_SERV)).toMatchObject({ cors: { origin: 'https://app.example.test' } })
})

it('web 构建失败时不上传或启动任何远端资源', async () => {
  await initialize()
  vi.mocked(buildImage).mockResolvedValueOnce({ success: true, data: undefined }).mockResolvedValueOnce({ success: false, error: { ...HaiDeployError.CONTAINER_BUILD_FAILED, message: 'web build failed' } })
  const result = await deploy.deployApp(root, { environment: 'test' })
  expect(result).toMatchObject({ success: false, error: { code: HaiDeployError.CONTAINER_BUILD_FAILED.code } })
  expect(ssh.ping).not.toHaveBeenCalled()
  expect(ssh.upload).not.toHaveBeenCalled()
})

it('web 上传失败不能启动只有 API 的半份部署', async () => {
  await initialize()
  ssh.upload.mockImplementation(async (source: string) => source.endsWith('-web.tar')
    ? { success: false, error: { ...HaiDeployError.IMAGE_TRANSFER_FAILED, message: 'web transfer failed' } }
    : { success: true, data: undefined })
  expect(await deploy.deployApp(root, { environment: 'test' })).toMatchObject({ success: false, error: { code: HaiDeployError.IMAGE_TRANSFER_FAILED.code } })
  expect(ssh.exec.mock.calls.some(([command]) => String(command).includes('start-test.sh'))).toBe(false)
})

it('aPI 正常但 Web 不健康时不会报告部署成功', async () => {
  await initialize()
  vi.useFakeTimers()
  vi.mocked(fetch).mockImplementation(async input => new Response('health', { status: String(input).endsWith('/_hai/web-health') ? 503 : 200 }))
  const pending = deploy.deployApp(root, { environment: 'test' })
  await vi.runAllTimersAsync()
  expect(await pending).toMatchObject({ success: false, error: { code: HaiDeployError.HEALTH_CHECK_FAILED.code } })
})

it('未配置 Web 的单服务部署保持原有端口及镜像行为', async () => {
  await initialize(false)
  expect(await deploy.deployApp(root, { environment: 'test' })).toMatchObject({ success: true })
  expect(buildImage).toHaveBeenCalledTimes(1)
  const compose = parse(readFileSync(join(root, '.hai/deploy/test/compose.yml'), 'utf8'))
  expect(compose.services.app.ports).toEqual(['18080:3000'])
  expect(compose.services.web).toBeUndefined()
})

it('非法 API 前缀返回配置错误而非将指令写入代理配置', async () => {
  await initialize()
  writeFileSync(join(root, 'config/_serv.yml'), 'http:\n  apiPrefix: "/api; injection"\n')
  expect(await deploy.deployApp(root, { environment: 'test' })).toMatchObject({ success: false, error: { code: HaiDeployError.CONFIG_ERROR.code } })
  expect(buildImage).not.toHaveBeenCalled()
})
