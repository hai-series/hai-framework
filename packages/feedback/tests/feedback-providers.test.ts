import type { DbTestEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { reldb } from '@h-ai/reldb'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mysqlEnv, postgresEnv, sqliteMemoryEnv } from '../../reldb/tests/helpers/reldb-test-suite.js'
import { feedback, HaiFeedbackError } from '../src/index.js'

const owner = {
  scopeId: 'team-A',
  userId: 'account-A',
  permissions: ['feedback:create'],
}
const staff = {
  scopeId: owner.scopeId,
  userId: 'staff',
  permissions: ['feedback:read', 'feedback:process'],
}

describe.each([
  ['SQLite', sqliteMemoryEnv],
  ['PostgreSQL', postgresEnv],
  ['MySQL', mysqlEnv],
] as const)('%s 反馈数据库', (_label, createEnvironment) => {
  let environment: DbTestEnv | undefined

  beforeAll(async () => {
    environment = await createEnvironment()
    expect(await reldb.init(environment.config)).toMatchObject({ success: true })
    expect(await feedback.init({ appId: 'order-app' })).toMatchObject({ success: true })
  }, 180_000)

  afterAll(async () => {
    try {
      await feedback.close()
      await reldb.close()
    }
    finally {
      await environment?.release?.()
    }
  }, 60_000)

  it('保存超过 64 KiB 的消息附件，较长正文与附件重启后仍完整', async () => {
    const id = randomUUID()
    const body = '注文を確認してください。'.repeat(150)
    const file = {
      name: 'instructions.dat',
      contentType: 'application/octet-stream',
      dataBase64: Buffer.alloc(100_000, 0xC8).toString('base64'),
    }
    expect(await feedback.submit({ id, body }, owner)).toMatchObject({
      success: true,
      data: { body },
    })
    const result = await feedback.addMessage({
      id,
      messageId: randomUUID(),
      kind: 'request_info',
      body,
      attachments: [file],
    }, staff)
    expect(result.success).toBe(true)
    if (!result.success)
      return

    expect((await feedback.close()).success).toBe(true)
    expect((await feedback.init({ appId: 'order-app' })).success).toBe(true)
    expect(await feedback.get(id, owner)).toMatchObject({
      success: true,
      data: {
        report: { body, status: 'awaiting_user' },
      },
    })
    const attachmentId = result.data.attachments[0]!.id
    expect(await feedback.getAttachment({ id, attachmentId }, owner)).toMatchObject({ success: true, data: file })
  })

  it('列表和对话接口按精确范围及作者校验身份', async () => {
    const id = randomUUID()
    expect((await feedback.submit({ id, body: 'Scoped report' }, owner)).success).toBe(true)
    for (const scopeId of ['team-a', 'téam-A', 'team-A ']) {
      expect(await feedback.listMessages({ id }, { ...staff, scopeId })).toMatchObject({
        success: false,
        error: { code: HaiFeedbackError.NOT_FOUND.code },
      })
      expect(await feedback.list({}, { ...staff, scopeId })).toMatchObject({
        success: true,
        data: { total: 0 },
      })
    }
    expect(await feedback.listMine({}, { ...owner, userId: 'account-a' })).toMatchObject({
      success: true,
      data: { total: 0 },
    })
  })

  it('启动时只级联清理本应用到期反馈，同库的其他应用继续保留', async () => {
    const id = randomUUID()
    const otherAppId = randomUUID()
    const attachment = { name: 'steps.txt', contentType: 'text/plain', dataBase64: 'YQ==' }
    expect(await feedback.submit({
      id,
      body: 'Old report',
      attachments: [attachment],
    }, owner)).toMatchObject({ success: true })
    expect(await feedback.addMessage({
      id,
      messageId: randomUUID(),
      kind: 'reply',
      body: 'Review',
      attachments: [attachment],
    }, staff)).toMatchObject({ success: true })
    expect(await feedback.setStatus({ id, status: 'handled' }, staff)).toMatchObject({ success: true })
    expect(await feedback.init({ appId: 'Order-App' })).toMatchObject({ success: true })
    expect(await feedback.submit({ id: otherAppId, body: 'Other application' }, owner)).toMatchObject({ success: true })
    const old = Date.now() - 2 * 86_400_000
    expect(await reldb.sql.execute('UPDATE hai_feedback_reports SET updated_at = ? WHERE id IN (?, ?)', [old, id, otherAppId])).toMatchObject({ success: true })
    expect(await feedback.init({
      appId: 'order-app',
      retention: { days: 1 },
    })).toMatchObject({ success: true })
    await vi.waitFor(async () => {
      expect(await reldb.sql.query('SELECT id FROM hai_feedback_reports WHERE id IN (?, ?)', [id, otherAppId])).toMatchObject({
        success: true,
        data: [
          { id: otherAppId },
        ],
      })
    })
    expect(await reldb.sql.query('SELECT id FROM hai_feedback_messages WHERE report_id = ?', [id])).toMatchObject({ success: true, data: [] })
    expect(await reldb.sql.query('SELECT id FROM hai_feedback_attachments WHERE report_id = ?', [id])).toMatchObject({ success: true, data: [] })
  })
})
