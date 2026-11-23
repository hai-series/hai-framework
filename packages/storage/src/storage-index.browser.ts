/**
 * @h-ai/storage — 浏览器端入口
 *
 * storage 仅提供无需初始化的 client 操作，不包含依赖 Node.js fs 的服务端能力。
 * 同时保留配置 Schema 与公共类型。
 * @module storage-index.browser
 */
export * from './client/index.js'
export * from './storage-config.js'
export { STORAGE_DELETE_MAX_KEYS, STORAGE_KEY_MAX_BYTES, StorageDeleteKeysSchema, StorageKeySchema, StoragePrefixSchema, StoragePresignExpiresInSchema } from './storage-schemas.js'
export type { StorageKeyIssue } from './storage-schemas.js'
export * from './storage-types.js'
