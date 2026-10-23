/** 向量库生命周期须保留失败候选与旧资源所有权；关闭期间停止业务发布。 */
import type { HaiResult } from '@h-ai/core'
import type { VecdbProvider } from '../src/providers/vecdb-provider-base.js'
import { err, ok } from '@h-ai/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { vecdb } from '../src/vecdb-main.js'
import { HaiVecdbError } from '../src/vecdb-types.js'

const state = vi.hoisted(() => ({ factory: vi.fn<() => VecdbProvider>() }))
vi.mock('../src/providers/vecdb-provider-qdrant.js', () => ({ createQdrantProvider: state.factory }))
const failure = () => err(HaiVecdbError.CONNECTION_FAILED, 'Controlled provider failure')
const connect = vi.fn<() => Promise<HaiResult<void>>>()
const close = vi.fn<() => Promise<HaiResult<void>>>()
function provider(): VecdbProvider {
  return { name: 'qdrant', connect, close, isConnected: () => true, collection: { create: async () => ok(undefined), drop: async () => ok(undefined), exists: async () => ok(true), info: async () => ok({ name: 'docs', dimension: 3, metric: 'cosine', count: 0 }), list: async () => ok(['docs']) }, vector: { insert: async () => ok(undefined), upsert: async () => ok(undefined), delete: async () => ok(undefined), search: async () => ok([]), count: async () => ok(0) } }
}
beforeEach(async () => {
  close.mockResolvedValue(ok(undefined))
  await vecdb.close()
  vi.clearAllMocks()
  state.factory.mockImplementation(provider)
  connect.mockResolvedValue(ok(undefined))
  close.mockResolvedValue(ok(undefined))
})
afterEach(async () => {
  close.mockResolvedValue(ok(undefined))
  await vecdb.close()
})
const config = { type: 'qdrant', url: 'http://localhost:6333' } as const

describe('vecdb resource ownership', () => {
  it.each(['result', 'throw'])('close %s失败停止发布且同一资源可以重试', async (mode) => {
    expect((await vecdb.init(config)).success).toBe(true)
    const captured = vecdb.collection
    if (mode === 'throw')
      close.mockRejectedValueOnce(new Error('Controlled close rejection'))
    else close.mockResolvedValueOnce(failure())
    const stopped = await vecdb.close()
    expect(stopped.success).toBe(false)
    expect(vecdb.isInitialized).toBe(false)
    expect(vecdb.config).toBeNull()
    expect(vecdb.rawConnection).toBeNull()
    expect((await vecdb.collection.list()).success).toBe(false)
    expect((await captured.list()).success).toBe(false)
    expect((await vecdb.close()).success).toBe(true)
    expect(close).toHaveBeenCalledTimes(2)
  })
  it('连接失败的候选清理失败会阻止下一次创建直到原资源清理成功', async () => {
    connect.mockResolvedValueOnce(failure())
    close.mockResolvedValue(failure())
    const result = await vecdb.init(config)
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.ext?.cleanupPending).toBe(true)
    expect(close).toHaveBeenCalledTimes(1)
    expect((await vecdb.init(config)).success).toBe(false)
    expect(state.factory).toHaveBeenCalledTimes(1)
    close.mockResolvedValue(ok(undefined))
    expect((await vecdb.init(config)).success).toBe(true)
    expect(state.factory).toHaveBeenCalledTimes(2)
  })
  it('初始化错误上的 cleanupPending 在后续回收成功后清除', async () => {
    connect.mockResolvedValueOnce(err({ ...HaiVecdbError.CONNECTION_FAILED, message: 'Controlled startup failure', ext: { cleanupPending: true, cleanupError: 'first cleanup failed' } }))
    const result = await vecdb.init(config)
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.ext?.cleanupPending).toBeUndefined()
    expect(close).toHaveBeenCalledTimes(1)
  })
  it('连接抛错也清理候选', async () => {
    connect.mockRejectedValueOnce(new Error('Controlled connect rejection'))
    expect((await vecdb.init(config)).success).toBe(false)
    expect(close).toHaveBeenCalledTimes(1)
  })
  it('close等待进行中的初始化后关闭，不在返回后迟到发布连接', async () => {
    let finish!: (result: HaiResult<void>) => void
    connect.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    const initializing = vecdb.init(config)
    await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(1))
    const closing = vecdb.close()
    let settled = false
    void closing.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    finish(ok(undefined))
    expect((await initializing).success).toBe(true)
    expect((await closing).success).toBe(true)
    expect(vecdb.isInitialized).toBe(false)
    expect(close).toHaveBeenCalledTimes(1)
  })
  it('并发close合并一次清理；关闭中拒绝新初始化', async () => {
    await vecdb.init(config)
    let finish!: (result: HaiResult<void>) => void
    close.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    const first = vecdb.close()
    const second = vecdb.close()
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1))
    expect((await vecdb.init(config)).success).toBe(false)
    expect(state.factory).toHaveBeenCalledTimes(1)
    finish(ok(undefined))
    expect((await first).success).toBe(true)
    expect((await second).success).toBe(true)
    expect(close).toHaveBeenCalledTimes(1)
  })
})
