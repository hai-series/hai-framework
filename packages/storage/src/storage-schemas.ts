/**
 * @h-ai/storage — 跨端输入约束；仅依赖 Zod，不加载 Provider、配置或 Node 模块。
 * @module storage-schemas
 */
import { z } from 'zod'

/**
 * 对象键的 UTF-8 字节上限；不是 JavaScript 字符串长度。
 * @example
 * ```ts
 * import { STORAGE_KEY_MAX_BYTES } from '@h-ai/storage/schemas'
 *
 * const fits = new TextEncoder().encode('uploads/报告.pdf').length <= STORAGE_KEY_MAX_BYTES
 * void fits
 * ```
 */
export const STORAGE_KEY_MAX_BYTES = 1024

/**
 * 单次公开 HTTP 删除请求的原始键数量上限；Node deleteMany 仍按 Provider 上限分批。
 * @example
 * ```ts
 * import { STORAGE_DELETE_MAX_KEYS } from '@h-ai/storage/schemas'
 *
 * const keys = ['a.txt', 'b.txt']
 * const page = keys.slice(0, STORAGE_DELETE_MAX_KEYS)
 * void page
 * ```
 */
export const STORAGE_DELETE_MAX_KEYS = 1000

/**
 * 键校验失败类别；调用层据此生成本地化消息，不解析错误文本。
 * @example
 * ```ts
 * import type { StorageKeyIssue } from '@h-ai/storage'
 *
 * const value: StorageKeyIssue = 'tooLong'
 * void value
 * ```
 */
export type StorageKeyIssue = 'empty' | 'tooLong' | 'characters' | 'segments'

/**
 * 检查跨端键边界，不归一化输入，不替代文件系统防逃逸或资源授权。
 *
 * @param key - 调用方视角的对象键，不含 Provider 配置前缀。
 * @param allowEmpty - 是否允许空字符串（用于列表前缀）；纯空白仍无效。
 * @returns 首个失败类别；合法时为 undefined。
 * @example
 * ```ts
 * import { getStorageKeyIssue } from '@h-ai/storage/schemas'
 *
 * const unsafe = getStorageKeyIssue('../private.txt') // segments
 * const emptyPrefix = getStorageKeyIssue('', true) // undefined
 * void [unsafe, emptyPrefix]
 * ```
 */
export function getStorageKeyIssue(key: string, allowEmpty = false): StorageKeyIssue | undefined {
  if (allowEmpty && key === '')
    return undefined
  if (key.trim() === '')
    return 'empty'
  if (new TextEncoder().encode(key).byteLength > STORAGE_KEY_MAX_BYTES)
    return 'tooLong'
  if (key.startsWith('/') || key.includes('\\') || [...key].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
    return 'characters'
  if (key.split('/').some(segment => segment === '.' || segment === '..'))
    return 'segments'
  return undefined
}

/** 通过稳定 params 保留失败类别；默认 Zod 消息交由请求层按 locale 映射。 */
function keySchema(allowEmpty: boolean) {
  return z.string().superRefine((key, context) => {
    const issue = getStorageKeyIssue(key, allowEmpty)
    if (issue)
      context.addIssue({ code: 'custom', params: { storageKeyIssue: issue } })
  })
}

/**
 * 文件键 Schema：非空、UTF-8 最多 1024 字节，无绝对路径、反斜线、控制符或点路径段。
 * @example
 * ```ts
 * import { StorageKeySchema } from '@h-ai/storage'
 *
 * const value = StorageKeySchema.parse('users/u1/report.pdf')
 * void value
 * ```
 */
export const StorageKeySchema = keySchema(false)

/**
 * 列表前缀 Schema；允许空字符串与部分文件名，不把前缀当物理目录。
 * @example
 * ```ts
 * import { StoragePrefixSchema } from '@h-ai/storage'
 *
 * const value = StoragePrefixSchema.parse('users/u1/rep')
 * void value
 * ```
 */
export const StoragePrefixSchema = keySchema(true)

/**
 * HTTP 批量删除键 Schema；按输入数量计数，重复键不能绕过上限。
 * @example
 * ```ts
 * import { StorageDeleteKeysSchema } from '@h-ai/storage'
 *
 * const value = StorageDeleteKeysSchema.parse(['users/u1/a.txt', 'users/u1/b.txt'])
 * void value
 * ```
 */
export const StorageDeleteKeysSchema = z.array(StorageKeySchema).min(1).max(STORAGE_DELETE_MAX_KEYS)

/**
 * 预签名有效期，单位秒；整数 1–604800，不在此处填充 Node/HTTP 各自默认值。
 * @example
 * ```ts
 * import { StoragePresignExpiresInSchema } from '@h-ai/storage'
 *
 * const value = StoragePresignExpiresInSchema.parse(900)
 * void value
 * ```
 */
export const StoragePresignExpiresInSchema = z.number().int().min(1).max(604800)
