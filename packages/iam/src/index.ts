/**
 * =============================================================================
 * @hai/iam - 身份与访问管理
 * =============================================================================
 */

// 统一服务入口
export { iam, createIAMService } from './iam.main.js'

// 类型定义
export type * from './iam-types.js'

// HAI Provider 实现
export { createHaiIdentProvider } from './provider/hai/iam-hai-ident.js'
export { createHaiAuthzProvider } from './provider/hai/iam-hai-authz.js'
export { createHaiSessionProvider } from './provider/hai/iam-hai-session.js'
export { createHaiOAuthProvider } from './provider/hai/iam-hai-oauth.js'
