/**
 * =============================================================================
 * @h-ai/storage - 文件操作测试
 * =============================================================================
 */

import { Buffer } from 'node:buffer'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { storage } from '../src/index.js'
import { HaiStorageError } from '../src/storage-types.js'
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
        expect(result.error.code).toBe(HaiStorageError.NOT_FOUND.code)
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
        expect(result.error.code).toBe(HaiStorageError.NOT_FOUND.code)
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

    // =========================================================================
    // put 带自定义 metadata 后通过 head 验证
    // =========================================================================

    it(`${label}: put 带自定义 metadata 后 head 应包含 metadata`, async () => {
      const result = await storage.file.put('with-meta.txt', 'meta content', {
        contentType: 'text/plain',
        metadata: { author: 'test', version: '1' },
      })
      expect(result.success).toBe(true)

      const headResult = await storage.file.head('with-meta.txt')
      expect(headResult.success).toBe(true)
      if (headResult.success) {
        expect(headResult.data.key).toBe('with-meta.txt')
        expect(headResult.data.contentType).toBe('text/plain')
        // metadata 应存在（local 通过 .meta.json，s3 通过 Metadata header）
        expect(headResult.data.metadata).toBeDefined()
        if (headResult.data.metadata) {
          expect(headResult.data.metadata.author).toBe('test')
          expect(headResult.data.metadata.version).toBe('1')
        }
      }
    })

    // =========================================================================
    // put 带 cacheControl / contentDisposition
    // =========================================================================

    it(`${label}: put 带 cacheControl 后上传应成功`, async () => {
      const result = await storage.file.put('cached.txt', 'cache test', {
        cacheControl: 'max-age=86400',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.key).toBe('cached.txt')
      }
    })

    it(`${label}: put 带 contentDisposition 后上传应成功`, async () => {
      const result = await storage.file.put('download.txt', 'download content', {
        contentDisposition: 'attachment; filename="download.txt"',
      })
      expect(result.success).toBe(true)
    })

    // =========================================================================
    // copy 带选项
    // =========================================================================

    it(`${label}: copy 带 contentType 应覆盖目标文件类型`, async () => {
      await storage.file.put('src-type.txt', 'type test')

      const copyResult = await storage.file.copy('src-type.txt', 'dest-type.html', {
        contentType: 'text/html',
      })
      expect(copyResult.success).toBe(true)
      if (copyResult.success) {
        expect(copyResult.data.contentType).toBe('text/html')
      }
    })

    // =========================================================================
    // get 范围边界
    // =========================================================================

    it(`${label}: get 只指定 rangeStart 应读取到末尾`, async () => {
      await storage.file.put('range2.txt', 'Hello World')

      const result = await storage.file.get('range2.txt', { rangeStart: 6 })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.toString()).toBe('World')
      }
    })

    // =========================================================================
    // head 元数据字段完整性
    // =========================================================================

    it(`${label}: head 返回的元数据应包含完整字段`, async () => {
      await storage.file.put('head-full.txt', 'check all fields', {
        contentType: 'text/plain',
      })

      const result = await storage.file.head('head-full.txt')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.key).toBe('head-full.txt')
        expect(result.data.size).toBe(Buffer.from('check all fields').length)
        expect(result.data.contentType).toBe('text/plain')
        expect(result.data.lastModified).toBeInstanceOf(Date)
        expect(typeof result.data.etag).toBe('string')
        expect(result.data.etag!.length).toBeGreaterThan(0)
      }
    })
  }

  defineStorageSuite('local', localStorageEnv, () => defineCommon('local'))

  defineStorageSuite('s3', s3Env, () => defineCommon('s3'))

  // ===========================================================================
  // Local 专属边界测试
  // ===========================================================================

  describe('storage.file (local 边界)', () => {
    it('local: 路径穿越的 key 应被安全规范化到 root 内', async () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hai-storage-file-local-'))
      await storage.close()
      const initResult = await storage.init({ type: 'local', root: tempRoot })
      expect(initResult.success).toBe(true)

      // safePath 会将 ../../etc/evil.txt 规范化为 etc/evil.txt（剥离前导 ../ ）
      const result = await storage.file.put('../../etc/evil.txt', 'sanitized')
      expect(result.success).toBe(true)

      // 验证文件实际写入到 root 下的 etc/evil.txt
      const getResult = await storage.file.get('etc/evil.txt')
      expect(getResult.success).toBe(true)
      if (getResult.success) {
        expect(getResult.data.toString()).toBe('sanitized')
      }

      await storage.close()
      fs.rmSync(tempRoot, { recursive: true, force: true })
    })

    it('local: head 对目录路径应返回 INVALID_PATH', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hai-storage-file-head-dir-'))
      const subDir = path.join(root, 'subdir')
      fs.mkdirSync(subDir)

      await storage.close()
      const initResult = await storage.init({ type: 'local', root })
      expect(initResult.success).toBe(true)

      const result = await storage.file.head('subdir')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiStorageError.INVALID_PATH.code)
      }

      await storage.close()
      fs.rmSync(root, { recursive: true, force: true })
    })
  })
})
