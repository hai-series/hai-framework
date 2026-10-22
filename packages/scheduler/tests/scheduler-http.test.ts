import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { scheduler } from '../src/index.js'
import './helpers/sqlite-lifecycle.js'

describe('scheduler HTTP response boundaries', () => {
  afterEach(async () => {
    await scheduler.close()
  })

  it('times out a stalled response body and rejects oversized bodies', async () => {
    const server = createServer((request, response) => {
      if (request.url === '/stalled') {
        response.writeHead(200)
        response.write('headers received')
        return
      }
      if (request.url === '/large') {
        response.end('x'.repeat(1024 * 1024 + 1))
        return
      }
      if (request.url === '/error') {
        response.writeHead(503)
        response.end('unavailable')
        return
      }
      response.end('完成 😀')
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      expect((await scheduler.init({ enableDb: true })).success).toBe(true)
      const address = server.address() as AddressInfo
      let runIndex = 0
      const run = async (path: string, maxResponseBytes?: number) => {
        const id = `${path}-${runIndex++}`
        expect((await scheduler.register({
          id,
          name: path,
          cron: '* * * * *',
          handler: { kind: 'api', url: `http://127.0.0.1:${address.port}/${path}`, timeout: 250, maxResponseBytes },
        })).success).toBe(true)
        const result = await scheduler.trigger(id)
        expect(result.success).toBe(true)
        if (!result.success)
          throw new Error(result.error.message)
        return result.data
      }
      const stalled = await run('stalled')
      expect(stalled.status).toBe('unknown')
      expect(stalled.duration).toBeLessThan(2000)
      expect((await run('large')).status).toBe('unknown')
      const large = await run('large', 2 * 1024 * 1024)
      expect(large.status).toBe('success')
      expect(large.result).toHaveLength(1024 * 1024 + 1)
      expect((await run('normal', 11)).status).toBe('success')
      expect((await run('normal', 10)).status).toBe('unknown')
      let invalidRequests = 0
      const onRequest = () => invalidRequests++
      server.on('request', onRequest)
      for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
        const registered = await scheduler.register({
          id: `invalid-${runIndex++}`,
          name: 'invalid',
          cron: '* * * * *',
          handler: { kind: 'api', url: `http://127.0.0.1:${address.port}/normal`, maxResponseBytes: limit },
        })
        expect(registered.success).toBe(false)
      }
      server.off('request', onRequest)
      expect(invalidRequests).toBe(0)
      expect((await run('error')).status).toBe('unknown')
      const normal = await run('normal')
      expect(normal.status).toBe('success')
      expect(normal.result).toBe('完成 😀')
      expect((await scheduler.register({
        id: 'close-http',
        name: 'close-http',
        cron: '* * * * *',
        handler: { kind: 'api', url: `http://127.0.0.1:${address.port}/stalled`, timeout: 60000 },
      })).success).toBe(true)
      const requestStarted = new Promise<void>(resolve => server.once('request', () => resolve()))
      const pending = scheduler.trigger('close-http')
      await requestStarted
      await scheduler.close()
      const cancelled = await pending
      expect(cancelled.success).toBe(true)
      if (cancelled.success) {
        expect(cancelled.data.status).toBe('unknown')
        expect(cancelled.data.duration).toBeLessThan(2000)
      }
    }
    finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
})
