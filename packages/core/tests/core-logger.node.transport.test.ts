import { afterEach, describe, expect, it, vi } from 'vitest'

interface MockPinoLogger {
  trace: ReturnType<typeof vi.fn>
  debug: ReturnType<typeof vi.fn>
  info: ReturnType<typeof vi.fn>
  warn: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
  fatal: ReturnType<typeof vi.fn>
  child: ReturnType<typeof vi.fn>
}

function createMockPinoLogger(): MockPinoLogger {
  const logger = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  } satisfies MockPinoLogger

  // 这里返回同一个 mock 即可，测试关注点是 transport 回退，不需要区分子 logger 行为。
  logger.child.mockImplementation(() => logger)
  return logger
}

describe('core.logger transport fallback (node)', () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('pino')
    vi.doUnmock('node:module')
  })

  it('pino-pretty 不可解析时应自动回退到标准输出', async () => {
    const mockLogger = createMockPinoLogger()
    const pinoMock = vi.fn(() => mockLogger)

    vi.doMock('pino', () => ({
      default: pinoMock,
    }))
    vi.doMock('node:module', () => ({
      createRequire: () => ({
        resolve: (specifier: string) => {
          if (specifier === 'pino-pretty') {
            throw new Error('module not found')
          }
          return specifier
        },
      }),
    }))

    const { logger } = await import('../src/functions/core-function-logger.node.js')
    // 关键断言：可选依赖缺失时 createLogger 仍应成功，并且不会把 pretty transport 传给 pino。
    expect(() => logger.createLogger({ name: 'transport-fallback-test', format: 'pretty' })).not.toThrow()
    expect(pinoMock).toHaveBeenCalledTimes(1)

    const firstCall = pinoMock.mock.calls[0]
    expect(firstCall).toBeDefined()
    expect(firstCall?.[0]).not.toHaveProperty('transport')
  })
})
