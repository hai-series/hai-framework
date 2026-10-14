import type { ServContext } from '../src/serv-context.js'
import { apiContract } from '@h-ai/api-contract'
import { ok } from '@h-ai/core'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createClientIpResolver } from '../src/serv-client-ip.js'
import { resolveServHttpConfig } from '../src/serv-config.js'
import { serv } from '../src/serv-main.js'

const forged = { 'x-forwarded-for': '198.51.100.10', 'x-real-ip': '198.51.100.11' }
const request = (headers = forged) => new Request('http://test.local/api/v1/peer', { headers })

describe('可信客户端 IP', () => {
  it('无对端或未信任代理时忽略所有转发头', () => {
    const resolve = createClientIpResolver([])
    expect(resolve(request())).toBeUndefined()
    expect(resolve(request(), '203.0.113.9')).toBe('203.0.113.9')
    expect(resolve(request(), '::ffff:127.0.0.1')).toBe('127.0.0.1')
  })

  it('仅从可信对端向左解析，停止于第一个不可信地址', () => {
    const resolve = createClientIpResolver(['10.0.0.0/8', '2001:db8:1::/48'])
    expect(resolve(request({ 'x-forwarded-for': '198.51.100.10, 203.0.113.9, 10.0.0.2', 'x-real-ip': '127.0.0.1' }), '10.0.0.1')).toBe('203.0.113.9')
    expect(resolve(request({ 'x-forwarded-for': '2001:db8:2::9, 2001:db8:1::2', 'x-real-ip': '127.0.0.1' }), '2001:db8:1::1')).toBe('2001:db8:2::9')
    expect(resolve(request({ 'x-forwarded-for': '198.51.100.10, 10.0.0.2', 'x-real-ip': '127.0.0.1' }), '192.0.2.1')).toBe('192.0.2.1')
  })

  it('只解析可信链需要的部分，无法确认客户端时不回退代理身份', () => {
    const resolve = createClientIpResolver(['127.0.0.1'])
    expect(resolve(request({ 'x-forwarded-for': 'unknown, 10.0.0.1', 'x-real-ip': '198.51.100.10' }), '127.0.0.1')).toBe('10.0.0.1')
    expect(resolve(request({ 'x-forwarded-for': 'unknown, 127.0.0.1', 'x-real-ip': '198.51.100.10' }), '127.0.0.1')).toBeUndefined()
    expect(resolve(request({ 'x-forwarded-for': Array.from({ length: 33 }).fill('127.0.0.1').join(','), 'x-real-ip': '198.51.100.10' }), '127.0.0.1')).toBeUndefined()
    expect(resolve(new Request('http://test.local', { headers: { 'x-real-ip': '198.51.100.10' } }), '127.0.0.1')).toBe('198.51.100.10')
    expect(resolve(new Request('http://test.local', { headers: { 'x-real-ip': 'spoofed:123' } }), '127.0.0.1')).toBeUndefined()
  })

  it('启动配置校验 IP/CIDR，默认不信任代理', () => {
    expect(resolveServHttpConfig().trustedProxies).toEqual([])
    expect(resolveServHttpConfig({ trustedProxies: ['127.0.0.1/32', '::1/128'] }).trustedProxies).toHaveLength(2)
    for (const invalid of ['localhost', '*', '1.2.3.4/33', '::1/129', '1.2.3.4/x', '10.0.0.1/8/9'])
      expect(() => resolveServHttpConfig({ trustedProxies: [invalid] })).toThrow()
  })

  it('node socket、Fetch 元数据与自定义上下文共用可信解析，RPC 仍按连接对端限制', async () => {
    const contract = {
      peer: apiContract.route({ method: 'GET', path: '/peer' }).output(apiContract.haiResultSchema(z.string().optional())),
    }
    const procedures = serv.implement(contract).context<ServContext>().route('peer').handle(async ({ context }) => ok(context.ip)).build()
    const app = serv.createApp({
      contract,
      procedures,
      http: { rpc: { prefix: '/rpc', access: 'loopback' } },
      createContext: input => serv.parseRequestContext(input),
    })
    const node = serv.listen(app, { host: '127.0.0.1', port: 0 })
    try {
      if (!node.server.listening)
        await new Promise<void>(resolve => node.server.once('listening', resolve))
      const address = node.server.address()
      if (!address || typeof address === 'string')
        throw new Error('Missing TCP listener address')
      const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/peer`, { headers: forged })
      expect(await response.json()).toMatchObject({ success: true, data: '127.0.0.1' })
      const direct = await app.fetch(request(), { remoteAddress: '203.0.113.9' })
      expect(await direct.json()).toMatchObject({ success: true, data: '203.0.113.9' })
      const proxiedApp = serv.createApp({ contract, procedures, http: { trustedProxies: ['10.0.0.0/8'] } })
      const proxied = await proxiedApp.fetch(request(), { remoteAddress: '10.0.0.1' })
      expect(await proxied.json()).toMatchObject({ success: true, data: '198.51.100.10' })
      const unknown = await proxiedApp.fetch(request({ 'x-forwarded-for': 'unknown, 10.0.0.2', 'x-real-ip': '127.0.0.1' }), { remoteAddress: '10.0.0.1' })
      expect(await unknown.json()).toEqual({ success: true })
      const rpc = await app.fetch(new Request('http://test.local/rpc/peer', { headers: { 'x-real-ip': '127.0.0.1' } }), { remoteAddress: '203.0.113.9' })
      expect(rpc.status).toBe(403)
    }
    finally {
      await node.close()
    }
  })
})
