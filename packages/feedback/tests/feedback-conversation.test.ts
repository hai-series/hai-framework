import type { FeedbackContext } from '../src/index.js'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { feedback, HaiFeedbackError } from '../src/index.js'

const author: FeedbackContext = {
  scopeId: 'team-a',
  userId: 'author-a',
  permissions: ['feedback:create'],
}
const staff: FeedbackContext = {
  scopeId: author.scopeId,
  userId: 'staff-a',
  permissions: ['feedback:read', 'feedback:process'],
}
const observer: FeedbackContext = {
  ...staff,
  permissions: ['feedback:read'],
}
const otherUser: FeedbackContext = { ...author, userId: 'author-b' }
const otherScope: FeedbackContext = { ...staff, scopeId: 'team-b' }

const screenshot = {
  name: 'screen.png',
  contentType: 'image/png',
  dataBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1UAAAAASUVORK5CYII=',
}
const instructions = { name: 'steps.txt', contentType: 'text/plain', dataBase64: 'U3RlcHM=' }

beforeEach(async () => {
  expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  expect((await feedback.init({ appId: 'orders' })).success).toBe(true)
})

afterEach(async () => {
  await feedback.close()
  await reldb.close()
})

describe('反馈会话', () => {
  it('仅在勾选时保存同用户、同范围及窗口内的可信请求日志，附件按现场类型区分', async () => {
    function log(message: string, userId: string, scopeId: string, requestId = 'previous-request') {
      core.context.run({ userId, scopeId, requestId }, () => core.logger.warn(message))
    }
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now - 6 * 60 * 1000)
    try {
      log('expired-log', author.userId, author.scopeId)
    }
    finally {
      clock.mockRestore()
    }
    log('eligible-log token=private-token', author.userId, author.scopeId)
    log('wrong-user', otherUser.userId, author.scopeId)
    log('wrong-scope', author.userId, otherScope.scopeId)
    core.logger.warn('forged-context', { ...author, requestId: 'unverified' })
    expect(await reldb.sql.get<{ count: number }>('SELECT COUNT(*) AS count FROM hai_feedback_attachments')).toMatchObject({
      success: true,
      data: { count: 0 },
    })

    const plain = randomUUID()
    expect((await feedback.submit({ id: plain, body: 'Without diagnostics' }, author)).success).toBe(true)
    expect(await feedback.get(plain, author)).toMatchObject({
      success: true,
      data: { attachments: [] },
    })

    const id = randomUUID()
    const browserLogs = {
      name: 'browser-logs.json',
      contentType: 'application/json',
      dataBase64: Buffer.from('[{"message":"Browser event"}]').toString('base64'),
    }
    expect((await feedback.submit({
      id,
      body: '',
      capture: { screenshot, browserLogs, includeServerLogs: true },
    }, author)).success).toBe(true)
    const detail = await feedback.get(id, staff)
    expect(detail.success).toBe(true)
    if (!detail.success)
      return
    expect(detail.data.attachments.map(file => file.kind).sort()).toEqual(['browser_logs', 'screenshot', 'server_logs'])
    const attachmentId = detail.data.attachments.find(file => file.kind === 'server_logs')!.id
    const logs = await feedback.getAttachment({ id, attachmentId }, author)
    expect(logs.success).toBe(true)
    if (!logs.success)
      return
    const text = Buffer.from(logs.data.dataBase64, 'base64').toString()
    expect(text).toContain('eligible-log')
    expect(text).not.toMatch(/private-token|wrong-user|wrong-scope|forged-context|expired-log/)
    expect(await feedback.getAttachment({ id, attachmentId }, otherUser)).toMatchObject({ success: false })
  })

  it('双方发送附件、请求补充、提交结果，用户可以继续回复', async () => {
    const id = randomUUID()
    const submitted = await feedback.submit({
      id,
      body: 'Cannot open order',
      attachments: [screenshot],
    }, author)
    expect(submitted).toMatchObject({
      success: true,
      data: { id, status: 'pending' },
    })
    const detail = await feedback.get(id, author)
    expect(detail.success).toBe(true)
    if (!detail.success)
      return
    expect(detail.data.attachments).toMatchObject([
      { name: screenshot.name, contentType: 'image/png' },
    ])
    const attachmentId = detail.data.attachments[0]!.id
    expect(await feedback.getAttachment({ id, attachmentId }, staff)).toMatchObject({
      success: true,
      data: { name: screenshot.name, dataBase64: screenshot.dataBase64 },
    })

    const messageId = randomUUID()
    const created = await feedback.addMessage({
      id,
      messageId,
      kind: 'request_info',
      body: 'Please send an error shot',
      attachments: [instructions],
    }, staff)
    expect(created).toMatchObject({
      success: true,
      data: {
        id: messageId,
        authorId: staff.userId,
        authorRole: 'staff',
        kind: 'request_info',
        attachments: [
          { name: instructions.name },
        ],
      },
    })
    expect(await feedback.listMine({ status: 'awaiting_user' }, author)).toMatchObject({
      success: true,
      data: {
        total: 1,
        items: [
          { id },
        ],
      },
    })
    const replyId = randomUUID()
    expect(await feedback.addMessage({
      id,
      messageId: replyId,
      kind: 'reply',
      body: '',
      attachments: [screenshot],
    }, author))
      .toMatchObject({
        success: true,
        data: {
          id: replyId,
          authorRole: 'author',
          attachments: [
            { name: screenshot.name },
          ],
        },
      })
    expect(await feedback.get(id, author)).toMatchObject({
      success: true,
      data: {
        report: { status: 'pending' },
      },
    })

    expect(await feedback.addMessage({
      id,
      messageId: randomUUID(),
      kind: 'reply',
      body: 'The issue is fixed',
      attachments: [instructions],
    }, staff)).toMatchObject({ success: true })
    expect(await feedback.setStatus({ id, status: 'handled' }, staff)).toMatchObject({
      success: true,
      data: { status: 'handled' },
    })
    expect(await feedback.addMessage({
      id,
      messageId: randomUUID(),
      kind: 'reply',
      body: 'Confirmed',
    }, author)).toMatchObject({ success: true })
    expect(await feedback.get(id, author)).toMatchObject({
      success: true,
      data: {
        report: { status: 'handled' },
      },
    })
    expect(await feedback.listMessages({ id, page: 2, pageSize: 2 }, author)).toMatchObject({
      success: true,
      data: {
        total: 4,
        items: [
          { id: replyId },
          { id: messageId },
        ],
        page: 2,
      },
    })
  })

  it('重试已有提交和消息不会重复写附件或回退会话状态', async () => {
    const id = randomUUID()
    const input = {
      id,
      body: 'Broken',
      attachments: [screenshot],
    }
    const pair = await Promise.all([
      feedback.submit(input, author),
      feedback.submit(input, author),
    ])
    expect(pair).toMatchObject([
      {
        success: true,
        data: { id },
      },
      {
        success: true,
        data: { id },
      },
    ])
    const message = {
      id,
      messageId: randomUUID(),
      kind: 'request_info' as const,
      body: 'Steps?',
      attachments: [instructions],
    }
    expect((await feedback.addMessage(message, staff)).success).toBe(true)
    expect((await feedback.addMessage({
      id,
      messageId: randomUUID(),
      kind: 'reply',
      body: 'Attached',
    }, author)).success).toBe(true)
    expect((await feedback.addMessage(message, staff)).success).toBe(true)
    expect(await feedback.get(id, author)).toMatchObject({
      success: true,
      data: {
        report: { status: 'pending' },
        attachments: [
          { name: screenshot.name },
        ],
      },
    })
    expect(await feedback.listMessages({ id }, staff)).toMatchObject({
      success: true,
      data: {
        total: 2,
        items: [
          { kind: 'reply' },
          {
            kind: 'request_info',
            attachments: [
              { name: instructions.name },
            ],
          },
        ],
      },
    })
  })

  it('用户只能读写本人反馈，处理动作和附件按反馈范围授权', async () => {
    const id = randomUUID()
    expect((await feedback.submit({
      id,
      body: '',
      attachments: [screenshot],
    }, author)).success).toBe(true)
    const detail = await feedback.get(id, staff)
    expect(detail.success).toBe(true)
    if (!detail.success)
      return
    const attachmentId = detail.data.attachments[0]!.id
    const reply = {
      id,
      messageId: randomUUID(),
      kind: 'reply' as const,
      body: 'Reply',
    }
    const forbidden = {
      success: false,
      error: { code: HaiFeedbackError.FORBIDDEN.code },
    }
    const notFound = {
      success: false,
      error: { code: HaiFeedbackError.NOT_FOUND.code },
    }
    expect(await feedback.get(id, otherUser)).toMatchObject(forbidden)
    expect(await feedback.getAttachment({ id, attachmentId }, otherUser)).toMatchObject(forbidden)
    expect(await feedback.getAttachment({ id, attachmentId }, otherScope)).toMatchObject(notFound)
    expect(await feedback.getAttachment({
      id,
      attachmentId: randomUUID(),
    }, author)).toMatchObject(notFound)
    expect(await feedback.addMessage(reply, otherUser)).toMatchObject(forbidden)
    expect(await feedback.addMessage(reply, observer)).toMatchObject(forbidden)
    expect(await feedback.addMessage({ ...reply, kind: 'request_info' }, author)).toMatchObject(forbidden)
    expect(await feedback.setStatus({ id, status: 'handled' }, author)).toMatchObject(forbidden)
    expect(await feedback.listMine({}, otherUser)).toMatchObject({
      success: true,
      data: { total: 0 },
    })
    expect(await feedback.list({}, otherUser)).toMatchObject(forbidden)
  })

  it('附件写入失败不会留下首帖、消息或状态变更', async () => {
    const id = randomUUID()
    expect((await reldb.ddl.raw('CREATE TRIGGER block_feedback_file BEFORE INSERT ON hai_feedback_attachments BEGIN SELECT RAISE(ABORT, \'test failure\'); END')).success).toBe(true)
    expect((await feedback.submit({
      id,
      body: 'Will roll back',
      attachments: [screenshot],
    }, author)).success).toBe(false)
    expect(await feedback.get(id, author)).toMatchObject({
      success: false,
      error: { code: HaiFeedbackError.NOT_FOUND.code },
    })
    expect((await feedback.submit({ id, body: 'Saved without file' }, author)).success).toBe(true)
    expect((await feedback.addMessage({
      id,
      messageId: randomUUID(),
      kind: 'request_info',
      body: 'Will roll back',
      attachments: [instructions],
    }, staff)).success).toBe(false)
    expect(await feedback.listMessages({ id }, author)).toMatchObject({
      success: true,
      data: { total: 0 },
    })
    expect(await feedback.get(id, author)).toMatchObject({
      success: true,
      data: {
        report: { status: 'pending' },
      },
    })
  })
})
