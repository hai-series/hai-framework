/**
 * =============================================================================
 * @hai/storage - 共享测试模块（契约化精简版）
 * =============================================================================
 *
 * 核心契约测试：验证所有 Storage Provider 必须满足的行为一致性。
 *
 * =============================================================================
 */

import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it } from 'vitest'
import { storage, StorageErrorCode } from '../src/index.js'

export interface StorageTestConfig {
  name: string
  type: 's3' | 'local'
  supportRealPresignUrl: boolean
  publicUrlPrefix?: string
}

// =============================================================================
// 文件操作契约
// =============================================================================

export function runFileTests(config: StorageTestConfig) {
  describe('文件操作契约', () => {
    beforeEach(async () => {
      await storage.file.delete('t.txt')
      await storage.file.delete('t.bin')
      await storage.file.delete('nested/deep/file.txt')
    })

    it('put/get 文本', async () => {
      const content = `Hello, ${config.name}!`
      const put = await storage.file.put('t.txt', content, { contentType: 'text/plain' })
      expect(put.success).toBe(true)
      if (put.success)
        expect(put.data.key).toBe('t.txt')

      const get = await storage.file.get('t.txt')
      expect(get.success).toBe(true)
      if (get.success)
        expect(get.data.toString()).toBe(content)
    })

    it('put/get Buffer', async () => {
      const buf = Buffer.from([0x01, 0x02, 0x03])
      await storage.file.put('t.bin', buf)
      const get = await storage.file.get('t.bin')
      expect(get.success).toBe(true)
      if (get.success)
        expect(get.data).toEqual(buf)
    })

    it('嵌套路径', async () => {
      const r = await storage.file.put('nested/deep/file.txt', 'ok')
      expect(r.success).toBe(true)
      const g = await storage.file.get('nested/deep/file.txt')
      expect(g.success).toBe(true)
    })

    it('head/exists/delete', async () => {
      await storage.file.put('t.txt', 'data')
      const head = await storage.file.head('t.txt')
      expect(head.success).toBe(true)
      if (head.success)
        expect(head.data.key).toBe('t.txt')

      expect((await storage.file.exists('t.txt')).data).toBe(true)
      await storage.file.delete('t.txt')
      expect((await storage.file.exists('t.txt')).data).toBe(false)
    })

    it('copy', async () => {
      await storage.file.put('t.txt', 'src')
      await storage.file.copy('t.txt', 't.bin')
      const g = await storage.file.get('t.bin')
      expect(g.success).toBe(true)
      if (g.success)
        expect(g.data.toString()).toBe('src')
    })
  })
}

// =============================================================================
// 目录操作契约
// =============================================================================

export function runDirTests(_config: StorageTestConfig) {
  describe('目录操作契约', () => {
    beforeEach(async () => {
      await storage.dir.delete('uploads/')
      await storage.dir.delete('folder/')
    })

    it('list', async () => {
      await storage.file.put('uploads/a.txt', 'a')
      await storage.file.put('uploads/b.txt', 'b')
      const r = await storage.dir.list({ prefix: 'uploads/' })
      expect(r.success).toBe(true)
      if (r.success)
        expect(r.data.files.length).toBe(2)
    })

    it('delete 目录', async () => {
      await storage.file.put('folder/x.txt', 'x')
      await storage.file.put('folder/y.txt', 'y')
      await storage.dir.delete('folder/')
      expect((await storage.file.exists('folder/x.txt')).data).toBe(false)
    })
  })
}

// =============================================================================
// 签名 URL 契约
// =============================================================================

export function runPresignTests(_config: StorageTestConfig) {
  describe('签名 URL 契约', () => {
    beforeEach(async () => {
      await storage.file.delete('presign.txt')
    })

    it('getUrl/putUrl', async () => {
      await storage.file.put('presign.txt', 'test')
      const getUrl = await storage.presign.getUrl('presign.txt', { expiresIn: 60 })
      expect(getUrl.success).toBe(true)
      if (getUrl.success)
        expect(getUrl.data.length).toBeGreaterThan(0)

      const putUrl = await storage.presign.putUrl('upload.txt', { contentType: 'text/plain', expiresIn: 60 })
      expect(putUrl.success).toBe(true)
    })

    it('publicUrl', () => {
      const url = storage.presign.publicUrl('img.png')
      if (config.publicUrlPrefix) {
        expect(url).toBe(`${config.publicUrlPrefix}/img.png`)
      }
      else {
        expect(url).toBeNull()
      }
    })
  })
}

// =============================================================================
// 错误处理契约
// =============================================================================

export function runErrorTests(_config: StorageTestConfig) {
  describe('错误处理契约', () => {
    it('get 不存在返回 NOT_FOUND', async () => {
      const r = await storage.file.get('nonexistent-12345.txt')
      expect(r.success).toBe(false)
      if (!r.success)
        expect(r.error.code).toBe(StorageErrorCode.NOT_FOUND)
    })
  })
}

// =============================================================================
// 未初始化契约
// =============================================================================

export function runNotInitializedTests() {
  describe('未初始化契约', () => {
    it('操作应返回 NOT_INITIALIZED', async () => {
      expect(storage.isInitialized).toBe(false)
      const r = await storage.file.get('test.txt')
      expect(r.success).toBe(false)
      if (!r.success)
        expect(r.error.code).toBe(StorageErrorCode.NOT_INITIALIZED)
    })
  })
}

// =============================================================================
// 全部契约
// =============================================================================

export function runAllTests(config: StorageTestConfig) {
  runFileTests(config)
  runDirTests(config)
  runPresignTests(config)
  runErrorTests(config)
}
