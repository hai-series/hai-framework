import type { Server } from 'node:http'
import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HaiReachError, reach } from '../src/index.js'

let server: Server
let received: unknown[]
let url: string
beforeEach(async () => {
  received = []
  server = createServer((request, response) => {
    const chunks: Uint8Array[] = []
    request.on('data', (chunk: Uint8Array) => chunks.push(chunk))
    request.on('end', () => {
      received.push(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ success: true, messageId: 'delivered-one' }))
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing test receiver')
  url = `http://127.0.0.1:${address.port}`
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await reach.init({ providers: [{ name: 'notify', type: 'api', url }] })).success).toBe(true)
})
afterEach(async () => {
  await reach.close()
  await reldb.close()
  if (server) {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
const notification = () => ({ provider: 'notify', to: 'user@example.invalid', body: 'Credential: CREDENTIAL_SENTINEL', vars: { verificationCode: 'CODE_SENTINEL', token: 'TOKEN_SENTINEL' }, sensitive: true, idempotencyKey: 'one-notification', expiresAt: Date.now() + 60_000 })

describe('凭据通知的无载荷回执', () => {
  it('真实发送但不落正文/变量，跨重初始化和并发同键均不重复发送', async () => {
    const observations: unknown[] = []
    const stop = core.logger.observe(entry => observations.push(entry))
    try {
      const message = notification()
      const results = await Promise.all([reach.send(message), reach.send(message)])
      expect(results.some(result => result.success)).toBe(true)
      expect(received).toHaveLength(1)
      expect(received[0]).toMatchObject({ body: message.body, vars: message.vars, expiresAt: message.expiresAt })
      await reach.close()
      expect((await reach.init({ providers: [{ name: 'notify', type: 'api', url }] })).success).toBe(true)
      const repeated = await reach.send(message)
      expect(repeated.success).toBe(true)
      expect(received).toHaveLength(1)
      if (!repeated.success)
        return
      const receipt = await reach.queue.get(repeated.data.receiptId!)
      expect(receipt).toMatchObject({ success: true, data: { status: 'sent' } })
      const rows = await reldb.sql.query('SELECT * FROM hai_reach_send_log')
      expect(rows.success).toBe(true)
      const persisted = JSON.stringify({ rows, observations })
      for (const sentinel of ['CREDENTIAL_SENTINEL', 'CODE_SENTINEL', 'TOKEN_SENTINEL'])
        expect(persisted).not.toContain(sentinel)
    }
    finally {
      stop()
    }
  })

  it('过期凭据不发送，免打扰不会把凭据写入延迟队列', async () => {
    const expired = await reach.send({ ...notification(), expiresAt: Date.now() - 1 })
    expect(expired).toMatchObject({ success: false, error: { code: HaiReachError.MESSAGE_EXPIRED.code } })
    await reach.close()
    const now = new Date()
    const start = `${String(now.getHours()).padStart(2, '0')}:00`
    const end = `${String((now.getHours() + 1) % 24).padStart(2, '0')}:00`
    expect((await reach.init({ providers: [{ name: 'notify', type: 'api', url }], dnd: { enabled: true, strategy: 'delay', start, end } })).success).toBe(true)
    const blocked = await reach.send(notification())
    expect(blocked).toMatchObject({ success: false, error: { code: HaiReachError.DND_BLOCKED.code } })
    expect(received).toHaveLength(0)
    const rows = await reldb.sql.query<{ status: string, body: string | null, vars_json: string | null }>('SELECT status,body,vars_json FROM hai_reach_send_log')
    expect(rows).toMatchObject({ success: true, data: [{ status: 'discarded', body: null, vars_json: null }] })
  })
})

it('provider 返回的消息标识不作为凭据回执保存或返回', async () => {
  const result = await reach.send(notification())
  expect(result).toMatchObject({ success: true, data: { success: true, receiptId: expect.any(String) } })
  expect(result.success && result.data.messageId).toBeUndefined()
  const row = await reldb.sql.get('SELECT message_id FROM hai_reach_send_log')
  expect(row).toMatchObject({ success: true, data: { message_id: null } })
})
