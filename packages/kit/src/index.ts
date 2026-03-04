/**
 * @h-ai/kit — 主入口
 *
 * SvelteKit 集成模块，所有功能通过 kit 对象统一访问：
 * @module index
 */

// 公共类型导出（仅类型：运行时函数统一通过 kit 命名空间访问）
export type * from './client/index.js'
export type * from './guards/index.js'
// 运行时导出 — 权限匹配纯函数（客户端/服务端通用）
export { matchPermission } from './guards/kit-permission.js'
export type * from './hooks/index.js'
// 运行时导出 — 契约定义工具
export { defineEndpoint } from './kit-contract.js'
export type { EndpointDef } from './kit-contract.js'
// 运行时导出 — kit 统一命名空间
export { kit } from './kit-main.js'
export * from './kit-types.js'
// 运行时导出 — 通用 Schema（支持 import { IdParamSchema } from '@h-ai/kit'）
export { IdParamSchema, PaginationQuerySchema } from './kit-validation.js'
export type * from './middleware/index.js'
export type * from './modules/index.js'
