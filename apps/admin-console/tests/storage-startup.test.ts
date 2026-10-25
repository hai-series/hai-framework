/** 已配置存储失败不得将应用标记为成功；未配置仍保留可选语义。 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  storageInit: vi.fn(),
  iamInit: vi.fn(),
}))
vi.mock('$lib/paraglide/messages.js', () => ({
  server_init_storage_failed: ({ message }: { message: string }) => `Storage initialization failed: ${message}`,
}))
vi.mock('$lib/build-metadata.js', () => ({ adminBuildMetadata: { appVersion: 'test', buildId: 'test', commit: 'test' } }))
vi.mock('@h-ai/feedback', () => ({
  feedback: { init: vi.fn(async () => ({ success: true })) },
  FeedbackConfigSchema: { safeParse: vi.fn() },
}))
vi.mock('@h-ai/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@h-ai/core')>()
  return { ...actual, core: {
    ...actual.core,
    init: vi.fn(),
    logger: { ...actual.core.logger, info: vi.fn(), warn: vi.fn() },
    config: { ...actual.core.config, get: (name: string) => state.config[name], getOrThrow: (name: string) => state.config[name] },
  } }
})
vi.mock('@h-ai/reldb', () => ({ reldb: { init: vi.fn(async () => ({ success: true })), close: vi.fn() } }))
vi.mock('@h-ai/cache', () => ({ cache: { init: vi.fn(async () => ({ success: true })), close: vi.fn() } }))
vi.mock('@h-ai/crypto', () => ({ crypto: { init: vi.fn(async () => ({ success: true })), close: vi.fn() } }))
vi.mock('@h-ai/audit', () => ({ audit: { init: vi.fn(async () => ({ success: true })), close: vi.fn() } }))
vi.mock('@h-ai/iam', () => ({ iam: {
  init: state.iamInit,
  close: vi.fn(),
  user: { listUsers: vi.fn(async () => ({ success: true, data: { total: 1 } })) },
} }))
vi.mock('@h-ai/storage', () => ({ storage: { init: state.storageInit, close: vi.fn() } }))
vi.mock('@h-ai/reach', () => ({ reach: {} }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  for (const key of Object.keys(state.config))
    delete state.config[key]
  Object.assign(state.config, { db: { type: 'postgresql' }, cache: { type: 'redis' }, iam: {} })
  state.storageInit.mockResolvedValue({ success: false, error: { code: 'test:storage', message: 'S3 not ready' } })
  state.iamInit.mockResolvedValue({ success: true })
})

describe('admin-console storage startup', () => {
  it('已配置存储失败阻止就绪，下一次调用仍会重试', async () => {
    state.config.storage = { type: 's3', createBucket: true }
    const { initApp, isAppInitialized } = await import('../src/lib/server/init.js')
    await expect(initApp()).rejects.toMatchObject({ cause: { ext: { module: 'storage', phase: 'start', code: 'test:storage' } } })
    expect(isAppInitialized()).toBe(false)
    expect(state.iamInit).not.toHaveBeenCalled()
    state.storageInit.mockResolvedValue({ success: true })
    await initApp()
    expect(isAppInitialized()).toBe(true)
    expect(state.storageInit).toHaveBeenCalledTimes(2)
  })

  it('未配置存储可成功初始化', async () => {
    const { initApp, isAppInitialized } = await import('../src/lib/server/init.js')
    await initApp()
    expect(isAppInitialized()).toBe(true)
    expect(state.storageInit).not.toHaveBeenCalled()
  })
})
