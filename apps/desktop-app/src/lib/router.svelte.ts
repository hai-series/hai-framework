/**
 * @file src/lib/router.ts
 *
 * 极简 hash router — 适配 Tauri 沙箱（webview 内无 server，URL 永远是 file://）。
 *
 * - 使用 `location.hash`（形如 `#/dashboard?tab=users`）承载路径与 query。
 * - 通过 Svelte 5 runes 暴露 `currentPathname` / `currentSearch` 反应式状态。
 * - 提供 `navigate(path)` 切换路由；监听 `hashchange` 事件保持状态同步。
 * - 提供 `createHashNavAdapter()` 工厂，供 `@h-ai/ui` 的 `CrudPage` 使用。
 */

import type { NavAdapter } from '@h-ai/ui'

/** 解析 `location.hash` 为 `{ pathname, search }`。 */
function parseHash(hash: string): { pathname: string, search: string } {
  // 去掉前缀 '#'；空 hash 视为根路径 '/'。
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const normalized = raw === '' || raw === '/' ? '/' : raw

  const queryIndex = normalized.indexOf('?')
  if (queryIndex === -1)
    return { pathname: normalized, search: '' }

  return {
    pathname: normalized.slice(0, queryIndex),
    search: normalized.slice(queryIndex),
  }
}

/** 把 path 序列化回完整 hash 字符串。 */
function pathToHash(path: string): string {
  if (path === '' || path === '/')
    return '#/'
  return path.startsWith('/') ? `#${path}` : `#/${path}`
}

// ─── 响应式状态 ─────────────────────────────────────────────────────────────

const initial = parseHash(typeof globalThis.location !== 'undefined' ? globalThis.location.hash : '')

let pathnameState = $state(initial.pathname)
let searchState = $state(initial.search)

/** 当前路径名（如 `/login`、`/dashboard`）。响应式。 */
export function currentPathname(): string {
  return pathnameState
}

/** 当前 query 字符串（带 `?` 前缀，无 query 时为空串）。响应式。 */
export function currentSearch(): string {
  return searchState
}

/**
 * 导航到指定路径。
 *
 * @param path 形如 `/login`、`/dashboard?tab=users`；可省略前导 `/`。
 */
export function navigate(path: string): void {
  const targetHash = pathToHash(path)
  if (globalThis.location.hash === targetHash) {
    // 主动同步状态：hash 没变时不会触发 hashchange，需要手动刷新（如 invalidateAll 场景）。
    syncFromHash()
    return
  }
  globalThis.location.hash = targetHash
  // 浏览器 hashchange 异步派发（jsdom 同样如此），立即同步避免调用方读到旧状态。
  syncFromHash()
}

/** 从 `location.hash` 重新同步内部 state。 */
function syncFromHash(): void {
  const { pathname, search } = parseHash(globalThis.location.hash)
  pathnameState = pathname
  searchState = search
}

/**
 * 安装全局 `hashchange` 监听器。由 `main.ts` 在挂载前调用一次。
 *
 * @returns 解绑函数（测试或热重载时使用）。
 */
export function installRouter(): () => void {
  const onHashChange = (): void => syncFromHash()
  globalThis.addEventListener('hashchange', onHashChange)
  syncFromHash()
  return () => globalThis.removeEventListener('hashchange', onHashChange)
}

/**
 * 强制刷新 router 状态（无 navigation 发生时使用）。
 * 当前实现是 no-op（router 已即时同步），保留接口便于未来扩展。
 */
export function refreshRouter(): void {
  syncFromHash()
}

/**
 * 创建一个 NavAdapter，用于 `@h-ai/ui` 的 `CrudPage` 等需要"宿主路由"的组件。
 *
 * - `pathname`：返回 router 当前 `pathname`（响应式 getter）。
 * - `navigate`：调用 hash router 的 `navigate`。
 * - `refresh`：触发一次内部同步（hash router 无服务端 load，无需 invalidate）。
 */
export function createHashNavAdapter(): NavAdapter {
  return {
    get pathname() {
      return pathnameState
    },
    navigate(url: string) {
      navigate(url)
    },
    refresh() {
      refreshRouter()
    },
  }
}
