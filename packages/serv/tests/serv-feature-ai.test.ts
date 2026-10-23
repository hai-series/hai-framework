import type { ChatRecord, MemoryEntry } from '@h-ai/ai'
import type { AiProcedureDeps } from '../src/features/serv-feature-ai.js'
import type { ServContext } from '../src/serv-context.js'
import { apiContract } from '@h-ai/api-contract'
import { core, HaiCommonError, ok } from '@h-ai/core'
import { describe, expect, it, vi } from 'vitest'
import { createAiProcedures } from '../src/features/serv-feature-ai.js'
import { serv } from '../src/serv-main.js'

function createAiMock(): AiProcedureDeps['ai'] {
  const records: ChatRecord[] = []
  const memories: MemoryEntry[] = ['user-a', 'user-b'].map(objectId => ({
    id: `memory-${objectId}`,
    content: `${objectId}-private`,
    type: 'fact',
    importance: 1,
    objectId,
    createdAt: 1,
    lastAccessedAt: 1,
    accessCount: 0,
  }))
  function record(objectId: string | undefined, sessionId: string | undefined): void {
    records.push({
      id: `record-${records.length}`,
      objectId: objectId ?? 'unscoped',
      sessionId: sessionId ?? 'default',
      request: { model: 'mock', messages: [{ role: 'user', content: `${objectId}-private` }] },
      response: { content: `${objectId}-reply`, finishReason: 'stop', usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
      createdAt: 1,
      duration: 1,
    })
  }
  return {
    config: null,
    llm: {
      chat: vi.fn<AiProcedureDeps['ai']['llm']['chat']>(async (request) => {
        record(request.objectId, request.sessionId)
        return ok({
          id: 'completion',
          object: 'chat.completion',
          created: 1,
          model: 'mock',
          choices: [{ index: 0, finish_reason: 'stop', logprobs: null, message: { role: 'assistant', content: 'reply', refusal: null } }],
        })
      }),
      ask: vi.fn<AiProcedureDeps['ai']['llm']['ask']>(async (_message, options) => {
        record(options?.objectId, options?.sessionId)
        return ok('reply')
      }),
      getHistory: vi.fn<AiProcedureDeps['ai']['llm']['getHistory']>(async scope => ok(records.filter(row => row.objectId === scope.objectId && row.sessionId === scope.sessionId))),
      listSessions: vi.fn<AiProcedureDeps['ai']['llm']['listSessions']>(async objectId => ok(records.filter(row => row.objectId === objectId).map(row => ({
        objectId,
        sessionId: row.sessionId,
        createdAt: 1,
        updatedAt: 1,
      })))),
    },
    memory: {
      recall: vi.fn<AiProcedureDeps['ai']['memory']['recall']>(async (_query, options) => ok(memories.filter(row => !options?.objectId || row.objectId === options.objectId))),
      listPage: vi.fn<AiProcedureDeps['ai']['memory']['listPage']>(async (options) => {
        const items = memories.filter(row => !options?.objectId || row.objectId === options.objectId)
        return ok({ items, total: items.length })
      }),
    },
  }
}

function createApp(ai: AiProcedureDeps['ai'], userId = 'user-a', authorizeObject?: AiProcedureDeps['authorizeObject']) {
  return serv.createApp({
    contract: apiContract.ai,
    procedures: createAiProcedures({ ai, authorizeObject }),
    createContext: ({ request }): ServContext => ({
      requestId: 'ai-scope-test',
      locale: 'en-US',
      request,
      logger: core.logger.child({ module: 'serv-test' }),
      session: { userId, roles: [], permissions: userId === 'admin' ? ['ai.manage'] : [] },
    }),
  })
}

function request(app: ReturnType<typeof createApp>, path: string, input: object) {
  return app.request(`/api/v1/ai/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

describe('serv feature AI resource authorization', () => {
  it.each(['auto', 'none', 'required'] as const)('工具选择 %s 与完整定义传递到 AI', async (toolChoice) => {
    const ai = createAiMock()
    const app = createApp(ai)
    const tools = [{ type: 'function', function: { name: 'lookup', strict: true, parameters: { type: 'object', additionalProperties: false } } }]
    const response = await request(app, 'chats/completions', { messages: [{ role: 'user', name: 'alice', content: 'hello' }], tools, tool_choice: toolChoice })
    const result = await response.json()
    expect(result.success).toBe(true)
    expect(ai.llm.chat).toHaveBeenCalledWith(expect.objectContaining({ tools, tool_choice: toolChoice, messages: [{ role: 'user', name: 'alice', content: 'hello' }] }))
  })

  it.each([
    { stream: true },
    { stream: false },
    { tool_choice: 'required' },
    { tool_choice: { type: 'function', function: { name: 'missing' } } },
    { messages: [{ role: 'tool', content: 'result' }] },
    { messages: [{ role: 'tool', tool_call_id: '', content: 'result' }] },
    { messages: [{ role: 'assistant' }] },
    { messages: [{ role: 'user', content: 'hello', tool_call_id: 'wrong-role' }] },
    { messages: [{ role: 'system', content: [{ type: 'image_url', image_url: { url: 'https://example.com/image.png' } }] }] },
  ])('不支持或不完整的补全请求在 HTTP 边界失败：%j', async (invalid) => {
    const ai = createAiMock()
    const app = createApp(ai)
    const response = await request(app, 'chats/completions', { messages: [{ role: 'user', content: 'hello' }], ...invalid })
    expect(response.status).toBe(400)
    expect(ai.llm.chat).not.toHaveBeenCalled()
  })

  it.each([
    { path: 'chats/completions', input: { messages: [{ role: 'user', content: 'hello' }] } },
    { path: 'chats/messages', input: { message: 'hello' } },
    { path: 'chats/history', input: { sessionId: 'shared-name' } },
    { path: 'memories/recall', input: { query: 'private' } },
    { path: 'memories/list', input: {} },
    { path: 'sessions/list', input: {} },
  ])('$path 拒绝伪造的其它主体且不调用 AI', async ({ path, input }) => {
    const ai = createAiMock()
    const app = createApp(ai)
    const response = await request(app, path, { ...input, objectId: 'user-b' })
    const result = await response.json()
    expect(result.success).toBe(false)
    expect(result.error.code).toBe(HaiCommonError.FORBIDDEN.code)
    for (const call of [...Object.values(ai.llm), ...Object.values(ai.memory)])
      expect(call).not.toHaveBeenCalled()
  })

  it('两个用户使用相同 sessionId 时写入、历史、会话和记忆保持隔离', async () => {
    const ai = createAiMock()
    const appA = createApp(ai, 'user-a')
    const appB = createApp(ai, 'user-b')
    const sessionId = 'shared-name'
    expect((await (await request(appA, 'chats/messages', { message: 'a', sessionId })).json()).success).toBe(true)
    expect((await (await request(appB, 'chats/completions', { messages: [{ role: 'user', content: 'b' }], sessionId })).json()).success).toBe(true)
    expect(ai.llm.ask).toHaveBeenCalledWith('a', expect.objectContaining({ objectId: 'user-a', sessionId }))
    expect(ai.llm.chat).toHaveBeenCalledWith(expect.objectContaining({ objectId: 'user-b', sessionId }))

    for (const [app, objectId] of [[appA, 'user-a'], [appB, 'user-b']] as const) {
      const history = await (await request(app, 'chats/history', { sessionId })).json()
      expect(history.success).toBe(true)
      expect(history.data.items).toHaveLength(1)
      expect(history.data.items[0].objectId).toBe(objectId)
      const sessions = await (await request(app, 'sessions/list', {})).json()
      expect(sessions.data.items.every((item: { objectId: string }) => item.objectId === objectId)).toBe(true)
      const recalled = await (await request(app, 'memories/recall', { query: 'private', scope: { objectId: 'admin' } })).json()
      expect(recalled.data.items).toHaveLength(1)
      expect(recalled.data.items[0].objectId).toBe(objectId)
      const listed = await (await request(app, 'memories/list', {})).json()
      expect(listed.data.total).toBe(1)
      expect(listed.data.items[0].objectId).toBe(objectId)
    }
  })

  it('未指定 sessionId 的写入明确绑定用户的 default 会话', async () => {
    const ai = createAiMock()
    const app = createApp(ai)
    await request(app, 'chats/messages', { message: 'hello', userId: 'user-b' })
    expect(ai.llm.ask).toHaveBeenCalledWith('hello', expect.objectContaining({ objectId: 'user-a', sessionId: 'default' }))
    const history = await (await request(app, 'chats/history', { objectId: 'user-a', sessionId: 'default' })).json()
    expect(history.data.items).toHaveLength(1)
  })

  it('管理员跨主体访问必须显式提供并通过授权策略', async () => {
    const ai = createAiMock()
    const withoutPolicy = createApp(ai, 'admin')
    expect((await (await request(withoutPolicy, 'memories/list', { objectId: 'user-b' })).json()).error.code).toBe(HaiCommonError.FORBIDDEN.code)
    const authorizeObject = vi.fn(async ({ context }: Parameters<NonNullable<AiProcedureDeps['authorizeObject']>>[0]) => context.session.permissions.includes('ai.manage'))
    const withPolicy = createApp(ai, 'admin', authorizeObject)
    const result = await (await request(withPolicy, 'memories/list', { objectId: 'user-b' })).json()
    expect(result.success).toBe(true)
    expect(result.data.items[0].objectId).toBe('user-b')
    expect(authorizeObject).toHaveBeenCalledWith(expect.objectContaining({ operation: 'memoryList', objectId: 'user-b' }))
  })

  it('授权异常时拒绝执行跨主体操作', async () => {
    const ai = createAiMock()
    const app = createApp(ai, 'admin', async () => {
      throw new Error('authorization unavailable')
    })
    const result = await (await request(app, 'chats/messages', { message: 'hello', objectId: 'user-b' })).json()
    expect(result.success).toBe(false)
    expect(ai.llm.ask).not.toHaveBeenCalled()
  })
})
