/** 使用真实 chromadb SDK 和 HTTP 认证边界验证凭据实际传输，不替换 SDK。 */

import type { AddressInfo } from 'node:net'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import { vecdb } from '../src/index.js'
import { createChromaProvider } from '../src/providers/vecdb-provider-chroma.js'
import { VecdbConfigSchema } from '../src/vecdb-config.js'

describe('chroma HTTP authentication', () => {
  it('认证探测不回包时中止候选请求，不发布连接且释放 socket', async () => {
    let aborted = false
    const server = createServer((request, response) => {
      if (request.url?.endsWith('/heartbeat')) {
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ 'nanosecond heartbeat': 1 }))
      }
      else {
        request.socket.once('close', () => {
          aborted = true
        })
      }
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const provider = createChromaProvider()
    const started = performance.now()
    try {
      const address = server.address() as AddressInfo
      const connected = await provider.connect(VecdbConfigSchema.parse({ type: 'chroma', url: `http://127.0.0.1:${address.port}` }))
      expect(connected.success).toBe(false)
      expect(performance.now() - started).toBeLessThan(7500)
      expect(provider.isConnected()).toBe(false)
      await expect.poll(() => aborted, { timeout: 1500 }).toBe(true)
    }
    finally {
      await provider.close()
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  }, 10_000)

  it('配置的 Bearer 凭据发送到心跳和受保护的数据端点', async () => {
    const requests: { path: string, authorization: string | undefined }[] = []
    const server = createServer((request, response) => {
      requests.push({ path: request.url ?? '', authorization: request.headers.authorization })
      response.setHeader('content-type', 'application/json')
      if (request.headers.authorization !== 'Bearer fixture-chroma-token') {
        response.writeHead(401)
        response.end(JSON.stringify({ error: 'Unauthorized', message: 'Authentication required' }))
        return
      }
      response.end(JSON.stringify(request.url?.endsWith('/heartbeat') ? { 'nanosecond heartbeat': 1 } : request.url?.includes('/collections?') ? [] : 0))
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const provider = createChromaProvider()
    try {
      const address = server.address() as AddressInfo
      const connected = await provider.connect(VecdbConfigSchema.parse({
        type: 'chroma',
        url: `http://127.0.0.1:${address.port}`,
        apiKey: 'fixture-chroma-token',
      }))
      expect(connected.success).toBe(true)
      expect(requests.some(request => request.path.endsWith('/collections_count'))).toBe(true)
      expect(requests.every(request => request.authorization === 'Bearer fixture-chroma-token')).toBe(true)
      expect(provider.isConnected()).toBe(true)
      // 超过连接截止后仍可访问，证明成功路径清除了初始化 timer，而非留下终身超时信号。
      await delay(5200)
      expect((await provider.collection.list()).success).toBe(true)
    }
    finally {
      await provider.close()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  }, 15_000)

  it.each([undefined, 'wrong-token'])('公开心跳不能掩盖数据端点认证失败：%s', async (apiKey) => {
    let protectedCalls = 0
    const server = createServer((request, response) => {
      response.setHeader('content-type', 'application/json')
      if (request.url?.endsWith('/heartbeat')) {
        response.end(JSON.stringify({ 'nanosecond heartbeat': 1 }))
        return
      }
      protectedCalls += 1
      response.writeHead(401)
      response.end(JSON.stringify({ error: 'Unauthorized', message: 'Authentication required' }))
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    try {
      const address = server.address() as AddressInfo
      const connected = await vecdb.init({
        type: 'chroma',
        url: `http://127.0.0.1:${address.port}`,
        apiKey,
      })
      expect(connected.success).toBe(false)
      expect(protectedCalls).toBe(1)
      expect(vecdb.isInitialized).toBe(false)
      expect((await vecdb.collection.list()).success).toBe(false)
    }
    finally {
      await vecdb.close()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
})
