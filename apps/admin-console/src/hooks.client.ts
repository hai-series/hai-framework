import type { HandleFetch } from '@sveltejs/kit'
import '$lib/config/browser-transport.js'

/**
 * 浏览器端统一处理同源请求安全能力。
 *
 * - 管理后台使用 httpOnly Cookie 承载访问令牌，不从 localStorage 读取 Bearer Token。
 * - transport 启用时，`browser-transport.ts` 会在应用启动时接管
 *   同源 `/api/*` 与 SvelteKit `__data.json` 的全局 fetch
 */
export const handleFetch: HandleFetch = ({ request, fetch }) => fetch(request)
