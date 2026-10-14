import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { HaiStorageError, storage } from '../src/index.js'
import { defineS3StorageSuites, defineStorageSuite, localStorageEnv } from './helpers/storage-test-suite.js'

function defineStreamTests() {
  it('流式写入跨多个 S3 分片，流式读取与范围读取保持字节一致', async () => {
    const chunk = Buffer.alloc(256 * 1024, 7)
    const count = 44
    async function* content() {
      for (let index = 0; index < count; index++)
        yield chunk
    }
    const put = await storage.file.put('stream/large.bin', content(), { ifNoneMatch: '*', contentType: 'application/octet-stream' })
    expect(put.success).toBe(true)
    if (!put.success)
      return
    expect(put.data.size).toBe(chunk.length * count)
    const read = await storage.file.getStream('stream/large.bin')
    expect(read.success).toBe(true)
    if (!read.success)
      return
    const expected = createHash('sha256')
    for (let index = 0; index < count; index++)
      expected.update(chunk)
    expect(await storage.checksum.verify(read.data, expected.digest('hex'))).toEqual({ success: true, data: true })
    const range = await storage.file.getStream('stream/large.bin', { rangeStart: 255, rangeEnd: 258 })
    expect(range.success).toBe(true)
    if (range.success) {
      const bytes = []
      for await (const part of range.data)
        bytes.push(part)
      expect(Buffer.concat(bytes)).toEqual(Buffer.alloc(4, 7))
    }
  })

  it('并发仅创建写入只有一个成功，失败写入不覆盖已存在对象', async () => {
    const writes = await Promise.all(['first', 'second'].map(text => storage.file.put('stream/once.txt', text, { ifNoneMatch: '*' })))
    expect(writes.filter(result => result.success)).toHaveLength(1)
    const failed = writes.find(result => !result.success)
    expect(failed?.success).toBe(false)
    if (failed && !failed.success)
      expect(failed.error.code).toBe(HaiStorageError.ALREADY_EXISTS.code)
    const before = await storage.file.get('stream/once.txt')
    const rejected = await storage.file.put('stream/once.txt', 'replacement', { ifNoneMatch: '*' })
    expect(rejected.success).toBe(false)
    expect(await storage.file.get('stream/once.txt')).toEqual(before)
  })

  it('源流失败不会发布半成品，也不会破坏已有对象', async () => {
    await storage.file.put('stream/stable.txt', 'original')
    async function* broken() {
      yield Buffer.from('partial')
      throw new Error('source failed')
    }
    expect((await storage.file.put('stream/stable.txt', broken())).success).toBe(false)
    expect(await storage.file.get('stream/stable.txt')).toEqual({ success: true, data: Buffer.from('original') })
    const listed = await storage.dir.list({ prefix: 'stream/' })
    expect(listed.success).toBe(true)
    if (listed.success)
      expect(listed.data.files.some(item => item.key.endsWith('.upload.tmp'))).toBe(false)
  })

  it('预先取消不写入对象，缺失文件读取返回错误', async () => {
    expect((await storage.file.put('stream/cancelled.txt', 'content', { signal: AbortSignal.abort() })).success).toBe(false)
    expect(await storage.file.exists('stream/cancelled.txt')).toEqual({ success: true, data: false })
    const missing = await storage.file.getStream('stream/missing.txt')
    expect(missing.success).toBe(false)
    if (!missing.success)
      expect(missing.error.code).toBe(HaiStorageError.NOT_FOUND.code)
  })
}

describe('storage streams', () => {
  defineStorageSuite('local', localStorageEnv, defineStreamTests)
  defineS3StorageSuites(defineStreamTests, 'stream')
})
