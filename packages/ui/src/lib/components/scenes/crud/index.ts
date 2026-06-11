/**
 * @h-ai/ui — CRUD 场景组件
 *
 * 提供声明式 CRUD 页面组件，基于 kit.crud.define() 定义自动渲染列表、搜索过滤、分页、详情/编辑面板和删除确认。
 * @module crud
 */

export type * from './crud-types.js'
export { default as CrudDeleteConfirm } from './CrudDeleteConfirm.svelte'
export { default as CrudDetailPanel } from './CrudDetailPanel.svelte'
export { default as CrudEditPanel } from './CrudEditPanel.svelte'
export { default as CrudFilterBar } from './CrudFilterBar.svelte'

export { default as CrudPage } from './CrudPage.svelte'
export type { NavAdapter } from './nav-adapter.js'
export { createBrowserNavAdapter } from './nav-adapter.js'
