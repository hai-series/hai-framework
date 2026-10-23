/** 公开存储输入在浏览器与服务端共用同一约束。 */
import { STORAGE_DELETE_MAX_KEYS, STORAGE_KEY_MAX_BYTES, StorageKeySchema } from '@h-ai/storage/schemas'
import { describe, expect, it } from 'vitest'
import {
  StorageDeleteFilesInputSchema,
  StorageFileKeyInputSchema,
  StorageListFilesInputSchema,
  StoragePresignDownloadInputSchema,
  StoragePresignUploadInputSchema,
} from '../src/storage/storage-schemas.js'

describe('storage input boundaries', () => {
  it('按 UTF-8 字节拒绝超长 key，不截断或归一化', () => {
    const key = `${'报'.repeat(341)}a`
    expect(new TextEncoder().encode(key).byteLength).toBe(STORAGE_KEY_MAX_BYTES)
    expect(StorageFileKeyInputSchema.parse({ key }).key).toBe(key)
    expect(StorageFileKeyInputSchema.safeParse({ key: `${key}a` }).success).toBe(false)
    expect(StorageKeySchema.safeParse('a'.repeat(1025)).success).toBe(false)
  })

  it.each(['', ' ', '/absolute', 'a\\b', 'a/../b', './a', 'a/./b', 'a\0b', 'a\nb', 'a\u007Fb'])('所有带 key 的输入拒绝 %j', (key) => {
    for (const schema of [StorageFileKeyInputSchema, StoragePresignDownloadInputSchema, StoragePresignUploadInputSchema])
      expect(schema.safeParse({ key }).success).toBe(false)
    expect(StorageDeleteFilesInputSchema.safeParse({ keys: ['ok', key] }).success).toBe(false)
  })

  it('前缀允许空字符串和部分文件名，其余路径规则一致', () => {
    for (const prefix of ['', 'users/u1/rep', 'users/u1/'])
      expect(StorageListFilesInputSchema.safeParse({ prefix }).success).toBe(true)
    for (const prefix of [' ', '../private', '/absolute', 'a\\b', '报'.repeat(342)])
      expect(StorageListFilesInputSchema.safeParse({ prefix }).success).toBe(false)
  })

  it('按原始数量限制批量，不能通过重复键绕过请求上限', () => {
    expect(StorageDeleteFilesInputSchema.safeParse({ keys: Array.from({ length: STORAGE_DELETE_MAX_KEYS }, (_, i) => `a/${i}`) }).success).toBe(true)
    expect(StorageDeleteFilesInputSchema.safeParse({ keys: Array.from({ length: STORAGE_DELETE_MAX_KEYS + 1 }).fill('a') }).success).toBe(false)
    expect(StorageDeleteFilesInputSchema.safeParse({ keys: [] }).success).toBe(false)
  })

  it.each([0, -1, 0.5, 604801, Number.POSITIVE_INFINITY, Number.NaN])('两种预签名拒绝有效期 %s', (expiresIn) => {
    for (const schema of [StoragePresignDownloadInputSchema, StoragePresignUploadInputSchema])
      expect(schema.safeParse({ key: 'a', expiresIn }).success).toBe(false)
  })

  it('预签名保留真实能力，不接受未实现的 file.put 或大小限制选项', () => {
    expect(StoragePresignDownloadInputSchema.parse({ key: 'a', expiresIn: 604800 }).expiresIn).toBe(604800)
    expect(StoragePresignUploadInputSchema.parse({ key: 'a' })).toEqual({ key: 'a' })
    for (const field of ['contentLength', 'maxSize', 'metadata', 'checksum', 'ifNoneMatch'])
      expect(StoragePresignUploadInputSchema.safeParse({ key: 'a', [field]: 1 }).success).toBe(false)
  })
})
