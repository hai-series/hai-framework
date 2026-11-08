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
import * as cliUtils from '../src/cli-utils.js'
import { configureDeployMiddleware } from '../src/commands/cli-deploy-middleware.js'

const mocked = vi.hoisted(() => ({
  prompt: vi.fn(),
}))
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
    await new Promise<void>((resolve, reject) => s3Server!.close(error => error
      ? reject(error)
      : resolve()))
    s3Server = undefined
  }
  await deployModule.deploy.close()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  core.config.clear()
  rmSync(root, { recursive: true, force: true })
})

function fixture(config: Record<string, unknown>, service: MiddlewareRequirement['service'] = 'storage', configName: string = service): void {
  const owner = configName === 'db'
    ? 'reldb'
    : configName
  const dependency = `@h-ai/${owner}`
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'retained',
    dependencies: { [dependency]: '1' },
  }))
  writeFileSync(join(root, 'pnpm-lock.yaml'), stringify({
    lockfileVersion: '9.0',
    importers: {
      '.': {
        dependencies: {
          [dependency]: { version: '1' },
        },
      },
    },
    packages: { [`${dependency}@1`]: {} },
    snapshots: { [`${dependency}@1`]: {} },
  }))
  writeFileSync(join(root, 'config', `_${configName}.yml`), stringify(configName === 'reach'
    ? {
        providers: [config],
      }
    : configName === 'iam'
      ? {
          login: { ldap: true },
          ldap: config,
        }
      : config))
}

const preservedCases: Array<{ service: MiddlewareRequirement['service'], configName?: string, config: Record<string, unknown>, retained: Record<string, unknown> }> = [
  {
    service: 'db',
    config: {
      type: 'postgresql',
      database: 'business',
      pool: { max: 7 },
      operationLog: { write: true },
    },
    retained: {
      pool: { max: 7 },
      operationLog: { write: true },
    },
  },
  {
    service: 'db',
    config: {
      type: 'mysql',
      database: 'business',
      pool: { max: 7, queueLimit: 10 },
      mysql: { charset: 'utf8mb4' },
      operationLog: { write: true },
    },
    retained: {
      pool: { max: 7, queueLimit: 10 },
      mysql: { charset: 'utf8mb4' },
      operationLog: { write: true },
    },
  },
  {
    service: 'db',
    config: {
      type: 'sqlite',
      database: './data/app.db',
      sqlite: { walMode: false, executor: 'worker' },
      operationLog: { write: true },
    },
    retained: {
      sqlite: { walMode: false, executor: 'worker' },
      operationLog: { write: true },
    },
  },
  {
    service: 'cache',
    config: {
      type: 'redis',
      keyPrefix: 'business:',
      db: 4,
      connectTimeout: 7000,
      maxRetries: 8,
      retryDelay: 90,
      readOnly: true,
    },
    retained: {
      keyPrefix: 'business:',
      db: 4,
      connectTimeout: 7000,
      maxRetries: 8,
      retryDelay: 90,
      readOnly: true,
    },
  },
  {
    service: 'vecdb',
    config: {
      type: 'pgvector',
      database: 'vectors',
      tablePrefix: 'custom_',
      indexType: 'ivfflat',
      metric: 'dot',
      operationLog: { read: true },
    },
    retained: {
      tablePrefix: 'custom_',
      indexType: 'ivfflat',
      metric: 'dot',
      operationLog: { read: true },
    },
  },
  {
    service: 'vecdb',
    config: {
      type: 'qdrant',
      metric: 'euclidean',
      operationLog: { read: true },
    },
    retained: {
      metric: 'euclidean',
      operationLog: { read: true },
    },
  },
  {
    service: 'vecdb',
    config: {
      type: 'chroma',
      metric: 'dot',
      apiKey: 'fixture-token',
      startupTimeout: 7000,
      operationLog: { read: true },
    },
    retained: {
      metric: 'dot',
      apiKey: 'fixture-token',
      startupTimeout: 7000,
      operationLog: { read: true },
    },
  },
  {
    service: 'vecdb',
    config: {
      type: 'lancedb',
      path: './data/vectors',
      metric: 'dot',
      operationLog: { read: true },
    },
    retained: {
      metric: 'dot',
      operationLog: { read: true },
    },
  },
  {
    service: 'storage',
    config: {
      type: 'local',
      root: './data/files',
      publicUrl: 'https://cdn.example.test',
      operationLog: { write: true },
    },
    retained: {
      publicUrl: 'https://cdn.example.test',
      operationLog: { write: true },
    },
  },
  {
    service: 'ldap',
    configName: 'iam',
    config: {
      url: 'ldap://old:389',
      bindDn: 'cn=admin',
      bindPassword: 'fixture-password',
      searchBase: 'dc=old',
      searchFilter: '(mail={{username}})',
      usernameAttribute: 'mail',
      displayNameAttribute: 'displayName',
      connectTimeout: 9000,
    },
    retained: {
      searchFilter: '(mail={{username}})',
      usernameAttribute: 'mail',
      displayNameAttribute: 'displayName',
      connectTimeout: 9000,
    },
  },
  {
    service: 'email',
    configName: 'reach',
    config: {
      name: 'alerts',
      type: 'smtp',
      host: 'old',
      from: 'Alerts <alerts@example.test>',
    },
    retained: { name: 'alerts', from: 'Alerts <alerts@example.test>' },
  },
]

it.each(preservedCases)('默认模式完整保留 $service/$config.type 的既有非表单配置', async ({ service, configName, config, retained }) => {
  fixture(config, service, configName)
  const scanned = await deployModule.deploy.scan(root, { environment: 'test' })
  const environment = deployModule.loadDeploymentEnvironment({ environment: 'test', envDir: root })
  expect(scanned.success && environment.success).toBe(true)
  if (!scanned.success || !environment.success)
    return
  await configureDeployMiddleware(deployModule, scanned.data, environment.data, {
    provider: { type: 'docker-ssh' },
  }, true)
  const saved = await deployModule.deploy.scan(root, { environment: 'test' })
  expect(saved.success).toBe(true)
  if (saved.success)
    expect(saved.data.middlewares?.[0]?.config).toMatchObject(retained)
  const loaded = deployModule.loadDeploymentEnvironment({ environment: 'test', envDir: root })
  expect(loaded.success).toBe(true)
  if (loaded.success) {
    const before = [
      readFileSync(join(root, '.env.test'), 'utf8'),
      readFileSync(join(root, 'config', `_${configName ?? service}.yml`), 'utf8'),
    ]
    if (saved.success) {
      await configureDeployMiddleware(deployModule, saved.data, loaded.data, {
        provider: { type: 'docker-ssh' },
      }, true)
    }
    expect([
      readFileSync(join(root, '.env.test'), 'utf8'),
      readFileSync(join(root, 'config', `_${configName ?? service}.yml`), 'utf8'),
    ]).toEqual(before)
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
  const config = {
    type: 's3',
    bucket: 'business',
    region: 'us-east-1',
    endpoint: `http://127.0.0.1:${address.port}`,
    forcePathStyle: true,
    accessKeyId: 'fixture-key',
    secretAccessKey: 'fixture-secret',
    prefix: 'tenant',
    publicEndpoint: 'https://files.example.test/portal/files',
    publicUrl: 'https://cdn.example.test',
    operationLog: { write: true },
  }
  fixture(source === 'yaml'
    ? config
    : { ...config, publicEndpoint: '' })
  if (source === 'leaf-env')
    writeFileSync(join(root, '.env.test'), `HAI_STORAGE_PUBLICENDPOINT=${config.publicEndpoint}\n`)
  if (source === 'parent-env')
    writeFileSync(join(root, '.env.test'), `HAI_STORAGE='${JSON.stringify(config)}'\n`)
  const scanned = await deployModule.deploy.scan(root, { environment: 'test' })
  const environment = deployModule.loadDeploymentEnvironment({ environment: 'test', envDir: root })
  expect(scanned.success && environment.success).toBe(true)
  if (!scanned.success || !environment.success)
    return
  mocked.prompt.mockImplementation(async question => ({
    value: question.choices?.some((choice: { value: string }) => choice.value === 'default')
      ? 'default'
      : question.choices?.[question.initial ?? 0]?.value,
  }))
  await configureDeployMiddleware(deployModule, scanned.data, environment.data, {
    provider: { type: 'docker-ssh' },
  })
  const saved = deployModule.loadDeploymentEnvironment({ environment: 'test', envDir: root })
  expect(saved.success).toBe(true)
  if (!saved.success)
    return
  const resolved = deployModule.loadDeploymentConfig('storage', join(root, 'config/_storage.yml'), saved.data.values)
  expect(resolved.success).toBe(true)
  if (!resolved.success)
    return
  const effective = StorageConfigSchema.parse(resolved.data)
  expect(effective).toMatchObject({
    publicEndpoint: config.publicEndpoint,
    publicUrl: config.publicUrl,
    prefix: 'tenant',
    operationLog: { write: true },
  })
  expect(readFileSync(join(root, '.env.test'), 'utf8')).not.toContain('fixture-secret')
  expect(await storage.init({ ...effective, createBucket: false })).toMatchObject({ success: true })
  const signed = await storage.presign.getUrl('report.pdf')
  expect(signed.success).toBe(true)
  if (signed.success)
    expect(signed.data).toMatch(/^https:\/\/files\.example\.test\/portal\/files\/business\/tenant\/report\.pdf\?/)
})

it.each(['email', 'sms'] as const)('自定义 $service HTTP Provider 保留安全及幂等选项，保持配置时不重写', async (service) => {
  const config = {
    name: service === 'sms'
      ? 'sms'
      : 'webhook',
    type: 'api',
    url: 'https://hooks.example.test/events',
    headers: { Authorization: 'Bearer fixture-private' },
    idempotent: true,
    redirect: 'error',
    requireHttps: true,
  }
  fixture(config, service, 'reach')
  const scanned = await deployModule.deploy.scan(root, { environment: 'test' })
  const environment = deployModule.loadDeploymentEnvironment({ environment: 'test', envDir: root })
  expect(scanned.success && environment.success).toBe(true)
  if (!scanned.success || !environment.success)
    return
  mocked.prompt.mockImplementation(async question => ({
    value: question.choices?.some((choice: { value: string }) => choice.value === 'custom')
      ? 'custom'
      : question.choices?.[question.initial ?? 0]?.value ?? question.initial,
  }))
  await configureDeployMiddleware(deployModule, scanned.data, environment.data, {
    provider: { type: 'docker-ssh' },
  })
  expect(mocked.prompt.mock.calls.some(([question]) => question.initial === JSON.stringify(config.headers) && question.type === 'password')).toBe(true)
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
    await configureDeployMiddleware(deployModule, saved.data, loaded.data, {
      provider: { type: 'docker-ssh' },
    }, true)
    expect(mocked.prompt).not.toHaveBeenCalled()
    expect(files.map(file => readFileSync(file, 'utf8'))).toEqual(before)
  }
})

it('切换数据库后端不迁移不兼容的旧字段', async () => {
  fixture({
    type: 'sqlite',
    database: './data/old.db',
    sqlite: { executor: 'worker' },
    operationLog: { write: true },
  }, 'db')
  const scanned = await deployModule.deploy.scan(root, { environment: 'test' })
  const environment = deployModule.loadDeploymentEnvironment({ environment: 'test', envDir: root })
  expect(scanned.success && environment.success).toBe(true)
  if (!scanned.success || !environment.success)
    return
  mocked.prompt.mockImplementation(async (question) => {
    const preferred = question.choices?.find((choice: { value: string }) => ['custom', 'mysql', 'fields'].includes(choice.value))
    return { value: preferred?.value ?? question.initial }
  })
  await configureDeployMiddleware(deployModule, scanned.data, environment.data, {
    provider: { type: 'docker-ssh' },
  })
  const saved = deployModule.loadDeploymentEnvironment({ environment: 'test', envDir: root })
  expect(saved.success).toBe(true)
  if (saved.success) {
    const resolved = deployModule.loadDeploymentConfig('db', join(root, 'config/_db.yml'), saved.data.values)
    expect(resolved).toMatchObject({
      success: true,
      data: { type: 'mysql' },
    })
    expect(resolved.success && resolved.data).not.toHaveProperty('sqlite')
  }
})

it('重新配置私有 Reach 列表的一项后，保留其他项并使新值生效', async () => {
  const email = { name: 'email', type: 'api', url: 'https://old-mail.example.test/send' }
  const sms = { name: 'sms', type: 'api', url: 'https://sms.example.test/send' }
  fixture(email, 'email', 'reach')
  const publicFile = join(root, '.env.test')
  const privateFile = join(root, '.env.test.local')
  writeFileSync(publicFile, 'HAI_REACH_PROVIDERS=\'[]\'\n')
  writeFileSync(privateFile, core.config.stringifyEnv({
    HAI_REACH_PROVIDERS: JSON.stringify([email, sms]),
  }))
  const scanned = await deployModule.deploy.scan(root, { environment: 'test' })
  const environment = deployModule.loadDeploymentEnvironment({ environment: 'test', envDir: root })
  if (!scanned.success || !environment.success)
    throw new Error('Could not load private Reach fixture')
  const url = 'https://new-mail.example.test/send'
  mocked.prompt.mockImplementation(async (question) => {
    const custom = question.choices?.find((choice: { value: string }) => choice.value === 'custom')
    return { value: custom?.value ?? question.choices?.[question.initial ?? 0]?.value ?? (question.initial === email.url
      ? url
      : question.initial) }
  })
  const middlewares = scanned.data.middlewares?.filter(item => item.service === 'email')
  await configureDeployMiddleware(deployModule, { ...scanned.data, middlewares }, environment.data, {
    provider: { type: 'docker-ssh' },
  })
  const saved = await deployModule.deploy.scan(root, { environment: 'test' })
  expect(saved).toMatchObject({
    success: true,
    data: {
      middlewares: [
        {
          config: { ...email, url },
        },
        { config: sms },
      ],
    },
  })
  expect(readFileSync(publicFile, 'utf8')).not.toContain('HAI_REACH_PROVIDERS_0')
})

it('explains the S3 API endpoint separately from the bucket and shows field errors', async () => {
  const endpoint = 'http://objects.example.test:9000'
  fixture({
    type: 's3',
    endpoint,
    bucket: 'uploads',
    region: 'us-east-1',
    accessKeyId: 'fixture-id',
    secretAccessKey: 'fixture-secret',
  })
  const scanned = await deployModule.deploy.scan(root, { environment: 'test' })
  const environment = deployModule.loadDeploymentEnvironment({ environment: 'test', envDir: root })
  if (!scanned.success || !environment.success)
    throw new Error('Could not load S3 fixture')
  mocked.prompt.mockImplementation(async (question) => {
    if (question.choices) {
      return {
        value: question.choices.some((choice: { value: string }) => choice.value === 'custom')
          ? 'custom'
          : 's3',
      }
    }
    if (question.message.startsWith('S3 API endpoint')) {
      expect(question.type).toBe('text')
      expect(question.message).toContain('without the bucket name')
      expect(question.validate('objects.example.test:9000')).toMatch(/HAI_STORAGE_ENDPOINT.*HTTP or HTTPS/)
      expect(question.validate(endpoint)).toBe(true)
    }
    return { value: question.initial }
  })
  await expect(configureDeployMiddleware(deployModule, scanned.data, environment.data, {
    provider: { type: 'docker-ssh' },
  })).resolves.toMatchObject({ storage: 'custom' })
  expect(mocked.prompt.mock.calls.some(([question]) => question.message.startsWith('Bucket name only'))).toBe(true)
})

it.each([
  {
    service: 'db',
    backend: 'postgresql',
    scheme: 'postgresql',
    port: 5432,
    path: 'new%20database',
    database: 'new database',
  },
  {
    service: 'db',
    backend: 'mysql',
    scheme: 'mysql',
    port: 3306,
    path: 'new_database',
  },
  {
    service: 'cache',
    backend: 'redis',
    scheme: 'rediss',
    port: 6379,
    path: '3',
  },
  {
    service: 'vecdb',
    backend: 'pgvector',
    scheme: 'postgres',
    port: 5432,
    path: 'vectors',
    database: 'vectors',
  },
] as const)('自定义 $backend 在 URL 和分字段之间切换并保留其他配置', async ({ service, backend, scheme, port, path, ...expected }) => {
  const envPrefix = `HAI_${service.toUpperCase()}`
  const configFile = join(root, 'config', `_${service}.yml`)
  const legacyFile = join(root, '.env.local')
  const publicFile = join(root, '.env.test')
  const privateFile = join(root, '.env.test.local')
  const legacy = `${envPrefix}_HOST=legacy.example.test\n`
  const address = `${scheme}://service.example.test:${port}`
  const url = `${scheme}://fixture-user:fixture-secret@service.example.test:${port}/${path}`
  const retained = {
    operationLog: { write: true },
  }
  fixture({
    type: backend,
    host: 'old.example.test',
    port,
    password: 'old',
    ...(service === 'cache'
      ? { db: 5 }
      : { database: 'old', user: 'old' }),
    ...retained,
  }, service)
  writeFileSync(publicFile, `${envPrefix}_TYPE=${backend}\n${envPrefix}_PORT=${port}\n`)
  writeFileSync(privateFile, `${envPrefix}_PASSWORD=old-private\n`)
  writeFileSync(legacyFile, legacy)

  const scan = await deployModule.deploy.scan(root, { environment: 'test' })
  const environment = deployModule.loadDeploymentEnvironment({ environment: 'test', envDir: root })
  if (!scan.success || !environment.success)
    throw new Error('Could not load legacy middleware fixture')
  const provider = {
    provider: { type: 'docker-ssh' },
  }
  const output = vi.spyOn(cliUtils, 'writeCliMessage').mockImplementation(() => {})
  mocked.prompt.mockImplementation(async (question) => {
    if (question.choices) {
      const choice = question.choices.find((item: { value: string }) => ['custom', 'url'].includes(item.value))
      return { value: choice?.value ?? backend }
    }
    if (question.message.startsWith('Connection URL')) {
      expect(question.type).toBe('password')
      expect(question.validate('https://fixture-secret@invalid.example.test')).toContain(`${envPrefix}_URL`)
      expect(question.validate('https://fixture-secret@invalid.example.test')).not.toContain('fixture-secret')
      return { value: url }
    }
    return { value: question.initial }
  })
  await expect(configureDeployMiddleware(deployModule, scan.data, environment.data, provider)).resolves.toMatchObject({ [service]: 'custom' })
  const saved = deployModule.loadDeploymentEnvironment({ environment: 'test', envDir: root })
  if (!saved.success)
    throw new Error('Could not load URL configuration')
  const config = deployModule.loadDeploymentConfig(service, configFile, saved.data.values)
  expect(config).toMatchObject({
    success: true,
    data: {
      type: backend,
      url,
      ...expected,
      ...retained,
    },
  })
  expect(config.success && config.data).not.toHaveProperty('host')
  const persisted = `${readFileSync(publicFile, 'utf8')}\n${readFileSync(privateFile, 'utf8')}`
  for (const field of [
    'HOST',
    'PORT',
    'USER',
    'PASSWORD',
    'DB',
  ])
    expect(persisted).not.toContain(`${envPrefix}_${field}=`)
  expect(readFileSync(publicFile, 'utf8')).not.toContain('fixture-secret')
  expect(readFileSync(privateFile, 'utf8')).toContain(url)
  const transcript = output.mock.calls.map(([message]) => message).join('\n')
  expect(transcript).toContain(address)
  expect(transcript).not.toMatch(/fixture-user|fixture-secret/)

  const rescanned = await deployModule.deploy.scan(root, { environment: 'test' })
  if (!rescanned.success)
    throw new Error('Could not rescan URL configuration')
  await expect(configureDeployMiddleware(deployModule, rescanned.data, saved.data, provider, true)).resolves.toMatchObject({ [service]: 'keep' })
  mocked.prompt.mockImplementation(async (question) => {
    if (question.choices) {
      const choice = question.choices.find((item: { value: string }) => ['custom', 'fields'].includes(item.value))
      return { value: choice?.value ?? backend }
    }
    expect(question.message).not.toMatch(/^Connection URL/)
    return { value: question.initial }
  })
  await configureDeployMiddleware(deployModule, rescanned.data, saved.data, provider)
  const fields = deployModule.loadDeploymentEnvironment({ environment: 'test', envDir: root })
  if (!fields.success)
    throw new Error('Could not load field configuration')
  expect(fields.data.values).not.toHaveProperty(`${envPrefix}_URL`)
  expect(fields.data.values).toHaveProperty(`${envPrefix}_HOST`, 'localhost')
  expect(readFileSync(legacyFile, 'utf8')).toBe(legacy)
})
