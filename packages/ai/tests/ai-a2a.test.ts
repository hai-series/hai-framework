/**
 * AI A2A 子模块单元测试
 *
 * 覆盖 buildAgentCard、共享 journal 与 createA2AOperations 工厂。
 */

import type { Task } from '@a2a-js/sdk'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildAgentCard } from '../src/a2a/ai-a2a-card.js'
import { AIConfigSchema } from '../src/ai-config.js'
import { ai } from '../src/ai-main.js'
import { HaiAIError } from '../src/ai-types.js'

afterEach(() => ai.close())

// ─── buildAgentCard ───

describe('buildAgentCard', () => {
  it('最简配置返回完整 AgentCard', () => {
    const card = buildAgentCard({ name: 'test-agent', url: 'https://example.com' })

    expect(card.name).toBe('test-agent')
    expect(card.url).toBe('https://example.com')
    expect(card.protocolVersion).toBe('0.3.0')
    expect(card.defaultInputModes).toEqual(['text/plain'])
    expect(card.defaultOutputModes).toEqual(['text/plain'])
    expect(card.capabilities).toEqual({ streaming: true, pushNotifications: false })
    expect(card.description).toBe('')
    expect(card.version).toBe('1.0.0')
    expect(card.skills).toEqual([])
  })

  it('自定义 description、version、skills', () => {
    const card = buildAgentCard({
      name: 'my-agent',
      description: 'My Agent',
      url: 'https://my.agent',
      version: '2.0.0',
      skills: [
        { id: 'chat', name: 'Chat', description: 'General chat', tags: ['general'] },
        { id: 'translate', name: 'Translate' },
      ],
    })

    expect(card.description).toBe('My Agent')
    expect(card.version).toBe('2.0.0')
    expect(card.skills).toHaveLength(2)
    expect(card.skills[0]).toEqual({
      id: 'chat',
      name: 'Chat',
      description: 'General chat',
      tags: ['general'],
    })
    // skill 缺省 description 和 tags 时补默认值
    expect(card.skills[1].description).toBe('')
    expect(card.skills[1].tags).toEqual([])
  })

  it('配置 security.apiKey 时输出 securitySchemes 和 security', () => {
    const card = buildAgentCard({
      name: 'secure-agent',
      url: 'https://example.com',
      security: {
        apiKey: { in: 'header', name: 'x-api-key' },
      },
    })

    expect(card.securitySchemes).toEqual({
      apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' },
    })
    expect(card.security).toEqual([{ apiKey: [] }])
  })

  it('security.apiKey 使用 query 传递', () => {
    const card = buildAgentCard({
      name: 'query-agent',
      url: 'https://example.com',
      security: {
        apiKey: { in: 'query', name: 'api_key' },
      },
    })

    expect(card.securitySchemes).toEqual({
      apiKey: { type: 'apiKey', in: 'query', name: 'api_key' },
    })
    expect(card.security).toEqual([{ apiKey: [] }])
  })

  it('未配置 security 时无 securitySchemes 和 security 字段', () => {
    const card = buildAgentCard({ name: 'open-agent', url: 'https://example.com' })

    expect(card.securitySchemes).toBeUndefined()
    expect(card.security).toBeUndefined()
  })
})

// ─── A2A Config Schema ───

describe('a2A 配置 Schema', () => {
  it('aIConfigSchema 接受 a2a 配置', () => {
    const result = AIConfigSchema.safeParse({
      llm: { protocol: 'chat', apiKey: 'test', model: 'gpt-4' },
      a2a: {
        agentCard: {
          name: 'test-agent',
          description: 'A test agent',
          url: 'https://example.com',
          skills: [{ id: 'chat', name: 'Chat', description: 'Chat ability' }],
        },
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.a2a?.agentCard.name).toBe('test-agent')
      expect(result.data.a2a?.agentCard.skills).toHaveLength(1)
    }
  })

  it('a2a 配置可选', () => {
    const result = AIConfigSchema.safeParse({
      llm: { protocol: 'chat', apiKey: 'test', model: 'gpt-4' },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.a2a).toBeUndefined()
    }
  })

  it('a2a.agentCard.name 必填', () => {
    const result = AIConfigSchema.safeParse({
      llm: { protocol: 'chat', apiKey: 'test', model: 'gpt-4' },
      a2a: {
        agentCard: {
          // 缺少 name
          url: 'https://example.com',
        },
      },
    })

    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.issues.some(issue => issue.path.join('.') === 'a2a.agentCard.name')).toBe(true)
  })
})

// ─── A2A 错误码 ───

describe('a2A 错误码', () => {
  it('a2A 错误码格式正确', () => {
    expect(HaiAIError.A2A_NOT_CONFIGURED.code).toBe('hai:ai:980')
    expect(HaiAIError.A2A_HANDLE_FAILED.code).toBe('hai:ai:981')
    expect(HaiAIError.A2A_REMOTE_CALL_FAILED.code).toBe('hai:ai:982')
    expect(HaiAIError.A2A_AUTH_FAILED.code).toBe('hai:ai:983')
    expect(HaiAIError.A2A_LIST_MESSAGES_FAILED.code).toBe('hai:ai:984')
  })
})

// ─── 未初始化占位 ───

describe('a2A 公共协议入口', () => {
  it('任务只允许所属主体读取，匿名及其他主体无法读取', async () => {
    await ai.init({ a2a: { agentCard: { name: 'owner', url: 'https://example.com/a2a' } } })
    ai.a2a.registerExecutor({
      async execute(ctx, bus) {
        bus.publish({ kind: 'task', id: ctx.taskId, contextId: ctx.contextId, status: { state: 'completed' } })
        bus.finished()
      },
      cancelTask: vi.fn(),
    })
    const sent = await ai.a2a.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'message/send',
      params: { message: { kind: 'message', role: 'user', messageId: 'owned', parts: [{ kind: 'text', text: 'hi' }] } },
    }, { agentId: 'owner' })
    expect(sent.body).toMatchObject({ result: { kind: 'task' } })
    const task = (sent.body as { result: Task }).result
    const request = { jsonrpc: '2.0', id: 2, method: 'tasks/get', params: { id: task.id } }
    expect((await ai.a2a.handleRequest(request, { agentId: 'owner' })).body).toMatchObject({ result: { id: task.id } })
    for (const context of [{ agentId: 'other' }, undefined]) {
      expect((await ai.a2a.handleRequest(request, context)).body).toMatchObject({ error: { code: -32001 } })
    }
    const messages = await ai.a2a.listMessages({ callerId: 'owner', contextId: task.contextId })
    expect(messages).toMatchObject({ success: true, data: { total: 1, items: [{ caller: { agentId: 'owner' } }] } })
    expect(await ai.a2a.listMessages({ callerId: 'other', contextId: task.contextId })).toMatchObject({ success: true, data: { total: 0 } })
    expect(await ai.a2a.listMessages({ callerId: 'owner', since: Date.now() + 1000 })).toMatchObject({ success: true, data: { total: 0 } })
  })

  it('发现端点在注册前后均返回完整且隔离的 Agent Card', async () => {
    expect((await ai.init({ a2a: { agentCard: { name: 'echo', url: 'https://example.com/a2a' } } })).success).toBe(true)
    const first = ai.a2a.getAgentCard()
    expect(first.success).toBe(true)
    if (!first.success)
      return
    expect(first.data).toMatchObject({ protocolVersion: '0.3.0', capabilities: { streaming: true } })
    first.data.name = 'mutated'
    expect(ai.a2a.getAgentCard()).toMatchObject({ success: true, data: { name: 'echo' } })

    expect(ai.a2a.registerExecutor({ execute: vi.fn(), cancelTask: vi.fn() }).success).toBe(true)
    expect(ai.a2a.getAgentCard()).toMatchObject({ success: true, data: { protocolVersion: '0.3.0' } })
  })

  it('真实 SDK 执行器收到认证主体并可正常结束事件总线', async () => {
    expect((await ai.init({ a2a: { agentCard: { name: 'echo', url: 'https://example.com/a2a' } } })).success).toBe(true)
    const execute = vi.fn(async (ctx, bus) => {
      expect(ctx.context?.user?.userName).toBe('caller-1')
      expect(ctx.context?.user?.isAuthenticated).toBe(true)
      bus.publish({ kind: 'message', role: 'agent', messageId: 'reply', parts: [{ kind: 'text', text: 'hello' }] })
      bus.finished()
    })
    expect(ai.a2a.registerExecutor({ execute, cancelTask: vi.fn() }).success).toBe(true)
    const result = await ai.a2a.handleRequest({
      jsonrpc: '2.0',
      id: 'req-1',
      method: 'message/send',
      params: { message: { kind: 'message', role: 'user', messageId: 'input', parts: [{ kind: 'text', text: 'hi' }] } },
    }, { agentId: 'caller-1' })
    expect(result.body).toMatchObject({ jsonrpc: '2.0', id: 'req-1', result: { kind: 'message', parts: [{ text: 'hello' }] } })
    expect(execute).toHaveBeenCalledOnce()
  })
})

describe('a2A 未初始化行为', () => {
  it('未初始化时 getAgentCard 返回 NOT_INITIALIZED', async () => {
    await ai.close()

    const result = ai.a2a.getAgentCard()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.NOT_INITIALIZED.code)
    }
  })

  it('未初始化时 handleRequest 返回 NOT_INITIALIZED', async () => {
    await ai.close()

    const result = await ai.a2a.handleRequest({ jsonrpc: '2.0', id: 7, method: 'tasks/get' })
    expect(result.streaming).toBe(false)
    expect(result.body).toMatchObject({ jsonrpc: '2.0', id: 7, error: { code: -32603 } })
  })

  it('未初始化时 listMessages 返回 NOT_INITIALIZED', async () => {
    await ai.close()

    const result = await ai.a2a.listMessages({})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.NOT_INITIALIZED.code)
    }
  })

  it('未初始化时 callRemoteAgent 返回 NOT_INITIALIZED', async () => {
    await ai.close()

    const result = await ai.a2a.callRemoteAgent('https://example.com', 'hello')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.NOT_INITIALIZED.code)
    }
  })

  it('未初始化时 registerExecutor 返回 NOT_INITIALIZED', async () => {
    await ai.close()

    const mockExecutor = { execute: vi.fn(), cancelTask: vi.fn() }
    const result = ai.a2a.registerExecutor(mockExecutor)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.NOT_INITIALIZED.code)
    }
  })
})

describe('a2A 远端 URL 安全边界', () => {
  it.each([
    'file:///etc/passwd',
    'ftp://example.com/agent',
    'https://user:secret@example.com/agent',
  ])('拒绝非 HTTP(S) 或内嵌凭据 URL: %s', async (remoteUrl) => {
    const initResult = await ai.init()
    expect(initResult.success).toBe(true)

    const result = await ai.a2a.callRemoteAgent(remoteUrl, 'hello')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAIError.A2A_REMOTE_CALL_FAILED.code)
      expect(result.error.message).not.toContain('secret')
    }

    await ai.close()
  })
})
