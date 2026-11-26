import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { apiContract, FeedbackAddMessageInputSchema, FeedbackSetStatusInputSchema, FeedbackSubmitInputSchema } from '../src/index.js'

describe('反馈契约', () => {
  const id = randomUUID()
  const file = { name: 'instructions.txt', contentType: 'text/plain', dataBase64: 'YQ==' }

  it('允许纯文件的提交和双向消息，身份字段由服务端决定', () => {
    expect(FeedbackSubmitInputSchema.parse({
      id,
      body: '',
      attachments: [file],
    }).attachments).toEqual([file])
    expect(FeedbackSubmitInputSchema.safeParse({ id, body: ' ', userId: 'untrusted' }).success).toBe(false)
    expect(FeedbackAddMessageInputSchema.safeParse({
      id,
      messageId: randomUUID(),
      kind: 'request_info',
      body: '',
      attachments: [file],
    }).success).toBe(true)
    expect(FeedbackSetStatusInputSchema.safeParse({ id, status: 'awaiting_user' }).success).toBe(false)
    expect(apiContract.pathOf(apiContract.feedback.reports.listMine)).toBe('/feedback/my-reports')
    expect(apiContract.pathOf(apiContract.feedback.reports.addMessage)).toBe('/feedback/reports/{id}/messages')
  })

  it('拒绝空提交、非法文件名、损坏 Base64 与大小超限', () => {
    const encode = (size: number) => Buffer.alloc(size).toString('base64')
    for (const attachments of [
      [],
      [
        { ...file, name: 'folder/file.txt' },
      ],
      [
        { ...file, dataBase64: 'invalid?' },
      ],
      Array.from({ length: 6 }).fill(file),
      [
        {
          ...file,
          dataBase64: encode(5 * 1024 * 1024 + 1),
        },
      ],
      Array.from({ length: 3 }, () => ({
        ...file,
        dataBase64: encode(4 * 1024 * 1024),
      })),
    ]) {
      expect(FeedbackSubmitInputSchema.safeParse({ id, body: '', attachments }).success).toBe(false)
    }
  })
})
