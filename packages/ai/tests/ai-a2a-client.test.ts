/** 原生 A2A SDK 远端调用：真实 HTTP 契约、认证头规范化与重定向隔离。 */
import type { Server } from 'node:http'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { afterEach, expect, it } from 'vitest'
import { ai } from '../src/ai-main.js'

const servers: Server[] = []

async function listen(server: Server): Promise<string> {
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing HTTP fixture address')
  return `http://127.0.0.1:${address.port}`
}

afterEach(async () => {
  await ai.close()
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    if (server.listening) {
      await new Promise<void>((resolve, reject) => server.close(error => error
        ? reject(error)
        : resolve()))
    }
  }
})

it('通过实际JSON-RPC端点发送原生1.0消息，大小写不同的头按同一名称覆盖', async () => {
  let received: unknown
  let contentType: string | undefined
  let apiKey: string | string[] | undefined
  const url = await listen(createServer(async (request, response) => {
    let text = ''
    for await (const chunk of request)
      text += String(chunk)
    const body = JSON.parse(text) as { id: string | number }
    received = body
    contentType = request.headers['content-type']
    apiKey = request.headers['x-api-key']
    response.writeHead(200, { 'content-type': 'application/json', 'a2a-version': '1.0' })
    response.end(JSON.stringify({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        message: {
          messageId: 'reply',
          role: 'ROLE_AGENT',
          parts: [
            { text: 'Native reply' },
          ],
        },
      },
    }))
  }))
  expect((await ai.init()).success).toBe(true)
  const result = await ai.a2a.callRemoteAgent(`${url}/a2a`, 'Native input', {
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'fixture-key' },
  })
  expect(result).toMatchObject({
    success: true,
    data: { responseText: 'Native reply' },
  })
  expect(received).toMatchObject({
    method: 'SendMessage',
    params: {
      message: {
        role: 'ROLE_USER',
        parts: [
          { text: 'Native input' },
        ],
      },
    },
  })
  expect(contentType).toBe('application/json')
  expect(apiKey).toBe('fixture-key')
})

it('真实跨origin重定向失败，不向目标转发自定义认证头', async () => {
  let destinationRequests = 0
  const destination = await listen(createServer((_request, response) => {
    destinationRequests++
    response.end('unexpected destination')
  }))
  const source = await listen(createServer((_request, response) => {
    response.writeHead(307, { location: `${destination}/capture` })
    response.end()
  }))
  expect((await ai.init()).success).toBe(true)
  const result = await ai.a2a.callRemoteAgent(`${source}/a2a`, 'test', {
    headers: { 'X-Api-Key': 'fixture-key' },
  })
  expect(result.success).toBe(false)
  expect(destinationRequests).toBe(0)
  expect(JSON.stringify(result)).not.toContain('fixture-key')
})
