import type { FeedbackContext, FeedbackHttpOperations } from '@h-ai/api-contract/feedback'
import { randomUUID } from 'node:crypto'
import { apiContract } from '@h-ai/api-contract'
import { FeedbackLimitsSchema } from '@h-ai/api-contract/feedback'
import { core, HaiCommonError } from '@h-ai/core'
import { describe, expect, it, vi } from 'vitest'
import { serv } from '../src/serv-main.js'

const id = randomUUID()
const messageId = randomUUID()
const actor: FeedbackContext = {
  userId: 'user-1',
  scopeId: 'orders',
  permissions: ['feedback:create'],
}

function setup(resolved: FeedbackContext = actor) {
  const unused = async () => core.err(HaiCommonError.NOT_FOUND, 'Missing')
  const addMessage = vi.fn<FeedbackHttpOperations['addMessage']>(async input => core.ok({
    id: input.messageId,
    reportId: input.id,
    authorId: actor.userId,
    authorRole: 'author',
    kind: input.kind,
    body: input.body,
    createdAt: 1,
    attachments: [],
  }))
  const feedback: FeedbackHttpOperations = {
    isInitialized: true,
    getLimits: async () => core.ok(FeedbackLimitsSchema.parse({
      capture: { maxRecordingSeconds: 12 },
    })),
    submit: unused,
    list: unused,
    listMine: unused,
    get: unused,
    listMessages: unused,
    addMessage,
    setStatus: unused,
    getAttachment: unused,
  }
  const app = serv.createApp({
    contract: apiContract.feedback,
    procedures: serv.createFeedbackProcedures({
      feedback,
      resolveContext: () => resolved,
    }),
    verifyToken: async () => core.ok({ userId: actor.userId, roles: [], permissions: [] }),
  })
  function send(body: object, authorized = true) {
    return app.request(`/api/v1/feedback/reports/${id}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(authorized
          ? { authorization: 'Bearer test-token' }
          : {}),
      },
      body: JSON.stringify(body),
    })
  }
  return { send, addMessage, app }
}

describe('serv 反馈路由', () => {
  it('仅向已认证会话公开当前限额', async () => {
    const { app } = setup()
    const response = await app.request('/api/v1/feedback/limits', {
      headers: { authorization: 'Bearer test-token' },
    })
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        capture: { maxRecordingSeconds: 12 },
      },
    })
    const anonymous = await app.request('/api/v1/feedback/limits')
    expect(await anonymous.json()).toMatchObject({
      success: false,
      error: { code: HaiCommonError.UNAUTHORIZED.code },
    })
  })

  it('合并历史会话路由的 ID 和正文，通过统一契约传递附件', async () => {
    const { send, addMessage } = setup()
    const input = {
      messageId,
      body: '',
      kind: 'reply',
      attachments: [
        { name: 'steps.txt', contentType: 'text/plain', dataBase64: 'YQ==' },
      ],
    }
    const response = await send(input)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      success: true,
      data: { id: messageId, reportId: id },
    })
    expect(addMessage).toHaveBeenCalledExactlyOnceWith({ ...input, id }, actor)
  })

  it('拒绝匿名请求和可信回调与会话身份不一致的请求', async () => {
    const { send, addMessage } = setup({ ...actor, userId: 'other' })
    const input = { messageId, body: 'Reply', kind: 'reply' }
    const unauthorized = await send(input, false)
    expect(await unauthorized.json()).toMatchObject({
      success: false,
      error: { code: HaiCommonError.UNAUTHORIZED.code },
    })
    const forbidden = await send(input)
    expect(await forbidden.json()).toMatchObject({
      success: false,
      error: { code: HaiCommonError.FORBIDDEN.code },
    })
    expect(addMessage).not.toHaveBeenCalled()
  })
})
