/** 执行实际移动客户端模板，覆盖 transport 选择和客户端/crypto 的资源边界。 */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import Handlebars from 'handlebars'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
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
