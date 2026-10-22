import type { RequestListener, Server } from 'node:http'
import type { ReachProvider } from '../src/providers/reach-provider-types.js'
import type { SendLogRepository, StoredSendLog } from '../src/repositories/reach-repository-send-log.js'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createServer as createSmtpServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ok } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiProviderConfigSchema, HaiReachError, reach, SmtpProviderConfigSchema } from '../src/index.js'
import { createApiProvider } from '../src/providers/reach-provider-api.js'
import { createConsoleProvider } from '../src/providers/reach-provider-console.js'
import { createSmtpProvider } from '../src/providers/reach-provider-smtp.js'
import { deliverClaimedMessage } from '../src/reach-delivery.js'
import { createSendLogRepository } from '../src/repositories/reach-repository-send-log.js'

let repository: SendLogRepository
const servers: Server[] = []
const providers: ReachProvider[] = []
const temporaryRoot = fileURLToPath(new URL('../tmp/', import.meta.url))
let temporary: string
let database: string

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function queued(owner: string, lockMs = 10_000): Promise<StoredSendLog> {
  const result = await reach.send({ provider: 'job', to: 'test@example.invalid', body: 'one external effect' })
  if (!result.success)
    throw new Error(result.error.message)
  const claimed = await repository.claimPendingBatch(owner, { limit: 1, lockMs })
  if (!claimed.success || claimed.data.length !== 1)
    throw new Error('Queue claim failed')
  return claimed.data[0]
}

async function claimed(owner: string, lockMs = 10_000): Promise<StoredSendLog> {
  const result = await repository.claimPendingBatch(owner, { limit: 1, lockMs })
  if (!result.success || result.data.length !== 1)
    throw new Error('Recovery claim failed')
  return result.data[0]
}

async function receiver(handler: RequestListener): Promise<{ url: string, server: Server }> {
  const server = createServer(handler)
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Receiver has no port')
  return { server, url: `http://127.0.0.1:${address.port}` }
}

async function api(url: string): Promise<ReachProvider> {
  const provider = createApiProvider()
  providers.push(provider)
  const connected = await provider.connect(ApiProviderConfigSchema.parse({ name: 'job', type: 'api', url, idempotent: true }))
  if (!connected.success)
    throw new Error(connected.error.message)
  return provider
}

async function initializeServices() {
  const initialized = await reldb.init({ type: 'sqlite', database })
  if (!initialized.success)
    throw new Error(initialized.error.message)
  const initializedReach = await reach.init({
    providers: [{ name: 'job', type: 'console' }],
    dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' },
  })
  if (!initializedReach.success)
    throw new Error(initializedReach.error.message)
  const repo = await createSendLogRepository(reldb)
  if (!repo.success)
    throw new Error(repo.error.message)
  repository = repo.data
  const ledger = await reldb.ddl.createTable('test_receiver_effects', {
    receipt: { type: 'TEXT', primaryKey: true },
    result: { type: 'TEXT', notNull: true },
  })
  if (!ledger.success)
    throw new Error(ledger.error.message)
}

beforeEach(async () => {
  // 只固定免打扰钟点；租约续期与网络继续使用真实时间。
  vi.spyOn(Date.prototype, 'getHours').mockReturnValue(23)
  await mkdir(temporaryRoot, { recursive: true })
  temporary = await mkdtemp(join(temporaryRoot, 'reach-delivery-'))
  database = join(temporary, 'delivery.sqlite')
  await initializeServices()
})

afterEach(async () => {
  for (const provider of providers.splice(0))
    await provider.close()
  for (const server of servers.splice(0)) {
    if (server.listening) {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  }
  await reach.close()
  await reldb.close()
  vi.restoreAllMocks()
  // mkdtemp 的绝对路径位于本包临时目录；关闭所有连接后才删除本次创建的文件。
  await rm(temporary, { recursive: true, force: true })
})

describe.sequential('delivery ownership and external effects', () => {
  it.each([400, 401, 403, 404, 422, 408, 425, 429, 503])('真实 HTTP %i 的永久拒绝与暂时故障使用不同重试策略', async (status) => {
    const endpoint = await receiver((_request, response) => response.writeHead(status).end())
    const row = await queued('http-status')
    const provider = await api(endpoint.url)
    expect((await deliverClaimedMessage(row, 'http-status', provider, repository)).success).toBe(false)
    const permanent = [400, 401, 403, 404, 422].includes(status)
    expect(await reach.queue.get(row.queueId!)).toMatchObject({
      success: true,
      data: { status: permanent ? 'dead' : 'pending', attemptCount: 1, lastFailure: permanent ? 'permanent_rejection' : 'transient_failure' },
    })
  })

  it('节点启动时尚未过期的幂等在途消息，在 DND 外的后续周期仍会恢复', async () => {
    const row = await queued('previous', 1000)
    expect((await repository.beginDelivery(row.id, 'previous', true, 1000)).success).toBe(true)
    await reach.close()
    vi.mocked(Date.prototype.getHours).mockReturnValue(9)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const initialized = await reach.init({
        providers: [{ name: 'job', type: 'console' }],
        dnd: { enabled: true, strategy: 'delay', start: '22:00', end: '08:00' },
      })
      expect(initialized.success).toBe(true)
      await vi.advanceTimersByTimeAsync(0)
      expect(await reach.queue.get(row.queueId!)).toMatchObject({ success: true, data: { status: 'sending' } })
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_001)
      await vi.advanceTimersByTimeAsync(60_001)
      expect(await reach.queue.get(row.queueId!)).toMatchObject({ success: true, data: { status: 'sent' } })
    }
    finally {
      await reach.close()
      vi.useRealTimers()
    }
  })

  it('队列管理校验回执与生命周期，不公开收件人或正文', async () => {
    expect((await reach.queue.get('invalid-receipt')).success).toBe(false)
    expect(await reach.queue.get(crypto.randomUUID())).toMatchObject({ success: true, data: null })
    const row = await queued('worker')
    const state = await reach.queue.get(row.queueId!)
    expect(state.success).toBe(true)
    if (state.success) {
      expect(state.data).not.toHaveProperty('body')
      expect(state.data).not.toHaveProperty('toAddr')
    }
    await reach.close()
    const closed = await reach.queue.get(row.queueId!)
    expect(closed.success).toBe(false)
    if (!closed.success)
      expect(closed.error.code).toBe(HaiReachError.NOT_INITIALIZED.code)
  })
  it('旧 owner 在发送前恢复时，持久化门闩拒绝其外部调用和续租', async () => {
    const row = await queued('old', 1000)
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1001)
    const recovered = await claimed('new')
    const provider = createConsoleProvider()
    expect((await provider.connect({ name: 'job', type: 'console' })).success).toBe(true)
    const send = vi.spyOn(provider, 'send')
    const stale = await deliverClaimedMessage(row, 'old', provider, repository)
    expect(stale.success).toBe(false)
    expect(send).not.toHaveBeenCalled()
    expect((await repository.renewClaim(row.id, 'old')).success).toBe(false)
    expect((await deliverClaimedMessage(recovered, 'new', provider, repository)).success).toBe(true)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('慢 Provider 在途续租，第二消费者经过原租约期限仍不能重领', async () => {
    const row = await queued('first', 1000)
    const started = deferred<void>()
    const completed = deferred<void>()
    const provider: ReachProvider = {
      ...createConsoleProvider(),
      isConnected: () => true,
      send: async () => {
        started.resolve()
        await completed.promise
        return ok({ success: true })
      },
    }
    const renew = vi.spyOn(repository, 'renewClaim')
    const initialDeadline = Date.now() + 1000
    const delivery = deliverClaimedMessage(row, 'first', provider, repository, 1000)
    try {
      await started.promise
      await vi.waitFor(() => expect(Date.now()).toBeGreaterThan(initialDeadline), { timeout: 5000 })
      expect(renew).toHaveBeenCalled()
      expect(await repository.claimPendingBatch('second')).toMatchObject({ success: true, data: [] })
    }
    finally {
      completed.resolve()
      expect((await delivery).success).toBe(true)
    }
  })

  it('旧在途 API 恢复与新消费者并发时，真实 HTTP 接收端按持久键只产生一次副作用', async () => {
    const firstReceived = deferred<void>()
    const releaseFirst = deferred<void>()
    let requests = 0
    const endpoint = await receiver(async (request, response) => {
      requests += 1
      const ordinal = requests
      const receipt = request.headers['idempotency-key']
      if (typeof receipt !== 'string') {
        response.writeHead(400).end()
        return
      }
      // 唯一键插入本身就是接收端的持久副作用；原子约束同时完成去重。
      const inserted = await reldb.sql.execute(
        'INSERT INTO test_receiver_effects (receipt, result) VALUES (?, ?) ON CONFLICT(receipt) DO NOTHING',
        [receipt, 'delivered'],
      )
      if (!inserted.success) {
        response.writeHead(503).end()
        return
      }
      if (ordinal === 1) {
        firstReceived.resolve()
        await releaseFirst.promise
      }
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ messageId: 'one-durable-effect' }))
    })
    const row = await queued('old')
    const oldProvider = await api(endpoint.url)
    const newProvider = await api(endpoint.url)
    const oldDelivery = deliverClaimedMessage(row, 'old', oldProvider, repository, 10_000)
    try {
      await firstReceived.promise
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 20_000)
      const recovered = await claimed('new')
      expect((await deliverClaimedMessage(recovered, 'new', newProvider, repository)).success).toBe(true)
    }
    finally {
      releaseFirst.resolve()
      expect((await oldDelivery).success).toBe(false)
    }
    expect(requests).toBe(2)
    const effects = await reldb.sql.query('SELECT receipt FROM test_receiver_effects')
    expect(effects).toMatchObject({ success: true, data: [{ receipt: row.queueId }] })
    expect(await reach.queue.get(row.queueId!)).toMatchObject({ success: true, data: { status: 'sent', messageId: 'one-durable-effect' } })
  })

  it('http 副作用已提交但响应丢失后，用相同 queueId 重试不会重复副作用', async () => {
    let requests = 0
    const handler: RequestListener = async (request, response) => {
      requests += 1
      const receipt = request.headers['idempotency-key']
      const effect = await reldb.sql.execute(
        'INSERT INTO test_receiver_effects (receipt, result) VALUES (?, ?) ON CONFLICT(receipt) DO NOTHING',
        [receipt, 'delivered'],
      )
      if (!effect.success) {
        response.writeHead(503).end()
        return
      }
      if (requests === 1)
        response.destroy()
      else
        response.end(JSON.stringify({ messageId: 'confirmed-after-loss' }))
    }
    const endpoint = await receiver(handler)
    const row = await queued('first')
    const provider = await api(endpoint.url)
    expect((await deliverClaimedMessage(row, 'first', provider, repository)).success).toBe(false)
    // 关闭并重新打开 HTTP 接收端与数据库，去重记录来自文件，不依赖内存 Set/Map。
    endpoint.server.closeAllConnections()
    await new Promise<void>((resolve, reject) => endpoint.server.close(error => error ? reject(error) : resolve()))
    await reach.close()
    await reldb.close()
    await initializeServices()
    // 重启不会绕过数据库持久保存的退避截止时间。
    expect(await repository.claimPendingBatch('too-early')).toMatchObject({ success: true, data: [] })
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_001)
    const restarted = await receiver(handler)
    const restartedProvider = await api(restarted.url)
    const recovered = await claimed('second')
    expect((await deliverClaimedMessage(recovered, 'second', restartedProvider, repository)).success).toBe(true)
    expect(requests).toBe(2)
    expect(await reach.queue.get(row.queueId!)).toMatchObject({ success: true, data: { status: 'sent', nextAttemptAt: 0 } })
    expect(await reldb.sql.query('SELECT receipt FROM test_receiver_effects')).toMatchObject({ success: true, data: [{ receipt: row.queueId }] })
  })

  it('非幂等发送已开始后旧节点暂停，新节点隔离为 unknown；旧节点恢复不能触发重发或覆盖人工裁定', async () => {
    const started = deferred<void>()
    const completed = deferred<void>()
    let effects = 0
    const provider: ReachProvider = {
      ...createConsoleProvider(),
      isConnected: () => true,
      supportsIdempotency: false,
      send: async () => {
        effects += 1
        started.resolve()
        await completed.promise
        return ok({ success: true })
      },
    }
    const row = await queued('old')
    const delivery = deliverClaimedMessage(row, 'old', provider, repository, 10_000)
    try {
      await started.promise
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 20_000)
      expect(await repository.claimPendingBatch('new')).toMatchObject({ success: true, data: [] })
      expect(await reach.queue.get(row.queueId!)).toMatchObject({ success: true, data: { status: 'unknown' } })
      // @ts-expect-error 验证可信管理 API 仍会拒绝来自 JS/HTTP 调用方的非法状态。
      expect((await reach.queue.resolveUnknown(row.queueId!, { status: 'pending' })).success).toBe(false)
      const resolutions = await Promise.all([
        reach.queue.resolveUnknown(row.queueId!, { status: 'sent', messageId: 'verified-externally' }),
        reach.queue.resolveUnknown(row.queueId!, { status: 'discarded' }),
      ])
      expect(resolutions.filter(result => result.success)).toHaveLength(1)
    }
    finally {
      completed.resolve()
      expect((await delivery).success).toBe(false)
    }
    expect(effects).toBe(1)
    expect((await repository.releaseClaim(row.id, 'old')).success).toBe(false)
    expect(await repository.claimPendingBatch('third')).toMatchObject({ success: true, data: [] })
  })

  it('明确尚未开始的未连接 Provider 不会被误标为未知外部副作用', async () => {
    const row = await queued('disconnected')
    const provider = createApiProvider()
    const send = vi.spyOn(provider, 'send')
    expect((await deliverClaimedMessage(row, 'disconnected', provider, repository)).success).toBe(false)
    expect(send).not.toHaveBeenCalled()
    expect(await reach.queue.get(row.queueId!)).toMatchObject({ success: true, data: { status: 'pending' } })
  })

  it('曾开始的幂等投递不能被配置为非幂等的新消费者直接重发', async () => {
    const row = await queued('old', 1000)
    expect((await repository.beginDelivery(row.id, 'old', true, 1000)).success).toBe(true)
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1001)
    const recovered = await claimed('new')
    const provider: ReachProvider = { ...createConsoleProvider(), supportsIdempotency: false, isConnected: () => true }
    const send = vi.spyOn(provider, 'send')
    expect((await deliverClaimedMessage(recovered, 'new', provider, repository)).success).toBe(false)
    expect(send).not.toHaveBeenCalled()
    expect(await reach.queue.get(row.queueId!)).toMatchObject({ success: true, data: { status: 'unknown' } })
  })

  it('真实 SMTP 已接收 DATA 后断连，结果转 unknown 且第二消费者不重发', async () => {
    let effects = 0
    const server = createSmtpServer((socket) => {
      let buffer = ''
      let data = false
      socket.write('220 localhost\r\n')
      socket.on('error', () => {})
      socket.on('data', (chunk) => {
        buffer += chunk.toString()
        let boundary = buffer.indexOf('\r\n')
        while (boundary >= 0) {
          const line = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          if (data) {
            if (line === '.') {
              effects += 1
              socket.destroy()
              return
            }
          }
          else if (line.startsWith('DATA')) {
            data = true
            socket.write('354 continue\r\n')
          }
          else {
            socket.write('250 localhost\r\n')
          }
          boundary = buffer.indexOf('\r\n')
        }
      })
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    try {
      const address = server.address()
      if (!address || typeof address === 'string')
        throw new Error('SMTP receiver has no port')
      const provider = createSmtpProvider()
      providers.push(provider)
      const connected = await provider.connect(SmtpProviderConfigSchema.parse({
        name: 'job',
        type: 'smtp',
        host: '127.0.0.1',
        port: address.port,
        secure: false,
        from: 'sender@example.invalid',
      }))
      expect(connected.success).toBe(true)
      const row = await queued('smtp')
      expect((await deliverClaimedMessage(row, 'smtp', provider, repository)).success).toBe(false)
      expect(effects).toBe(1)
      expect(await reach.queue.get(row.queueId!)).toMatchObject({ success: true, data: { status: 'unknown' } })
      expect(await repository.claimPendingBatch('other')).toMatchObject({ success: true, data: [] })
      expect(effects).toBe(1)
    }
    finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
})
