import type { MiddlewareRequirement } from '@h-ai/deploy'
import type { Server } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { core } from '@h-ai/core'
import * as deployModule from '@h-ai/deploy'
import { storage, StorageConfigSchema } from '@h-ai/storage'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { stringify } from 'yaml'
import { configureDeployMiddleware } from '../src/commands/cli-deploy-middleware.js'

const mocked = vi.hoisted(() => ({ prompt: vi.fn() }))
vi.mock('prompts', () => ({ default: mocked.prompt }))
let root: string
let s3Server: Server | undefined
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'hai-middleware-retain-'))
  mkdirSync(join(root, 'config'))
  writeFileSync(join(root, 'hai.json'), '{}')
  writeFileSync(join(root, '.env.test'), 'HAI_CORE_ENV=test\n')
  core.i18n.setGlobalLocale('en-US')
  mocked.prompt.mockReset()
})
afterEach(async () => {
  await storage.close()
  if (s3Server) {
    s3Server.closeAllConnections()
    await new Promise<void>((resolve, reject) => s3Server!.close(error => error ? reject(error) : resolve()))
    s3Server = undefined
  }
  await deployModule.deploy.close()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  core.config.clear()
  rmSync(root, { recursive: true, force: true })
})

function fixture(config: Record<string, unknown>, service: MiddlewareRequirement['service'] = 'storage', configName: string = service): void {
  const owner = configName === 'db' ? 'reldb' : configName
  const dependency = `@h-ai/${owner}`
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'retained', dependencies: { [dependency]: '1' } }))
  writeFileSync(join(root, 'pnpm-lock.yaml'), stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies: { [dependency]: { version: '1' } } } }, packages: { [`${dependency}@1`]: {} }, snapshots: { [`${dependency}@1`]: {} } }))
  writeFileSync(join(root, 'config', `_${configName}.yml`), stringify(configName === 'reach' ? { providers: [config] } : configName === 'iam' ? { login: { ldap: true }, ldap: config } : config))
}

const preservedCases: Array<{ service: MiddlewareRequirement['service'], configName?: string, config: Record<string, unknown>, retained: Record<string, unknown> }> = [
  { service: 'db', config: { type: 'postgresql', database: 'business', pool: { max: 7 }, operationLog: { write: true } }, retained: { pool: { max: 7 }, operationLog: { write: true } } },
  { service: 'db', config: { type: 'mysql', database: 'business', pool: { max: 7, queueLimit: 10 }, mysql: { charset: 'utf8mb4' }, operationLog: { write: true } }, retained: { pool: { max: 7, queueLimit: 10 }, mysql: { charset: 'utf8mb4' }, operationLog: { write: true } } },
  { service: 'db', config: { type: 'sqlite', database: './data/app.db', sqlite: { walMode: false, executor: 'worker' }, operationLog: { write: true } }, retained: { sqlite: { walMode: false, executor: 'worker' }, operationLog: { write: true } } },
  { service: 'cache', config: { type: 'redis', keyPrefix: 'business:', db: 4, connectTimeout: 7000, maxRetries: 8, retryDelay: 90, readOnly: true }, retained: { keyPrefix: 'business:', db: 4, connectTimeout: 7000, maxRetries: 8, retryDelay: 90, readOnly: true } },
  { service: 'vecdb', config: { type: 'pgvector', database: 'vectors', tablePrefix: 'custom_', indexType: 'ivfflat', metric: 'dot', operationLog: { read: true } }, retained: { tablePrefix: 'custom_', indexType: 'ivfflat', metric: 'dot', operationLog: { read: true } } },
  { service: 'vecdb', config: { type: 'qdrant', metric: 'euclidean', operationLog: { read: true } }, retained: { metric: 'euclidean', operationLog: { read: true } } },
  { service: 'vecdb', config: { type: 'chroma', metric: 'dot', apiKey: 'fixture-token', startupTimeout: 7000, operationLog: { read: true } }, retained: { metric: 'dot', apiKey: 'fixture-token', startupTimeout: 7000, operationLog: { read: true } } },
  { service: 'vecdb', config: { type: 'lancedb', path: './data/vectors', metric: 'dot', operationLog: { read: true } }, retained: { metric: 'dot', operationLog: { read: true } } },
  { service: 'storage', config: { type: 'local', root: './data/files', publicUrl: 'https://cdn.example.test', operationLog: { write: true } }, retained: { publicUrl: 'https://cdn.example.test', operationLog: { write: true } } },
  { service: 'ldap', configName: 'iam', config: { url: 'ldap://old:389', bindDn: 'cn=admin', bindPassword: 'fixture-password', searchBase: 'dc=old', searchFilter: '(mail={{username}})', usernameAttribute: 'mail', displayNameAttribute: 'displayName', connectTimeout: 9000 }, retained: { searchFilter: '(mail={{username}})', usernameAttribute: 'mail', displayNameAttribute: 'displayName', connectTimeout: 9000 } },
  { service: 'email', configName: 'reach', config: { name: 'alerts', type: 'smtp', host: 'old', from: 'Alerts <alerts@example.test>' }, retained: { name: 'alerts', from: 'Alerts <alerts@example.test>' } },
]

it.each(preservedCases)('默认模式完整保留 $service/$config.type 的既有非表单配置', async ({ service, configName, config, retained }) => {
  fixture(config, service, configName)
  const scanned = await deployModule.deploy.scan(root, { environment: 'test' })
  const environment = deployModule.loadDeploymentEnvironment({ environment: 'test', envDir: root })
  expect(scanned.success && environment.success).toBe(true)
  if (!scanned.success || !environment.success)
    return
  await configureDeployMiddleware(deployModule, scanned.data, environment.data, { provider: { type: 'docker-ssh' } }, true)
  const saved = await deployModule.deploy.scan(root, { environment: 'test' })
  expect(saved.success).toBe(true)
  if (saved.success)
    expect(saved.data.middlewares?.[0]?.config).toMatchObject(retained)
  const loaded = deployModule.loadDeploymentEnvironment({ environment: 'test', envDir: root })
  expect(loaded.success).toBe(true)
  if (loaded.success) {
    const before = [readFileSync(join(root, '.env.test'), 'utf8'), readFileSync(join(root, 'config', `_${configName ?? service}.yml`), 'utf8')]
    if (saved.success)
      await configureDeployMiddleware(deployModule, saved.data, loaded.data, { provider: { type: 'docker-ssh' } }, true)
    expect([readFileSync(join(root, '.env.test'), 'utf8'), readFileSync(join(root, 'config', `_${configName ?? service}.yml`), 'utf8')]).toEqual(before)
  }
})

it.each(['yaml', 'leaf-env', 'parent-env'])('默认 S3 保留 %s 中的公开端点，实际签名使用浏览器地址', async (source) => {
  // 本地协议夹具只响应初始化的列举请求；签名使用实际 AWS SDK，不访问外部存储。
  s3Server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'application/xml')
    response.end('<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>business</Name><MaxKeys>1</MaxKeys><IsTruncated>false</IsTruncated></ListBucketResult>')
  })
  await new Promise<void>((resolve, reject) => s3Server!.once('error', reject).listen(0, '127.0.0.1', resolve))
  const address = s3Server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing S3 fixture port')
  const config = { type: 's3', bucket: 'business', region: 'us-east-1', endpoint: `http://127.0.0.1:${address.port}`, forcePathStyle: true, accessKeyId: 'fixture-key', secretAccessKey: 'fixture-secret', prefix: 'tenant', publicEndpoint: 'https://files.example.test/portal/files', publicUrl: 'https://cdn.example.test', operationLog: { write: true } }
  fixture(source === 'yaml' ? config : { ...config, publicEndpoint: '' })
  if (source === 'leaf-env')
    writeFileSync(join(root, '.env.test'), `HAI_STORAGE_PUBLICENDPOINT=${config.publicEndpoint}\n`)
  if (source === 'parent-env')
    writeFileSync(join(root, '.env.test'), `HAI_STORAGE='${JSON.stringify(config)}'\n`)
  const scanned = await deployModule.deploy.scan(root, { environment: 'test' })
  const environment = deployModule.loadDeploymentEnvironment({ environment: 'test', envDir: root })
  expect(scanned.success && environment.success).toBe(true)
  if (!scanned.success || !environment.success)
    return
  mocked.prompt.mockImplementation(async question => ({ value: question.choices?.some((choice: { value: string }) => choice.value === 'default') ? 'default' : question.choices?.[question.initial ?? 0]?.value }))
  await configureDeployMiddleware(deployModule, scanned.data, environment.data, { provider: { type: 'docker-ssh' } })
  const saved = deployModule.loadDeploymentEnvironment({ environment: 'test', envDir: root })
  expect(saved.success).toBe(true)
  if (!saved.success)
    return
  const effective = StorageConfigSchema.parse(JSON.parse(saved.data.values.HAI_STORAGE))
  expect(effective).toMatchObject({ publicEndpoint: config.publicEndpoint, publicUrl: config.publicUrl, prefix: 'tenant', operationLog: { write: true } })
  expect(readFileSync(join(root, '.env.test'), 'utf8')).not.toContain('fixture-secret')
  expect(await storage.init({ ...effective, createBucket: false })).toMatchObject({ success: true })
  const signed = await storage.presign.getUrl('report.pdf')
  expect(signed.success).toBe(true)
  if (signed.success)
    expect(signed.data).toMatch(/^https:\/\/files\.example\.test\/portal\/files\/business\/tenant\/report\.pdf\?/)
})

it.each(['email', 'sms'] as const)('自定义 $service HTTP Provider 保留安全及幂等选项，保持配置时不重写', async (service) => {
  const config = { name: service === 'sms' ? 'sms' : 'webhook', type: 'api', url: 'https://hooks.example.test/events', headers: { Authorization: 'Bearer fixture-private' }, idempotent: true, redirect: 'error', requireHttps: true }
  fixture(config, service, 'reach')
  const scanned = await deployModule.deploy.scan(root, { environment: 'test' })
  const environment = deployModule.loadDeploymentEnvironment({ environment: 'test', envDir: root })
  expect(scanned.success && environment.success).toBe(true)
  if (!scanned.success || !environment.success)
    return
  mocked.prompt.mockImplementation(async question => ({ value: question.choices?.some((choice: { value: string }) => choice.value === 'custom') ? 'custom' : question.choices?.[question.initial ?? 0]?.value ?? question.initial }))
  await configureDeployMiddleware(deployModule, scanned.data, environment.data, { provider: { type: 'docker-ssh' } })
  const saved = await deployModule.deploy.scan(root, { environment: 'test' })
  expect(saved.success).toBe(true)
  if (saved.success)
    expect(saved.data.middlewares?.[0]?.config).toMatchObject(config)
  expect(readFileSync(join(root, '.env.test'), 'utf8')).not.toContain('fixture-private')
  const loaded = deployModule.loadDeploymentEnvironment({ environment: 'test', envDir: root })
  expect(loaded.success).toBe(true)
  if (saved.success && loaded.success) {
    const files = ['.env.test', '.env.test.local', 'config/_reach.yml'].map(file => join(root, file))
    const before = files.map(file => readFileSync(file, 'utf8'))
    mocked.prompt.mockClear()
    await configureDeployMiddleware(deployModule, saved.data, loaded.data, { provider: { type: 'docker-ssh' } }, true)
    expect(mocked.prompt).not.toHaveBeenCalled()
    expect(files.map(file => readFileSync(file, 'utf8'))).toEqual(before)
  }
})

it('切换数据库后端不迁移不兼容的旧字段', async () => {
  fixture({ type: 'sqlite', database: './data/old.db', sqlite: { executor: 'worker' }, operationLog: { write: true } }, 'db')
  const scanned = await deployModule.deploy.scan(root, { environment: 'test' })
  const environment = deployModule.loadDeploymentEnvironment({ environment: 'test', envDir: root })
  expect(scanned.success && environment.success).toBe(true)
  if (!scanned.success || !environment.success)
    return
  mocked.prompt.mockImplementation(async question => ({ value: question.choices?.some((choice: { value: string }) => choice.value === 'custom') ? 'custom' : question.choices?.some((choice: { value: string }) => choice.value === 'mysql') ? 'mysql' : question.initial }))
  await configureDeployMiddleware(deployModule, scanned.data, environment.data, { provider: { type: 'docker-ssh' } })
  const saved = deployModule.loadDeploymentEnvironment({ environment: 'test', envDir: root })
  expect(saved.success).toBe(true)
  if (saved.success) {
    expect(JSON.parse(saved.data.values.HAI_DB)).toMatchObject({ type: 'mysql' })
    expect(JSON.parse(saved.data.values.HAI_DB)).not.toHaveProperty('sqlite')
  }
})
