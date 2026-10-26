/** 管理端初始凭据采用独立随机秘密和一次性邀请，明文不返回或持久化。 */
import type { User } from '../src/index.js'
import { reldb } from '@h-ai/reldb'
import { expect, it } from 'vitest'
import { createDbUserRepository } from '../src/user/iam-user-repository-user.js'
import { defineIamSuite, initIam, postgresRedisEnv, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'

function tests() {
  it('关闭或缺少发送能力时不创建半成品账号', async () => {
    const iam = await initIam()
    const username = `off-${crypto.randomUUID()}`
    expect((await iam.user.inviteUser({ username, email: 'alice@example.com' })).success).toBe(false)
    await initIam({ initialCredentials: { enabled: true } })
    expect((await iam.user.inviteUser({ username, email: 'alice@example.com' })).success).toBe(false)
    expect(await (await createDbUserRepository()).findByUsername(username)).toMatchObject({ success: true, data: null })
  })

  it('每个邀请独立且短期单用，接收人选好密码后才能登录', async () => {
    const delivered: { user: User, token: string }[] = []
    const iam = await initIam({ initialCredentials: { enabled: true }, passwordReset: { tokenExpiresIn: 300 }, onPasswordResetRequest: async (user, token) => {
      delivered.push({ user, token })
    } })
    for (let index = 0; index < 2; index++) {
      const created = await iam.user.inviteUser({ username: `invite-${crypto.randomUUID()}`, email: `alice-${index}@example.com` })
      expect(created.success).toBe(true)
      if (created.success)
        expect(created.data.user).not.toHaveProperty('password')
    }
    expect(delivered).toHaveLength(2)
    expect(delivered[0]!.token).not.toBe(delivered[1]!.token)
    const first = delivered[0]!
    expect((await iam.auth.login({ identifier: first.user.username, password: TEST_PASSWORD })).success).toBe(false)
    const row = await reldb.sql.get<{ reset_hash: string, password_hash: string }>('SELECT reset_hash, password_hash FROM hai_iam_users WHERE id = ?', [first.user.id])
    expect(row.success).toBe(true)
    if (row.success) {
      expect(row.data?.reset_hash).not.toBe(first.token)
      expect(row.data?.password_hash).not.toContain(first.token)
    }
    expect((await iam.user.confirmPasswordReset(first.token, 'SelectedPassword123!')).success).toBe(true)
    expect((await iam.user.confirmPasswordReset(first.token, 'OtherPassword123!')).success).toBe(false)
    expect((await iam.auth.login({ identifier: first.user.username, password: 'SelectedPassword123!' })).success).toBe(true)
    // 最终提交使用数据库时钟；把第二条测试邀请设为已过期，不能用进程假时间冒充数据库时间。
    expect((await reldb.sql.execute('UPDATE hai_iam_users SET reset_expires_at = ? WHERE id = ?', [Date.now() - 1000, delivered[1]!.user.id])).success).toBe(true)
    expect((await iam.user.confirmPasswordReset(delivered[1]!.token, 'SelectedPassword123!')).success).toBe(false)
  })

  it('投递未知明确返回失败并保留已创建账号，不能回滚可能已送达的凭据', async () => {
    const iam = await initIam({ initialCredentials: { enabled: true }, onPasswordResetRequest: async () => {
      throw new Error('Provider timeout')
    } })
    const username = `unknown-${crypto.randomUUID()}`
    expect((await iam.user.inviteUser({ username, email: 'unknown@example.com' })).success).toBe(false)
    const existing = await (await createDbUserRepository()).findByUsername(username)
    expect(existing.success && existing.data?.username).toBe(username)
    expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).success).toBe(false)
  })
}

defineIamSuite('invitation sqlite+memory', sqliteMemoryEnv(), tests)
defineIamSuite('invitation postgres+redis', postgresRedisEnv, tests)
