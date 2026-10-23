/** 执行实际移动客户端模板，覆盖 transport 选择和客户端/crypto 的资源边界。 */
import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { runInNewContext } from 'node:vm'
import { ESLint } from 'eslint'
import Handlebars from 'handlebars'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { createProject } from '../src/commands/cli-create.js'
import { buildTemplateContext } from '../src/commands/cli-template-engine.js'

interface MobileClient {
  initApi: () => Promise<void>
  closeApi: () => Promise<void>
}

const template = readFileSync(new URL('../templates/apps/mobile-app/src/lib/api.ts.hbs', import.meta.url), 'utf8')

function instantiate(options: { encrypted?: boolean, transport?: string } = {}) {
  const context = buildTemplateContext({ name: 'mobile', appType: 'mobile-app', features: options.encrypted === false ? ['api-client', 'capacitor'] : ['iam'], packageManager: 'pnpm' })
  const source = Handlebars.compile(template)(context)
  // Vite 的 import.meta.env 是编译期入口；仅把该环境边界替换为可注入绑定。
  const compiled = ts.transpileModule(source.replaceAll('import.meta.env', 'runtimeEnv'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const calls: string[] = []
  const state = { cryptoInitialized: false, cryptoFailure: false, clientFailure: false, storageFailure: false, closeFailure: false }
  const crypto = {
    get isInitialized() { return state.cryptoInitialized },
    init: vi.fn(async () => {
      calls.push('crypto.init')
      if (state.cryptoFailure)
        return { success: false, error: { message: 'Crypto unavailable' } }
      state.cryptoInitialized = true
      return { success: true }
    }),
    close: vi.fn(async () => {
      calls.push('crypto.close')
      state.cryptoInitialized = false
    }),
  }
  const client = {
    tokenStorage: { memory: () => {
      if (state.storageFailure)
        throw new Error('Storage unavailable')
      return { kind: 'memory' }
    } },
    init: vi.fn(async (_config: Record<string, unknown>) => {
      calls.push('client.init')
      return state.clientFailure ? { success: false, error: { message: 'Client unavailable' } } : { success: true }
    }),
    close: vi.fn(async () => {
      calls.push('client.close')
      if (state.closeFailure)
        throw new Error('Client cleanup unavailable')
    }),
  }
  const exported: Partial<MobileClient> = {}
  runInNewContext(compiled.outputText, {
    exports: exported,
    runtimeEnv: {},
    __HAI_PUBLIC_CONFIG__: { apiBase: 'http://127.0.0.1:3000/api/v1', apiTransport: options.transport, apiKeyExchangePath: '/custom/key-exchange' },
    require(name: string) {
      if (name === '@h-ai/api-client')
        return { apiClient: client }
      if (name === '@h-ai/crypto')
        return { crypto }
      if (name === '@h-ai/capacitor')
        return { createCapacitorTokenStorage: () => ({ kind: 'native' }) }
      if (name === '@capacitor/core')
        return { Capacitor: { isNativePlatform: () => false } }
      throw new Error(`Unexpected template import: ${name}`)
    },
  })
  if (!exported.initApi || !exported.closeApi)
    throw new Error('Generated mobile lifecycle missing')
  return { context, application: exported as MobileClient, calls, state, crypto, client, source }
}

describe('generated mobile crypto transport', () => {
  it.each([true, false])('实际生成工程 crypto=%s 的依赖、catalog 和公开配置与消费者一致', async (encrypted) => {
    // 位于仓库已忽略的临时目录，仅复用真实安装包声明与 linter，不伪称独立安装验收。
    const root = await mkdtemp(path.join(process.cwd(), '.tmp-mobile-transport-'))
    try {
      await createProject({ name: 'mobile-test', appType: 'mobile-app', template: 'custom', features: encrypted ? ['iam'] : ['api-client', 'capacitor'], yes: true, install: false, git: false, deploy: false, packageManager: 'pnpm', cwd: root, examples: false })
      const project = path.join(root, 'mobile-test')
      const manifest = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
      const workspace = parse(await readFile(path.join(project, 'pnpm-workspace.yaml'), 'utf8')) as { catalog: Record<string, string> }
      const consumer = await readFile(path.join(project, 'src/lib/api.ts'), 'utf8')
      const vite = await readFile(path.join(project, 'vite.config.ts'), 'utf8')
      const environment = await readFile(path.join(project, '.env.example'), 'utf8')
      expect(Boolean(manifest.dependencies['@h-ai/crypto'])).toBe(encrypted)
      expect(Boolean(workspace.catalog['@h-ai/crypto'])).toBe(encrypted)
      expect(consumer.includes('from \'@h-ai/crypto\'')).toBe(encrypted)
      expect(vite.includes('apiTransport: process.env.PUBLIC_API_TRANSPORT')).toBe(encrypted)
      if (encrypted) {
        expect(environment).toContain('PUBLIC_API_TRANSPORT=')
        expect(environment).toContain('PUBLIC_API_KEY_EXCHANGE_PATH=')
      }
      expect(manifest.dependencies['@h-ai/reldb']).toBeUndefined()
      expect(manifest.dependencies['@h-ai/iam']).toBeUndefined()
      expect(manifest.dependencies['@h-ai/cache']).toBeUndefined()
      const linter = new ESLint({ cwd: project, overrideConfigFile: path.join(project, 'eslint.config.js') })
      const lint = await linter.lintFiles(['src/lib/api.ts', 'vite.config.ts'])
      expect(lint.flatMap(result => result.messages.map(message => ({ file: result.filePath, ...message })))).toEqual([])
      const program = ts.createProgram([path.join(project, 'src/lib/api.ts')], { noEmit: true, strict: true, skipLibCheck: true, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, moduleResolution: ts.ModuleResolutionKind.Bundler, types: ['node', 'vite/client'] })
      const diagnostics = ts.getPreEmitDiagnostics(program)
      expect(diagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n'))).toEqual([])
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 30_000)

  it('iAM 模板补充 crypto catalog，默认加密并在客户端之后释放 crypto', async () => {
    const fixture = instantiate()
    expect(fixture.context.haiCatalogPackages['@h-ai/crypto']).toBeDefined()
    await fixture.application.initApi()
    expect(fixture.client.init.mock.calls[0]?.[0]).toMatchObject({ transport: { crypto: fixture.crypto, keyExchangePath: '/custom/key-exchange' } })
    await fixture.application.closeApi()
    expect(fixture.calls).toEqual(['crypto.init', 'client.init', 'client.close', 'crypto.close'])
  })

  it('crypto 初始化失败不能启动明文 client，恢复后可重试', async () => {
    const fixture = instantiate()
    fixture.state.cryptoFailure = true
    await expect(fixture.application.initApi()).rejects.toThrow('Crypto unavailable')
    expect(fixture.client.init).not.toHaveBeenCalled()
    fixture.state.cryptoFailure = false
    await fixture.application.initApi()
    await fixture.application.closeApi()
  })

  it('client 初始化失败后释放本次 crypto，存储失败也不遗留 crypto', async () => {
    const fixture = instantiate()
    fixture.state.clientFailure = true
    await expect(fixture.application.initApi()).rejects.toThrow('Client unavailable')
    expect(fixture.state.cryptoInitialized).toBe(false)
    fixture.state.clientFailure = false
    fixture.state.storageFailure = true
    await expect(fixture.application.initApi()).rejects.toThrow('Storage unavailable')
    expect(fixture.state.cryptoInitialized).toBe(false)
    fixture.state.storageFailure = false
    await fixture.application.initApi()
    await fixture.application.closeApi()
  })

  it('client 关闭失败保留 crypto 供重试，已有外部 crypto 不由模板关闭', async () => {
    const fixture = instantiate()
    await fixture.application.initApi()
    fixture.state.closeFailure = true
    await expect(fixture.application.closeApi()).rejects.toThrow('Client cleanup unavailable')
    expect(fixture.state.cryptoInitialized).toBe(true)
    fixture.state.closeFailure = false
    await fixture.application.closeApi()
    fixture.state.cryptoInitialized = true
    await fixture.application.initApi()
    await fixture.application.closeApi()
    expect(fixture.state.cryptoInitialized).toBe(true)
  })

  it.each([{ encrypted: false }, { transport: 'off' }])('保留明确选择的无 crypto/明文 API 模式 %j', async (options) => {
    const fixture = instantiate(options)
    await fixture.application.initApi()
    expect(fixture.client.init.mock.calls[0]?.[0]).not.toHaveProperty('transport')
    expect(fixture.crypto.init).not.toHaveBeenCalled()
    if (options.encrypted === false) {
      expect(fixture.context.haiCatalogPackages['@h-ai/crypto']).toBeUndefined()
      expect(fixture.source).not.toContain('from \'@h-ai/crypto\'')
    }
    await fixture.application.closeApi()
  })
})
