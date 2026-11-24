import type { Socket } from 'node:net'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { core } from '@h-ai/core'
import { afterEach, expect, it, vi } from 'vitest'
import { HaiReachError, reach } from '../src/index.js'

const privateMarker = 'fixture-private-provider-response'
const smsProvider = {
  name: 'sms',
  type: 'aliyun-sms',
  accessKeyId: 'fixture',
  accessKeySecret: 'fixture',
  signName: 'fixture',
} as const
const smsMessage = {
  provider: 'sms',
  to: '13800000000',
  extra: { templateCode: 'SMS_TEST' },
}

afterEach(async () => {
  await reach.close()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('smtp failures preserve the complete error definition without exposing the peer response or cause', async () => {
  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.write('220 fixture ESMTP\r\n')
    let pending = ''
    socket.on('data', (chunk) => {
      pending += chunk.toString()
      for (let index = pending.indexOf('\r\n'); index >= 0; index = pending.indexOf('\r\n')) {
        const command = pending.slice(0, index)
        pending = pending.slice(index + 2)
        if (/^(?:EHLO|HELO)/.test(command))
          socket.write('250 fixture\r\n')
        else if (command.startsWith('QUIT'))
          socket.end('221 goodbye\r\n')
        else
          socket.write(`550 ${privateMarker}\r\n`)
      }
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing owned SMTP fixture address')
    expect((await reach.init({
      providers: [
        {
          name: 'email',
          type: 'smtp',
          host: '127.0.0.1',
          port: address.port,
          secure: false,
          from: 'sender@example.invalid',
        },
      ],
    })).success).toBe(true)
    const result = await reach.send({ provider: 'email', to: 'recipient@example.invalid', body: 'Fixture body' })
    expect(result).toMatchObject({ success: false, error: HaiReachError.SEND_FAILED })
    expect(JSON.stringify(result)).not.toContain(privateMarker)
  }
  finally {
    await reach.close()
    for (const socket of sockets)
      socket.destroy()
    await new Promise<void>((resolve, reject) => server.close(error => error
      ? reject(error)
      : resolve()))
  }
})

it.each(['api', 'aliyun-sms'] as const)('thrown %s provider errors retain status and hide backend diagnostics', async (type) => {
  vi.stubGlobal('fetch', vi.fn(async () => {
    throw new Error(privateMarker)
  }))
  const provider = type === 'api'
    ? { name: 'fixture', type, url: 'https://provider.example.invalid' }
    : {
        name: 'fixture',
        type,
        accessKeyId: 'fixture',
        accessKeySecret: 'fixture',
        signName: 'fixture',
      }
  expect((await reach.init({
    providers: [provider],
  })).success).toBe(true)
  const result = await reach.send({
    provider: 'fixture',
    to: '13800000000',
    body: 'Fixture body',
    extra: { templateCode: 'fixture' },
  })
  expect(result).toMatchObject({ success: false, error: HaiReachError.SEND_FAILED })
  expect(JSON.stringify(result)).not.toContain(privateMarker)
})

it.each([
  [
    200,
    JSON.stringify({ Code: 'SignatureDoesNotMatch', Message: privateMarker }),
  ],
  [503, '{"Code":"OK"}'],
  [200, '{"Code":"OK","BizId":42}'],
  [
    200,
    JSON.stringify({
      Code: 'OK',
      BizId: 'x'.repeat(256),
    }),
  ],
  [
    200,
    JSON.stringify({
      Code: 'OK',
      Message: 'x'.repeat(64 * 1024),
    }),
  ],
])('直连短信拒绝无效回执 %# 并隐藏对端正文', async (status, body) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })))
  expect((await reach.init({
    providers: [smsProvider],
  })).success).toBe(true)
  const entries: unknown[] = []
  const stop = core.logger.observe(entry => entries.push(entry))
  try {
    const result = await reach.send(smsMessage)
    expect(result).toMatchObject({ success: false, error: HaiReachError.SEND_FAILED })
    expect(JSON.stringify({ result, entries })).not.toContain(privateMarker)
  }
  finally {
    stop()
  }
})

it('直连短信未提供模板编码时在调用外部服务前失败', async () => {
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  expect((await reach.init({
    providers: [smsProvider],
  })).success).toBe(true)
  expect(await reach.send({ provider: 'sms', to: smsMessage.to })).toMatchObject({
    success: false,
    error: HaiReachError.CONFIG_ERROR,
  })
  expect(fetchMock).not.toHaveBeenCalled()
})

it('直连短信拒绝重定向并将超时信号传给网络请求', async () => {
  const controller = new AbortController()
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(controller.signal)
  const requestStarted = Promise.withResolvers<RequestInit | undefined>()
  vi.spyOn(globalThis, 'fetch').mockImplementationOnce((_url, request) => {
    requestStarted.resolve(request)
    return new Promise((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })
    })
  })
  expect((await reach.init({
    providers: [smsProvider],
  })).success).toBe(true)
  const sending = reach.send(smsMessage)
  try {
    expect(await requestStarted.promise).toMatchObject({ method: 'GET', redirect: 'error', signal: controller.signal })
    expect(timeout).toHaveBeenCalledWith(10_000)
  }
  finally {
    controller.abort(new DOMException('Fixture request deadline', 'TimeoutError'))
  }
  expect(await sending).toMatchObject({ success: false, error: HaiReachError.SEND_FAILED })
})
