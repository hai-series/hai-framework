/** 共享数据库变更不得被节点本地授权缓存遮蔽。 */
import { expect, it } from 'vitest'
import { defineIamSuite, initIam, postgresRedisEnv, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'

function tests() {
  it('其他节点撤销与重新指定超管角色后，当前节点立即使用最新角色代码', async () => {
    const iam = await initIam({ seedDefaultData: false, rbac: { defaultRole: '', superAdminRole: 'shared-super' } })
    const user = await iam.user.createUser({ username: `shared-policy-${crypto.randomUUID()}`, password: TEST_PASSWORD })
    const role = await iam.authz.createRole({ code: 'shared-super', name: 'Shared administrator' })
    expect(user.success && role.success).toBe(true)
    if (!user.success || !role.success)
      return
    expect((await iam.authz.assignRole(user.data.user.id, role.data.id)).success).toBe(true)
    expect(await iam.authz.checkPermission(user.data.user.id, 'unassigned:write')).toMatchObject({ success: true, data: true })
    // 通过公开写 API 推进共享缓存代际；独立进程用例验证另一个节点。
    expect((await iam.authz.updateRole(role.data.id, { code: 'former-shared-super' })).success).toBe(true)
    expect(await iam.authz.checkPermission(user.data.user.id, 'unassigned:write')).toMatchObject({ success: true, data: false })
    expect((await iam.authz.updateRole(role.data.id, { code: 'shared-super' })).success).toBe(true)
    expect(await iam.authz.checkPermission(user.data.user.id, 'unassigned:write')).toMatchObject({ success: true, data: true })
  })
}

defineIamSuite('shared policy sqlite+memory', sqliteMemoryEnv(), tests)
defineIamSuite('shared policy postgres+redis', postgresRedisEnv, tests)
