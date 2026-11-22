import { core, err, HaiCommonError } from '@h-ai/core'
import { datapipe, HaiDatapipeError } from '@h-ai/datapipe'
import { describe, expect, it, vi } from 'vitest'
import { POST } from '../templates/features/datapipe/routes/api/datapipe/pipeline/+server.js'

const requestId = 'datapipe-template-request'

function post(body: string): Promise<Response> {
  const request = new Request('https://example.test/api/datapipe/pipeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
  // 直接调用生成工程的处理器，只提供该路由读取的请求字段。
  const event = {
    request,
    locals: { requestId, locale: 'en-US' },
  } as Parameters<typeof POST>[0]
  return core.i18n.runWithLocale('en-US', () => POST(event))
}

describe('datapipe 生成路由', () => {
  it.each([
    ['无效 JSON', '{'],
    ['缺少正文', '{}'],
    ['非字符串正文', '{"content":123}'],
    ['空白正文', '{"content":"  "}'],
  ])('拒绝%s并返回本地化校验错误及请求编号', async (_name, body) => {
    const response = await post(body)

    expect(response.status).toBe(400)
    expect(response.headers.get('X-Trace-Id')).toBe(requestId)
    expect(await response.json()).toMatchObject({
      success: false,
      requestId,
      error: {
        code: HaiCommonError.INVALID_REQUEST.code,
        message: expect.stringContaining('content is required'),
        traceId: requestId,
      },
    })
  })

  it('清洗并分块合法正文，允许额外字段', async () => {
    const response = await post(JSON.stringify({ content: '  <p>Hello</p>  ', title: 'Example' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      requestId,
      data: {
        cleaned: 'Hello',
        chunkCount: 1,
        chunks: [
          { index: 0, content: 'Hello' },
        ],
      },
    })
  })

  const internalDetails = 'Internal worker diagnostics'
  const chunkLimitMessage = 'Document exceeds the chunk limit'
  it.each([
    {
      title: '分块超限',
      definition: HaiDatapipeError.CHUNK_LIMIT_EXCEEDED,
      message: chunkLimitMessage,
      status: 413,
      publicMessage: chunkLimitMessage,
    },
    {
      title: '管线失败',
      definition: HaiDatapipeError.PIPELINE_FAILED,
      message: internalDetails,
      status: 500,
      publicMessage: core.i18n.coreM('core_errorInternal', { locale: 'en-US' }),
    },
  ])('$title 保留模块错误码和请求编号，并隐藏内部错误详情', async ({ definition, message, status, publicMessage }) => {
    const builder = datapipe.pipeline()
    vi.spyOn(builder, 'run').mockResolvedValue(err(definition, message, new Error(internalDetails)))
    const pipeline = vi.spyOn(datapipe, 'pipeline').mockReturnValue(builder)

    try {
      const response = await post('{"content":"Hello"}')
      const body = await response.json()

      expect(response.status).toBe(status)
      expect(response.headers.get('X-Trace-Id')).toBe(requestId)
      expect(body).toMatchObject({
        success: false,
        requestId,
        error: {
          code: definition.code,
          httpStatus: status,
          message: expect.stringContaining(publicMessage),
          traceId: requestId,
        },
      })
      expect(JSON.stringify(body)).not.toContain(internalDetails)
    }
    finally {
      pipeline.mockRestore()
    }
  })
})
