import type { ServContext } from '@h-ai/serv'
/** 真实 Nginx 后的 Node Fetch 宿主；平台元数据取 socket，策略和处理链使用公开实现。 */
import type { RequestEvent } from '@sveltejs/kit'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { unlinkSync } from 'node:fs'
import { createServer } from 'node:http'
import process from 'node:process'
import { apiContract } from '@h-ai/api-contract'
import { core, ok } from '@h-ai/core'
import { kit } from '@h-ai/kit'
import { serv } from '@h-ai/serv'
import { z } from 'zod'

core.init({ logging: { level: 'fatal' } })
// Linux FIFO 不能让配置校验挂起；使用真实内核文件类型和已构建的公开入口。
const fifo = '/tmp/fifo-policy.yml'
execFileSync('mkfifo', [fifo])
try {
  assert.throws(() => core.access.loadPolicy({ file: fifo }), /policy file could not be read/)
}
finally { unlinkSync(fifo) }
const expected = process.env.HAI_FIXTURE_EXPECTED_IP!
assert.ok(expected)
const policy = { file: '/tmp/request-access.yml' }
const contract = {
  ip: apiContract.route({ method: 'GET', path: '/ip' }).output(apiContract.haiResultSchema(z.object({ ip: z.string().optional() }))),
  denied: apiContract.route({ method: 'GET', path: '/denied' }).output(apiContract.haiResultSchema(z.object({ ip: z.string().optional() }))),
}
const procedures = serv.implement(contract).context<ServContext>().route('ip').handle(({ context }) => ok({ ip: context.ip })).route('denied').handle(({ context }) => ok({ ip: context.ip })).build()
const application = serv.createApp({ contract, procedures, http: { apiPrefix: '/api/v1', access: policy, trustedProxies: 'auto', openapi: false, docs: false, rpc: false } })
const handle = kit.createHandle({ logging: false, access: policy, trustedProxies: 'auto' })
const backend = createServer(async (incoming, outgoing) => {
  try {
    const headers = new Headers()
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (value !== undefined)
        headers.set(name, Array.isArray(value) ? value.join(', ') : value)
    }
    const request = new Request(`http://localhost${incoming.url}`, { method: incoming.method, headers })
    // 只构造 SvelteKit 平台事件，所有访问策略、地址解析和 Handle 均为实际公开实现。
    const event = { request, url: new URL(request.url), locals: {}, params: {}, route: { id: '/api/v1/kit' }, getClientAddress: () => incoming.socket.remoteAddress!, cookies: { get: () => undefined }, fetch, setHeaders: () => {}, depends: () => {}, isDataRequest: false, isSubRequest: false } as RequestEvent
    const response = incoming.url?.includes('/kit')
      ? await handle({ event, resolve: async current => Response.json({ ip: current.getClientAddress() }) })
      : await application.fetch(request, { remoteAddress: incoming.socket.remoteAddress })
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    outgoing.end(await response.text())
  }
  catch {
    outgoing.statusCode = 500
    outgoing.end('Request access fixture failed')
  }
})

try {
  await new Promise<void>(resolve => backend.listen(3000, '0.0.0.0', resolve))
  const forwarded = { 'x-forwarded-for': '203.0.113.77, 198.51.100.10', 'x-real-ip': '203.0.113.77', 'x-request-id': 'request-policy-real-ip' }
  for (const endpoint of ['ip', 'kit']) {
    const response = await fetch(`http://127.0.0.1:8080/api/v1/${endpoint}`, { headers: forwarded, signal: AbortSignal.timeout(5000) })
    assert.equal(response.status, 200)
    const body = await response.json() as { ip?: string, data?: { ip?: string } }
    assert.equal(endpoint === 'kit' ? body.ip : body.data?.ip, expected)
  }
  for (const endpoint of ['denied', 'kit-denied']) {
    for (const method of ['GET', 'OPTIONS']) {
      const response = await fetch(`http://127.0.0.1:8080/api/v1/${endpoint}`, { method, headers: forwarded, signal: AbortSignal.timeout(5000) })
      assert.equal(response.status, 403)
      const body = await response.json() as { error: { code: string, traceId: string } }
      assert.equal(body.error.code, 'hai:common:104')
      assert.equal(body.error.traceId, 'request-policy-real-ip')
    }
  }
  process.stdout.write(`REQUEST_ACCESS_IP_PASS:${JSON.stringify({ expectedIp: expected, hosts: ['serv', 'kit'], allowed: 200, denied: 403, forgedHeaders: '203.0.113.77, 198.51.100.10', privateProxy: process.env.HAI_DEPLOY_PRIVATE_PROXY })}\n`)
}
finally {
  backend.closeAllConnections()
  await new Promise<void>(resolve => backend.close(() => resolve()))
}
