import type { FeedbackHttpOperations } from '@h-ai/api-contract/feedback'
import type { RequestEvent } from '@sveltejs/kit'
import { randomUUID } from 'node:crypto'
import { FeedbackLimitsSchema } from '@h-ai/api-contract/feedback'
import { core, HaiCommonError } from '@h-ai/core'
import { describe, expect, it, vi } from 'vitest'
import { kit } from '../src/index.js'

const actor = {
  scopeId: 'orders',
  userId: 'user-1',
  permissions: ['feedback:create'],
}
const id = randomUUID()
const messageId = randomUUID()

function setup(basePath = '/api/feedback', authenticated = true) {
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
  const listMine = vi.fn<FeedbackHttpOperations['listMine']>(async input => core.ok({
    items: [],
    total: 0,
    page: input.page ?? 1,
    pageSize: 20,
  }))
  const feedback: FeedbackHttpOperations = {
    isInitialized: true,
    getLimits: async () => core.ok(FeedbackLimitsSchema.parse({
      limits: { maxFiles: 2 },
    })),
    submit: unused,
    list: unused,
    listMine,
    get: unused,
    listMessages: unused,
    addMessage,
    setStatus: unused,
    getAttachment: unused,
  }
  const handler = kit.createFeedbackHandler({
    feedback,
    basePath,
    resolveContext: () => authenticated ? actor : null,
  })
  function request(path: string, body?: unknown) {
    const url = new URL(`https://app.test${path}`)
    return handler({
      request: new Request(url, body === undefined
        ? undefined
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }),
      url,
      locals: {},
    } as RequestEvent)
  }
  return { request, addMessage, listMine }
}

describe('kit 反馈路由', () => {
  it('仅向已登录用户返回生效的发送和采集限额', async () => {
    const { request } = setup()
    const response = await request('/api/feedback/limits')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        limits: { maxFiles: 2 },
        capture: { windowSeconds: 300 },
      },
    })
    expect((await setup(undefined, false).request('/api/feedback/limits')).status).toBe(401)
  })

  it('读取本人列表，不能从查询参数传入其他用户', async () => {
    const { request, listMine } = setup()
    expect((await request('/api/feedback/my-reports?page=2')).status).toBe(200)
    expect(listMine).toHaveBeenCalledExactlyOnceWith({ page: 2 }, actor)
    expect((await request('/api/feedback/my-reports?userId=other')).status).toBe(400)
  })

  it('将消息附件和路由 ID 交给服务，响应不缓存', async () => {
    const { request, addMessage } = setup('/edge//api/feedback/')
    const path = `/edge//api/feedback/reports/${id}/messages`
    const input = {
      messageId,
      body: '',
      kind: 'reply',
      attachments: [
        { name: 'steps.txt', contentType: 'text/plain', dataBase64: 'YQ==' },
      ],
    }
    const response = await request(path, input)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(addMessage).toHaveBeenCalledExactlyOnceWith({ id, ...input }, actor)
    expect((await request(path, {
      ...input,
      id: randomUUID(),
    })).status).toBe(400)
    expect((await request(`/edge//api/feedback/reports/${id}/evidence`, input)).status).toBe(404)
  })

  it('匿名请求在进入消息写入前被拒绝', async () => {
    const { request, addMessage } = setup(undefined, false)
    expect((await request(`/api/feedback/reports/${id}/messages`, { messageId, body: 'Unauthorized', kind: 'reply' })).status).toBe(401)
    expect(addMessage).not.toHaveBeenCalled()
  })
})
