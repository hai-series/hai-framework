import type { RequestListener, Server } from 'node:http'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { reldb } from '@h-ai/reldb'
import { afterEach, expect, it, vi } from 'vitest'
import { HaiReachError, reach } from '../src/index.js'

const servers: Server[] = []
const message = { provider: 'notify', to: 'fixture@example.invalid', body: 'SYNTHETIC_BUSINESS_BODY' }
afterEach(async () => {
  await reach.close()
  await reldb.close()
  vi.restoreAllMocks()
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>(done => server.close(() => done()))
  }
})

it('渠道开启 HTTPS 要求时拒绝初始化 HTTP 地址', async () => {
  let received = 0
  const url = await receiver((request, response) => {
    received++
    request.resume()
    response.end('{}')
  })
  expect(await initialize(url, { requireHttps: true })).toMatchObject({
    success: false,
    error: { code: HaiReachError.CONFIG_ERROR.code },
  })
  expect(received).toBe(0)
  expect((await initialize(url, { requireHttps: false })).success).toBe(true)
  expect((await reach.send(message)).success).toBe(true)
  expect(received).toBe(1)
})

async function receiver(listener: RequestListener) {
  const server = createServer(listener)
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing receiver')
  return `http://127.0.0.1:${address.port}`
}

async function initialize(url: string, options: { redirect?: 'error' | 'follow', requireHttps?: boolean } = {}) {
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  return reach.init({
    providers: [
      {
        name: 'notify',
        type: 'api',
        url,
        headers: { 'X-Private-Fixture': 'SYNTHETIC_PRIVATE_HEADER' },
        ...options,
      },
    ],
    dnd: { enabled: false },
  })
}

it.each([
  [204, '', true],
  [205, '', true],
  [200, '', true],
  [202, '{}', true],
  [200, '{"messageId":"accepted-1"}', true],
  [200, 'invalid-SYNTHETIC_RESPONSE', false],
  [200, 'null', false],
  [200, '[]', false],
  [200, '{"messageId":42}', false],
  [
    200,
    'x'.repeat(65537),
    false,
  ],
  [400, 'private rejection', false],
  [500, 'private failure', false],
])('hTTP 回执校验用例 %#', async (status, body, success) => {
  let received = 0
  const url = await receiver((request, response) => {
    request.resume()
    request.on('end', () => {
      received++
      response.writeHead(status).end(body)
    })
  })
  expect((await initialize(url)).success).toBe(true)
  const result = await reach.send(message)
  expect(result.success).toBe(success)
  expect(received).toBe(1)
  expect(JSON.stringify(result)).not.toMatch(/SYNTHETIC_RESPONSE|private rejection|private failure/)
  if (body.includes('accepted-1')) {
    expect(result).toMatchObject({
      success: true,
      data: { messageId: 'accepted-1' },
    })
  }
})

it.each([301, 302, 303, 307, 308])('默认拒绝 %i 请求，不转发正文和私有头', async (status) => {
  let forwarded = 0
  const target = await receiver((request, response) => {
    forwarded++
    request.resume()
    response.end('{}')
  })
  const source = await receiver((request, response) => {
    request.resume()
    request.on('end', () => response.writeHead(status, { location: target }).end())
  })
  expect((await initialize(source)).success).toBe(true)
  expect((await reach.send(message)).success).toBe(false)
  expect(forwarded).toBe(0)
  const rows = await reldb.sql.query('SELECT * FROM hai_reach_send_log')
  expect(rows).toMatchObject({ success: true, data: [] })
})

it('每次直发自动分配请求编号，并在请求头和 JSON 中使用同一个值', async () => {
  const received: Array<{ header: string | string[] | undefined, body: string }> = []
  const url = await receiver((request, response) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', chunk => body += chunk)
    request.on('end', () => {
      received.push({ header: request.headers['idempotency-key'], body })
      response.writeHead(204).end()
    })
  })
  expect((await initialize(url)).success).toBe(true)
  expect((await reach.send(message)).success).toBe(true)
  expect((await reach.send(message)).success).toBe(true)
  expect(received).toHaveLength(2)
  for (const { header, body } of received) {
    expect(header).toMatch(/^[\da-f-]{36}$/i)
    expect(JSON.parse(body)).toMatchObject({ idempotencyKey: header })
  }
  expect(received[0]?.header).not.toBe(received[1]?.header)
})

it('普通消息可显式允许重定向，HTTPS 策略在发出请求前校验', async () => {
  let forwarded = 0
  const target = await receiver((request, response) => {
    forwarded++
    request.resume()
    response.end('{}')
  })
  const source = await receiver((request, response) => {
    request.resume()
    request.on('end', () => response.writeHead(307, { location: target }).end())
  })
  expect((await initialize(source, { redirect: 'follow' })).success).toBe(true)
  expect((await reach.send(message)).success).toBe(true)
  expect(forwarded).toBe(1)
  await reach.close()
  expect((await initialize(source, { requireHttps: true })).success).toBe(false)
  expect(forwarded).toBe(1)
})
