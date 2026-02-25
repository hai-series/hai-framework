/**
 * =============================================================================
 * @hai/iam - 完整工作流测试
 * =============================================================================
 *
 * 参照 @hai/storage 的 workflow 测试风格，从实际使用场景出发，
 * 覆盖完整的前端 + 后端操作流程。
 *
 * 工作流：
 * 1. 用户注册 → 登录 → 令牌验证 → 获取当前用户 → 更新资料 → 修改密码 → 重新登录 → 登出
 * 2. RBAC 设置 → 角色创建 → 权限创建 → 关联 → 分配给用户 → 权限检查
 * 3. 多会话管理：多端登录 → 单设备模式 → 会话清理
 * 4. 管理员操作：创建角色/权限 → 分配用户 → 用户验证权限 → 管理员撤销
 */

import type { IamFunctions } from '../src/iam-types.js'
import { db } from '@hai/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { IamErrorCode } from '../src/iam-config.js'
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
        const { accessToken } = loginResult.data

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
        const logoutResult = await iam.auth.logout(reLoginResult.data.accessToken)
        expect(logoutResult.success).toBe(true)

        // ⑩ 登出后令牌失效
        const afterLogout = await iam.auth.verifyToken(reLoginResult.data.accessToken)
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

        // ⑦ 验证令牌获取会话信息（包含角色）
        const session = await iam.auth.verifyToken(loginResult.data.accessToken)
        expect(session.success).toBe(true)
        if (session.success) {
          expect(session.data.roles).toContain(roleId)
        }

        // ⑧ 检查权限：应有 read 和 write，不应有 delete
        const hasRead = await iam.authz.checkPermission(
          { userId, roles: [roleId] },
          'wf_content:read',
        )
        expect(hasRead.success && hasRead.data).toBe(true)

        const hasWrite = await iam.authz.checkPermission(
          { userId, roles: [roleId] },
          'wf_content:write',
        )
        expect(hasWrite.success && hasWrite.data).toBe(true)

        const hasDelete = await iam.authz.checkPermission(
          { userId, roles: [roleId] },
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
          { userId: reg.data.user.id, roles: [role.data.id] },
          'wf_review:view',
        )
        expect(hasView.success && hasView.data).toBe(true)

        const hasApprove = await iam.authz.checkPermission(
          { userId: reg.data.user.id, roles: [role.data.id] },
          'wf_review:approve',
        )
        expect(hasApprove.success).toBe(true)
        if (hasApprove.success)
          expect(hasApprove.data).toBe(false)

        // ⑦ 管理员新增 approve 权限到角色
        await iam.authz.assignPermissionToRole(role.data.id, perm2.data.id)

        // ⑧ 用户无需重新登录即有新权限（缓存刷新后）
        const hasApproveNow = await iam.authz.checkPermission(
          { userId: reg.data.user.id, roles: [role.data.id] },
          'wf_review:approve',
        )
        expect(hasApproveNow.success && hasApproveNow.data).toBe(true)

        // ⑨ 管理员移除 view 权限
        await iam.authz.removePermissionFromRole(role.data.id, perm1.data.id)

        // ⑩ view 权限应不再可用
        const hasViewAfterRemoval = await iam.authz.checkPermission(
          { userId: reg.data.user.id, roles: [role.data.id] },
          'wf_review:view',
        )
        expect(hasViewAfterRemoval.success).toBe(true)
        if (hasViewAfterRemoval.success)
          expect(hasViewAfterRemoval.data).toBe(false)
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
        const verifyPC = await iam.auth.verifyToken(loginPC.data.accessToken)
        const verifyMobile = await iam.auth.verifyToken(loginMobile.data.accessToken)
        expect(verifyPC.success).toBe(true)
        expect(verifyMobile.success).toBe(true)

        // 登出 PC 端
        await iam.auth.logout(loginPC.data.accessToken)

        // PC 端令牌失效，Mobile 端不受影响
        const verifyPCAfter = await iam.auth.verifyToken(loginPC.data.accessToken)
        expect(verifyPCAfter.success).toBe(false)

        const verifyMobileAfter = await iam.auth.verifyToken(loginMobile.data.accessToken)
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
        const verifyA = await singleDeviceIam.auth.verifyToken(loginA.data.accessToken)
        expect(verifyA.success).toBe(false)

        // ⑤ 设备B令牌应有效
        const verifyB = await singleDeviceIam.auth.verifyToken(loginB.data.accessToken)
        expect(verifyB.success).toBe(true)

        // ⑥ 登出设备B
        const logoutB = await singleDeviceIam.auth.logout(loginB.data.accessToken)
        expect(logoutB.success).toBe(true)

        // ⑦ B也失效
        const verifyBAfter = await singleDeviceIam.auth.verifyToken(loginB.data.accessToken)
        expect(verifyBAfter.success).toBe(false)
      })
    })

    // =========================================================================
    // 工作流 6：密码找回流程
    // =========================================================================

    describe('密码找回流程', () => {
      it('请求重置 → 用令牌确认重置 → 新密码可登录', async () => {
        const iam = getIam()

        await iam.user.register({
          username: 'wf_reset_user',
          email: 'wf_reset@test.com',
          password: TEST_PASSWORD,
        })

        // 请求密码重置
        const requestResult = await iam.user.requestPasswordReset('wf_reset@test.com')
        expect(requestResult.success).toBe(true)

        // 从数据库获取令牌
        const tokenQuery = await db.sql.query<{ token: string, user_id: string }>(
          'SELECT token, user_id FROM iam_password_reset_tokens',
        )
        expect(tokenQuery.success).toBe(true)
        if (!tokenQuery.success)
          return
        const token = tokenQuery.data.find(t => t.user_id !== undefined)?.token
        expect(token).toBeDefined()

        // 用令牌确认重置
        const confirmResult = await iam.user.confirmPasswordReset(token!, 'NewPass789')
        expect(confirmResult.success).toBe(true)

        // 新密码应可登录
        const loginResult = await iam.auth.login({
          identifier: 'wf_reset_user',
          password: 'NewPass789',
        })
        expect(loginResult.success).toBe(true)

        // 旧密码应不可登录
        const oldLoginResult = await iam.auth.login({
          identifier: 'wf_reset_user',
          password: TEST_PASSWORD,
        })
        expect(oldLoginResult.success).toBe(false)
      })

      it('无效令牌 → confirmPasswordReset 返回 RESET_TOKEN_INVALID', async () => {
        const confirmResult = await getIam().user.confirmPasswordReset('fake-token', 'NewPass789')
        expect(confirmResult.success).toBe(false)
        if (!confirmResult.success) {
          expect(confirmResult.error.code).toBe(IamErrorCode.RESET_TOKEN_INVALID)
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
          expect(regResult.error.code).toBe(IamErrorCode.REGISTER_DISABLED)
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
          expect(lockedResult.error.code).toBe(IamErrorCode.USER_LOCKED)
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
        const checkX = await iam.authz.checkPermission(
          { userId: reg.data.user.id, roles: [roleA.data.id, roleB.data.id] },
          'wf_perm:x',
        )
        const checkY = await iam.authz.checkPermission(
          { userId: reg.data.user.id, roles: [roleA.data.id, roleB.data.id] },
          'wf_perm:y',
        )
        const checkZ = await iam.authz.checkPermission(
          { userId: reg.data.user.id, roles: [roleA.data.id, roleB.data.id] },
          'wf_perm:z',
        )
        expect(checkX.success && checkX.data).toBe(true)
        expect(checkY.success && checkY.data).toBe(true)
        expect(checkZ.success && checkZ.data).toBe(true)

        // ④ 移除角色A
        await iam.authz.removeRole(reg.data.user.id, roleA.data.id)

        // ⑤ 检查权限：X 应失效（仅 A 拥有），Y 仍有效（B 也有），Z 仍有效
        const checkXAfter = await iam.authz.checkPermission(
          { userId: reg.data.user.id, roles: [roleB.data.id] },
          'wf_perm:x',
        )
        expect(checkXAfter.success).toBe(true)
        if (checkXAfter.success)
          expect(checkXAfter.data).toBe(false)

        const checkYAfter = await iam.authz.checkPermission(
          { userId: reg.data.user.id, roles: [roleB.data.id] },
          'wf_perm:y',
        )
        expect(checkYAfter.success && checkYAfter.data).toBe(true)

        const checkZAfter = await iam.authz.checkPermission(
          { userId: reg.data.user.id, roles: [roleB.data.id] },
          'wf_perm:z',
        )
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
        const verify = await agreementIam.auth.verifyToken(login.data.accessToken)
        expect(verify.success).toBe(true)
      })
    })
  }

  defineIamSuite('sqlite+memory', sqliteMemoryEnv(), getIam => defineCommon(getIam))
  defineIamSuite('postgres+redis', postgresRedisEnv, getIam => defineCommon(getIam))
})
