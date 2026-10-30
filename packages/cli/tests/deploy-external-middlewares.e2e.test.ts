/** 用真实外部服务核验向导保存、部署计划与最终运行配置；每次只启动一个隔离容器。 */
import type { MiddlewareRequirement } from '@h-ai/deploy'
import type { Server } from 'node:http'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { cache, CacheConfigSchema } from '@h-ai/cache'
import { core } from '@h-ai/core'
import * as deployment from '@h-ai/deploy'
import { reldb, ReldbConfigSchema } from '@h-ai/reldb'
import { storage, StorageConfigSchema } from '@h-ai/storage'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stringify } from 'yaml'
import { configureDeployMiddleware } from '../src/commands/cli-deploy-middleware.js'

const mocked = vi.hoisted(() => ({ prompt: vi.fn() }))
vi.mock('prompts', () => ({ default: mocked.prompt }))
const engine = process.env.HAI_TEST_CONTAINER_ENGINE ?? 'podman'
const enabled = process.env.HAI_CLI_RUN_EXTERNAL_MIDDLEWARE_GATES === '1'
const owner = `hai-external-${randomBytes(8).toString('hex')}`
let root: string | undefined
let containerId: string | undefined
let proxy: Server | undefined

function container(args: string[]): string {
  return execFileSync(engine, args, { encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

async function start(image: string, port: number, environment: Record<string, string>, command: string[] = []): Promise<number> {
  root = mkdtempSync(join(tmpdir(), 'hai-external-middleware-'))
  const envFile = join(root, 'container.env')
  writeFileSync(envFile, Object.entries(environment).map(([key, value]) => `${key}=${value}`).join('\n'), { mode: 0o600 })
  // 仅使用缓存的固定公开镜像；先取得完整 ID，再启动，失败时也能回收本次容器。
  containerId = container(['create', '--pull=never', '--label', `hai-test-owner=${owner}`, '--env-file', envFile, '-p', `127.0.0.1::${port}`, image, ...command])
  if (!/^[a-f\d]{64}$/.test(containerId))
    throw new Error('Missing owned container receipt')
  container(['start', containerId])
  const mapped = container(['port', containerId, `${port}/tcp`])
  const published = Number(/:(\d+)$/.exec(mapped)?.[1])
  if (!published)
    throw new Error('Missing published middleware port')
  return published
}

async function ready(probe: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    try {
      if (await probe())
        return
    }
    catch { /* 初始化期间允许连接尚未就绪；总等待有明确期限。 */ }
    await setTimeout(500)
  }
  throw new Error('External middleware readiness deadline exceeded')
}

async function configure(service: MiddlewareRequirement['service'], config: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!root)
    throw new Error('Missing owned fixture directory')
  mkdirSync(join(root, 'config'))
  const dependency = `@h-ai/${service === 'db' ? 'reldb' : service}`
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'external-fixture', version: '1.0.0', dependencies: { [dependency]: '1' } }))
  writeFileSync(join(root, 'pnpm-lock.yaml'), stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies: { [dependency]: { version: '1' } } } }, packages: { [`${dependency}@1`]: {} }, snapshots: { [`${dependency}@1`]: {} } }))
  writeFileSync(join(root, 'hai.json'), '{}')
  writeFileSync(join(root, '.env.test'), 'HAI_CORE_ENV=test\n')
  writeFileSync(join(root, 'config', `_${service}.yml`), stringify(config))
  // 此处只检查计划，空 tar 是清单/校验和夹具，不会被导入或运行；真实服务由上面的容器提供。
  const artifactDirectory = join(root, '.hai/build/docker')
  mkdirSync(artifactDirectory, { recursive: true })
  const archive = Buffer.alloc(1024)
  writeFileSync(join(artifactDirectory, 'serv-1.0.0.tar'), archive)
  writeFileSync(join(artifactDirectory, 'manifest.json'), JSON.stringify({ version: 4, primaryService: 'serv', appVersion: '1.0.0', buildId: 'external-fixture', hasWeb: false, images: [{ name: 'serv', file: 'serv-1.0.0.tar', imageRef: 'hai-external-plan:1.0.0', sha256: createHash('sha256').update(archive).digest('hex') }] }))
  const scanned = await deployment.deploy.scan(root, { environment: 'test' })
  const environment = deployment.loadDeploymentEnvironment({ environment: 'test', envDir: root })
  if (!scanned.success || !environment.success)
    throw new Error('External fixture scan failed')
  core.i18n.setGlobalLocale('en-US')
  mocked.prompt.mockImplementation(async question => ({ value: question.choices?.some((choice: { value: string }) => choice.value === 'custom') ? 'custom' : question.choices?.[question.initial ?? 0]?.value ?? question.initial }))
  const deployConfig = { provider: { type: 'docker-ssh' as const, expose: { hostPort: 18080 } } }
  const modes = await configureDeployMiddleware(deployment, scanned.data, environment.data, deployConfig)
  expect(modes[service]).toBe('custom')
  const saved = await deployment.deploy.scan(root, { environment: 'test' })
  if (!saved.success)
    throw new Error('Saved external fixture scan failed')
  expect(saved.data.middlewares?.[0]?.config).toMatchObject(config)
  const plan = await deployment.createDeploymentPlan(root, deployConfig, { environment: 'test', serviceModes: modes })
  if (!plan.success)
    throw new Error('External fixture deployment plan failed')
  expect(plan.data.logicalVolumes).toEqual([])
  expect(plan.data.composeManagedServices).toEqual([])
  expect(plan.data.containers).toHaveLength(1)
  expect(plan.data.containers[0]).toMatch(/-serv$/)
  expect(plan.data.middleware).toMatchObject([{ service, action: 'custom', provisioner: undefined }])
  return saved.data.middlewares![0].config
}

afterEach(async () => {
  // 关闭客户端后再停止服务；仅凭本轮 create 回执和 owner 回收，不按名称搜索认领。
  await storage.close()
  await cache.close()
  await reldb.close()
  await deployment.deploy.close()
  if (proxy) {
    proxy.closeAllConnections()
    await new Promise<void>((resolve, reject) => proxy!.close(error => error ? reject(error) : resolve()))
    proxy = undefined
  }
  if (containerId) {
    expect(container(['inspect', '--format', '{{index .Config.Labels "hai-test-owner"}}', containerId])).toBe(owner)
    container(['rm', '--force', '--volumes', containerId])
    expect(container(['ps', '-aq', '--filter', `id=${containerId}`])).toBe('')
    containerId = undefined
  }
  if (root)
    rmSync(root, { recursive: true, force: true })
  root = undefined
  core.config.clear()
  mocked.prompt.mockReset()
}, 45_000)

describe.runIf(enabled).sequential('真实外部中间件配置', () => {
  it.each(['postgresql', 'mysql'] as const)('%s 保存完整连接选项并完成读写和事务', async (type) => {
    const password = randomBytes(24).toString('hex')
    const postgres = type === 'postgresql'
    const port = await start(postgres ? 'docker.io/library/postgres:16.15-alpine' : 'docker.io/library/mysql:8.4.11', postgres ? 5432 : 3306, postgres ? { POSTGRES_USER: 'fixture', POSTGRES_PASSWORD: password, POSTGRES_DB: 'business' } : { MYSQL_USER: 'fixture', MYSQL_PASSWORD: password, MYSQL_ROOT_PASSWORD: randomBytes(24).toString('hex'), MYSQL_DATABASE: 'business' })
    await ready(() => {
      if (!containerId)
        return false
      return container(['exec', containerId, 'sh', '-c', postgres ? 'pg_isready -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' : 'MYSQL_PWD="$MYSQL_PASSWORD" mysql --protocol=TCP -h 127.0.0.1 -u "$MYSQL_USER" "$MYSQL_DATABASE" -e "SELECT 1"']).length > 0
    })
    const config = ReldbConfigSchema.parse(await configure('db', { type, host: '127.0.0.1', port, user: 'fixture', password, database: 'business', pool: postgres ? { max: 3, acquireTimeout: 7000, idleTimeout: 15000 } : { max: 3, acquireTimeout: 7000, queueLimit: 8 }, ...(postgres ? {} : { mysql: { charset: 'utf8mb4' } }), operationLog: { write: false } }))
    expect((await reldb.init(config)).success).toBe(true)
    expect((await reldb.sql.execute('CREATE TABLE retained_options (id INTEGER PRIMARY KEY, label VARCHAR(100))')).success).toBe(true)
    const inserted = await reldb.tx.wrap(async (tx) => {
      const result = await tx.execute('INSERT INTO retained_options (id, label) VALUES (?, ?)', [1, '外部数据库'])
      if (!result.success)
        throw new Error(result.error.message)
      return result.data
    })
    expect(inserted.success).toBe(true)
    const read = await reldb.sql.query<{ label: string }>('SELECT label FROM retained_options WHERE id = ?', [1])
    expect(read).toMatchObject({ success: true, data: [{ label: '外部数据库' }] })
  }, 180_000)

  it('外部 Redis 保留认证、数据库编号和键前缀，真实读写及过期生效', async () => {
    const password = randomBytes(24).toString('hex')
    const port = await start('docker.io/library/redis:7.4.11-alpine', 6379, { FIXTURE_PASSWORD: password }, ['sh', '-c', 'exec redis-server --requirepass "$FIXTURE_PASSWORD"'])
    await ready(() => !!containerId && container(['exec', containerId, 'sh', '-c', 'REDISCLI_AUTH="$FIXTURE_PASSWORD" redis-cli ping']) === 'PONG')
    const config = CacheConfigSchema.parse(await configure('cache', { type: 'redis', host: '127.0.0.1', port, password, db: 4, keyPrefix: 'orders:', connectTimeout: 7000, maxRetries: 2, retryDelay: 60, commandTimeout: 5000 }))
    expect((await cache.init(config)).success).toBe(true)
    expect((await cache.kv.set('retained', { value: '已保存' }, { ex: 30 })).success).toBe(true)
    expect(await cache.kv.get('retained')).toMatchObject({ success: true, data: { value: '已保存' } })
    expect(container(['exec', containerId!, 'sh', '-c', 'REDISCLI_AUTH="$FIXTURE_PASSWORD" redis-cli -n 4 --raw keys "orders:*"'])).toContain('orders:retained')
    expect(Number(container(['exec', containerId!, 'sh', '-c', 'REDISCLI_AUTH="$FIXTURE_PASSWORD" redis-cli -n 4 ttl orders:retained']))).toBeGreaterThan(0)
    expect(container(['exec', containerId!, 'sh', '-c', 'REDISCLI_AUTH="$FIXTURE_PASSWORD" redis-cli -n 0 --raw keys "orders:*"'])).toBe('')
  }, 180_000)

  it('外部 S3 保留 prefix/publicEndpoint，通过带目录的入口完成私有签名下载', async () => {
    const port = await start('ghcr.io/rustfs/rustfs:1.0.1', 9000, { RUSTFS_ACCESS_KEY: randomBytes(12).toString('hex'), RUSTFS_SECRET_KEY: randomBytes(24).toString('hex'), RUSTFS_ADDRESS: '0.0.0.0:9000', RUSTFS_VOLUMES: '/data', RUSTFS_CONSOLE_ENABLE: 'false' })
    await ready(async () => (await fetch(`http://127.0.0.1:${port}/health/ready`)).ok)
    const credentials = JSON.parse(container(['inspect', '--format', '{{json .Config.Env}}', containerId!])) as string[]
    const value = (name: string) => credentials.find(entry => entry.startsWith(`${name}=`))!.slice(name.length + 1)
    proxy = createServer((incoming, outgoing) => {
      const upstream = request({ host: '127.0.0.1', port, method: incoming.method, path: incoming.url?.replace(/^\/files(?=\/)/, ''), headers: incoming.headers }, (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers)
        response.pipe(outgoing)
      })
      upstream.on('error', () => {
        outgoing.writeHead(502)
        outgoing.end()
      })
      incoming.pipe(upstream)
    })
    await new Promise<void>((resolve, reject) => proxy!.once('error', reject).listen(0, '127.0.0.1', resolve))
    const address = proxy.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing external proxy port')
    const config = StorageConfigSchema.parse(await configure('storage', { type: 's3', bucket: 'business', region: 'us-east-1', endpoint: `http://127.0.0.1:${port}`, publicEndpoint: `http://127.0.0.1:${address.port}/files`, forcePathStyle: true, accessKeyId: value('RUSTFS_ACCESS_KEY'), secretAccessKey: value('RUSTFS_SECRET_KEY'), prefix: 'invoices/2026', createBucket: true }))
    expect((await storage.init(config)).success).toBe(true)
    expect((await storage.file.put('中文 +%.txt', 'private external download')).success).toBe(true)
    const content = await storage.file.get('中文 +%.txt')
    expect(content.success && content.data.toString()).toBe('private external download')
    const signed = await storage.presign.getUrl('中文 +%.txt', { expiresIn: 60 })
    if (!signed.success)
      throw new Error('External S3 presign failed')
    expect(signed.data).toContain(`${config.type === 's3' ? config.publicEndpoint : ''}/business/invoices/2026/`)
    const downloaded = await fetch(signed.data)
    expect(downloaded.status).toBe(200)
    expect(await downloaded.text()).toBe('private external download')
    const anonymous = new URL(signed.data)
    anonymous.search = ''
    expect((await fetch(anonymous)).status).toBe(403)
    expect((await storage.file.delete('中文 +%.txt')).success).toBe(true)
  }, 180_000)
})
