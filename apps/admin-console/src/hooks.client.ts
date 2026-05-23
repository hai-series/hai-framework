import { kit } from '@h-ai/kit'
import '$lib/config/browser-transport.js'

/**
 * 浏览器端统一处理同源请求安全能力。
 *
 * - 自动附加 Authorization（若浏览器端存在 token）
 * - transport 启用时，`browser-transport.ts` 会在应用启动时接管
 *   同源 `/api/*` 与 SvelteKit `__data.json` 的全局 fetch
 */
export const handleFetch = kit.auth.createHandleFetch()
