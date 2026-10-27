/** 文件与RBAC数据库敏感操作取并集，动态变更和读取失败不能绕过服务端再认证。 */
import { reldb } from '@h-ai/reldb'
import { expect, it } from 'vitest'
import { defineIamSuite, initIam, postgresRedisEnv, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'

function tests() {
  it('文件与权限表组合，实时更新生效且清空数据库不能移除文件规则', async () => {
    const iam = await initIam({ reauthentication: { enabled: true, operations: ['file.operation'], ttlSeconds: 300 } })
    const permission = await iam.authz.createPermission({ code: `policy-${crypto.randomUUID()}`, name: '业务资源', resource: 'orders', action: 'manage', sensitiveOperations: ['\torders.approve \n', 'file.operation'] })
    if (!permission.success)
      throw new Error(permission.error.message)
    expect(await iam.authz.getSensitiveOperations('orders.approve')).toEqual({ success: true, data: ['orders.approve'] })
    expect(await iam.authz.getSensitiveOperations('unconfigured.operation')).toEqual({ success: true, data: [] })
    const config = await iam.getPublicConfig()
    expect(config.success && config.data.reauthentication.operations).toEqual(['file.operation', 'orders.approve'])
    const username = `sensitive-${crypto.randomUUID()}`
    expect((await iam.user.createUser({ username, password: TEST_PASSWORD })).success).toBe(true)
    const login = await iam.auth.login({ identifier: username, password: TEST_PASSWORD })
    if (!login.success)
      throw new Error(login.error.message)
    const token = login.data.tokens.accessToken
    expect((await iam.auth.checkSensitiveOperation(token, 'orders.approve')).success).toBe(false)
    const proof = await iam.auth.reauthenticate(token, TEST_PASSWORD, 'orders.approve')
    if (!proof.success)
      throw new Error(proof.error.message)
    expect((await iam.auth.checkSensitiveOperation(token, 'orders.approve', proof.data.ticket)).success).toBe(true)
    expect((await iam.auth.checkSensitiveOperation(token, 'orders.approve', proof.data.ticket)).success).toBe(false)
    expect((await iam.authz.setPermissionSensitiveOperations(permission.data.id, [])).success).toBe(true)
    expect((await iam.authz.setPermissionSensitiveOperations(permission.data.id, [])).success).toBe(true)
    expect((await iam.authz.setPermissionSensitiveOperations('nonexistent-permission', [])).success).toBe(false)
    expect((await iam.auth.checkSensitiveOperation(token, 'orders.approve')).success).toBe(true)
    expect((await iam.auth.checkSensitiveOperation(token, 'file.operation')).success).toBe(false)
    expect((await iam.getPublicConfig())).toMatchObject({ success: true, data: { reauthentication: { operations: ['file.operation'] } } })
    expect((await iam.authz.setPermissionSensitiveOperations(permission.data.id, [' '])).success).toBe(false)
  })

  it('原地重新登录必须仍为原主体，其他账号的正确密码不能生成恢复会话', async () => {
    const iam = await initIam({})
    const original = await iam.user.createUser({ username: `original-${crypto.randomUUID()}`, password: TEST_PASSWORD })
    const otherName = `other-${crypto.randomUUID()}`
    const other = await iam.user.createUser({ username: otherName, password: TEST_PASSWORD })
    if (!original.success || !other.success)
      throw new Error('Test users could not be created')
    const rejected = await iam.auth.login({ identifier: otherName, password: TEST_PASSWORD, expectedUserId: original.data.user.id })
    expect(rejected.success).toBe(false)
    expect((await iam.session.deleteByUserId(other.data.user.id))).toMatchObject({ success: true, data: 0 })
    expect((await iam.auth.login({ identifier: otherName, password: TEST_PASSWORD, expectedUserId: other.data.user.id })).success).toBe(true)
  })

  it('rbac关闭不读取数据库规则，主开关关闭时保留简单使用方式', async () => {
    const iam = await initIam({ rbac: { enabled: false }, reauthentication: { enabled: true, operations: ['file.only'] } })
    expect((await iam.authz.createPermission({ code: `db-${crypto.randomUUID()}`, name: 'Database rule', sensitiveOperations: ['db.only'] })).success).toBe(true)
    expect(await iam.getPublicConfig()).toMatchObject({ success: true, data: { reauthentication: { operations: ['file.only'] } } })
    await initIam({ reauthentication: { enabled: false, operations: [] } })
    expect(await iam.getPublicConfig()).toMatchObject({ success: true, data: { reauthentication: { enabled: false, operations: [] } } })
  })

  it('规则表读取失败不降级为无需二次认证', async () => {
    const iam = await initIam({ reauthentication: { enabled: true, operations: [] } })
    // 仅操作本套隔离数据库；实际驱动故障由缺失表产生，不用mock伪造通过。
    const renamed = await reldb.sql.execute('ALTER TABLE hai_iam_permissions RENAME TO hai_iam_permissions_temporarily_unavailable')
    expect(renamed.success).toBe(true)
    try {
      expect((await iam.getPublicConfig()).success).toBe(false)
    }
    finally {
      expect((await reldb.sql.execute('ALTER TABLE hai_iam_permissions_temporarily_unavailable RENAME TO hai_iam_permissions')).success).toBe(true)
    }
  })
}

defineIamSuite('sensitive permissions sqlite+memory', sqliteMemoryEnv(), tests)
defineIamSuite('sensitive permissions postgres+redis', postgresRedisEnv, tests)
