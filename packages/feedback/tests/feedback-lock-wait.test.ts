/** 真实 PostgreSQL/MySQL 锁等待；不使用工作节点墙钟作为租约接受依据。 */
import type { DmlWithTxOperations } from '@h-ai/reldb'
import type { DbTestEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { core, ok } from '@h-ai/core'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { mysqlEnv, postgresEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { feedback } from '../src/index.js'

async function checkpoint(promise: Promise<unknown>): Promise<void> {
  const controller = new AbortController()
  try {
    await Promise.race([promise, delay(10000, undefined, { signal: controller.signal }).then(() => {
      throw new Error('Database checkpoint timed out')
    })])
  }
  finally { controller.abort() }
}

for (const [label, setup] of [['postgresql', postgresEnv], ['mysql', mysqlEnv]] as const) {
  describe.sequential(`feedback ${label} database locking`, () => {
    let environment: DbTestEnv | undefined
    let directory: string | undefined
    const actor = { scopeId: 'lock-scope', userId: 'lock-user', permissions: ['feedback:*'] }
    const config = { appId: `lock-wait-${label}`, recipients: ['admin@example.test'], notificationProvider: 'email', adminUrl: 'http://localhost/admin/feedback', workerIntervalMs: 0, collectionTimeoutMs: 60000, leaseMs: 1000 }
    let previousLevel = core.logger.getLevel()

    beforeAll(async () => {
      previousLevel = core.logger.getLevel()
      core.logger.setLevel('fatal')
      environment = await setup()
      directory = await mkdtemp(join(tmpdir(), `hai-feedback-${label}-locks-`))
      expect((await reldb.init(environment.config)).success).toBe(true)
      expect((await storage.init({ type: 'local', root: directory })).success).toBe(true)
      expect((await reach.init({ providers: [{ name: 'email', type: 'console' }] })).success).toBe(true)
      expect((await feedback.init(config)).success).toBe(true)
    }, 180000)

    afterEach(() => {
      vi.restoreAllMocks()
    })
    afterAll(async () => {
      try {
        await feedback.close()
        await reach.close()
        await storage.close()
        await reldb.close()
        if (directory)
          await rm(directory, { recursive: true, force: true })
      }
      finally {
        await environment?.release?.()
        core.logger.setLevel(previousLevel)
      }
    }, 60000)

    it('最终提交真实等待行锁跨过租约截止后，旧worker仍不得提交已发送', async () => {
      const smtpEntered = Promise.withResolvers<void>()
      const releaseSmtp = Promise.withResolvers<void>()
      const committing = Promise.withResolvers<void>()
      const send = vi.spyOn(reach, 'send').mockImplementation(async () => {
        smtpEntered.resolve()
        await releaseSmtp.promise
        return ok({ success: true, messageId: 'accepted-before-lock-wait' })
      })
      const report = await feedback.submit({ submissionId: 'lease-crosses-db-lock', appId: config.appId }, actor)
      expect(report.success).toBe(true)
      if (!report.success)
        return
      expect((await feedback.completeCollection({ id: report.data.id }, actor)).success).toBe(true)
      let held: DmlWithTxOperations | undefined
      const worker = feedback.runJobs()
      try {
        await checkpoint(smtpEntered.promise)
        const job = await reldb.sql.get<{ id: string }>('SELECT id FROM hai_feedback_jobs WHERE report_id = ? AND kind = \'notify\'', [report.data.id])
        expect(job.success && job.data).toBeTruthy()
        if (!job.success || !job.data)
          return
        const started = await reldb.tx.begin()
        expect(started.success).toBe(true)
        if (!started.success)
          return
        held = started.data
        expect((await held.get('SELECT id FROM hai_feedback_jobs WHERE id = ? FOR UPDATE', [job.data.id])).success).toBe(true)
        const now = label === 'postgresql' ? '(FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint)' : '(CAST(UNIX_TIMESTAMP(SYSDATE(3)) * 1000 AS UNSIGNED))'
        expect((await held.execute(`UPDATE hai_feedback_jobs SET lease_until = ${now} + 300 WHERE id = ?`, [job.data.id])).success).toBe(true)
        const execute = reldb.sql.execute
        vi.spyOn(reldb.sql, 'execute').mockImplementation((sql, params) => {
          if (sql.startsWith('UPDATE hai_feedback_jobs SET status = ?') && sql.includes('token = NULL'))
            committing.resolve()
          return execute(sql, params)
        })
        releaseSmtp.resolve()
        await checkpoint(committing.promise)
        // UPDATE 已发出且 notify 行被独立事务持锁；此等待真实跨越数据库租约。
        await delay(1100)
        expect((await held.commit()).success).toBe(true)
        held = undefined
      }
      finally {
        releaseSmtp.resolve()
        if (held)
          await held.rollback()
        await worker
      }
      expect(send).toHaveBeenCalledTimes(1)
      const detail = await feedback.get(report.data.id, actor)
      expect(detail.success).toBe(true)
      if (detail.success) {
        expect(detail.data.report.notificationStatus).not.toBe('sent')
        expect(detail.data.jobs.find(job => job.type === 'notify')?.status).not.toBe('succeeded')
      }
    }, 30000)

    it('导出等待同一report行锁后读取已提交的清理标记，不生成失效快照', async () => {
      const report = await feedback.submit({ submissionId: 'snapshot-report-row-lock', appId: config.appId }, actor)
      expect(report.success).toBe(true)
      if (!report.success)
        return
      const started = await reldb.tx.begin()
      expect(started.success).toBe(true)
      if (!started.success)
        return
      let held: DmlWithTxOperations | undefined = started.data
      let exported: ReturnType<typeof feedback.export> | undefined
      try {
        expect((await held.get('SELECT id FROM hai_feedback_reports WHERE id = ? FOR UPDATE', [report.data.id])).success).toBe(true)
        expect((await held.execute('UPDATE hai_feedback_reports SET deleting = 1 WHERE id = ?', [report.data.id])).success).toBe(true)
        exported = feedback.export({ id: report.data.id }, actor)
        let completed = false
        void exported.then(() => {
          completed = true
        })
        await delay(150)
        expect(completed).toBe(false)
        expect((await held.commit()).success).toBe(true)
        held = undefined
        expect((await exported).success).toBe(false)
        expect((await feedback.get(report.data.id, actor)).success).toBe(false)
      }
      finally {
        if (held)
          await held.rollback()
        await exported
      }
    }, 30000)
  })
}
