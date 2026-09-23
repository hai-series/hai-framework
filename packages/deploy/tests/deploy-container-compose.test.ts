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
import {
  buildRuntimeEnv,
  generateComposeFile,
  generateFallbackDockerfile,
  serializeEnvFile,
} from '../src/container/deploy-container-compose.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hai-deploy-compose-'))
})

afterEach(() => {
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
    buildCommand: 'vite build',
  }
}

describe('buildRuntimeEnv 按功能追加 sidecar', () => {
  it('启用 db 时追加 postgres 服务并注入 HAI_DB', () => {
    const { env, sidecar } = buildRuntimeEnv(tmpDir, 'demo', makeScan(['db']), {}, 3000)

    expect(sidecar.services).toContain('db')
    expect(sidecar.composeServices.db).toBeDefined()
    expect((sidecar.composeServices.db as { image: string }).image).toBe('postgres:16-alpine')
    expect(sidecar.dependsOn).toContain('db')
    expect(sidecar.volumes['demo-db-data']).toBeDefined()

    expect(env.POSTGRES_USER).toBe('hai')
    expect(env.POSTGRES_DB).toBe('hai')
    expect(env.POSTGRES_PASSWORD).toBeTruthy()
    const haiDb = JSON.parse(env.HAI_DB) as { type: string, url: string }
    expect(haiDb.type).toBe('postgresql')
    expect(haiDb.url).toContain('@db:5432/hai')
  })

  it('启用 cache 时追加 redis 服务并注入 HAI_CACHE', () => {
    const { env, sidecar } = buildRuntimeEnv(tmpDir, 'demo', makeScan(['cache']), {}, 3000)

    expect(sidecar.services).toContain('cache')
    expect((sidecar.composeServices.cache as { image: string }).image).toBe('redis:7-alpine')
    const haiCache = JSON.parse(env.HAI_CACHE) as { type: string, url: string }
    expect(haiCache.type).toBe('redis')
    expect(haiCache.url).toBe('redis://cache:6379')
  })

  it('启用 storage 时追加 minio 服务与初始化容器并注入 HAI_STORAGE', () => {
    const { env, sidecar } = buildRuntimeEnv(tmpDir, 'demo', makeScan(['storage']), {}, 3000)

    expect(sidecar.services).toContain('storage')
    expect((sidecar.composeServices.storage as { image: string }).image).toContain('minio/minio:RELEASE')
    expect(sidecar.composeServices['storage-init']).toBeDefined()
    const haiStorage = JSON.parse(env.HAI_STORAGE) as { type: string, endpoint: string, bucket: string }
    expect(haiStorage.type).toBe('s3')
    expect(haiStorage.endpoint).toBe('http://storage:9000')
    expect(haiStorage.bucket).toBe('hai')
  })

  it('启用 db(mysql) 时追加 mysql 服务并注入 mysql 版 HAI_DB', () => {
    const { env, sidecar } = buildRuntimeEnv(tmpDir, 'demo', makeScan(['db'], { db: 'mysql' }), {}, 3000)

    expect(sidecar.services).toContain('db')
    expect((sidecar.composeServices.db as { image: string }).image).toContain('mysql')
    expect(env.MYSQL_DATABASE).toBe('hai')
    expect(env.MYSQL_PASSWORD).toBeTruthy()
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

  it('多功能同时启用时并存', () => {
    const { sidecar } = buildRuntimeEnv(tmpDir, 'demo', makeScan(['db', 'cache', 'storage']), {}, 3000)
    expect(sidecar.services).toEqual(expect.arrayContaining(['db', 'cache', 'storage']))
  })

  it('email/sms 不生成 sidecar', () => {
    const { sidecar } = buildRuntimeEnv(tmpDir, 'demo', makeScan(['email', 'sms']), {}, 3000)
    expect(sidecar.services).toHaveLength(0)
  })

  it('重复调用复用稳定的 sidecar 凭据', () => {
    const first = buildRuntimeEnv(tmpDir, 'demo', makeScan(['db']), {}, 3000)
    const second = buildRuntimeEnv(tmpDir, 'demo', makeScan(['db']), {}, 3000)
    expect(first.env.POSTGRES_PASSWORD).toBe(second.env.POSTGRES_PASSWORD)
  })
})

describe('generateComposeFile', () => {
  it('生成 app 服务并映射端口', () => {
    const { sidecar } = buildRuntimeEnv(tmpDir, 'demo', makeScan([]), {}, 3000)
    const compose = generateComposeFile({
      projectName: 'demo',
      imageRef: 'hai-demo:20260922-abc',
      hostPort: 18080,
      containerPort: 3000,
      sidecar,
    })
    expect(compose).toContain('image: hai-demo:20260922-abc')
    expect(compose).toContain('18080:3000')
    expect(compose).toContain('name: hai-demo')
  })

  it('app 服务 depends_on 包含已启用 sidecar', () => {
    const { sidecar } = buildRuntimeEnv(tmpDir, 'demo', makeScan(['db', 'cache']), {}, 3000)
    const compose = generateComposeFile({
      projectName: 'demo',
      imageRef: 'hai-demo:tag',
      hostPort: 18080,
      containerPort: 3000,
      sidecar,
    })
    expect(compose).toContain('depends_on')
    expect(compose).toContain('postgres:16-alpine')
    expect(compose).toContain('redis:7-alpine')
  })

  it('compose 文件不包含敏感密码', () => {
    const { env, sidecar } = buildRuntimeEnv(tmpDir, 'demo', makeScan(['db', 'storage']), {}, 3000)
    const compose = generateComposeFile({
      projectName: 'demo',
      imageRef: 'hai-demo:tag',
      hostPort: 18080,
      containerPort: 3000,
      sidecar,
    })
    expect(env.POSTGRES_PASSWORD.length).toBeGreaterThan(0)
    expect(compose).not.toContain(env.POSTGRES_PASSWORD)
    expect(compose).not.toContain(env.MINIO_ROOT_PASSWORD)
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

describe('generateFallbackDockerfile', () => {
  it('生成 adapter-node 运行时 Dockerfile', () => {
    const dockerfile = generateFallbackDockerfile('demo', 3000)
    expect(dockerfile).toContain('pnpm --filter demo --prod deploy /prod/app')
    expect(dockerfile).toContain('CMD ["node", "build"]')
    expect(dockerfile).toContain('ENV PORT=3000')
  })
})
