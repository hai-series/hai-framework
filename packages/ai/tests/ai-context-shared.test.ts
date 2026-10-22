/** 真实 Store 支撑的跨管理器恢复、并发与最终写入 fencing。 */
import type { PersistedContextState } from '../src/context/ai-context-state.js'
import type { LLMOperations } from '../src/llm/ai-llm-types.js'
import type { SessionInfo } from '../src/store/ai-store-types.js'
import { describe, expect, it, vi } from 'vitest'
import { CompressConfigSchema, LLMConfigSchema } from '../src/ai-config.js'
import { HaiAIError } from '../src/ai-types.js'
import { createCompressOperations } from '../src/compress/ai-compress-functions.js'
import { createContextOperations } from '../src/context/ai-context-functions.js'
import { createDbStoreProviderFromModules } from '../src/store/providers/ai-store-provider-db.js'
import { createMemoryStoreProvider } from '../src/store/providers/ai-store-provider-memory.js'
import { createSummaryOperations } from '../src/summary/ai-summary-functions.js'
import { createTokenOperations } from '../src/token/ai-token-functions.js'

/** 仅替代外部模型；Context 与 Memory/SQLite 状态协议均调用真实实现。 */
function model(reply: () => Promise<string>): LLMOperations {
  return {
    chat: vi.fn<LLMOperations['chat']>(async () => ({ success: true, data: {
      id: 'completion',
      object: 'chat.completion',
      created: 0,
      model: 'test',
      choices: [{ index: 0, logprobs: null, finish_reason: 'stop', message: { role: 'assistant', content: await reply(), refusal: null } }],
    } })),
    async* chatStream() {
      for (const content of ['first', 'second']) {
        yield { id: 'stream', object: 'chat.completion.chunk', created: 0, model: 'test', choices: [{ index: 0, delta: { content }, finish_reason: null }] }
      }
    },
    listModels: vi.fn(),
    getHistory: vi.fn(),
    listSessions: vi.fn(),
    ask: vi.fn(),
    askStream: vi.fn(),
    generateObject: vi.fn(),
  }
}

let sequence = 0
describe.each(['memory', 'sqlite'] as const)('shared context %s', (backend) => {
  async function setup(llm = model(async () => 'reply')) {
    const provider = backend === 'memory' ? createMemoryStoreProvider() : createDbStoreProviderFromModules()
    const table = `hai_ai_context_shared_${sequence++}`
    const store = provider.createRelStore<PersistedContextState>(table, { hasObjectId: true, hasSessionId: true })
    const sessions = provider.createRelStore<SessionInfo>(`${table}_sessions`, { hasObjectId: true })
    await provider.initialize()
    const token = createTokenOperations({ tokenRatio: 0.25 })
    const config = CompressConfigSchema.parse({})
    const summary = createSummaryOperations(LLMConfigSchema.parse({ baseUrl: 'http://unused.test', apiKey: 'test', model: 'test', timeout: 1000 }), llm, token, {})
    const compress = createCompressOperations(config, token, summary, 4096)
    const scope = { objectId: 'user', sessionId: crypto.randomUUID() }
    const ops = createContextOperations(config, token, compress, store, sessions, { llm })
    function manager() {
      const result = ops.createManager({ scope, turnCommit: 'manual', compress: { auto: false } })
      if (!result.success)
        throw new Error(result.error.message)
      return result.data
    }
    return { store, ops, scope, a: manager(), b: manager(), llm }
  }

  it('两个管理器并发追加不丢失，读取副本不能修改共享状态', async () => {
    const { a, b } = await setup()
    const results = await Promise.all(Array.from({ length: 20 }, (_, index) => (index % 2 ? a : b).addMessage({ role: 'user', content: String(index) })))
    expect(results.every(result => result.success)).toBe(true)
    expect((await b.reload()).success).toBe(true)
    const messages = b.getMessages()
    expect(messages.success && messages.data).toHaveLength(20)
    if (messages.success)
      messages.data[0].content = 'mutated'
    expect(a.getMessages().success).toBe(true)
    await a.reload()
    const current = a.getMessages()
    expect(current.success && current.data.some(item => item.content === 'mutated')).toBe(false)
  })

  it('a 生成、B 恢复提交；并发与重复提交只写一次，pending 不因恢复丢失', async () => {
    const { a, b, ops, scope } = await setup()
    const generated = await a.chat('question')
    expect(generated.success).toBe(true)
    if (!generated.success)
      return
    const restored = await ops.restoreManager(scope, { turnCommit: 'manual' })
    expect(restored.success).toBe(true)
    if (!restored.success)
      return
    expect(restored.data.getTurns()).toMatchObject({ success: true, data: [{ id: generated.data.turnId, generated: 'reply', committed: '' }] })
    expect((await b.chat('must-wait')).success).toBe(false)
    const results = await Promise.all([a.commitTurn(generated.data.turnId), restored.data.commitTurn(generated.data.turnId), b.commitTurn(generated.data.turnId)])
    expect(results.every(result => result.success)).toBe(true)
    await b.reload()
    expect(b.getMessages()).toMatchObject({ success: true, data: [{ content: 'question' }, { content: 'reply' }] })
    expect((await b.commitTurn(generated.data.turnId, { text: 'different' })).success).toBe(false)
  })

  it('每个对外 delta 已持久化，另一节点按真实文本打断后旧流不能覆盖', async () => {
    const { a, b } = await setup()
    const stream = a.chatStream('question')[Symbol.asyncIterator]()
    const started = await stream.next()
    expect(started.value).toMatchObject({ type: 'turn_started' })
    const id = started.value?.type === 'turn_started' ? started.value.turnId : ''
    expect((await stream.next()).value).toEqual({ type: 'delta', text: 'first' })
    await b.reload()
    expect(b.getTurns()).toMatchObject({ success: true, data: [{ generated: 'first' }] })
    expect((await b.interruptTurn(id, { text: 'fir' })).success).toBe(true)
    await expect(stream.next()).rejects.toThrow('ownership')
    await b.reload()
    expect(b.getMessages()).toMatchObject({ success: true, data: [{ content: 'question' }, { content: 'fir' }] })
  })

  it.each(['reset', 'remove'] as const)('%s 拒绝忽略取消信号的旧生成，旧 save 不能复活删除会话', async (operation) => {
    let finish!: (text: string) => void
    const upstream = new Promise<string>((resolve) => {
      finish = resolve
    })
    const { a, b, ops, scope, llm } = await setup(model(() => upstream))
    const pending = a.chat('old')
    await vi.waitFor(() => expect(llm.chat).toHaveBeenCalledOnce())
    expect((operation === 'reset' ? await b.reset() : await ops.removeSession(scope)).success).toBe(true)
    finish('stale')
    expect((await pending).success).toBe(false)
    if (operation === 'remove') {
      expect((await a.save()).success).toBe(false)
      expect((await ops.restoreManager(scope)).success).toBe(false)
    }
    else {
      await b.reload()
      expect(b.getMessages()).toEqual({ success: true, data: [] })
    }
  })

  it('流式消费者提前退出后保留持久 pending，可由其他节点按真实内容提交', async () => {
    const { a, b } = await setup()
    const stream = a.chatStream('question')[Symbol.asyncIterator]()
    const started = await stream.next()
    const id = started.value?.type === 'turn_started' ? started.value.turnId : ''
    await stream.next()
    await stream.return?.()
    expect((await b.interruptTurn(id, { text: 'fir' })).success).toBe(true)
    expect(b.getMessages()).toMatchObject({ success: true, data: [{ content: 'question' }, { content: 'fir' }] })
  })

  it('创建后修改输入或暴露scope副本不能改变持久主体', async () => {
    const { a, scope, store } = await setup()
    const original = structuredClone(scope)
    scope.objectId = 'attacker'
    a.scope.objectId = 'attacker'
    expect((await a.addMessage({ role: 'user', content: 'safe' })).success).toBe(true)
    expect(await store.query({ objectId: original.objectId })).toHaveLength(1)
    expect(await store.query({ objectId: 'attacker' })).toHaveLength(0)
  })

  it('消费者停在yield时取消也立即持久pending，另一节点无需等租约即可提交', async () => {
    const { a, b, store, scope } = await setup()
    const controller = new AbortController()
    const stream = a.chatStream('question', { signal: controller.signal })[Symbol.asyncIterator]()
    const started = await stream.next()
    const id = started.value?.type === 'turn_started' ? started.value.turnId : ''
    await stream.next()
    controller.abort()
    await vi.waitFor(async () => {
      const current = await store.readVersioned(JSON.stringify([scope.objectId, scope.sessionId]))
      expect(current?.data.active?.phase).toBe('pending')
    })
    expect((await b.interruptTurn(id, { text: 'fir' })).success).toBe(true)
    await stream.return?.()
    expect(b.getMessages()).toMatchObject({ success: true, data: [{ content: 'question' }, { content: 'fir' }] })
  })

  it('持久化故障失败关闭，既不伪造成功也不发布本地未提交快照', async () => {
    const { a, store } = await setup()
    const spy = vi.spyOn(store, 'compareAndSwap').mockRejectedValueOnce(new Error('Database unavailable'))
    const failed = await a.addMessage({ role: 'user', content: 'uncommitted' })
    expect(failed).toMatchObject({ success: false, error: { code: HaiAIError.STORE_FAILED.code } })
    expect(a.getMessages()).toEqual({ success: true, data: [] })
    spy.mockRestore()
    expect((await a.reload()).success).toBe(true)
    expect(a.getMessages()).toEqual({ success: true, data: [] })
  })

  it('会话目录的并发save保留重命名，删除墓碑使旧管理器无法重建目录', async () => {
    const { a, b, ops, scope } = await setup()
    expect((await a.addMessage({ role: 'user', content: 'one' })).success).toBe(true)
    expect((await a.save()).success).toBe(true)
    const concurrent = await Promise.all([ops.renameSession(scope, 'kept-title'), b.save()])
    expect(concurrent.every(result => result.success)).toBe(true)
    expect(await ops.listSessions(scope.objectId)).toMatchObject({ success: true, data: [{ title: 'kept-title' }] })
    expect((await ops.removeSession(scope)).success).toBe(true)
    expect((await a.save()).success).toBe(false)
    expect(await ops.listSessions(scope.objectId)).toEqual({ success: true, data: [] })
  })
})
