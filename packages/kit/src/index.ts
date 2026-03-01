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
// 运行时导出 — kit 统一命名空间
export { kit } from './kit-main.js'
export * from './kit-types.js'
export type * from './middleware/index.js'
export type * from './modules/index.js'
