/**
 * Kit A2A API Key 认证器测试
 *
 * 覆盖 createA2AApiKeyAuthenticator 和 resolveA2AConfig 的 'apiKey' 快捷方式。
 */

import type { RequestEvent } from '@sveltejs/kit'
import { describe, expect, it, vi } from 'vitest'

import { createA2AApiKeyAuthenticator } from '../src/modules/a2a/kit-a2a-auth.js'
import { resolveA2AConfig } from '../src/modules/a2a/kit-a2a-handle.js'

// ─── mock IAM ───

vi.mock('@h-ai/iam', () => ({
  iam: {
    apiKey: {
      verifyApiKey: vi.fn(),
    },
  },
}))

// 获取 mock 引用
async function getIamMock() {
  const { iam } = await import('@h-ai/iam')
  return iam.apiKey.verifyApiKey as ReturnType<typeof vi.fn>
}

// ─── 测试辅助 ───

function createMockEvent(overrides: {
  headers?: Record<string, string>
  searchParams?: Record<string, string>
} = {}): RequestEvent {
  const headers = new Headers(overrides.headers ?? {})
  const url = new URL('http://localhost/a2a')
  if (overrides.searchParams) {
    for (const [k, v] of Object.entries(overrides.searchParams)) {
      url.searchParams.set(k, v)
    }
  }
  return {
    request: { headers } as Request,
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
})
