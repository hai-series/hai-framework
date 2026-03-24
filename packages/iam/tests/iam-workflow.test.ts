/**
 * =============================================================================
 * @h-ai/iam - 完整工作流测试
 * =============================================================================
 *
 * 参照 @h-ai/storage 的 workflow 测试风格，从实际使用场景出发，
 * 覆盖完整的前端 + 后端操作流程。
 *
 * 工作流：
 * 1. 用户注册 → 登录 → 令牌验证 → 获取当前用户 → 更新资料 → 修改密码 → 重新登录 → 登出
 * 2. RBAC 设置 → 角色创建 → 权限创建 → 关联 → 分配给用户 → 权限检查
 * 3. 多会话管理：多端登录 → 单设备模式 → 会话清理
 * 4. 管理员操作：创建角色/权限 → 分配用户 → 用户验证权限 → 管理员撤销
 * 10. OTP 验证码登录：配置回调 → sendOtp → 回调接收验证码 → loginWithOtp
 */

import type { IamFunctions } from '../src/iam-types.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { HaiIamError } from '../src/iam-config.js'
import { defineIamSuite, initIam, postgresRedisEnv, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'

describe('iam.workflow', () => {
  const defineCommon = (getIam: () => IamFunctions) => {
    // =========================================================================
    // 工作流 1：完整用户生命周期
    // =========================================================================

    describe('完整用户生命周期', () => {
      it('注册 → 登录 → 验证令牌 → 获取用户 → 更新资料 → 改密码 → 重新登录 → 登出', async () => {
        const iam = getIam()

        // ① 注册
        const regResult = await iam.user.register({
          username: 'wf_lifecycle_user',
          email: 'wf_lifecycle@test.com',
          password: TEST_PASSWORD,
          displayName: '工作流用户',
        })
        expect(regResult.success).toBe(true)
        if (!regResult.success)
          return
        const userId = regResult.data.user.id

        // ② 登录
        const loginResult = await iam.auth.login({
          identifier: 'wf_lifecycle_user',
          password: TEST_PASSWORD,
        })
        expect(loginResult.success).toBe(true)
        if (!loginResult.success)
          return
        const accessToken = loginResult.data.tokens.accessToken

        // ③ 验证令牌
        const verifyResult = await iam.auth.verifyToken(accessToken)
        expect(verifyResult.success).toBe(true)
        if (verifyResult.success) {
          expect(verifyResult.data.userId).toBe(userId)
        }

        // ④ 获取当前用户（模拟前端通过令牌获取用户信息）
        const currentUser = await iam.user.getCurrentUser(accessToken)
        expect(currentUser.success).toBe(true)
        if (currentUser.success) {
          expect(currentUser.data.username).toBe('wf_lifecycle_user')
          expect(currentUser.data.email).toBe('wf_lifecycle@test.com')
          expect(currentUser.data.displayName).toBe('工作流用户')
        }

        // ⑤ 更新资料
        const updateResult = await iam.user.updateUser(userId, {
          displayName: '更新后的名称',
        })
        expect(updateResult.success).toBe(true)
        if (updateResult.success) {
          expect(updateResult.data.displayName).toBe('更新后的名称')
        }

        // ⑥ 修改密码
        const newPassword = 'NewSecurePass789'
        const changePwdResult = await iam.user.changePassword(userId, TEST_PASSWORD, newPassword)
        expect(changePwdResult.success).toBe(true)

        // ⑦ 旧密码不能登录
        const oldPwdLogin = await iam.auth.login({
          identifier: 'wf_lifecycle_user',
          password: TEST_PASSWORD,
        })
        expect(oldPwdLogin.success).toBe(false)

        // ⑧ 新密码重新登录
        const reLoginResult = await iam.auth.login({
          identifier: 'wf_lifecycle_user',
          password: newPassword,
        })
        expect(reLoginResult.success).toBe(true)
        if (!reLoginResult.success)
          return

        // ⑨ 登出
        const logoutResult = await iam.auth.logout(reLoginResult.data.tokens.accessToken)
        expect(logoutResult.success).toBe(true)

        // ⑩ 登出后令牌失效
        const afterLogout = await iam.auth.verifyToken(reLoginResult.data.tokens.accessToken)
        expect(afterLogout.success).toBe(false)
      })
    })

    // =========================================================================
    // 工作流 2：RBAC 权限完整流程
    // =========================================================================

    describe('rBAC 权限完整流程', () => {
      it('创建角色 → 创建权限 → 关联 → 注册用户 → 分配角色 → 登录 → 检查权限', async () => {
        const iam = getIam()

        // ① 创建角色
        const roleResult = await iam.authz.createRole({
          code: 'wf_editor',
          name: '编辑者',
          description: '可以编辑内容',
        })
        expect(roleResult.success).toBe(true)
        if (!roleResult.success)
          return
        const roleId = roleResult.data.id

        // ② 创建权限
        const readPerm = await iam.authz.createPermission({ code: 'wf_content:read', name: '读取内容' })
        const writePerm = await iam.authz.createPermission({ code: 'wf_content:write', name: '写入内容' })
        const deletePerm = await iam.authz.createPermission({ code: 'wf_content:delete', name: '删除内容' })
        expect(readPerm.success && writePerm.success && deletePerm.success).toBe(true)
        if (!readPerm.success || !writePerm.success || !deletePerm.success)
          return

        // ③ 关联权限到角色（编辑者可以读写，不能删除）
        await iam.authz.assignPermissionToRole(roleId, readPerm.data.id)
        await iam.authz.assignPermissionToRole(roleId, writePerm.data.id)

        // ④ 注册用户
        const regResult = await iam.user.register({
          username: 'wf_editor_user',
          password: TEST_PASSWORD,
        })
        expect(regResult.success).toBe(true)
        if (!regResult.success)
          return
        const userId = regResult.data.user.id

        // ⑤ 分配角色
        const assignResult = await iam.authz.assignRole(userId, roleId)
        expect(assignResult.success).toBe(true)

        // ⑥ 登录获取会话
        const loginResult = await iam.auth.login({
          identifier: 'wf_editor_user',
          password: TEST_PASSWORD,
        })
        expect(loginResult.success).toBe(true)
        if (!loginResult.success)
          return

        // ⑦ 验证令牌获取会话信息（包含角色 code）
        const session = await iam.auth.verifyToken(loginResult.data.tokens.accessToken)
        expect(session.success).toBe(true)
        if (session.success) {
          expect(session.data.roles).toContain('wf_editor')
        }

        // ⑧ 检查权限：应有 read 和 write，不应有 delete
        const hasRead = await iam.authz.checkPermission(
          userId,
          'wf_content:read',
        )
        expect(hasRead.success && hasRead.data).toBe(true)

        const hasWrite = await iam.authz.checkPermission(
          userId,
          'wf_content:write',
        )
        expect(hasWrite.success && hasWrite.data).toBe(true)

        const hasDelete = await iam.authz.checkPermission(
          userId,
          'wf_content:delete',
        )
        expect(hasDelete.success).toBe(true)
        if (hasDelete.success) {
          expect(hasDelete.data).toBe(false)
        }
      })
    })

    // =========================================================================
    // 工作流 3：管理员操作 + 权限变更
    // =========================================================================

    describe('管理员操作与权限变更', () => {
      it('管理员创建角色 → 分配用户 → 用户验证权限 → 新增权限 → 实时生效 → 移除权限', async () => {
        const iam = getIam()

        // ① 创建自定义角色
        const role = await iam.authz.createRole({ code: 'wf_reviewer', name: '审核者' })
        expect(role.success).toBe(true)
        if (!role.success)
          return

        // ② 创建权限
        const perm1 = await iam.authz.createPermission({ code: 'wf_review:view', name: '查看审核' })
        const perm2 = await iam.authz.createPermission({ code: 'wf_review:approve', name: '批准审核' })
        if (!perm1.success || !perm2.success)
          return

        // ③ 先只关联 view 权限
        await iam.authz.assignPermissionToRole(role.data.id, perm1.data.id)

        // ④ 注册并分配角色
        const reg = await iam.user.register({ username: 'wf_reviewer_user', password: TEST_PASSWORD })
        if (!reg.success)
          return
        await iam.authz.assignRole(reg.data.user.id, role.data.id)

        // ⑤ 用户登录
        const login = await iam.auth.login({
          identifier: 'wf_reviewer_user',
          password: TEST_PASSWORD,
        })
        if (!login.success)
          return

        // ⑥ 检查权限：应有 view，不应有 approve
        const hasView = await iam.authz.checkPermission(
          reg.data.user.id,
          'wf_review:view',
        )
        expect(hasView.success && hasView.data).toBe(true)

        const hasApprove = await iam.authz.checkPermission(
          reg.data.user.id,
          'wf_review:approve',
        )
        expect(hasApprove.success).toBe(true)
        if (hasApprove.success)
          expect(hasApprove.data).toBe(false)

        // ⑦ 管理员新增 approve 权限到角色
        await iam.authz.assignPermissionToRole(role.data.id, perm2.data.id)

        // ⑧ 用户无需重新登录即有新权限（缓存刷新后）
        const hasApproveNow = await iam.authz.checkPermission(
          reg.data.user.id,
          'wf_review:approve',
        )
        expect(hasApproveNow.success && hasApproveNow.data).toBe(true)

        // ⑨ 管理员移除 view 权限
        await iam.authz.removePermissionFromRole(role.data.id, perm1.data.id)

        // ⑩ view 权限应不再可用
        const hasViewAfterRemoval = await iam.authz.checkPermission(
          reg.data.user.id,
          'wf_review:view',
        )
        expect(hasViewAfterRemoval.success).toBe(true)
        if (hasViewAfterRemoval.success)
          expect(hasViewAfterRemoval.data).toBe(false)
      })

      it('权限变更后会话 permissions 实时同步', async () => {
        const iam = getIam()

        // ① 创建角色和权限
        const role = await iam.authz.createRole({ code: 'wf_sync_role', name: '同步测试角色' })
        expect(role.success).toBe(true)
        if (!role.success)
          return

        const permA = await iam.authz.createPermission({ code: 'wf_sync:a', name: '权限A' })
        const permB = await iam.authz.createPermission({ code: 'wf_sync:b', name: '权限B' })
        expect(permA.success && permB.success).toBe(true)
        if (!permA.success || !permB.success)
          return

        // ② 关联权限 A
        await iam.authz.assignPermissionToRole(role.data.id, permA.data.id)

        // ③ 注册用户 → 分配角色 → 登录
        const reg = await iam.user.register({ username: 'wf_sync_user', password: TEST_PASSWORD })
        if (!reg.success)
          return
        await iam.authz.assignRole(reg.data.user.id, role.data.id)

        const login = await iam.auth.login({ identifier: 'wf_sync_user', password: TEST_PASSWORD })
        expect(login.success).toBe(true)
        if (!login.success)
          return

        // ④ 登录后会话应包含权限 A
        const session1 = await iam.auth.verifyToken(login.data.tokens.accessToken)
        expect(session1.success).toBe(true)
        if (!session1.success)
          return
        expect(session1.data.permissions).toContain('wf_sync:a')
        expect(session1.data.permissions).not.toContain('wf_sync:b')

        // ⑤ 管理员给角色新增权限 B → 会话实时同步
        await iam.authz.assignPermissionToRole(role.data.id, permB.data.id)

        const session2 = await iam.auth.verifyToken(login.data.tokens.accessToken)
        expect(session2.success).toBe(true)
        if (!session2.success)
          return
        expect(session2.data.permissions).toContain('wf_sync:a')
        expect(session2.data.permissions).toContain('wf_sync:b')

        // ⑥ 管理员移除权限 A → 会话实时同步
        await iam.authz.removePermissionFromRole(role.data.id, permA.data.id)

        const session3 = await iam.auth.verifyToken(login.data.tokens.accessToken)
        expect(session3.success).toBe(true)
        if (!session3.success)
          return
        expect(session3.data.permissions).not.toContain('wf_sync:a')
        expect(session3.data.permissions).toContain('wf_sync:b')
      })

      it('删除权限后会话 permissions 实时同步', async () => {
        const iam = getIam()

        // ① 创建角色和权限
        const role = await iam.authz.createRole({ code: 'wf_delperm_role', name: '删除权限测试角色' })
        expect(role.success).toBe(true)
        if (!role.success)
          return

        const perm = await iam.authz.createPermission({ code: 'wf_delperm:target', name: '待删权限' })
        const permKeep = await iam.authz.createPermission({ code: 'wf_delperm:keep', name: '保留权限' })
        expect(perm.success && permKeep.success).toBe(true)
        if (!perm.success || !permKeep.success)
          return

        // ② 关联权限
        await iam.authz.assignPermissionToRole(role.data.id, perm.data.id)
        await iam.authz.assignPermissionToRole(role.data.id, permKeep.data.id)

        // ③ 注册用户 → 分配角色 → 登录
        const reg = await iam.user.register({ username: 'wf_delperm_user', password: TEST_PASSWORD })
        if (!reg.success)
          return
        await iam.authz.assignRole(reg.data.user.id, role.data.id)

        const login = await iam.auth.login({ identifier: 'wf_delperm_user', password: TEST_PASSWORD })
        if (!login.success)
          return

        // ④ 登录后会话应包含两个权限
        const session1 = await iam.auth.verifyToken(login.data.tokens.accessToken)
        expect(session1.success).toBe(true)
        if (!session1.success)
          return
        expect(session1.data.permissions).toContain('wf_delperm:target')
        expect(session1.data.permissions).toContain('wf_delperm:keep')

        // ⑤ 管理员删除权限 → 会话实时同步
        await iam.authz.deletePermission(perm.data.id)

        const session2 = await iam.auth.verifyToken(login.data.tokens.accessToken)
        expect(session2.success).toBe(true)
        if (!session2.success)
          return
        expect(session2.data.permissions).not.toContain('wf_delperm:target')
        expect(session2.data.permissions).toContain('wf_delperm:keep')
      })

      it('删除角色后会话 permissions 实时同步', async () => {
        const iam = getIam()

        // ① 创建角色和权限
        const role = await iam.authz.createRole({ code: 'wf_delrole_role', name: '删除角色测试' })
        expect(role.success).toBe(true)
        if (!role.success)
          return

        const perm = await iam.authz.createPermission({ code: 'wf_delrole:perm', name: '角色权限' })
        expect(perm.success).toBe(true)
        if (!perm.success)
          return

        await iam.authz.assignPermissionToRole(role.data.id, perm.data.id)

        // ② 注册用户 → 分配角色 → 登录
        const reg = await iam.user.register({ username: 'wf_delrole_user', password: TEST_PASSWORD })
        if (!reg.success)
          return
        await iam.authz.assignRole(reg.data.user.id, role.data.id)

        const login = await iam.auth.login({ identifier: 'wf_delrole_user', password: TEST_PASSWORD })
        if (!login.success)
          return

        // ③ 登录后会话应包含权限
        const session1 = await iam.auth.verifyToken(login.data.tokens.accessToken)
        expect(session1.success).toBe(true)
        if (!session1.success)
          return
        expect(session1.data.permissions).toContain('wf_delrole:perm')
        expect(session1.data.roles).toContain('wf_delrole_role')

        // ④ 管理员删除角色 → 会话角色和权限都同步
        await iam.authz.deleteRole(role.data.id)

        const session2 = await iam.auth.verifyToken(login.data.tokens.accessToken)
        expect(session2.success).toBe(true)
        if (!session2.success)
          return
        expect(session2.data.roles).not.toContain('wf_delrole_role')
        expect(session2.data.permissions).not.toContain('wf_delrole:perm')
      })

      it('分配角色后会话 permissions 实时同步', async () => {
        const iam = getIam()

        // ① 创建角色和权限并关联
        const role = await iam.authz.createRole({ code: 'wf_assign_role', name: '分配测试角色' })
        expect(role.success).toBe(true)
        if (!role.success)
          return

        const perm = await iam.authz.createPermission({ code: 'wf_assign:perm', name: '分配权限' })
        expect(perm.success).toBe(true)
        if (!perm.success)
          return

        await iam.authz.assignPermissionToRole(role.data.id, perm.data.id)

        // ② 注册用户并登录（无角色）
        const reg = await iam.user.register({ username: 'wf_assign_user', password: TEST_PASSWORD })
        if (!reg.success)
          return

        const login = await iam.auth.login({ identifier: 'wf_assign_user', password: TEST_PASSWORD })
        if (!login.success)
          return

        // ③ 登录后无角色无权限
        const session1 = await iam.auth.verifyToken(login.data.tokens.accessToken)
        expect(session1.success).toBe(true)
        if (!session1.success)
          return
        expect(session1.data.roles).not.toContain('wf_assign_role')
        expect(session1.data.permissions).not.toContain('wf_assign:perm')

        // ④ 管理员分配角色 → 会话角色和权限都实时同步
        await iam.authz.assignRole(reg.data.user.id, role.data.id)

        const session2 = await iam.auth.verifyToken(login.data.tokens.accessToken)
        expect(session2.success).toBe(true)
        if (!session2.success)
          return
        expect(session2.data.roles).toContain('wf_assign_role')
        expect(session2.data.permissions).toContain('wf_assign:perm')
      })

      it('移除角色后会话 permissions 实时失效', async () => {
        const iam = getIam()

        // ① 创建角色和权限
        const role = await iam.authz.createRole({ code: 'wf_rmrole_role', name: '移除测试角色' })
        expect(role.success).toBe(true)
        if (!role.success)
          return

        const perm = await iam.authz.createPermission({ code: 'wf_rmrole:perm', name: '移除权限' })
        expect(perm.success).toBe(true)
        if (!perm.success)
          return

        await iam.authz.assignPermissionToRole(role.data.id, perm.data.id)

        // ② 注册用户 → 分配角色 → 登录
        const reg = await iam.user.register({ username: 'wf_rmrole_user', password: TEST_PASSWORD })
        if (!reg.success)
          return
        await iam.authz.assignRole(reg.data.user.id, role.data.id)

        const login = await iam.auth.login({ identifier: 'wf_rmrole_user', password: TEST_PASSWORD })
        if (!login.success)
          return

        // ③ 登录后有角色有权限
        const session1 = await iam.auth.verifyToken(login.data.tokens.accessToken)
        expect(session1.success).toBe(true)
        if (!session1.success)
          return
        expect(session1.data.roles).toContain('wf_rmrole_role')
        expect(session1.data.permissions).toContain('wf_rmrole:perm')

        // ④ 管理员移除角色 → 会话角色和权限都立即失效
        await iam.authz.removeRole(reg.data.user.id, role.data.id)

        const session2 = await iam.auth.verifyToken(login.data.tokens.accessToken)
        expect(session2.success).toBe(true)
        if (!session2.success)
          return
        expect(session2.data.roles).not.toContain('wf_rmrole_role')
        expect(session2.data.permissions).not.toContain('wf_rmrole:perm')
      })

      it('修改角色 code 后会话 roles 实时同步', async () => {
        const iam = getIam()

        // ① 创建角色
        const role = await iam.authz.createRole({ code: 'wf_updrole_old', name: '待改名角色' })
        expect(role.success).toBe(true)
        if (!role.success)
          return

        // ② 注册用户 → 分配角色 → 登录
        const reg = await iam.user.register({ username: 'wf_updrole_user', password: TEST_PASSWORD })
        if (!reg.success)
          return
        await iam.authz.assignRole(reg.data.user.id, role.data.id)

        const login = await iam.auth.login({ identifier: 'wf_updrole_user', password: TEST_PASSWORD })
        if (!login.success)
          return

        // ③ 登录后应有旧 code
        const session1 = await iam.auth.verifyToken(login.data.tokens.accessToken)
        expect(session1.success).toBe(true)
        if (!session1.success)
          return
        expect(session1.data.roles).toContain('wf_updrole_old')

        // ④ 管理员修改角色 code → 会话实时同步新 code
        await iam.authz.updateRole(role.data.id, { code: 'wf_updrole_new', name: '已改名角色' })

        const session2 = await iam.auth.verifyToken(login.data.tokens.accessToken)
        expect(session2.success).toBe(true)
        if (!session2.success)
          return
        expect(session2.data.roles).not.toContain('wf_updrole_old')
        expect(session2.data.roles).toContain('wf_updrole_new')
      })
    })

    // =========================================================================
    // 工作流 4：多会话管理
    // =========================================================================

    describe('多会话管理', () => {
      it('多端登录 → 各端独立会话 → 全部登出', async () => {
        const iam = getIam()

        await iam.user.register({ username: 'wf_multi_session', password: TEST_PASSWORD })

        // 模拟多端登录
        const loginPC = await iam.auth.login({
          identifier: 'wf_multi_session',
          password: TEST_PASSWORD,
        })
        const loginMobile = await iam.auth.login({
          identifier: 'wf_multi_session',
          password: TEST_PASSWORD,
        })
        expect(loginPC.success && loginMobile.success).toBe(true)
        if (!loginPC.success || !loginMobile.success)
          return

        // 两个令牌都应有效
        const verifyPC = await iam.auth.verifyToken(loginPC.data.tokens.accessToken)
        const verifyMobile = await iam.auth.verifyToken(loginMobile.data.tokens.accessToken)
        expect(verifyPC.success).toBe(true)
        expect(verifyMobile.success).toBe(true)

        // 登出 PC 端
        await iam.auth.logout(loginPC.data.tokens.accessToken)

        // PC 端令牌失效，Mobile 端不受影响
        const verifyPCAfter = await iam.auth.verifyToken(loginPC.data.tokens.accessToken)
        expect(verifyPCAfter.success).toBe(false)

        const verifyMobileAfter = await iam.auth.verifyToken(loginMobile.data.tokens.accessToken)
        expect(verifyMobileAfter.success).toBe(true)
      })
    })

    // =========================================================================
    // 工作流 5：单设备登录策略
    // =========================================================================

    describe('单设备登录策略', () => {
      let singleDeviceIam: IamFunctions

      beforeAll(async () => {
        singleDeviceIam = await initIam({
          session: { maxAge: 3600, sliding: false, singleDevice: true },
        })
      })

      afterAll(async () => {
        await initIam()
      })

      it('注册 → 登录A → 登录B → A失效 → B有效 → 登出B', async () => {
        // ① 注册
        await singleDeviceIam.user.register({
          username: 'wf_single_device',
          password: TEST_PASSWORD,
        })

        // ② 设备A登录
        const loginA = await singleDeviceIam.auth.login({
          identifier: 'wf_single_device',
          password: TEST_PASSWORD,
        })
        expect(loginA.success).toBe(true)
        if (!loginA.success)
          return

        // ③ 设备B登录（应踢掉设备A）
        const loginB = await singleDeviceIam.auth.login({
          identifier: 'wf_single_device',
          password: TEST_PASSWORD,
        })
        expect(loginB.success).toBe(true)
        if (!loginB.success)
          return

        // ④ 设备A令牌应已失效
        const verifyA = await singleDeviceIam.auth.verifyToken(loginA.data.tokens.accessToken)
        expect(verifyA.success).toBe(false)

        // ⑤ 设备B令牌应有效
        const verifyB = await singleDeviceIam.auth.verifyToken(loginB.data.tokens.accessToken)
        expect(verifyB.success).toBe(true)

        // ⑥ 登出设备B
        const logoutB = await singleDeviceIam.auth.logout(loginB.data.tokens.accessToken)
        expect(logoutB.success).toBe(true)

        // ⑦ B也失效
        const verifyBAfter = await singleDeviceIam.auth.verifyToken(loginB.data.tokens.accessToken)
        expect(verifyBAfter.success).toBe(false)
      })
    })

    // =========================================================================
    // 工作流 6：密码找回流程
    // =========================================================================

    describe('密码找回流程', () => {
      it('请求重置 → 用令牌确认重置 → 新密码可登录', async () => {
        // 通过回调捕获明文令牌（DB 中存储的是哈希值）
        let capturedToken = ''
        const resetIam = await initIam({
          onPasswordResetRequest: async (_user, token) => {
            capturedToken = token
          },
        })

        await resetIam.user.register({
          username: 'wf_reset_user',
          email: 'wf_reset@test.com',
          password: TEST_PASSWORD,
        })

        // 请求密码重置
        const requestResult = await resetIam.user.requestPasswordReset('wf_reset@test.com')
        expect(requestResult.success).toBe(true)
        expect(capturedToken).toBeTruthy()

        // 用令牌确认重置
        const confirmResult = await resetIam.user.confirmPasswordReset(capturedToken, 'NewPass789')
        expect(confirmResult.success).toBe(true)

        // 新密码应可登录
        const loginResult = await resetIam.auth.login({
          identifier: 'wf_reset_user',
          password: 'NewPass789',
        })
        expect(loginResult.success).toBe(true)

        // 旧密码应不可登录
        const oldLoginResult = await resetIam.auth.login({
          identifier: 'wf_reset_user',
          password: TEST_PASSWORD,
        })
        expect(oldLoginResult.success).toBe(false)

        // 还原默认配置
        await initIam()
      })

      it('无效令牌 → confirmPasswordReset 返回 RESET_TOKEN_INVALID', async () => {
        const confirmResult = await getIam().user.confirmPasswordReset('fake-token', 'NewPass789')
        expect(confirmResult.success).toBe(false)
        if (!confirmResult.success) {
          expect(confirmResult.error.code).toBe(HaiIamError.RESET_TOKEN_INVALID.code)
        }
      })
    })

    // =========================================================================
    // 工作流 7：注册限制与账户锁定
    // =========================================================================

    describe('注册限制与账户锁定', () => {
      it('注册禁用 → 拒绝 → 开启后允许 → 登录失败锁定', async () => {
        // ① 注册禁用配置
        const restrictedIam = await initIam({
          register: { enabled: false, defaultEnabled: true },
          security: { maxLoginAttempts: 2, lockoutDuration: 60 },
        })

        // ② 尝试注册应被拒绝
        const regResult = await restrictedIam.user.register({
          username: 'wf_restricted',
          password: TEST_PASSWORD,
        })
        expect(regResult.success).toBe(false)
        if (!regResult.success) {
          expect(regResult.error.code).toBe(HaiIamError.REGISTER_DISABLED.code)
        }

        await initIam()

        // ③ 创建允许注册的实例
        const openIam = await initIam({
          security: { maxLoginAttempts: 2, lockoutDuration: 60 },
        })

        // ④ 现在可以注册
        const openReg = await openIam.user.register({
          username: 'wf_lock_target',
          password: TEST_PASSWORD,
        })
        expect(openReg.success).toBe(true)

        // ⑤ 连续错误密码触发锁定
        for (let i = 0; i < 2; i++) {
          await openIam.auth.login({
            identifier: 'wf_lock_target',
            password: 'WrongPass999',
          })
        }

        const lockedResult = await openIam.auth.login({
          identifier: 'wf_lock_target',
          password: TEST_PASSWORD,
        })
        expect(lockedResult.success).toBe(false)
        if (!lockedResult.success) {
          expect(lockedResult.error.code).toBe(HaiIamError.USER_LOCKED.code)
        }

        // ⑥ 锁定后即使密码正确也应失败（不等待解锁，lockoutDuration=60s 远超测试时间）

        await initIam()
      })
    })

    // =========================================================================
    // 工作流 8：多角色组合权限
    // =========================================================================

    describe('多角色组合权限', () => {
      it('用户拥有多角色 → 权限并集 → 移除一个角色后部分权限失效', async () => {
        const iam = getIam()

        // ① 创建两个角色，各自拥有不同权限
        const roleA = await iam.authz.createRole({ code: 'wf_role_a', name: '角色A' })
        const roleB = await iam.authz.createRole({ code: 'wf_role_b', name: '角色B' })
        if (!roleA.success || !roleB.success)
          return

        const permX = await iam.authz.createPermission({ code: 'wf_perm:x', name: '权限X' })
        const permY = await iam.authz.createPermission({ code: 'wf_perm:y', name: '权限Y' })
        const permZ = await iam.authz.createPermission({ code: 'wf_perm:z', name: '权限Z' })
        if (!permX.success || !permY.success || !permZ.success)
          return

        // 角色A: 权限X + Y
        await iam.authz.assignPermissionToRole(roleA.data.id, permX.data.id)
        await iam.authz.assignPermissionToRole(roleA.data.id, permY.data.id)
        // 角色B: 权限Y + Z
        await iam.authz.assignPermissionToRole(roleB.data.id, permY.data.id)
        await iam.authz.assignPermissionToRole(roleB.data.id, permZ.data.id)

        // ② 注册用户并分配两个角色
        const reg = await iam.user.register({ username: 'wf_multi_role', password: TEST_PASSWORD })
        if (!reg.success)
          return
        await iam.authz.assignRole(reg.data.user.id, roleA.data.id)
        await iam.authz.assignRole(reg.data.user.id, roleB.data.id)

        // ③ 用户应拥有 X, Y, Z 三个权限
        const checkX = await iam.authz.checkPermission(reg.data.user.id, 'wf_perm:x')
        const checkY = await iam.authz.checkPermission(reg.data.user.id, 'wf_perm:y')
        const checkZ = await iam.authz.checkPermission(reg.data.user.id, 'wf_perm:z')
        expect(checkX.success && checkX.data).toBe(true)
        expect(checkY.success && checkY.data).toBe(true)
        expect(checkZ.success && checkZ.data).toBe(true)

        // ④ 移除角色A
        await iam.authz.removeRole(reg.data.user.id, roleA.data.id)

        // ⑤ 检查权限：X 应失效（仅 A 拥有），Y 仍有效（B 也有），Z 仍有效
        const checkXAfter = await iam.authz.checkPermission(reg.data.user.id, 'wf_perm:x')
        expect(checkXAfter.success).toBe(true)
        if (checkXAfter.success)
          expect(checkXAfter.data).toBe(false)

        const checkYAfter = await iam.authz.checkPermission(reg.data.user.id, 'wf_perm:y')
        expect(checkYAfter.success && checkYAfter.data).toBe(true)

        const checkZAfter = await iam.authz.checkPermission(reg.data.user.id, 'wf_perm:z')
        expect(checkZAfter.success && checkZAfter.data).toBe(true)
      })
    })

    // =========================================================================
    // 工作流 9：协议确认流程
    // =========================================================================

    describe('协议确认流程', () => {
      let agreementIam: IamFunctions

      beforeAll(async () => {
        agreementIam = await initIam({
          agreements: {
            userAgreementUrl: 'https://example.com/terms',
            privacyPolicyUrl: 'https://example.com/privacy',
            showOnLogin: true,
            showOnRegister: true,
          },
        })
      })

      afterAll(async () => {
        await initIam()
      })

      it('注册 → 登录应包含协议信息 → 前端展示协议', async () => {
        // ① 注册
        const reg = await agreementIam.user.register({
          username: 'wf_agreement_user',
          password: TEST_PASSWORD,
        })
        expect(reg.success).toBe(true)

        // ② 登录
        const login = await agreementIam.auth.login({
          identifier: 'wf_agreement_user',
          password: TEST_PASSWORD,
        })
        expect(login.success).toBe(true)
        if (!login.success)
          return

        // ③ 登录结果应包含协议 URL（前端据此展示协议确认弹窗）
        expect(login.data.agreements).toBeDefined()
        expect(login.data.agreements?.userAgreementUrl).toBe('https://example.com/terms')
        expect(login.data.agreements?.privacyPolicyUrl).toBe('https://example.com/privacy')

        // ④ 令牌有效（协议确认由前端负责，后端不阻塞）
        const verify = await agreementIam.auth.verifyToken(login.data.tokens.accessToken)
        expect(verify.success).toBe(true)
      })
    })
    // =========================================================================
    // 工作流 10：OTP 验证码登录流程
    // =========================================================================

    describe('oTP 验证码登录流程', () => {
      it('配置 onOtpSendEmail → sendOtp → 回调接收验证码 → loginWithOtp 成功', async () => {
        let capturedEmail = ''
        let capturedCode = ''

        const otpIam = await initIam({
          login: { password: true, otp: true },
          otp: { length: 6, expiresIn: 300, maxAttempts: 3, resendInterval: 30 },
          onOtpSendEmail: async (email, code) => {
            capturedEmail = email
            capturedCode = code
          },
        })

        // ① 先注册一个用户（邮箱可用于 OTP）
        await otpIam.user.register({
          username: 'wf_otp_user',
          email: 'wf_otp@test.com',
          password: TEST_PASSWORD,
        })

        // ② 发送验证码
        const sendResult = await otpIam.auth.sendOtp('wf_otp@test.com')
        expect(sendResult.success).toBe(true)
        expect(capturedEmail).toBe('wf_otp@test.com')
        expect(capturedCode).toBeTruthy()
        expect(capturedCode.length).toBe(6)

        // ③ 用验证码登录
        const loginResult = await otpIam.auth.loginWithOtp({
          identifier: 'wf_otp@test.com',
          code: capturedCode,
        })
        expect(loginResult.success).toBe(true)
        if (loginResult.success) {
          expect(loginResult.data.user.email).toBe('wf_otp@test.com')
          expect(loginResult.data.tokens.accessToken).toBeTruthy()
        }

        await initIam()
      })

      it('配置 onOtpSendSms → sendOtp(手机号) → 回调接收验证码', async () => {
        let capturedPhone = ''
        let capturedCode = ''

        const otpIam = await initIam({
          login: { password: true, otp: true },
          otp: { length: 4, expiresIn: 300, maxAttempts: 3, resendInterval: 30 },
          onOtpSendSms: async (phone, code) => {
            capturedPhone = phone
            capturedCode = code
          },
        })

        // 发送验证码到手机号
        const sendResult = await otpIam.auth.sendOtp('+8613800138000')
        expect(sendResult.success).toBe(true)
        expect(capturedPhone).toBe('+8613800138000')
        expect(capturedCode).toBeTruthy()
        expect(capturedCode.length).toBe(4)

        await initIam()
      })

      it('未配置 onOtpSendEmail 时 sendOtp 应返回 INTERNAL_ERROR', async () => {
        const otpIam = await initIam({
          login: { password: true, otp: true },
          otp: { length: 6, expiresIn: 300, maxAttempts: 3, resendInterval: 30 },
          // 不注入 onOtpSendEmail
        })

        const sendResult = await otpIam.auth.sendOtp('nohandler@test.com')
        expect(sendResult.success).toBe(false)
        if (!sendResult.success) {
          expect(sendResult.error.code).toBe(HaiIamError.INTERNAL_ERROR.code)
        }

        await initIam()
      })

      it('onOtpSendEmail 抛异常时应返回 INTERNAL_ERROR', async () => {
        const otpIam = await initIam({
          login: { password: true, otp: true },
          otp: { length: 6, expiresIn: 300, maxAttempts: 3, resendInterval: 30 },
          onOtpSendEmail: async () => {
            throw new Error('SMTP connection failed')
          },
        })

        const sendResult = await otpIam.auth.sendOtp('fail@test.com')
        expect(sendResult.success).toBe(false)
        if (!sendResult.success) {
          expect(sendResult.error.code).toBe(HaiIamError.INTERNAL_ERROR.code)
        }

        await initIam()
      })

      it('错误验证码应返回 OTP_INVALID', async () => {
        let capturedCode = ''

        const otpIam = await initIam({
          login: { password: true, otp: true },
          otp: { length: 6, expiresIn: 300, maxAttempts: 3, resendInterval: 30 },
          onOtpSendEmail: async (_email, code) => {
            capturedCode = code
          },
        })

        await otpIam.user.register({
          username: 'wf_otp_wrong',
          email: 'wf_otp_wrong@test.com',
          password: TEST_PASSWORD,
        })

        await otpIam.auth.sendOtp('wf_otp_wrong@test.com')
        expect(capturedCode).toBeTruthy()

        const loginResult = await otpIam.auth.loginWithOtp({
          identifier: 'wf_otp_wrong@test.com',
          code: '000000',
        })
        expect(loginResult.success).toBe(false)
        if (!loginResult.success) {
          expect(loginResult.error.code).toBe(HaiIamError.OTP_INVALID.code)
        }

        await initIam()
      })
    })
  }

  defineIamSuite('sqlite+memory', sqliteMemoryEnv(), getIam => defineCommon(getIam))
  defineIamSuite('postgres+redis', postgresRedisEnv, getIam => defineCommon(getIam))
})
