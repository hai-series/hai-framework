/**
 * =============================================================================
 * Admin Console - API 请求工具
 * =============================================================================
 * 使用 kit.client.create 创建统一客户端：
 * - 自动附加 CSRF Token
 * - 自动传输加密（对业务代码透明）
 * =============================================================================
 */

import { crypto } from '@h-ai/crypto'
import { kit } from '@h-ai/kit'

// 浏览器端初始化加密模块（服务端由 hooks.server.ts 初始化，此处仅在客户端生效）
if (typeof window !== 'undefined') {
  crypto.init()
}

/**
 * 统一 API 客户端：自动 CSRF + 传输加密
 *
 * 写方法（POST / PUT / DELETE 等）自动读取 `hai_csrf` Cookie
 * 并设置 `X-CSRF-Token` 请求头；同时透明完成密钥交换与
 * 请求/响应体加解密。
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
const client = kit.client.create({
  transport: { crypto },
})

export const { apiFetch } = client
