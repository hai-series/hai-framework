import type { Socket } from 'node:net'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { afterEach, expect, it, vi } from 'vitest'
import { HaiReachError, reach } from '../src/index.js'

const privateMarker = 'fixture-private-provider-response'
afterEach(async () => {
  await reach.close()
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

it('sms rejection text remains a server diagnostic instead of a public message', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ Code: 'SignatureDoesNotMatch', Message: privateMarker })))
  expect((await reach.init({
    providers: [
      {
        name: 'sms',
        type: 'aliyun-sms',
        accessKeyId: 'fixture',
        accessKeySecret: 'fixture',
        signName: 'fixture',
      },
    ],
  })).success).toBe(true)
  const result = await reach.send({
    provider: 'sms',
    to: '13800000000',
    body: 'Fixture body',
    extra: { templateCode: 'fixture' },
  })
  expect(result).toMatchObject({ success: false, error: HaiReachError.SEND_FAILED })
  expect(JSON.stringify(result)).not.toContain(privateMarker)
})
