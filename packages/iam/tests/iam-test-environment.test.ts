import { beforeEach, expect, it, vi } from 'vitest'
import { fullIntegrationEnv, postgresRedisEnv } from './helpers/iam-test-suite.js'

const state = vi.hoisted(() => ({
  postgres: vi.fn(),
  redis: vi.fn(),
  ldap: vi.fn(),
  initDb: vi.fn(),
  closeDb: vi.fn(),
  query: vi.fn(),
  initCache: vi.fn(),
  closeCache: vi.fn(),
}))

vi.mock('../../reldb/src/index.js', () => ({ reldb: { isInitialized: false, init: state.initDb, close: state.closeDb, sql: { query: state.query } } }))
vi.mock('../../cache/src/index.js', () => ({ cache: { isInitialized: false, init: state.initCache, close: state.closeCache } }))
vi.mock('../src/index.js', () => ({ iam: {} }))
vi.mock('./helpers/postgres-container.js', () => ({ acquirePostgresContainer: state.postgres }))
vi.mock('./helpers/redis-container.js', () => ({ acquireRedisContainer: state.redis }))
vi.mock('./helpers/ldap-container.js', () => ({ acquireLdapContainer: state.ldap }))

beforeEach(() => {
  vi.resetAllMocks()
  for (const operation of [state.initDb, state.closeDb, state.initCache, state.closeCache])
    operation.mockResolvedValue({ success: true, data: undefined })
  state.query.mockResolvedValue({ success: true, data: [] })
})

function createLease() {
  return { host: '127.0.0.1', port: 5432, database: 'test', user: 'test', password: 'test', release: vi.fn(async () => {}) }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const environments = [
  { name: 'postgres+redis', create: postgresRedisEnv, services: ['postgres', 'redis'] as const },
  { name: 'postgres+redis+ldap', create: fullIntegrationEnv, services: ['postgres', 'redis', 'ldap'] as const },
]

it.each(environments)('$name：一项启动失败仍回收其他已取得的租约', async ({ create, services }) => {
  const leases = { postgres: createLease(), redis: createLease(), ldap: createLease() }
  const postgres = deferred<ReturnType<typeof createLease>>()
  state.postgres.mockReturnValue(postgres.promise)
  state.redis.mockResolvedValue(leases.redis)
  state.ldap.mockResolvedValue(leases.ldap)
  const env = await create()
  const started = expect(env.setup()).rejects.toThrow('postgres unavailable')
  await Promise.resolve()
  postgres.reject(new Error('postgres unavailable'))
  await started
  await env.cleanup()
  await env.cleanup()
  for (const service of services.filter(service => service !== 'postgres'))
    expect(leases[service].release).toHaveBeenCalledTimes(1)
  expect(leases.postgres.release).not.toHaveBeenCalled()
  expect(state.initDb).not.toHaveBeenCalled()
})

it.each(environments)('$name：清理期间及结束后晚到的租约都会释放，且不继续初始化', async ({ create, services }) => {
  const leases = { postgres: createLease(), redis: createLease(), ldap: createLease() }
  const pending = { postgres: deferred<ReturnType<typeof createLease>>(), redis: deferred<ReturnType<typeof createLease>>(), ldap: deferred<ReturnType<typeof createLease>>() }
  for (const service of services)
    state[service].mockReturnValue(pending[service].promise)
  const env = await create()
  const started = expect(env.setup()).rejects.toThrow('Test environment was cleaned up during startup')
  const closingCache = deferred<void>()
  state.closeCache.mockReturnValueOnce(closingCache.promise)
  const cleaning = env.cleanup()
  pending.redis.resolve(leases.redis)
  closingCache.resolve()
  await cleaning
  for (const service of services.filter(service => service !== 'redis'))
    pending[service].resolve(leases[service])
  await started
  await env.cleanup()
  await vi.waitFor(() => {
    for (const service of services)
      expect(leases[service].release).toHaveBeenCalledTimes(1)
  })
  expect(state.initDb).not.toHaveBeenCalled()
  expect(state.initCache).not.toHaveBeenCalled()
})

it.each(environments)('$name：成功启动后的并发清理不会重复关闭模块或释放租约', async ({ create, services }) => {
  const leases = { postgres: createLease(), redis: createLease(), ldap: createLease() }
  for (const service of services)
    state[service].mockResolvedValue(leases[service])
  const env = await create()
  await env.setup()
  expect(state.initDb).toHaveBeenCalledTimes(1)
  await Promise.all([env.cleanup(), env.cleanup()])
  expect(state.closeCache).toHaveBeenCalledTimes(1)
  expect(state.closeDb).toHaveBeenCalledTimes(1)
  for (const service of services)
    expect(leases[service].release).toHaveBeenCalledTimes(1)
})
