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

  it('web与App分别限制且共享全局额度，刷新保留终端分组', async () => {
    const { iam, username } = await account({ maxSessions: 3, terminalLimits: { web: 2, app: 1 } })
    const login = (terminalType: 'web' | 'app' | 'desktop') => iam.auth.login({ identifier: username, password: TEST_PASSWORD }, { terminalType })
    const first = await login('web')
    const second = await login('web')
    const app = await login('app')
    expect(first.success && second.success && app.success).toBe(true)
    expect((await login('web')).success).toBe(false)
    expect((await login('app')).success).toBe(false)
    expect((await login('desktop')).success).toBe(false)
    if (!app.success)
      throw new Error(app.error.message)
    const refreshed = await iam.session.refresh(app.data.tokens.refreshToken)
    if (!refreshed.success)
      throw new Error(refreshed.error.message)
    const current = await iam.auth.verifyToken(refreshed.data.accessToken)
    expect(current.success && current.data.terminalType).toBe('app')
    if (!current.success)
      throw new Error(current.error.message)
    expect((await iam.session.update(refreshed.data.accessToken, { terminalType: 'web' }, current.data.version)).success).toBe(false)
  })

  it('同类终端替换不踢掉其他终端，全局单会话仍优先', async () => {
    const { iam, username } = await account({ terminalLimits: { web: 2, app: 1 }, terminalLimitMode: 'replace' })
    const login = (terminalType: 'web' | 'app') => iam.auth.login({ identifier: username, password: TEST_PASSWORD }, { terminalType })
    const web = await login('web')
    const old = await login('app')
    const next = await login('app')
    expect(web.success && old.success && next.success).toBe(true)
    if (!web.success || !old.success || !next.success)
      throw new Error('Terminal setup failed')
    expect((await iam.auth.verifyToken(web.data.tokens.accessToken)).success).toBe(true)
    expect((await iam.auth.verifyToken(old.data.tokens.accessToken)).success).toBe(false)
    expect((await iam.session.refresh(old.data.tokens.refreshToken)).success).toBe(false)
    const only = await account({ maxSessions: 1, terminalLimits: { web: 2, app: 1 }, terminalLimitMode: 'replace' })
    expect((await only.iam.auth.login({ identifier: only.username, password: TEST_PASSWORD }, { terminalType: 'web' })).success).toBe(true)
    expect((await only.iam.auth.login({ identifier: only.username, password: TEST_PASSWORD }, { terminalType: 'app' })).success).toBe(false)
  })

  it('多并发签发不能突破各终端及全局上限', async () => {
    const { iam, username } = await account({ maxSessions: 3, terminalLimits: { web: 2, app: 1 } })
    const logins = await Promise.all(Array.from({ length: 12 }, (_, index) => iam.auth.login({ identifier: username, password: TEST_PASSWORD }, { terminalType: index % 2 ? 'app' : 'web' })))
    expect(logins.filter(result => result.success)).toHaveLength(3)
    const active = await Promise.all(logins.flatMap(result => result.success ? [iam.auth.verifyToken(result.data.tokens.accessToken)] : []))
    expect(active.filter(result => result.success && result.data.terminalType === 'web')).toHaveLength(2)
    expect(active.filter(result => result.success && result.data.terminalType === 'app')).toHaveLength(1)
  })

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
