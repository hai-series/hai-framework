/** 可选会话策略必须同时约束 access、refresh 与并发签发。 */
import type { IamConfigInput } from '../src/index.js'
import { afterEach, expect, it, vi } from 'vitest'
import { defineIamSuite, initIam, postgresRedisEnv, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'

function tests() {
  afterEach(() => vi.useRealTimers())

  async function account(session: IamConfigInput['session']) {
    const iam = await initIam({ session })
    const username = `policy-${crypto.randomUUID()}`
    const created = await iam.user.register({ username, password: TEST_PASSWORD })
    expect(created.success).toBe(true)
    return { iam, username }
  }

  it('关闭闲置策略时保留 access 到期后 refresh 的既有行为', async () => {
    const { iam, username } = await account({ maxAge: 60, sliding: false, idleTimeout: 0 })
    const login = await iam.auth.login({ identifier: username, password: TEST_PASSWORD })
    if (!login.success)
      throw new Error(login.error.message)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 61_000)
    expect((await iam.auth.verifyToken(login.data.tokens.accessToken)).success).toBe(false)
    expect((await iam.session.refresh(login.data.tokens.refreshToken)).success).toBe(true)
  })

  it('启用闲置期限后 access 和 refresh 均不能复活已闲置会话', async () => {
    const { iam, username } = await account({ maxAge: 3600, idleTimeout: 120 })
    const login = await iam.auth.login({ identifier: username, password: TEST_PASSWORD })
    if (!login.success)
      throw new Error(login.error.message)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 120_001)
    const refreshes = await Promise.all(Array.from({ length: 4 }, () => iam.session.refresh(login.data.tokens.refreshToken)))
    expect(refreshes.every(result => !result.success)).toBe(true)
    expect((await iam.auth.verifyToken(login.data.tokens.accessToken)).success).toBe(false)
  })

  it('access 到期但未闲置时可以刷新，活动与绝对期限分别执行', async () => {
    const { iam, username } = await account({ maxAge: 60, sliding: false, idleTimeout: 120, absoluteTimeout: 180 })
    const login = await iam.auth.login({ identifier: username, password: TEST_PASSWORD })
    if (!login.success)
      throw new Error(login.error.message)
    vi.useFakeTimers({ toFake: ['Date'] })
    const start = Date.now()
    vi.setSystemTime(start + 61_000)
    const first = await iam.session.refresh(login.data.tokens.refreshToken)
    if (!first.success)
      throw new Error(first.error.message)
    expect((await iam.auth.verifyToken(first.data.accessToken)).success).toBe(true)
    vi.setSystemTime(start + 121_000)
    const second = await iam.session.refresh(first.data.refreshToken)
    if (!second.success)
      throw new Error(second.error.message)
    vi.setSystemTime(start + 180_001)
    expect((await iam.session.refresh(second.data.refreshToken)).success).toBe(false)
    expect((await iam.auth.verifyToken(second.data.accessToken)).success).toBe(false)
  })

  it('后台自动刷新本身不延长闲置期限', async () => {
    const { iam, username } = await account({ maxAge: 60, sliding: false, idleTimeout: 120 })
    const login = await iam.auth.login({ identifier: username, password: TEST_PASSWORD })
    if (!login.success)
      throw new Error(login.error.message)
    vi.useFakeTimers({ toFake: ['Date'] })
    const start = Date.now()
    vi.setSystemTime(start + 100_000)
    const refreshed = await iam.session.refresh(login.data.tokens.refreshToken)
    if (!refreshed.success)
      throw new Error(refreshed.error.message)
    vi.setSystemTime(start + 121_000)
    expect((await iam.session.refresh(refreshed.data.refreshToken)).success).toBe(false)
    expect((await iam.auth.verifyToken(refreshed.data.accessToken)).success).toBe(false)
  })

  it('有成功活动时滑动闲置期限，但不会缩短已提交的最后活动时间', async () => {
    const { iam, username } = await account({ maxAge: 3600, idleTimeout: 120 })
    const login = await iam.auth.login({ identifier: username, password: TEST_PASSWORD })
    if (!login.success)
      throw new Error(login.error.message)
    vi.useFakeTimers({ toFake: ['Date'] })
    const start = Date.now()
    vi.setSystemTime(start + 100_000)
    expect((await iam.auth.verifyToken(login.data.tokens.accessToken)).success).toBe(true)
    vi.setSystemTime(start + 200_000)
    expect((await iam.auth.verifyToken(login.data.tokens.accessToken)).success).toBe(true)
    vi.setSystemTime(start + 321_000)
    expect((await iam.auth.verifyToken(login.data.tokens.accessToken)).success).toBe(false)
  })

  it('不滑动 access 时也记录真实活动用于闲置校验', async () => {
    const { iam, username } = await account({ maxAge: 3600, sliding: false, idleTimeout: 120 })
    const login = await iam.auth.login({ identifier: username, password: TEST_PASSWORD })
    if (!login.success)
      throw new Error(login.error.message)
    vi.useFakeTimers({ toFake: ['Date'] })
    const start = Date.now()
    vi.setSystemTime(start + 100_000)
    expect((await iam.auth.verifyToken(login.data.tokens.accessToken)).success).toBe(true)
    vi.setSystemTime(start + 200_000)
    expect((await iam.auth.verifyToken(login.data.tokens.accessToken)).success).toBe(true)
    vi.setSystemTime(start + 321_000)
    expect((await iam.auth.verifyToken(login.data.tokens.accessToken)).success).toBe(false)
  })

  it('共享原子配额不允许并发登录超过配置数量，退出后释放名额', async () => {
    const { iam, username } = await account({ maxSessions: 2 })
    const logins = await Promise.all(Array.from({ length: 6 }, () => iam.auth.login({ identifier: username, password: TEST_PASSWORD })))
    const successes = logins.filter(result => result.success)
    expect(successes).toHaveLength(2)
    const first = successes[0]!
    if (!first.success)
      throw new Error(first.error.message)
    expect((await iam.auth.logout(first.data.tokens.accessToken)).success).toBe(true)
    expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).success).toBe(true)
  })

  it('闲置结束的可刷新会话不继续占用配额', async () => {
    const { iam, username } = await account({ maxSessions: 1, idleTimeout: 60 })
    const first = await iam.auth.login({ identifier: username, password: TEST_PASSWORD })
    if (!first.success)
      throw new Error(first.error.message)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 60_001)
    expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).success).toBe(true)
    expect((await iam.session.refresh(first.data.tokens.refreshToken)).success).toBe(false)
  })

  it('拒绝重复登录模式保留旧会话，默认单设备模式仍为顶旧保新', async () => {
    const { iam, username } = await account({ singleDevice: true, singleDeviceMode: 'reject' })
    const first = await iam.auth.login({ identifier: username, password: TEST_PASSWORD })
    if (!first.success)
      throw new Error(first.error.message)
    expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).success).toBe(false)
    expect((await iam.auth.verifyToken(first.data.tokens.accessToken)).success).toBe(true)
    await initIam({ session: { singleDevice: true } })
    const replacement = await iam.auth.login({ identifier: username, password: TEST_PASSWORD })
    expect(replacement.success).toBe(true)
    expect((await iam.auth.verifyToken(first.data.tokens.accessToken)).success).toBe(false)
  })

  it('配额关闭时允许多会话且每次生成新的服务端凭据', async () => {
    const { iam, username } = await account({ maxSessions: 0, singleDevice: false })
    const logins = await Promise.all(Array.from({ length: 4 }, () => iam.auth.login({ identifier: username, password: TEST_PASSWORD })))
    expect(logins.every(result => result.success)).toBe(true)
    const tokens = logins.flatMap(result => result.success ? [result.data.tokens.accessToken, result.data.tokens.refreshToken] : [])
    expect(new Set(tokens).size).toBe(8)
  })
}

defineIamSuite('session policy sqlite+memory', sqliteMemoryEnv(), tests)
defineIamSuite('session policy postgres+redis', postgresRedisEnv, tests)
