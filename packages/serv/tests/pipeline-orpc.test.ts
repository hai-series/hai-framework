import type { ServProcedureHandler } from '../src/pipelines/serv-pipeline-types.js'
import type { ServContext } from '../src/serv-context.js'
import { audit } from '@h-ai/audit'
import { core, err, HaiCommonError, ok } from '@h-ai/core'
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
  it.each([
    undefined,
    200,
    399,
    600,
    1.5,
    Number.NaN,
    401,
    403,
    500,
  ])('审计使用归一化的失败状态 %s', async (httpStatus) => {
    const initialized = vi.spyOn(audit, 'isInitialized', 'get').mockReturnValue(true)
    const capture = vi.spyOn(audit, 'capture').mockResolvedValue(err(HaiCommonError.INTERNAL_ERROR))
    const log = vi.spyOn(logger, 'error').mockImplementation(() => {})
    try {
      const handler = mapHaiError<unknown, never>(async () => ({
        success: false,
        error: { code: 'test:failure', message: 'Private failure', httpStatus },
      }))
      const result = await callHandler(handler, undefined)
      expect(result.success).toBe(false)
      if (result.success)
        return
      const status = httpStatus === 401 || httpStatus === 403
        ? httpStatus
        : 500
      expect(result.error.httpStatus).toBe(status)
      expect(capture).toHaveBeenCalledWith(expect.objectContaining({
        outcome: status === 401 || status === 403
          ? 'denied'
          : 'failure',
        details: expect.objectContaining({ status }),
      }), expect.anything())
    }
    finally {
      initialized.mockRestore()
      capture.mockRestore()
      log.mockRestore()
    }
  })

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
