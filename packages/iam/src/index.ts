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
 *
 * // 初始化
 * await iam.init({ strategies: ['password'] })
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

// =============================================================================
// 自动注册 Schema 到 @hai/core
// =============================================================================
import { core } from '@hai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'
import { IamConfigSchema } from './iam-config.js'

// 配置 Schema（zod）
export * from './iam-config.js'

// 数据库初始化与种子数据
export * from './iam-database.js'

// 统一服务入口
export * from './iam-main.js'

// 类型定义
export * from './iam-types.js'

// i18n
type IamMessageKey = keyof typeof messagesZhCN
export const { getMessage: getIamMessage, setDefaultLocale: setIamDefaultLocale }
  = core.i18n.createMessageGetter<IamMessageKey>({ 'zh-CN': messagesZhCN, 'en-US': messagesEnUS })

// 注册 iam 模块的配置 Schema
core.registerBuiltinSchema('iam', IamConfigSchema)
