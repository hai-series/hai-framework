import type { ServContext } from '@h-ai/serv'
import { serv } from '@h-ai/serv'
import { expect, it } from 'vitest'

it('installed serv uses socket metadata and explicit trusted proxies', async () => {
  const contract = {}
  const procedures = serv.implement(contract).context<ServContext>().build()
  let clientIp: string | undefined
  const createContext = (input: Parameters<typeof serv.parseRequestContext>[0]) => {
    const context = serv.parseRequestContext(input)
    clientIp = context.ip
    return context
  }
  const request = new Request('http://test.local/docs', { headers: { 'x-forwarded-for': '198.51.100.10' } })
  const app = serv.createApp({ contract, procedures, createContext, http: { docs: { requireAuth: true } } })
  await app.fetch(request, { remoteAddress: '203.0.113.9' })
  expect(clientIp).toBe('203.0.113.9')
  const proxy = serv.createApp({ contract, procedures, createContext, http: { docs: { requireAuth: true }, trustedProxies: ['10.0.0.0/8'] } })
  await proxy.fetch(request, { remoteAddress: '10.0.0.1' })
  expect(clientIp).toBe('198.51.100.10')
})
