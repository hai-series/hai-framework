import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { feedback } from '../src/index.js'

let root: string
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'hai-feedback-test-'))
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await storage.init({ type: 'local', root })).success).toBe(true)
  expect((await reach.init({ providers: [{ name: 'email', type: 'console' }] })).success).toBe(true)
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
  const result = await feedback.init({ appId: 'feedback-test', recipients: ['admin@example.test'], notificationProvider: 'email', adminUrl: 'http://localhost/admin/feedback', workerIntervalMs: 0 })
  expect(result.success).toBe(true)
  expect(feedback.isInitialized).toBe(true)
  const table = await reldb.sql.get('SELECT COUNT(*) AS count FROM hai_feedback_reports')
  expect(table.success).toBe(true)
  expect((await feedback.close()).success).toBe(true)
  expect(feedback.isInitialized).toBe(false)
})
