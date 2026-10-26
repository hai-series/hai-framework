/** 登录策略使用可信宿主上下文；凭据 JSON 中的 IP 不能取得授权。 */
import { afterEach, expect, it, vi } from 'vitest'
import { IamConfigSchema } from '../src/index.js'
import { defineIamSuite, initIam, postgresRedisEnv, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'

function tests() {
  afterEach(() => vi.useRealTimers())

  it('ip/CIDR 开关、IPv4/IPv6、拒绝优先与缺少可信地址', async () => {
    const iam = await initIam()
    const username = `access-${crypto.randomUUID()}`
    await iam.user.register({ username, password: TEST_PASSWORD })
    await initIam({ loginAccess: { enabled: true, allowIps: ['192.0.2.0/24', '2001:db8::/32'], denyIps: ['192.0.2.7'] } })
    const credentials = { identifier: username, password: TEST_PASSWORD, ip: '192.0.2.8' }
    expect((await iam.auth.login(credentials)).success).toBe(false)
    expect((await iam.auth.login(credentials, { ip: '192.0.2.7' })).success).toBe(false)
    expect((await iam.auth.login(credentials, { ip: '198.51.100.1' })).success).toBe(false)
    expect((await iam.auth.login(credentials, { ip: '::ffff:192.0.2.8' })).success).toBe(true)
    expect((await iam.auth.login(credentials, { ip: '2001:db8::42' })).success).toBe(true)
    await initIam({ loginAccess: { enabled: false, allowIps: ['192.0.2.0/24'] } })
    expect((await iam.auth.login(credentials)).success).toBe(true)
  })

  it('按时区和周几检查跨午夜时段，结束时间不包含在内', async () => {
    const iam = await initIam()
    const username = `time-${crypto.randomUUID()}`
    await iam.user.register({ username, password: TEST_PASSWORD })
    await initIam({ loginAccess: { enabled: true, timezone: 'Asia/Shanghai', windows: [{ days: [1], start: '22:00', end: '02:00' }] } })
    vi.useFakeTimers({ toFake: ['Date'] })
    const credentials = { identifier: username, password: TEST_PASSWORD }
    vi.setSystemTime(new Date('2026-10-26T14:00:00Z')) // 周一22点
    expect((await iam.auth.login(credentials)).success).toBe(true)
    vi.setSystemTime(new Date('2026-10-26T17:59:00Z')) // 周二1:59，属于周一窗口
    expect((await iam.auth.login(credentials)).success).toBe(true)
    vi.setSystemTime(new Date('2026-10-26T18:00:00Z'))
    expect((await iam.auth.login(credentials)).success).toBe(false)
    vi.setSystemTime(new Date('2026-10-27T14:00:00Z'))
    expect((await iam.auth.login(credentials)).success).toBe(false)
  })

  it('注册自动登录也不绕过限制，普通注册与登录许可分离', async () => {
    const iam = await initIam({ loginAccess: { enabled: true, allowIps: ['192.0.2.0/24'] } })
    const username = `registered-${crypto.randomUUID()}`
    expect((await iam.auth.registerAndLogin({ username, password: TEST_PASSWORD }, { ip: '198.51.100.1' })).success).toBe(false)
    expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD }, { ip: '192.0.2.8' })).success).toBe(true)
  })
}

it.each([
  { allowIps: ['192.0.2.0/99'] },
  { allowIps: ['example.com'] },
  { timezone: 'Not/AZone' },
  { windows: [{ days: [0], start: '22:00', end: '02:00' }] },
  { windows: [{ days: [1], start: '24:00', end: '02:00' }] },
])('无效策略不能静默失效：%j', (loginAccess) => {
  expect(IamConfigSchema.safeParse({ loginAccess }).success).toBe(false)
})

defineIamSuite('login access sqlite+memory', sqliteMemoryEnv(), tests)
defineIamSuite('login access postgres+redis', postgresRedisEnv, tests)
