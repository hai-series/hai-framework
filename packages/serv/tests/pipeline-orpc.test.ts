import type { ServProcedureHandler } from '../src/pipelines/serv-pipeline-types.js'
import type { ServContext } from '../src/serv-context.js'
import { audit } from '@h-ai/audit'
import { core, ok } from '@h-ai/core'
import { describe, expect, it, vi } from 'vitest'
import { mapHaiError } from '../src/pipelines/serv-pipeline-helper.js'

const logger = core.logger.child({ module: 'serv-test' })

function makeContext(): ServContext {
  return {
    requestId: 'req-1',
    locale: 'zh-CN',
    request: new Request('https://test.local'),
    logger,
  }
}

function callHandler<TInput, TOutput>(
  handler: ServProcedureHandler<TInput, TOutput>,
  input: TInput,
) {
  const options = {
    input,
    context: makeContext(),
    path: ['test'],
    procedure: undefined,
    signal: undefined,
    lastEventId: undefined,
    errors: {},
  } as Parameters<typeof handler>[0]

  return handler(options)
}

describe('pipeline.orpc', () => {
  it('未选用审计时业务正常执行且不调用未初始化的采集器', async () => {
    expect(audit.isInitialized).toBe(false)
    const capture = vi.spyOn(audit, 'capture')
    try {
      expect(await callHandler(mapHaiError(async () => ok('business')), undefined)).toEqual(ok('business'))
      expect(capture).not.toHaveBeenCalled()
    }
    finally { capture.mockRestore() }
  })
  it('mapHaiError converts thrown errors into HaiResult', async () => {
    const handler = mapHaiError<unknown, never>(async () => {
      throw new Error('boom')
    })

    const result = await callHandler(handler, undefined)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toContain('common')
      expect(result.error.message).toBe('内部错误 (traceId: req-1)')
    }
  })
})
