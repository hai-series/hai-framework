import { describe, expect, it, vi } from 'vitest'
import { readTransportBody } from '../../src/index.js'

describe('readTransportBody', () => {
  it('按实际 UTF-8 字节而非字符计数，并支持跨 chunk 的多字节字符', async () => {
    const bytes = new TextEncoder().encode('你🙂a')
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.subarray(0, 4))
        controller.enqueue(bytes.subarray(4))
        controller.close()
      },
    })
    await expect(readTransportBody(stream, { maxBytes: 8 })).resolves.toBe('你🙂a')
    expect(stream.locked).toBe(false)
  })

  it('超限立即取消原流，剩余大正文不再读取', async () => {
    let pulled = 0
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++
        controller.enqueue(new Uint8Array(8))
      },
      cancel,
    })
    await expect(readTransportBody(stream, { maxBytes: 7 })).rejects.toBeInstanceOf(RangeError)
    expect(pulled).toBeLessThan(4)
    expect(cancel).toHaveBeenCalledOnce()
    expect(stream.locked).toBe(false)
  })

  it('取消可打断等待中的 read，取消清理挂起也不阻塞返回', async () => {
    const controller = new AbortController()
    const cancel = vi.fn(() => new Promise<void>(() => {}))
    const stream = new ReadableStream<Uint8Array>({ cancel })
    const reading = readTransportBody(stream, { maxBytes: 8, signal: controller.signal })
    controller.abort()
    await expect(reading).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancel).toHaveBeenCalledOnce()
    expect(stream.locked).toBe(false)
  })

  it('开始前已取消时不读取并释放原流', async () => {
    const controller = new AbortController()
    controller.abort()
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({ cancel })
    await expect(readTransportBody(stream, { maxBytes: 8, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancel).toHaveBeenCalledOnce()
    expect(stream.locked).toBe(false)
  })

  it('底层读取错误与 cancel 拒绝不互相覆盖', async () => {
    const original = new Error('source failure')
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.error(original) },
      cancel: async () => { throw new Error('cancel failure') },
    })
    await expect(readTransportBody(stream, { maxBytes: 8 })).rejects.toBe(original)
    expect(stream.locked).toBe(false)
  })

  it('非法 UTF-8 被拒绝并释放 reader', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0xC3, 0x28]))
        controller.close()
      },
    })
    await expect(readTransportBody(stream, { maxBytes: 2 })).rejects.toBeInstanceOf(TypeError)
    expect(stream.locked).toBe(false)
  })

  it('超限取消的清理失败不会覆盖 RangeError', async () => {
    const cancel = vi.fn(async () => {
      throw new Error('cancel failure')
    })
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(2)) },
      cancel,
    })
    await expect(readTransportBody(stream, { maxBytes: 1 })).rejects.toBeInstanceOf(RangeError)
    expect(cancel).toHaveBeenCalledOnce()
    expect(stream.locked).toBe(false)
  })

  it('空流和零预算只允许实际空正文', async () => {
    await expect(readTransportBody(null, { maxBytes: 0 })).resolves.toBe('')
    const stream = new ReadableStream<Uint8Array>({ start: controller => controller.close() })
    await expect(readTransportBody(stream, { maxBytes: 0 })).resolves.toBe('')
  })
})
