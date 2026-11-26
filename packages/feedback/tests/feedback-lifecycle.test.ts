import type { QueryRow } from '@h-ai/reldb'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { feedback, HaiFeedbackError } from '../src/index.js'

let root: string
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'hai-feedback-test-'))
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await storage.init({ type: 'local', root })).success).toBe(true)
  expect((await reach.init({
    providers: [
      { name: 'email', type: 'console' },
    ],
  })).success).toBe(true)
})
afterAll(async () => {
  await feedback.close()
  await reach.close()
  await storage.close()
  await reldb.close()
  if (root)
    await rm(root, { recursive: true, force: true })
})

it('前置服务已就绪时建立反馈存储，关闭后恢复未初始化状态', async () => {
  const result = await feedback.init({
    appId: 'feedback-test',
    notification: {
      recipients: ['admin@example.test'],
      provider: 'email',
      adminUrl: 'http://localhost/admin/feedback',
    },
    worker: { intervalMs: 0 },
  })
  expect(result.success).toBe(true)
  expect(feedback.isInitialized).toBe(true)
  const table = await reldb.sql.get('SELECT COUNT(*) AS count FROM hai_feedback_reports')
  expect(table.success).toBe(true)
  expect((await feedback.close()).success).toBe(true)
  expect(feedback.isInitialized).toBe(false)
})

it('并发关闭等待同一个 worker 排空，关闭完成前不能重启', async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const original = reldb.sql.query
  const scan = vi.spyOn(reldb.sql, 'query').mockImplementation(async <T = QueryRow>(sql: string, params?: unknown[]) => {
    if (sql.startsWith('SELECT id, report_id, scope_id, kind FROM hai_feedback_jobs')) {
      entered.resolve()
      await release.promise
    }
    return original<T>(sql, params)
  })
  const config = {
    appId: 'feedback-close-drain',
    notification: { mode: 'disabled' as const },
    worker: { intervalMs: 1 },
  }
  try {
    expect((await feedback.init(config)).success).toBe(true)
    await entered.promise
    let closed = false
    const first = feedback.close()
    const second = feedback.close().then((result) => {
      closed = true
      return result
    })
    await setImmediate()
    expect(closed).toBe(false)
    expect(await feedback.init(config)).toMatchObject({
      success: false,
      error: { code: HaiFeedbackError.INIT_IN_PROGRESS.code },
    })
    release.resolve()
    expect((await first).success).toBe(true)
    expect((await second).success).toBe(true)
  }
  finally {
    release.resolve()
    scan.mockRestore()
    await feedback.close()
  }
})
