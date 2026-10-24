import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { deploy } from '../src/deploy-main.js'

describe('deploy.scan', () => {
  it.each([
    { entry: '.', name: 'orders-serv', expected: 'orders-serv' },
    { entry: 'apps/orders-service', name: 'orders', expected: 'orders' },
    { entry: 'packages/orders-serv', name: undefined, expected: undefined },
    { entry: 'packages/orders-serv', name: '   ', expected: undefined },
  ])('工程命名独立于扫描入口，缺少名称回退工程根目录 ($entry, $name)', async ({ entry, name, expected }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hai-deploy-project-name-'))
    try {
      const app = path.join(root, entry)
      fs.mkdirSync(app, { recursive: true })
      fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), stringify({ lockfileVersion: '9.0', importers: { '.': {}, [entry]: {} } }))
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name }))
      if (entry !== '.')
        fs.writeFileSync(path.join(app, 'package.json'), '{"name":"irrelevant-service-name"}')
      expect(await deploy.scan(app)).toMatchObject({ success: true, data: { appName: expected ?? path.basename(root), appDir: app } })
    }
    finally { fs.rmSync(root, { recursive: true, force: true }) }
  })

  it.each(['console', 'api'])('keeps email and SMS %s providers distinct without dropping repeated email backends', async (type) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hai-deploy-reach-channels-'))
    try {
      fs.mkdirSync(path.join(root, 'config'))
      fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies: { '@h-ai/reach': { version: '1' } } } }, packages: { '@h-ai/reach@1': {} }, snapshots: { '@h-ai/reach@1': {} } }))
      fs.writeFileSync(path.join(root, 'config/_reach.yml'), stringify({ providers: [
        { name: 'email', type: 'console' },
        { name: 'sms', type, ...(type === 'api' ? { url: 'https://sms.example.test/send' } : {}) },
        { name: 'marketing', type: 'smtp', host: 'smtp.example.test', from: 'sender@example.test' },
      ] }))
      const result = await deploy.scan(root)
      expect(result.success).toBe(true)
      if (!result.success)
        return
      expect(result.data.requiredServices).toEqual(['email', 'sms'])
      expect(result.data.middlewares).toMatchObject([
        { service: 'email', backend: 'console', envPrefix: 'HAI_REACH_PROVIDERS_0', config: { name: 'email' } },
        { service: 'sms', backend: type, envPrefix: 'HAI_REACH_PROVIDERS_1', config: { name: 'sms' } },
        { service: 'email', backend: 'smtp', envPrefix: 'HAI_REACH_PROVIDERS_2', config: { name: 'marketing' } },
      ])
    }
    finally { fs.rmSync(root, { recursive: true, force: true }) }
  })

  it('follows every Hai component runtime edge, including indirect AI/payment/scheduler dependencies', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hai-deploy-components-'))
    try {
      const edges: Record<string, string[]> = {
        'ai': ['api-contract', 'core', 'datapipe', 'reldb', 'vecdb'],
        'payment': ['audit', 'core'],
        'scheduler': ['cache', 'core', 'reldb'],
        'iam': ['audit', 'cache', 'core', 'crypto', 'reldb'],
        'reach': ['cache', 'core', 'reldb'],
        'audit': ['core', 'reldb'],
        'api-contract': ['core'],
        'datapipe': ['core'],
        'reldb': ['core'],
        'cache': ['core'],
        'vecdb': ['core'],
        'crypto': ['core'],
        'core': [],
      }
      const snapshots = Object.fromEntries(Object.entries(edges).map(([name, dependencies]) => [`@h-ai/${name}@1`, { dependencies: Object.fromEntries(dependencies.map(dependency => [`@h-ai/${dependency}`, '1'])) }]))
      const lock = { lockfileVersion: '9.0', importers: { '.': { dependencies: Object.fromEntries(['ai', 'payment', 'scheduler', 'iam', 'reach'].map(name => [`@h-ai/${name}`, { version: '1' }])) } }, packages: Object.fromEntries(Object.keys(snapshots).map(key => [key, {}])), snapshots }
      fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), stringify(lock))
      const result = await deploy.scan(root)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.haiModules).toEqual(Object.keys(edges).map(name => `@h-ai/${name}`).sort())
        expect(result.data.requiredServices).toEqual(['db', 'cache', 'vecdb', 'ldap', 'email'])
      }
    }
    finally { fs.rmSync(root, { recursive: true, force: true }) }
  })

  it('requires a lockfile and reads build adapters from its importer without project metadata', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hai-deploy-lock-only-'))
    try {
      expect((await deploy.scan(root)).success).toBe(false)
      fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), stringify({ lockfileVersion: '9.0', importers: { '.': { devDependencies: { '@sveltejs/kit': { version: '2' }, '@sveltejs/adapter-node': { version: '5' } } } }, packages: {}, snapshots: {} }))
      expect(await deploy.scan(root)).toMatchObject({ success: true, data: { isSvelteKit: true, nodeAdapterInstalled: true, adapterInstalled: false, requiredServices: [] } })
    }
    finally { fs.rmSync(root, { recursive: true, force: true }) }
  })

  it('walks only the selected importer runtime graph, excluding peers, dev dependencies and other workspaces', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hai-deploy-lock-'))
    const app = path.join(root, 'apps/service')
    try {
      fs.mkdirSync(path.join(app, 'config'), { recursive: true })
      fs.writeFileSync(path.join(app, 'config/_vecdb.yml'), 'type: qdrant\nurl: http://unused:6333\n')
      const lock = {
        lockfileVersion: '9.0',
        importers: {
          'apps/service': { dependencies: { '@project/business': { version: 'link:../../packages/business' } }, devDependencies: { '@h-ai/cache': { version: '1' } } },
          'packages/business': { dependencies: { '@h-ai/serv': { version: '1(@h-ai/ai@1)' }, '@h-ai/iam': { version: '1' } } },
          'apps/other': { dependencies: { '@h-ai/vecdb': { version: '1' } } },
        },
        packages: {
          '@h-ai/serv@1': { peerDependencies: { '@h-ai/ai': '1' }, peerDependenciesMeta: { '@h-ai/ai': { optional: true } } },
          '@h-ai/iam@1': {},
          '@h-ai/reldb@1': {},
          '@h-ai/ai@1': {},
          '@h-ai/vecdb@1': {},
          '@h-ai/cache@1': {},
        },
        snapshots: {
          '@h-ai/serv@1(@h-ai/ai@1)': { dependencies: { '@h-ai/ai': '1' } },
          '@h-ai/iam@1': { dependencies: { '@h-ai/reldb': '1' } },
          '@h-ai/reldb@1': {},
          '@h-ai/ai@1': { dependencies: { '@h-ai/vecdb': '1' } },
          '@h-ai/vecdb@1': {},
          '@h-ai/cache@1': {},
        },
      }
      // 工具链文档同样有 importer，不能误选为应用图。
      fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), `---\n${stringify({ lockfileVersion: '9.0', importers: { '.': {} } })}---\n${stringify(lock)}`)
      const result = await deploy.scan(app)
      expect(result.success).toBe(true)
      if (result.success)
        expect(result.data.requiredServices).toEqual(['db', 'ldap'])
      Reflect.deleteProperty(lock.snapshots['@h-ai/iam@1'].dependencies, '@h-ai/reldb')
      fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), stringify(lock))
      const withoutDb = await deploy.scan(app)
      expect(withoutDb.success).toBe(true)
      if (withoutDb.success)
        expect(withoutDb.data.requiredServices).toEqual(['ldap'])
    }
    finally { fs.rmSync(root, { recursive: true, force: true }) }
  })

  it('fails on an existing lockfile without the target importer instead of guessing dependencies', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hai-deploy-stale-lock-'))
    try {
      fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\nimporters:\n  apps/other: {}\n')
      expect((await deploy.scan(root)).success).toBe(false)
    }
    finally { fs.rmSync(root, { recursive: true, force: true }) }
  })

  it('uses the application document when pnpm 12 has two root importers', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hai-deploy-root-lock-'))
    try {
      const tools = { lockfileVersion: '9.0', importers: { '.': { packageManagerDependencies: { pnpm: { version: '12' } } } } }
      const app = { lockfileVersion: '9.0', importers: { '.': { dependencies: { 'db-alias': { version: '@h-ai/reldb@1' } } } }, packages: { '@h-ai/reldb@1': {} }, snapshots: { '@h-ai/reldb@1': {} } }
      fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), `---\n${stringify(tools)}---\n${stringify(app)}`)
      const result = await deploy.scan(root)
      expect(result.success).toBe(true)
      // 别名同样使用实际包名识别模块。
      if (result.success)
        expect(result.data.requiredServices).toContain('db')
    }
    finally { fs.rmSync(root, { recursive: true, force: true }) }
  })

  it('resolves backend placeholders and optional IAM LDAP using the selected environment', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hai-deploy-selected-env-'))
    try {
      fs.mkdirSync(path.join(root, 'config'))
      fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), stringify({ lockfileVersion: '9.0', importers: { '.': { dependencies: { '@h-ai/iam': { version: '1' }, '@h-ai/reldb': { version: '1' }, '@h-ai/cache': { version: '1' } } } }, packages: { '@h-ai/iam@1': {}, '@h-ai/reldb@1': {}, '@h-ai/cache@1': {} }, snapshots: { '@h-ai/iam@1': {}, '@h-ai/reldb@1': {}, '@h-ai/cache@1': {} } }))
      fs.writeFileSync(path.join(root, '.env.prod'), 'HAI_DB_TYPE=postgresql\nHAI_CACHE_TYPE=redis\nHAI_IAM_LOGIN_LDAP=true\n')
      fs.writeFileSync(path.join(root, 'config/_db.yml'), `type: \${HAI_DB_TYPE:sqlite}\ndatabase: app\n`)
      fs.writeFileSync(path.join(root, 'config/_cache.yml'), `type: \${HAI_CACHE_TYPE:memory}\n`)
      fs.writeFileSync(path.join(root, 'config/_iam.yml'), `login:\n  ldap: \${HAI_IAM_LOGIN_LDAP:false}\nldap:\n  url: ldap://directory:389\n`)
      const result = await deploy.scan(root, { environment: 'prod' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.serviceBackends).toMatchObject({ db: 'postgresql', cache: 'redis', ldap: 'ldap' })
        expect(result.data.requiredServices).toEqual(expect.arrayContaining(['db', 'cache', 'ldap']))
        expect(result.data.middlewares?.find(item => item.service === 'ldap')).toMatchObject({ envPrefix: 'HAI_IAM_LDAP', config: { url: 'ldap://directory:389' } })
      }
    }
    finally { fs.rmSync(root, { recursive: true, force: true }) }
  })
})
