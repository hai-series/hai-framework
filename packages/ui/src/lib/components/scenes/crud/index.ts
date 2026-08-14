/**
 * @h-ai/ui — CRUD 场景组件
 *
 * 提供声明式 CRUD 页面组件与框架级控制器：
 * - `CrudPage` 组件：自动渲染列表、搜索过滤、分页、详情/编辑面板、删除确认，以及查询中/失败/空态。
 * - `defineCrud` / `createCrudController`：纯客户端（无 SvelteKit SSR）下托管数据与导航，
 *   业务应用无需自建 CRUD 适配层。
 * @module crud
 */

export * from './crud-controller.svelte.js'
export type * from './crud-types.js'
export { default as CrudDeleteConfirm } from './CrudDeleteConfirm.svelte'
export { default as CrudDetailPanel } from './CrudDetailPanel.svelte'
export { default as CrudEditPanel } from './CrudEditPanel.svelte'
export { default as CrudFilterBar } from './CrudFilterBar.svelte'

export { default as CrudPage } from './CrudPage.svelte'
export type { NavAdapter } from './nav-adapter.js'
export { createBrowserNavAdapter } from './nav-adapter.js'
