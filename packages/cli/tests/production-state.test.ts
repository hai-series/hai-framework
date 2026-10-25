/** 实际创建/增量添加与 YAML 消费，验证生产 profile 确实选择共享后端。 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { parseEnv } from 'node:util'
import { runInNewContext } from 'node:vm'
import { CacheConfigSchema } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { ReldbConfigSchema } from '@h-ai/reldb'
import { StorageConfigSchema } from '@h-ai/storage'
import { VecdbConfigSchema } from '@h-ai/vecdb'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addModule } from '../src/commands/cli-add.js'
import { generateConfigFile, generateProductionEnvironment } from '../src/commands/cli-config-templates.js'
import { createProject } from '../src/commands/cli-create.js'
import { buildTemplateContext } from '../src/commands/cli-template-engine.js'
import { loadConfigText } from './helpers/config.js'

const roots: string[] = []

/** 执行真实生成的启动代码，仅用模块边界注入可控失败。 */
function runtimeHarness(source: string) {
  const calls: string[] = []
  const state = { vectorFailure: false, cleanupFailure: false }
  const modules = Object.fromEntries(['ai', 'audit', 'cache', 'crypto', 'iam', 'reach', 'reldb', 'storage', 'vecdb'].map(name => [name, {
    init: async () => {
      calls.push(`${name}.init`)
      return state.vectorFailure && name === 'vecdb' ? { success: false, error: { message: 'Vector unavailable' } } : { success: true }
    },
    close: async () => {
      calls.push(`${name}.close`)
      return state.cleanupFailure && name === 'vecdb' ? { success: false, error: { message: 'Cleanup unavailable' } } : { success: true }
    },
    authz: { getRoleByCode: async () => ({ success: true, data: { id: 'existing-role' } }) },
    user: { listUsers: async () => ({ success: true, data: { total: 1 } }) },
  }]))
  const configs: Record<string, unknown> = { db: { type: 'postgresql', database: 'hai' }, vecdb: { type: 'qdrant', url: 'http://vecdb:6333' }, core: { name: 'test' }, serv: { transport: false }, ai: { llm: { apiKey: 'test-only' } } }
  const schema = { parse: (value: unknown) => value }
  const exported: { initApp?: () => Promise<void>, initializeModules?: () => Promise<void>, closeApp?: () => Promise<void>, closeModules?: () => Promise<void> } = {}
  const nativeRequire = createRequire(import.meta.url)
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: exported,
    module: { exports: exported },
    require: (name: string) => {
      if (name.startsWith('node:'))
        return nativeRequire(name)
      if (name === './messages.js')
        return { serverM: () => 'test' }
      if (name === '@h-ai/core')
        return { core: { module: core.module, init: () => undefined, config: { get: (key: string) => configs[key] ?? {}, getOrThrow: (key: string) => configs[key] ?? {}, validate: (key: string) => ({ success: true, data: configs[key] ?? {} }) }, logger: { info: () => undefined, error: () => undefined, warn: () => undefined } } }
      const moduleName = name.slice('@h-ai/'.length)
      return { [moduleName]: modules[moduleName], AIConfigSchema: schema, VecdbConfigSchema: schema, ReldbConfigSchema: schema, CacheConfigSchema: schema, StorageConfigSchema: schema, IamConfigSchema: schema, AuditInitConfigSchema: schema, ServConfigSchema: schema, ReachConfigSchema: schema }
    },
  })
  const initialize = exported.initApp ?? exported.initializeModules
  const close = exported.closeApp ?? exported.closeModules
  if (!initialize || !close)
    throw new Error('Generated runtime must expose initialization and close')
  return { calls, state, initialize, close }
}

/** 执行真实入口，验证初始化成功后的 transport/app 创建失败仍等待清理。 */
async function expectEntrypointCleanup(source: string): Promise<void> {
  const calls: string[] = []
  const processState = { exitCode: 0 }
  const logger = { error: vi.fn(), info: vi.fn(), child: () => logger }
  await runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
    exports: {},
    require: (name: string) => {
      if (name === 'node:process')
        return processState
      if (name === '@h-ai/core')
        return { core: { logger, config: { getOrThrow: () => ({ server: { host: '127.0.0.1', port: 0 } }) } } }
      if (name === '@h-ai/serv')
        return { serv: { listen: vi.fn() } }
      if (name === './lib/server/init.js') {
        return {
          initApp: async () => { calls.push('init') },
          closeApp: async () => {
            await Promise.resolve()
            calls.push('close')
          },
        }
      }
      if (name === './app.js') {
        return new Proxy({}, { get: () => () => {
          calls.push('create')
          throw new Error('Transport credentials invalid')
        } })
      }
      throw new Error(`Unexpected entrypoint import: ${name}`)
    },
  })
  expect(calls).toEqual(['init', 'create', 'close'])
  expect(processState.exitCode).toBe(1)
  expect(logger.error).toHaveBeenCalledOnce()
}
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('shared production configuration', () => {
  it.each(['admin-console', 'api-service', 'corporate-website', 'h5-app', 'ai-playground'])('%s实际生产文件通过core插值和模块Schema消费', async (appName) => {
    const app = path.resolve('..', '..', 'apps', appName)
    const values = parseEnv(await readFile(path.join(app, '.env.prod'), 'utf8'))
    for (const [key, value] of Object.entries(values))
      vi.stubEnv(key, value)
    vi.stubEnv('HAI_STORAGE_ACCESSKEYID', 'test-only-key')
    vi.stubEnv('HAI_STORAGE_SECRETACCESSKEY', 'test-only-secret')
    const config = (name: string) => readFile(path.join(app, 'config', `_${name}.yml`), 'utf8')
    expect(ReldbConfigSchema.parse(loadConfigText('db', await config('db')))).toMatchObject({ type: 'postgresql', host: 'db', database: 'hai' })
    expect(CacheConfigSchema.parse(loadConfigText('cache', await config('cache')))).toMatchObject({ type: 'redis', host: 'cache' })
    if (values.HAI_STORAGE_TYPE)
      expect(StorageConfigSchema.parse(loadConfigText('storage', await config('storage')))).toMatchObject({ type: 's3', endpoint: 'http://storage:9000', forcePathStyle: true })
    if (values.HAI_VECDB_TYPE)
      expect(VecdbConfigSchema.parse(loadConfigText('vecdb', await config('vecdb')))).toMatchObject({ type: 'qdrant', url: 'http://vecdb:6333' })
  })

  it('实际生成的生产环境可直接消费全部共享连接分支，公开文件不保存凭据', () => {
    const production = generateProductionEnvironment(['db', 'cache', 'storage', 'ai', 'vecdb', 'reach'])
    const values = parseEnv(production)
    expect(values).not.toHaveProperty('HAI_DB_PASSWORD')
    expect(values).not.toHaveProperty('HAI_STORAGE_SECRETACCESSKEY')
    expect(values.HAI_REACH_PROVIDERS).toBe('[]')
    for (const [key, value] of Object.entries(values))
      vi.stubEnv(key, value)
    vi.stubEnv('HAI_STORAGE_ACCESSKEYID', 'test-only-key')
    vi.stubEnv('HAI_STORAGE_SECRETACCESSKEY', 'test-only-secret')
    expect(ReldbConfigSchema.parse(loadConfigText('db', generateConfigFile('db')))).toMatchObject({ type: 'postgresql', host: 'db', database: 'hai', port: 5432 })
    expect(CacheConfigSchema.parse(loadConfigText('cache', generateConfigFile('cache')))).toMatchObject({ type: 'redis', host: 'cache' })
    expect(StorageConfigSchema.parse(loadConfigText('storage', generateConfigFile('storage')))).toMatchObject({ type: 's3', endpoint: 'http://storage:9000', forcePathStyle: true })
    expect(VecdbConfigSchema.parse(loadConfigText('vecdb', generateConfigFile('vecdb')))).toMatchObject({ type: 'qdrant', url: 'http://vecdb:6333' })
    expect(parseEnv(generateProductionEnvironment(['db'], { db: { type: 'mysql', database: 'business' } }))).toMatchObject({ HAI_DB_TYPE: 'mysql', HAI_DB_PORT: '3306', HAI_DB_DATABASE: 'business' })
    expect(parseEnv(generateProductionEnvironment([]))).not.toHaveProperty('HAI_DB_TYPE')
  })

  it.each(['website', 'api', 'fullstack'] as const)('%s只选AI也补足实际依赖、配置和生产profile', async (appType) => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const root = await mkdtemp(path.join(tmpdir(), 'hai-production-create-'))
    roots.push(root)
    const name = `production-${appType}`
    await createProject({ name, appType, features: ['ai'], yes: true, install: false, git: false, deploy: false, examples: false, packageManager: 'pnpm', frontends: ['web'], cwd: root })
    const project = path.join(root, name)
    const service = appType === 'api' ? path.join(project, 'apps', `${name}-service`) : appType === 'fullstack' ? path.join(project, 'packages', `${name}-serv`) : project
    const pkg = JSON.parse(await readFile(path.join(service, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
    expect(pkg.dependencies).toHaveProperty('@h-ai/ai')
    expect(pkg.dependencies).toHaveProperty('@h-ai/reldb')
    expect(pkg.dependencies).toHaveProperty('@h-ai/vecdb')
    expect(await readFile(path.join(service, 'config', '_vecdb.yml'), 'utf8')).toContain('HAI_VECDB_URL')
    const envRoot = appType === 'api' ? service : project
    expect(parseEnv(await readFile(path.join(envRoot, '.env.prod'), 'utf8'))).toMatchObject({ HAI_DB_TYPE: 'postgresql', HAI_VECDB_TYPE: 'qdrant' })
    const context = buildTemplateContext({ name, appType, features: ['ai'], packageManager: 'pnpm' })
    expect(context.features).toMatchObject({ ai: true, db: true, vecdb: true })
    expect(context.haiCatalogPackages).toHaveProperty('@h-ai/vecdb')
    const runtimeFile = appType === 'fullstack' ? 'src/server/runtime.ts' : 'src/lib/server/init.ts'
    const workspace = path.resolve('..', '..')
    const program = ts.createProgram([path.join(service, runtimeFile)], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: ['node'],
      typeRoots: [path.join(workspace, 'node_modules', '@types')],
      paths: {
        '@h-ai/core': [path.join(workspace, 'packages/core/dist/node.d.ts')],
        '@h-ai/storage': [path.join(workspace, 'packages/storage/dist/node.d.ts')],
        '@h-ai/*': [path.join(workspace, 'packages', '*', 'dist', 'index.d.ts')],
      },
    })
    const diagnostics = ts.getPreEmitDiagnostics(program)
    expect(diagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n'))).toEqual([])
    const runtime = runtimeHarness(await readFile(path.join(service, runtimeFile), 'utf8'))
    runtime.state.vectorFailure = true
    runtime.state.cleanupFailure = true
    await expect(runtime.initialize()).rejects.toMatchObject({ cause: { ext: { module: 'vecdb', phase: 'start', cleanup: { module: 'vecdb', phase: 'close' } } } })
    expect(runtime.calls).not.toContain('reldb.close')
    expect(runtime.calls).not.toContain('ai.init')
    runtime.state.vectorFailure = false
    runtime.state.cleanupFailure = false
    await Promise.all([runtime.initialize(), runtime.initialize()])
    expect(runtime.calls.indexOf('vecdb.init')).toBeGreaterThan(runtime.calls.indexOf('reldb.init'))
    expect(runtime.calls.lastIndexOf('ai.init')).toBeGreaterThan(runtime.calls.lastIndexOf('vecdb.init'))
    const closedBefore = runtime.calls.filter(call => call === 'ai.close').length
    await Promise.all([runtime.close(), runtime.close()])
    expect(runtime.calls.filter(call => call === 'ai.close')).toHaveLength(closedBefore + 1)
    if (appType === 'api')
      await expectEntrypointCleanup(await readFile(path.join(service, 'src/index.ts'), 'utf8'))
  }, 20_000)

  it('实际 API 示例在 transport/app 创建失败后等待 closeApp 再结束失败入口', async () => {
    await expectEntrypointCleanup(await readFile(path.resolve('..', '..', 'apps/api-service/src/index.ts'), 'utf8'))
  })

  it('add ai 同时添加 db/vecdb 包与可消费配置，并保留既有生产私有连接选择', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const root = await mkdtemp(path.join(tmpdir(), 'hai-production-add-'))
    roots.push(root)
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'existing', dependencies: { '@h-ai/core': '0.1.0-test' } }))
    await writeFile(path.join(root, '.env.prod'), 'HAI_DB_HOST=private-db.internal\n')
    await addModule({ module: 'ai', install: false, cwd: root })
    const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
    expect(pkg.dependencies).toHaveProperty('@h-ai/reldb')
    expect(pkg.dependencies).toHaveProperty('@h-ai/vecdb')
    expect(await readFile(path.join(root, 'config', '_vecdb.yml'), 'utf8')).toContain('HAI_VECDB_URL')
    expect(parseEnv(await readFile(path.join(root, '.env.prod'), 'utf8'))).toMatchObject({ HAI_DB_HOST: 'private-db.internal', HAI_VECDB_TYPE: 'qdrant' })
  })

  it('仅crypto的真实API工程仍选择RelDB transport registry，模板上下文不漏硬依赖', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const root = await mkdtemp(path.join(tmpdir(), 'hai-production-crypto-'))
    roots.push(root)
    await createProject({ name: 'crypto-api', appType: 'api', features: ['crypto'], yes: true, install: false, git: false, deploy: false, packageManager: 'pnpm', cwd: root })
    const service = path.join(root, 'crypto-api', 'apps', 'crypto-api-service')
    const app = await readFile(path.join(service, 'src', 'app.ts'), 'utf8')
    expect(app).toContain('createReldbTransportKeyStore')
    expect(app).not.toContain('createInMemoryKeyStore')
    const context = buildTemplateContext({ name: 'crypto-api', appType: 'api', features: ['crypto'], packageManager: 'pnpm' })
    expect(context.features.db).toBe(true)
  })
})
