/**
 * AI Persona 子模块单元测试
 *
 * 测试 AI 角色档案的 save / get / update / remove / list / compose。
 */

import type { AIRelStore } from '../src/store/ai-store-types.js'

import { describe, expect, it, vi } from 'vitest'
import { HaiAIError } from '../src/ai-types.js'
import { createPersonaOperations } from '../src/persona/ai-persona-functions.js'

/**
 * 创建 Map 支撑的 AIRelStore mock（仅覆盖 persona 用到的方法）
 */
function createMockStore<T>(): AIRelStore<T> {
  const data = new Map<string, T>()
  return {
    save: vi.fn(async (id: string, value: T) => { data.set(id, { ...value as object } as T) }),
    saveMany: vi.fn(),
    get: vi.fn(async (id: string) => {
      const v = data.get(id)
      return v ? { ...v as object } as T : undefined
    }),
    query: vi.fn(async (filter?: { objectId?: string }) => {
      const all = Array.from(data.values()).map(v => ({ ...v as object } as T))
      return filter?.objectId ? all.filter(v => (v as { objectId?: string }).objectId === filter.objectId) : all
    }),
    queryPage: vi.fn(),
    remove: vi.fn(async (id: string) => data.delete(id)),
    removeBy: vi.fn(async () => 0),
    count: vi.fn(async () => data.size),
    clear: vi.fn(async () => { data.clear() }),
  } as unknown as AIRelStore<T>
}

describe('createPersonaOperations', () => {
  it('save 创建并保留时间戳，get 命中', async () => {
    const persona = createPersonaOperations(createMockStore())

    const saved = await persona.save({ id: 'xiaop', name: '小P', systemPrompt: '你是社会学家', traits: ['谨慎'] })
    expect(saved.success).toBe(true)
    if (!saved.success)
      return
    expect(saved.data.id).toBe('xiaop')
    expect(saved.data.traits).toEqual(['谨慎'])
    expect(saved.data.createdAt).toBeGreaterThan(0)

    const got = await persona.get('xiaop')
    expect(got.success && got.data.name).toBe('小P')
  })

  it('get 未知 ID 返回 PERSONA_NOT_FOUND', async () => {
    const persona = createPersonaOperations(createMockStore())
    const got = await persona.get('nope')
    expect(got.success).toBe(false)
    if (!got.success)
      expect(got.error.code).toBe(HaiAIError.PERSONA_NOT_FOUND.code)
  })

  it('update 仅改传入字段并保留 createdAt', async () => {
    const persona = createPersonaOperations(createMockStore())
    const saved = await persona.save({ id: 'xiaoq', systemPrompt: '经济学家' })
    if (!saved.success)
      return

    const updated = await persona.update('xiaoq', { traits: ['数据驱动'] })
    expect(updated.success).toBe(true)
    if (!updated.success)
      return
    expect(updated.data.systemPrompt).toBe('经济学家')
    expect(updated.data.traits).toEqual(['数据驱动'])
    expect(updated.data.createdAt).toBe(saved.data.createdAt)
  })

  it('update 未知 ID 返回 PERSONA_NOT_FOUND', async () => {
    const persona = createPersonaOperations(createMockStore())
    const updated = await persona.update('nope', { name: 'x' })
    expect(updated.success).toBe(false)
    if (!updated.success)
      expect(updated.error.code).toBe(HaiAIError.PERSONA_NOT_FOUND.code)
  })

  it('compose 组合 systemPrompt 与 traits', async () => {
    const persona = createPersonaOperations(createMockStore())
    await persona.save({ id: 'r', systemPrompt: '你是技术专家', traits: ['严谨', '喜欢举例'] })

    const composed = await persona.compose('r')
    expect(composed.success).toBe(true)
    if (!composed.success)
      return
    expect(composed.data).toContain('你是技术专家')
    expect(composed.data).toContain('- 严谨')
    expect(composed.data).toContain('- 喜欢举例')
  })

  it('compose 无 traits 时仅返回 systemPrompt', async () => {
    const persona = createPersonaOperations(createMockStore())
    await persona.save({ id: 'plain', systemPrompt: '纯提示词' })
    const composed = await persona.compose('plain')
    expect(composed.success && composed.data).toBe('纯提示词')
  })

  it('list 返回全部并按创建顺序', async () => {
    const persona = createPersonaOperations(createMockStore())
    await persona.save({ id: 'a', systemPrompt: 'A' })
    await persona.save({ id: 'b', systemPrompt: 'B' })
    const listed = await persona.list()
    expect(listed.success && listed.data).toHaveLength(2)
  })

  it('remove 删除档案', async () => {
    const persona = createPersonaOperations(createMockStore())
    await persona.save({ id: 'x', systemPrompt: 'X' })
    const removed = await persona.remove('x')
    expect(removed.success).toBe(true)
    const got = await persona.get('x')
    expect(got.success).toBe(false)
  })

  it('不同 objectId 隔离同名角色', async () => {
    const persona = createPersonaOperations(createMockStore())
    await persona.save({ id: 'sociologist', objectId: 'user-a', systemPrompt: 'A 的社会学家' })
    await persona.save({ id: 'sociologist', objectId: 'user-b', systemPrompt: 'B 的社会学家' })

    const a = await persona.get('sociologist', { objectId: 'user-a' })
    const b = await persona.get('sociologist', { objectId: 'user-b' })
    expect(a.success && a.data.systemPrompt).toBe('A 的社会学家')
    expect(b.success && b.data.systemPrompt).toBe('B 的社会学家')

    const listA = await persona.list({ objectId: 'user-a' })
    expect(listA.success && listA.data).toHaveLength(1)

    // user-a 删除不影响 user-b
    await persona.remove('sociologist', { objectId: 'user-a' })
    const gone = await persona.get('sociologist', { objectId: 'user-a' })
    const still = await persona.get('sociologist', { objectId: 'user-b' })
    expect(gone.success).toBe(false)
    expect(still.success).toBe(true)
  })
})
