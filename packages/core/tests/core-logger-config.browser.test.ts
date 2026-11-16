import log from 'loglevel'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { core } from '../src/core-index.browser.js'

afterEach(() => {
  core.logger.configure({ level: 'info', format: 'pretty', redact: [] })
  vi.restoreAllMocks()
  log.setLevel('info')
})

describe('已有 Browser logger 应用 core 配置', () => {
  it('fatal 阈值只输出 fatal，显式 error 级别仍输出两种记录', () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {})
    const observer = vi.fn()
    const stop = core.logger.observe(observer)
    try {
      const explicit = core.logger.create({ name: 'error-threshold', level: 'error' })
      core.logger.configure({ level: 'fatal', format: 'json' })
      core.logger.error('Hidden error')
      core.logger.fatal('Fatal event')
      explicit.error('Explicit error')
      explicit.fatal('Explicit fatal event')

      expect(output.mock.calls.map(([entry]) => JSON.parse(String(entry)).level)).toEqual(['fatal', 'error', 'fatal'])
      expect(observer.mock.calls.map(([entry]) => entry.level)).toEqual(['fatal', 'error', 'fatal'])
    }
    finally { stop() }
  })

  it('浏览器日志可以输出 bigint 和循环对象，仍正常脱敏并通知观察者', () => {
    const output = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const observer = vi.fn()
    const stop = core.logger.observe(observer)
    try {
      const item: { token: string, total: bigint, self?: object } = { token: 'demo-value', total: 9_007_199_254_740_993n }
      item.self = item
      for (const format of ['json', 'pretty'] as const) {
        core.logger.configure({ level: 'warn', format })
        core.logger.warn('Summary ready', { current: item, previous: item })
      }

      expect(output).toHaveBeenCalledTimes(2)
      const entry = { token: '[REDACTED]', total: '9007199254740993', self: '[Circular]' }
      expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({ msg: 'Summary ready', current: entry, previous: entry })
      expect(String(output.mock.calls[1]?.[0])).toContain(`"current":${JSON.stringify(entry)}`)
      expect(observer).toHaveBeenCalledTimes(2)
      expect(item.token).toBe('demo-value')
      expect(item.self).toBe(item)
    }
    finally { stop() }
  })

  it('初始化前创建的 logger 实际应用级别、JSON、上下文和自定义脱敏路径', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    core.logger.configure({ level: 'info', format: 'pretty' })
    const original = core.logger
    const child = original.child({ module: 'browser-fixture' }).child({ scope: 'nested' })
    const named = original.create({ name: 'browser-before-init' })
    const explicit = original.create({
      name: 'browser-explicit',
      level: 'debug',
      format: 'pretty',
      context: { source: 'local' },
    })
    core.init({
      logging: {
        level: 'warn',
        format: 'json',
        context: { source: 'global' },
        redact: ['metadata.code', 'members[*].ref'],
      },
    })
    info.mockClear()
    warn.mockClear()
    original.info('default-hidden')
    child.info('child-hidden')
    named.info('named-hidden')
    const payload = {
      metadata: { code: 'private-code' },
      members: [
        { ref: 'private-reference' },
      ],
    }
    child.warn('child-visible', payload)
    named.warn('named-visible')
    explicit.info('explicit-visible')

    expect(info).toHaveBeenCalledTimes(1)
    expect(String(info.mock.calls[0]?.[0])).toContain('explicit-visible')
    expect(String(info.mock.calls[0]?.[0])).toContain('"source":"local"')
    expect(warn).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({
      level: 'warn',
      msg: 'child-visible',
      source: 'global',
      module: 'browser-fixture',
      scope: 'nested',
      metadata: { code: '[REDACTED]' },
      members: [
        { ref: '[REDACTED]' },
      ],
    })
    expect(JSON.parse(String(warn.mock.calls[1]?.[0]))).toMatchObject({ msg: 'named-visible', source: 'global' })
    expect(payload.metadata.code).toBe('private-code')
    expect(payload.members[0]?.ref).toBe('private-reference')

    core.logger.setLevel('error')
    named.warn('hidden-after-level-change')
    expect(warn).toHaveBeenCalledTimes(2)
  })
})
