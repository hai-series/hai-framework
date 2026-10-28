import { describe, expect, it } from 'vitest'
import { createBackendStateAssets } from '../src/container/deploy-backend-state.js'
import { createManagedSecretAssets } from '../src/container/deploy-managed-secrets.js'

type Compose = Parameters<typeof createBackendStateAssets>[1]

function databaseCompose(service: Record<string, unknown> = {}, volumes: Record<string, unknown> = { data: null }): Compose {
  return {
    services: { db: { image: 'postgres:16-alpine', volumes: ['data:/var/lib/postgresql/data'], ...service } },
    volumes,
  }
}

describe('部署包后端状态资产', () => {
  it('使用实际命名卷生成三列身份，与托管凭据共享默认、显式和外部卷规则且不携带环境秘密', () => {
    const syntheticSecret = 'SYNTHETIC_BACKEND_SECRET_1234567'
    const compose: Compose = {
      services: {
        db: {
          image: 'registry.example.test:5000/platform/postgres:16-alpine',
          env_file: ['middleware-runtime.env'],
          environment: { POSTGRES_PASSWORD: syntheticSecret },
          volumes: ['db-data:/var/lib/postgresql/data', './bootstrap:/docker-entrypoint-initdb.d:ro', 'db-data:/backup'],
        },
        storage: {
          image: 'quay.io/minio/minio:RELEASE.test',
          env_file: ['middleware-runtime.env'],
          environment: { MINIO_ROOT_PASSWORD: syntheticSecret },
          volumes: ['storage-data:/data'],
        },
        vecdb: {
          image: 'qdrant/qdrant:v1.16.0',
          env_file: ['middleware-runtime.env'],
          volumes: ['vector-data:/qdrant/storage'],
        },
        web: { image: 'example/web:test', environment: { PRIVATE_TOKEN: syntheticSecret } },
      },
      volumes: {
        'db-data': null,
        'storage-data': { name: 'shared-storage-production', external: true },
        'vector-data': { external: true },
      },
    }
    const assets = createBackendStateAssets('shop-prod', compose, ['db', 'storage', 'vecdb', 'web'])
    expect(assets['state-backends']).toBe([
      'db postgresql hai-shop-prod_db-data',
      'storage minio shared-storage-production',
      'vecdb qdrant vector-data',
      '',
    ].join('\n'))

    const managed = createManagedSecretAssets('shop-prod', `POSTGRES_PASSWORD=${syntheticSecret}\nMINIO_ROOT_PASSWORD=${syntheticSecret}\n`, compose)
    const stateVolumes = assets['state-backends']!.trim().split('\n').map(row => row.split(' ')[2]).sort()
    const managedVolumes = managed['managed-volumes']!.trim().split('\n').map(row => row.split(' ')[1]).sort()
    expect(stateVolumes).toEqual(managedVolumes)
    expect(Object.values(assets).join('\n')).not.toContain(syntheticSecret)
  })

  it('为 MySQL、RustFS 和 pgvector 组合保留各自后端家族', () => {
    const assets = createBackendStateAssets('shop-test', {
      services: {
        db: { image: 'mysql:8.4', volumes: ['mysql-data:/var/lib/mysql'] },
        storage: { image: 'rustfs/rustfs:1.0.0', volumes: ['objects:/data'] },
        vecdb: { image: 'pgvector/pgvector:pg16', volumes: ['vectors:/var/lib/postgresql/data'] },
      },
      volumes: { 'mysql-data': null, 'objects': null, 'vectors': null },
    }, ['db', 'storage', 'vecdb'])
    expect(assets['state-backends']).toBe('db mysql hai-shop-test_mysql-data\nstorage rustfs hai-shop-test_objects\nvecdb pgvector hai-shop-test_vectors\n')
  })

  it('只更新 Chroma 时不检查未选服务，也不把应用服务加入有状态清单', () => {
    const assets = createBackendStateAssets('shop-test', {
      services: {
        db: { image: 'unsupported:latest' },
        storage: {},
        vecdb: { image: 'chromadb/chroma:1.0.0', volumes: ['vectors:/data'] },
      },
      volumes: { vectors: null },
    }, ['vecdb', 'serv'])
    expect(assets['state-backends']).toBe('vecdb chroma hai-shop-test_vectors\n')
  })

  it('无状态增量包不生成后端身份行', () => {
    const assets = createBackendStateAssets('shop-test', { services: { web: { image: 'example/web:test' } } }, ['web'])
    expect(assets['state-backends']).toBe('')
  })

  it.each([
    { scenario: '只有绑定目录，无法确认实际命名卷', compose: databaseCompose({ volumes: ['./local:/var/lib/postgresql/data'] }) },
    { scenario: '同一后端绑定两个不同命名卷', compose: databaseCompose({ volumes: ['data:/data', 'archive:/archive'] }, { data: null, archive: null }) },
    { scenario: '选中后端的镜像家族未知', compose: databaseCompose({ image: 'example/mariadb:11' }) },
    { scenario: '镜像家族与服务角色不匹配', compose: databaseCompose({ image: 'qdrant/qdrant:v1' }) },
    { scenario: '选中服务没有镜像', compose: databaseCompose({ image: undefined }) },
    { scenario: '选中服务不存在', compose: { services: {}, volumes: { data: null } } },
  ])('$scenario 时拒绝生成资产', ({ compose }) => {
    expect(() => createBackendStateAssets('shop-test', compose, ['db'])).toThrow(Error)
  })

  it('不同声明指向同一实际卷时拒绝让两个后端共用数据目录', () => {
    const compose: Compose = {
      services: {
        db: { image: 'postgres:16', volumes: ['db-data:/var/lib/postgresql/data'] },
        vecdb: { image: 'qdrant/qdrant:v1', volumes: ['vector-data:/qdrant/storage'] },
      },
      volumes: { 'db-data': { name: 'shared-real-volume' }, 'vector-data': { name: 'shared-real-volume' } },
    }
    expect(() => createBackendStateAssets('shop-test', compose, ['db', 'vecdb'])).toThrow(Error)
  })

  it.each(['shop prod', '../shop', 'shop\'; touch injected', 'shop\nprod', '商城-prod'])('项目名 %j 无法安全嵌入资产时拒绝生成', (projectName) => {
    expect(() => createBackendStateAssets(projectName, databaseCompose(), ['db'])).toThrow(Error)
  })

  it('实际卷名不能含路径、空白或 shell 语法', () => {
    for (const volumeName of ['../data', 'data volume', 'data;echo-injected', 'data\nother']) {
      expect(() => createBackendStateAssets('shop-test', databaseCompose({}, { data: { name: volumeName } }), ['db'])).toThrow(Error)
    }
  })
})
