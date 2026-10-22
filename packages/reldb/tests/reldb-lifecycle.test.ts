/** 数据库生命周期故障回归：候选连接不可发布，释放失败必须保留并阻止替换。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reldb } from '../src/index.js'

const faults = vi.hoisted(() => ({ connect: 0, close: 0, allocated: 0, closed: 0, healthStarted: false, wait: null as Promise<void> | null }))

vi.mock('../src/providers/reldb-provider-sqlite.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/providers/reldb-provider-sqlite.js')>()
  return {
    createSqliteProvider() {
      faults.allocated++
      const provider = original.createSqliteProvider()
      const connect = provider.connect.bind(provider)
      const close = provider.close.bind(provider)
      provider.connect = async (config) => {
        const result = await connect(config)
        faults.healthStarted = true
        if (faults.wait)
          await faults.wait
        if (faults.connect-- > 0)
          throw new Error('injected health failure after allocation')
        return result
      }
      provider.close = async () => {
        if (faults.close-- > 0)
          throw new Error('injected cleanup failure')
        const result = await close()
        if (result.success)
          faults.closed++
        return result
      }
      return provider
    },
  }
})

afterEach(async () => {
  faults.close = 0
  await reldb.close()
  Object.assign(faults, { connect: 0, close: 0, allocated: 0, closed: 0, healthStarted: false, wait: null })
})

describe.sequential('reldb lifecycle ownership', () => {
  it('failed health closes the candidate and allows a clean retry', async () => {
    faults.connect = 1
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(false)
    expect(reldb.isInitialized).toBe(false)
    expect(reldb.config).toBeNull()
    expect(faults.closed).toBe(1)
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  })

  it('failed close retains the resource, rejects replacement, and can be retried', async () => {
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
    faults.close = 2
    const result = await reldb.close()
    expect(result?.success).toBe(false)
    expect(reldb.isInitialized).toBe(false)
    expect((await reldb.sql.query('SELECT 1')).success).toBe(false)
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(false)
    expect(faults.allocated).toBe(1)
    expect((await reldb.close())?.success).toBe(true)
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  })

  it('concurrent close calls release one resource once', async () => {
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
    const results = await Promise.all([reldb.close(), reldb.close(), reldb.close()])
    expect(results.every(result => result?.success)).toBe(true)
    expect(faults.closed).toBe(1)
    expect((await reldb.close())?.success).toBe(true)
  })
  it('close waits for an initializing candidate and prevents a second init', async () => {
    let release!: () => void
    faults.wait = new Promise<void>((resolve) => {
      release = resolve
    })
    try {
      const initializing = reldb.init({ type: 'sqlite', database: ':memory:' })
      await vi.waitFor(() => expect(faults.healthStarted).toBe(true))
      const closing = reldb.close()
      expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(false)
      release()
      expect((await initializing).success).toBe(true)
      expect((await closing).success).toBe(true)
      expect(reldb.isInitialized).toBe(false)
      expect(faults.closed).toBe(1)
    }
    finally { release() }
  })
})
