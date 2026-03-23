/**
 * Kit A2A API Key 认证器测试
 *
 * 覆盖 createA2AApiKeyAuthenticator 和 resolveA2AConfig 的 'apiKey' 快捷方式。
 */

import type { RequestEvent } from '@sveltejs/kit'
import { describe, expect, it, vi } from 'vitest'

import { createA2AApiKeyAuthenticator } from '../src/modules/a2a/kit-a2a-auth.js'
import { createA2AHandler, createAgentCardHandler } from '../src/modules/a2a/kit-a2a-helpers.js'
import { handleA2ARequest, resolveA2AConfig } from '../src/modules/a2a/kit-a2a-handle.js'

// ─── mock IAM ───

const { verifyApiKeyMock } = vi.hoisted(() => ({
  verifyApiKeyMock: vi.fn(),
}))

vi.mock('@h-ai/iam', () => ({
  iam: {
    apiKey: {
      verifyApiKey: verifyApiKeyMock,
    },
  },
}), { virtual: true })

// 获取 mock 引用
async function getIamMock() {
  return verifyApiKeyMock
}

// ─── 测试辅助 ───

function createMockEvent(overrides: {
  headers?: Record<string, string>
  searchParams?: Record<string, string>
  path?: string
  method?: string
  jsonBody?: unknown
} = {}): RequestEvent {
  const headers = new Headers(overrides.headers ?? {})
  const url = new URL(`http://localhost${overrides.path ?? '/a2a'}`)
  if (overrides.searchParams) {
    for (const [k, v] of Object.entries(overrides.searchParams)) {
      url.searchParams.set(k, v)
    }
  }
  return {
    request: {
      headers,
      method: overrides.method ?? 'POST',
      json: async () => overrides.jsonBody ?? {},
    } as unknown as Request,
    url,
  } as unknown as RequestEvent
}

// ─── createA2AApiKeyAuthenticator ───

describe('createA2AApiKeyAuthenticator', () => {
  it('从 header 提取 API Key 验证成功', async () => {
    const verifyMock = await getIamMock()
    verifyMock.mockResolvedValueOnce({
      success: true,
      data: { id: 'key-1', userId: 'user-1', scopes: ['read'] },
    })

    const auth = createA2AApiKeyAuthenticator({ in: 'header', name: 'x-api-key' })
    const result = await auth(createMockEvent({ headers: { 'x-api-key': 'hai_abc123' } }))

    expect(result).toEqual({
      agentId: 'user-1',
      apiKeyId: 'key-1',
      scopes: ['read'],
    })
    expect(verifyMock).toHaveBeenCalledWith('hai_abc123')
  })

  it('从 query 提取 API Key 验证成功', async () => {
    const verifyMock = await getIamMock()
    verifyMock.mockResolvedValueOnce({
      success: true,
      data: { id: 'key-2', userId: 'user-2', scopes: [] },
    })

    const auth = createA2AApiKeyAuthenticator({ in: 'query', name: 'api_key' })
    const result = await auth(createMockEvent({ searchParams: { api_key: 'hai_xyz789' } }))

    expect(result).toEqual({
      agentId: 'user-2',
      apiKeyId: 'key-2',
      scopes: [],
    })
  })

  it('无 API Key 时返回 null（匿名请求）', async () => {
    const auth = createA2AApiKeyAuthenticator({ in: 'header', name: 'x-api-key' })
    const result = await auth(createMockEvent())

    expect(result).toBeNull()
  })

  it('验证失败时返回 null', async () => {
    const verifyMock = await getIamMock()
    verifyMock.mockResolvedValueOnce({
      success: false,
      error: { code: 5301, message: 'Invalid API Key' },
    })

    const auth = createA2AApiKeyAuthenticator({ in: 'header', name: 'x-api-key' })
    const result = await auth(createMockEvent({ headers: { 'x-api-key': 'hai_invalid' } }))

    expect(result).toBeNull()
  })
})

// ─── resolveA2AConfig 'apiKey' 快捷方式 ───

describe('resolveA2AConfig — apiKey authenticate', () => {
  it('authenticate: "apiKey" 自动创建认证函数', () => {
    const operations = {
      getAgentCard: () => ({
        success: true,
        data: {
          name: 'test',
          url: 'http://localhost',
          security: { apiKey: { in: 'header' as const, name: 'x-api-key' } },
        },
      }),
      handleRequest: vi.fn(),
    }

    const resolved = resolveA2AConfig({
      operations,
      authenticate: 'apiKey',
    })

    expect(resolved).not.toBeNull()
    expect(typeof resolved!.authenticate).toBe('function')
  })

  it('authenticate: 函数直接透传', () => {
    const customAuth = vi.fn()
    const operations = {
      getAgentCard: () => ({ success: true, data: { name: 'test', url: 'http://localhost' } }),
      handleRequest: vi.fn(),
    }

    const resolved = resolveA2AConfig({
      operations,
      authenticate: customAuth,
    })

    expect(resolved!.authenticate).toBe(customAuth)
  })

  it('无 authenticate 时为 undefined', () => {
    const operations = {
      getAgentCard: () => ({ success: true, data: { name: 'test', url: 'http://localhost' } }),
      handleRequest: vi.fn(),
    }

    const resolved = resolveA2AConfig({ operations })

    expect(resolved!.authenticate).toBeUndefined()
  })

  it('"apiKey" 无 security 配置时使用默认值', async () => {
    const verifyMock = await getIamMock()
    verifyMock.mockResolvedValueOnce({
      success: true,
      data: { id: 'key-1', userId: 'user-1', scopes: [] },
    })

    const operations = {
      getAgentCard: () => ({
        success: true,
        data: { name: 'test', url: 'http://localhost' },
      }),
      handleRequest: vi.fn(),
    }

    const resolved = resolveA2AConfig({
      operations,
      authenticate: 'apiKey',
    })

    // 使用默认 header: x-api-key
    const result = await resolved!.authenticate!(
      createMockEvent({ headers: { 'x-api-key': 'hai_test123' } }),
    )
    expect(result).toEqual({
      agentId: 'user-1',
      apiKeyId: 'key-1',
      scopes: [],
    })
  })

  it('简单模式下 security.apiKey 会自动启用鉴权', async () => {
    const verifyMock = await getIamMock()
    verifyMock.mockResolvedValueOnce({
      success: true,
      data: { id: 'key-3', userId: 'user-3', scopes: ['a2a:call'] },
    })

    const operations = {
      getAgentCard: () => ({
        success: true,
        data: {
          name: 'secure-agent',
          url: 'http://localhost',
          security: { apiKey: { in: 'header' as const, name: 'x-api-key' } },
        },
      }),
      handleRequest: vi.fn(),
    }

    const resolved = resolveA2AConfig(operations)
    const result = await resolved!.authenticate!(
      createMockEvent({ headers: { 'x-api-key': 'hai_secure' } }),
    )

    expect(result).toEqual({
      agentId: 'user-3',
      apiKeyId: 'key-3',
      scopes: ['a2a:call'],
    })
  })

  it('"apiKey" 在请求时读取最新 Agent Card security 配置', async () => {
    const verifyMock = await getIamMock()
    verifyMock.mockResolvedValueOnce({
      success: true,
      data: { id: 'key-4', userId: 'user-4', scopes: ['a2a:call'] },
    })

    let initialized = false
    const operations = {
      getAgentCard: () => initialized
        ? ({
            success: true,
            data: {
              name: 'secure-agent',
              url: 'http://localhost',
              security: { apiKey: { in: 'query' as const, name: 'api_key' } },
            },
          })
        : ({ success: false, error: { message: 'not initialized' } }),
      handleRequest: vi.fn(async (_body: unknown, context?: Record<string, unknown>) => ({ streaming: false, body: { context } })),
    }

    const resolved = resolveA2AConfig({
      operations,
      authenticate: 'apiKey',
    })

    initialized = true

    const response = await handleA2ARequest(
      createMockEvent({ path: '/a2a', method: 'POST', searchParams: { api_key: 'hai_query_key' }, jsonBody: { jsonrpc: '2.0', id: '1' } }),
      'req_test',
      resolved!,
    )

    expect(response).not.toBeNull()
    expect(response!.status).toBe(200)
    expect(verifyMock).toHaveBeenCalledWith('hai_query_key')
    expect(operations.handleRequest).toHaveBeenCalledWith(
      { jsonrpc: '2.0', id: '1' },
      {
        agentId: 'user-4',
        apiKeyId: 'key-4',
        scopes: ['a2a:call'],
      },
    )
  })

  it('简单模式在请求时按最新 Agent Card security 启用鉴权', async () => {
    const verifyMock = await getIamMock()
    verifyMock.mockResolvedValueOnce({
      success: true,
      data: { id: 'key-5', userId: 'user-5', scopes: ['a2a:call'] },
    })

    let initialized = false
    const operations = {
      getAgentCard: () => initialized
        ? ({
            success: true,
            data: {
              name: 'secure-agent',
              url: 'http://localhost',
              security: { apiKey: { in: 'query' as const, name: 'api_key' } },
            },
          })
        : ({ success: false, error: { message: 'not initialized' } }),
      handleRequest: vi.fn(async (_body: unknown, context?: Record<string, unknown>) => ({ streaming: false, body: { context } })),
    }

    const resolved = resolveA2AConfig(operations)
    initialized = true

    const response = await handleA2ARequest(
      createMockEvent({ path: '/a2a', method: 'POST', searchParams: { api_key: 'hai_auto_key' }, jsonBody: { jsonrpc: '2.0', id: '1' } }),
      'req_test',
      resolved!,
    )

    expect(response).not.toBeNull()
    expect(response!.status).toBe(200)
    expect(verifyMock).toHaveBeenCalledWith('hai_auto_key')
    expect(operations.handleRequest).toHaveBeenCalledWith(
      { jsonrpc: '2.0', id: '1' },
      {
        agentId: 'user-5',
        apiKeyId: 'key-5',
        scopes: ['a2a:call'],
      },
    )
  })
})

describe('handleA2ARequest — A2A auth enforcement', () => {
  it('POST /a2a 缺少有效 API Key 时返回 401 且不执行 handleRequest', async () => {
    const operations = {
      getAgentCard: () => ({
        success: true,
        data: {
          name: 'secure-agent',
          url: 'http://localhost',
          security: { apiKey: { in: 'header' as const, name: 'x-api-key' } },
        },
      }),
      handleRequest: vi.fn(async () => ({ streaming: false, body: { ok: true } })),
    }

    const resolved = resolveA2AConfig(operations)
    const response = await handleA2ARequest(
      createMockEvent({ path: '/a2a', method: 'POST', jsonBody: { jsonrpc: '2.0', id: '1' } }),
      'req_test',
      resolved!,
    )

    expect(response).not.toBeNull()
    expect(response!.status).toBe(401)
    expect(operations.handleRequest).not.toHaveBeenCalled()
  })
})

describe('handleA2ARequest — Agent Card discovery payload', () => {
  it('GET /.well-known/agent.json 返回协议兼容 Agent Card', async () => {
    const operations = {
      getAgentCard: () => ({
        success: true,
        data: {
          name: 'secure-agent',
          description: 'a2a test agent',
          url: 'http://localhost',
          version: '1.2.3',
          skills: [{ id: 'chat', name: 'Chat' }],
          security: { apiKey: { in: 'query' as const, name: 'api_key' } },
        },
      }),
      handleRequest: vi.fn(),
    }

    const resolved = resolveA2AConfig(operations)
    const response = await handleA2ARequest(
      createMockEvent({ path: '/.well-known/agent.json', method: 'GET' }),
      'req_test',
      resolved!,
    )

    expect(response).not.toBeNull()
    expect(response!.status).toBe(200)
    const body = await response!.json() as Record<string, unknown>
    expect(body.protocolVersion).toBe('0.3.0')
    expect(body.defaultInputModes).toEqual(['text'])
    expect(body.defaultOutputModes).toEqual(['text'])
    expect(body.securitySchemes).toEqual({
      apiKey: { type: 'apiKey', in: 'query', name: 'api_key' },
    })
    expect(body.security).toEqual([{ apiKey: [] }])
  })
})

describe('createAgentCardHandler', () => {
  it('会将简化配置归一化为协议兼容 Agent Card', async () => {
    const handler = createAgentCardHandler(() => ({
      name: 'secure-agent',
      url: 'http://localhost',
      security: { apiKey: { in: 'header' as const, name: 'x-custom-key' } },
    }))

    const response = await handler(createMockEvent({ path: '/.well-known/agent.json', method: 'GET' }))
    const body = await response.json() as Record<string, unknown>
    expect(body.protocolVersion).toBe('0.3.0')
    expect(body.securitySchemes).toEqual({
      apiKey: { type: 'apiKey', in: 'header', name: 'x-custom-key' },
    })
    expect(body.security).toEqual([{ apiKey: [] }])
  })
})

describe('createA2AHandler — apiKey config', () => {
  it('authenticate: \"apiKey\" 支持 query 参数配置', async () => {
    const verifyMock = await getIamMock()
    verifyMock.mockResolvedValueOnce({
      success: true,
      data: { id: 'key-query', userId: 'user-query', scopes: ['a2a:call'] },
    })

    const handleRequest = vi.fn(async (_body: unknown, context?: Record<string, unknown>) => ({
      streaming: false,
      body: { context },
    }))
    const handler = createA2AHandler(handleRequest, {
      authenticate: 'apiKey',
      apiKey: { in: 'query', name: 'api_key' },
    })

    const response = await handler(createMockEvent({
      path: '/a2a',
      method: 'POST',
      searchParams: { api_key: 'hai_query_key' },
      jsonBody: { jsonrpc: '2.0', id: '1' },
    }))

    expect(response.status).toBe(200)
    const body = await response.json() as { context: Record<string, unknown> }
    expect(body.context).toEqual({
      agentId: 'user-query',
      apiKeyId: 'key-query',
      scopes: ['a2a:call'],
    })
    expect(verifyMock).toHaveBeenCalledWith('hai_query_key')
    expect(handleRequest).toHaveBeenCalledTimes(1)
  })

  it('authenticate: \"apiKey\" 支持自定义 header 名', async () => {
    const verifyMock = await getIamMock()
    verifyMock.mockResolvedValueOnce({
      success: true,
      data: { id: 'key-header', userId: 'user-header', scopes: [] },
    })

    const handleRequest = vi.fn(async (_body: unknown, context?: Record<string, unknown>) => ({
      streaming: false,
      body: { context },
    }))
    const handler = createA2AHandler(handleRequest, {
      authenticate: 'apiKey',
      apiKey: { in: 'header', name: 'x-custom-key' },
    })

    const response = await handler(createMockEvent({
      path: '/a2a',
      method: 'POST',
      headers: { 'x-custom-key': 'hai_custom_key' },
      jsonBody: { jsonrpc: '2.0', id: '2' },
    }))

    expect(response.status).toBe(200)
    const body = await response.json() as { context: Record<string, unknown> }
    expect(body.context).toEqual({
      agentId: 'user-header',
      apiKeyId: 'key-header',
      scopes: [],
    })
    expect(verifyMock).toHaveBeenCalledWith('hai_custom_key')
    expect(handleRequest).toHaveBeenCalledTimes(1)
  })
})
