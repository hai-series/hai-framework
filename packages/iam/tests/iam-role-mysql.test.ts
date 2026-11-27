import { cache } from '@h-ai/cache'
import { reldb } from '@h-ai/reldb'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { mysqlEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { iam } from '../src/index.js'

let releaseDatabase: (() => Promise<void>) | undefined

beforeAll(async () => {
  const environment = await mysqlEnv()
  releaseDatabase = environment.release
  expect(await reldb.init(environment.config)).toMatchObject({ success: true })
  expect(await cache.init({ type: 'memory' })).toMatchObject({ success: true })
}, 150_000)

afterAll(async () => {
  try {
    await iam.close()
    await cache.close()
    await reldb.close()
  }
  finally {
    await releaseDatabase?.()
  }
})

it('initializes MySQL defaults and writes idempotent role permissions', async () => {
  expect(await iam.init({})).toMatchObject({ success: true })
  const admin = await iam.authz.getRoleByCode('admin')
  expect(admin.success && admin.data !== null).toBe(true)
  if (!admin.success || !admin.data)
    return
  expect(await iam.authz.getRolePermissions(admin.data.id)).toMatchObject({
    success: true,
    data: expect.arrayContaining([
      expect.objectContaining({ code: 'dashboard:view' }),
    ]),
  })

  const role = await iam.authz.createRole({ code: 'mysql-test-role', name: 'MySQL role' })
  const permission = await iam.authz.createPermission({ code: 'mysql-test:read', name: 'MySQL read' })
  expect(role.success && permission.success).toBe(true)
  if (!role.success || !permission.success)
    return
  expect(await iam.authz.assignPermissionToRole(role.data.id, permission.data.id)).toMatchObject({ success: true })
  expect(await iam.authz.assignPermissionToRole(role.data.id, permission.data.id)).toMatchObject({ success: true })
  expect(await iam.authz.getRolePermissions(role.data.id)).toMatchObject({
    success: true,
    data: [
      { id: permission.data.id },
    ],
  })
  expect(await iam.authz.updateRole(role.data.id, { permissionIds: [] })).toMatchObject({ success: true })
  expect(await iam.authz.getRolePermissions(role.data.id)).toMatchObject({ success: true, data: [] })
  expect(await iam.authz.updateRole(role.data.id, {
    permissionIds: [permission.data.id],
  })).toMatchObject({ success: true })
  expect(await iam.authz.getRolePermissions(role.data.id)).toMatchObject({
    success: true,
    data: [
      { id: permission.data.id },
    ],
  })
}, 30_000)
