import { describe, expect, it, vi } from 'vitest'

import { createA2AClient } from '../src/client/ai-a2a-client.js'

describe('createA2AClient', () => {
  it('默认通过 /.well-known/agent.json 发现 Agent Card', async () => {
    const agentCardPayload = {
      name: 'agent',
      description: 'test agent',
      url: 'https://example.com',
      version: '1.0.0',
      protocolVersion: '0.3.0',
      defaultInputModes: ['text'],
      defaultOutputModes: ['text'],
      capabilities: {},
      skills: [],
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
        },
      },
      security: [{ apiKey: [] }],
    }
    const api = {
      get: vi.fn(async () => ({
        success: true,
        data: agentCardPayload,
      })),
      post: vi.fn(),
      stream: vi.fn(),
    }

    const client = createA2AClient(api)
    const card = await client.getAgentCard()

    expect(card).toEqual(agentCardPayload)
    expect((card as Record<string, unknown>).protocolVersion).toBe('0.3.0')
    expect((card as Record<string, unknown>).securitySchemes).toEqual({
      apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
      },
    })
    expect((card as Record<string, unknown>).security).toEqual([{ apiKey: [] }])
    expect(api.get).toHaveBeenCalledWith('/.well-known/agent.json')
  })

  it('发现端点失败时抛出错误', async () => {
    const api = {
      get: vi.fn(async () => ({
        success: false,
        error: { message: 'not found' },
      })),
      post: vi.fn(),
      stream: vi.fn(),
    }

    const client = createA2AClient(api)

    await expect(client.getAgentCard()).rejects.toThrow('A2A get agent card failed: not found')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('sendRequest 使用默认 /a2a JSON-RPC 端点', async () => {
    const api = {
      get: vi.fn(),
      post: vi.fn(async () => ({
        success: true,
        data: { jsonrpc: '2.0', id: '1', result: { ok: true } },
      })),
      stream: vi.fn(),
    }

    const client = createA2AClient(api)
    const response = await client.sendRequest({ jsonrpc: '2.0', id: '1', method: 'message/send', params: {} })

    expect(response).toEqual({ jsonrpc: '2.0', id: '1', result: { ok: true } })
    expect(api.post).toHaveBeenCalledWith('/a2a', { jsonrpc: '2.0', id: '1', method: 'message/send', params: {} })
  })
})
