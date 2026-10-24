import type { LogRecord } from '../src/index.js'
import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'
import { core } from '../src/index.js'

describe('structured log observations', () => {
  it('suppresses observations in internal collection paths while keeping normal output', () => {
    const output: string[] = []
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(((value: string | Uint8Array) => {
      output.push(typeof value === 'string' ? value : new TextDecoder().decode(value))
      return true
    }) as typeof process.stdout.write)
    const records: LogRecord[] = []
    const stop = core.logger.observe(record => records.push(record))
    try {
      const logger = core.logger.create({ name: 'internal-observer-test', format: 'json' })
      core.context.run({ suppressLogObservers: true }, () => logger.error('Internal persistence failure'))
      expect(records).toHaveLength(0)
      expect(output.join('')).toContain('Internal persistence failure')
      logger.error('Business failure')
      expect(records).toHaveLength(1)
    }
    finally {
      stop()
      write.mockRestore()
    }
  })

  it('observes existing child loggers after filtering and redaction, and cancels without recursion', () => {
    const logger = core.logger.create({ name: 'observer-test', level: 'warn', format: 'json' }).child({ module: 'orders' })
    const records: LogRecord[] = []
    core.logger.configure({ redact: ['customer.email'] })
    const stopBad = core.logger.observe(() => {
      throw new Error('observer failed')
    })
    const stop = core.logger.observe((record) => {
      records.push(record)
      logger.warn('Observer internal log')
    })
    try {
      logger.info('Ignored')
      logger.error('Failed', { password: 'secret', customer: { email: 'private@example.com' } })
      expect(records).toHaveLength(1)
      expect(records[0]).toMatchObject({ level: 'error', message: 'Failed', context: { module: 'orders', password: '[REDACTED]', customer: { email: '[REDACTED]' } } })
      stop()
      logger.warn('After cancellation')
      expect(records).toHaveLength(1)
    }
    finally {
      stop()
      stopBad()
      core.logger.configure({ redact: [] })
    }
  })

  it('isolates trusted identities across interleaved asynchronous requests and inherited children', async () => {
    const records: LogRecord[] = []
    const logger = core.logger.child({ module: 'existing-module' })
    const gate = Promise.withResolvers<void>()
    const stop = core.logger.observe(record => records.push(record))
    try {
      await Promise.all([
        core.context.run({ requestId: 'a', scopeId: 'tenant-a', userId: 'user-a' }, async () => {
          await gate.promise
          logger.warn('A', { scopeId: 'spoofed' })
          await core.context.run({ jobId: 'child-job' }, async () => {
            await Promise.resolve()
            logger.warn('Child')
          })
        }),
        core.context.run({ requestId: 'b', scopeId: 'tenant-b', userId: 'user-b' }, async () => {
          await Promise.resolve()
          logger.warn('B')
          gate.resolve()
        }),
      ])
      expect(records.find(record => record.message === 'A')?.context).toMatchObject({ requestId: 'a', scopeId: 'tenant-a', userId: 'user-a' })
      expect(records.find(record => record.message === 'B')?.context).toMatchObject({ requestId: 'b', scopeId: 'tenant-b', userId: 'user-b' })
      expect(records.find(record => record.message === 'Child')?.context).toMatchObject({ requestId: 'a', jobId: 'child-job' })
      expect(core.context.get()).toEqual({})
    }
    finally { stop() }
  })
})
