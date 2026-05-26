/**
 * @h-ai/kit — Client 模块导出
 *
 * 对外导出:
 * - `createKitClient`：浏览器侧统一 API 客户端（CSRF + 可选传输加密）。
 * - `createSvelteKitNavAdapter`：SvelteKit 路由适配器，配合 `@h-ai/ui` 的 `CrudPage` 使用。
 * @module index
 */

export * from './kit-client.js'
export * from './kit-nav-adapter.js'
