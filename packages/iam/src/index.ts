/**
 * =============================================================================
 * @hai/iam - 身份与访问管理
 * =============================================================================
 *
 * 本模块提供完整的身份认证与访问控制能力：
 * - 多种认证策略：密码、OTP、LDAP
 * - 会话管理：有状态会话（随机访问令牌）
 * - RBAC 授权：角色与权限管理
 *
 * @example
 * ```ts
 * import { iam } from '@hai/iam'
 * import { db } from '@hai/db'
 *
 * // 初始化
 * await db.init({ type: 'sqlite', database: './data.db' })
 * await iam.init(db, {}, { cache })
 *
 * // 注册用户
 * const user = await iam.user.register({
 *   username: 'admin',
 *   email: 'admin@example.com',
 *   password: 'Password123'
 * })
 *
 * // 登录
 * const result = await iam.auth.login({
 *   identifier: 'admin',
 *   password: 'Password123'
 * })
 *
 * // 关闭
 * await iam.close()
 * ```
 *
 * @module @hai/iam
 */

// 认证/授权类型
export * from './authn/iam-authn-types.js'
export * from './authz/rbac/iam-authz-rbac-types.js'

// 配置与核心类型
export * from './iam-core-types.js'

// 统一服务入口
export * from './iam-main.js'

// 会话与用户类型
export * from './session/iam-session-types.js'
export * from './user/iam-user-types.js'
