/** fresh dist + 两个独立 Node 进程，避免同一单例的在途 Promise 掩盖多节点争抢。 */
import type { ChildProcess } from 'node:child_process'
import type { DbTestEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { fork } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { core } from '@h-ai/core'
import { reach } from '@h-ai/reach'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { describe, expect, it } from 'vitest'
import { mysqlEnv, postgresEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { feedback } from '../src/index.js'
import { createFeedbackSmtpFixture } from './helpers/feedback-smtp-fixture.js'

async function deadline<T>(operation: Promise<T>, ms = 30000): Promise<T> {
  const controller = new AbortController()
  try {
    return await Promise.race([operation, delay(ms, undefined, { signal: controller.signal }).then(() => {
      throw new Error('Feedback process fixture timed out')
    })])
  }
  finally { controller.abort() }
}

function worker(configuration: object) {
  const ready = Promise.withResolvers<void>()
  const closed = Promise.withResolvers<number | null>()
  const completed = Promise.withResolvers<{ pid: number, processed: number }>()
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:HAI_|PUBLIC_|VITE_)/i.test(key)))
  const child = fork(fileURLToPath(new URL('./fixtures/feedback-worker.mjs', import.meta.url)), {
    env: { ...environment, HAI_FEEDBACK_PROCESS_FIXTURE: JSON.stringify(configuration) },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  // 消费管道以避免子进程阻塞，不把潜在 SDK 配置/凭据复制到测试报告。
  child.stdout?.on('data', () => {})
  child.stderr?.on('data', () => {})
  let finished = false
  child.on('message', (message: unknown) => {
    if (!message || typeof message !== 'object' || !('phase' in message))
      return
    if (message.phase === 'ready')
      ready.resolve()
    if (message.phase === 'finished' && 'pid' in message && typeof message.pid === 'number' && 'processed' in message && typeof message.processed === 'number') {
      finished = true
      completed.resolve({ pid: message.pid, processed: message.processed })
    }
    if (message.phase === 'failed') {
      // 仅展示夹具静态阶段和白名单错误码，不打印 SQL、驱动消息或连接配置。
      const stage = 'stage' in message && typeof message.stage === 'string' && /^[a-z-]{1,32}$/.test(message.stage) ? message.stage : 'unknown'
      const code = 'code' in message && typeof message.code === 'string' && /^(?:hai:[\w-]+:\d{3}|fixture:worker-failed)$/.test(message.code) ? message.code : 'unknown'
      const causes = 'causes' in message && Array.isArray(message.causes) ? message.causes.filter((entry: unknown) => typeof entry === 'string' && /^(?:hai:[\w-]+:\d{3}|ER_[A-Z_]+)$/.test(entry)).slice(0, 5) : []
      const error = new Error(`Feedback worker failed at ${stage}: ${code}; causes=${causes.join(',')}`)
      ready.reject(error)
      completed.reject(error)
    }
  })
  child.once('error', (error) => {
    ready.reject(error)
    completed.reject(error)
  })
  child.once('close', (code) => {
    closed.resolve(code)
    if (code !== 0 || !finished) {
      const error = new Error(`Feedback worker exited without success (${code})`)
      ready.reject(error)
      completed.reject(error)
    }
  })
  void ready.promise.catch(() => {})
  void completed.promise.catch(() => {})
  return { child, ready: ready.promise, closed: closed.promise, completed: completed.promise }
}

describe.sequential('真实双Node反馈任务协调', () => {
  for (const [label, setup] of [['postgresql', postgresEnv], ['mysql', mysqlEnv]] as const) {
    it(`${label}: 两个进程同时claim，只有一个通知任务成功且SMTP只收到一封`, async () => {
      let environment: DbTestEnv | undefined
      let directory: string | undefined
      const smtp = createFeedbackSmtpFixture()
      const workers: Array<ReturnType<typeof worker>> = []
      const previousLevel = core.logger.getLevel()
      core.logger.setLevel('fatal')
      try {
        environment = await setup()
        directory = await mkdtemp(join(tmpdir(), `hai-feedback-two-nodes-${label}-`))
        const port = await smtp.start()
        const storageConfig = { type: 'local' as const, root: directory }
        const reachConfig = { providers: [{ name: 'email', type: 'smtp' as const, host: '127.0.0.1', port, secure: false, from: 'feedback@example.test' }] }
        const feedbackConfig = { appId: `process-coordination-${label}`, recipients: ['admin@example.test'], notificationProvider: 'email', adminUrl: 'http://localhost/admin/feedback', workerIntervalMs: 0, leaseMs: 5000 }
        expect((await reldb.init(environment.config)).success).toBe(true)
        expect((await storage.init(storageConfig)).success).toBe(true)
        expect((await reach.init(reachConfig)).success).toBe(true)
        expect((await feedback.init(feedbackConfig)).success).toBe(true)
        const actor = { scopeId: 'shared-tenant', userId: 'user-1', permissions: ['feedback:*'] }
        const report = await feedback.submit({ submissionId: 'concurrent-claim', appId: feedbackConfig.appId }, actor)
        expect(report.success).toBe(true)
        if (!report.success)
          return
        expect((await feedback.completeCollection({ id: report.data.id }, actor)).success).toBe(true)
        const configuration = { database: environment.config, storage: storageConfig, reach: reachConfig, feedback: feedbackConfig }
        workers.push(worker(configuration), worker(configuration))
        await deadline(Promise.all(workers.map(item => item.ready)))
        expect(new Set(workers.map(item => item.child.pid)).size).toBe(2)
        for (const item of workers) item.child.send({ action: 'run' })
        const results = await deadline(Promise.all(workers.map(item => item.completed)))
        const exitCodes = await deadline(Promise.all(workers.map(item => item.closed)))
        expect(exitCodes).toEqual([0, 0])
        expect(results.every(result => result.processed >= 0)).toBe(true)
        const detail = await feedback.get(report.data.id, actor)
        expect(detail.success).toBe(true)
        if (detail.success) {
          expect(detail.data.jobs.filter(job => job.type === 'notify')).toHaveLength(1)
          expect(detail.data.jobs.find(job => job.type === 'notify')?.status).toBe('succeeded')
          expect(detail.data.report.notificationStatus).toBe('sent')
        }
        expect(smtp.messages).toHaveLength(1)
        expect(smtp.messages[0]).toContain('admin@example.test')
      }
      finally {
        for (const item of workers) {
          const child: ChildProcess = item.child
          if (child.exitCode === null && child.signalCode === null)
            child.kill()
        }
        await Promise.all(workers.map(item => deadline(item.closed, 10000)))
        await feedback.close()
        await reach.close()
        await storage.close()
        await reldb.close()
        await smtp.close()
        if (directory)
          await rm(directory, { recursive: true, force: true })
        await environment?.release?.()
        core.logger.setLevel(previousLevel)
      }
    }, 180000)
  }
})
