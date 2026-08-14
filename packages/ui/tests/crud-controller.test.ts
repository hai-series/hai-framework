/**
 * =============================================================================
 * @h-ai/ui - CRUD 控制器测试
 * =============================================================================
 *
 * 覆盖：加载中、空结果、失败与错误暴露、重试、旧请求晚返回（latest-wins + abort）、
 * 惰性加载（autoLoad=false）、并发去重、失败保留旧数据、mapPaginated 适配器。
 */

import type { PaginatedResult } from '@h-ai/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { createCrudController, defineCrud, mapPaginated } from '../src/lib/components/scenes/crud/crud-controller.svelte.js'

// defineCrud 约束 T extends Record<string, unknown>；interface 无隐式索引签名不满足约束，故用 type。
// eslint-disable-next-line ts/consistent-type-definitions
type Row = { id: string, name: string }

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function page(items: Row[], total: number, pageNum = 1, size = 10): PaginatedResult<Row> {
  return { items, total, page: pageNum, pageSize: size }
}

interface ListCall {
  params: Record<string, unknown>
  signal?: AbortSignal
  deferred: Deferred<PaginatedResult<Row>>
}

describe('createCrudController', () => {
  let calls: ListCall[]

  beforeEach(() => {
    calls = []
  })

  /** 构造一个由测试手动结算的 CRUD 定义。 */
  function makeCrud() {
    return defineCrud<Row>({
      name: 'row',
      label: 'Row',
      defaultPageSize: 10,
      fields: [{ id: 'name', label: 'Name', type: 'text', filterable: true }],
      api: {
        list: (params, options) => {
          const d = deferred<PaginatedResult<Row>>()
          calls.push({ params, signal: options?.signal, deferred: d })
          return d.promise
        },
      },
    })
  }

  it('首次加载展示查询中，成功后写回数据', async () => {
    const controller = createCrudController(makeCrud(), { autoLoad: false })
    expect(controller.loading).toBe(false)
    expect(controller.loaded).toBe(false)

    const p = controller.load()
    // 请求在途：查询中，尚未加载完成。
    expect(controller.loading).toBe(true)
    expect(controller.loaded).toBe(false)

    calls[0].deferred.resolve(page([{ id: '1', name: 'A' }], 1))
    await p

    expect(controller.loading).toBe(false)
    expect(controller.loaded).toBe(true)
    expect(controller.error).toBeUndefined()
    expect(controller.data.items).toEqual([{ id: '1', name: 'A' }])
    expect(controller.data.total).toBe(1)
  })

  it('空结果：loaded 为真且 total 为 0', async () => {
    const controller = createCrudController(makeCrud(), { autoLoad: false })
    const p = controller.load()
    calls[0].deferred.resolve(page([], 0))
    await p

    expect(controller.loaded).toBe(true)
    expect(controller.data.total).toBe(0)
    expect(controller.data.items).toEqual([])
    expect(controller.error).toBeUndefined()
  })

  it('首次失败：暴露错误且不标记为已加载', async () => {
    const controller = createCrudController(makeCrud(), { autoLoad: false })
    const p = controller.load()
    calls[0].deferred.reject(new Error('nope'))
    await p

    expect(controller.error).toBeInstanceOf(Error)
    expect(controller.error?.message).toBe('nope')
    // 首次失败不能被当成一次成功的空结果。
    expect(controller.loaded).toBe(false)
    expect(controller.data.items).toEqual([])
    expect(controller.loading).toBe(false)
  })

  it('重试：失败后 reload 应恢复数据并清除错误', async () => {
    const controller = createCrudController(makeCrud(), { autoLoad: false })
    let p = controller.load()
    calls[0].deferred.reject(new Error('nope'))
    await p
    expect(controller.error).toBeDefined()

    p = controller.reload()
    calls[1].deferred.resolve(page([{ id: '1', name: 'A' }], 1))
    await p

    expect(controller.error).toBeUndefined()
    expect(controller.loaded).toBe(true)
    expect(controller.data.items).toEqual([{ id: '1', name: 'A' }])
  })

  it('失败保留旧数据：已有数据时刷新失败不清空列表', async () => {
    const controller = createCrudController(makeCrud(), { autoLoad: false })
    let p = controller.load()
    calls[0].deferred.resolve(page([{ id: '1', name: 'A' }], 1))
    await p

    p = controller.reload()
    calls[1].deferred.reject(new Error('boom'))
    await p

    expect(controller.error?.message).toBe('boom')
    // 旧数据保留，不用空列表覆盖。
    expect(controller.data.items).toEqual([{ id: '1', name: 'A' }])
    expect(controller.loaded).toBe(true)
  })

  it('旧请求晚返回被丢弃（latest-wins 且旧请求被 abort）', async () => {
    const controller = createCrudController(makeCrud(), { autoLoad: false })

    controller.nav.navigate('?search=a')
    const p1 = controller.nav.refresh!()
    controller.nav.navigate('?search=b')
    const p2 = controller.nav.refresh!()

    // 新请求发起时应取消上一轮。
    expect(calls[0].signal?.aborted).toBe(true)

    // 先结算最新一轮（b）。
    calls[1].deferred.resolve(page([{ id: '2', name: 'B' }], 1))
    await p2
    expect(controller.data.items).toEqual([{ id: '2', name: 'B' }])
    expect(controller.data.filters.search).toBe('b')

    // 旧请求（a）晚到，必须被忽略。
    calls[0].deferred.resolve(page([{ id: '1', name: 'A' }], 1))
    await p1
    expect(controller.data.items).toEqual([{ id: '2', name: 'B' }])
    expect(controller.data.filters.search).toBe('b')
  })

  it('惰性加载：autoLoad=false 时不预取，直到 load()', async () => {
    const controller = createCrudController(makeCrud(), { autoLoad: false })
    expect(calls.length).toBe(0)
    expect(controller.loaded).toBe(false)
    expect(controller.loading).toBe(false)

    const p = controller.load()
    // 首次激活才发起请求。
    expect(calls.length).toBe(1)
    calls[0].deferred.resolve(page([{ id: '1', name: 'A' }], 1))
    await p
    expect(controller.loaded).toBe(true)
  })

  it('并发相同参数去重：只发起一次请求', async () => {
    const controller = createCrudController(makeCrud(), { autoLoad: false })
    const p1 = controller.load()
    const p2 = controller.load()
    expect(calls.length).toBe(1)

    calls[0].deferred.resolve(page([{ id: '1', name: 'A' }], 1))
    await Promise.all([p1, p2])
    expect(controller.data.items).toEqual([{ id: '1', name: 'A' }])
  })

  it('autoLoad 默认立即加载', async () => {
    const controller = createCrudController(makeCrud())
    expect(controller.loading).toBe(true)
    expect(calls.length).toBe(1)
    calls[0].deferred.resolve(page([{ id: '1', name: 'A' }], 1))
    await controller.load()
    expect(controller.loaded).toBe(true)
    expect(controller.data.items).toEqual([{ id: '1', name: 'A' }])
  })
})

describe('mapPaginated', () => {
  it('映射条目并保留分页元数据', () => {
    const result = mapPaginated(
      { items: [{ id: '1', name: 'A' }], total: 5, page: 2, pageSize: 20 },
      row => ({ label: row.name }),
    )
    expect(result).toEqual({ items: [{ label: 'A' }], total: 5, page: 2, pageSize: 20 })
  })
})
