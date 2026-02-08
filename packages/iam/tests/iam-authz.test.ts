/**
 * =============================================================================
 * @hai/iam - 授权管理测试（RBAC）
 * =============================================================================
 *
 * 覆盖范围：
 * - 角色 CRUD：创建/获取/更新/删除、不存在场景、重复 code
 * - 权限 CRUD：同上
 * - 角色-权限关联：关联/移除/查询、角色/权限不存在、重复关联幂等
 * - 用户-角色关联：分配/移除/查询、角色不存在、重复分配幂等、无角色用户
 * - checkPermission：拥有/缺少/超管、通配符匹配
 * - 缓存清理：删除角色/权限后缓存更新
 * - 种子数据：默认角色/权限/关联验证
 */

import type { IamService } from '../src/iam-main.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { IamErrorCode } from '../src/iam-config.js'
import { defineIamSuite, postgresRedisEnv, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'

describe('iam.authz', () => {
  const defineCommon = (getIam: () => IamService) => {
    // =========================================================================
    // 角色 CRUD
    // =========================================================================

    describe('角色管理', () => {
      it('createRole 应创建角色并返回完整信息', async () => {
        const result = await getIam().authz.createRole({
          code: 'authz_role_1',
          name: '测试角色',
          description: '用于测试',
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.code).toBe('authz_role_1')
          expect(result.data.name).toBe('测试角色')
          expect(result.data.id).toBeTruthy()
          expect(result.data.createdAt).toBeInstanceOf(Date)
        }
      })

      it('getRole 应返回已创建的角色', async () => {
        const createResult = await getIam().authz.createRole({
          code: 'authz_get_role',
          name: '查询角色',
        })
        expect(createResult.success).toBe(true)
        if (!createResult.success)
          return

        const result = await getIam().authz.getRole(createResult.data.id)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data?.code).toBe('authz_get_role')
        }
      })

      it('getRole 不存在的 ID 应返回 null', async () => {
        const result = await getIam().authz.getRole('nonexistent-role-id')
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data).toBeNull()
        }
      })

      it('updateRole 应更新角色属性', async () => {
        const createResult = await getIam().authz.createRole({
          code: 'authz_update_role',
          name: '旧名称',
        })
        expect(createResult.success).toBe(true)
        if (!createResult.success)
          return

        const result = await getIam().authz.updateRole(createResult.data.id, {
          name: '新名称',
          description: '更新描述',
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.name).toBe('新名称')
          expect(result.data.description).toBe('更新描述')
        }
      })

      it('updateRole 不存在的角色应返回 ROLE_NOT_FOUND', async () => {
        const result = await getIam().authz.updateRole('nonexistent', { name: 'x' })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.ROLE_NOT_FOUND)
        }
      })

      it('deleteRole 应删除角色', async () => {
        const createResult = await getIam().authz.createRole({
          code: 'authz_del_role',
          name: '待删除角色',
        })
        expect(createResult.success).toBe(true)
        if (!createResult.success)
          return

        const delResult = await getIam().authz.deleteRole(createResult.data.id)
        expect(delResult.success).toBe(true)

        const getResult = await getIam().authz.getRole(createResult.data.id)
        expect(getResult.success).toBe(true)
        if (getResult.success) {
          expect(getResult.data).toBeNull()
        }
      })

      it('deleteRole 不存在的角色应返回 ROLE_NOT_FOUND', async () => {
        const result = await getIam().authz.deleteRole('nonexistent-role')
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.ROLE_NOT_FOUND)
        }
      })

      it('getAllRoles 应返回分页角色列表', async () => {
        const result = await getIam().authz.getAllRoles({ page: 1, pageSize: 50 })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.items).toBeInstanceOf(Array)
          expect(typeof result.data.total).toBe('number')
        }
      })

      it('创建重复 code 的角色应失败', async () => {
        await getIam().authz.createRole({ code: 'dup_role_code', name: '角色1' })
        const result = await getIam().authz.createRole({ code: 'dup_role_code', name: '角色2' })
        expect(result.success).toBe(false)
      })

      it('种子数据应包含默认角色（admin/user/guest）', async () => {
        const result = await getIam().authz.getAllRoles({ page: 1, pageSize: 50 })
        expect(result.success).toBe(true)
        if (result.success) {
          const codes = result.data.items.map(r => r.code)
          expect(codes).toContain('admin')
          expect(codes).toContain('user')
          expect(codes).toContain('guest')
        }
      })
    })

    // =========================================================================
    // 权限 CRUD
    // =========================================================================

    describe('权限管理', () => {
      it('createPermission 应创建权限并返回完整信息', async () => {
        const result = await getIam().authz.createPermission({
          code: 'authz:read',
          name: '读取权限',
          description: '测试权限',
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.code).toBe('authz:read')
          expect(result.data.name).toBe('读取权限')
          expect(result.data.id).toBeTruthy()
        }
      })

      it('getPermission 应返回已创建的权限', async () => {
        const createResult = await getIam().authz.createPermission({
          code: 'authz:get_perm',
          name: '查询权限',
        })
        expect(createResult.success).toBe(true)
        if (!createResult.success)
          return

        const result = await getIam().authz.getPermission(createResult.data.id)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data?.code).toBe('authz:get_perm')
        }
      })

      it('getPermission 不存在的 ID 应返回 null', async () => {
        const result = await getIam().authz.getPermission('nonexistent')
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data).toBeNull()
        }
      })

      it('deletePermission 应删除权限', async () => {
        const createResult = await getIam().authz.createPermission({
          code: 'authz:del_perm',
          name: '待删除权限',
        })
        expect(createResult.success).toBe(true)
        if (!createResult.success)
          return

        const delResult = await getIam().authz.deletePermission(createResult.data.id)
        expect(delResult.success).toBe(true)

        const getResult = await getIam().authz.getPermission(createResult.data.id)
        expect(getResult.success).toBe(true)
        if (getResult.success) {
          expect(getResult.data).toBeNull()
        }
      })

      it('deletePermission 不存在的权限应返回 PERMISSION_NOT_FOUND', async () => {
        const result = await getIam().authz.deletePermission('nonexistent')
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.PERMISSION_NOT_FOUND)
        }
      })

      it('getAllPermissions 应返回分页列表', async () => {
        const result = await getIam().authz.getAllPermissions({ page: 1, pageSize: 50 })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.items).toBeInstanceOf(Array)
        }
      })

      it('创建重复 code 的权限应失败', async () => {
        await getIam().authz.createPermission({ code: 'dup:perm', name: '权限1' })
        const result = await getIam().authz.createPermission({ code: 'dup:perm', name: '权限2' })
        expect(result.success).toBe(false)
      })

      it('种子数据应包含默认权限', async () => {
        const result = await getIam().authz.getAllPermissions({ page: 1, pageSize: 50 })
        expect(result.success).toBe(true)
        if (result.success) {
          const codes = result.data.items.map(p => p.code)
          expect(codes).toContain('user:read')
          expect(codes).toContain('user:create')
          expect(codes).toContain('role:read')
        }
      })
    })

    // =========================================================================
    // 角色-权限关联
    // =========================================================================

    describe('角色-权限关联', () => {
      it('assignPermissionToRole 应成功关联', async () => {
        const role = await getIam().authz.createRole({ code: 'rp_assign_role', name: '关联测试角色' })
        const perm = await getIam().authz.createPermission({ code: 'rp:assign', name: '关联测试权限' })
        expect(role.success && perm.success).toBe(true)
        if (!role.success || !perm.success)
          return

        const result = await getIam().authz.assignPermissionToRole(role.data.id, perm.data.id)
        expect(result.success).toBe(true)
      })

      it('getRolePermissions 应返回已关联的权限', async () => {
        const role = await getIam().authz.createRole({ code: 'rp_get_role', name: '查询角色权限' })
        const perm1 = await getIam().authz.createPermission({ code: 'rp:get1', name: '权限1' })
        const perm2 = await getIam().authz.createPermission({ code: 'rp:get2', name: '权限2' })
        expect(role.success && perm1.success && perm2.success).toBe(true)
        if (!role.success || !perm1.success || !perm2.success)
          return

        await getIam().authz.assignPermissionToRole(role.data.id, perm1.data.id)
        await getIam().authz.assignPermissionToRole(role.data.id, perm2.data.id)

        const result = await getIam().authz.getRolePermissions(role.data.id)
        expect(result.success).toBe(true)
        if (result.success) {
          const codes = result.data.map(p => p.code).sort()
          expect(codes).toContain('rp:get1')
          expect(codes).toContain('rp:get2')
        }
      })

      it('removePermissionFromRole 应移除关联', async () => {
        const role = await getIam().authz.createRole({ code: 'rp_remove_role', name: '移除权限角色' })
        const perm = await getIam().authz.createPermission({ code: 'rp:remove', name: '待移除权限' })
        expect(role.success && perm.success).toBe(true)
        if (!role.success || !perm.success)
          return

        await getIam().authz.assignPermissionToRole(role.data.id, perm.data.id)
        const removeResult = await getIam().authz.removePermissionFromRole(role.data.id, perm.data.id)
        expect(removeResult.success).toBe(true)

        const permsResult = await getIam().authz.getRolePermissions(role.data.id)
        expect(permsResult.success).toBe(true)
        if (permsResult.success) {
          expect(permsResult.data.find(p => p.code === 'rp:remove')).toBeUndefined()
        }
      })

      it('assignPermissionToRole 角色不存在应返回 ROLE_NOT_FOUND', async () => {
        const perm = await getIam().authz.createPermission({ code: 'rp:noexist_role', name: '测试' })
        if (!perm.success)
          return

        const result = await getIam().authz.assignPermissionToRole('bad-role-id', perm.data.id)
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.ROLE_NOT_FOUND)
        }
      })

      it('assignPermissionToRole 权限不存在应返回 PERMISSION_NOT_FOUND', async () => {
        const role = await getIam().authz.createRole({ code: 'rp_no_perm', name: '无权限角色' })
        if (!role.success)
          return

        const result = await getIam().authz.assignPermissionToRole(role.data.id, 'bad-perm-id')
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.PERMISSION_NOT_FOUND)
        }
      })

      it('重复 assignPermissionToRole 应幂等成功', async () => {
        const role = await getIam().authz.createRole({ code: 'rp_dup_assign_role', name: '幂等关联角色' })
        const perm = await getIam().authz.createPermission({ code: 'rp:dup_assign', name: '幂等关联权限' })
        if (!role.success || !perm.success)
          return

        const first = await getIam().authz.assignPermissionToRole(role.data.id, perm.data.id)
        expect(first.success).toBe(true)

        const second = await getIam().authz.assignPermissionToRole(role.data.id, perm.data.id)
        expect(second.success).toBe(true)

        const permsResult = await getIam().authz.getRolePermissions(role.data.id)
        if (permsResult.success) {
          const matching = permsResult.data.filter(p => p.code === 'rp:dup_assign')
          expect(matching).toHaveLength(1)
        }
      })
    })

    // =========================================================================
    // 用户-角色关联
    // =========================================================================

    describe('用户-角色关联', () => {
      it('assignRole 应分配角色给用户', async () => {
        const regResult = await getIam().user.register({
          username: 'authz_assign_user',
          password: TEST_PASSWORD,
        })
        const role = await getIam().authz.createRole({ code: 'assign_user_role', name: '用户角色' })
        expect(regResult.success && role.success).toBe(true)
        if (!regResult.success || !role.success)
          return

        const result = await getIam().authz.assignRole(regResult.data.user.id, role.data.id)
        expect(result.success).toBe(true)

        const rolesResult = await getIam().authz.getUserRoles(regResult.data.user.id)
        expect(rolesResult.success).toBe(true)
        if (rolesResult.success) {
          expect(rolesResult.data.some(r => r.code === 'assign_user_role')).toBe(true)
        }
      })

      it('removeRole 应移除角色', async () => {
        const regResult = await getIam().user.register({
          username: 'authz_remove_role_user',
          password: TEST_PASSWORD,
        })
        const role = await getIam().authz.createRole({ code: 'remove_user_role', name: '可移除角色' })
        expect(regResult.success && role.success).toBe(true)
        if (!regResult.success || !role.success)
          return

        await getIam().authz.assignRole(regResult.data.user.id, role.data.id)
        const removeResult = await getIam().authz.removeRole(regResult.data.user.id, role.data.id)
        expect(removeResult.success).toBe(true)

        const rolesResult = await getIam().authz.getUserRoles(regResult.data.user.id)
        expect(rolesResult.success).toBe(true)
        if (rolesResult.success) {
          expect(rolesResult.data.some(r => r.code === 'remove_user_role')).toBe(false)
        }
      })

      it('assignRole 角色不存在应返回 ROLE_NOT_FOUND', async () => {
        const regResult = await getIam().user.register({
          username: 'authz_bad_role_user',
          password: TEST_PASSWORD,
        })
        if (!regResult.success)
          return

        const result = await getIam().authz.assignRole(regResult.data.user.id, 'bad-role')
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.ROLE_NOT_FOUND)
        }
      })

      it('getUserPermissions 应返回用户通过角色获得的权限', async () => {
        const regResult = await getIam().user.register({
          username: 'authz_user_perms',
          password: TEST_PASSWORD,
        })
        const role = await getIam().authz.createRole({ code: 'perm_lookup_role', name: '权限查询角色' })
        const perm = await getIam().authz.createPermission({ code: 'perm:lookup', name: '查询权限' })
        if (!regResult.success || !role.success || !perm.success)
          return

        await getIam().authz.assignPermissionToRole(role.data.id, perm.data.id)
        await getIam().authz.assignRole(regResult.data.user.id, role.data.id)

        const result = await getIam().authz.getUserPermissions(regResult.data.user.id)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.some(p => p.code === 'perm:lookup')).toBe(true)
        }
      })

      it('重复 assignRole 应幂等成功', async () => {
        const regResult = await getIam().user.register({
          username: 'authz_dup_assign_user',
          password: TEST_PASSWORD,
        })
        const role = await getIam().authz.createRole({ code: 'dup_assign_role', name: '幂等角色' })
        if (!regResult.success || !role.success)
          return

        const first = await getIam().authz.assignRole(regResult.data.user.id, role.data.id)
        expect(first.success).toBe(true)

        const second = await getIam().authz.assignRole(regResult.data.user.id, role.data.id)
        expect(second.success).toBe(true)

        const rolesResult = await getIam().authz.getUserRoles(regResult.data.user.id)
        if (rolesResult.success) {
          const matching = rolesResult.data.filter(r => r.code === 'dup_assign_role')
          expect(matching).toHaveLength(1)
        }
      })

      it('getUserRoles 无角色用户应返回空数组', async () => {
        const regResult = await getIam().user.register({
          username: 'authz_noroles_user',
          password: TEST_PASSWORD,
        })
        if (!regResult.success)
          return

        const result = await getIam().authz.getUserRoles(regResult.data.user.id)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data).toEqual([])
        }
      })

      it('getUserPermissions 无角色用户应返回空数组', async () => {
        const regResult = await getIam().user.register({
          username: 'authz_noperms_user',
          password: TEST_PASSWORD,
        })
        if (!regResult.success)
          return

        const result = await getIam().authz.getUserPermissions(regResult.data.user.id)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data).toEqual([])
        }
      })
    })

    // =========================================================================
    // 权限检查
    // =========================================================================

    describe('checkPermission', () => {
      let superAdminRoleId: string

      beforeAll(async () => {
        const superRole = await getIam().authz.createRole({
          code: 'super_admin',
          name: '超级管理员',
        })
        if (superRole.success) {
          superAdminRoleId = superRole.data.id
        }
      })

      it('拥有权限时应返回 true', async () => {
        const role = await getIam().authz.createRole({ code: 'check_perm_role', name: '权限角色' })
        const perm = await getIam().authz.createPermission({ code: 'check:access', name: '访问权限' })
        expect(role.success && perm.success).toBe(true)
        if (!role.success || !perm.success)
          return

        await getIam().authz.assignPermissionToRole(role.data.id, perm.data.id)

        const regResult = await getIam().user.register({
          username: 'authz_check_user',
          password: TEST_PASSWORD,
        })
        if (!regResult.success)
          return

        await getIam().authz.assignRole(regResult.data.user.id, role.data.id)

        const result = await getIam().authz.checkPermission(
          { userId: regResult.data.user.id, roles: [role.data.id] },
          'check:access',
        )
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data).toBe(true)
        }
      })

      it('不拥有权限时应返回 false', async () => {
        const role = await getIam().authz.createRole({ code: 'no_perm_role', name: '无权限角色' })
        if (!role.success)
          return

        const regResult = await getIam().user.register({
          username: 'authz_no_perm_user',
          password: TEST_PASSWORD,
        })
        if (!regResult.success)
          return

        await getIam().authz.assignRole(regResult.data.user.id, role.data.id)

        const result = await getIam().authz.checkPermission(
          { userId: regResult.data.user.id, roles: [role.data.id] },
          'nonexistent:permission',
        )
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data).toBe(false)
        }
      })

      it('超管角色应拥有所有权限', async () => {
        const regResult = await getIam().user.register({
          username: 'authz_super_user',
          password: TEST_PASSWORD,
        })
        if (!regResult.success)
          return

        await getIam().authz.assignRole(regResult.data.user.id, superAdminRoleId)

        const result = await getIam().authz.checkPermission(
          { userId: regResult.data.user.id, roles: [superAdminRoleId] },
          'any:permission:whatsoever',
        )
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data).toBe(true)
        }
      })

      it('通配符权限匹配（user:* 应匹配 user:read）', async () => {
        const role = await getIam().authz.createRole({ code: 'wildcard_role', name: '通配符角色' })
        const wildcardPerm = await getIam().authz.createPermission({ code: 'wildcard:*', name: '通配符权限' })
        if (!role.success || !wildcardPerm.success)
          return

        await getIam().authz.assignPermissionToRole(role.data.id, wildcardPerm.data.id)

        const regResult = await getIam().user.register({
          username: 'authz_wildcard_user',
          password: TEST_PASSWORD,
        })
        if (!regResult.success)
          return

        await getIam().authz.assignRole(regResult.data.user.id, role.data.id)

        const result = await getIam().authz.checkPermission(
          { userId: regResult.data.user.id, roles: [role.data.id] },
          'wildcard:read',
        )
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data).toBe(true)
        }

        const noMatchResult = await getIam().authz.checkPermission(
          { userId: regResult.data.user.id, roles: [role.data.id] },
          'other:read',
        )
        expect(noMatchResult.success).toBe(true)
        if (noMatchResult.success) {
          expect(noMatchResult.data).toBe(false)
        }
      })

      it('deleteRole 后缓存应被清理（不影响检查）', async () => {
        const role = await getIam().authz.createRole({ code: 'del_cache_role', name: '缓存角色' })
        const perm = await getIam().authz.createPermission({ code: 'del_cache:perm', name: '缓存权限' })
        if (!role.success || !perm.success)
          return

        await getIam().authz.assignPermissionToRole(role.data.id, perm.data.id)

        const regResult = await getIam().user.register({
          username: 'authz_del_cache_user',
          password: TEST_PASSWORD,
        })
        if (!regResult.success)
          return
        await getIam().authz.assignRole(regResult.data.user.id, role.data.id)
        await getIam().authz.checkPermission(
          { userId: regResult.data.user.id, roles: [role.data.id] },
          'del_cache:perm',
        )

        await getIam().authz.deleteRole(role.data.id)

        const getResult = await getIam().authz.getRole(role.data.id)
        expect(getResult.success).toBe(true)
        if (getResult.success) {
          expect(getResult.data).toBeNull()
        }
      })

      it('deletePermission 后缓存应被清理', async () => {
        const role = await getIam().authz.createRole({ code: 'del_perm_cache_role', name: '权限缓存角色' })
        const perm = await getIam().authz.createPermission({ code: 'del_perm_cache:perm', name: '待删权限' })
        if (!role.success || !perm.success)
          return

        await getIam().authz.assignPermissionToRole(role.data.id, perm.data.id)

        await getIam().authz.checkPermission(
          { userId: 'any-user', roles: [role.data.id] },
          'del_perm_cache:perm',
        )

        await getIam().authz.deletePermission(perm.data.id)

        const result = await getIam().authz.checkPermission(
          { userId: 'any-user', roles: [role.data.id] },
          'del_perm_cache:perm',
        )
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data).toBe(false)
        }
      })
    })
  }

  defineIamSuite('sqlite+memory', sqliteMemoryEnv(), getIam => defineCommon(getIam))
  defineIamSuite('postgres+redis', postgresRedisEnv, getIam => defineCommon(getIam))
})
