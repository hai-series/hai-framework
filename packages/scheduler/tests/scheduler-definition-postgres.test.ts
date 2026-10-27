/** 本用例只连接测试运行器明确提供的独立 PostgreSQL，不读取应用环境文件。 */
import process from 'node:process'
import { reldb } from '@h-ai/reldb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { scheduler } from '../src/index.js'

describe.skipIf(!process.env.HAI_SCHEDULER_TEST_POSTGRES)('postgreSQL definition coordination', () => {
  beforeAll(async () => {
    const url = process.env.HAI_SCHEDULER_TEST_POSTGRES!
    expect((await reldb.init({ type: 'postgresql', url, database: decodeURIComponent(new URL(url).pathname.slice(1)), pool: { max: 8 } })).success).toBe(true)
    expect((await scheduler.init()).success).toBe(true)
  })
  afterAll(async () => {
    await scheduler.close()
    await reldb.close()
  })
  it('100 轮并发注册与刷新均成功，每轮定义完整持久化且可删除', async () => {
    for (let round = 0; round < 100; round++) {
      const ids = Array.from({ length: 31 }, (_, index) => `definition-${round}-${index}`)
      const pending = ids.map(id => scheduler.register({ id, name: id, cron: '0 0 1 1 *' }))
      const results = await Promise.all([...pending, scheduler.refreshTasks(), scheduler.refreshTasks()])
      expect(results.every(result => result.success)).toBe(true)
      expect((await scheduler.refreshTasks()).success).toBe(true)
      expect(ids.every(id => scheduler.tasks.has(id))).toBe(true)
      expect(await reldb.sql.get('SELECT COUNT(*)::int AS count FROM hai_scheduler_tasks')).toMatchObject({ success: true, data: { count: 31 } })
      expect((await Promise.all(ids.map(id => scheduler.unregister(id)))).every(result => result.success)).toBe(true)
    }
    expect((await scheduler.refreshTasks()).success).toBe(true)
    expect(scheduler.tasks.size).toBe(0)
  }, 180000)
})
