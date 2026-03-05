/**
 * =============================================================================
 * @h-ai/scheduler - 分布式锁仓库测试
 * =============================================================================
 */

import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SchedulerLockRepository } from '../src/repositories/scheduler-lock-repository.js'

describe('schedulerLockRepository', () => {
  let repo: SchedulerLockRepository

  beforeEach(async () => {
    await reldb.init({ type: 'sqlite', database: ':memory:' })
    repo = new SchedulerLockRepository(reldb, 'scheduler_locks')
    // 等待建表完成
    await new Promise(resolve => setTimeout(resolve, 50))
  })

  afterEach(async () => {
    await reldb.close()
  })

  describe('tryAcquire', () => {
    it('首次获锁应成功', async () => {
      const result = await repo.tryAcquire('task-1', 1000, 'node-a', 300000)
      expect(result).toBe(true)
    })

    it('同一锁键第二次获锁应失败', async () => {
      const first = await repo.tryAcquire('task-1', 1000, 'node-a', 300000)
      expect(first).toBe(true)

      const second = await repo.tryAcquire('task-1', 1000, 'node-b', 300000)
      expect(second).toBe(false)
    })

    it('不同分钟时间戳应各自独立获锁', async () => {
      const first = await repo.tryAcquire('task-1', 1000, 'node-a', 300000)
      expect(first).toBe(true)

      const second = await repo.tryAcquire('task-1', 1001, 'node-a', 300000)
      expect(second).toBe(true)
    })

    it('不同任务同一分钟应各自独立获锁', async () => {
      const first = await repo.tryAcquire('task-1', 1000, 'node-a', 300000)
      expect(first).toBe(true)

      const second = await repo.tryAcquire('task-2', 1000, 'node-b', 300000)
      expect(second).toBe(true)
    })

    it('过期锁应被清理后允许重新获锁', async () => {
      // 获锁，过期时间设为 0（立即过期）
      const first = await repo.tryAcquire('task-1', 1000, 'node-a', 0)
      expect(first).toBe(true)

      // 等待一小段时间确保过期
      await new Promise(resolve => setTimeout(resolve, 10))

      // 其他节点应能获锁（因为过期锁会被清理）
      const second = await repo.tryAcquire('task-1', 1000, 'node-b', 300000)
      expect(second).toBe(true)
    })
  })

  describe('releaseLock', () => {
    it('应更新锁状态为 completed', async () => {
      await repo.tryAcquire('task-1', 1000, 'node-a', 300000)
      await repo.releaseLock('task-1', 1000, 'completed')

      // 验证状态已更新：查询数据库
      const rows = await repo.findAll({ where: 'lock_key = ?', params: ['task-1:1000'], limit: 1 })
      expect(rows.success).toBe(true)
      if (rows.success) {
        expect(rows.data[0].status).toBe('completed')
      }
    })

    it('应更新锁状态为 failed', async () => {
      await repo.tryAcquire('task-1', 1000, 'node-a', 300000)
      await repo.releaseLock('task-1', 1000, 'failed')

      const rows = await repo.findAll({ where: 'lock_key = ?', params: ['task-1:1000'], limit: 1 })
      expect(rows.success).toBe(true)
      if (rows.success) {
        expect(rows.data[0].status).toBe('failed')
      }
    })

    it('释放不存在的锁不应报错', async () => {
      await expect(repo.releaseLock('nonexistent', 9999, 'completed')).resolves.toBeUndefined()
    })
  })

  describe('cleanupExpiredLocks', () => {
    it('应清理过期的 running 状态锁', async () => {
      // 创建一个立即过期的锁
      await repo.tryAcquire('task-1', 500, 'node-a', 0)
      await new Promise(resolve => setTimeout(resolve, 10))

      await repo.cleanupExpiredLocks()

      const rows = await repo.findAll({ where: 'task_id = ?', params: ['task-1'] })
      expect(rows.success).toBe(true)
      if (rows.success) {
        expect(rows.data.length).toBe(0)
      }
    })

    it('应清理超过保留期的已完成锁', async () => {
      await repo.tryAcquire('task-1', 500, 'node-a', 300000)
      await repo.releaseLock('task-1', 500, 'completed')

      // 等待一小段时间确保 locked_at < now
      await new Promise(resolve => setTimeout(resolve, 10))

      // 使用 1ms 保留期清理
      await repo.cleanupExpiredLocks(1)

      const rows = await repo.findAll({ where: 'task_id = ?', params: ['task-1'] })
      expect(rows.success).toBe(true)
      if (rows.success) {
        expect(rows.data.length).toBe(0)
      }
    })

    it('不应清理未过期的 running 锁', async () => {
      await repo.tryAcquire('task-1', 500, 'node-a', 300000)

      await repo.cleanupExpiredLocks()

      const rows = await repo.findAll({ where: 'task_id = ?', params: ['task-1'] })
      expect(rows.success).toBe(true)
      if (rows.success) {
        expect(rows.data.length).toBe(1)
      }
    })
  })
})
