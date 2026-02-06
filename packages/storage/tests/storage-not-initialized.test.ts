/**
 * =============================================================================
 * @hai/storage - 未初始化行为测试
 * =============================================================================
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { storage, StorageErrorCode } from '../src/index.js'

describe.sequential('storage (not initialized)', () => {
  beforeEach(async () => {
    await storage.close()
  })

  it('file.put 应返回 NOT_INITIALIZED', async () => {
    const result = await storage.file.put('test.txt', 'hello')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(StorageErrorCode.NOT_INITIALIZED)
    }
  })

  it('file.get 应返回 NOT_INITIALIZED', async () => {
    const result = await storage.file.get('test.txt')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(StorageErrorCode.NOT_INITIALIZED)
    }
  })

  it('file.head 应返回 NOT_INITIALIZED', async () => {
    const result = await storage.file.head('test.txt')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(StorageErrorCode.NOT_INITIALIZED)
    }
  })

  it('file.exists 应返回 NOT_INITIALIZED', async () => {
    const result = await storage.file.exists('test.txt')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(StorageErrorCode.NOT_INITIALIZED)
    }
  })

  it('file.delete 应返回 NOT_INITIALIZED', async () => {
    const result = await storage.file.delete('test.txt')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(StorageErrorCode.NOT_INITIALIZED)
    }
  })

  it('file.deleteMany 应返回 NOT_INITIALIZED', async () => {
    const result = await storage.file.deleteMany(['a.txt', 'b.txt'])
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(StorageErrorCode.NOT_INITIALIZED)
    }
  })

  it('file.copy 应返回 NOT_INITIALIZED', async () => {
    const result = await storage.file.copy('a.txt', 'b.txt')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(StorageErrorCode.NOT_INITIALIZED)
    }
  })

  it('dir.list 应返回 NOT_INITIALIZED', async () => {
    const result = await storage.dir.list()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(StorageErrorCode.NOT_INITIALIZED)
    }
  })

  it('dir.delete 应返回 NOT_INITIALIZED', async () => {
    const result = await storage.dir.delete('some-prefix/')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(StorageErrorCode.NOT_INITIALIZED)
    }
  })

  it('presign.getUrl 应返回 NOT_INITIALIZED', async () => {
    const result = await storage.presign.getUrl('test.txt')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(StorageErrorCode.NOT_INITIALIZED)
    }
  })

  it('presign.putUrl 应返回 NOT_INITIALIZED', async () => {
    const result = await storage.presign.putUrl('test.txt')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(StorageErrorCode.NOT_INITIALIZED)
    }
  })

  it('presign.publicUrl 应返回 null', () => {
    const result = storage.presign.publicUrl('test.txt')
    expect(result).toBeNull()
  })

  it('isInitialized 应为 false', () => {
    expect(storage.isInitialized).toBe(false)
  })

  it('config 应为 null', () => {
    expect(storage.config).toBeNull()
  })
})
