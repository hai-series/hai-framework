import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  aiInit: vi.fn(),
  cacheInit: vi.fn(),
  coreInit: vi.fn(),
  configGet: vi.fn(),
  configGetOrThrow: vi.fn(),
  configValidate: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  fsExistsSync: vi.fn(),
  fsMkdirSync: vi.fn(),
  iamInit: vi.fn(),
  reldbInit: vi.fn(),
  createTable: vi.fn(),
  createIndex: vi.fn(),
  addColumn: vi.fn(),
  sqlQuery: vi.fn(),
  sqlGet: vi.fn(),
  sqlExecute: vi.fn(),
  storageInit: vi.fn(),
}))

vi.mock('@h-ai/ai', () => ({
  ai: {
    init: mocks.aiInit,
  },
}))

vi.mock('@h-ai/cache', () => ({
  CacheConfigSchema: {},
  cache: {
    init: mocks.cacheInit,
  },
}))

vi.mock('@h-ai/core', () => ({
  core: {
    init: mocks.coreInit,
    config: {
      validate: mocks.configValidate,
      getOrThrow: mocks.configGetOrThrow,
      get: mocks.configGet,
    },
    logger: {
      warn: mocks.loggerWarn,
      info: mocks.loggerInfo,
    },
  },
}))

vi.mock('@h-ai/iam', () => ({
  iam: {
    init: mocks.iamInit,
  },
}))

vi.mock('@h-ai/reldb', () => ({
  ReldbConfigSchema: {},
  reldb: {
    config: { type: 'sqlite' },
    init: mocks.reldbInit,
    ddl: {
      createTable: mocks.createTable,
      createIndex: mocks.createIndex,
      addColumn: mocks.addColumn,
    },
    sql: {
      query: mocks.sqlQuery,
      get: mocks.sqlGet,
      execute: mocks.sqlExecute,
    },
  },
}))

vi.mock('@h-ai/storage', () => ({
  storage: {
    init: mocks.storageInit,
  },
}))

vi.mock('node:fs', () => ({
  existsSync: mocks.fsExistsSync,
  mkdirSync: mocks.fsMkdirSync,
}))

describe('initApp', () => {
  beforeEach(() => {
    vi.resetModules()

    mocks.aiInit.mockReset()
    mocks.cacheInit.mockReset()
    mocks.coreInit.mockReset()
    mocks.configGet.mockReset()
    mocks.configGetOrThrow.mockReset()
    mocks.configValidate.mockReset()
    mocks.loggerInfo.mockReset()
    mocks.loggerWarn.mockReset()
    mocks.fsExistsSync.mockReset()
    mocks.fsMkdirSync.mockReset()
    mocks.iamInit.mockReset()
    mocks.reldbInit.mockReset()
    mocks.createTable.mockReset()
    mocks.createIndex.mockReset()
    mocks.addColumn.mockReset()
    mocks.sqlQuery.mockReset()
    mocks.sqlGet.mockReset()
    mocks.sqlExecute.mockReset()
    mocks.storageInit.mockReset()

    mocks.configValidate.mockReturnValue({ success: true })
    mocks.configGetOrThrow.mockImplementation((key: string) => {
      if (key === 'db')
        return { database: '/tmp/h5-app.db' }
      if (key === 'cache')
        return { type: 'memory' }
      if (key === 'iam')
        return { session: { secret: 'test-secret' } }
      throw new Error(`Unexpected config key: ${key}`)
    })
    mocks.configGet.mockReturnValue(undefined)
    mocks.fsExistsSync.mockReturnValue(true)
    mocks.reldbInit.mockResolvedValue({ success: true })
    mocks.createTable.mockResolvedValue({ success: true })
    mocks.createIndex.mockResolvedValue({ success: true })
    mocks.addColumn.mockResolvedValue({ success: true })
    mocks.sqlQuery.mockResolvedValue({ success: true, data: [{ name: 'id' }, { name: 'user_id' }] })
    mocks.sqlGet.mockResolvedValue({ success: true, data: { exists_value: true } })
    mocks.sqlExecute.mockResolvedValue({ success: true })
    mocks.cacheInit.mockResolvedValue({ success: true })
    mocks.iamInit.mockResolvedValue({ success: true })
    mocks.storageInit.mockResolvedValue({ success: true })
    mocks.aiInit.mockResolvedValue({ success: true })
  })

  it('does not delete legacy orphan vision rows during startup', async () => {
    const { initApp } = await import('./init')

    await initApp()

    expect(mocks.sqlExecute).not.toHaveBeenCalled()
  })

  it('still adds the owner column when the legacy table is missing user_id', async () => {
    mocks.sqlQuery.mockResolvedValueOnce({ success: true, data: [{ name: 'id' }] })

    const { initApp } = await import('./init')

    await initApp()

    expect(mocks.addColumn).toHaveBeenCalledWith('vision_records', 'user_id', { type: 'TEXT' })
    expect(mocks.sqlExecute).not.toHaveBeenCalled()
  })
})
