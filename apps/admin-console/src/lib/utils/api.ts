/**
 * =============================================================================
 * Admin Console - API 请求工具
 * =============================================================================
 * 使用 kit.client.create 创建统一客户端：
 * - 自动附加 CSRF Token
 * - 同源 fetch transport 由 browser-transport.ts 统一安装
 * =============================================================================
 */

import { kit } from '@h-ai/kit'

/**
 * 统一 API 客户端：自动 CSRF + 传输加密
 *
 * 写方法（POST / PUT / DELETE 等）自动读取 `hai_csrf` Cookie
 * 并设置 `X-CSRF-Token` 请求头；请求/响应体加解密由浏览器全局
 * transport fetch 包装统一处理。
 *
 * @example
 * ```ts
 * const response = await apiFetch('/api/iam/users', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify(data),
 * })
 * ```
 */
const client = kit.client.create()

export const { apiFetch } = client
