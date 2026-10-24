/** AI 必需依赖按顺序初始化；失败关闭本次资源，不静默降级。 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const calls: string[] = []
  const initialized = new Set<string>()
  const borrowed = new Set<string>()
  const settings = { failInit: '', invalid: '', failClose: '' }
  const config: Record<string, unknown> = {}
  function lifecycle(name: string) {
    return {
      get isInitialized() { return initialized.has(name) || borrowed.has(name) },
      init: vi.fn(async () => {
        calls.push(`${name}.init`)
        if (settings.failInit === name)
          return { success: false, error: { code: 'test:init', message: 'unavailable' } }
        initialized.add(name)
        return { success: true, data: undefined }
      }),
      close: vi.fn(async () => {
        calls.push(`${name}.close`)
        if (settings.failClose === name) {
          settings.failClose = ''
          return { success: false, error: { code: 'test:close', message: 'close failed' } }
        }
        initialized.delete(name)
        return { success: true, data: undefined }
      }),
    }
  }
  const modules = {
    reldb: { ...lifecycle('reldb'), ddl: { createTable: vi.fn(async () => ({ success: true })), createIndex: vi.fn(async () => ({ success: true })) } },
    cache: lifecycle('cache'),
    iam: lifecycle('iam'),
    reach: lifecycle('reach'),
    storage: lifecycle('storage'),
    vecdb: lifecycle('vecdb'),
    ai: lifecycle('ai'),
  }
  // spread 会求值 getter；reldb 也显式使用实时实例状态。
  Object.defineProperty(modules.reldb, 'isInitialized', { get: () => initialized.has('reldb') || borrowed.has('reldb') })
  return { calls, initialized, borrowed, settings, config, modules }
})

vi.mock('@h-ai/ai', () => ({ ai: state.modules.ai }))
vi.mock('@h-ai/cache', () => ({ cache: state.modules.cache, CacheConfigSchema: {} }))
vi.mock('@h-ai/iam', () => ({ iam: state.modules.iam }))
vi.mock('@h-ai/reach', () => ({ reach: state.modules.reach, ReachConfigSchema: { parse: (value: unknown) => value } }))
vi.mock('@h-ai/reldb', () => ({ reldb: state.modules.reldb, ReldbConfigSchema: {} }))
vi.mock('@h-ai/storage', () => ({ storage: state.modules.storage, StorageConfigSchema: {} }))
vi.mock('@h-ai/vecdb', () => ({ vecdb: state.modules.vecdb, VecdbConfigSchema: {} }))
vi.mock('@h-ai/core', () => ({ core: {
  init: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn() },
  config: {
    get: (name: string) => state.config[name],
    getOrThrow: (name: string) => state.config[name],
    validate: (name: string) => name === state.settings.invalid
      ? { success: false, error: { message: 'invalid configuration' } }
      : { success: true, data: state.config[name] },
  },
} }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.calls.length = 0
  state.initialized.clear()
  state.borrowed.clear()
  Object.assign(state.settings, { failInit: '', invalid: '', failClose: '' })
  for (const key of Object.keys(state.config)) delete state.config[key]
  Object.assign(state.config, {
    db: { type: 'postgresql', database: 'test' },
    cache: { type: 'redis' },
    iam: {},
    ai: { llm: { apiKey: 'test-key' } },
    vecdb: { type: 'qdrant', url: 'http://unused.test:6333' },
    partner: { username: 'test', password: 'test-only-password' },
  })
})

describe('h5-app application startup', () => {
  it('已配置存储连接失败时停止启动，释放本次资源并允许恢复后重试', async () => {
    state.config.storage = { type: 's3', createBucket: true }
    state.settings.failInit = 'storage'
    const { initApp } = await import('./init.js')
    await expect(initApp()).rejects.toThrow('Storage initialization failed')
    expect(state.modules.ai.init).not.toHaveBeenCalled()
    expect(state.calls.filter(call => call.endsWith('.close'))).toEqual(['storage.close', 'iam.close', 'cache.close', 'reldb.close'])
    state.settings.failInit = ''
    await initApp()
    expect(state.modules.storage.init).toHaveBeenCalledTimes(2)
    expect(state.initialized.has('storage')).toBe(true)
  })

  it('未配置存储仍可正常初始化', async () => {
    const { initApp } = await import('./init.js')
    await initApp()
    expect(state.modules.storage.init).not.toHaveBeenCalled()
  })

  it('启用AI时先成功连接vecdb再AI，重复初始化不重复连接', async () => {
    const { initApp } = await import('./init.js')
    await initApp()
    await initApp()
    expect(state.calls.indexOf('vecdb.init')).toBeGreaterThan(state.calls.indexOf('reldb.init'))
    expect(state.calls.indexOf('ai.init')).toBeGreaterThan(state.calls.indexOf('vecdb.init'))
    expect(state.modules.ai.init).toHaveBeenCalledOnce()
    expect(state.calls.some(call => call.endsWith('.close'))).toBe(false)
  })

  it.each([undefined, '', '   '])('未配置有效Key %s 时不初始化AI和vecdb', async (apiKey) => {
    state.config.ai = { llm: { apiKey } }
    const { initApp } = await import('./init.js')
    await initApp()
    expect(state.modules.vecdb.init).not.toHaveBeenCalled()
    expect(state.modules.ai.init).not.toHaveBeenCalled()
  })

  it('模型池中的API Key也启用AI，不要求重复配置全局Key', async () => {
    state.config.ai = { llm: { models: [{ id: 'one', model: 'test', apiKey: 'test-only' }] } }
    const { initApp } = await import('./init.js')
    await initApp()
    expect(state.modules.ai.init).toHaveBeenCalledOnce()
  })

  it('向量配置无效则中止启动并逆序回滚已有资源', async () => {
    state.settings.invalid = 'vecdb'
    const { initApp } = await import('./init.js')
    await expect(initApp()).rejects.toThrow('Vector config invalid')
    expect(state.modules.ai.init).not.toHaveBeenCalled()
    expect(state.calls.filter(call => call.endsWith('.close'))).toEqual(['iam.close', 'cache.close', 'reldb.close'])
  })

  it.each(['vecdb', 'ai'])('%s初始化失败也关闭尝试的模块，允许下次重新初始化', async (name) => {
    state.settings.failInit = name
    const { initApp } = await import('./init.js')
    await expect(initApp()).rejects.toThrow('initialization failed')
    expect(state.calls.filter(call => call.endsWith('.close'))).toEqual(name === 'ai'
      ? ['ai.close', 'vecdb.close', ...['iam.close', 'cache.close', 'reldb.close']]
      : ['vecdb.close', ...['iam.close', 'cache.close', 'reldb.close']])
    if (name === 'vecdb')
      expect(state.modules.ai.init).not.toHaveBeenCalled()
    state.settings.failInit = ''
    await initApp()
    expect(state.initialized.has('ai')).toBe(true)
  })

  it('失败回滚不关闭调用方已有的数据库或缓存', async () => {
    state.borrowed.add('reldb')
    state.borrowed.add('cache')
    state.settings.invalid = 'vecdb'
    const { initApp } = await import('./init.js')
    await expect(initApp()).rejects.toThrow('Vector config invalid')
    expect(state.modules.reldb.close).not.toHaveBeenCalled()
    expect(state.modules.cache.close).not.toHaveBeenCalled()
  })

  it('关闭失败保留义务，下次启动在任何新连接前先重试关闭', async () => {
    state.settings.failInit = 'ai'
    state.settings.failClose = 'vecdb'
    const { initApp } = await import('./init.js')
    await expect(initApp()).rejects.toThrow('startup and cleanup failed')
    state.settings.failInit = ''
    state.calls.length = 0
    await initApp()
    expect(state.calls[0]).toBe('vecdb.close')
    expect(state.calls.indexOf('reldb.init')).toBeGreaterThan(0)
    expect(state.initialized.has('ai')).toBe(true)
  })
})
