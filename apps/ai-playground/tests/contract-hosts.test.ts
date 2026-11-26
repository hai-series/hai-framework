import type { AiChatStreamEvent } from '@h-ai/api-contract'
import type { ServContext } from '@h-ai/serv'
import type { RequestEvent } from '@sveltejs/kit'
import { apiContract } from '@h-ai/api-contract'
import { core, HaiCommonError } from '@h-ai/core'
import { kit } from '@h-ai/kit'
import { serv } from '@h-ai/serv'
import { expect, it, vi } from 'vitest'
import { z } from 'zod'

const contract = apiContract.create({
  preview: apiContract.route({ method: 'POST', path: '/reports/preview' })
    .input(z.object({
      orderId: z.string(),
    }))
    .output(apiContract.haiResultSchema(z.object({
      summary: z.string(),
    }))),
  export: apiContract.route({ method: 'GET', path: '/reports/export' }).output(z.file()),
  report: apiContract.route({ method: 'GET', path: '/reports/latest' }).output(apiContract.haiResultSchema(z.string())),
  reportHeaders: apiContract.route({
    method: 'HEAD',
    path: '/reports/latest',
    inputStructure: 'detailed',
    successStatus: 202,
  })
    .input(z.object({
      query: z.object({
        format: z.literal('csv'),
      }),
    }))
    .output(apiContract.haiResultSchema(z.string())),
  chats: apiContract.extensions.ai.chats,
})
const http = {
  apiPrefix: '/console/api' as const,
  openapi: { path: '/console/openapi.json' as const },
  docs: { path: '/console/docs' as const, requireAuth: true },
}
const preview = vi.fn((orderId: string) => core.ok({ summary: `Order ${orderId}` }))
const report = vi.fn(async () => new File(['report'], 'report.txt', { type: 'text/plain' }))
const reportRead = vi.fn(() => core.ok('Latest report'))
const reportHead = vi.fn((format: string) => core.ok(`Latest report metadata for ${format}`))
const closeStream = vi.fn()
const procedures = serv.implement(contract)
  .context<ServContext>()
  .route('preview', ({ input }) => preview(input.orderId))
  .route('export')
  .permission('reports:export')
  .handleTransport(report)
  .route('report', reportRead)
  .route('reportHeaders', ({ input }) => reportHead(input.query.format))
  .route('chats.streamCompletion')
  .permission('reports:export')
  .handleTransport(async function* (): AsyncGenerator<AiChatStreamEvent> {
    try {
      yield {
        type: 'delta',
        id: 'report-delta',
        model: 'test-model',
        created: 1,
        choices: [
          {
            index: 0,
            delta: { content: 'Orders summary' },
            finish_reason: null,
          },
        ],
      }
      yield { type: 'done' }
    }
    finally {
      closeStream()
    }
  })
  .build()
const transportRoutes = [
  { procedure: contract.export, maxRequestBytes: 0 },
  { procedure: contract.chats.streamCompletion, maxRequestBytes: 128 },
]
const token = 'test-report-session'
async function verifyToken(candidate: string) {
  return candidate === token
    ? core.ok({
        userId: 'auditor',
        roles: ['auditor'],
        permissions: ['reports:export'],
      })
    : core.err(HaiCommonError.UNAUTHORIZED, 'Unrecognized test session')
}
const fallback = vi.fn(async () => new Response('SvelteKit page', { status: 202 }))

function newHosts(protectPreview = false) {
  const app = serv.createApp({
    contract,
    procedures,
    http,
    transportRoutes,
    auth: { verifyToken },
  })
  const handle = kit.createHandle({
    contract: serv.createContractHandler({
      contract,
      procedures,
      http,
      transportRoutes,
    }),
    auth: {
      verifyToken,
      loginUrl: '/console/auth/login',
      protectedPaths: protectPreview
        ? ['/console/api/reports/preview']
        : undefined,
    },
    logging: false,
  })
  return [
    async (request: Request) => app.fetch(request),
    async (request: Request) => {
      // 本用例由 fallback 模拟页面响应，因此不创建 SvelteKit 的 tracing span。
      const event: Omit<RequestEvent, 'tracing'> = {
        request,
        url: new URL(request.url),
        cookies: {
          get: () => undefined,
          getAll: () => [],
          parse: () => ({ name: '', value: '' }),
          set: vi.fn(),
          delete: vi.fn(),
          serialize: vi.fn(),
        },
        locals: { requestId: '', locale: 'zh-CN', playgroundOwner: 'test' },
        fetch: globalThis.fetch,
        getClientAddress: () => '127.0.0.1',
        params: {},
        platform: undefined,
        route: { id: null },
        setHeaders: vi.fn(),
        isDataRequest: false,
        isRemoteRequest: false,
        isSubRequest: false,
      }
      return await handle({ event: event as RequestEvent, resolve: fallback })
    },
  ] as const
}

it('在两个宿主使用同一契约，校验失败不会调用操作，未命中时 SvelteKit 保留页面解析', async () => {
  const [servFetch, kitFetch] = newHosts()
  preview.mockClear()
  for (const fetch of [servFetch, kitFetch]) {
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'report-123' },
    }
    const endpoint = 'https://example.test/console/api/reports/preview'
    const invalid = await fetch(new Request(endpoint, { ...options, body: '{}' }))
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toMatchObject({
      success: false,
      error: { code: HaiCommonError.VALIDATION_ERROR.code, traceId: 'report-123' },
    })
    const valid = await fetch(new Request(endpoint, { ...options, body: '{"orderId":"ORD-4"}' }))
    expect(valid.status).toBe(200)
    expect(await valid.json()).toEqual({
      success: true,
      data: { summary: 'Order ORD-4' },
    })
  }
  expect(preview).toHaveBeenCalledTimes(2)
  expect(await (await kitFetch(new Request('https://example.test/console/api/local-route'))).text()).toBe('SvelteKit page')
})

it('kit 子目录挂载的契约 API 沿用 HTTP 401 而非页面重定向', async () => {
  const [, kitFetch] = newHosts(true)
  const response = await kitFetch(new Request('https://example.test/console/api/reports/preview', { method: 'POST' }))
  expect(response.status).toBe(401)
  expect(response.headers.get('location')).toBeNull()
})

it('两个宿主都分发 OpenAPI 声明的 HEAD 操作并保留状态和头部', async () => {
  reportRead.mockClear()
  reportHead.mockClear()
  for (const fetch of newHosts()) {
    const url = 'https://example.test/console/api/reports/latest'
    const response = await fetch(new Request(`${url}?format=csv`, { method: 'HEAD' }))
    expect(response.status).toBe(202)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.body).toBeNull()
    expect(reportRead).not.toHaveBeenCalled()
    const invalid = await fetch(new Request(url, { method: 'HEAD' }))
    expect(invalid.status).toBe(400)
    expect(invalid.body).toBeNull()

    const spec = await fetch(new Request('https://example.test/console/openapi.json'))
    expect(await spec.json()).toMatchObject({
      paths: {
        '/reports/latest': {
          get: {},
          head: {
            parameters: [
              expect.objectContaining({ name: 'format', in: 'query', required: true }),
            ],
            responses: { 202: {} },
          },
        },
      },
    })
  }
  expect(reportHead).toHaveBeenCalledTimes(2)
  expect(reportHead).toHaveBeenLastCalledWith('csv')
})

it.each([
  { openapi: '/console/docs', docs: '/console/docs' },
  { openapi: '/console/_hai/scalar.js', docs: '/console/docs' },
] as const)('同一 URL $docs 与 $openapi 上的文档资源冲突时拒绝装配', ({ openapi, docs }) => {
  const options = {
    contract,
    procedures,
    http: {
      ...http,
      openapi: { path: openapi },
      docs: { path: docs, requireAuth: true },
    },
  }
  expect(() => serv.createApp(options)).toThrow('must use distinct HTTP paths')
  expect(() => serv.createContractHandler(options)).toThrow('must use distinct HTTP paths')
})

it('拒绝把文档页挂在已声明的 GET 或 HEAD 契约路径', () => {
  const options = {
    contract,
    procedures,
    http: {
      ...http,
      docs: { path: '/console/api/reports/latest/' as const, requireAuth: true },
    },
  }
  expect(() => serv.createApp(options)).toThrow('conflicts with a contract operation')
  expect(() => serv.createContractHandler(options)).toThrow('conflicts with a contract operation')
})

it('两个宿主在导出前执行权限检查，并为受保护文件和 API 文档采用相同的策略', async () => {
  report.mockClear()
  for (const fetch of newHosts()) {
    const anonymous = await fetch(new Request('https://example.test/console/api/reports/export'))
    expect(anonymous.status).toBe(401)
    const headers = { Authorization: `Bearer ${token}` }
    const authorized = await fetch(new Request('https://example.test/console/api/reports/export', { headers }))
    expect(authorized.headers.get('cache-control')).toBe('no-store')
    expect(authorized.headers.get('content-disposition')).toMatch(/^attachment;/)
    expect(await authorized.text()).toBe('report')

    const spec = await fetch(new Request('https://example.test/console/openapi.json'))
    expect(await spec.json()).toMatchObject({
      servers: [
        { url: '/console/api' },
      ],
      paths: {
        '/reports/preview': { post: {} },
      },
    })
    const docs = 'https://example.test/console/docs'
    const deniedDocs = await fetch(new Request(docs))
    expect(deniedDocs.status).toBe(401)
    expect(deniedDocs.headers.get('cache-control')).toBe('private, no-store')
    const allowedDocs = await fetch(new Request(docs, { headers }))
    expect(allowedDocs.headers.get('cache-control')).toBe('private, no-store')
    expect(await allowedDocs.text()).toContain('data-url="openapi.json"')
    const headDocs = await fetch(new Request(docs, { method: 'HEAD', headers }))
    expect(headDocs.status).toBe(200)
    expect(headDocs.headers.get('cache-control')).toBe('private, no-store')
    expect(headDocs.body).toBeNull()
  }
  expect(report).toHaveBeenCalledTimes(2)
})

it('为两个宿主并行使用同一 Request 的导出响应分别保留保护头', async () => {
  const [servFetch, kitFetch] = newHosts()
  const request = new Request('https://example.test/console/api/reports/export', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  report.mockImplementationOnce(async () => {
    entered.resolve()
    await release.promise
    return new File(['first report'], 'report.txt', { type: 'text/plain' })
  })
  const first = servFetch(request)
  let second: Response
  try {
    await entered.promise
    second = await kitFetch(request)
  }
  finally {
    release.resolve()
  }
  const firstResponse = await first
  for (const response of [firstResponse, second]) {
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-disposition')).toMatch(/^attachment;/)
  }
  expect(await firstResponse.text()).toBe('first report')
  expect(await second.text()).toBe('report')
})

it('两个宿主在读取事件流请求前鉴权和限长，取消消费后释放迭代器', async () => {
  closeStream.mockClear()
  for (const [index, fetch] of newHosts().entries()) {
    const endpoint = 'https://example.test/console/api/ai/chats/completions/stream'
    const authorization = `Bearer ${token}`
    const request = (content: string, authenticated = true) => new Request(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authenticated
          ? { authorization }
          : {}),
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content },
        ],
      }),
    })
    expect((await fetch(request('x'.repeat(256), false))).status).toBe(401)
    expect((await fetch(request('x'.repeat(256)))).status).toBe(413)
    const response = await fetch(request('Summarize the orders'))
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(response.headers.get('cache-control')).toBe('no-store')
    const reader = response.body?.getReader()
    if (!reader)
      throw new Error('Expected a response stream')
    try {
      const decoder = new TextDecoder()
      let payload = ''
      for (let frame = 0; frame < 4 && !payload.includes('Orders summary'); frame++) {
        const chunk = await reader.read()
        if (chunk.done)
          break
        payload += decoder.decode(chunk.value, { stream: true })
      }
      expect(payload).toContain('Orders summary')
    }
    finally {
      await reader.cancel()
    }
    await vi.waitFor(() => expect(closeStream).toHaveBeenCalledTimes(index + 1))
  }
})
