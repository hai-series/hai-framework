/**
 * @h-ai/ui — CRUD 场景组件
 *
 * 提供声明式 CRUD 页面组件，基于 kit.crud.define() 定义自动渲染列表、搜索过滤、分页、详情/编辑抽屉和删除确认。
 * @module crud
 */

export type * from './crud-types.js'
export { default as CrudDeleteConfirm } from './CrudDeleteConfirm.svelte'
export { default as CrudDetailDrawer } from './CrudDetailDrawer.svelte'
export { default as CrudEditDrawer } from './CrudEditDrawer.svelte'
export { default as CrudFilterBar } from './CrudFilterBar.svelte'

export { default as CrudPage } from './CrudPage.svelte'
