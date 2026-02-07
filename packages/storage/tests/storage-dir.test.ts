/**
 * =============================================================================
 * @hai/storage - 目录操作测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { storage } from '../src/storage-index.node.js'
import { defineStorageSuite, localStorageEnv, s3Env } from './helpers/storage-test-suite.js'

describe('storage.dir', () => {
  const defineCommon = (label: 'local' | 's3') => {
    // =========================================================================
    // list
    // =========================================================================

    it(`${label}: list 空目录应返回空文件列表`, async () => {
      const result = await storage.dir.list({ prefix: 'empty-ns/' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.files).toEqual([])
      }
    })

    it(`${label}: list 应返回已上传的文件`, async () => {
      await storage.file.put('dir-test/file1.txt', 'content1')
      await storage.file.put('dir-test/file2.txt', 'content2')

      const result = await storage.dir.list({ prefix: 'dir-test/' })
      expect(result.success).toBe(true)
      if (result.success) {
        const keys = result.data.files.map(f => f.key)
        expect(keys).toContain('dir-test/file1.txt')
        expect(keys).toContain('dir-test/file2.txt')
        expect(result.data.files.length).toBe(2)
      }
    })

    it(`${label}: list 带 prefix 应只返回匹配的文件`, async () => {
      await storage.file.put('ns-images/a.png', 'a')
      await storage.file.put('ns-images/b.png', 'b')
      await storage.file.put('ns-docs/readme.md', 'readme')

      const result = await storage.dir.list({ prefix: 'ns-images/' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.files.length).toBe(2)
        const keys = result.data.files.map(f => f.key)
        expect(keys.every(k => k.startsWith('ns-images/'))).toBe(true)
      }
    })

    it(`${label}: list 带 delimiter 应返回 commonPrefixes`, async () => {
      await storage.file.put('dl-uploads/img/a.png', 'a')
      await storage.file.put('dl-uploads/doc/readme.md', 'readme')
      await storage.file.put('dl-uploads/root.txt', 'root')

      const result = await storage.dir.list({ prefix: 'dl-uploads/', delimiter: '/' })
      expect(result.success).toBe(true)
      if (result.success) {
        // 根文件
        const keys = result.data.files.map(f => f.key)
        expect(keys).toContain('dl-uploads/root.txt')

        // 子目录作为公共前缀
        expect(result.data.commonPrefixes).toContain('dl-uploads/img/')
        expect(result.data.commonPrefixes).toContain('dl-uploads/doc/')
      }
    })

    it(`${label}: list 带 maxKeys 应限制返回条目数`, async () => {
      for (let i = 0; i < 5; i++) {
        await storage.file.put(`limited-ns/limited-${i}.txt`, `content-${i}`)
      }

      const result = await storage.dir.list({ prefix: 'limited-ns/', maxKeys: 3 })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.files.length).toBe(3)
        expect(result.data.isTruncated).toBe(true)
      }
    })

    it(`${label}: list 不存在的前缀应返回空列表`, async () => {
      const result = await storage.dir.list({ prefix: 'nonexistent-prefix-xyz/' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.files).toEqual([])
      }
    })

    // =========================================================================
    // delete
    // =========================================================================

    it(`${label}: dir.delete 应删除指定前缀下的所有文件`, async () => {
      await storage.file.put('del-tmp/a.txt', 'a')
      await storage.file.put('del-tmp/b.txt', 'b')
      await storage.file.put('del-keep.txt', 'keep')

      const delResult = await storage.dir.delete('del-tmp/')
      expect(delResult.success).toBe(true)

      // del-tmp 下文件已被删除
      const existsA = await storage.file.exists('del-tmp/a.txt')
      expect(existsA.success).toBe(true)
      if (existsA.success) {
        expect(existsA.data).toBe(false)
      }

      // 根目录文件不受影响
      const existsKeep = await storage.file.exists('del-keep.txt')
      expect(existsKeep.success).toBe(true)
      if (existsKeep.success) {
        expect(existsKeep.data).toBe(true)
      }
    })

    it(`${label}: dir.delete 不存在的目录应视为成功`, async () => {
      const result = await storage.dir.delete('no-such-dir-xyz/')
      expect(result.success).toBe(true)
    })
  }

  defineStorageSuite('local', localStorageEnv, () => defineCommon('local'))

  defineStorageSuite('s3', s3Env, () => defineCommon('s3'))
})
