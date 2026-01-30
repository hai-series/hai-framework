/**
 * =============================================================================
 * @hai/kit - Crypto 模块导出
 * =============================================================================
 * SvelteKit 与 @hai/crypto 集成
 *
 * 包含：
 * - verifyWebhookSignature - Webhook 签名验证
 * - signRequest - 请求签名
 * - createCsrfManager - CSRF Token 管理
 * - createEncryptedCookie - 加密 Cookie
 * =============================================================================
 */

// 工具函数
export {
  createCsrfManager,
  createEncryptedCookie,
  signRequest,
  verifyWebhookSignature,
} from './crypto-helpers.js'

// 类型
export type {
  CryptoServiceLike,
  CsrfConfig,
  EncryptedCookieConfig,
  WebhookVerifyConfig,
} from './crypto-types.js'
