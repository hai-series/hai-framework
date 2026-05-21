/**
 * @h-ai/ui — CRUD 导航适配器
 *
 * `CrudPage` 通过 `nav` prop 接入宿主路由系统，避免对任何具体框架（SvelteKit、
 * 自实现 hash router 等）形成强依赖。
 *
 * - SvelteKit 应用：传入 `createSvelteKitNavAdapter()`（从 `@h-ai/kit/client` 导入）。
 * - 纯浏览器 / Tauri / Capacitor：传入自定义实现或使用默认 `createBrowserNavAdapter()`。
 *
 * @module nav-adapter
 */

/**
 * 路由适配器接口。`CrudPage` 通过此接口完成：
 * - 读取当前 pathname（作为列表 URL 的 basePath 兜底）
 * - 调用 `navigate(url)` 同步搜索 / 过滤 / 分页参数到地址栏
 * - 调用 `refresh()` 在写操作后重新拉取列表数据
 */
export interface NavAdapter {
  /** 当前页面路径（不含 query / hash），用于推导 `basePath`。 */
  readonly pathname: string
  /** 跳转到指定 URL（可带 query），通常用于更新 URL 上的搜索/分页参数。 */
  readonly navigate: (url: string) => void | Promise<void>
  /** 写操作完成后触发列表刷新；未提供时由调用方自行通过 `onaftersubmit` / `onafterdelete` 处理。 */
  readonly refresh?: () => void | Promise<void>
}

/**
 * 创建基于浏览器 `globalThis.location` 的默认导航适配器。
 *
 * 适用场景：纯 SPA（无 SvelteKit）、Tauri、Capacitor 等可以直接读写 `location` 的环境。
 *
 * - `pathname` 读 `globalThis.location?.pathname`，SSR 下安全降级为 `''`。
 * - `navigate(url)` 调 `globalThis.location.assign(url)`；如需客户端路由（hash router 等），
 *   宿主应自行实现一个 `NavAdapter` 传入。
 * - 不提供 `refresh`：浏览器默认导航本身会触发页面加载，调用方需在导航前/后重新拉取数据。
 */
export function createBrowserNavAdapter(): NavAdapter {
  return {
    get pathname() {
      return globalThis.location?.pathname ?? ''
    },
    navigate(url: string) {
      globalThis.location?.assign(url)
    },
  }
}
