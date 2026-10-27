/** 真 PG/Redis/S3 + HTTP 认证，验证进程崩溃接管与 Webhook 持久幂等。 */
import type { HaiResult } from '@h-ai/core'
import type { FeedbackWebhookEvent } from '@h-ai/feedback'
import type { DbTestEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import type { StorageTestEnv } from '../../storage/tests/helpers/storage-test-suite.js'
import { Buffer } from 'node:buffer'
import { fork } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:http'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { audit } from '@h-ai/audit'
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { feedback } from '@h-ai/feedback'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { expect, it, vi } from 'vitest'
import { acquireRedisContainer } from '../../iam/tests/helpers/redis-container.js'
import { postgresEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { s3Env } from '../../storage/tests/helpers/storage-test-suite.js'
import { createFeedbackProcedures } from '../src/features/serv-feature-feedback.js'
import { serv } from '../src/serv-main.js'

async function deadline<T>(promise: Promise<T>, ms = 30000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Production feedback fixture timed out')), ms)
    })])
  }
  finally {
    clearTimeout(timer)
  }
}
function worker(configuration: object) {
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:HAI_|PUBLIC_|VITE_)/i.test(key)))
  const child = fork(fileURLToPath(new URL('./fixtures/feedback-production-node.mjs', import.meta.url)), { env: { ...environment, NODE_ENV: 'production', HAI_CORE_ENV: 'production', FEEDBACK_PRODUCTION_FIXTURE: JSON.stringify(configuration) }, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
  let sequence = 0
  const pending = new Map<number, { resolve: (result: unknown) => void, reject: (error: Error) => void }>()
  const ready = Promise.withResolvers<void>()
  const business = Promise.withResolvers<void>()
  const closed = Promise.withResolvers<void>()
  void ready.promise.catch(() => {})
  void business.promise.catch(() => {})
  child.on('message', (message: unknown) => {
    if (!message || typeof message !== 'object')
      return
    if ('phase' in message) {
      if (message.phase === 'ready')
        ready.resolve()
      if (message.phase === 'business-started')
        business.resolve()
      if (message.phase === 'failed')
        ready.reject(new Error('Production feedback worker initialization failed'))
    }
    if ('id' in message && typeof message.id === 'number') {
      const call = pending.get(message.id)
      pending.delete(message.id)
      if ('result' in message)
        call?.resolve(message.result)
      else call?.reject(new Error('Production feedback worker command failed'))
    }
  })
  child.once('error', (error) => {
    ready.reject(error)
    business.reject(error)
  })
  child.once('close', () => {
    closed.resolve()
    const failure = new Error('Production feedback worker exited')
    ready.reject(failure)
    business.reject(failure)
    for (const call of pending.values()) call.reject(failure)
    pending.clear()
  })
  return {
    child,
    ready: () => deadline(ready.promise),
    business: () => deadline(business.promise),
    closed: closed.promise,
    async call(action: string): Promise<HaiResult<{ processed: number }>> {
      const id = ++sequence
      const result = new Promise<unknown>((resolve, reject) => pending.set(id, { resolve, reject }))
      child.send({ id, action })
      // 固定测试进程的 IPC 包络；后续逐项检查结果和共享数据库状态。
      return await deadline(result) as HaiResult<{ processed: number }>
    },
  }
}

it('生产PG+Redis+S3：采集进程崩溃后接管，HTTP超时及重启后Webhook正文/键不变且接收方只应用一次', async () => {
  let database: DbTestEnv | undefined
  let objects: StorageTestEnv | undefined
  let redis: Awaited<ReturnType<typeof acquireRedisContainer>> | undefined
  let http: ReturnType<typeof serv.listen> | undefined
  const nodes: ReturnType<typeof worker>[] = []
  const previousLevel = core.logger.getLevel()
  const contract = apiContract.create({ feedback: apiContract.feedback })
  const client = apiClient.create(contract)
  const requests: Array<{ body: string, id: string, signature: string, timestamp: string }> = []
  const secret = 'synthetic-feedback-receiver-key'
  const receiver = createServer((request, response) => {
    void (async () => {
      let body = ''
      for await (const chunk of request) body += String(chunk)
      const event: FeedbackWebhookEvent = JSON.parse(body)
      requests.push({ body, id: String(request.headers['idempotency-key']), signature: String(request.headers['x-hai-feedback-signature']), timestamp: String(request.headers['x-hai-feedback-timestamp']) })
      const inserted = await reldb.sql.execute('INSERT INTO hai_fixture_webhook_receipts (event_id, body) VALUES (?, ?) ON CONFLICT(event_id) DO NOTHING', [event.eventId, body])
      if (!inserted.success)
        throw new Error('Receiver persistence failed')
      // 第一次已经可靠接收，但故意丢失 HTTP 回执，模拟结果未知。
      if (requests.length > 1)
        response.writeHead(204).end()
    })().catch(() => response.writeHead(500).end())
  })
  try {
    core.logger.setLevel('fatal')
    database = await postgresEnv()
    redis = await acquireRedisContainer()
    objects = await s3Env('rustfs')
    const sharedCache = { type: 'redis' as const, host: redis.host, port: redis.port }
    expect((await reldb.init(database.config)).success).toBe(true)
    expect((await cache.init(sharedCache)).success).toBe(true)
    expect((await storage.init(objects.config)).success).toBe(true)
    expect((await audit.init()).success).toBe(true)
    expect((await iam.init({ seedDefaultData: false, rbac: { defaultRole: '' } })).success).toBe(true)
    const permission = await iam.authz.createPermission({ code: 'feedback:*', name: 'Feedback fixture management' })
    if (!permission.success)
      throw new Error('Permission fixture failed')
    const role = await iam.authz.createRole({ code: 'feedback-process', name: 'Feedback process', permissionIds: [permission.data.id] })
    const user = await iam.user.createUser({ username: 'production-feedback-user', password: 'FixturePassword123!' })
    if (!role.success || !user.success)
      throw new Error('Identity fixture failed')
    expect((await iam.authz.assignRole(user.data.user.id, role.data.id)).success).toBe(true)
    const logged = await iam.auth.login({ identifier: user.data.user.username, password: 'FixturePassword123!' })
    if (!logged.success)
      throw new Error('Identity login failed')
    expect((await reldb.sql.execute('CREATE TABLE hai_fixture_webhook_receipts (event_id TEXT PRIMARY KEY, body TEXT NOT NULL)')).success).toBe(true)
    await new Promise<void>(resolve => receiver.listen(0, '127.0.0.1', resolve))
    const receiverAddress = receiver.address()
    if (!receiverAddress || typeof receiverAddress === 'string')
      throw new Error('Receiver did not start')
    const config = { appId: 'production-process-feedback', notificationMode: 'disabled' as const, workerIntervalMs: 0, leaseMs: 1000, webhookTimeoutMs: 250, webhookUrl: `http://127.0.0.1:${receiverAddress.port}/feedback`, webhookSecret: secret }
    expect((await feedback.init(config, { collectEvidence: async () => ({ text: 'Host declares collection capability' }) })).success).toBe(true)
    const app = serv.createApp({ contract, procedures: { feedback: createFeedbackProcedures({ feedback, resolveContext: ({ session }) => ({ scopeId: 'production-scope', userId: session.userId, permissions: session.permissions }) }) }, iam })
    http = serv.listen(app, { host: '127.0.0.1', port: 0 })
    await once(http.server, 'listening')
    const address = http.server.address()
    if (!address || typeof address === 'string')
      throw new Error('HTTP fixture did not start')
    expect((await client.init({ baseUrl: `http://127.0.0.1:${address.port}/api/v1`, auth: { storage: apiClient.tokenStorage.memory() } })).success).toBe(true)
    await client.auth.setTokens(logged.data.tokens)
    const submitted = await client.feedback.reports.submit({ appId: config.appId, submissionId: 'crash-and-restart' })
    if (!submitted.success)
      throw new Error('Authenticated intake failed')
    expect((await client.feedback.reports.completeCollection({ id: submitted.data.id })).success).toBe(true)
    const configuration = { database: database.config, cache: sharedCache, storage: objects.config, feedback: config, accessToken: logged.data.tokens.accessToken }
    nodes.push(worker({ ...configuration, pauseBusiness: true }), worker(configuration))
    await Promise.all(nodes.map(node => node.ready()))
    expect(new Set(nodes.map(node => node.child.pid)).size).toBe(2)
    const interrupted = nodes[0]!.call('run')
    void interrupted.catch(() => {})
    await nodes[0]!.business()
    nodes[0]!.child.kill()
    await deadline(nodes[0]!.closed)
    await expect(interrupted).rejects.toThrow('exited')
    await vi.waitFor(async () => {
      const expired = await reldb.sql.get<{ expired: boolean }>('SELECT lease_until < (FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint) AS expired FROM hai_feedback_jobs WHERE report_id = ? AND kind = ?', [submitted.data.id, 'collect'])
      expect(expired.success && expired.data?.expired).toBe(true)
    }, { timeout: 5000 })
    for (let round = 0; round < 4 && !requests.length; round++) {
      expect((await reldb.sql.execute('UPDATE hai_feedback_jobs SET next_run_at = 0 WHERE status = ? AND kind <> ?', ['pending', 'cleanup'])).success).toBe(true)
      expect((await nodes[1]!.call('run')).success).toBe(true)
    }
    expect(requests).toHaveLength(1)
    const detail = await client.feedback.reports.get({ id: submitted.data.id })
    if (!detail.success)
      throw new Error('Shared detail missing')
    expect(detail.data.report.collectionStatus).not.toBe('collecting')
    expect(detail.data.attachments).toEqual([expect.objectContaining({ name: 'diagnostics.gz', status: 'available' })])
    const attachment = await client.feedback.attachments.get({ id: submitted.data.id, attachmentId: detail.data.attachments[0]!.id })
    expect(attachment.success).toBe(true)
    if (attachment.success)
      expect(gunzipSync(Buffer.from(attachment.data.dataBase64, 'base64')).toString()).toBe('Stable cross-node diagnostic attachment')
    expect((await client.feedback.reports.getEvidence({ id: submitted.data.id, kind: 'business' }))).toMatchObject({ success: true, data: { total: 1 } })
    expect((await client.feedback.reports.setStatus({ id: submitted.data.id, status: 'handled', expectedVersion: detail.data.report.version })).success).toBe(true)
    nodes[1]!.child.kill()
    await deadline(nodes[1]!.closed)
    nodes.push(worker(configuration))
    await nodes[2]!.ready()
    expect((await reldb.sql.execute('UPDATE hai_feedback_jobs SET next_run_at = 0 WHERE kind = ? AND status = ?', ['webhook', 'pending'])).success).toBe(true)
    expect((await nodes[2]!.call('run')).success).toBe(true)
    expect(requests).toHaveLength(2)
    expect(requests[1]!.id).toBe(requests[0]!.id)
    expect(requests[1]!.body).toBe(requests[0]!.body)
    for (const request of requests)
      expect(request.signature).toBe(`sha256=${createHmac('sha256', secret).update(`${request.timestamp}.${request.body}`).digest('hex')}`)
    expect(await reldb.sql.get('SELECT COUNT(*)::int AS count FROM hai_fixture_webhook_receipts')).toMatchObject({ success: true, data: { count: 1 } })
    const final = await client.feedback.reports.get({ id: submitted.data.id })
    expect(final.success && final.data.jobs.find(job => job.type === 'webhook')?.status).toBe('succeeded')
  }
  finally {
    const cleanups: Array<() => Promise<unknown>> = [
      ...nodes.map(node => async () => {
        try {
          if (node.child.connected)
            await node.call('close')
        }
        finally {
          if (node.child.exitCode === null)
            node.child.kill()
          await deadline(node.closed)
        }
      }),
      () => client.close(),
      async () => http?.close(),
      async () => {
        receiver.closeAllConnections()
        if (receiver.listening)
          await new Promise<void>(resolve => receiver.close(() => resolve()))
      },
      () => feedback.close(),
      () => iam.close(),
      () => audit.close(),
      () => storage.close(),
      () => cache.close(),
      () => reldb.close(),
      async () => objects?.cleanup?.(),
      async () => redis?.release(),
      async () => database?.release?.(),
    ]
    const failures: number[] = []
    for (const [index, cleanup] of cleanups.entries()) {
      try {
        await cleanup()
      }
      catch {
        failures.push(index)
      }
    }
    core.logger.setLevel(previousLevel)
    expect(failures).toEqual([])
  }
}, 180000)
