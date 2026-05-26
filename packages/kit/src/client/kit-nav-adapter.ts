/**
 * @h-ai/kit — SvelteKit 路由适配器
 *
 * 此前位于 `@h-ai/ui/sveltekit`，为避免 `@h-ai/ui` 耦合 SvelteKit，迁移至本模块。
 *
 * 为 `@h-ai/ui` 的 `CrudPage` 等需要“宿主路由”的场景组件提供 SvelteKit 实现。
 * 返回值结构与 `@h-ai/ui` 的 `NavAdapter` 完全一致；TS 通过结构类型自动匹配，
 * 无需在 `@h-ai/kit` 中显式依赖 `@h-ai/ui`。
 *
 * @example
 * ```svelte
 * <script lang='ts'>
 *   import { CrudPage } from '@h-ai/ui'
 *   import { createSvelteKitNavAdapter } from '@h-ai/kit/client'
 *
 *   const nav = createSvelteKitNavAdapter()
 * </script>
 *
 * <CrudPage {crud} {data} {nav} />
 * ```
 *
 * @module kit-nav-adapter
 */

import { goto, invalidateAll } from '$app/navigation'
import { page } from '$app/state'

/**
 * SvelteKit `NavAdapter`：
 *
 * - `pathname` 来自 `$app/state` 的 `page.url.pathname`（响应式）。
 * - `navigate` 使用 `$app/navigation` 的 `goto`，并自动 `invalidateAll`，
 *   触发 `+page.server.ts` 的 `load` 重新执行。
 * - `refresh` 调用 `invalidateAll()`，常用于写操作后刷新列表数据。
 */
export function createSvelteKitNavAdapter(): {
  readonly pathname: string
  readonly navigate: (url: string) => Promise<void>
  readonly refresh: () => Promise<void>
} {
  return {
    get pathname() {
      return page.url.pathname
    },
    async navigate(url: string) {
      await goto(url, { invalidateAll: true })
    },
    async refresh() {
      await invalidateAll()
    },
  }
}
