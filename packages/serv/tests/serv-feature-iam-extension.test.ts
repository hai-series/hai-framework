import type { HaiResult } from '@h-ai/core'
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { cache } from '@h-ai/cache'
import { HaiCommonError } from '@h-ai/core'
import { HaiIamError, iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'
import { expect, it, vi } from 'vitest'
import { serv } from '../src/serv-main.js'

function dataOf<T>(result: HaiResult<T>): T {
  expect(result.success).toBe(true)
  if (!result.success)
    throw new Error(result.error.message)
  return result.data
}

it('账号与角色的管理权限受资源范围限制，创建及吊销使用不同用途的证明', async () => {
  const password = 'ExampleOnly123!'
  const contract = apiContract.create({ iam: apiContract.iam, iamManagement: apiContract.extensions.iam })
  const client = apiClient.create(contract)
  try {
    dataOf(await reldb.init({ type: 'sqlite', database: ':memory:' }))
    dataOf(await cache.init({ type: 'memory' }))
    dataOf(await iam.init({
      login: { apikey: true },
      reauthentication: {
        enabled: true,
        operations: ['iam.apiKeys.create', 'iam.apiKeys.delete', 'iam.roles.replacePermissions'],
      },
    }))
    const actor = dataOf(await iam.user.createUser({ username: 'iam-extension-owner', password })).user
    const privateUser = dataOf(await iam.user.createUser({ username: 'iam-extension-unmanaged', password })).user
    const permissions = await Promise.all([
      'iam.apiKeys.read',
      'iam.apiKeys.write',
      'iam.roles.read',
      'iam.roles.write',
      'reports:read',
    ].map(async code => dataOf(await iam.authz.createPermission({ code, name: code }))))
    const otherPermission = dataOf(await iam.authz.createPermission({ code: 'reports:delete', name: 'Delete report' }))
    const ownerRole = dataOf(await iam.authz.createRole({
      code: 'extension-admin',
      name: 'Extension admin',
      permissionIds: permissions.map(permission => permission.id),
    }))
    const managedRole = dataOf(await iam.authz.createRole({ code: 'managed-reader', name: 'Managed reader' }))
    const protectedRole = dataOf(await iam.authz.createRole({ code: 'protected-reader', name: 'Protected reader', isSystem: true }))
    dataOf(await iam.authz.assignRole(actor.id, ownerRole.id))
    const privateKey = dataOf(await iam.apiKey.createApiKey(privateUser.id, { name: 'Unmanaged key' })).apiKey
    let createCacheControl: string | null = null
    const app = serv.createApp({
      contract,
      iam,
      procedures: {
        iam: serv.createIamProcedures({ iam }),
        iamManagement: serv.createIamExtensionProcedures({
          iam,
          authorize: request => 'userId' in request
            ? request.userId === request.context.session.userId
            : request.roleId === managedRole.id || request.roleId === protectedRole.id,
        }),
      },
    })
    dataOf(await client.init({
      baseUrl: 'https://extensions.example/api/v1',
      auth: {
        storage: apiClient.tokenStorage.memory(),
      },
      fetch: async (input, init) => {
        const request = new Request(input, init)
        const response = await app.fetch(request)
        if (request.method === 'POST' && new URL(request.url).pathname === '/api/v1/iam/api-keys')
          createCacheControl = response.headers.get('cache-control')
        return response
      },
    }))
    const actions = apiClient.createAuthActions(client)
    dataOf(await actions.login({ identifier: actor.username, password }))
    const { apiKeys, roles } = client.iamManagement
    const input = {
      userId: actor.id,
      name: 'Report access',
      scopes: ['reports:read'],
    }

    expect(await apiKeys.list({ userId: privateUser.id })).toMatchObject({
      success: false,
      error: { code: HaiCommonError.FORBIDDEN.code },
    })
    expect(await apiKeys.get({ id: privateKey.id })).toMatchObject({
      success: false,
      error: { code: HaiCommonError.NOT_FOUND.code },
    })
    expect(await apiKeys.revoke({ id: privateKey.id })).toMatchObject({
      success: false,
      error: { code: HaiCommonError.NOT_FOUND.code },
    })
    expect(await apiKeys.create({
      ...input,
      scopes: ['reports:delete'],
    })).toMatchObject({
      success: false,
      error: { code: HaiCommonError.FORBIDDEN.code },
    })
    expect(await apiKeys.create(input)).toMatchObject({
      success: false,
      error: { code: HaiIamError.REAUTHENTICATION_REQUIRED.code },
    })
    const createProof = dataOf(await client.iam.auth.reauthenticate({ password, operation: 'iam.apiKeys.create' }))
    const created = dataOf(await apiKeys.create(input, {
      context: { reauthentication: createProof.ticket },
    }))
    expect(createCacheControl).toBe('no-store')
    expect(created.rawKey).toBeTruthy()
    const list = dataOf(await apiKeys.list({ userId: actor.id, enabled: true, pageSize: 1 }))
    expect(list.items).toMatchObject([
      {
        id: created.apiKey.id,
        name: input.name,
        scopes: input.scopes,
        expiresAt: null,
        lastUsedAt: null,
      },
    ])
    expect(list.items[0]).not.toHaveProperty('rawKey')
    expect(list.items[0]).not.toHaveProperty('keyHash')
    expect(dataOf(await apiKeys.list({ userId: actor.id, enabled: false })).total).toBe(0)
    const id = { id: created.apiKey.id }
    expect(dataOf(await apiKeys.get(id))).toMatchObject({ id: id.id, enabled: true })
    expect(await apiKeys.revoke(id, {
      context: { reauthentication: createProof.ticket },
    })).toMatchObject({ success: false })
    const deleteProof = dataOf(await client.iam.auth.reauthenticate({ password, operation: 'iam.apiKeys.delete' }))
    dataOf(await apiKeys.revoke(id, {
      context: { reauthentication: deleteProof.ticket },
    }))
    expect(dataOf(await apiKeys.list({ userId: actor.id })).total).toBe(0)

    expect(await roles.listPermissions({ id: ownerRole.id })).toMatchObject({
      success: false,
      error: { code: HaiCommonError.FORBIDDEN.code },
    })
    expect(await roles.replacePermissions({ id: protectedRole.id, permissionIds: [] })).toMatchObject({
      success: false,
      error: { code: HaiCommonError.FORBIDDEN.code },
    })
    expect(await roles.replacePermissions({
      id: managedRole.id,
      permissionIds: [otherPermission.id],
    })).toMatchObject({
      success: false,
      error: { code: HaiCommonError.FORBIDDEN.code },
    })
    const reportPermission = permissions.find(permission => permission.code === 'reports:read')!
    const replacement = {
      id: managedRole.id,
      permissionIds: [reportPermission.id],
    }
    expect(await roles.replacePermissions(replacement)).toMatchObject({
      success: false,
      error: { code: HaiIamError.REAUTHENTICATION_REQUIRED.code },
    })
    const roleProof = dataOf(await client.iam.auth.reauthenticate({ password, operation: 'iam.roles.replacePermissions' }))
    dataOf(await roles.replacePermissions(replacement, {
      context: { reauthentication: roleProof.ticket },
    }))
    expect(dataOf(await roles.listPermissions({ id: managedRole.id }))).toMatchObject([
      {
        code: reportPermission.code,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    ])

    const staleProof = dataOf(await client.iam.auth.reauthenticate({ password, operation: 'iam.roles.replacePermissions' }))
    const checkSensitive = iam.auth.checkSensitiveOperation
    const interleave = vi.spyOn(iam.auth, 'checkSensitiveOperation').mockImplementationOnce(async (...args) => {
      const checked = await checkSensitive(...args)
      // 在 HTTP 请求读取目标权限后，由另一写入者授予当前操作者无权委托的权限。
      if (checked.success)
        dataOf(await iam.authz.assignPermissionToRole(managedRole.id, otherPermission.id))
      return checked
    })
    try {
      expect(await roles.replacePermissions(replacement, {
        context: { reauthentication: staleProof.ticket },
      })).toMatchObject({
        success: false,
        error: { code: HaiIamError.CONFLICT.code, httpStatus: 409 },
      })
    }
    finally {
      interleave.mockRestore()
    }
    expect(dataOf(await roles.listPermissions({ id: managedRole.id })).map(permission => permission.code).sort()).toEqual([
      'reports:delete',
      'reports:read',
    ])
    dataOf(await iam.authz.removePermissionFromRole(managedRole.id, otherPermission.id))
    expect(await roles.replacePermissions(replacement, {
      context: { reauthentication: staleProof.ticket },
    })).toMatchObject({ success: false })
  }
  finally {
    await client.close()
    await iam.close()
    await cache.close()
    await reldb.close()
  }
})
