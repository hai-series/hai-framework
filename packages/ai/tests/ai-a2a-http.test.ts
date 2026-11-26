import { randomUUID } from 'node:crypto'
import { core, HaiCommonError } from '@h-ai/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ai } from '../src/index.js'

const origin = 'https://orders.example.test'
const requestId = 'orders-http-test'

function post(path: string, body: BodyInit, init: RequestInit = {}): Request {
  return new Request(origin + path, { ...init, method: 'POST', body })
}

function sendMessage(path: string, method = 'SendMessage', init?: RequestInit): Request {
  return post(path, JSON.stringify({
    jsonrpc: '2.0',
    id: 'orders',
    method,
    params: {
      message: {
        messageId: randomUUID(),
        role: 'ROLE_USER',
        parts: [
          { text: 'Report the open orders' },
        ],
      },
    },
  }), init)
}

async function configure(rpcPath: string, location: 'header' | 'query' = 'header'): Promise<void> {
  const result = await ai.init({
    a2a: {
      agentCard: { name: 'Orders Assistant', url: origin + rpcPath },
      security: {
        apiKey: { in: location, name: 'Orders-Partner-Key' },
      },
    },
  })
  expect(result.success).toBe(true)
}

afterEach(() => ai.close())

function registerUnusedExecutor() {
  expect(ai.a2a.registerExecutor({
    async execute() { throw new Error('Unexpected executor call') },
    async cancelTask() {},
  }).success).toBe(true)
}

describe('ai.a2a.createHttpHandler', () => {
  it('公开 Agent Card，未匹配的方法和路径继续交给宿主', async () => {
    await configure('/a2a')
    registerUnusedExecutor()
    const authenticate = vi.fn(async () => null)
    const a2a = ai.a2a.createHttpHandler({ authenticate })
    expect(a2a.cardPath).toBe('/.well-known/agent-card.json')
    expect(a2a.rpcPath).toBe('/a2a')
    const card = await a2a.handleRequest(new Request(origin + a2a.cardPath), requestId)
    expect(card?.status).toBe(200)
    expect(card?.headers.get('X-Request-Id')).toBe(requestId)
    expect(await card?.json()).toMatchObject({
      supportedInterfaces: [
        { url: origin + a2a.rpcPath, protocolBinding: 'JSONRPC' },
      ],
    })
    expect(await a2a.handleRequest(new Request(origin + a2a.rpcPath))).toBeNull()
    expect(await a2a.handleRequest(post(`${a2a.rpcPath}/other`, '{}'))).toBeNull()
    expect(await a2a.handleRequest(post(a2a.cardPath, '{}'))).toBeNull()
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('发布 HTTP 入口前要求 AI 初始化、A2A 配置和已注册的执行器', async () => {
    const publish = () => ai.a2a.createHttpHandler({ authenticate: false })
    expect(publish).toThrow()
    expect((await ai.init({})).success).toBe(true)
    expect(publish).toThrow()
    await ai.close()
    await configure('/a2a')
    expect(publish).toThrow()
    registerUnusedExecutor()
    expect(publish().rpcPath).toBe('/a2a')
  })

  it('拒绝会冲突或不能精确匹配的端点，并要求显式认证策略', async () => {
    await configure('/a2a')
    registerUnusedExecutor()
    for (const rpcPath of [
      '/events*',
      '/events/',
      '/events//rpc',
      '/events/../rpc',
      '/events?q=1',
      '/events#rpc',
      '/',
    ] as const)
      expect(() => ai.a2a.createHttpHandler({ rpcPath, authenticate: false })).toThrow(TypeError)
    expect(() => ai.a2a.createHttpHandler({ cardPath: '/events', rpcPath: '/events', authenticate: false })).toThrow(TypeError)
    expect(() => Reflect.apply(ai.a2a.createHttpHandler, ai.a2a, [{}])).toThrow(TypeError)
  })

  it.each(['header', 'query'] as const)('遵守 Agent Card 的 %s API Key 设置，将核验后的权限交给执行器', async (location) => {
    const rpcPath = '/console/backend/a2a'
    await configure(rpcPath, location)
    const verifiedCaller = vi.fn()
    const registration = ai.a2a.registerExecutor({
      async execute(context, bus) {
        const caller = ai.a2a.getCallerIdentity(context)
        verifiedCaller(context.context.user?.userName, caller)
        const canRead = core.auth.matchPermission('orders:read', caller?.permissions ?? [])
        bus.publish(ai.AgentEvent.message(ai.Message.fromJSON({
          messageId: 'agent-response',
          role: 'ROLE_AGENT',
          parts: [
            {
              text: canRead ? 'Three orders are open' : 'Reading orders was not authorized',
            },
          ],
        })))
        bus.finished()
      },
      async cancelTask() {},
    })
    expect(registration.success).toBe(true)
    const verifyApiKey = vi.fn(async (key: string) => key === 'partner-fixture'
      ? core.ok({
          id: 'key-1',
          userId: 'partner-1',
          scopes: ['orders:read', 'orders:write'],
          permissions: ['orders:read'],
        })
      : core.err(HaiCommonError.UNAUTHORIZED))
    const a2a = ai.a2a.createHttpHandler({
      cardPath: '/console/.well-known/agent-card.json',
      rpcPath,
      authenticate: { verifyApiKey },
    })
    expect((await a2a.handleRequest(new Request(origin + a2a.cardPath)))?.status).toBe(200)
    expect((await a2a.handleRequest(sendMessage(rpcPath)))?.status).toBe(401)
    expect(verifyApiKey).not.toHaveBeenCalled()

    for (const credential of ['wrong-fixture', 'partner-fixture']) {
      const request = location === 'header'
        ? sendMessage(rpcPath, 'SendMessage', {
            headers: { 'Orders-Partner-Key': credential },
          })
        : sendMessage(`${rpcPath}?Orders-Partner-Key=${credential}`)
      const response = await a2a.handleRequest(request, requestId)
      expect(verifyApiKey).toHaveBeenLastCalledWith(credential)
      if (credential === 'wrong-fixture') {
        expect(response?.status).toBe(401)
        expect(await response?.json()).toMatchObject({
          error: { code: 'A2A_AUTH_FAILED' },
        })
      }
      else {
        expect(response?.status).toBe(200)
        expect(await response?.json()).toMatchObject({
          jsonrpc: '2.0',
          id: 'orders',
          result: {
            message: {
              parts: [
                { text: 'Three orders are open' },
              ],
            },
          },
        })
      }
    }
    expect(verifiedCaller).toHaveBeenCalledExactlyOnceWith('partner-1', {
      agentId: 'partner-1',
      apiKeyId: 'key-1',
      scopes: ['orders:read', 'orders:write'],
      permissions: ['orders:read'],
    })
  })

  it('对无效 JSON 和超限正文返回不同状态，认证源故障也不会进入协议层', async () => {
    await configure('/a2a')
    registerUnusedExecutor()
    const a2a = ai.a2a.createHttpHandler({ authenticate: false })
    const badJson = await a2a.handleRequest(post('/a2a', '{'))
    expect(badJson?.status).toBe(400)
    expect(await badJson?.json()).toMatchObject({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700 },
    })
    const oversized = await a2a.handleRequest(post('/a2a', 'x'.repeat(2 * 1024 * 1024 + 1)))
    expect(oversized?.status).toBe(413)
    expect(await oversized?.json()).toMatchObject({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600 },
    })

    const unavailable = ai.a2a.createHttpHandler({
      async authenticate() { throw new Error('private fixture detail') },
    })
    const response = await unavailable.handleRequest(post('/a2a', '{}'))
    expect(response?.status).toBe(503)
    expect(await response?.text()).not.toContain('private fixture detail')

    const unavailableApiKey = ai.a2a.createHttpHandler({
      authenticate: {
        async verifyApiKey() { return core.err(HaiCommonError.INTERNAL_ERROR, 'private repository detail') },
      },
    })
    const apiKeyResponse = await unavailableApiKey.handleRequest(sendMessage('/a2a', 'SendMessage', {
      headers: { 'Orders-Partner-Key': 'partner-fixture' },
    }))
    expect(apiKeyResponse?.status).toBe(503)
    expect(await apiKeyResponse?.json()).toMatchObject({
      error: { code: 'A2A_AUTH_UNAVAILABLE' },
    })
  })

  it.each(['request', 'reader'] as const)('sSE %s 断开时停止等待下一帧，已启动任务继续并保持其归属', async (cancelBy) => {
    await configure('/a2a')
    const executor = Promise.withResolvers<void>()
    const cancelTask = vi.fn(async () => {})
    const registration = ai.a2a.registerExecutor({
      async execute(context, bus) {
        await executor.promise
        bus.publish(ai.AgentEvent.statusUpdate(ai.TaskStatusUpdateEvent.fromJSON({
          taskId: context.taskId,
          contextId: context.contextId,
          status: { state: 'TASK_STATE_COMPLETED' },
        })))
        bus.finished()
      },
      cancelTask,
    })
    expect(registration.success).toBe(true)
    const a2a = ai.a2a.createHttpHandler({
      async authenticate(request) {
        return { agentId: request.headers.get('X-Test-User') ?? 'orders-partner' }
      },
    })
    const controller = new AbortController()
    try {
      const response = await a2a.handleRequest(sendMessage('/a2a', 'SendStreamingMessage', { signal: controller.signal }), requestId)
      expect(response?.headers.get('Content-Type')).toBe('text/event-stream')
      const reader = response!.body!.getReader()
      const first = await reader.read()
      const payload = JSON.parse(new TextDecoder().decode(first.value).replace(/^data: /, ''))
      expect(payload).toMatchObject({
        jsonrpc: '2.0',
        id: 'orders',
        result: {
          task: {
            id: expect.any(String),
          },
        },
      })
      const getTask = (user: string) => a2a.handleRequest(post('/a2a', JSON.stringify({
        jsonrpc: '2.0',
        id: 'task-status',
        method: 'GetTask',
        params: { id: payload.result.task.id },
      }), {
        headers: { 'X-Test-User': user },
      }))

      const next = reader.read()
      if (cancelBy === 'request')
        controller.abort()
      else
        await reader.cancel()
      expect(await next).toMatchObject({ done: true })
      expect(cancelTask).not.toHaveBeenCalled()
      expect(await (await getTask('other-partner'))?.json()).toMatchObject({
        error: { code: -32001 },
      })
      executor.resolve()
      await vi.waitFor(async () => {
        expect(await (await getTask('orders-partner'))?.json()).toMatchObject({
          result: {
            status: { state: 'TASK_STATE_COMPLETED' },
          },
        })
      })
    }
    finally {
      executor.resolve()
    }
  }, 10_000)
})
