import { setImmediate } from 'node:timers/promises'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('rolls back the account when registration cannot assign its default role', async () => {
    // 禁止补偿删除，凭此区分一次事务回滚与先注册再清理用户。
    expect((await reldb.sql.execute('CREATE TRIGGER reject_registration_role BEFORE INSERT ON hai_iam_user_roles BEGIN SELECT RAISE(ABORT, \'role write failed\'); END')).success).toBe(true)
    expect((await reldb.sql.execute('CREATE TRIGGER reject_compensating_delete BEFORE DELETE ON hai_iam_users BEGIN SELECT RAISE(ABORT, \'cannot delete user\'); END')).success).toBe(true)
    expect(await iam.user.register({ username: 'atomic-register', password: TEST_PASSWORD })).toMatchObject({
      success: false,
      error: { code: HaiIamError.REPOSITORY_ERROR.code },
    })
    expect(await iam.user.listUsers({ search: 'atomic-register' })).toMatchObject({
      success: true,
      data: { total: 0 },
    })
  })

  it('commits an explicit managed role set and rolls back an invalid set', async () => {
    const role = await iam.authz.createRole({ code: 'managed-editor', name: 'Editor' })
    expect(role.success).toBe(true)
    if (!role.success)
      return
    const managed = await iam.user.createUser({ username: 'managed-editor-account', password: TEST_PASSWORD }, {
      roleIds: [role.data.id],
    })
    expect(managed.success).toBe(true)
    if (!managed.success)
      return
    expect(await iam.authz.getUserRoles(managed.data.user.id)).toMatchObject({
      success: true,
      data: [
        { id: role.data.id },
      ],
    })
    const empty = await iam.user.createUser({ username: 'managed-no-roles-account', password: TEST_PASSWORD }, { roleIds: [] })
    expect(empty.success).toBe(true)
    if (empty.success)
      expect(await iam.authz.getUserRoles(empty.data.user.id)).toMatchObject({ success: true, data: [] })

    expect(await iam.user.createUser({ username: 'managed-invalid-role', password: TEST_PASSWORD }, {
      roleIds: ['missing-role'],
    })).toMatchObject({
      success: false,
      error: { code: HaiIamError.ROLE_NOT_FOUND.code },
    })
    expect(await iam.user.listUsers({ search: 'managed-invalid-role' })).toMatchObject({
      success: true,
      data: { total: 0 },
    })
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
    const writers: Array<number | undefined> = []
    const patch = iam.session.patchUserSessions
    const synchronize = vi.spyOn(iam.session, 'patchUserSessions').mockImplementation(async (...args) => {
      const revision = await cache.kv.get<{ writers: number }>('hai:iam:read_cache:revision')
      writers.push(revision.success ? revision.data?.writers : undefined)
      return patch(...args)
    })
    try {
      expect((await iam.authz.updateRole(role.data.id, { permissionIds: [] })).success).toBe(true)
    }
    finally { synchronize.mockRestore() }
    expect(writers).toEqual([0])
    expect(await iam.authz.getRolePermissions(role.data.id)).toMatchObject({ success: true, data: [] })
    expect(await iam.session.get(session.data.accessToken)).toMatchObject({
      success: true,
      data: { permissions: [] },
    })
  })

  it('deduplicates affected users, reads authorization in batches, and shares the session sync concurrency limit', async () => {
    const permission = await iam.authz.createPermission({ code: 'atomic:batch', name: 'batch' })
    if (!permission.success)
      throw new Error(permission.error.message)
    const first = await iam.authz.createRole({
      code: 'atomic-batch-first',
      name: 'First',
      permissionIds: [permission.data.id],
    })
    const second = await iam.authz.createRole({
      code: 'atomic-batch-second',
      name: 'Second',
      permissionIds: [permission.data.id],
    })
    if (!first.success || !second.success)
      throw new Error('Expected two roles with a shared permission')

    // 这里只需要批量有效账号和成员关系；写入与同步走下方的公开授权入口。
    const now = Date.now()
    expect((await reldb.sql.execute(`WITH RECURSIVE members(n) AS (
      SELECT 1 UNION ALL SELECT n + 1 FROM members WHERE n < 201
    ) INSERT INTO hai_iam_users (id, username, created_at, updated_at)
      SELECT 'sync-user-' || n, 'sync-user-' || n, ?, ? FROM members`, [now, now])).success).toBe(true)
    expect((await reldb.sql.execute(`INSERT INTO hai_iam_user_roles (user_id, role_id)
      SELECT u.id, r.id FROM hai_iam_users u CROSS JOIN hai_iam_roles r
      WHERE u.id LIKE 'sync-user-%' AND r.id IN (?, ?)`, [first.data.id, second.data.id])).success).toBe(true)

    let active = 0
    let peak = 0
    const query = vi.spyOn(reldb.sql, 'query')
    const patch = vi.spyOn(iam.session, 'patchUserSessions').mockImplementation(async () => {
      active++
      peak = Math.max(peak, active)
      await setImmediate()
      active--
      return core.ok(undefined)
    })
    try {
      const [deleted, updated] = await Promise.all([
        iam.authz.deletePermission(permission.data.id),
        iam.authz.updateRole(first.data.id, { name: 'Batch updated' }),
      ])
      expect(deleted.success && updated.success).toBe(true)
      expect(peak).toBe(8)
      expect(patch).toHaveBeenCalledTimes(402)
      const permissionOnly = patch.mock.calls.filter(([, updates]) => updates.roles === undefined)
      expect(permissionOnly).toHaveLength(201)
      expect(new Set(permissionOnly.map(([userId]) => userId)).size).toBe(201)
      expect(permissionOnly.every(([, updates]) => updates.permissions?.length === 0)).toBe(true)
      expect(query.mock.calls
        .filter(([sql]) => sql.includes('WHERE ur.user_id IN ('))
        .map(([, params]) => params?.length)
        .sort()).toEqual([1, 1, 200, 200])
    }
    finally {
      query.mockRestore()
      patch.mockRestore()
    }
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

  it('rejects a stale permission snapshot without writing metadata into the caller transaction', async () => {
    const permission = await iam.authz.createPermission({ code: 'atomic:newer', name: 'Newer permission' })
    const role = await iam.authz.createRole({ code: 'atomic-snapshot', name: 'Unchanged' })
    if (!permission.success || !role.success)
      throw new Error('Missing permission or role fixture')
    expect((await iam.authz.assignPermissionToRole(role.data.id, permission.data.id)).success).toBe(true)

    const committed = await reldb.tx.wrapResult(async (tx) => {
      const replaced = await iam.authz.updateRole(role.data.id, {
        name: 'Stale update',
        permissionIds: [],
        expectedPermissionIds: [],
      }, tx)
      expect(replaced).toMatchObject({
        success: false,
        error: { code: HaiIamError.CONFLICT.code },
      })
      return core.ok(undefined)
    })
    expect(committed.success).toBe(true)
    expect(await iam.authz.getRole(role.data.id)).toMatchObject({
      success: true,
      data: { name: 'Unchanged' },
    })
    expect(await iam.authz.getRolePermissions(role.data.id)).toMatchObject({
      success: true,
      data: [
        { id: permission.data.id },
      ],
    })
  })

  it.each([
    { isSystem: true },
    { code: 'super_admin' },
  ])('rejects snapshot replacement after the role gains protection %j', async (protection) => {
    const permission = await iam.authz.createPermission({ code: 'atomic:protected', name: 'Protected permission' })
    if (!permission.success)
      throw new Error('Missing permission fixture')
    const role = await iam.authz.createRole({
      code: 'atomic-protection',
      name: 'Originally editable',
      permissionIds: [permission.data.id],
    })
    if (!role.success)
      throw new Error('Missing role fixture')
    const snapshot = await iam.authz.getRolePermissions(role.data.id)
    if (!snapshot.success)
      throw new Error('Unable to read the original permissions')

    expect((await iam.authz.updateRole(role.data.id, protection)).success).toBe(true)
    expect(await iam.authz.updateRole(role.data.id, {
      permissionIds: [],
      expectedPermissionIds: snapshot.data.map(item => item.id),
    })).toMatchObject({
      success: false,
      error: { code: HaiIamError.FORBIDDEN.code },
    })
    expect(await iam.authz.getRolePermissions(role.data.id)).toEqual(snapshot)
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
