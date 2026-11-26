import type { FeedbackConfigInput } from '../src/index.js'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { feedback, HaiFeedbackError } from '../src/index.js'

const appId = 'orders'
const author = {
  scopeId: 'team-a',
  userId: 'author',
  permissions: ['feedback:create'],
}
const staff = {
  ...author,
  userId: 'staff',
  permissions: ['feedback:read', 'feedback:process'],
}
const invalid = {
  success: false,
  error: { code: HaiFeedbackError.INVALID_INPUT.code },
}

function file(bytes: number) {
  return {
    name: 'steps.txt',
    contentType: 'application/octet-stream',
    dataBase64: Buffer.alloc(bytes, 65).toString('base64'),
  }
}

async function start(settings: Partial<FeedbackConfigInput>) {
  expect(await feedback.init({ appId, ...settings })).toMatchObject({ success: true })
}

beforeEach(async () => {
  expect(await reldb.init({ type: 'sqlite', database: ':memory:' })).toMatchObject({ success: true })
})

afterEach(async () => {
  await feedback.close()
  await reldb.close()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it('首帖和双方消息共用配置限额，缩小后仍可取回已保存的文件', async () => {
  const limits = {
    maxBodyLength: 5,
    maxFiles: 2,
    maxFileBytes: 6,
    maxTotalFileBytes: 9,
  }
  await start({ limits })
  expect(await feedback.getLimits(author)).toMatchObject({
    success: true,
    data: { limits },
  })
  const id = randomUUID()
  for (const input of [
    { body: 'abcdef' },
    {
      body: '',
      attachments: [
        file(1),
        file(1),
        file(1),
      ],
    },
    {
      body: '',
      attachments: [
        file(7),
      ],
    },
    {
      body: '',
      attachments: [
        file(5),
        file(5),
      ],
    },
  ]) {
    expect(await feedback.submit({ id, ...input }, author)).toMatchObject(invalid)
  }
  expect(await feedback.submit({
    id,
    body: 'abcde',
    attachments: [
      file(5),
      file(4),
    ],
  }, author)).toMatchObject({ success: true })

  const messageId = randomUUID()
  expect(await feedback.addMessage({
    id,
    messageId,
    kind: 'request_info',
    body: '',
    attachments: [
      file(7),
    ],
  }, staff)).toMatchObject(invalid)
  expect(await feedback.addMessage({
    id,
    messageId,
    kind: 'reply',
    body: 'abcdef',
  }, author)).toMatchObject(invalid)
  const sent = await feedback.addMessage({
    id,
    messageId,
    kind: 'reply',
    body: '',
    attachments: [
      file(6),
    ],
  }, author)
  expect(sent.success).toBe(true)
  if (!sent.success)
    return

  await start({
    limits: { maxFileBytes: 2, maxTotalFileBytes: 3 },
  })
  expect(await feedback.get(id, staff)).toMatchObject({ success: true })
  expect(await feedback.getAttachment({ id, attachmentId: sent.data.attachments[0]!.id }, staff)).toMatchObject({
    success: true,
    data: file(6),
  })
  expect(await feedback.addMessage({
    id,
    messageId: randomUUID(),
    kind: 'reply',
    body: '',
    attachments: [
      file(6),
    ],
  }, author)).toMatchObject(invalid)
})

it('服务端日志使用设置的窗口和条数，超限浏览器日志不能入库', async () => {
  await start({
    capture: { windowSeconds: 2, maxLogEntries: 1 },
  })
  const now = Date.now()
  const clock = vi.spyOn(Date, 'now')
  for (const [offset, message] of [
    [3000, 'old'],
    [1000, 'previous'],
    [0, 'latest'],
  ] as const) {
    clock.mockReturnValue(now - offset)
    core.context.run({ ...author, requestId: message }, () => core.logger.warn(message))
  }
  const id = randomUUID()
  const browserLogs = {
    name: 'browser-logs.json',
    contentType: 'application/json',
    dataBase64: Buffer.from('[{"message":"first"},{"message":"second"}]').toString('base64'),
  }
  expect(await feedback.submit({
    id,
    body: 'Over the entry limit',
    capture: { browserLogs },
  }, author)).toMatchObject(invalid)
  expect(await feedback.submit({
    id,
    body: '',
    capture: { includeServerLogs: true },
  }, author)).toMatchObject({ success: true })
  const detail = await feedback.get(id, author)
  expect(detail.success).toBe(true)
  if (!detail.success)
    return
  expect(detail.data.attachments.map(item => item.kind)).toEqual(['server_logs'])
  const logs = await feedback.getAttachment({ id, attachmentId: detail.data.attachments[0]!.id }, author)
  expect(logs.success).toBe(true)
  if (logs.success) {
    expect(JSON.parse(Buffer.from(logs.data.dataBase64, 'base64').toString())).toEqual([
      expect.objectContaining({ message: 'latest' }),
    ])
  }
})

it('调高单文件上限后可发送超过默认值的附件', async () => {
  await start({
    limits: { maxFileBytes: 6 * 1024 * 1024 },
  })
  const id = randomUUID()
  const size = 5 * 1024 * 1024 + 1
  expect(await feedback.submit({
    id,
    body: '',
    attachments: [
      file(size),
    ],
  }, author)).toMatchObject({ success: true })
  expect(await feedback.get(id, staff)).toMatchObject({
    success: true,
    data: {
      attachments: [
        { size, kind: 'file' },
      ],
    },
  })
})

it('到期即禁止查询和回复，在下一次清理中移除反馈及关联记录', async () => {
  const now = Date.now()
  vi.useFakeTimers({
    toFake: ['Date', 'setTimeout', 'clearTimeout'],
  })
  vi.setSystemTime(now)
  await start({
    retention: { days: 1 },
  })
  const id = randomUUID()
  const messageId = randomUUID()
  expect(await feedback.submit({
    id,
    body: 'Order',
    attachments: [
      file(3),
    ],
  }, author)).toMatchObject({ success: true })
  vi.setSystemTime(now + 300_000)
  const reply = await feedback.addMessage({
    id,
    messageId,
    kind: 'request_info',
    body: 'More info',
    attachments: [
      file(4),
    ],
  }, staff)
  expect(reply.success).toBe(true)
  if (!reply.success)
    return
  const attachmentId = reply.data.attachments[0]!.id
  vi.setSystemTime(now + 86_400_000)
  expect(await feedback.get(id, staff)).toMatchObject({ success: true })
  vi.setSystemTime(reply.data.createdAt + 86_400_000)
  expect(await feedback.listMine({}, author)).toMatchObject({
    success: true,
    data: { total: 0 },
  })
  const notFound = {
    success: false,
    error: { code: HaiFeedbackError.NOT_FOUND.code },
  }
  expect(await feedback.get(id, staff)).toMatchObject(notFound)
  expect(await feedback.getAttachment({ id, attachmentId }, author)).toMatchObject(notFound)
  expect(await feedback.addMessage({
    id,
    messageId: randomUUID(),
    kind: 'reply',
    body: 'Too late',
  }, author)).toMatchObject(notFound)
  expect(await reldb.sql.get('SELECT id FROM hai_feedback_reports WHERE id = ?', [id])).toMatchObject({
    success: true,
    data: { id },
  })

  await vi.advanceTimersByTimeAsync(3600 * 1000)
  await feedback.close()
  expect(await reldb.sql.query('SELECT id FROM hai_feedback_reports WHERE id = ?', [id])).toMatchObject({ success: true, data: [] })
  expect(await reldb.sql.query('SELECT id FROM hai_feedback_messages WHERE report_id = ?', [id])).toMatchObject({ success: true, data: [] })
  expect(await reldb.sql.query('SELECT id FROM hai_feedback_attachments WHERE report_id = ?', [id])).toMatchObject({ success: true, data: [] })
})
