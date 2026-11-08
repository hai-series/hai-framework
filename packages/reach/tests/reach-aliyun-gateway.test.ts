import type { IncomingHttpHeaders, Server } from 'node:http'
import type { AliyunSmsProviderConfig, ReachGatewayHook } from '../src/index.js'
import { Buffer } from 'node:buffer'
import { createHmac } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { HaiReachError, reach } from '../src/index.js'

interface ReceivedRequest {
  method: string | undefined
  path: string
  headers: IncomingHttpHeaders
  body: string
}

const requests: ReceivedRequest[] = []
const provider = {
  name: 'sms',
  type: 'aliyun-sms',
  accessKeyId: 'fixture-ak',
  accessKeySecret: 'fixture-sk',
  signName: '测试签名',
} as const
const message = {
  provider: 'sms',
  to: '13900000001',
  extra: { templateCode: 'SMS_FIXTURE' },
  vars: { value: '!\'()*~' },
}
let server: Server | undefined
let gatewayUrl: string
let reply: { status: number, body: string, location?: string }

beforeEach(async () => {
  requests.length = 0
  reply = { status: 200, body: '{"Code":"OK","BizId":"fixture-message"}' }
  server = createServer((request, response) => {
    const chunks: Uint8Array[] = []
    request.on('data', (chunk: Uint8Array) => chunks.push(chunk))
    request.on('end', () => {
      requests.push({
        method: request.method,
        path: request.url ?? '',
        headers: request.headers,
        body: Buffer.concat(chunks).toString(),
      })
      response.writeHead(reply.status, reply.location
        ? { location: reply.location }
        : {}).end(reply.body)
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing SMS gateway fixture address')
  gatewayUrl = `http://127.0.0.1:${address.port}/dx`
})

afterEach(async () => {
  vi.restoreAllMocks()
  await reach.close()
  await reldb.close()
  server?.closeAllConnections()
  await new Promise<void>((resolve) => {
    if (server)
      server.close(() => resolve())
    else
      resolve()
  })
  server = undefined
})

function initialize(fields: Omit<NonNullable<AliyunSmsProviderConfig['gateway']>, 'url' | 'allowInsecureHttp'> = {}, hook?: ReachGatewayHook) {
  return reach.init({
    providers: [
      {
        ...provider,
        gateway: { url: gatewayUrl, allowInsecureHttp: true, ...fields },
      },
    ],
  }, hook
    ? {
        gatewayHooks: { sms: hook },
      }
    : undefined)
}

it('向指定路径发送 POST 和空 JSON，按阿里云根路径对查询参数验签', async () => {
  expect((await initialize({
    headers: { 'X-Gateway-Credential': 'FIXTURE_GATEWAY_HEADER' },
    body: {},
  })).success).toBe(true)
  expect(await reach.send(message)).toMatchObject({
    success: true,
    data: { messageId: 'fixture-message' },
  })
  expect(requests).toHaveLength(1)
  const [request] = requests
  expect(request).toMatchObject({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-gateway-credential': 'FIXTURE_GATEWAY_HEADER' },
    body: '{}',
  })
  const url = new URL(request.path, gatewayUrl)
  expect(url.pathname).toBe('/dx')
  expect(url.searchParams.get('TemplateCode')).toBe('SMS_FIXTURE')
  expect(url.searchParams.get('TemplateParam')).toBe(JSON.stringify(message.vars))
  expect(url.search).toContain('%21%27%28%29%2A~')
  const signedFields = url.search.slice(1).split('&').filter(part => !part.startsWith('Signature='))
  const canonicalQuery = signedFields.sort().join('&')
  const expectedSignature = createHmac('sha1', 'fixture-sk&').update(`POST&%2F&${encodeURIComponent(canonicalQuery)}`).digest('base64')
  expect(url.searchParams.get('Signature')).toBe(expectedSignature)
})

it('动态函数读取已签名请求，按名称覆盖请求头并原样替换文本正文', async () => {
  const hook = vi.fn<ReachGatewayHook>(async ({ body, method, url, signal }) => {
    expect(body).toBe('{"old":true}')
    expect(method).toBe('POST')
    expect(new URL(url).searchParams.has('Signature')).toBe(true)
    expect(signal.aborted).toBe(false)
    return {
      headers: { 'x-client': 'dynamic', 'Content-Type': 'application/json' },
      body: '{ "new": true }',
    }
  })
  expect((await initialize({
    headers: { 'X-Client': 'static', 'X-Gateway-Other': 'FIXTURE_HEADER' },
    body: { old: true },
  }, hook)).success).toBe(true)
  expect(await reach.send(message)).toMatchObject({
    success: true,
    data: { messageId: 'fixture-message' },
  })
  expect(hook).toHaveBeenCalledTimes(1)
  expect(requests).toMatchObject([
    {
      headers: { 'x-client': 'dynamic', 'x-gateway-other': 'FIXTURE_HEADER', 'content-type': 'application/json' },
      body: '{ "new": true }',
    },
  ])
  expect(new URL(requests[0].path, gatewayUrl).href).toBe(hook.mock.calls[0][0].url)
  expect(reach.config?.providers[0]).toMatchObject({
    gateway: { url: gatewayUrl, allowInsecureHttp: true },
  })
  expect(JSON.stringify(reach.config)).not.toMatch(/FIXTURE_HEADER|"old"|fixture-sk|gatewayHooks/)
})

it('只补充请求头时保留静态正文，省略正文时发送无正文请求', async () => {
  expect((await initialize({
    body: ['static'],
  }, () => ({
    headers: { 'X-Trace': 'fixture' },
  }))).success).toBe(true)
  expect((await reach.send(message)).success).toBe(true)
  expect(requests[0]).toMatchObject({
    body: '["static"]',
    headers: { 'content-type': 'application/json', 'x-trace': 'fixture' },
  })
  expect((await initialize()).success).toBe(true)
  expect((await reach.send(message)).success).toBe(true)
  expect(requests[1].body).toBe('')
  expect(requests[1].headers['x-trace']).toBeUndefined()
})

it.each([
  'plain HTTP',
  'query',
  'fragment',
  'credentials',
  'host header',
])('初始化时拒绝非法网关配置 %s', async (kind) => {
  const gateway = { url: gatewayUrl, allowInsecureHttp: true, headers: {} }
  switch (kind) {
    case 'plain HTTP':
      gateway.allowInsecureHttp = false
      break
    case 'query':
      gateway.url += '?Action=Other'
      break
    case 'fragment':
      gateway.url += '#fragment'
      break
    case 'credentials':
      gateway.url = gatewayUrl.replace('://', '://fixture:private@')
      break
    case 'host header':
      gateway.headers = { Host: 'fixture.invalid' }
      break
  }
  expect(await reach.init({
    providers: [
      { ...provider, gateway },
    ],
  })).toMatchObject({
    success: false,
    error: { code: HaiReachError.CONFIG_ERROR.code },
  })
  expect(requests).toHaveLength(0)
})

it('函数只能绑定启用了网关的 Provider', async () => {
  const hook = () => ({ body: {} })
  expect(await reach.init({
    providers: [provider],
  }, {
    gatewayHooks: { sms: hook },
  })).toMatchObject({
    success: false,
    error: { code: HaiReachError.CONFIG_ERROR.code },
  })
  expect(await reach.init({
    providers: [
      {
        ...provider,
        gateway: { url: gatewayUrl, allowInsecureHttp: true },
      },
    ],
  }, {
    gatewayHooks: { missing: hook },
  })).toMatchObject({
    success: false,
    error: { code: HaiReachError.CONFIG_ERROR.code },
  })
})

it.each<ReachGatewayHook>([
  () => { throw new Error('FIXTURE_PRIVATE_HOOK_ERROR') },
  () => ({
    headers: { 'Content-Length': '100' },
  }),
])('函数异常或试图设置传输头时停止发送 %#', async (hook) => {
  const observations: unknown[] = []
  const stop = core.logger.observe(entry => observations.push(entry))
  try {
    expect((await initialize({
      body: { data: 'FIXTURE_PRIVATE_BODY' },
    }, hook)).success).toBe(true)
    const result = await reach.send(message)
    expect(result).toMatchObject({
      success: false,
      error: { code: HaiReachError.SEND_FAILED.code },
    })
    expect(JSON.stringify([result, observations, reach.config])).not.toMatch(/FIXTURE_PRIVATE|AccessKeyId=|Signature=/)
    expect(requests).toHaveLength(0)
  }
  finally {
    stop()
  }
})

it('异步函数超时即返回，迟到结果不触发发送', async () => {
  const timeout = new AbortController()
  const started = Promise.withResolvers<void>()
  const finished = Promise.withResolvers<{ body: string }>()
  const signal = vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(timeout.signal)
  const hook: ReachGatewayHook = () => {
    started.resolve()
    return finished.promise
  }
  expect((await initialize({}, hook)).success).toBe(true)
  const sending = reach.send(message)
  await started.promise
  expect(signal).toHaveBeenCalledWith(10_000)
  timeout.abort()
  expect(await sending).toMatchObject({
    success: false,
    error: { code: HaiReachError.SEND_FAILED.code },
  })
  finished.resolve({ body: 'late' })
  await new Promise(resolve => setImmediate(resolve))
  expect(requests).toHaveLength(0)
})

it('凭据在等待函数期间过期时不发请求', async () => {
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  const expiresAt = Date.now() + 60_000
  expect((await initialize({}, () => {
    vi.spyOn(Date, 'now').mockReturnValue(expiresAt)
    return { body: {} }
  })).success).toBe(true)
  const result = await reach.send({
    ...message,
    sensitive: true,
    expiresAt,
    idempotencyKey: 'gateway-expired',
  })
  expect(result).toMatchObject({
    success: false,
    error: { code: HaiReachError.SEND_FAILED.code },
  })
  expect(requests).toHaveLength(0)
})

it('关闭 Provider 后，在途函数返回也不发请求', async () => {
  const started = Promise.withResolvers<void>()
  const finished = Promise.withResolvers<{ body: string }>()
  expect((await initialize({}, () => {
    started.resolve()
    return finished.promise
  })).success).toBe(true)
  const sending = reach.send(message)
  await started.promise
  await reach.close()
  finished.resolve({ body: 'late' })
  expect(await sending).toMatchObject({
    success: false,
    error: { code: HaiReachError.SEND_FAILED.code },
  })
  expect(requests).toHaveLength(0)
})

it.each([
  [307, '{"Code":"OK"}'],
  [500, '{"Code":"OK"}'],
  [200, '{"Code":"FAIL","Message":"FIXTURE_PRIVATE_RECEIPT"}'],
  [204, ''],
  [200, '<html>FIXTURE_PRIVATE_RECEIPT</html>'],
  [
    200,
    JSON.stringify({
      Code: 'OK',
      padding: 'x'.repeat(65_536),
    }),
  ],
])('拒绝无效回执 %#，避免重定向或转发第三方错误详情', async (status, body) => {
  reply = { status, body, location: `${gatewayUrl}/redirected` }
  expect((await initialize()).success).toBe(true)
  const result = await reach.send(message)
  expect(result).toMatchObject({
    success: false,
    error: { code: HaiReachError.SEND_FAILED.code },
  })
  expect(JSON.stringify(result)).not.toContain('FIXTURE_PRIVATE_RECEIPT')
  expect(requests).toHaveLength(1)
})
