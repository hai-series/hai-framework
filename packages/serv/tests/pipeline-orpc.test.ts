import type { ServProcedureHandler } from '../src/pipelines/serv-pipeline-types.js'
import type { ServContext } from '../src/serv-context.js'
import { core } from '@h-ai/core'
import { describe, expect, it } from 'vitest'
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
  it('mapHaiError converts thrown errors into HaiResult', async () => {
    const handler = mapHaiError<unknown, never>(async () => {
      throw new Error('boom')
    })

    const result = await callHandler(handler, undefined)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toContain('common')
      expect(result.error.message).toBe('服务器内部错误')
    }
  })
})
