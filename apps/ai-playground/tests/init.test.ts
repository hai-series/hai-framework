/** 应用启动边界：共享存储先于 AI，失败逆序释放且清理失败后可重试。 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ calls: [] as string[], fail: '', cleanupFailures: 0 }))
const modelConfig = vi.hoisted(() => ({
  llm: { model: 'test' },
  audio: { transcribeModel: 'asr', synthesizeModel: 'tts', models: [
    { id: 'asr', model: 'asr-test', provider: 'mimo' },
    { id: 'tts', model: 'tts-test', provider: 'mimo' },
  ] },
  image: { generateModel: 'image', models: [{ id: 'image', model: 'image-test', provider: 'openai' }] },
}))

vi.mock('@h-ai/ai', () => ({
  AIConfigSchema: {},
  ai: {
    init: async () => {
      state.calls.push('ai.init')
      return state.fail === 'ai' ? { success: false, error: { message: 'AI unavailable' } } : { success: true }
    },
    close: async () => {
      state.calls.push('ai.close')
      return { success: true }
    },
  },
}))
vi.mock('@h-ai/reldb', () => ({
  ReldbConfigSchema: {},
  reldb: {
    init: async () => {
      state.calls.push('db.init')
      return { success: true }
    },
    close: async () => {
      state.calls.push('db.close')
      return { success: true }
    },
  },
}))
vi.mock('@h-ai/cache', () => ({ CacheConfigSchema: {} }))
vi.mock('@h-ai/vecdb', () => ({
  VecdbConfigSchema: {},
  vecdb: {
    init: async () => {
      state.calls.push('vecdb.init')
      return state.fail === 'vecdb' ? { success: false, error: { message: 'Vector unavailable' } } : { success: true }
    },
    close: async () => {
      state.calls.push('vecdb.close')
      if (state.cleanupFailures-- > 0)
        return { success: false, error: { message: 'Vector cleanup unavailable' } }
      return { success: true }
    },
  },
}))
vi.mock('@h-ai/core', () => ({
  core: {
    init: () => undefined,
    config: {
      validate: (name: string) => ({ success: true, data: name === 'ai' ? modelConfig : { type: 'postgresql' } }),
      getOrThrow: () => modelConfig,
    },
    logger: { info: () => undefined, error: () => undefined, getLevel: () => 'info' },
  },
}))

beforeEach(() => {
  state.calls.length = 0
  state.fail = ''
  state.cleanupFailures = 0
  vi.resetModules()
})

describe('aI Playground initialization', () => {
  it('并发请求共享一次启动，db/vecdb先于AI', async () => {
    const { ensureAIInitialized, getAIPlaygroundMetadata } = await import('../src/lib/server/init.js')
    await Promise.all([ensureAIInitialized(), ensureAIInitialized()])
    expect(state.calls).toEqual(['db.init', 'vecdb.init', 'ai.init'])
    expect(getAIPlaygroundMetadata().llmModel).toBe('test')
  })

  it.each(['vecdb', 'ai'])('%s失败后逆序释放，后续请求可以重试', async (failed) => {
    const { ensureAIInitialized } = await import('../src/lib/server/init.js')
    state.fail = failed
    await expect(ensureAIInitialized()).rejects.toThrow('initialization failed')
    expect(state.calls.slice(-3)).toEqual(['ai.close', 'vecdb.close', 'db.close'])
    state.fail = ''
    await ensureAIInitialized()
    expect(state.calls.slice(-3)).toEqual(['db.init', 'vecdb.init', 'ai.init'])
  })

  it('清理失败继续关闭其它模块并保留重试义务', async () => {
    const { ensureAIInitialized } = await import('../src/lib/server/init.js')
    state.fail = 'ai'
    state.cleanupFailures = 1
    await expect(ensureAIInitialized()).rejects.toThrow('startup and cleanup failed')
    expect(state.calls.slice(-3)).toEqual(['ai.close', 'vecdb.close', 'db.close'])
    state.fail = ''
    const offset = state.calls.length
    await ensureAIInitialized()
    expect(state.calls.slice(offset)).toEqual(['ai.close', 'vecdb.close', 'db.close', 'db.init', 'vecdb.init', 'ai.init'])
  })
})
