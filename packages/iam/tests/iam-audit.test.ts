/** IAM 直接调用也记录关键成功、失败及拒绝，不记录凭据或敏感业务字段。 */
import { audit } from '@h-ai/audit'
import { core, err } from '@h-ai/core'
import { HaiReldbError, reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineIamSuite, initIam, postgresRedisEnv, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'

function tests() {
  beforeEach(async () => {
    expect((await audit.init()).success).toBe(true)
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await audit.close()
  })

  it('账号与改密事件使用操作者快照和目标 ID，失败只记录原因码', async () => {
    const iam = await initIam()
    const requestId = crypto.randomUUID()
    await audit.withContext({ requestId, actor: { id: 'security-operator', username: 'Security operator', roles: ['system-manager'] } }, async () => {
      const user = await iam.user.createUser({ username: `audited-${crypto.randomUUID()}`, password: TEST_PASSWORD })
      if (!user.success)
        throw new Error(user.error.message)
      expect((await iam.user.updateUser(user.data.user.id, { accountStatus: 'dormant', metadata: { email: 'private@example.com' } })).success).toBe(true)
      expect((await iam.user.changePassword(user.data.user.id, 'wrong-password', 'NewSelected123!')).success).toBe(false)
      const logs = await audit.list({ requestId, resource: 'iam.users' })
      expect(logs).toMatchObject({ success: true, data: { total: 3 } })
      if (logs.success) {
        expect(logs.data.items).toEqual(expect.arrayContaining([
          expect.objectContaining({ action: 'user.create', outcome: 'success', resourceId: user.data.user.id, actorSnapshot: { id: 'security-operator', username: 'Security operator', roles: ['system-manager'] } }),
          expect.objectContaining({ action: 'user.update', outcome: 'success', category: 'system' }),
          expect.objectContaining({ action: 'password.change', outcome: 'denied' }),
        ]))
        const serialized = JSON.stringify(logs.data.items)
        for (const secret of [TEST_PASSWORD, 'wrong-password', 'NewSelected123!', 'private@example.com'])
          expect(serialized).not.toContain(secret)
      }
    })
  })

  it('登录成功记录主体及角色，失败和会话限额拒绝独立可查', async () => {
    const iam = await initIam({ session: { maxSessions: 1 } })
    const requestId = crypto.randomUUID()
    const username = `audited-login-${crypto.randomUUID()}`
    expect((await iam.user.register({ username, password: TEST_PASSWORD })).success).toBe(true)
    await audit.withContext({ requestId }, async () => {
      expect((await iam.auth.login({ identifier: username, password: 'incorrect' })).success).toBe(false)
      expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).success).toBe(true)
      expect((await iam.auth.login({ identifier: username, password: TEST_PASSWORD })).success).toBe(false)
      const logs = await audit.list({ requestId, action: 'auth.login' })
      expect(logs).toMatchObject({ success: true, data: { total: 3 } })
      if (logs.success) {
        const success = logs.data.items.find(row => row.outcome === 'success')
        expect(success?.actorSnapshot).toMatchObject({ username, roles: expect.arrayContaining(['user']) })
        expect(logs.data.items.filter(row => row.outcome !== 'success')).toHaveLength(2)
        expect(JSON.stringify(logs.data.items)).not.toContain(TEST_PASSWORD)
      }
    })
  })

  it('角色变更审计跟随调用者事务，回滚不留下成功事件', async () => {
    const iam = await initIam()
    const requestId = crypto.randomUUID()
    await audit.withContext({ requestId, actor: { id: 'transaction-actor', roles: ['system-manager'] } }, async () => {
      for (const commit of [false, true]) {
        const opened = await reldb.tx.begin()
        if (!opened.success)
          throw new Error(opened.error.message)
        let finished = false
        try {
          expect((await iam.authz.createRole({ code: `audited-role-${crypto.randomUUID()}`, name: 'Audited role' }, opened.data)).success).toBe(true)
          if (commit) {
            expect((await opened.data.commit()).success).toBe(true)
            finished = true
          }
        }
        finally {
          if (!finished)
            await opened.data.rollback()
        }
      }
      expect(await audit.list({ requestId, action: 'role.create' })).toMatchObject({ success: true, data: { total: 1 } })
    })
  })

  it('审计写失败保留已生效修改但拒绝提交未完成事务，关闭采集不影响业务', async () => {
    const iam = await initIam()
    const created = await iam.user.createUser({ username: `audit-unavailable-${crypto.randomUUID()}`, password: TEST_PASSWORD })
    if (!created.success)
      throw new Error(created.error.message)
    const execute = reldb.sql.execute.bind(reldb.sql)
    const observations: unknown[] = []
    const stop = core.logger.observe(record => observations.push(record))
    vi.spyOn(reldb.sql, 'execute').mockImplementation((sql, params) => sql.startsWith('INSERT INTO hai_audit_logs') ? Promise.resolve(err(HaiReldbError.QUERY_FAILED, 'Injected audit write failure')) : execute(sql, params))
    try {
      expect((await iam.user.updateUser(created.data.user.id, { displayName: 'Updated name' })).success).toBe(true)
      expect(await iam.user.getUser(created.data.user.id)).toMatchObject({ success: true, data: { displayName: 'Updated name' } })
      expect(JSON.stringify(observations)).toContain('IAM event audit failed')
      const opened = await reldb.tx.begin()
      if (!opened.success)
        throw new Error(opened.error.message)
      const transactionExecute = opened.data.execute.bind(opened.data)
      vi.spyOn(opened.data, 'execute').mockImplementation((sql, params) => sql.startsWith('INSERT INTO hai_audit_logs') ? Promise.resolve(err(HaiReldbError.QUERY_FAILED, 'Injected transactional audit write failure')) : transactionExecute(sql, params))
      const code = `audit-failure-role-${crypto.randomUUID()}`
      try {
        expect(await iam.authz.createRole({ code, name: 'Pending role' }, opened.data)).toMatchObject({ success: false })
      }
      finally {
        expect((await opened.data.rollback()).success).toBe(true)
      }
      expect(await iam.authz.getRoleByCode(code)).toMatchObject({ success: true, data: null })
    }
    finally {
      stop()
      vi.restoreAllMocks()
    }
    expect((await audit.init({ capture: { enabled: false } })).success).toBe(true)
    const requestId = crypto.randomUUID()
    await audit.withContext({ requestId }, async () => {
      expect((await iam.user.createUser({ username: `audit-disabled-${crypto.randomUUID()}`, password: TEST_PASSWORD })).success).toBe(true)
      expect(await audit.list({ requestId })).toMatchObject({ success: true, data: { total: 0 } })
    })
  })
}

defineIamSuite('audit SQLite', sqliteMemoryEnv, tests)
defineIamSuite('audit PostgreSQL+Redis', postgresRedisEnv, tests)
