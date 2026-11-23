import { getStorageKeyIssue } from './storage-schemas.js'

export { STORAGE_DELETE_MAX_KEYS, STORAGE_KEY_MAX_BYTES, StorageDeleteKeysSchema, StorageKeySchema, StoragePrefixSchema, StoragePresignExpiresInSchema } from './storage-schemas.js'
export type { StorageKeyIssue } from './storage-schemas.js'

/**
 * 跨端存储约束入口；不加载服务端 Provider。
 * @example
 * ```ts
 * import { storage } from '@h-ai/storage/schemas'
 *
 * // 检查键语法，无需初始化 Provider；合法输入返回 undefined。
 * const issue = storage.getKeyIssue('reports/readme.txt')
 * void issue
 * ```
 */
export const storage = { getKeyIssue: getStorageKeyIssue }
