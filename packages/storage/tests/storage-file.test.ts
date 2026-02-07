/**
 * =============================================================================
 * @hai/storage - 文件操作测试
 * =============================================================================
 */

import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { storage } from '../src/storage-index.node.js'
import { defineStorageSuite, localStorageEnv, s3Env } from './helpers/storage-test-suite.js'

describe('storage.file', () => {
  const defineCommon = (label: 'local' | 's3') => {
    // =========================================================================
    // put & get
    // =========================================================================

    it(`${label}: put 字符串后 get 应能取回相同内容`, async () => {
      const putResult = await storage.file.put('hello.txt', 'Hello World')
      expect(putResult.success).toBe(true)
      if (putResult.success) {
        expect(putResult.data.key).toBe('hello.txt')
        expect(putResult.data.size).toBeGreaterThan(0)
      }

      const getResult = await storage.file.get('hello.txt')
      expect(getResult.success).toBe(true)
      if (getResult.success) {
        expect(getResult.data.toString()).toBe('Hello World')
      }
    })

    it(`${label}: put Buffer 后 get 应能取回相同内容`, async () => {
      const buf = Buffer.from([0x00, 0x01, 0x02, 0xFF])
      const putResult = await storage.file.put('binary.bin', buf)
      expect(putResult.success).toBe(true)

      const getResult = await storage.file.get('binary.bin')
      expect(getResult.success).toBe(true)
      if (getResult.success) {
        expect(Buffer.compare(getResult.data, buf)).toBe(0)
      }
    })

    it(`${label}: put Uint8Array 后 get 应能取回相同内容`, async () => {
      const arr = new Uint8Array([10, 20, 30, 40])
      const putResult = await storage.file.put('uint8.bin', arr)
      expect(putResult.success).toBe(true)

      const getResult = await storage.file.get('uint8.bin')
      expect(getResult.success).toBe(true)
      if (getResult.success) {
        expect(getResult.data[0]).toBe(10)
        expect(getResult.data[3]).toBe(40)
      }
    })

    it(`${label}: put 应自动创建嵌套路径`, async () => {
      const result = await storage.file.put('a/b/c/deep.txt', 'deep content')
      expect(result.success).toBe(true)

      const getResult = await storage.file.get('a/b/c/deep.txt')
      expect(getResult.success).toBe(true)
      if (getResult.success) {
        expect(getResult.data.toString()).toBe('deep content')
      }
    })

    it(`${label}: put 带 contentType 选项时元数据应包含该类型`, async () => {
      const result = await storage.file.put('image.png', 'fake-png-data', {
        contentType: 'image/png',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.contentType).toBe('image/png')
      }
    })

    it(`${label}: put 空字符串应成功`, async () => {
      const putResult = await storage.file.put('empty.txt', '')
      expect(putResult.success).toBe(true)
      if (putResult.success) {
        expect(putResult.data.size).toBe(0)
      }

      const getResult = await storage.file.get('empty.txt')
      expect(getResult.success).toBe(true)
      if (getResult.success) {
        expect(getResult.data.toString()).toBe('')
      }
    })

    it(`${label}: 覆盖写入相同 key 应更新内容`, async () => {
      await storage.file.put('overwrite.txt', 'version1')
      await storage.file.put('overwrite.txt', 'version2')

      const getResult = await storage.file.get('overwrite.txt')
      expect(getResult.success).toBe(true)
      if (getResult.success) {
        expect(getResult.data.toString()).toBe('version2')
      }
    })

    // =========================================================================
    // get 不存在的文件
    // =========================================================================

    it(`${label}: get 不存在的文件应返回 NOT_FOUND`, async () => {
      const result = await storage.file.get('nonexistent.txt')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(5002)
      }
    })

    // =========================================================================
    // get 范围请求
    // =========================================================================

    it(`${label}: get 支持范围读取（rangeStart/rangeEnd）`, async () => {
      await storage.file.put('range.txt', 'Hello World')

      const result = await storage.file.get('range.txt', { rangeStart: 0, rangeEnd: 4 })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.toString()).toBe('Hello')
      }
    })

    // =========================================================================
    // head
    // =========================================================================

    it(`${label}: head 应返回正确的文件元数据`, async () => {
      await storage.file.put('meta-test.txt', 'test content')

      const result = await storage.file.head('meta-test.txt')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.key).toBe('meta-test.txt')
        expect(result.data.size).toBe(Buffer.from('test content').length)
        expect(result.data.lastModified).toBeInstanceOf(Date)
        expect(typeof result.data.etag).toBe('string')
      }
    })

    it(`${label}: head 不存在的文件应返回 NOT_FOUND`, async () => {
      const result = await storage.file.head('nope.txt')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(5002)
      }
    })

    // =========================================================================
    // exists
    // =========================================================================

    it(`${label}: exists 已存在的文件应返回 true`, async () => {
      await storage.file.put('exists-test.txt', 'data')

      const result = await storage.file.exists('exists-test.txt')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(true)
      }
    })

    it(`${label}: exists 不存在的文件应返回 false`, async () => {
      const result = await storage.file.exists('no-file.txt')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(false)
      }
    })

    // =========================================================================
    // delete
    // =========================================================================

    it(`${label}: delete 应删除已存在的文件`, async () => {
      await storage.file.put('to-delete.txt', 'data')

      const delResult = await storage.file.delete('to-delete.txt')
      expect(delResult.success).toBe(true)

      const existsResult = await storage.file.exists('to-delete.txt')
      expect(existsResult.success).toBe(true)
      if (existsResult.success) {
        expect(existsResult.data).toBe(false)
      }
    })

    it(`${label}: delete 不存在的文件应视为成功`, async () => {
      const result = await storage.file.delete('never-existed.txt')
      expect(result.success).toBe(true)
    })

    // =========================================================================
    // deleteMany
    // =========================================================================

    it(`${label}: deleteMany 应批量删除多个文件`, async () => {
      await storage.file.put('batch-a.txt', 'a')
      await storage.file.put('batch-b.txt', 'b')
      await storage.file.put('batch-c.txt', 'c')

      const result = await storage.file.deleteMany(['batch-a.txt', 'batch-b.txt', 'batch-c.txt'])
      expect(result.success).toBe(true)

      for (const key of ['batch-a.txt', 'batch-b.txt', 'batch-c.txt']) {
        const exists = await storage.file.exists(key)
        expect(exists.success).toBe(true)
        if (exists.success) {
          expect(exists.data).toBe(false)
        }
      }
    })

    it(`${label}: deleteMany 空数组应直接成功`, async () => {
      const result = await storage.file.deleteMany([])
      expect(result.success).toBe(true)
    })

    // =========================================================================
    // copy
    // =========================================================================

    it(`${label}: copy 应复制文件内容和创建新 key`, async () => {
      await storage.file.put('src-file.txt', 'copy me')

      const copyResult = await storage.file.copy('src-file.txt', 'dest-file.txt')
      expect(copyResult.success).toBe(true)
      if (copyResult.success) {
        expect(copyResult.data.key).toBe('dest-file.txt')
      }

      const getResult = await storage.file.get('dest-file.txt')
      expect(getResult.success).toBe(true)
      if (getResult.success) {
        expect(getResult.data.toString()).toBe('copy me')
      }

      // 源文件不受影响
      const srcResult = await storage.file.get('src-file.txt')
      expect(srcResult.success).toBe(true)
    })

    it(`${label}: copy 不存在的源文件应返回错误`, async () => {
      const result = await storage.file.copy('no-source.txt', 'dest.txt')
      expect(result.success).toBe(false)
    })

    it(`${label}: copy 到嵌套路径应自动创建中间路径`, async () => {
      await storage.file.put('flat.txt', 'flat content')

      const result = await storage.file.copy('flat.txt', 'deep/nested/copy.txt')
      expect(result.success).toBe(true)

      const getResult = await storage.file.get('deep/nested/copy.txt')
      expect(getResult.success).toBe(true)
      if (getResult.success) {
        expect(getResult.data.toString()).toBe('flat content')
      }
    })
  }

  defineStorageSuite('local', localStorageEnv, () => defineCommon('local'))

  defineStorageSuite('s3', s3Env, () => defineCommon('s3'))
})
