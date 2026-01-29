/**
 * =============================================================================
 * @hai/iam - 身份与访问管理
 * =============================================================================
 */

// 类型定义
export type * from './iam-types.js'

// 统一服务入口
export { createIAMService, iam } from './iam.main.js'

export { createHaiAuthzProvider } from './provider/hai/iam-hai-authz.js'
// HAI Provider 实现
export { createHaiIdentProvider } from './provider/hai/iam-hai-ident.js'
export { createHaiOAuthProvider } from './provider/hai/iam-hai-oauth.js'
export { createHaiSessionProvider } from './provider/hai/iam-hai-session.js'
