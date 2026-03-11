import { kit } from '@h-ai/kit'

/**
 * 浏览器端统一附加 Bearer Token。
 *
 * 覆盖同源请求（包括 /api 与 SvelteKit 的 __data 请求），
 * 让 server load 与 API 都能读取 Authorization 头。
 */
export const handleFetch = kit.auth.createHandleFetch()
