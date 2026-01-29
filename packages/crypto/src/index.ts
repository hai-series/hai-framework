/**
 * =============================================================================
 * @hai/crypto - 加密模块（国密算法、密码哈希）
 * =============================================================================
 */

// 统一服务入口
export { crypto, createCryptoService } from './crypto.main.js'

// 类型定义
export type * from './crypto-types.js'

// HAI Provider 实现
export { createHaiSM2Provider } from './provider/hai/crypto-hai-sm2.js'
export { createHaiSM3Provider } from './provider/hai/crypto-hai-sm3.js'
export { createHaiSM4Provider } from './provider/hai/crypto-hai-sm4.js'
export { createHaiPasswordProvider } from './provider/hai/crypto-hai-password.js'
