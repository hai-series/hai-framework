import { cache } from '@h-ai/cache'
import { err, ok } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAdminRole, getAdminRole, listAdminPermissionsPage, listAdminRoles, normalizeUniqueConstraintError, resolvePermissionIds, updateAdminRole } from '../src/lib/server/iam-admin.js'
import { load as loadDashboard } from '../src/routes/admin/+page.server.js'

describe('admin read failures', () => {
  it('keeps database failure status and hides internal details at the HTTP boundary', async () => {
    vi.spyOn(iam.authz, 'createRole').mockResolvedValueOnce(err({ code: 'db.failed', httpStatus: 500, message: 'SELECT private_column FROM internal_role_table; driver=/private/database.sock' }))
    const result = await createAdminRole({ code: 'outage-role', name: 'Outage role' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const response = kit.response.fromError(result.error)
      expect(response.status).toBe(500)
      const body = await response.text()
      expect(body).not.toContain('SELECT')
      expect(body).not.toContain('database.sock')
      expect(body).not.toContain('internal_role_table')
      expect(body).toContain('traceId')
    }
  })

  it('uses a stable fallback instead of forwarding unknown driver errors', () => {
    expect(normalizeUniqueConstraintError('driver error: private_table', 'Operation failed')).toBe('Operation failed')
  })

  beforeEach(async () => {
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
    expect((await cache.init({ type: 'memory' })).success).toBe(true)
    expect((await iam.init({ seedDefaultData: false })).success).toBe(true)
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await iam.close()
    await cache.close()
    await reldb.close()
  })

  it('distinguishes empty data from an unavailable database', async () => {
    expect(await listAdminPermissionsPage({})).toMatchObject({ items: [], total: 0 })
    expect(await getAdminRole('missing')).toBeNull()
    await reldb.close()
    await expect(listAdminPermissionsPage({})).rejects.toMatchObject({ status: 503 })
    await expect(getAdminRole('missing')).rejects.toMatchObject({ status: 503 })
  })

  it('rejects the entire list when a later page fails', async () => {
    const pages = vi.spyOn(iam.authz, 'getAllRoles')
      .mockResolvedValueOnce(ok({ items: [], total: 201, page: 1, pageSize: 200 }))
      .mockResolvedValueOnce(err({ code: 'test.read_failed', message: 'injected failure' }))
    await expect(listAdminRoles()).rejects.toMatchObject({ status: 503 })
    expect(pages).toHaveBeenCalledTimes(2)
  })

  it('blocks editing and writes when existing permissions cannot be loaded', async () => {
    const role = await iam.authz.createRole({ code: 'read-failure', name: 'before' })
    expect(role.success).toBe(true)
    if (!role.success)
      return
    expect((await reldb.sql.execute('DROP TABLE hai_iam_role_permissions')).success).toBe(true)
    await expect(getAdminRole(role.data.id)).rejects.toMatchObject({ status: 503 })
    await expect(listAdminRoles()).rejects.toMatchObject({ status: 503 })
    await expect(updateAdminRole(role.data.id, { name: 'after', permissions: [] })).rejects.toMatchObject({ status: 503 })
    expect(await iam.authz.getRole(role.data.id)).toMatchObject({ success: true, data: { name: 'before' } })
  })

  it('rejects unknown permission codes and propagates lookup outages', async () => {
    expect(await resolvePermissionIds([])).toEqual([])
    await expect(resolvePermissionIds(['unknown:permission'])).rejects.toMatchObject({ status: 400 })
    await reldb.close()
    await expect(resolvePermissionIds(['unknown:permission'])).rejects.toMatchObject({ status: 503 })
  })

  it('fails dashboard loading rather than displaying zero statistics during an outage', async () => {
    await reldb.close()
    // 具备读取权限时，数据库故障仍应中止统计，不能被职责过滤伪装为空数据。
    await expect(loadDashboard({ locals: { session: { userId: 'test', roles: [], permissions: ['dashboard:view', 'user:list'] } } } as Parameters<typeof loadDashboard>[0])).rejects.toMatchObject({ status: 503 })
  })
})
