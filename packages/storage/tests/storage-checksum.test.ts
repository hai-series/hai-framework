import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { HaiStorageError, storage } from '../src/index.js'

describe('storage.checksum', () => {
  it.each(['sha256', 'sha384', 'sha512', 'sha1', 'md5'] as const)('无需初始化，%s 的字节流摘要与独立实现一致', async (algorithm) => {
    async function* content() {
      yield Buffer.from('a')
      yield Buffer.from('bc')
    }
    const expected = createHash(algorithm).update('abc').digest('hex')
    const generated = await storage.checksum.generate(content(), { algorithm })
    expect(generated).toEqual({ success: true, data: expected })
    expect(await storage.checksum.verify('abc', expected.toUpperCase(), { algorithm })).toEqual({ success: true, data: true })
    expect(await storage.checksum.verify('abd', expected, { algorithm })).toEqual({ success: true, data: false })
  })

  it('支持 S3 checksum 使用的 base64 编码及格式校验', async () => {
    const expected = createHash('sha256').update('abc').digest('base64')
    expect(await storage.checksum.generate('abc', { encoding: 'base64' })).toEqual({ success: true, data: expected })
    expect(await storage.checksum.verify('abc', expected, { encoding: 'base64' })).toEqual({ success: true, data: true })
    const invalid = await storage.checksum.verify('abc', 'not hex')
    expect(invalid.success).toBe(false)
    if (!invalid.success)
      expect(invalid.error.code).toBe(HaiStorageError.INVALID_CHECKSUM.code)
  })

  it('输入流失败与取消返回失败结果', async () => {
    async function* broken() {
      yield Buffer.from('a')
      throw new Error('source unavailable')
    }
    expect((await storage.checksum.generate(broken())).success).toBe(false)
    expect((await storage.checksum.generate('abc', { signal: AbortSignal.abort() })).success).toBe(false)
  })

  it.each(['consumer', 'source'] as const)('取消等待中的字节流立即返回失败并关闭迭代器（%s）', async (cancelledBy) => {
    const waiting = Promise.withResolvers<IteratorResult<Uint8Array>>()
    const entered = Promise.withResolvers<void>()
    const controller = new AbortController()
    let closed = false
    const content: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]() {
        return {
          next() {
            entered.resolve()
            if (cancelledBy === 'source')
              controller.abort()
            return waiting.promise
          },
          async return() {
            closed = true
            return { done: true, value: undefined }
          },
        }
      },
    }
    const calculating = storage.checksum.generate(content, { signal: controller.signal })
    await entered.promise
    controller.abort()
    let timer: ReturnType<typeof setTimeout> | undefined
    const result = await Promise.race([
      calculating,
      new Promise<null>((resolve) => { timer = setTimeout(resolve, 100, null) }),
    ])
    // 即使用例失败也释放挂起输入，避免污染后续测试。
    waiting.resolve({ done: true, value: undefined })
    await calculating
    clearTimeout(timer)
    expect(result).not.toBeNull()
    expect(result?.success).toBe(false)
    if (result && !result.success)
      expect(result.error.code).toBe(HaiStorageError.CHECKSUM_FAILED.code)
    expect(closed).toBe(true)
  })
})
