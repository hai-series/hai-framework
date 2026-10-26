/** 敏感操作证明绑定主体、当前会话和操作；共享缓存只允许一次消费。 */
import { afterEach, expect, it, vi } from 'vitest'
import { defineIamSuite, initIam, postgresRedisEnv, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'

function tests() {
  afterEach(() => vi.useRealTimers())

  async function signIn(iam: Awaited<ReturnType<typeof initIam>>) {
    const result = await iam.auth.registerAndLogin({ username: `reauth-${crypto.randomUUID()}`, password: TEST_PASSWORD })
    if (!result.success)
      throw new Error(result.error.message)
    return result.data.tokens.accessToken
  }

  it('关闭或未选操作不增加认证步骤；选定操作缺少证明会拒绝', async () => {
    const iam = await initIam({ reauthentication: { enabled: false, operations: ['user.delete'] } })
    const token = await signIn(iam)
    expect((await iam.auth.checkSensitiveOperation(token, 'user.delete')).success).toBe(true)
    await initIam({ reauthentication: { enabled: true, operations: ['user.delete'] } })
    expect((await iam.auth.checkSensitiveOperation(token, 'report.read')).success).toBe(true)
    expect((await iam.auth.checkSensitiveOperation(token, 'user.delete')).success).toBe(false)
    expect((await iam.auth.checkSensitiveOperation('invalid-token', 'report.read')).success).toBe(false)
  })

  it('错误密码不签发证明，正确证明只允许选定操作单次并发消费', async () => {
    const iam = await initIam({ reauthentication: { enabled: true, operations: ['user.delete'] } })
    const token = await signIn(iam)
    expect((await iam.auth.reauthenticate(token, 'wrong', 'user.delete')).success).toBe(false)
    const proof = await iam.auth.reauthenticate(token, TEST_PASSWORD, 'user.delete')
    if (!proof.success)
      throw new Error(proof.error.message)
    const attempts = await Promise.all(Array.from({ length: 5 }, () => iam.auth.checkSensitiveOperation(token, 'user.delete', proof.data.ticket)))
    expect(attempts.filter(result => result.success)).toHaveLength(1)
    expect((await iam.auth.checkSensitiveOperation(token, 'user.delete', proof.data.ticket)).success).toBe(false)
  })

  it('证明不能跨操作、跨用户、跨会话使用，撤销会话后也失效', async () => {
    const iam = await initIam({ reauthentication: { enabled: true, operations: ['user.delete', 'user.update'] } })
    const token = await signIn(iam)
    const other = await signIn(iam)
    const current = await iam.auth.verifyToken(token)
    if (!current.success)
      throw new Error(current.error.message)
    const anotherSession = await iam.session.create({ userId: current.data.userId })
    if (!anotherSession.success)
      throw new Error(anotherSession.error.message)
    for (const [targetToken, operation] of [[token, 'user.update'], [other, 'user.delete'], [anotherSession.data.accessToken, 'user.delete']] as const) {
      const proof = await iam.auth.reauthenticate(token, TEST_PASSWORD, 'user.delete')
      if (!proof.success)
        throw new Error(proof.error.message)
      expect((await iam.auth.checkSensitiveOperation(targetToken, operation, proof.data.ticket)).success).toBe(false)
    }
    const proof = await iam.auth.reauthenticate(token, TEST_PASSWORD, 'user.delete')
    if (!proof.success)
      throw new Error(proof.error.message)
    await iam.auth.logout(token)
    expect((await iam.auth.checkSensitiveOperation(token, 'user.delete', proof.data.ticket)).success).toBe(false)
  })

  it('短期证明到期后不能使用', async () => {
    const iam = await initIam({ reauthentication: { enabled: true, operations: ['user.delete'], ttlSeconds: 10 } })
    const token = await signIn(iam)
    const proof = await iam.auth.reauthenticate(token, TEST_PASSWORD, 'user.delete')
    if (!proof.success)
      throw new Error(proof.error.message)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 11_000)
    expect((await iam.auth.checkSensitiveOperation(token, 'user.delete', proof.data.ticket)).success).toBe(false)
  })
}

defineIamSuite('reauthentication sqlite+memory', sqliteMemoryEnv(), tests)
defineIamSuite('reauthentication postgres+redis', postgresRedisEnv, tests)
