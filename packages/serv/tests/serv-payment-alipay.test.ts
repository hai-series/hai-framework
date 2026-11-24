import type { ServContext } from '../src/serv-context.js'
import { apiContract } from '@h-ai/api-contract'
import { core, HaiCommonError } from '@h-ai/core'
import { describe, expect, it, vi } from 'vitest'
import { serv } from '../src/serv-main.js'

const contract = apiContract.create({ alipay: apiContract.payment.notifications.alipay })
const apiPrefix = '/api/v1'
const path = apiContract.pathOf(contract.alipay)
const callbackPath = apiPrefix + path

// 使用渠道发送的表单媒体类型和原始编码，避免构造后再序列化掩盖正文变化。
const body = 'notify_id=alipay%2D1&out_trade_no=order+1&sign=example%2Bsignature'
function notificationRequest() {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  }
}

describe('支付宝通知 HTTP 契约', () => {
  it('oRPC 成功响应符合支付宝纯文本确认协议，失败响应保留 HTTP 状态', async () => {
    const procedures = serv.implement(contract).context<ServContext>().route('alipay', ({ context }) => {
      switch (context.request.headers.get('x-test-outcome')) {
        case 'invalid':
          return core.err(HaiCommonError.VALIDATION_ERROR)
        case 'uncommitted':
          return core.err(HaiCommonError.INTERNAL_ERROR)
        default:
          return core.ok('success' as const)
      }
    }).build()
    const app = serv.createApp({
      contract,
      procedures,
      http: { apiPrefix },
    })

    const accepted = await app.request(callbackPath, notificationRequest())
    expect(accepted.status).toBe(200)
    expect(accepted.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(await accepted.text()).toBe('success')

    const invalid = await app.request(callbackPath, {
      ...notificationRequest(),
      headers: {
        ...notificationRequest().headers,
        'x-test-outcome': 'invalid',
      },
    })
    expect(invalid.status).toBe(400)
    expect(await invalid.text()).not.toBe('success')

    const uncommitted = await app.request(callbackPath, {
      ...notificationRequest(),
      headers: {
        ...notificationRequest().headers,
        'x-test-outcome': 'uncommitted',
      },
    })
    expect(uncommitted.status).toBe(500)
    expect(await uncommitted.text()).not.toBe('success')

    const spec = await serv.generateSpec(contract)
    expect(spec.paths?.[path]?.post).toMatchObject({
      security: [],
      requestBody: {
        content: {
          'application/x-www-form-urlencoded': expect.any(Object),
        },
      },
      responses: {
        200: {
          content: {
            'text/plain': {
              schema: { const: 'success' },
            },
          },
        },
      },
    })
  })

  it('应用的原始通知挂载保留表单正文，只有处理完成才确认', async () => {
    const fallthrough = vi.fn(() => core.err(HaiCommonError.SERVICE_UNAVAILABLE))
    const verify = vi.fn(async (_body: string) => core.ok(undefined))
    const commit = vi.fn(async () => core.ok(undefined))
    const procedures = serv.implement(contract).context<ServContext>().route('alipay', fallthrough).build()
    const app = serv.createApp({
      contract,
      procedures,
      http: { apiPrefix },
      middlewares: [
        {
          path: callbackPath,
          middleware: async (c, next) => {
            if (c.req.method !== 'POST')
              return next()
            const verified = await verify(await c.req.raw.text())
            if (!verified.success)
              return c.text('failure', 400)
            const committed = await commit()
            return committed.success
              ? c.text('success')
              : c.text('failure', 500)
          },
        },
      ],
    })

    verify.mockResolvedValueOnce(core.err(HaiCommonError.VALIDATION_ERROR))
    const invalid = await app.request(callbackPath, notificationRequest())
    expect(invalid.status).toBe(400)
    expect(await invalid.text()).toBe('failure')
    expect(commit).not.toHaveBeenCalled()

    commit.mockResolvedValueOnce(core.err(HaiCommonError.INTERNAL_ERROR))
    const uncommitted = await app.request(callbackPath, notificationRequest())
    expect(uncommitted.status).toBe(500)
    expect(await uncommitted.text()).toBe('failure')

    const retry = await app.request(callbackPath, notificationRequest())
    expect(retry.status).toBe(200)
    expect(retry.headers.get('content-type')).toBe('text/plain; charset=UTF-8')
    expect(await retry.text()).toBe('success')
    expect(verify.mock.calls).toEqual([
      [body],
      [body],
      [body],
    ])
    expect(commit).toHaveBeenCalledTimes(2)
    expect(fallthrough).not.toHaveBeenCalled()
  })
})
