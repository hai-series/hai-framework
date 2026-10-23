import { afterEach, describe, expect, it } from 'vitest'
import { scheduler } from '../src/index.js'
import './helpers/sqlite-lifecycle.js'

describe('scheduler JS hard timeout', () => {
  afterEach(async () => {
    await scheduler.close()
  })

  it.each([
    '() => { while (true) {} }',
    '(() => { while (true) {} })()',
    '() => new Promise(() => {})',
  ])('terminates stalled code without blocking the host: %s', async (code) => {
    expect((await scheduler.init({ enableDb: true })).success).toBe(true)
    expect((await scheduler.register({
      id: 'stalled',
      name: 'stalled',
      cron: '* * * * *',
      handler: { kind: 'js', code, timeout: 200 },
      idempotent: true,
      retry: { maxAttempts: 2 },
    })).success).toBe(true)
    let heartbeat = false
    const timer = setTimeout(() => {
      heartbeat = true
    }, 20)
    const result = await scheduler.trigger('stalled')
    clearTimeout(timer)
    expect(heartbeat).toBe(true)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('failed')
      expect(result.data.error).toContain('200')
    }
    expect((await scheduler.register({
      id: 'healthy',
      name: 'healthy',
      cron: '* * * * *',
      handler: { kind: 'js', code: 'context => context.taskId' },
    })).success).toBe(true)
    const healthy = await scheduler.trigger('healthy')
    expect(healthy.success).toBe(true)
    if (healthy.success) {
      expect(healthy.data.status).toBe('success')
      expect(healthy.data.result).toBe('"healthy"')
    }
  })
})
