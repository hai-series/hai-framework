import { cache } from '@h-ai/cache'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HaiIamError, iam } from '../src/index.js'
import { TEST_PASSWORD } from './helpers/iam-test-suite.js'

describe('iam atomic role permission replacement', () => {
  beforeEach(async () => {
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
    expect((await cache.init({ type: 'memory' })).success).toBe(true)
    expect(await iam.init({})).toMatchObject({ success: true })
  })
  afterEach(async () => {
    await iam.close()
    await cache.close()
    await reldb.close()
  })

  it('returns a failure instead of zero members when the relation table cannot be read', async () => {
    expect((await reldb.sql.execute('DROP TABLE hai_iam_user_roles')).success).toBe(true)
    expect(await iam.authz.getRoleUserCounts(['role-id'])).toMatchObject({ success: false })
  })

  it('rolls back role creation when a requested permission does not exist', async () => {
    expect((await iam.authz.createRole({
      code: 'atomic-create',
      name: 'atomic',
      permissionIds: ['missing'],
    })).success).toBe(false)
    expect(await iam.authz.getRoleByCode('atomic-create')).toMatchObject({ success: true, data: null })
  })

  it('rolls back metadata and earlier permission writes when a later insert fails', async () => {
    const old = await iam.authz.createPermission({ code: 'atomic:old', name: 'old' })
    const first = await iam.authz.createPermission({ code: 'atomic:first', name: 'first' })
    const second = await iam.authz.createPermission({ code: 'atomic:second', name: 'second' })
    expect(old.success && first.success && second.success).toBe(true)
    if (!old.success || !first.success || !second.success)
      return
    const role = await iam.authz.createRole({
      code: 'atomic-update',
      name: 'before',
      permissionIds: [old.data.id],
    })
    expect(role.success).toBe(true)
    if (!role.success)
      return
    // 真实数据库在第二次 INSERT 注入错误，验证第一次 INSERT 与 DELETE 也被回滚。
    expect((await reldb.sql.execute(`CREATE TRIGGER reject_permission BEFORE INSERT ON hai_iam_role_permissions WHEN NEW.permission_id = '${second.data.id}' BEGIN SELECT RAISE(ABORT, 'injected insert failure'); END`)).success).toBe(true)
    expect((await iam.authz.updateRole(role.data.id, {
      name: 'after',
      permissionIds: [first.data.id, second.data.id],
    })).success).toBe(false)
    expect(await iam.authz.getRole(role.data.id)).toMatchObject({
      success: true,
      data: { name: 'before' },
    })
    expect(await iam.authz.getRolePermissions(role.data.id)).toMatchObject({
      success: true,
      data: [
        { id: old.data.id },
      ],
    })
  })

  it('replaces permissions without metadata and updates an existing session after commit', async () => {
    const user = await iam.user.createUser({ username: 'atomic-user', password: TEST_PASSWORD })
    expect(user.success).toBe(true)
    if (!user.success)
      return
    const permission = await iam.authz.createPermission({ code: 'atomic:view', name: 'view' })
    expect(permission.success).toBe(true)
    if (!permission.success)
      return
    const role = await iam.authz.createRole({
      code: 'atomic-session',
      name: 'session',
      permissionIds: [permission.data.id],
    })
    expect(role.success).toBe(true)
    if (!role.success)
      return
    // 真实用户默认带有 user 角色；本用例只保留被测角色，隔离默认权限而非伪造用户。
    expect((await iam.authz.syncRoles(user.data.user.id, [role.data.id])).success).toBe(true)
    const session = await iam.session.create({
      userId: user.data.user.id,
      roles: ['atomic-session'],
      permissions: ['atomic:view'],
    })
    expect(session.success).toBe(true)
    if (!session.success)
      return
    expect(await iam.session.get(session.data.accessToken)).toMatchObject({
      success: true,
      data: {
        userId: user.data.user.id,
        permissions: ['atomic:view'],
      },
    })
    expect((await iam.authz.updateRole(role.data.id, { permissionIds: [] })).success).toBe(true)
    expect(await iam.authz.getRolePermissions(role.data.id)).toMatchObject({ success: true, data: [] })
    expect(await iam.session.get(session.data.accessToken)).toMatchObject({
      success: true,
      data: { permissions: [] },
    })
  })

  it('concurrent replacements leave one complete set, never a union', async () => {
    const a = await iam.authz.createPermission({ code: 'atomic:a', name: 'a' })
    const b = await iam.authz.createPermission({ code: 'atomic:b', name: 'b' })
    const role = await iam.authz.createRole({ code: 'atomic-concurrent', name: 'initial' })
    expect(a.success && b.success && role.success).toBe(true)
    if (!a.success || !b.success || !role.success)
      return
    const results = await Promise.all([
      iam.authz.updateRole(role.data.id, {
        name: 'a',
        permissionIds: [a.data.id],
      }),
      iam.authz.updateRole(role.data.id, {
        name: 'b',
        permissionIds: [b.data.id],
      }),
    ])
    expect(results.some(result => result.success)).toBe(true)
    const latest = await iam.authz.getRole(role.data.id)
    expect(latest.success).toBe(true)
    if (!latest.success || !latest.data)
      return
    expect(await iam.authz.getRolePermissions(role.data.id)).toMatchObject({
      success: true,
      data: [
        {
          id: latest.data.name === 'a'
            ? a.data.id
            : b.data.id,
        },
      ],
    })
  })

  it('commits profile, lifecycle and roles together and revokes the old credential generation only on success', async () => {
    const created = await iam.user.createUser({ username: 'atomic-account', password: TEST_PASSWORD, displayName: 'before' })
    const login = await iam.auth.login({ identifier: 'atomic-account', password: TEST_PASSWORD })
    const role = await iam.authz.createRole({ code: 'atomic-account-reviewer', name: 'Reviewer' })
    expect(created.success && login.success && role.success).toBe(true)
    if (!created.success || !login.success || !role.success)
      return

    const { id } = created.data.user
    const accessToken = login.data.tokens.accessToken
    const storedVersion = () => reldb.sql.get('SELECT credential_version, reset_version FROM hai_iam_users WHERE id = ?', [id])
    const before = await storedVersion()
    const oldRoles = await iam.authz.getUserRoles(id)
    expect(before.success && oldRoles.success).toBe(true)
    expect(await iam.user.updateUserWithRoles(id, {
      profile: { displayName: 'after', accountStatus: 'dormant' },
      roleIds: [role.data.id, 'no-such-role'],
    })).toMatchObject({
      success: false,
      error: { code: HaiIamError.ROLE_NOT_FOUND.code },
    })
    expect(await iam.user.getUser(id)).toMatchObject({
      success: true,
      data: { displayName: 'before', accountStatus: 'active' },
    })
    expect(await iam.authz.getUserRoles(id)).toEqual(oldRoles)
    expect(await storedVersion()).toEqual(before)
    expect((await iam.auth.verifyToken(accessToken)).success).toBe(true)

    expect(await iam.user.updateUserWithRoles(id, {
      profile: { displayName: 'after', accountStatus: 'dormant' },
      roleIds: [role.data.id],
    })).toMatchObject({
      success: true,
      data: { displayName: 'after', accountStatus: 'dormant' },
    })
    expect(await iam.authz.getUserRoles(id)).toMatchObject({
      success: true,
      data: [
        { id: role.data.id },
      ],
    })
    const after = await storedVersion()
    expect(after.success).toBe(true)
    expect(after).not.toEqual(before)
    expect((await iam.auth.verifyToken(accessToken)).success).toBe(false)
  })

  it('preserves omitted roles, clears an empty set and keeps active sessions on role-only updates', async () => {
    const created = await iam.user.createUser({ username: 'atomic-role-only', password: TEST_PASSWORD })
    const login = await iam.auth.login({ identifier: 'atomic-role-only', password: TEST_PASSWORD })
    const role = await iam.authz.createRole({ code: 'atomic-only-reviewer', name: 'Reviewer' })
    expect(created.success && login.success && role.success).toBe(true)
    if (!created.success || !login.success || !role.success)
      return

    const { id } = created.data.user
    const accessToken = login.data.tokens.accessToken
    expect((await iam.user.updateUserWithRoles(id, {
      roleIds: [role.data.id],
    })).success).toBe(true)
    expect((await iam.user.updateUserWithRoles(id, {
      profile: { displayName: 'Renamed' },
    })).success).toBe(true)
    expect(await iam.auth.verifyToken(accessToken)).toMatchObject({
      success: true,
      data: {
        roles: [role.data.code],
      },
    })
    expect(await iam.session.get(accessToken)).toMatchObject({
      success: true,
      data: {
        roles: [role.data.code],
      },
    })
    expect((await iam.user.updateUserWithRoles(id, { roleIds: [] })).success).toBe(true)
    expect(await iam.authz.getUserRoles(id)).toMatchObject({ success: true, data: [] })
    expect(await iam.auth.verifyToken(accessToken)).toMatchObject({
      success: true,
      data: { roles: [] },
    })
  })
})
