/** 存储生命周期故障回归：候选连接不可发布，释放失败必须保留并阻止替换。 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { storage } from '../src/index.js'

const root = mkdtempSync(join(tmpdir(), 'hai-lifecycle-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const faults = vi.hoisted(() => ({ connect: 0, close: 0, allocated: 0, closed: 0, healthStarted: false, wait: null as Promise<void> | null }))

vi.mock('../src/providers/storage-provider-local.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/providers/storage-provider-local.js')>()
  return {
    createLocalProvider() {
      faults.allocated++
      const provider = original.createLocalProvider()
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
        await close()
        faults.closed++
      }
      return provider
    },
  }
})

afterEach(async () => {
  faults.close = 0
  await storage.close()
  Object.assign(faults, { connect: 0, close: 0, allocated: 0, closed: 0, healthStarted: false, wait: null })
})

describe.sequential('storage lifecycle ownership', () => {
  it('failed health closes the candidate and allows a clean retry', async () => {
    faults.connect = 1
    expect((await storage.init({ type: 'local', root })).success).toBe(false)
    expect(storage.isInitialized).toBe(false)
    expect(storage.config).toBeNull()
    expect(faults.closed).toBe(1)
    expect((await storage.init({ type: 'local', root })).success).toBe(true)
  })

  it('failed close retains the resource, rejects replacement, and can be retried', async () => {
    expect((await storage.init({ type: 'local', root })).success).toBe(true)
    faults.close = 2
    const result = await storage.close()
    expect(result?.success).toBe(false)
    expect(storage.isInitialized).toBe(false)
    expect((await storage.file.get('closed')).success).toBe(false)
    expect((await storage.init({ type: 'local', root })).success).toBe(false)
    expect(faults.allocated).toBe(1)
    expect((await storage.close())?.success).toBe(true)
    expect((await storage.init({ type: 'local', root })).success).toBe(true)
  })

  it('concurrent close calls release one resource once', async () => {
    expect((await storage.init({ type: 'local', root })).success).toBe(true)
    const results = await Promise.all([storage.close(), storage.close(), storage.close()])
    expect(results.every(result => result?.success)).toBe(true)
    expect(faults.closed).toBe(1)
    expect((await storage.close())?.success).toBe(true)
  })
  it('close waits for an initializing candidate and prevents a second init', async () => {
    let release!: () => void
    faults.wait = new Promise<void>((resolve) => {
      release = resolve
    })
    try {
      const initializing = storage.init({ type: 'local', root })
      await vi.waitFor(() => expect(faults.healthStarted).toBe(true))
      const closing = storage.close()
      expect((await storage.init({ type: 'local', root })).success).toBe(false)
      release()
      expect((await initializing).success).toBe(true)
      expect((await closing).success).toBe(true)
      expect(storage.isInitialized).toBe(false)
      expect(faults.closed).toBe(1)
    }
    finally { release() }
  })
})
