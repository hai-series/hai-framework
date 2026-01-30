/**
 * =============================================================================
 * @hai/iam - 类型定义汇总
 * =============================================================================
 *
 * 本文件汇总导出所有 IAM 类型定义。
 *
 * 类型按职责拆分到以下文件：
 * - iam-type-user.ts - 用户和凭证类型
 * - iam-type-session.ts - 会话和令牌类型
 * - iam-type-authz.ts - 授权相关类型（RBAC）
 * - iam-type-oauth.ts - OAuth 相关类型
 * - iam-type-repository.ts - 存储接口类型
 * - iam-type-service.ts - 服务接口类型
 *
 * @example
 * ```ts
 * import type { IamService, User, AuthResult } from '@hai/iam'
 *
 * // 使用类型
 * const user: User = {
 *     id: '1',
 *     username: 'admin',
 *     email: 'admin@example.com',
 *     enabled: true,
 *     createdAt: new Date(),
 *     updatedAt: new Date()
 * }
 * ```
 *
 * @module iam-types
 * =============================================================================
 */

// =============================================================================
// 重新导出配置类型（方便使用）
// =============================================================================

export type * from './iam-config.js'
export * from './iam-config.js'

// =============================================================================
// 导出所有类型定义
// =============================================================================

// 授权相关类型（RBAC）
export * from './iam-type-authz.js'

// OAuth 相关类型
export * from './iam-type-oauth.js'

// 存储接口类型
export * from './iam-type-repository.js'

// 服务接口类型
export * from './iam-type-service.js'

// 会话和令牌类型
export * from './iam-type-session.js'

// 用户和凭证类型
export * from './iam-type-user.js'
