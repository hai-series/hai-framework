/**
 * =============================================================================
 * @h-ai/deploy - 容器编排生成测试
 * =============================================================================
 *
 * 验证 compose 生成按所选功能（db/cache/storage）追加 sidecar 服务，
 * 并正确注入 HAI_DB / HAI_CACHE / HAI_STORAGE 覆盖变量、敏感值不入 compose。
 */

import type { ScanResult } from '../src/deploy-types.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import {
  buildRuntimeEnv,
  generateApplicationProxyConfig,
  generateComposeFile,
  generateWebProxyConfig,
  serializeEnvFile,
} from '../src/container/deploy-container-compose.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hai-deploy-compose-'))
})

afterEach(() => {
  if (path.dirname(tmpDir) !== os.tmpdir() || !path.basename(tmpDir).startsWith('hai-deploy-compose-'))
    throw new Error('Unexpected compose fixture cleanup path')
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function makeScan(
  requiredServices: ScanResult['requiredServices'],
  serviceBackends: ScanResult['serviceBackends'] = {},
): ScanResult {
  return {
    appName: 'demo',
    isSvelteKit: true,
    adapterInstalled: false,
    nodeAdapterInstalled: true,
    requiredServices,
    serviceBackends,
  }
}

describe('buildRuntimeEnv 按功能追加 sidecar', () => {
  it('自建 S3 保留公开访问和对象命名配置，只替换内部连接与托管凭据', () => {
    const scan = makeScan(['storage'], { storage: 's3' })
    scan.middlewares = [{ service: 'storage', backend: 's3', source: '_storage.yml', configName: 'storage', configPath: [], envPrefix: 'HAI_STORAGE', config: { type: 's3', bucket: 'business-files', region: 'us-west-2', prefix: 'private', publicEndpoint: 'https://files.example.com', publicUrl: 'https://cdn.example.com/public', endpoint: 'http://old.internal', operationLog: { write: true } } }]
    const plan = buildRuntimeEnv(tmpDir, 'public-storage', scan, {}, 3000)
    expect(JSON.parse(plan.env.HAI_STORAGE)).toMatchObject({ bucket: 'business-files', region: 'us-west-2', prefix: 'private', publicEndpoint: 'https://files.example.com', publicUrl: 'https://cdn.example.com/public', operationLog: { write: true }, endpoint: 'http://storage:9000', forcePathStyle: true, createBucket: true })
  })
  it('模板尚未填写的桶/区域由默认自建模式补齐，不将空字符串当成已配置桶', () => {
    const scan = makeScan(['storage'], { storage: 's3' })
    scan.middlewares = [{ service: 'storage', backend: 's3', source: '_storage.yml', configName: 'storage', configPath: [], envPrefix: 'HAI_STORAGE', config: { type: 's3', bucket: '', region: '' } }]
    expect(JSON.parse(buildRuntimeEnv(tmpDir, 'defaults', scan, {}, 3000).env.HAI_STORAGE)).toMatchObject({ bucket: 'hai', region: 'us-east-1' })
  })
  it('sidecar 和云开通的整体配置清除被替换的旧叶配置，保留其它业务变量', () => {
    const { env } = buildRuntimeEnv(tmpDir, 'override', makeScan(['cache', 'storage']), { HAI_STORAGE: '{"type":"s3","endpoint":"https://external.example"}' }, 3000, {}, {
      HAI_CACHE_TYPE: 'memory',
      HAI_CACHE_URL: 'redis://old.example',
      HAI_STORAGE_TYPE: 'local',
      HAI_STORAGE_PATH: '/old',
      APP_LABEL: 'retain',
      APP_LABEL_DETAIL: 'also-retain',
    })
    expect(JSON.parse(env.HAI_CACHE)).toEqual({ type: 'redis', url: 'redis://cache:6379' })
    expect(JSON.parse(env.HAI_STORAGE)).toMatchObject({ type: 's3', endpoint: 'https://external.example' })
    for (const name of ['HAI_CACHE_TYPE', 'HAI_CACHE_URL', 'HAI_STORAGE_TYPE', 'HAI_STORAGE_PATH'])
      expect(env).not.toHaveProperty(name)
    expect(env).toMatchObject({ APP_LABEL: 'retain', APP_LABEL_DETAIL: 'also-retain' })
  })

  it('中间件原生变量仅用于容器，不进入应用环境或框架配置', () => {
    const { env, sidecar } = buildRuntimeEnv(tmpDir, 'isolated', makeScan(['db', 'storage', 'ldap'], { db: 'postgresql', storage: 's3', ldap: 'ldap' }), {}, 3000, { environment: 'test' }, { POSTGRES_DB: 'legacy', RUSTFS_ADDRESS: 'legacy', APP_LABEL: 'retained' })
    expect(env).not.toHaveProperty('POSTGRES_USER')
    expect(env).not.toHaveProperty('POSTGRES_DB')
    expect(env).not.toHaveProperty('RUSTFS_ADDRESS')
    expect(env).not.toHaveProperty('LDAP_ADMIN_PASSWORD')
    expect(env.APP_LABEL).toBe('retained')
    expect(Object.keys(sidecar.env).every(name => name.startsWith('HAI_'))).toBe(true)
    const compose = parse(generateComposeFile({ projectName: 'isolated', appVersion: '1.0.0', imageRef: 'app:1', hostPort: 3000, containerPort: 3000, sidecar }))
    expect(compose.services.serv.env_file).toEqual(['.env.runtime'])
    for (const service of ['db', 'storage', 'ldap'])
      expect(compose.services[service].env_file).toEqual(['middleware-runtime.env'])
    expect(compose).not.toHaveProperty('services.db.environment.POSTGRES_PASSWORD')
  })
  it('does not create middleware credentials when every service is kept unchanged', () => {
    const scan = makeScan(['db', 'cache', 'storage'], { db: 'postgresql', cache: 'redis', storage: 's3' })
    const { sidecar } = buildRuntimeEnv(tmpDir, 'direct', scan, {}, 3000, { serviceModes: { db: 'keep', cache: 'keep', storage: 'keep' } })
    expect(sidecar.services).toEqual([])
    expect(fs.existsSync(path.join(tmpDir, '.hai'))).toBe(false)
  })
  it('handles SMTP providers independently and leaves kept/HTTP providers unchanged', () => {
    const scan = makeScan(['email'], { email: 'api' })
    scan.middlewares = ['console', 'smtp', 'smtp', 'api'].map((backend, index) => ({ service: 'email', backend, source: '@h-ai/reach', configName: 'reach', configPath: ['providers', String(index)], envPrefix: `HAI_REACH_PROVIDERS_${index}`, config: { name: `provider-${index}`, type: backend } }))
    const { sidecar } = buildRuntimeEnv(tmpDir, 'multiple', scan, {}, 3000, { serviceModes: { HAI_REACH_PROVIDERS_0: 'keep', HAI_REACH_PROVIDERS_1: 'default', HAI_REACH_PROVIDERS_2: 'keep', HAI_REACH_PROVIDERS_3: 'custom' } })
    expect(sidecar.services).toEqual(['email'])
    expect(Object.keys(sidecar.env)).toEqual(['HAI_REACH_PROVIDERS_1'])
    expect(JSON.parse(sidecar.env.HAI_REACH_PROVIDERS_1)).toMatchObject({ name: 'provider-1', type: 'smtp', host: 'email' })
  })
  it('respects custom/keep choices and local backend semantics', () => {
    const { sidecar } = buildRuntimeEnv(tmpDir, 'local', makeScan(['db', 'cache', 'storage'], { db: 'postgresql', cache: 'memory', storage: 'local' }), {}, 3000, { serviceModes: { db: 'custom', storage: 'keep' } })
    expect(sidecar.services).toEqual([])
    expect(sidecar.composeServices).toEqual({})
  })

  it('adds LDAP/SMTP containers with matching connection configuration', () => {
    const { env, sidecar } = buildRuntimeEnv(tmpDir, 'directory', makeScan(['ldap', 'email'], { ldap: 'ldap', email: 'smtp' }), {}, 3000)
    expect(sidecar.services).toEqual(['ldap', 'email'])
    expect(JSON.parse(env.HAI_IAM_LDAP)).toMatchObject({ url: 'ldap://ldap:389', bindDn: 'cn=admin,dc=example,dc=org' })
    expect(sidecar.containerEnv.LDAP_ADMIN_PASSWORD).toBeTruthy()
    expect(JSON.parse(env.HAI_REACH_PROVIDERS_0)).toMatchObject({ type: 'smtp', host: 'email', port: 1025, secure: false })
    const compose = generateComposeFile({ appVersion: '1.2.3', projectName: 'directory', imageRef: 'test', hostPort: 3000, containerPort: 3000, sidecar })
    expect(compose).not.toContain(sidecar.containerEnv.LDAP_ADMIN_PASSWORD)
  })

  it('启用 db 时追加 postgres 服务并注入 HAI_DB', () => {
    const { env, sidecar } = buildRuntimeEnv(tmpDir, 'demo', makeScan(['db']), {}, 3000)

    expect(sidecar.services).toContain('db')
    expect(sidecar.composeServices.db).toBeDefined()
    expect((sidecar.composeServices.db as { image: string }).image).toBe('docker.io/library/postgres:16.15-alpine')
    expect(sidecar.dependsOn).toContain('db')
    expect(sidecar.volumes['demo-db-data']).toBeDefined()

    expect(sidecar.containerEnv.POSTGRES_USER).toBe('hai')
    expect(sidecar.containerEnv.POSTGRES_DB).toBe('hai')
    expect(sidecar.containerEnv.POSTGRES_PASSWORD).toBeTruthy()
    const haiDb = JSON.parse(env.HAI_DB) as { type: string, url: string }
    expect(haiDb.type).toBe('postgresql')
    expect(haiDb.url).toContain('@db:5432/hai')
  })

  it('启用 cache 时追加 redis 服务并注入 HAI_CACHE', () => {
    const { env, sidecar } = buildRuntimeEnv(tmpDir, 'demo', makeScan(['cache']), {}, 3000)

    expect(sidecar.services).toContain('cache')
    expect((sidecar.composeServices.cache as { image: string }).image).toBe('docker.io/library/redis:7.4.11-alpine')
    const haiCache = JSON.parse(env.HAI_CACHE) as { type: string, url: string }
    expect(haiCache.type).toBe('redis')
    expect(haiCache.url).toBe('redis://cache:6379')
  })

  it.each(['rustfs', 'minio'] as const)('启用 S3 时生成 %s 服务及幂等存储桶初始化', (engine) => {
    const { env, sidecar } = buildRuntimeEnv(tmpDir, 'demo', makeScan(['storage']), {}, 3000, undefined, {}, engine)

    expect(sidecar.services).toContain('storage')
    expect((sidecar.composeServices.storage as { image: string }).image).toContain(engine === 'rustfs' ? 'ghcr.io/rustfs/rustfs:1.0.1' : 'ghcr.io/coollabsio/minio:RELEASE')
    expect(sidecar.composeServices['storage-init']).toBeUndefined()
    const haiStorage = JSON.parse(env.HAI_STORAGE) as { type: string, endpoint: string, bucket: string }
    expect(haiStorage.type).toBe('s3')
    expect(haiStorage.endpoint).toBe('http://storage:9000')
    expect(haiStorage.bucket).toBe('hai')
    for (const name of Object.keys(sidecar.containerEnv))
      expect(env).not.toHaveProperty(name)
  })

  it('启用 db(mysql) 时追加 mysql 服务并注入 mysql 版 HAI_DB', () => {
    const { env, sidecar } = buildRuntimeEnv(tmpDir, 'demo', makeScan(['db'], { db: 'mysql' }), {}, 3000)

    expect(sidecar.services).toContain('db')
    expect((sidecar.composeServices.db as { image: string }).image).toContain('mysql')
    expect(sidecar.containerEnv.MYSQL_DATABASE).toBe('hai')
    expect(sidecar.containerEnv.MYSQL_PASSWORD).toBeTruthy()
    expect(env).not.toHaveProperty('MYSQL_PASSWORD')
    const haiDb = JSON.parse(env.HAI_DB) as { type: string, url: string }
    expect(haiDb.type).toBe('mysql')
    expect(haiDb.url).toContain('@db:3306/hai')
  })

  it('启用 db(sqlite) 时不追加数据库 sidecar，仅持久化数据卷', () => {
    const { env, sidecar } = buildRuntimeEnv(tmpDir, 'demo', makeScan(['db'], { db: 'sqlite' }), {}, 3000)

    expect(sidecar.services).not.toContain('db')
    expect(sidecar.composeServices.db).toBeUndefined()
    expect(env.HAI_DB).toBeUndefined()
    expect(sidecar.appVolumes).toContain('demo-data:/app/data')
  })

  it('启用 vecdb(qdrant) 时追加 qdrant 服务并注入 HAI_VECDB', () => {
    const { env, sidecar } = buildRuntimeEnv(tmpDir, 'demo', makeScan(['vecdb'], { vecdb: 'qdrant' }), {}, 3000)

    expect(sidecar.services).toContain('vecdb')
    expect((sidecar.composeServices.vecdb as { image: string }).image).toContain('qdrant')
    const haiVecdb = JSON.parse(env.HAI_VECDB) as { type: string, url: string }
    expect(haiVecdb.type).toBe('qdrant')
    expect(haiVecdb.url).toBe('http://vecdb:6333')
  })

  it('启用 vecdb(pgvector) 时追加 pgvector 服务并注入 HAI_VECDB', () => {
    const { env, sidecar } = buildRuntimeEnv(tmpDir, 'demo', makeScan(['vecdb'], { vecdb: 'pgvector' }), {}, 3000)

    expect(sidecar.services).toContain('vecdb')
    expect((sidecar.composeServices.vecdb as { image: string }).image).toContain('pgvector')
    const haiVecdb = JSON.parse(env.HAI_VECDB) as { type: string, url: string }
    expect(haiVecdb.type).toBe('pgvector')
    expect(haiVecdb.url).toContain('@vecdb:5432/hai')
  })

  it('云 Provisioner 已提供 HAI_DB 时不再追加 db sidecar', () => {
    const provisionEnv = { HAI_DB: JSON.stringify({ type: 'postgresql', url: 'postgresql://cloud', database: 'x' }) }
    const { env, sidecar } = buildRuntimeEnv(tmpDir, 'demo', makeScan(['db']), provisionEnv, 3000)

    expect(sidecar.services).not.toContain('db')
    expect(sidecar.composeServices.db).toBeUndefined()
    // Provisioner 输出优先
    expect(JSON.parse(env.HAI_DB).url).toBe('postgresql://cloud')
  })

  it('注入框架默认环境（HOST/PORT/NODE_ENV）', () => {
    const { env } = buildRuntimeEnv(tmpDir, 'demo', makeScan([]), {}, 3000)
    expect(env.NODE_ENV).toBe('production')
    expect(env.HOST).toBe('0.0.0.0')
    expect(env.PORT).toBe('3000')
  })

  it.each([
    ['dev', 'development'],
    ['development', 'development'],
    ['test', 'test'],
    ['prod', 'production'],
    ['production', 'production'],
    ['staging', 'production'],
  ])('目标环境 %s 默认使用 NODE_ENV=%s', (environment, nodeEnv) => {
    const { env } = buildRuntimeEnv(tmpDir, 'demo', makeScan([]), {}, 3000, { environment })
    expect(env.NODE_ENV).toBe(nodeEnv)
  })

  it('未传选项时读取部署标记，显式应用 NODE_ENV 仍可覆盖默认值', () => {
    const fromMarker = buildRuntimeEnv(tmpDir, 'demo', makeScan([]), {}, 3000, undefined, { HAI_DEPLOY_ENVIRONMENT: 'test' })
    expect(fromMarker.env.NODE_ENV).toBe('test')
    const explicit = buildRuntimeEnv(tmpDir, 'demo', makeScan([]), {}, 3000, { environment: 'test' }, { NODE_ENV: 'production' })
    expect(explicit.env.NODE_ENV).toBe('production')
  })

  it('多功能同时启用时并存', () => {
    const { sidecar } = buildRuntimeEnv(tmpDir, 'demo', makeScan(['db', 'cache', 'storage']), {}, 3000)
    expect(sidecar.services).toEqual(expect.arrayContaining(['db', 'cache', 'storage']))
  })

  it('email/sms 不生成 sidecar', () => {
    const { sidecar } = buildRuntimeEnv(tmpDir, 'demo', makeScan(['email', 'sms']), {}, 3000)
    expect(sidecar.services).toHaveLength(0)
  })

  it('不同打包次数生成独立候选，不依赖打包机长期缓存', () => {
    const first = buildRuntimeEnv(tmpDir, 'demo', makeScan(['db']), {}, 3000)
    const second = buildRuntimeEnv(tmpDir, 'demo', makeScan(['db']), {}, 3000)
    expect(first.sidecar.containerEnv.POSTGRES_PASSWORD).toMatch(/^[\w-]{32}$/)
    expect(first.sidecar.containerEnv.POSTGRES_PASSWORD === second.sidecar.containerEnv.POSTGRES_PASSWORD).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, '.hai/deploy/runtime'))).toBe(false)
  })

  it('应用目录不存在时也能规划候选，不创建本地凭据状态', () => {
    const otherComputer = path.join(tmpDir, 'uncreated-computer')
    const result = buildRuntimeEnv(otherComputer, 'demo', makeScan(['db']), {}, 3000)
    expect(result.sidecar.containerEnv.POSTGRES_PASSWORD).toMatch(/^[\w-]{32}$/)
    expect(fs.existsSync(otherComputer)).toBe(false)
  })
})

describe('对象存储网关边界', () => {
  it('对象请求保持签名原文并关闭大文件缓冲和签名日志；SSR 路径原样转发', () => {
    const config = generateApplicationProxyConfig({ primaryService: 'web', port: 3000, bucket: 'business-files', reservedPaths: ['/portal', '/api/v1'] })
    expect(config).toContain('location ^~ /business-files/')
    expect(config).toContain('proxy_pass http://storage:9000;')
    expect(config).toContain('proxy_set_header Host $http_host;')
    expect(config).toContain('access_log off;')
    expect(config).toContain('error_log /dev/null;')
    expect(config).toContain('limit_except GET PUT OPTIONS { deny all; }')
    expect(config).toContain('client_max_body_size 0;')
    expect(config).toContain('proxy_pass http://web:3000;')
    expect(config).not.toContain('rewrite ')
  })

  it.each(['api', 'portal', 'health', '../private', 'files;return 200'])('提前拒绝桶名注入或与应用路由冲突：%s', (bucket) => {
    expect(() => generateApplicationProxyConfig({ primaryService: 'web', port: 3000, bucket, reservedPaths: ['/portal', '/api/v1'] })).toThrow()
  })
})

describe('generateComposeFile', () => {
  it('多服务使用 hai-app 网络且输出不含 YAML 锚点', () => {
    const { sidecar } = buildRuntimeEnv(tmpDir, 'demo', makeScan(['db', 'cache', 'storage']), {}, 3000)
    const content = generateComposeFile({ appVersion: '1.2.3', projectName: 'demo', imageRef: 'app:1', hostPort: 8080, containerPort: 3000, sidecar })
    expect(content).not.toMatch(/[&*]a\d+/)
    const compose = parse(content)
    expect(Object.keys(compose.networks)).toEqual(['hai-app'])
    for (const service of Object.values(compose.services) as Array<{ networks: string[] }>)
      expect(service.networks).toEqual(['hai-app'])
    expect(compose.services['storage-init']).toBeUndefined()
    expect(JSON.parse(sidecar.env.HAI_STORAGE).createBucket).toBe(true)
    expect(sidecar.env.HAI_STORAGE_CREATEBUCKET).toBe('true')
  })

  it('web 仅公开一个同源端口，不挂载 API 私有环境，代理保持自定义前缀及 SPA 刷新', () => {
    const { sidecar } = buildRuntimeEnv(tmpDir, 'demo', makeScan([]), {}, 3001)
    const compose = parse(generateComposeFile({ appVersion: '1.2.3', projectName: 'demo', imageRef: 'api:v1', hostPort: 18080, containerPort: 3001, sidecar, web: { imageRef: 'web:v1', containerPort: 8081 } }))
    expect(compose.services.serv.ports).toBeUndefined()
    expect(compose.services.web.ports).toEqual(['18080:8081'])
    expect(compose.services.web.env_file).toBeUndefined()
    const proxy = generateWebProxyConfig(3001, '/backend/v2', { webPort: 8081 })
    expect(proxy).toContain('listen 8081;')
    expect(proxy).toContain('location /backend/v2/')
    expect(proxy).toContain('proxy_pass http://serv:3001;')
    expect(proxy).toContain('client_max_body_size 2129920;')
    expect(proxy).toContain('large_client_header_buffers 4 32k;')
    expect(proxy).toContain('proxy_buffer_size 32k;')
    expect(proxy).toContain('proxy_buffers 8 32k;')
    expect(proxy).toContain('proxy_request_buffering off;')
    expect(proxy).toContain('try_files $uri $uri/ /index.html;')
    expect(() => generateWebProxyConfig(3001, '/api; injected')).toThrow()
  })
  it('生成 serv 服务并映射端口', () => {
    const { sidecar } = buildRuntimeEnv(tmpDir, 'demo', makeScan([]), {}, 3000)
    const compose = generateComposeFile({ appVersion: '1.2.3', projectName: 'demo', imageRef: 'hai-demo:20260922-abc', hostPort: 18080, containerPort: 3000, sidecar })
    expect(compose).toContain('image: hai-demo:20260922-abc')
    expect(compose).toContain('18080:3000')
    expect(parse(compose).networks).toEqual({ 'hai-app': {} })
  })

  it('serv 服务 depends_on 包含已启用 sidecar', () => {
    const { sidecar } = buildRuntimeEnv(tmpDir, 'demo', makeScan(['db', 'cache']), {}, 3000)
    const compose = generateComposeFile({ appVersion: '1.2.3', projectName: 'demo', imageRef: 'hai-demo:tag', hostPort: 18080, containerPort: 3000, sidecar })
    expect(compose).toContain('depends_on')
    expect(compose).toContain('postgres:16.15-alpine')
    expect(compose).toContain('redis:7.4.11-alpine')
  })

  it('compose 文件不包含敏感密码', () => {
    const { env, sidecar } = buildRuntimeEnv(tmpDir, 'demo', makeScan(['db', 'storage']), {}, 3000)
    const compose = generateComposeFile({ appVersion: '1.2.3', projectName: 'demo', imageRef: 'hai-demo:tag', hostPort: 18080, containerPort: 3000, sidecar })
    expect(sidecar.containerEnv.POSTGRES_PASSWORD.length).toBeGreaterThan(0)
    expect(compose).not.toContain(sidecar.containerEnv.POSTGRES_PASSWORD)
    expect(compose).not.toContain(JSON.parse(env.HAI_STORAGE).secretAccessKey)
  })
})

describe('serializeEnvFile', () => {
  it('序列化为 KEY=VALUE 行', () => {
    const content = serializeEnvFile({ A: '1', B: 'x=y' })
    expect(content).toContain('A=1')
    expect(content).toContain('B=x=y')
    expect(content.endsWith('\n')).toBe(true)
  })
})
