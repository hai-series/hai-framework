/**
 * =============================================================================
 * E2E 测试 - IAM CRUD 全流程
 * =============================================================================
 *
 * 覆盖用户、角色、权限的完整 CRUD 操作（API 级别），
 * 包含创建、读取、更新、删除全生命周期。
 * =============================================================================
 */

import { expect, test } from '@playwright/test'
import { registerAndLoginViaApi, uniqueUser } from './helpers'

function getUserPayload(body: { user?: unknown, data?: { user?: unknown } }) {
  return body.user ?? body.data?.user
}

// =============================================================================
// 用户 CRUD 全流程
// =============================================================================
test.describe('IAM Users CRUD', () => {
  test('完整生命周期: 创建 → 获取 → 更新 → 列表 → 删除', async ({ request }) => {
    await registerAndLoginViaApi(request, 'crud')
    const u = uniqueUser('crud_target')

    // 1. 创建用户
    const createRes = await request.post('/api/iam/users', {
      data: { username: u.username, email: u.email, password: u.password },
    })
    expect(createRes.ok()).toBe(true)
    const createBody = await createRes.json()
    expect(createBody.success).toBe(true)
    expect(createBody.data).toHaveProperty('id')
    expect(createBody.data.username).toBe(u.username)
    expect(createBody.data.email).toBe(u.email)
    const userId = createBody.data.id

    // 2. 获取单个用户
    const getRes = await request.get(`/api/iam/users/${userId}`)
    expect(getRes.ok()).toBe(true)
    const getBody = await getRes.json()
    expect(getBody.success).toBe(true)
    expect(getBody.data.id).toBe(userId)
    expect(getBody.data.username).toBe(u.username)
    expect(getBody.data.email).toBe(u.email)

    // 3. 更新用户
    const newEmail = `updated_${Date.now().toString(36)}@test.local`
    const updateRes = await request.put(`/api/iam/users/${userId}`, {
      data: { email: newEmail },
    })
    expect(updateRes.ok()).toBe(true)
    const updateBody = await updateRes.json()
    expect(updateBody.success).toBe(true)
    expect(updateBody.data.email).toBe(newEmail)

    // 4. 验证列表中包含该用户
    const listRes = await request.get('/api/iam/users')
    expect(listRes.ok()).toBe(true)
    const listBody = await listRes.json()
    expect(listBody.success).toBe(true)
    const found = listBody.data.users.find((u: Record<string, unknown>) => u.id === userId)
    expect(found).toBeTruthy()
    expect(found.email).toBe(newEmail)

    // 5. 删除用户
    const deleteRes = await request.delete(`/api/iam/users/${userId}`)
    expect(deleteRes.ok()).toBe(true)
    const deleteBody = await deleteRes.json()
    expect(deleteBody.success).toBe(true)

    // 6. 验证已删除
    const getDeletedRes = await request.get(`/api/iam/users/${userId}`)
    expect(getDeletedRes.status()).toBe(404)
  })

  test('GET /api/iam/users 支持分页查询', async ({ request }) => {
    await registerAndLoginViaApi(request, 'page')
    const listRes = await request.get('/api/iam/users?page=1&pageSize=5')
    expect(listRes.ok()).toBe(true)
    const body = await listRes.json()
    expect(body.success).toBe(true)
    expect(body.data).toHaveProperty('users')
    expect(body.data).toHaveProperty('total')
    expect(body.data).toHaveProperty('page')
    expect(body.data).toHaveProperty('pageSize')
    expect(body.data.page).toBe(1)
    expect(body.data.pageSize).toBe(5)
    expect(Array.isArray(body.data.users)).toBe(true)
  })

  test('GET /api/iam/users 支持搜索过滤', async ({ request }) => {
    const user = await registerAndLoginViaApi(request, 'search')
    const listRes = await request.get(`/api/iam/users?search=${user.username}`)
    expect(listRes.ok()).toBe(true)
    const body = await listRes.json()
    expect(body.success).toBe(true)
    const match = body.data.users.find((u: Record<string, unknown>) => u.username === user.username)
    expect(match).toBeTruthy()
  })

  test('PUT /api/iam/users/:id 用户名格式验证', async ({ request }) => {
    await registerAndLoginViaApi(request, 'upd')
    const u = uniqueUser('upd_target')
    const createRes = await request.post('/api/iam/users', {
      data: { username: u.username, email: u.email, password: u.password },
    })
    const { data: { id } } = await createRes.json()

    // 用户名太短
    const res = await request.put(`/api/iam/users/${id}`, {
      data: { username: 'ab' },
    })
    expect(res.ok()).toBe(false)
    expect(res.status()).toBe(400)
  })

  test('DELETE /api/iam/users/:id 禁止删除自己', async ({ request }) => {
    await registerAndLoginViaApi(request, 'selfdelete')

    // 获取当前用户 ID
    const meRes = await request.get('/api/auth/me')
    const meBody = await meRes.json()
    const meUser = getUserPayload(meBody) as { id?: string }
    const myId = meUser?.id

    if (myId) {
      const deleteRes = await request.delete(`/api/iam/users/${myId}`)
      expect(deleteRes.status()).toBe(400)
      const body = await deleteRes.json()
      expect(body.success).toBe(false)
    }
  })

  test('GET /api/iam/users/:id 不存在的用户返回 404', async ({ request }) => {
    await registerAndLoginViaApi(request, 'notfound')
    const res = await request.get('/api/iam/users/nonexistent-id-12345')
    expect(res.status()).toBe(404)
    const body = await res.json()
    expect(body.success).toBe(false)
  })
})

// =============================================================================
// 角色 CRUD 全流程
// =============================================================================
test.describe('IAM Roles CRUD', () => {
  test('完整生命周期: 创建 → 获取 → 更新 → 列表 → 删除', async ({ request }) => {
    await registerAndLoginViaApi(request, 'role')
    const roleName = `TestRole_${Date.now().toString(36)}`

    // 1. 创建角色
    const createRes = await request.post('/api/iam/roles', {
      data: { name: roleName, description: 'E2E test role' },
    })
    expect(createRes.ok()).toBe(true)
    const createBody = await createRes.json()
    expect(createBody.success).toBe(true)
    expect(createBody.data).toHaveProperty('id')
    expect(createBody.data.name).toBe(roleName)
    const roleId = createBody.data.id

    // 2. 获取单个角色
    const getRes = await request.get(`/api/iam/roles/${roleId}`)
    expect(getRes.ok()).toBe(true)
    const getBody = await getRes.json()
    expect(getBody.success).toBe(true)
    expect(getBody.data.id).toBe(roleId)
    expect(getBody.data.name).toBe(roleName)

    // 3. 更新角色
    const newName = `Updated_${roleName}`
    const updateRes = await request.put(`/api/iam/roles/${roleId}`, {
      data: { name: newName, description: 'Updated description' },
    })
    expect(updateRes.ok()).toBe(true)
    const updateBody = await updateRes.json()
    expect(updateBody.success).toBe(true)
    expect(updateBody.data.name).toBe(newName)

    // 4. 验证列表中包含该角色
    const listRes = await request.get('/api/iam/roles')
    expect(listRes.ok()).toBe(true)
    const listBody = await listRes.json()
    expect(listBody.success).toBe(true)
    const found = listBody.data.find((r: Record<string, unknown>) => r.id === roleId)
    expect(found).toBeTruthy()
    expect(found.name).toBe(newName)

    // 5. 删除角色
    const deleteRes = await request.delete(`/api/iam/roles/${roleId}`)
    expect(deleteRes.ok()).toBe(true)
    const deleteBody = await deleteRes.json()
    expect(deleteBody.success).toBe(true)

    // 6. 验证已删除（列表中不再包含）
    const listAfterDelete = await request.get('/api/iam/roles')
    const afterBody = await listAfterDelete.json()
    const notFound = afterBody.data.find((r: Record<string, unknown>) => r.id === roleId)
    expect(notFound).toBeFalsy()
  })

  test('POST /api/iam/roles 名称为空返回 400', async ({ request }) => {
    await registerAndLoginViaApi(request, 'role_err')
    const res = await request.post('/api/iam/roles', {
      data: { name: '', description: 'empty name' },
    })
    expect(res.ok()).toBe(false)
    expect(res.status()).toBe(400)
  })

  test('GET /api/iam/roles/:id 不存在返回 404', async ({ request }) => {
    await registerAndLoginViaApi(request, 'role_nf')
    const res = await request.get('/api/iam/roles/nonexistent-role-id')
    expect(res.status()).toBe(404)
  })
})

// =============================================================================
// 权限 CRUD 全流程
// =============================================================================
test.describe('IAM Permissions CRUD', () => {
  test('完整生命周期: 创建 → 获取列表 → 删除', async ({ request }) => {
    await registerAndLoginViaApi(request, 'perm')
    const ts = Date.now().toString(36)
    const permData = {
      name: `TestPerm_${ts}`,
      resource: `resource_${ts}`,
      action: 'read',
      description: 'E2E test permission',
    }

    // 1. 创建权限
    const createRes = await request.post('/api/iam/permissions', {
      data: permData,
    })
    expect(createRes.ok()).toBe(true)
    const createBody = await createRes.json()
    expect(createBody.success).toBe(true)
    expect(createBody.data).toHaveProperty('id')
    expect(createBody.data.name).toBe(permData.name)
    const permId = createBody.data.id

    // 2. 验证列表中包含该权限
    const listRes = await request.get('/api/iam/permissions')
    expect(listRes.ok()).toBe(true)
    const listBody = await listRes.json()
    expect(listBody.success).toBe(true)
    const found = listBody.data.find((p: Record<string, unknown>) => p.id === permId)
    expect(found).toBeTruthy()

    // 3. 删除权限
    const deleteRes = await request.delete(`/api/iam/permissions/${permId}`)
    expect(deleteRes.ok()).toBe(true)
    const deleteBody = await deleteRes.json()
    expect(deleteBody.success).toBe(true)
  })

  test('POST /api/iam/permissions 必填字段为空返回 400', async ({ request }) => {
    await registerAndLoginViaApi(request, 'perm_err')
    const res = await request.post('/api/iam/permissions', {
      data: { name: '', resource: '', action: '' },
    })
    expect(res.ok()).toBe(false)
    expect(res.status()).toBe(400)
  })

  test('POST /api/iam/permissions 重复创建返回 409', async ({ request }) => {
    await registerAndLoginViaApi(request, 'perm_dup')
    const ts = Date.now().toString(36)
    const permData = {
      name: `DupPerm_${ts}`,
      resource: `dup_res_${ts}`,
      action: 'write',
    }

    // 第一次创建成功
    const first = await request.post('/api/iam/permissions', { data: permData })
    expect(first.ok()).toBe(true)

    // 第二次创建应该冲突
    const second = await request.post('/api/iam/permissions', { data: permData })
    expect(second.status()).toBe(409)
  })
})

// =============================================================================
// 角色 ↔ 权限联动
// =============================================================================
test.describe('IAM Role-Permission Linkage', () => {
  test('创建角色时关联权限', async ({ request }) => {
    await registerAndLoginViaApi(request, 'link')
    const ts = Date.now().toString(36)

    // 先创建权限
    const permRes = await request.post('/api/iam/permissions', {
      data: { name: `LinkPerm_${ts}`, resource: `link_${ts}`, action: 'execute' },
    })
    const permBody = await permRes.json()
    const permName = permBody.data?.code ?? permBody.data?.name

    // 创建角色并关联该权限
    const roleRes = await request.post('/api/iam/roles', {
      data: {
        name: `LinkRole_${ts}`,
        description: 'Role with permissions',
        permissions: [permName],
      },
    })
    expect(roleRes.ok()).toBe(true)
    const roleBody = await roleRes.json()
    expect(roleBody.success).toBe(true)

    // 获取角色验证权限关联
    const roleId = roleBody.data.id
    const getRes = await request.get(`/api/iam/roles/${roleId}`)
    const getBody = await getRes.json()
    expect(getBody.data.permissions).toBeDefined()
  })
})

// =============================================================================
// 批量 API（Batch）行为验证
// =============================================================================
test.describe('IAM Batch API Behavior', () => {
  test('GET /api/iam/users 列表中每个用户都包含 roles 数组', async ({ request }) => {
    await registerAndLoginViaApi(request, 'batch')
    const listRes = await request.get('/api/iam/users?page=1&pageSize=10')
    expect(listRes.ok()).toBe(true)
    const body = await listRes.json()
    expect(body.success).toBe(true)

    // 每个用户对象都应包含 roles 字段（由 batch API 填充）
    for (const user of body.data.users) {
      expect(user).toHaveProperty('roles')
      expect(Array.isArray(user.roles)).toBe(true)
    }
  })

  test('GET /api/iam/users 新注册用户列表中 roles 包含默认角色', async ({ request }) => {
    const user = await registerAndLoginViaApi(request, 'brole')
    const listRes = await request.get(`/api/iam/users?search=${user.username}`)
    expect(listRes.ok()).toBe(true)
    const body = await listRes.json()
    expect(body.success).toBe(true)

    const match = body.data.users.find((u: Record<string, unknown>) => u.username === user.username)
    expect(match).toBeTruthy()
    // 新注册用户应至少有一个默认角色
    expect(Array.isArray(match.roles)).toBe(true)
    expect(match.roles.length).toBeGreaterThanOrEqual(1)
  })

  test('GET /api/iam/roles 列表中每个角色都包含 permissions 数组', async ({ request }) => {
    await registerAndLoginViaApi(request, 'bperm')
    const listRes = await request.get('/api/iam/roles')
    expect(listRes.ok()).toBe(true)
    const body = await listRes.json()
    expect(body.success).toBe(true)

    // 每个角色对象都应包含 permissions 字段（由 batch API 填充）
    for (const role of body.data) {
      expect(role).toHaveProperty('permissions')
      expect(Array.isArray(role.permissions)).toBe(true)
    }
  })

  test('创建角色关联权限后在列表中可见', async ({ request }) => {
    await registerAndLoginViaApi(request, 'blink')
    const ts = Date.now().toString(36)

    // 创建权限
    const permRes = await request.post('/api/iam/permissions', {
      data: { name: `BatchPerm_${ts}`, resource: `batch_${ts}`, action: 'read' },
    })
    expect(permRes.ok()).toBe(true)
    const permBody = await permRes.json()
    const permCode = permBody.data?.code ?? permBody.data?.name

    // 创建角色并关联权限
    const roleRes = await request.post('/api/iam/roles', {
      data: {
        name: `BatchRole_${ts}`,
        description: 'Batch test role',
        permissions: [permCode],
      },
    })
    expect(roleRes.ok()).toBe(true)
    const roleBody = await roleRes.json()
    const roleId = roleBody.data.id

    // 通过列表 API 验证权限在角色上（由 batch API getRolePermissionsForMany 填充）
    const listRes = await request.get('/api/iam/roles')
    expect(listRes.ok()).toBe(true)
    const listBody = await listRes.json()
    const matchedRole = listBody.data.find((r: Record<string, unknown>) => r.id === roleId)
    expect(matchedRole).toBeTruthy()
    expect(matchedRole.permissions).toContain(permCode)
  })
})

// =============================================================================
// 认证流程补充测试
// =============================================================================
test.describe('Auth Flow', () => {
  test('完整生命周期: 注册 → 登录 → 获取身份 → 登出', async ({ request }) => {
    const u = uniqueUser('flow')

    // 1. 注册
    const regRes = await request.post('/api/auth/register', {
      data: {
        username: u.username,
        email: u.email,
        password: u.password,
        confirmPassword: u.password,
      },
    })
    expect(regRes.ok()).toBe(true)
    const regBody = await regRes.json()
    expect(regBody.success).toBe(true)
    const regUser = getUserPayload(regBody) as { id: string, username: string }
    expect(regUser).toHaveProperty('id')
    expect(regUser.username).toBe(u.username)

    // 2. 登录
    const loginRes = await request.post('/api/auth/login', {
      data: { identifier: u.username, password: u.password },
    })
    expect(loginRes.ok()).toBe(true)
    const loginBody = await loginRes.json()
    expect(loginBody.success).toBe(true)
    const loginUser = getUserPayload(loginBody) as { username: string }
    expect(loginUser.username).toBe(u.username)

    // 3. 获取当前用户身份
    const meRes = await request.get('/api/auth/me')
    const meBody = await meRes.json()
    expect(meBody.success).toBe(true)
    const meUserAfterLogin = getUserPayload(meBody) as { username: string }
    expect(meUserAfterLogin.username).toBe(u.username)

    // 4. 登出
    const logoutRes = await request.post('/api/auth/logout')
    expect(logoutRes.ok()).toBe(true)
    const logoutBody = await logoutRes.json()
    expect(logoutBody.success).toBe(true)
  })

  test('POST /api/auth/forgot-password 正常调用', async ({ request }) => {
    const u = uniqueUser('forgot')
    await request.post('/api/auth/register', {
      data: {
        username: u.username,
        email: u.email,
        password: u.password,
        confirmPassword: u.password,
      },
    })

    // 发起找回密码请求（无论用户是否存在都返回成功）
    const res = await request.post('/api/auth/forgot-password', {
      data: { email: u.email },
    })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  test('POST /api/auth/forgot-password 邮箱为空返回 400', async ({ request }) => {
    const res = await request.post('/api/auth/forgot-password', {
      data: { email: '' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  test('POST /api/auth/reset-password 无效 token 返回 400', async ({ request }) => {
    const res = await request.post('/api/auth/reset-password', {
      data: {
        token: 'invalid-token-12345',
        password: 'NewPass123!',
        confirmPassword: 'NewPass123!',
      },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  test('POST /api/auth/reset-password 密码不一致返回 400', async ({ request }) => {
    const res = await request.post('/api/auth/reset-password', {
      data: {
        token: 'some-token',
        password: 'Pass1234!',
        confirmPassword: 'Different!',
      },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
  })
})
