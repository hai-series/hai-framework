/** 使用真实 IAM 与路由验证职责隔离，不能只靠菜单隐藏。 */
import type { RequestEvent } from '@sveltejs/kit'
import { audit } from '@h-ai/audit'
import { cache } from '@h-ai/cache'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { ADMIN_DUTIES, canGrantRole, requireGrantableRoles, requireManageableUser, requirePagePermission, seedAdminDuties } from '../src/lib/server/security-roles.js'
import { load as dashboard } from '../src/routes/admin/+page.server.js'
import { DELETE as deletePermission } from '../src/routes/api/iam/permissions/[id]/+server.js'
import { POST as createUser } from '../src/routes/api/iam/users/+server.js'
import { PUT as updateUser } from '../src/routes/api/iam/users/[id]/+server.js'
import { POST as inviteUser } from '../src/routes/api/iam/users/invite/+server.js'

beforeEach(async () => {
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await cache.init({ type: 'memory' })).success).toBe(true)
  expect((await audit.init()).success).toBe(true)
  expect((await iam.init({})).success).toBe(true)
})
afterEach(async () => {
  await iam.close()
  await audit.close()
  await cache.close()
  await reldb.close()
})

it('管理端创建用户保存表单显示名称', async () => {
  const response = await createUser({
    request: new Request('https://app.test/api/iam/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'named_member', email: 'member@example.test', password: 'ExampleOnly123!', display_name: '业务成员', roles: [] }) }),
    cookies: { get: () => undefined },
    locals: { session: { userId: 'system-actor', roles: ['admin'], permissions: ['user:api:create'] } },
    getClientAddress: () => '127.0.0.1',
  } as RequestEvent)
  expect(response.status).toBe(200)
  const body = await response.json() as { data: { id: string } }
  const created = await iam.user.getUser(body.data.id)
  expect(created.success && created.data?.displayName).toBe('业务成员')
})

it('手机号邀请无需额外邮箱，目标联系方式仍由 IAM 服务端策略校验', async () => {
  await iam.close()
  let notifiedPhone: string | undefined
  expect((await iam.init({ initialCredentials: { enabled: true }, passwordReset: { enabled: true, mode: 'phone' }, onPasswordResetRequest: async (user) => {
    notifiedPhone = user.phone
  } })).success).toBe(true)
  const response = await inviteUser({
    request: new Request('https://app.test/api/iam/users/invite', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'phone_member', phone: '+8613800138000', roles: [] }) }),
    cookies: { get: () => undefined },
    locals: { session: { userId: 'system-actor', roles: ['admin'], permissions: ['user:api:create'] } },
    getClientAddress: () => '127.0.0.1',
  } as RequestEvent)
  expect(response.status).toBe(201)
  expect(notifiedPhone).toBe('+8613800138000')
})

it('没有审计权限的系统管理员不能从仪表盘读取审计事件', async () => {
  expect((await audit.log({ action: 'private-audit-event', resource: 'security' })).success).toBe(true)
  const data = await dashboard({ locals: { session: { userId: 'system-actor', roles: ['admin'], permissions: ['dashboard:view'] } } } as Parameters<typeof dashboard>[0])
  expect(data).toMatchObject({ recentActivity: [], auditStats: [], canReadAudit: false })
})

it('页面加载拒绝使用 SvelteKit 错误状态，不能把 API Response 抛成 500', () => {
  expect(() => requirePagePermission(null, 'audit:read')).toThrow(expect.objectContaining({ status: 401 }))
  expect(() => requirePagePermission({ userId: 'system', permissions: [...ADMIN_DUTIES.admin] }, 'audit:read')).toThrow(expect.objectContaining({ status: 403 }))
})

it('系统账号管理权限不能将本人提升为审计管理员', async () => {
  const created = await iam.user.createUser({ username: 'system-actor', password: 'ExampleOnly123!' })
  const permission = await iam.authz.getPermissionByCode('audit:read')
  if (!created.success || !permission.success || !permission.data)
    throw new Error('Duty fixture failed')
  const auditRole = await iam.authz.createRole({ code: 'audit_admin', name: 'Audit admin', permissionIds: [permission.data.id] })
  if (!auditRole.success)
    throw new Error(auditRole.error.message)
  // 平台字段夹具；处理器、权限判断和写入均为实际实现。
  const response = await updateUser({
    params: { id: created.data.user.id },
    request: new Request('https://app.test/api/iam/users/current', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roles: [auditRole.data.id] }) }),
    cookies: { get: () => undefined },
    locals: { session: { userId: created.data.user.id, roles: ['admin'], permissions: ['dashboard:view', 'profile:read', 'user:api:update'] } },
    getClientAddress: () => '127.0.0.1',
  } as RequestEvent)
  expect(response.status).toBe(403)
  const roles = await iam.authz.getUserRoles(created.data.user.id)
  expect(roles.success).toBe(true)
  if (roles.success)
    expect(roles.data.map(role => role.code)).not.toContain('audit_admin')
})

it('四类职责与基础用户权限互斥，重复初始化也不会把审计权限还给系统管理员', async () => {
  const names = { admin: 'System', audit_admin: 'Audit', config_admin: 'Config', business_operator: 'Operator', user: 'Member' }
  expect((await seedAdminDuties(names)).success).toBe(true)
  expect((await seedAdminDuties(names)).success).toBe(true)
  for (const [code, permissions] of Object.entries(ADMIN_DUTIES)) {
    const role = await iam.authz.getRoleByCode(code)
    if (!role.success || !role.data)
      throw new Error('Missing duty role')
    const actual = await iam.authz.getRolePermissions(role.data.id)
    expect(actual.success).toBe(true)
    if (actual.success)
      expect(actual.data.map(permission => permission.code).sort()).toEqual([...permissions].sort())
  }
})

it('系统管理员不能通过修改审计账号或授予super admin间接越权', async () => {
  expect((await seedAdminDuties({ admin: 'System', audit_admin: 'Audit', config_admin: 'Config', business_operator: 'Operator', user: 'Member' })).success).toBe(true)
  const actor = { userId: 'system', roles: ['admin'], permissions: [...ADMIN_DUTIES.admin] }
  expect(canGrantRole(actor, { code: 'user', permissions: [...ADMIN_DUTIES.user] })).toBe(true)
  expect(canGrantRole(actor, { code: 'user', permissions: [...ADMIN_DUTIES.user, 'audit:read'] })).toBe(false)
  expect(canGrantRole({ ...actor, permissions: ['profile:read'] }, { code: 'user', permissions: [...ADMIN_DUTIES.user] })).toBe(false)
  const created = await iam.user.createUser({ username: 'protected-auditor', password: 'ExampleOnly123!' })
  const role = await iam.authz.getRoleByCode('audit_admin')
  if (!created.success || !role.success || !role.data)
    throw new Error('Missing audit fixture')
  expect((await iam.authz.syncRoles(created.data.user.id, [role.data.id])).success).toBe(true)
  await expect(requireManageableUser(actor, created.data.user.id)).rejects.toMatchObject({ status: 403 })
  const superRole = await iam.authz.createRole({ code: 'super_admin', name: 'Unseeded recovery role' })
  if (!superRole.success)
    throw new Error(superRole.error.message)
  await expect(requireGrantableRoles(actor, [superRole.data.id])).rejects.toMatchObject({ status: 403 })
})

it('允许清理未分配的自定义权限，拒绝删除其他职责正在使用的定义', async () => {
  expect((await seedAdminDuties({ admin: 'System', audit_admin: 'Audit', config_admin: 'Config', business_operator: 'Operator', user: 'Member' })).success).toBe(true)
  const remove = (id: string) => deletePermission({
    params: { id },
    request: new Request(`https://app.test/api/iam/permissions/${id}`, { method: 'DELETE' }),
    cookies: { get: () => undefined },
    locals: { session: { userId: 'system-actor', roles: ['admin'], permissions: [...ADMIN_DUTIES.admin] } },
  } as RequestEvent)
  const unused = await iam.authz.createPermission({ code: 'fixture:unassigned', name: 'Unused definition', type: 'api' })
  if (!unused.success)
    throw new Error(unused.error.message)
  expect((await remove(unused.data.id)).status).toBe(200)
  expect(await iam.authz.getPermission(unused.data.id)).toMatchObject({ success: true, data: null })
  const protectedDefinition = await iam.authz.createPermission({ code: 'fixture:audit-extra', name: 'Audit extension', type: 'api' })
  const role = await iam.authz.getRoleByCode('audit_admin')
  if (!protectedDefinition.success || !role.success || !role.data)
    throw new Error('Missing protected definition fixture')
  expect((await iam.authz.assignPermissionToRole(role.data.id, protectedDefinition.data.id)).success).toBe(true)
  expect((await remove(protectedDefinition.data.id)).status).toBe(403)
  expect(await iam.authz.getPermission(protectedDefinition.data.id)).toMatchObject({ success: true, data: { id: protectedDefinition.data.id } })
})
