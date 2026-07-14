/**
 * AI Context 子模块单元测试
 *
 * 测试有状态上下文管理器（ContextManager）：创建、追加消息、自动压缩、Token 使用量、重置。
 * Token / Summary / Compress 的测试已拆分到各自的测试文件。
 */

import type { CompressConfig, SummaryConfig, TokenConfig } from '../src/ai-config.js'
import type { ChatCompletionChunk, LLMOperations, ToolCall } from '../src/llm/ai-llm-types.js'
import type { MemoryOperations } from '../src/memory/ai-memory-types.js'
import type { AIRelStore, SessionInfo } from '../src/store/ai-store-types.js'

import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { HaiAIError } from '../src/ai-types.js'
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
    const scope = { objectId: 'user-1', sessionId: 'session-1' }
    const key = JSON.stringify([scope.objectId, scope.sessionId])

    // 先手工保存一个 session（复合键与实现一致）
    const now = Date.now()
    await sessionStore.save(key, {
      sessionId: 'session-1',
      objectId: 'user-1',
      title: '旧标题',
      createdAt: now,
      updatedAt: now,
    })

    const result = await ops.renameSession(scope, '新标题')
    expect(result.success).toBe(true)

    // 验证标题已更新
    const session = await sessionStore.get(key)
    expect(session?.title).toBe('新标题')
  })

  it('renameSession 不存在的会话返回错误', async () => {
    const llm = createMockLLM([])
    const { ops } = createOpsWithStores(defaultCompressConfig, llm, 8000)

    const result = await ops.renameSession({ objectId: 'user-1', sessionId: 'non-existent' }, '标题')
    expect(result.success).toBe(false)
  })

  it('removeSession 删除会话及上下文', async () => {
    const llm = createMockLLM([])
    const { ops, sessionStore, contextStore } = createOpsWithStores(defaultCompressConfig, llm, 8000)
    const scope = { objectId: 'user-1', sessionId: 'session-1' }
    const key = JSON.stringify([scope.objectId, scope.sessionId])

    const now = Date.now()
    await sessionStore.save(key, {
      sessionId: 'session-1',
      objectId: 'user-1',
      title: '会话',
      createdAt: now,
      updatedAt: now,
    })
    await contextStore.save(key, {
      messages: [{ role: 'user', content: 'test' }],
      summaries: [],
      updatedAt: now,
    })

    const result = await ops.removeSession(scope)
    expect(result.success).toBe(true)

    // 验证会话和上下文都被删除（复合键匹配）
    const session = await sessionStore.get(key)
    expect(session).toBeUndefined()
    const context = await contextStore.get(key)
    expect(context).toBeUndefined()
  })

  it('removeSession 多租户隔离：删除一个用户不影响另一个用户相同 sessionId', async () => {
    const llm = createMockLLM([])
    const { ops, sessionStore, contextStore } = createOpsWithStores(defaultCompressConfig, llm, 8000)
    const now = Date.now()
    const keyA = JSON.stringify(['user-A', 'shared'])
    const keyB = JSON.stringify(['user-B', 'shared'])
    await sessionStore.save(keyA, { sessionId: 'shared', objectId: 'user-A', createdAt: now, updatedAt: now })
    await sessionStore.save(keyB, { sessionId: 'shared', objectId: 'user-B', createdAt: now, updatedAt: now })
    await contextStore.save(keyA, { messages: [{ role: 'user', content: 'A' }], summaries: [], updatedAt: now })
    await contextStore.save(keyB, { messages: [{ role: 'user', content: 'B' }], summaries: [], updatedAt: now })

    await ops.removeSession({ objectId: 'user-A', sessionId: 'shared' })

    // user-A 被删除
    expect(await sessionStore.get(keyA)).toBeUndefined()
    expect(await contextStore.get(keyA)).toBeUndefined()
    // user-B 的会话与上下文不受影响
    expect(await sessionStore.get(keyB)).toBeDefined()
    expect(await contextStore.get(keyB)).toBeDefined()
  })

  it('removeSession 不存在的会话也成功', async () => {
    const llm = createMockLLM([])
    const { ops } = createOpsWithStores(defaultCompressConfig, llm, 8000)

    const result = await ops.removeSession({ objectId: 'user-1', sessionId: 'non-existent' })
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
      expect(result.error.code).toBe(HaiAIError.NOT_INITIALIZED.code)
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
// Conversation Commit Layer 测试（真实对话状态）
// =============================================================================

describe('context conversation commit layer', () => {
  function createOpsWithDeps(llm: LLMOperations) {
    const tokenOps = createTokenOperations(defaultTokenConfig)
    const summaryOps = createSummaryOperations(defaultLLMConfig, llm, tokenOps, defaultSummaryConfig)
    const compressOps = createCompressOperations(defaultCompressConfig, tokenOps, summaryOps, 8000)
    return createContextOperations(defaultCompressConfig, tokenOps, compressOps, undefined, undefined, { llm })
  }

  it('auto 模式（默认）：chat 自动提交完整生成文本', async () => {
    const llm = createMockLLM([{ content: '完整回答一千字' }])
    const ops = createOpsWithDeps(llm)
    const managerResult = ops.createManager({ compress: { maxTokens: 8000 } })
    if (!managerResult.success)
      return
    const manager = managerResult.data

    const result = await manager.chat('问题')
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data.turnId).toBeTruthy()

    // 消息已写入
    const msgs = manager.getMessages()
    expect(msgs.success && msgs.data).toHaveLength(2)

    // 轮次记录为 completed，generated === committed
    const turns = manager.getTurns()
    expect(turns.success).toBe(true)
    if (turns.success) {
      expect(turns.data).toHaveLength(1)
      expect(turns.data[0].status).toBe('completed')
      expect(turns.data[0].generated).toBe('完整回答一千字')
      expect(turns.data[0].committed).toBe('完整回答一千字')
    }
  })

  it('manual 模式：生成后不写入上下文，需显式 commitTurn', async () => {
    const llm = createMockLLM([{ content: '完整回答' }])
    const ops = createOpsWithDeps(llm)
    const managerResult = ops.createManager({ compress: { maxTokens: 8000 }, turnCommit: 'manual' })
    if (!managerResult.success)
      return
    const manager = managerResult.data

    const result = await manager.chat('问题')
    expect(result.success).toBe(true)
    if (!result.success)
      return

    // 生成后：仅 user 消息在上下文，assistant 尚未提交
    let msgs = manager.getMessages()
    expect(msgs.success && msgs.data).toHaveLength(1)
    expect(msgs.success && msgs.data[0].role).toBe('user')

    // 轮次为 generating
    const turnsBefore = manager.getTurns()
    expect(turnsBefore.success && turnsBefore.data[0].status).toBe('generating')

    // 显式提交完整文本
    const commit = await manager.commitTurn(result.data.turnId)
    expect(commit.success).toBe(true)

    msgs = manager.getMessages()
    expect(msgs.success && msgs.data).toHaveLength(2)
    expect(msgs.success && msgs.data[1].content).toBe('完整回答')

    const turnsAfter = manager.getTurns()
    expect(turnsAfter.success && turnsAfter.data[0].status).toBe('completed')
  })

  it('manual 模式：被打断时只写入实际播放的文本', async () => {
    const llm = createMockLLM([{ content: '本想说满一千字的完整回答' }])
    const ops = createOpsWithDeps(llm)
    const managerResult = ops.createManager({ compress: { maxTokens: 8000 }, turnCommit: 'manual' })
    if (!managerResult.success)
      return
    const manager = managerResult.data

    const result = await manager.chat('问题')
    if (!result.success)
      return

    // 主持人在播放到「本想说」处打断
    const spoken = '本想说'
    const interrupt = await manager.interruptTurn(result.data.turnId, { text: spoken })
    expect(interrupt.success).toBe(true)

    const msgs = manager.getMessages()
    expect(msgs.success && msgs.data[1].content).toBe(spoken)

    const turns = manager.getTurns()
    expect(turns.success).toBe(true)
    if (turns.success) {
      expect(turns.data[0].status).toBe('interrupted')
      expect(turns.data[0].generated).toBe('本想说满一千字的完整回答')
      expect(turns.data[0].committed).toBe(spoken)
    }
  })

  it('manual 模式：打断且未表达任何内容时不写入 assistant 消息', async () => {
    const llm = createMockLLM([{ content: '还没来得及说' }])
    const ops = createOpsWithDeps(llm)
    const managerResult = ops.createManager({ compress: { maxTokens: 8000 }, turnCommit: 'manual' })
    if (!managerResult.success)
      return
    const manager = managerResult.data

    const result = await manager.chat('问题')
    if (!result.success)
      return

    const interrupt = await manager.interruptTurn(result.data.turnId)
    expect(interrupt.success).toBe(true)

    // 未表达：上下文只有 user 一条
    const msgs = manager.getMessages()
    expect(msgs.success && msgs.data).toHaveLength(1)
  })

  it('commitTurn 未知 turnId 返回 CONTEXT_TURN_NOT_FOUND', async () => {
    const llm = createMockLLM([{ content: 'x' }])
    const ops = createOpsWithDeps(llm)
    const managerResult = ops.createManager({ compress: { maxTokens: 8000 }, turnCommit: 'manual' })
    if (!managerResult.success)
      return

    const commit = await managerResult.data.commitTurn('turn_does_not_exist')
    expect(commit.success).toBe(false)
    if (!commit.success)
      expect(commit.error.code).toBe(HaiAIError.CONTEXT_TURN_NOT_FOUND.code)
  })

  it('重复提交返回 CONTEXT_TURN_INVALID_STATE', async () => {
    const llm = createMockLLM([{ content: 'x' }])
    const ops = createOpsWithDeps(llm)
    const managerResult = ops.createManager({ compress: { maxTokens: 8000 }, turnCommit: 'manual' })
    if (!managerResult.success)
      return
    const manager = managerResult.data

    const result = await manager.chat('问题')
    if (!result.success)
      return

    await manager.commitTurn(result.data.turnId)
    const second = await manager.commitTurn(result.data.turnId)
    expect(second.success).toBe(false)
    if (!second.success)
      expect(second.error.code).toBe(HaiAIError.CONTEXT_TURN_INVALID_STATE.code)
  })

  it('markTurnSpeaking 将 generating 轮次标记为 speaking', async () => {
    const llm = createMockLLM([{ content: 'x' }])
    const ops = createOpsWithDeps(llm)
    const managerResult = ops.createManager({ compress: { maxTokens: 8000 }, turnCommit: 'manual' })
    if (!managerResult.success)
      return
    const manager = managerResult.data

    const result = await manager.chat('问题')
    if (!result.success)
      return

    const mark = manager.markTurnSpeaking(result.data.turnId)
    expect(mark.success).toBe(true)
    const turns = manager.getTurns()
    expect(turns.success && turns.data[0].status).toBe('speaking')
  })
})

// =============================================================================
// Memory 生命周期：会话固化 consolidate 测试
// =============================================================================

describe('context consolidate (memory lifecycle)', () => {
  function createMockMemory(): { memory: MemoryOperations, extract: ReturnType<typeof vi.fn> } {
    const extract = vi.fn(async () => ({
      success: true as const,
      data: [{ id: 'lt1', content: '长期事实', type: 'fact' as const, importance: 0.8, createdAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 0 }],
    }))
    return { memory: { extract } as unknown as MemoryOperations, extract }
  }

  function createOpsWithMemoryAndSummary(llm: LLMOperations, memory: MemoryOperations) {
    const tokenOps = createTokenOperations(defaultTokenConfig)
    const summaryOps = createSummaryOperations(defaultLLMConfig, llm, tokenOps, defaultSummaryConfig)
    const compressOps = createCompressOperations(defaultCompressConfig, tokenOps, summaryOps, 8000)
    return createContextOperations(defaultCompressConfig, tokenOps, compressOps, undefined, undefined, { llm, memory, summary: summaryOps })
  }

  it('consolidate 生成摘要并以持久作用域固化长期记忆', async () => {
    // 第一个 mock 回复用于 chat，第二个用于 summary.generate
    const llm = createMockLLM([{ content: 'AI 回复' }, { content: '本次会话摘要' }])
    const { memory, extract } = createMockMemory()
    const ops = createOpsWithMemoryAndSummary(llm, memory)

    const managerResult = ops.createManager({
      scope: { objectId: 'user-1', sessionId: 'sess-1' },
      compress: { maxTokens: 8000 },
      memory: { scope: { sessionId: 'sess-1' } },
    })
    if (!managerResult.success)
      return
    const manager = managerResult.data

    await manager.chat('聊点什么')

    const result = await manager.consolidate({ scope: { userId: 'user-1' } })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data.summary).toBe('本次会话摘要')
    expect(result.data.memories).toHaveLength(1)

    // 固化使用传入的持久作用域（不含 sessionId）
    const extractCall = extract.mock.calls[0]
    expect(extractCall[1]).toEqual(expect.objectContaining({ objectId: 'user-1', scope: { userId: 'user-1' } }))
  })

  it('consolidate 缺少 summary/memory 依赖时返回 MEMORY_PROMOTE_FAILED', async () => {
    const tokenOps = createTokenOperations(defaultTokenConfig)
    const llm = createMockLLM([{ content: 'x' }])
    const summaryOps = createSummaryOperations(defaultLLMConfig, llm, tokenOps, defaultSummaryConfig)
    const compressOps = createCompressOperations(defaultCompressConfig, tokenOps, summaryOps, 8000)
    // 只传 llm，无 memory / summary
    const ops = createContextOperations(defaultCompressConfig, tokenOps, compressOps, undefined, undefined, { llm })

    const managerResult = ops.createManager({ compress: { maxTokens: 8000 } })
    if (!managerResult.success)
      return

    const result = await managerResult.data.consolidate()
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiAIError.MEMORY_PROMOTE_FAILED.code)
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

  it('chatStream 先产出 turn_started 再 done，turnId 一致', async () => {
    const llm: LLMOperations = {
      chat: vi.fn(),
      chatStream: vi.fn(() => (async function* () {
        yield {
          id: 'c1',
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: 'test-model',
          choices: [{ index: 0, delta: { role: 'assistant', content: '你好' }, finish_reason: null }],
        } as ChatCompletionChunk
        yield {
          id: 'c2',
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: 'test-model',
          choices: [{ index: 0, delta: { content: '，世界' }, finish_reason: 'stop' }],
        } as ChatCompletionChunk
      })()),
      listModels: vi.fn(),
    } as unknown as LLMOperations

    const ops = createOpsWithDeps(llm)
    const managerResult = ops.createManager({ compress: { maxTokens: 8000 } })
    expect(managerResult.success).toBe(true)
    if (!managerResult.success)
      return

    const events: Array<{ type: string, [key: string]: unknown }> = []
    for await (const event of managerResult.data.chatStream('打个招呼')) {
      events.push(event)
    }

    expect(events[0].type).toBe('turn_started')
    expect(events[0].turnId).toBeTruthy()
    const doneEvent = events.find(e => e.type === 'done')
    expect(doneEvent).toBeDefined()
    expect(doneEvent?.reply).toBe('你好，世界')
    // done 复用 turn_started 登记的同一 turnId
    expect(doneEvent?.turnId).toBe(events[0].turnId)
  })

  it('chatStream 中途取消：保留 turn 与已生成文本并产出 cancelled', async () => {
    const controller = new AbortController()
    const llm: LLMOperations = {
      chat: vi.fn(),
      chatStream: vi.fn((req: { signal?: AbortSignal }) => (async function* () {
        yield {
          id: 'c1',
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: 'test-model',
          choices: [{ index: 0, delta: { role: 'assistant', content: '已经说的部分' }, finish_reason: null }],
        } as ChatCompletionChunk
        // 模拟外部打断
        controller.abort()
        if (req.signal?.aborted)
          throw new Error('aborted')
        yield {
          id: 'c2',
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: 'test-model',
          choices: [{ index: 0, delta: { content: '不该出现' }, finish_reason: 'stop' }],
        } as ChatCompletionChunk
      })()),
      listModels: vi.fn(),
    } as unknown as LLMOperations

    const ops = createOpsWithDeps(llm)
    const managerResult = ops.createManager({ compress: { maxTokens: 8000 }, turnCommit: 'manual' })
    expect(managerResult.success).toBe(true)
    if (!managerResult.success)
      return
    const manager = managerResult.data

    const events: Array<{ type: string, [key: string]: unknown }> = []
    for await (const event of manager.chatStream('讲个长故事', { signal: controller.signal })) {
      events.push(event)
    }

    expect(events[0].type).toBe('turn_started')
    const cancelled = events.find(e => e.type === 'cancelled')
    expect(cancelled).toBeDefined()
    expect(cancelled?.generated).toBe('已经说的部分')
    const turnId = events[0].turnId as string

    // 取消后 turn 仍保留，可用真实内容打断提交
    const interrupt = await manager.interruptTurn(turnId, { text: '实际说了这些' })
    expect(interrupt.success).toBe(true)

    const turns = manager.getTurns()
    expect(turns.success).toBe(true)
    if (turns.success) {
      const turn = turns.data.find(t => t.id === turnId)
      expect(turn?.status).toBe('interrupted')
      expect(turn?.committed).toBe('实际说了这些')
    }
  })
})

// =============================================================================
// 记忆作用域透传与后台提取 flush
// =============================================================================

describe('context memory scope + flush', () => {
  interface MemoryMock {
    memory: MemoryOperations
    injectCalls: Array<Record<string, unknown> | undefined>
    extractCalls: Array<Record<string, unknown> | undefined>
    resolveExtract: () => void
  }

  /** 创建可观测 injectMemories / extract 调用参数的 Memory mock，extract 支持手动 resolve */
  function createMemoryMock(): MemoryMock {
    const injectCalls: Array<Record<string, unknown> | undefined> = []
    const extractCalls: Array<Record<string, unknown> | undefined> = []
    let resolveExtract: () => void = () => {}

    const memory = {
      injectMemories: vi.fn(async (messages: unknown, options?: Record<string, unknown>) => {
        injectCalls.push(options)
        return { success: true as const, data: messages }
      }),
      extract: vi.fn((_messages: unknown, options?: Record<string, unknown>) => {
        extractCalls.push(options)
        return new Promise((resolve) => {
          resolveExtract = () => resolve({ success: true as const, data: [] })
        })
      }),
      recall: vi.fn(),
      add: vi.fn(),
      update: vi.fn(),
      get: vi.fn(),
      remove: vi.fn(),
      list: vi.fn(),
      listPage: vi.fn(),
      clear: vi.fn(),
    } as unknown as MemoryOperations

    return { memory, injectCalls, extractCalls, resolveExtract: () => resolveExtract() }
  }

  function createOpsWithMemory(llm: LLMOperations, memory: MemoryOperations) {
    const tokenOps = createTokenOperations(defaultTokenConfig)
    const summaryOps = createSummaryOperations(defaultLLMConfig, llm, tokenOps, defaultSummaryConfig)
    const compressOps = createCompressOperations(defaultCompressConfig, tokenOps, summaryOps, 8000)
    return createContextOperations(defaultCompressConfig, tokenOps, compressOps, undefined, undefined, { llm, memory })
  }

  it('chat 将 scope / types / minImportance 完整透传给 injectMemories（issue #5）', async () => {
    const llm = createMockLLM([{ content: 'ok' }])
    const mock = createMemoryMock()
    const ops = createOpsWithMemory(llm, mock.memory)

    const managerResult = ops.createManager({
      scope: { objectId: 'user-1', sessionId: 'sess-1' },
      compress: { maxTokens: 8000 },
      memory: {
        enable: true,
        scope: { topicId: 'A', personaId: 'p1' },
        types: ['preference', 'fact'],
        minImportance: 0.3,
        topK: 7,
        position: 'before-last',
      },
    })
    expect(managerResult.success).toBe(true)
    if (!managerResult.success)
      return

    await managerResult.data.chat('你好')

    expect(mock.injectCalls).toHaveLength(1)
    expect(mock.injectCalls[0]).toMatchObject({
      objectId: 'user-1',
      scope: { topicId: 'A', personaId: 'p1' },
      types: ['preference', 'fact'],
      minImportance: 0.3,
      topK: 7,
      position: 'before-last',
    })
  })

  it('chat 将 scope / model / systemPrompt 透传给 extract（issue #5）', async () => {
    const llm = createMockLLM([{ content: 'ok' }])
    const mock = createMemoryMock()
    const ops = createOpsWithMemory(llm, mock.memory)

    const managerResult = ops.createManager({
      scope: { objectId: 'user-1', sessionId: 'sess-1' },
      compress: { maxTokens: 8000 },
      memory: {
        enableExtract: true,
        scope: { topicId: 'A' },
        types: ['fact'],
        extractionModel: 'extract-model',
        extractionSystemPrompt: 'only durable facts',
      },
    })
    expect(managerResult.success).toBe(true)
    if (!managerResult.success)
      return

    const manager = managerResult.data
    await manager.chat('你好')
    mock.resolveExtract()
    await manager.flush()

    expect(mock.extractCalls).toHaveLength(1)
    expect(mock.extractCalls[0]).toMatchObject({
      objectId: 'user-1',
      scope: { topicId: 'A' },
      types: ['fact'],
      model: 'extract-model',
      systemPrompt: 'only durable facts',
    })
  })

  it('flush 等待后台记忆提取完成，pendingMemoryTasks 反映挂起数量（issue #14）', async () => {
    const llm = createMockLLM([{ content: 'ok' }])
    const mock = createMemoryMock()
    const ops = createOpsWithMemory(llm, mock.memory)

    const managerResult = ops.createManager({
      scope: { objectId: 'user-1', sessionId: 'sess-1' },
      compress: { maxTokens: 8000 },
      memory: { enableExtract: true },
    })
    expect(managerResult.success).toBe(true)
    if (!managerResult.success)
      return

    const manager = managerResult.data
    await manager.chat('你好')

    // 提取任务尚未 resolve，应处于挂起
    expect(manager.pendingMemoryTasks).toBe(1)

    // resolve 后 flush 应完成且挂起归零
    mock.resolveExtract()
    const flushed = await manager.flush()
    expect(flushed.success).toBe(true)
    expect(manager.pendingMemoryTasks).toBe(0)
  })

  it('save 前自动 flush 后台记忆提取（issue #14）', async () => {
    const llm = createMockLLM([{ content: 'ok' }])
    const mock = createMemoryMock()
    const ops = createOpsWithMemory(llm, mock.memory)

    const managerResult = ops.createManager({
      compress: { maxTokens: 8000 },
      memory: { enableExtract: true },
    })
    expect(managerResult.success).toBe(true)
    if (!managerResult.success)
      return

    const manager = managerResult.data
    await manager.chat('你好')
    expect(manager.pendingMemoryTasks).toBe(1)

    // save 无 scope/store 时也会先 flush；先安排 resolve，避免死等
    mock.resolveExtract()
    const saved = await manager.save()
    expect(saved.success).toBe(true)
    expect(manager.pendingMemoryTasks).toBe(0)
  })
})
