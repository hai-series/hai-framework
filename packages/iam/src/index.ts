/**
 * =============================================================================
 * @hai/iam - 身份与访问管理
 * =============================================================================
 *
 * 本模块提供完整的身份认证与访问控制能力：
 * - 多种认证策略：密码、OTP、LDAP、OAuth2
 * - 会话管理：JWT 无状态 / 有状态会话
 * - RBAC 授权：角色与权限管理
 *
 * @example
 * ```ts
 * import { iam } from '@hai/iam'
 * import { cache } from '@hai/cache'
 * import { db } from '@hai/db'
 *
 * // 初始化
 * await db.init({ type: 'sqlite', database: './data.db' })
 * await cache.init({ url: 'redis://localhost:6379' })
 * await iam.init(db, cache)
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

// 统一服务入口
export * from './iam-main.js'

// 类型定义
export * from './iam-types.js'
