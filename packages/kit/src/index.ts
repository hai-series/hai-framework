/**
 * =============================================================================
 * @hai/kit - 主入口
 * =============================================================================
 * SvelteKit 集成模块，所有功能通过 kit 对象统一访问：
 *
 * ```ts
 * import { kit } from '@hai/kit'
 *
 * kit.createHandle({ /* config *\/ })
 * kit.guard.auth({ loginUrl: '/login' })
 * kit.response.ok(data)
 * ```
 * =============================================================================
 */

// 公共类型导出
export type * from './client/index.js'
export type * from './guards/index.js'
export type * from './hooks/index.js'
// 运行时导出 — kit 统一命名空间
export { kit } from './kit-main.js'
export * from './kit-types.js'
export type * from './middleware/index.js'
export type * from './modules/index.js'
