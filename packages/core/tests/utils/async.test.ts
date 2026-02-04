/**
 * =============================================================================
 * @hai/core - 异步操作工具测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { async as asyncUtils } from '../../src/utils/core-util-async.js'

describe('core-util-async', () => {
  describe('delay()', () => {
    it('应延迟指定时间', async () => {
      const start = Date.now()
      await asyncUtils.delay(50)
      const elapsed = Date.now() - start

      expect(elapsed).toBeGreaterThanOrEqual(45)
      expect(elapsed).toBeLessThan(100)
    })
  })

  describe('withTimeout()', () => {
    it('应在超时前完成时返回结果', async () => {
      const promise = new Promise<string>((resolve) => {
        setTimeout(() => resolve('success'), 10)
      })

      const result = await asyncUtils.withTimeout(promise, 100)
      expect(result).toBe('success')
    })

    it('应在超时后抛出错误', async () => {
      const promise = new Promise((resolve) => {
        setTimeout(resolve, 100)
      })

      await expect(asyncUtils.withTimeout(promise, 10)).rejects.toThrow('请求超时')
    })
  })

  describe('retry()', () => {
    it('应在成功时返回结果', async () => {
      let attempts = 0
      const fn = async () => {
        attempts++
        return 'success'
      }

      const result = await asyncUtils.retry(fn)
      expect(result).toBe('success')
      expect(attempts).toBe(1)
    })

    it('应在失败后重试', async () => {
      let attempts = 0
      const fn = async () => {
        attempts++
        if (attempts < 3)
          throw new Error('fail')
        return 'success'
      }

      const result = await asyncUtils.retry(fn, { maxRetries: 3, delay: 10 })
      expect(result).toBe('success')
      expect(attempts).toBe(3)
    })

    it('应在达到最大重试次数后抛出错误', async () => {
      const fn = async () => {
        throw new Error('always fail')
      }

      await expect(asyncUtils.retry(fn, { maxRetries: 2, delay: 10 })).rejects.toThrow('always fail')
    })
  })

  describe('parallel()', () => {
    it('应并行执行任务', async () => {
      const items = [1, 2, 3, 4, 5]
      const results = await asyncUtils.parallel(items, async n => n * 2)

      expect(results).toEqual([2, 4, 6, 8, 10])
    })

    it('应限制并发数', async () => {
      let concurrent = 0
      let maxConcurrent = 0

      const items = [1, 2, 3, 4, 5]
      await asyncUtils.parallel(items, async () => {
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await asyncUtils.delay(20)
        concurrent--
      }, 2)

      expect(maxConcurrent).toBeLessThanOrEqual(2)
    })
  })

  describe('serial()', () => {
    it('应串行执行任务', async () => {
      const order: number[] = []
      const items = [1, 2, 3]

      await asyncUtils.serial(items, async (n) => {
        await asyncUtils.delay(10)
        order.push(n)
      })

      expect(order).toEqual([1, 2, 3])
    })

    it('应返回所有结果', async () => {
      const items = [1, 2, 3]
      const results = await asyncUtils.serial(items, async n => n * 2)

      expect(results).toEqual([2, 4, 6])
    })
  })

  describe('debounce()', () => {
    it('应防抖执行', async () => {
      let callCount = 0
      const fn = asyncUtils.debounce(() => {
        callCount++
      }, 50)

      fn()
      fn()
      fn()

      expect(callCount).toBe(0)

      await asyncUtils.delay(100)
      expect(callCount).toBe(1)
    })

    it('应在延迟后执行最后一次调用', async () => {
      let lastValue = 0
      const fn = asyncUtils.debounce((value: number) => {
        lastValue = value
      }, 50)

      fn(1)
      fn(2)
      fn(3)

      await asyncUtils.delay(100)
      expect(lastValue).toBe(3)
    })
  })
})
