/**
 * =============================================================================
 * @hai/iam - 授权模块测试（RBAC）
 * =============================================================================
 */

import type { CacheService } from '@hai/cache'
import type { DbService } from '@hai/db'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { iam } from '../src/index.js'
import { createMockCacheService, setupTestDb, teardownTestDb } from './helpers/setup.js'

describe('authz', () => {
  let testDb: DbService
  let testCache: CacheService

  beforeEach(async () => {
    testDb = await setupTestDb()
    testCache = createMockCacheService()
    await iam.init(testDb, testCache, {
      strategies: ['password'],
      session: {
        type: 'jwt',
        jwt: {
          secret: 'test-secret-key-must-be-at-least-32-characters',
        },
      },
    })
  })

  afterEach(async () => {
    await iam.close()
    await teardownTestDb()
  })

  describe('createPermission', () => {
    it('应该创建权限', async () => {
      const result = await iam.authz.createPermission({
        code: 'users:read',
        name: '读取用户',
        description: '查看用户列表',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe('读取用户')
        expect(result.data.description).toBe('查看用户列表')
      }
    })

    it('应该支持资源和操作字段', async () => {
      const result = await iam.authz.createPermission({
        code: 'users:read',
        name: '读取用户',
        resource: 'users',
        action: 'read',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.resource).toBe('users')
        expect(result.data.action).toBe('read')
      }
    })
  })

  describe('createRole', () => {
    it('应该创建角色', async () => {
      const result = await iam.authz.createRole({
        code: 'admin',
        name: '管理员',
        description: '系统管理员',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe('管理员')
        expect(result.data.description).toBe('系统管理员')
      }
    })

    it('应该获取所有角色', async () => {
      await iam.authz.createRole({ code: 'admin', name: '管理员' })
      await iam.authz.createRole({ code: 'user', name: '普通用户' })

      const result = await iam.authz.getAllRoles()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.length).toBeGreaterThanOrEqual(2)
      }
    })
  })

  describe('assignPermissionToRole', () => {
    it('应该分配权限给角色', async () => {
      const permResult = await iam.authz.createPermission({
        code: 'users:read',
        name: '读取用户',
      })

      const roleResult = await iam.authz.createRole({
        code: 'admin',
        name: '管理员',
      })

      if (!permResult.success || !roleResult.success) {
        throw new Error('创建权限或角色失败')
      }

      const result = await iam.authz.assignPermissionToRole(
        roleResult.data.id,
        permResult.data.id,
      )
      expect(result.success).toBe(true)
    })

    it('应该获取角色的权限列表', async () => {
      const permResult = await iam.authz.createPermission({
        code: 'users:read',
        name: '读取用户',
      })

      const roleResult = await iam.authz.createRole({
        code: 'admin',
        name: '管理员',
      })

      if (!permResult.success || !roleResult.success) {
        throw new Error('创建权限或角色失败')
      }

      await iam.authz.assignPermissionToRole(roleResult.data.id, permResult.data.id)

      const permsResult = await iam.authz.getRolePermissions(roleResult.data.id)

      expect(permsResult.success).toBe(true)
      if (permsResult.success) {
        expect(permsResult.data.length).toBe(1)
        expect(permsResult.data[0].code).toBe('users:read')
      }
    })
  })

  describe('checkPermission', () => {
    let viewerId: string
    let editorId: string

    beforeEach(async () => {
      const readResult = await iam.authz.createPermission({ code: 'users:read', name: '读取用户' })
      const writeResult = await iam.authz.createPermission({ code: 'users:write', name: '写入用户' })
      const viewerResult = await iam.authz.createRole({ code: 'viewer', name: '查看者' })
      const editorResult = await iam.authz.createRole({ code: 'editor', name: '编辑者' })

      if (!readResult.success || !writeResult.success || !viewerResult.success || !editorResult.success) {
        throw new Error('初始化失败')
      }

      viewerId = viewerResult.data.id
      editorId = editorResult.data.id

      await iam.authz.assignPermissionToRole(viewerId, readResult.data.id)
      await iam.authz.assignPermissionToRole(editorId, readResult.data.id)
      await iam.authz.assignPermissionToRole(editorId, writeResult.data.id)
    })

    it('应该通过有权限的检查', async () => {
      const result = await iam.authz.checkPermission(
        { userId: 'user1', roles: [viewerId] },
        'users:read',
      )

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(true)
      }
    })

    it('应该拒绝没有权限的检查', async () => {
      const result = await iam.authz.checkPermission(
        { userId: 'user1', roles: [viewerId] },
        'users:write',
      )

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(false)
      }
    })

    it('应该支持多角色', async () => {
      const result = await iam.authz.checkPermission(
        { userId: 'user1', roles: [viewerId, editorId] },
        'users:write',
      )

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(true)
      }
    })
  })

  describe('assignRole / hasRole', () => {
    let adminRoleId: string

    beforeEach(async () => {
      const result = await iam.authz.createRole({ code: 'admin', name: '管理员' })
      if (!result.success) {
        throw new Error('创建角色失败')
      }
      adminRoleId = result.data.id
    })

    it('应该分配角色给用户', async () => {
      const result = await iam.authz.assignRole('user1', adminRoleId)
      expect(result.success).toBe(true)
    })

    it('应该检查用户角色', async () => {
      await iam.authz.assignRole('user1', adminRoleId)

      const result = await iam.authz.hasRole({ userId: 'user1', roles: [] }, 'admin')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(true)
      }
    })

    it('应该获取用户的角色列表', async () => {
      await iam.authz.assignRole('user1', adminRoleId)

      const result = await iam.authz.getUserRoles('user1')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.length).toBe(1)
        expect(result.data[0].code).toBe('admin')
      }
    })

    it('应该移除用户角色', async () => {
      await iam.authz.assignRole('user1', adminRoleId)
      await iam.authz.removeRole('user1', adminRoleId)

      const result = await iam.authz.hasRole({ userId: 'user1', roles: [] }, 'admin')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(false)
      }
    })
  })

  describe('getPermission / getAllPermissions', () => {
    it('应该获取权限详情', async () => {
      const createResult = await iam.authz.createPermission({
        code: 'users:read',
        name: '读取用户',
      })

      if (!createResult.success) {
        throw new Error('创建权限失败')
      }

      const result = await iam.authz.getPermission(createResult.data.id)
      expect(result.success).toBe(true)
      if (result.success && result.data) {
        expect(result.data.code).toBe('users:read')
      }
    })

    it('应该获取所有权限', async () => {
      await iam.authz.createPermission({ code: 'users:read', name: '读取用户' })
      await iam.authz.createPermission({ code: 'users:write', name: '写入用户' })

      const result = await iam.authz.getAllPermissions()
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.length).toBeGreaterThanOrEqual(2)
      }
    })
  })

  describe('deletePermission / deleteRole', () => {
    it('应该删除权限', async () => {
      const createResult = await iam.authz.createPermission({
        code: 'temp:read',
        name: '临时权限',
      })

      if (!createResult.success) {
        throw new Error('创建权限失败')
      }

      const deleteResult = await iam.authz.deletePermission(createResult.data.id)
      expect(deleteResult.success).toBe(true)

      const getResult = await iam.authz.getPermission(createResult.data.id)
      expect(getResult.success).toBe(true)
      if (getResult.success) {
        expect(getResult.data).toBeNull()
      }
    })

    it('应该删除角色', async () => {
      const createResult = await iam.authz.createRole({
        code: 'temp',
        name: '临时角色',
      })

      if (!createResult.success) {
        throw new Error('创建角色失败')
      }

      const deleteResult = await iam.authz.deleteRole(createResult.data.id)
      expect(deleteResult.success).toBe(true)

      const getResult = await iam.authz.getRole(createResult.data.id)
      expect(getResult.success).toBe(true)
      if (getResult.success) {
        expect(getResult.data).toBeNull()
      }
    })
  })
})
