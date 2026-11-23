/**
 * @h-ai/kit — Crypto 模块导出
 *
 * SvelteKit 与 @h-ai/crypto 集成
 * @module index
 */

import { transportEncryptionMiddleware } from './kit-transport-middleware.js'

export * from './kit-crypto-types.js'

/**
 * Kit crypto 子路径的统一入口。
 * @example
 * ```ts
 * import { kit } from '@h-ai/kit'
 *
 * // 从专用子路径读取中间件工厂，参数使用 TransportEncryptionConfig。
 * const createMiddleware = kit.crypto.transportEncryptionMiddleware
 * void createMiddleware
 * ```
 */
export const kit = {
  crypto: {
    transportEncryptionMiddleware,
  },
}
