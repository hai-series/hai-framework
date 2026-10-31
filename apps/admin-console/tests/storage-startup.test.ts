/** 已配置存储失败不得将应用标记为成功；未配置仍保留可选语义。 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  storageInit: vi.fn(),
  iamInit: vi.fn(),
  feedbackInit: vi.fn(),
}))
vi.mock('$lib/paraglide/messages.js', () => ({
  security_role_system: () => 'System',
  security_role_audit: () => 'Audit',
  security_role_config: () => 'Config',
  security_role_operator: () => 'Operator',
  security_role_member: () => 'Member',
  server_init_storage_failed: ({ message }: { message: string }) => `Storage initialization failed: ${message}`,
}))
vi.mock('$lib/build-metadata.js', () => ({ adminBuildMetadata: { appVersion: 'test', buildId: 'test', commit: 'test' } }))
vi.mock('$lib/server/business-settings.js', () => ({ initBusinessSettings: vi.fn(async () => ({ success: true, data: undefined })) }))
vi.mock('$lib/server/security-roles.js', () => ({ seedAdminDuties: vi.fn(async () => ({ success: true, data: undefined })), bootstrapDutyAccount: vi.fn(async () => ({ success: true, data: undefined })) }))
vi.mock('$lib/server/audit-jobs.js', () => ({ startAuditJobs: vi.fn(async () => ({ success: true, data: undefined })) }))
vi.mock('@h-ai/scheduler', () => ({ scheduler: { close: vi.fn() }, SchedulerConfigSchema: {} }))
vi.mock('@h-ai/feedback', () => ({
  feedback: { init: state.feedbackInit, close: vi.fn(async () => ({ success: true })), isInitialized: false },
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
vi.mock('@h-ai/reldb', () => ({ reldb: { init: vi.fn(async () => ({ success: true })), close: vi.fn() }, ReldbConfigSchema: {} }))
vi.mock('@h-ai/cache', () => ({ cache: { init: vi.fn(async () => ({ success: true })), close: vi.fn() }, CacheConfigSchema: {} }))
vi.mock('@h-ai/crypto', () => ({ crypto: { init: vi.fn(async () => ({ success: true })), close: vi.fn() } }))
vi.mock('@h-ai/audit', () => ({
  audit: { init: vi.fn(async () => ({ success: true })), close: vi.fn(), schedulerPlan: null },
  AuditInitConfigSchema: { parse: (value: Record<string, unknown>) => value },
}))
vi.mock('@h-ai/iam', () => ({ IamConfigSchema: {}, iam: {
  init: state.iamInit,
  close: vi.fn(),
  user: { listUsers: vi.fn(async () => ({ success: true, data: { total: 1 } })) },
} }))
vi.mock('@h-ai/storage', () => ({ storage: { init: state.storageInit, close: vi.fn() }, StorageConfigSchema: {} }))
vi.mock('@h-ai/reach', () => ({ reach: {}, ReachConfigSchema: {} }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  for (const key of Object.keys(state.config))
    delete state.config[key]
  Object.assign(state.config, { db: { type: 'postgresql' }, cache: { type: 'redis' }, iam: {} })
  state.storageInit.mockResolvedValue({ success: false, error: { code: 'test:storage', message: 'S3 not ready' } })
  state.iamInit.mockResolvedValue({ success: true })
  state.feedbackInit.mockResolvedValue({ success: true })
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

it('反馈初始化失败保留必需业务模块，独立重试任务可完整关闭', async () => {
  state.config.feedback = { appId: 'optional-feedback' }
  state.feedbackInit.mockResolvedValue({ success: false, error: { code: 'test:feedback', message: 'Auxiliary fixture unavailable' } })
  const { initApp, closeApp, isAppInitialized } = await import('../src/lib/server/init.js')
  try {
    await initApp()
    expect(isAppInitialized()).toBe(true)
    expect(state.iamInit).toHaveBeenCalledTimes(1)
    expect(state.feedbackInit).toHaveBeenCalledTimes(1)
  }
  finally { await closeApp() }
})
