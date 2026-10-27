import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { core } from '@h-ai/core'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { feedback } from '../src/index.js'

let directory: string
const actor = { scopeId: 'notification-mode', userId: 'user', permissions: ['feedback:*'] }
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hai-feedback-modes-'))
  await reach.close()
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await storage.init({ type: 'local', root: directory })).success).toBe(true)
})
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await feedback.close()
  await reach.close()
  await storage.close()
  await reldb.close()
  await rm(directory, { recursive: true, force: true })
})
describe('反馈独立通知策略', () => {
  it.each(['metadata', 'summary'] as const)('consoleContent=%s 只输出选择的字段，业务正文和 URL 不随日志外泄', async (consoleContent) => {
    const output = vi.spyOn(core.logger, 'info')
    expect((await feedback.init({ appId: 'privacy', notificationMode: 'console', consoleContent, workerIntervalMs: 0 })).success).toBe(true)
    const accepted = await feedback.submit({ appId: 'privacy', submissionId: consoleContent, description: 'BUSINESS_SUMMARY_SENTINEL', url: 'https://example.invalid/PRIVATE_PATH_SENTINEL' }, actor)
    expect(accepted.success).toBe(true)
    if (!accepted.success)
      return
    expect((await feedback.completeCollection({ id: accepted.data.id }, actor)).success).toBe(true)
    expect((await feedback.runJobs()).success).toBe(true)
    const serialized = JSON.stringify(output.mock.calls)
    expect(serialized.includes('BUSINESS_SUMMARY_SENTINEL')).toBe(consoleContent === 'summary')
    expect(serialized).not.toContain('PRIVATE_PATH_SENTINEL')
    expect(output).toHaveBeenCalledWith('Feedback notification', expect.objectContaining({ module: 'feedback', number: accepted.data.number, appId: 'privacy' }))
  })

  it.each(['console', 'disabled'] as const)('%s不需要邮箱、Reach或改变其他通知策略', async (notificationMode) => {
    const output = vi.spyOn(core.logger, 'info')
    const send = vi.spyOn(reach, 'send')
    // 只验证反馈通知策略；本机后端在测试环境中已初始化，不声称生产共享后端验收。
    vi.stubEnv('NODE_ENV', 'production')
    const initialized = await feedback.init({ appId: 'mode-test', notificationMode, workerIntervalMs: 0 })
    expect(initialized.success).toBe(true)
    expect(reach.isInitialized).toBe(false)
    const accepted = await feedback.submit({ appId: 'mode-test', submissionId: notificationMode, description: 'A diagnostic summary' }, actor)
    expect(accepted.success).toBe(true)
    if (!accepted.success)
      return
    expect((await feedback.completeCollection({ id: accepted.data.id }, actor)).success).toBe(true)
    expect((await feedback.runJobs()).success).toBe(true)
    const detail = await feedback.get(accepted.data.id, actor)
    expect(detail.success).toBe(true)
    if (!detail.success)
      return
    expect(detail.data.report.notificationStatus).toBe(notificationMode === 'disabled' ? 'disabled' : 'sent')
    expect(send).not.toHaveBeenCalled()
    expect(detail.data.jobs.filter(job => job.type === 'notify')).toHaveLength(notificationMode === 'disabled' ? 0 : 1)
    if (notificationMode === 'console')
      expect(output).toHaveBeenCalledWith('Feedback notification', expect.objectContaining({ number: accepted.data.number }))
    expect(JSON.stringify(output.mock.calls.filter(([message]) => message === 'Feedback notification'))).not.toContain('A diagnostic summary')
  })

  it('配置错误只报告模块和字段路径，不携带错误配置的私密值', async () => {
    const initialized = await feedback.init({ appId: '', notificationMode: 'reach', recipients: [], notificationProvider: 'PRIVATE_CONFIG_SENTINEL' })
    expect(initialized).toMatchObject({ success: false, error: { ext: { module: 'feedback', fields: ['appId', 'recipients'] } } })
    expect(JSON.stringify(initialized)).not.toContain('PRIVATE_CONFIG_SENTINEL')
  })

  it('总预算在受理前拒绝超量附件，空附件反馈仍可完整导出', async () => {
    expect((await feedback.init({ appId: 'budget', notificationMode: 'disabled', maxTotalBytes: 4 * 1048576, workerIntervalMs: 0 })).success).toBe(true)
    const input = { appId: 'budget', submissionId: 'too-many-bytes', attachments: [1, 2].map(id => ({ id: String(id), name: `${id}.webm`, contentType: 'video/webm', checksum: '0'.repeat(64), size: 1048576 })) }
    expect((await feedback.submit(input, actor)).success).toBe(false)
    expect(await reldb.sql.get('SELECT COUNT(*) AS count FROM hai_feedback_reports')).toMatchObject({ success: true, data: { count: 0 } })
    const accepted = await feedback.submit({ appId: 'budget', submissionId: 'exportable' }, actor)
    expect(accepted.success).toBe(true)
    if (!accepted.success)
      return
    await feedback.completeCollection({ id: accepted.data.id }, actor)
    const job = await feedback.export({ id: accepted.data.id }, actor)
    expect(job.success).toBe(true)
    if (!job.success)
      return
    await feedback.runJobs()
    expect((await feedback.getExport({ id: accepted.data.id, jobId: job.data.id }, actor)).success).toBe(true)
  })
})

it('reach 免打扰保留反馈自己的等待任务，不创建第二个延迟队列', async () => {
  const hour = new Date().getHours()
  const start = `${String((hour + 23) % 24).padStart(2, '0')}:00`
  const end = `${String((hour + 1) % 24).padStart(2, '0')}:00`
  expect((await reach.init({ providers: [{ name: 'channel', type: 'console' }], dnd: { enabled: true, strategy: 'delay', start, end } })).success).toBe(true)
  expect((await feedback.init({ appId: 'dnd', notificationMode: 'reach', recipients: ['ops-channel'], notificationProvider: 'channel', workerIntervalMs: 0 })).success).toBe(true)
  const submitted = await feedback.submit({ appId: 'dnd', submissionId: 'wait-own-outbox' }, actor)
  expect(submitted.success).toBe(true)
  if (!submitted.success)
    return
  await feedback.completeCollection({ id: submitted.data.id }, actor)
  expect((await feedback.runJobs()).success).toBe(true)
  const detail = await feedback.get(submitted.data.id, actor)
  expect(detail).toMatchObject({ success: true, data: { report: { notificationStatus: 'deferred' } } })
  if (detail.success)
    expect(detail.data.jobs.find(job => job.type === 'notify')?.attempts).toBe(0)
  expect(await reldb.sql.get('SELECT COUNT(*) AS count FROM hai_reach_send_log')).toMatchObject({ success: true, data: { count: 0 } })
})
