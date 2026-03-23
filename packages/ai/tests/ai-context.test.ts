/**
 * AI Context 子模块单元测试
 *
 * 测试有状态上下文管理器（ContextManager）：创建、追加消息、自动压缩、Token 使用量、重置。
 * Token / Summary / Compress 的测试已拆分到各自的测试文件。
 */

import type { CompressConfig, SummaryConfig, TokenConfig } from '../src/ai-config.js'
import type { ChatCompletionChunk, LLMOperations, ToolCall } from '../src/llm/ai-llm-types.js'
import type { AIRelStore, SessionInfo } from '../src/store/ai-store-types.js'

import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createCompressOperations } from '../src/compress/ai-compress-functions.js'
import { createContextOperations } from '../src/context/ai-context-functions.js'
import { ai } from '../src/index.js'
import { createSummaryOperations } from '../src/summary/ai-summary-functions.js'
import { createTokenOperations } from '../src/token/ai-token-functions.js'

// ─── Mock 工厂 ───

/**
 * 创建 Map 支撑的 AIStore mock（测试用）
 */
function createMockStore<T>(): AIRelStore<T> {
  const data = new Map<string, T>()
  return {
    save: vi.fn(async (id: string, value: T) => {
      data.set(id, { ...value as object } as T)
    }),
    saveMany: vi.fn(async (items: Array<{ id: string, data: T }>) => {
      for (const item of items) {
        data.set(item.id, { ...item.data as object } as T)
      }
    }),
    get: vi.fn(async (id: string) => {
      const v = data.get(id)
      return v ? { ...v as object } as T : undefined
    }),
    query: vi.fn(async (filter) => {
      let items = Array.from(data.values())
      if (filter.where) {
        items = items.filter((item) => {
          for (const [key, condition] of Object.entries(filter.where!)) {
            if ((item as Record<string, unknown>)[key] !== condition)
              return false
          }
          return true
        })
      }
      if (filter.orderBy) {
        const { field, direction } = filter.orderBy
        items.sort((a, b) => {
          const va = (a as Record<string, unknown>)[field as string]
          const vb = (b as Record<string, unknown>)[field as string]
          if (va === vb)
            return 0
          const cmp = va! < vb! ? -1 : 1
          return direction === 'desc' ? -cmp : cmp
        })
      }
      if (filter.limit !== undefined)
        items = items.slice(0, filter.limit)
      return items
    }),
    queryPage: vi.fn(async (_filter, page) => {
      const items = Array.from(data.values())
      return { items: items.slice(page.offset, page.offset + page.limit), total: items.length }
    }),
    remove: vi.fn(async (id: string) => data.delete(id)),
    removeBy: vi.fn(async () => 0),
    count: vi.fn(async () => data.size),
    clear: vi.fn(async () => { data.clear() }),
  }
}

// ─── Mock 工厂 ───

function createMockLLM(responses: Array<{ content: string | null }>): LLMOperations {
  let callIndex = 0
  return {
    chat: vi.fn(async () => {
      const resp = responses[callIndex] ?? responses[responses.length - 1]
      callIndex++
      return {
        success: true as const,
        data: {
          id: 'test-id',
          object: 'chat.completion' as const,
          created: Date.now(),
          model: 'test-model',
          choices: [{
            index: 0,
            message: { role: 'assistant' as const, content: resp.content },
            finish_reason: 'stop' as const,
          }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        },
      }
    }),
    chatStream: vi.fn(),
    listModels: vi.fn(),
  } as unknown as LLMOperations
}

const defaultLLMConfig = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKey: 'test-key',
  maxTokens: 4096,
  temperature: 0.7,
  timeout: 60000,
}

const defaultTokenConfig: TokenConfig = { tokenRatio: 0.25 }
const defaultSummaryConfig: SummaryConfig = {}
const defaultCompressConfig: CompressConfig = {
  defaultStrategy: 'hybrid',
  defaultMaxTokens: 0,
  preserveLastN: 4,
}

/**
 * 便捷工厂：从独立配置 + llm + modelMaxTokens 创建完整的 ContextOperations
 */
function createOps(
  compressConfig: CompressConfig,
  llm: LLMOperations,
  modelMaxTokens: number,
) {
  const tokenOps = createTokenOperations(defaultTokenConfig)
  const summaryOps = createSummaryOperations(defaultLLMConfig, llm, tokenOps, defaultSummaryConfig)
  const compressOps = createCompressOperations(
    compressConfig,
    tokenOps,
    summaryOps,
    modelMaxTokens,
  )
  return createContextOperations(compressConfig, tokenOps, compressOps)
}

// ─── createManager 测试 ───

describe('context createManager', () => {
  it('创建管理器成功', () => {
    const llm = createMockLLM([])
    const ops = createOps(defaultCompressConfig, llm, 8000)

    const result = ops.createManager({ compress: { maxTokens: 4000 } })
    expect(result.success).toBe(true)
    if (result.success) {
      const messages = result.data.getMessages()
      expect(messages.success).toBe(true)
      if (messages.success) {
        expect(messages.data).toHaveLength(0)
      }
    }
  })

  it('追加消息并获取', async () => {
    const llm = createMockLLM([])
    const ops = createOps(defaultCompressConfig, llm, 100000)

    const managerResult = ops.createManager({ compress: { maxTokens: 100000 } })
    expect(managerResult.success).toBe(true)
    if (!managerResult.success)
      return

    const manager = managerResult.data
    await manager.addMessage({ role: 'user', content: 'Hello' })
    await manager.addMessage({ role: 'assistant', content: 'Hi there' })

    const messages = manager.getMessages()
    expect(messages.success).toBe(true)
    if (messages.success) {
      expect(messages.data).toHaveLength(2)
    }
  })

  it('超限时自动压缩', async () => {
    const llm = createMockLLM([{
      content: 'Compressed summary of conversation.',
    }])
    const ops = createOps(defaultCompressConfig, llm, 8000)

    const managerResult = ops.createManager({
      compress: {
        maxTokens: 100,
        strategy: 'summary',
        preserveLastN: 2,
        auto: true,
      },
    })
    expect(managerResult.success).toBe(true)
    if (!managerResult.success)
      return

    const manager = managerResult.data

    // 追加多条消息触发压缩
    for (let i = 0; i < 10; i++) {
      await manager.addMessage({ role: 'user', content: `Message ${i}: ${'x'.repeat(100)}` })
      await manager.addMessage({ role: 'assistant', content: `Reply ${i}: ${'y'.repeat(100)}` })
    }

    const messages = manager.getMessages()
    expect(messages.success).toBe(true)
    if (messages.success) {
      // 应该比原始 20 条消息少
      expect(messages.data.length).toBeLessThan(20)
    }
  })

  it('getTokenUsage 返回当前 token 和预算', async () => {
    const llm = createMockLLM([])
    const ops = createOps(defaultCompressConfig, llm, 8000)

    const managerResult = ops.createManager({ compress: { maxTokens: 5000 } })
    expect(managerResult.success).toBe(true)
    if (!managerResult.success)
      return

    const manager = managerResult.data
    await manager.addMessage({ role: 'user', content: 'Hello' })

    const usage = manager.getTokenUsage()
    expect(usage.success).toBe(true)
    if (usage.success) {
      expect(usage.data.budget).toBe(5000)
      expect(usage.data.current).toBeGreaterThan(0)
    }
  })

  it('reset 清空消息和摘要', async () => {
    const llm = createMockLLM([])
    const ops = createOps(defaultCompressConfig, llm, 100000)

    const managerResult = ops.createManager({ compress: { maxTokens: 100000 } })
    expect(managerResult.success).toBe(true)
    if (!managerResult.success)
      return

    const manager = managerResult.data
    await manager.addMessage({ role: 'user', content: 'Hello' })
    manager.reset()

    const messages = manager.getMessages()
    expect(messages.success).toBe(true)
    if (messages.success) {
      expect(messages.data).toHaveLength(0)
    }
  })

  it('autoCompress 为 false 时不自动压缩', async () => {
    const llm = createMockLLM([])
    const ops = createOps(defaultCompressConfig, llm, 8000)

    const managerResult = ops.createManager({
      compress: {
        maxTokens: 50,
        auto: false,
      },
    })
    expect(managerResult.success).toBe(true)
    if (!managerResult.success)
      return

    const manager = managerResult.data

    for (let i = 0; i < 5; i++) {
      await manager.addMessage({ role: 'user', content: `Long message: ${'x'.repeat(200)}` })
    }

    const messages = manager.getMessages()
    expect(messages.success).toBe(true)
    if (messages.success) {
      // 不压缩，5 条全保留
      expect(messages.data).toHaveLength(5)
    }
  })
})

// =============================================================================
// Session 管理（renameSession / removeSession）
// =============================================================================

describe('context session management', () => {
  function createOpsWithStores(
    compressConfig: CompressConfig,
    llm: LLMOperations,
    modelMaxTokens: number,
  ) {
    const tokenOps = createTokenOperations(defaultTokenConfig)
    const summaryOps = createSummaryOperations(defaultLLMConfig, llm, tokenOps, defaultSummaryConfig)
    const compressOps = createCompressOperations(
      compressConfig,
      tokenOps,
      summaryOps,
      modelMaxTokens,
    )
    const contextStore = createMockStore<Record<string, unknown>>()
    const sessionStore = createMockStore<SessionInfo>()
    const ops = createContextOperations(compressConfig, tokenOps, compressOps, contextStore as unknown as Parameters<typeof createContextOperations>[3], sessionStore)
    return { ops, contextStore, sessionStore }
  }

  it('renameSession 修改会话标题', async () => {
    const llm = createMockLLM([])
    const { ops, sessionStore } = createOpsWithStores(defaultCompressConfig, llm, 8000)

    // 先手工保存一个 session
    const now = Date.now()
    await sessionStore.save('session-1', {
      sessionId: 'session-1',
      objectId: 'user-1',
      title: '旧标题',
      createdAt: now,
      updatedAt: now,
    })

    const result = await ops.renameSession('session-1', '新标题')
    expect(result.success).toBe(true)

    // 验证标题已更新
    const session = await sessionStore.get('session-1')
    expect(session?.title).toBe('新标题')
  })

  it('renameSession 不存在的会话返回错误', async () => {
    const llm = createMockLLM([])
    const { ops } = createOpsWithStores(defaultCompressConfig, llm, 8000)

    const result = await ops.renameSession('non-existent', '标题')
    expect(result.success).toBe(false)
  })

  it('removeSession 删除会话及上下文', async () => {
    const llm = createMockLLM([])
    const { ops, sessionStore, contextStore } = createOpsWithStores(defaultCompressConfig, llm, 8000)

    const now = Date.now()
    await sessionStore.save('session-1', {
      sessionId: 'session-1',
      objectId: 'user-1',
      title: '会话',
      createdAt: now,
      updatedAt: now,
    })
    await contextStore.save('user-1:session-1', {
      messages: [{ role: 'user', content: 'test' }],
      summaries: [],
      updatedAt: now,
    })

    const result = await ops.removeSession('session-1')
    expect(result.success).toBe(true)

    // 验证会话和上下文都被删除
    const session = await sessionStore.get('session-1')
    expect(session).toBeUndefined()
    const context = await contextStore.get('user-1:session-1')
    expect(context).toBeUndefined()
  })

  it('removeSession 不存在的会话也成功', async () => {
    const llm = createMockLLM([])
    const { ops } = createOpsWithStores(defaultCompressConfig, llm, 8000)

    const result = await ops.removeSession('non-existent')
    expect(result.success).toBe(true)
  })

  it('listSessions 列出会话', async () => {
    const llm = createMockLLM([])
    const { ops, sessionStore } = createOpsWithStores(defaultCompressConfig, llm, 8000)

    const now = Date.now()
    await sessionStore.save('s1', {
      sessionId: 's1',
      objectId: 'user-1',
      title: '会话1',
      createdAt: now,
      updatedAt: now,
    })
    await sessionStore.save('s2', {
      sessionId: 's2',
      objectId: 'user-1',
      title: '会话2',
      createdAt: now,
      updatedAt: now + 1000,
    })

    const result = await ops.listSessions('user-1')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(2)
      // 按 updatedAt 降序
      expect(result.data[0].sessionId).toBe('s2')
    }
  })
})

// =============================================================================
// chat / chatStream 编排测试
// =============================================================================

describe('context chat / chatStream', () => {
  function createOpsWithDeps(llm: LLMOperations) {
    const tokenOps = createTokenOperations(defaultTokenConfig)
    const summaryOps = createSummaryOperations(defaultLLMConfig, llm, tokenOps, defaultSummaryConfig)
    const compressOps = createCompressOperations(
      defaultCompressConfig,
      tokenOps,
      summaryOps,
      8000,
    )
    return createContextOperations(defaultCompressConfig, tokenOps, compressOps, undefined, undefined, { llm })
  }

  it('chat 发送消息并获取回复', async () => {
    const llm = createMockLLM([{ content: '你好！很高兴认识你。' }])
    const ops = createOpsWithDeps(llm)

    const managerResult = ops.createManager({
      compress: { maxTokens: 8000 },
    })
    expect(managerResult.success).toBe(true)
    if (!managerResult.success)
      return

    const manager = managerResult.data
    const result = await manager.chat('你好')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.reply).toBe('你好！很高兴认识你。')
      expect(result.data.model).toBe('test-model')
    }

    // 消息列表应包含 user + assistant
    const msgs = manager.getMessages()
    expect(msgs.success).toBe(true)
    if (msgs.success) {
      expect(msgs.data).toHaveLength(2)
      expect(msgs.data[0].role).toBe('user')
      expect(msgs.data[1].role).toBe('assistant')
    }
  })

  it('chat 无 deps.llm 时返回 NOT_INITIALIZED', async () => {
    const tokenOps = createTokenOperations(defaultTokenConfig)
    const llm = createMockLLM([])
    const summaryOps = createSummaryOperations(defaultLLMConfig, llm, tokenOps, defaultSummaryConfig)
    const compressOps = createCompressOperations(defaultCompressConfig, tokenOps, summaryOps, 8000)
    // 不传 deps
    const ops = createContextOperations(defaultCompressConfig, tokenOps, compressOps)

    const managerResult = ops.createManager({ compress: { maxTokens: 8000 } })
    expect(managerResult.success).toBe(true)
    if (!managerResult.success)
      return

    const result = await managerResult.data.chat('测试')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(12010) // NOT_INITIALIZED
    }
  })

  it('chat 含 systemPrompt 时消息列表包含 system', async () => {
    const llm = createMockLLM([{ content: '我是助手' }])
    const ops = createOpsWithDeps(llm)

    const managerResult = ops.createManager({
      systemPrompt: '你是一个友好的助手。',
      compress: { maxTokens: 8000 },
    })
    expect(managerResult.success).toBe(true)
    if (!managerResult.success)
      return

    const manager = managerResult.data
    await manager.chat('你是谁？')

    const msgs = manager.getMessages()
    expect(msgs.success).toBe(true)
    if (msgs.success) {
      expect(msgs.data[0].role).toBe('system')
      expect(msgs.data[0].content).toBe('你是一个友好的助手。')
    }
  })

  it('chat 使用 enablePersist:false 调用 LLM', async () => {
    const llm = createMockLLM([{ content: 'reply' }])
    const ops = createOpsWithDeps(llm)

    const managerResult = ops.createManager({ compress: { maxTokens: 8000 } })
    expect(managerResult.success).toBe(true)
    if (!managerResult.success)
      return

    await managerResult.data.chat('test')

    // 验证 LLM.chat 被调用时 enablePersist 为 false
    expect(llm.chat).toHaveBeenCalledTimes(1)
    const callArg = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArg.enablePersist).toBe(false)
  })

  it('多轮对话保持上下文', async () => {
    const llm = createMockLLM([
      { content: '第一轮回复' },
      { content: '第二轮回复' },
    ])
    const ops = createOpsWithDeps(llm)

    const managerResult = ops.createManager({ compress: { maxTokens: 8000 } })
    expect(managerResult.success).toBe(true)
    if (!managerResult.success)
      return

    const manager = managerResult.data
    await manager.chat('第一轮')
    await manager.chat('第二轮')

    const msgs = manager.getMessages()
    expect(msgs.success).toBe(true)
    if (msgs.success) {
      expect(msgs.data).toHaveLength(4) // 2 user + 2 assistant
    }

    // 第二次调用 LLM 时应包含完整 4 条消息上下文（2 user + 1 assistant + 当前的 user，实际传入的是已 addMessage 后的消息列表）
    expect(llm.chat).toHaveBeenCalledTimes(2)
  })
})

// =============================================================================
// chat / chatStream 工具调用循环测试
// =============================================================================

describe('context chat tool call loop', () => {
  /**
   * 创建带 LLM 依赖的 ContextOperations
   */
  function createOpsWithDeps(llm: LLMOperations) {
    const tokenOps = createTokenOperations(defaultTokenConfig)
    const summaryOps = createSummaryOperations(defaultLLMConfig, llm, tokenOps, defaultSummaryConfig)
    const compressOps = createCompressOperations(
      defaultCompressConfig,
      tokenOps,
      summaryOps,
      8000,
    )
    return createContextOperations(defaultCompressConfig, tokenOps, compressOps, undefined, undefined, { llm })
  }

  /**
   * 创建返回 tool_calls 后再返回文本的 LLM mock
   *
   * 第一次调用返回 tool_calls，第二次调用返回文本回复
   */
  function createToolCallLLM(toolCalls: ToolCall[], finalReply: string): LLMOperations {
    let callIndex = 0
    return {
      chat: vi.fn(async () => {
        callIndex++
        if (callIndex === 1) {
          // 第一轮：返回 tool_calls
          return {
            success: true as const,
            data: {
              id: 'test-id-1',
              object: 'chat.completion' as const,
              created: Date.now(),
              model: 'test-model',
              choices: [{
                index: 0,
                message: {
                  role: 'assistant' as const,
                  content: null,
                  tool_calls: toolCalls,
                },
                finish_reason: 'tool_calls' as const,
              }],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            },
          }
        }
        // 第二轮：返回文本回复
        return {
          success: true as const,
          data: {
            id: 'test-id-2',
            object: 'chat.completion' as const,
            created: Date.now(),
            model: 'test-model',
            choices: [{
              index: 0,
              message: { role: 'assistant' as const, content: finalReply },
              finish_reason: 'stop' as const,
            }],
            usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
          },
        }
      }),
      chatStream: vi.fn(),
      listModels: vi.fn(),
    } as unknown as LLMOperations
  }

  it('chat 自动执行工具并返回最终回复', async () => {
    const toolCalls: ToolCall[] = [{
      id: 'call-1',
      type: 'function',
      function: { name: 'getWeather', arguments: '{"city":"北京"}' },
    }]

    const llm = createToolCallLLM(toolCalls, '北京今天25度，晴天。')
    const ops = createOpsWithDeps(llm)

    // 定义并注册工具
    const weatherTool = ai.tools.define({
      name: 'getWeather',
      description: '获取天气',
      parameters: z.object({ city: z.string() }),
      handler: async ({ city }) => ({ temp: 25, city, condition: '晴' }),
    })
    const registry = ai.tools.createRegistry()
    registry.register(weatherTool)

    const managerResult = ops.createManager({
      compress: { maxTokens: 8000 },
      tools: registry,
    })
    expect(managerResult.success).toBe(true)
    if (!managerResult.success)
      return

    const result = await managerResult.data.chat('北京天气怎么样？')
    expect(result.success).toBe(true)
    if (!result.success)
      return

    // 最终回复是第二轮 LLM 生成的文本
    expect(result.data.reply).toBe('北京今天25度，晴天。')
    // LLM 被调用了两次
    expect(llm.chat).toHaveBeenCalledTimes(2)
  })

  it('chat 无 tool_calls 时直接返回文本', async () => {
    const llm = createMockLLM([{ content: '直接回复' }])
    const ops = createOpsWithDeps(llm)

    const registry = ai.tools.createRegistry()

    const managerResult = ops.createManager({
      compress: { maxTokens: 8000 },
      tools: registry,
    })
    expect(managerResult.success).toBe(true)
    if (!managerResult.success)
      return

    const result = await managerResult.data.chat('你好')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.reply).toBe('直接回复')
    }
    expect(llm.chat).toHaveBeenCalledTimes(1)
  })

  it('chat 工具执行失败时错误信息回传 LLM', async () => {
    const toolCalls: ToolCall[] = [{
      id: 'call-err',
      type: 'function',
      function: { name: 'failTool', arguments: '{}' },
    }]
    const llm = createToolCallLLM(toolCalls, '工具调用失败了，请稍后再试。')
    const ops = createOpsWithDeps(llm)

    const failTool = ai.tools.define({
      name: 'failTool',
      description: '总是失败的工具',
      parameters: z.object({}),
      handler: () => { throw new Error('Boom') },
    })
    const registry = ai.tools.createRegistry()
    registry.register(failTool)

    const managerResult = ops.createManager({
      compress: { maxTokens: 8000 },
      tools: registry,
    })
    expect(managerResult.success).toBe(true)
    if (!managerResult.success)
      return

    const result = await managerResult.data.chat('运行工具')
    expect(result.success).toBe(true)
    if (!result.success)
      return

    // 即使工具失败，LLM 仍被第二次调用并给出回复
    expect(result.data.reply).toBe('工具调用失败了，请稍后再试。')
    expect(llm.chat).toHaveBeenCalledTimes(2)

    // 第二次调用应包含 tool message（带错误信息）
    const secondCallMessages = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[1][0].messages
    const toolMessage = secondCallMessages.find((m: { role: string }) => m.role === 'tool')
    expect(toolMessage).toBeDefined()
    expect(toolMessage.content).toContain('Tool error')
  })

  it('chatStream 自动执行工具并流式返回最终回复', async () => {
    // 创建流式 LLM mock，第一次返回 tool_calls chunk，第二次返回文本 chunk
    let streamCallIndex = 0
    const llm: LLMOperations = {
      chat: vi.fn(),
      chatStream: vi.fn(() => {
        streamCallIndex++
        if (streamCallIndex === 1) {
          // 第一轮：流式返回 tool_calls
          return (async function* () {
            yield {
              id: 'chunk-1',
              object: 'chat.completion.chunk',
              created: Date.now(),
              model: 'test-model',
              choices: [{
                index: 0,
                delta: {
                  role: 'assistant',
                  tool_calls: [{
                    index: 0,
                    id: 'call-stream-1',
                    type: 'function',
                    function: { name: 'add', arguments: '{"a":' },
                  }],
                },
                finish_reason: null,
              }],
            } as ChatCompletionChunk
            yield {
              id: 'chunk-2',
              object: 'chat.completion.chunk',
              created: Date.now(),
              model: 'test-model',
              choices: [{
                index: 0,
                delta: {
                  tool_calls: [{
                    index: 0,
                    function: { arguments: '3,"b":5}' },
                  }],
                },
                finish_reason: 'tool_calls',
              }],
            } as ChatCompletionChunk
          })()
        }
        // 第二轮：流式返回文本
        return (async function* () {
          yield {
            id: 'chunk-3',
            object: 'chat.completion.chunk',
            created: Date.now(),
            model: 'test-model',
            choices: [{
              index: 0,
              delta: { role: 'assistant', content: '3+5=' },
              finish_reason: null,
            }],
          } as ChatCompletionChunk
          yield {
            id: 'chunk-4',
            object: 'chat.completion.chunk',
            created: Date.now(),
            model: 'test-model',
            choices: [{
              index: 0,
              delta: { content: '8' },
              finish_reason: 'stop',
            }],
          } as ChatCompletionChunk
        })()
      }),
      listModels: vi.fn(),
    } as unknown as LLMOperations

    const ops = createOpsWithDeps(llm)

    const addTool = ai.tools.define({
      name: 'add',
      description: '加法',
      parameters: z.object({ a: z.number(), b: z.number() }),
      handler: async ({ a, b }) => a + b,
    })
    const registry = ai.tools.createRegistry()
    registry.register(addTool)

    const managerResult = ops.createManager({
      compress: { maxTokens: 8000 },
      tools: registry,
    })
    expect(managerResult.success).toBe(true)
    if (!managerResult.success)
      return

    const events: Array<{ type: string, [key: string]: unknown }> = []
    for await (const event of managerResult.data.chatStream('3加5等于多少？')) {
      events.push(event)
    }

    // 应有 tool_call → tool_result → delta → delta → done
    const toolCallEvent = events.find(e => e.type === 'tool_call')
    expect(toolCallEvent).toBeDefined()
    expect(toolCallEvent?.name).toBe('add')

    const toolResultEvent = events.find(e => e.type === 'tool_result')
    expect(toolResultEvent).toBeDefined()
    expect(toolResultEvent?.success).toBe(true)

    const doneEvent = events.find(e => e.type === 'done')
    expect(doneEvent).toBeDefined()
    expect(doneEvent?.reply).toBe('3+5=8')

    // chatStream 被调用了两次（tool_calls 轮 + 最终文本轮）
    expect(llm.chatStream).toHaveBeenCalledTimes(2)
  })
})
