/**
 * AI A2A 子模块单元测试
 *
 * 覆盖 buildAgentCard、ReldbA2ATaskStore、createA2AOperations 工厂。
 */

import type { Task } from '@a2a-js/sdk'
import type { ServerCallContext } from '@a2a-js/sdk/server'
import type { AIStore, StorePage } from '../src/store/ai-store-types.js'

import { describe, expect, it, vi } from 'vitest'

import { ReldbA2ATaskStore } from '../src/a2a/ai-a2a-functions.js'
import { buildAgentCard } from '../src/a2a/ai-a2a-server.js'

// ─── buildAgentCard ───

describe('buildAgentCard', () => {
  it('最简配置返回完整 AgentCard', () => {
    const card = buildAgentCard({ name: 'test-agent', url: 'https://example.com' })

    expect(card.name).toBe('test-agent')
    expect(card.url).toBe('https://example.com')
    expect(card.protocolVersion).toBe('0.3.0')
    expect(card.defaultInputModes).toEqual(['text'])
    expect(card.defaultOutputModes).toEqual(['text'])
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

// ─── ReldbA2ATaskStore ───

describe('reldbA2ATaskStore', () => {
  function createMockStore(): AIStore<Task> {
    return {
      save: vi.fn(async () => {}),
      saveMany: vi.fn(async () => {}),
      get: vi.fn(async () => undefined),
      query: vi.fn(async () => []),
      queryPage: vi.fn(async (): Promise<StorePage<Task>> => ({ items: [], total: 0 })),
      remove: vi.fn(async () => true),
      removeBy: vi.fn(async () => 0),
      count: vi.fn(async () => 0),
      clear: vi.fn(async () => {}),
    }
  }

  const sampleTask: Task = {
    id: 'task-1',
    contextId: 'ctx-1',
    kind: 'task',
    status: { state: 'submitted' },
  }

  it('save 委托到 store.save 并传递正确的 scope', async () => {
    const mockStore = createMockStore()
    const taskStore = new ReldbA2ATaskStore(mockStore)

    await taskStore.save(sampleTask)

    expect(mockStore.save).toHaveBeenCalledWith('task-1', sampleTask, {
      objectId: 'ctx-1',
      status: 'submitted',
      refId: 'ctx-1',
    })
  })

  it('save 传递 context 参数不影响调用', async () => {
    const mockStore = createMockStore()
    const taskStore = new ReldbA2ATaskStore(mockStore)
    const mockContext = {} as ServerCallContext

    await taskStore.save(sampleTask, mockContext)

    expect(mockStore.save).toHaveBeenCalledTimes(1)
  })

  it('save 处理无 status 的 Task', async () => {
    const mockStore = createMockStore()
    const taskStore = new ReldbA2ATaskStore(mockStore)
    const noStatusTask: Task = { id: 'task-2', kind: 'task' }

    await taskStore.save(noStatusTask)

    expect(mockStore.save).toHaveBeenCalledWith('task-2', noStatusTask, {
      objectId: undefined,
      status: undefined,
      refId: undefined,
    })
  })

  it('load 委托到 store.get', async () => {
    const mockStore = createMockStore()
    vi.mocked(mockStore.get).mockResolvedValue(sampleTask)
    const taskStore = new ReldbA2ATaskStore(mockStore)

    const result = await taskStore.load('task-1')

    expect(mockStore.get).toHaveBeenCalledWith('task-1')
    expect(result).toEqual(sampleTask)
  })

  it('load 不存在的任务返回 undefined', async () => {
    const mockStore = createMockStore()
    const taskStore = new ReldbA2ATaskStore(mockStore)

    const result = await taskStore.load('nonexistent')

    expect(result).toBeUndefined()
  })
})

// ─── A2A Config Schema ───

describe('a2A 配置 Schema', () => {
  it('aIConfigSchema 接受 a2a 配置', async () => {
    const { AIConfigSchema } = await import('../src/ai-config.js')

    const result = AIConfigSchema.safeParse({
      llm: { type: 'openai', apiKey: 'test', model: 'gpt-4' },
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

  it('a2a 配置可选', async () => {
    const { AIConfigSchema } = await import('../src/ai-config.js')

    const result = AIConfigSchema.safeParse({
      llm: { type: 'openai', apiKey: 'test', model: 'gpt-4' },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.a2a).toBeUndefined()
    }
  })

  it('a2a.agentCard.name 必填', async () => {
    const { AIConfigSchema } = await import('../src/ai-config.js')

    const result = AIConfigSchema.safeParse({
      llm: { type: 'openai', apiKey: 'test', model: 'gpt-4' },
      a2a: {
        agentCard: {
          // 缺少 name
          url: 'https://example.com',
        },
      },
    })

    expect(result.success).toBe(false)
  })
})

// ─── A2A 错误码 ───

describe('a2A 错误码', () => {
  it('错误码在 12980-12984 范围内', async () => {
    const { AIErrorCode } = await import('../src/ai-config.js')

    expect(AIErrorCode.A2A_NOT_CONFIGURED).toBe(12980)
    expect(AIErrorCode.A2A_HANDLE_FAILED).toBe(12981)
    expect(AIErrorCode.A2A_REMOTE_CALL_FAILED).toBe(12982)
    expect(AIErrorCode.A2A_AUTH_FAILED).toBe(12983)
    expect(AIErrorCode.A2A_LIST_MESSAGES_FAILED).toBe(12984)
  })
})

// ─── 未初始化占位 ───

describe('a2A 未初始化行为', () => {
  it('未初始化时 getAgentCard 返回 NOT_INITIALIZED', async () => {
    // 重新导入以获取干净状态（避免被其他测试影响）
    const { ai } = await import('../src/ai-main.js')

    // 确保未初始化
    ai.close()

    const result = ai.a2a.getAgentCard()
    expect(result.success).toBe(false)
    if (!result.success) {
      const { AIErrorCode } = await import('../src/ai-config.js')
      expect(result.error.code).toBe(AIErrorCode.NOT_INITIALIZED)
    }
  })

  it('未初始化时 handleRequest 返回 NOT_INITIALIZED', async () => {
    const { ai } = await import('../src/ai-main.js')
    ai.close()

    const result = await ai.a2a.handleRequest({})
    // handleRequest 返回 A2AHandleResult 或 Result，未初始化时返回 Result
    expect((result as { success: boolean }).success).toBe(false)
  })

  it('未初始化时 listMessages 返回 NOT_INITIALIZED', async () => {
    const { ai } = await import('../src/ai-main.js')
    ai.close()

    const result = await ai.a2a.listMessages({})
    expect(result.success).toBe(false)
    if (!result.success) {
      const { AIErrorCode } = await import('../src/ai-config.js')
      expect(result.error.code).toBe(AIErrorCode.NOT_INITIALIZED)
    }
  })

  it('未初始化时 callRemoteAgent 返回 NOT_INITIALIZED', async () => {
    const { ai } = await import('../src/ai-main.js')
    ai.close()

    const result = await ai.a2a.callRemoteAgent('https://example.com', 'hello')
    expect(result.success).toBe(false)
    if (!result.success) {
      const { AIErrorCode } = await import('../src/ai-config.js')
      expect(result.error.code).toBe(AIErrorCode.NOT_INITIALIZED)
    }
  })

  it('未初始化时 registerExecutor 返回 NOT_INITIALIZED', async () => {
    const { ai } = await import('../src/ai-main.js')
    ai.close()

    const mockExecutor = { execute: vi.fn(), cancelTask: vi.fn() }
    const result = ai.a2a.registerExecutor(mockExecutor)
    expect(result.success).toBe(false)
    if (!result.success) {
      const { AIErrorCode } = await import('../src/ai-config.js')
      expect(result.error.code).toBe(AIErrorCode.NOT_INITIALIZED)
    }
  })
})
