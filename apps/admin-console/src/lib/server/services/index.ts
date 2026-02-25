/**
 * =============================================================================
 * Admin Console - 服务层统一导出
 * =============================================================================
 *
 * 注意：IAM 相关服务（用户、会话）已迁移到 @h-ai/iam 模块
 * 本文件只导出 admin-console 业务服务
 */

export * from './audit.js'
export * from './permission.js'
export * from './role.js'

// 保留 user.ts 中的部分类型定义，用于内部兼容
export type { UserWithRoles } from './user.js'
