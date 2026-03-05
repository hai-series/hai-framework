/**
 * =============================================================================
 * @h-ai/core - 异步工具测试
 * =============================================================================
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { core } from '../src/index.js'

describe('core.async', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    core.i18n.setGlobalLocale('en-US')
  })

  afterEach(() => {
    vi.useRealTimers()
    core.i18n.setGlobalLocale('zh-CN')
  })

  it('delay 应该延迟执行', async () => {
    const spy = vi.fn()
    const promise = core.async.delay(50).then(spy)

    await vi.advanceTimersByTimeAsync(49)
    expect(spy).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await promise
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('withTimeout 应该在超时后 reject', async () => {
    const promise = core.async.withTimeout(new Promise(() => {}), 100)
    const assertion = expect(promise).rejects.toThrow('Request timeout')
    await vi.advanceTimersByTimeAsync(100)
    await assertion
  })

  it('withTimeout 应该在超时前正常返回结果', async () => {
    const promise = core.async.withTimeout(
      core.async.delay(50).then(() => 'done'),
      200,
    )
    await vi.advanceTimersByTimeAsync(50)
    const result = await promise
    expect(result).toBe('done')
  })

  it('withTimeout 正常返回后应清理超时定时器', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')

    const promise = core.async.withTimeout(
      core.async.delay(50).then(() => 'done'),
      200,
    )
    await vi.advanceTimersByTimeAsync(50)
    await promise

    expect(clearTimeoutSpy).toHaveBeenCalled()
    clearTimeoutSpy.mockRestore()
  })

  it('retry 应该按次数重试', async () => {
    let count = 0
    const promise = core.async.retry(async () => {
      count += 1
      if (count < 3)
        throw new Error('fail')
      return 'ok'
    }, { maxRetries: 3, delay: 10 })

    await vi.advanceTimersByTimeAsync(30)
    const result = await promise

    expect(result).toBe('ok')
    expect(count).toBe(3)
  })

  it('retry maxRetries=0 应至少执行一次', async () => {
    let count = 0
    const result = await core.async.retry(async () => {
      count += 1
      return 'ok'
    }, { maxRetries: 0 })

    expect(result).toBe('ok')
    expect(count).toBe(1)
  })

  it('retry 全部失败应抛出最后一次错误', async () => {
    vi.useRealTimers()
    await expect(
      core.async.retry(async () => {
        throw new Error('always fail')
      }, { maxRetries: 2, delay: 1 }),
    ).rejects.toThrow('always fail')
    vi.useFakeTimers()
  })

  it('parallel 应该限制并发并保持顺序', async () => {
    let running = 0
    let maxRunning = 0
    const items = [1, 2, 3, 4]

    const promise = core.async.parallel(items, async (n) => {
      running += 1
      maxRunning = Math.max(maxRunning, running)
      await core.async.delay(20)
      running -= 1
      return n * 2
    }, 2)

    await vi.advanceTimersByTimeAsync(100)
    const result = await promise
    expect(result).toEqual([2, 4, 6, 8])
    expect(maxRunning).toBeLessThanOrEqual(2)
  })

  it('serial 应该按顺序执行', async () => {
    const items = [1, 2, 3]
    const result = await core.async.serial(items, async n => n * 3)
    expect(result).toEqual([3, 6, 9])
  })

  it('debounce 应该合并短时间内调用', async () => {
    const spy = vi.fn()
    const fn = core.async.debounce(spy, 100)

    fn()
    fn()
    fn()

    await vi.advanceTimersByTimeAsync(99)
    expect(spy).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('throttle 应该限制调用频率', async () => {
    const spy = vi.fn()
    const fn = core.async.throttle(spy, 100)

    fn()
    fn()
    fn()

    expect(spy).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(100)
    fn()
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
