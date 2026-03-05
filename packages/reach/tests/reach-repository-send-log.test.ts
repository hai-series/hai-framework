/**
 * =============================================================================
 * @h-ai/reach - 发送日志存储测试（SQLite）
 * =============================================================================
 */

import type { SendLogRepository, SendLogStatus, StoredSendLog } from '../src/repositories/reach-repository-send-log.js'
import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSendLogRepository, resetSendLogRepoSingleton } from '../src/repositories/reach-repository-send-log.js'

// ─── 类型检查 ───

describe('reach-repository-send-log: types', () => {
  it('sendLogStatus 类型应支持 sent 和 pending', () => {
    const sent: SendLogStatus = 'sent'
    const pending: SendLogStatus = 'pending'
    expect(sent).toBe('sent')
    expect(pending).toBe('pending')
  })

  it('storedSendLog 接口应包含所有必要字段', () => {
    const record: StoredSendLog = {
      id: 1,
      provider: 'email',
      toAddr: 'user@example.com',
      subject: '测试',
      body: '测试内容',
      template: 'welcome',
      varsJson: '{"name":"张三"}',
      extraJson: null,
      status: 'sent',
      messageId: 'msg-001',
      createdAt: Date.now(),
    }

    expect(record.id).toBe(1)
    expect(record.provider).toBe('email')
    expect(record.toAddr).toBe('user@example.com')
    expect(record.status).toBe('sent')
  })

  it('storedSendLog 可空字段应接受 null', () => {
    const record: StoredSendLog = {
      id: 2,
      provider: 'sms',
      toAddr: '13800138000',
      subject: null,
      body: null,
      template: null,
      varsJson: null,
      extraJson: null,
      status: 'pending',
      messageId: null,
      createdAt: Date.now(),
    }

    expect(record.subject).toBeNull()
    expect(record.body).toBeNull()
    expect(record.messageId).toBeNull()
  })

  it('sendLogRepository 接口应定义 findPending 和 markSent 方法', () => {
    const _check: keyof SendLogRepository = 'findPending'
    const _check2: keyof SendLogRepository = 'markSent'
    expect(_check).toBe('findPending')
    expect(_check2).toBe('markSent')
  })
})

// ─── SQLite 集成测试 ───

describe.sequential('reach-repository-send-log: sqlite', () => {
  let repo: SendLogRepository

  beforeEach(async () => {
    resetSendLogRepoSingleton()
    const initResult = await reldb.init({ type: 'sqlite', database: ':memory:' })
    if (!initResult.success)
      throw new Error(`reldb init failed: ${initResult.error.message}`)
    const repoResult = await createSendLogRepository(reldb)
    if (!repoResult.success)
      throw new Error(`createSendLogRepository failed: ${repoResult.error.message}`)
    repo = repoResult.data
  })

  afterEach(async () => {
    resetSendLogRepoSingleton()
    await reldb.close()
  })

  // ─── createSendLogRepository ───

  it('createSendLogRepository 应成功创建仓库实例', () => {
    expect(repo).toBeDefined()
    expect(repo.findPending).toBeTypeOf('function')
    expect(repo.markSent).toBeTypeOf('function')
  })

  it('重复调用 createSendLogRepository 应返回同一实例（单例）', async () => {
    const second = await createSendLogRepository(reldb)
    expect(second.success).toBe(true)
    if (second.success)
      expect(second.data).toBe(repo)
  })

  // ─── create ───

  it('create 应插入一条记录并返回', async () => {
    const result = await repo.create({
      provider: 'console',
      toAddr: 'user@test.com',
      subject: '测试主题',
      body: '测试正文',
      template: null,
      varsJson: null,
      extraJson: null,
      status: 'pending',
      messageId: null,
      createdAt: Date.now(),
    })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data.changes).toBe(1)
    expect(result.data.lastInsertRowid).toBeDefined()

    const findResult = await repo.findById(Number(result.data.lastInsertRowid))
    expect(findResult.success).toBe(true)
    if (!findResult.success)
      return
    expect(findResult.data?.provider).toBe('console')
    expect(findResult.data?.toAddr).toBe('user@test.com')
    expect(findResult.data?.status).toBe('pending')
  })

  it('create 应正确保存可空字段', async () => {
    const result = await repo.create({
      provider: 'sms',
      toAddr: '13800138000',
      subject: null,
      body: null,
      template: 'verify',
      varsJson: '{"code":"1234"}',
      extraJson: null,
      status: 'sent',
      messageId: 'msg-abc',
      createdAt: Date.now(),
    })
    expect(result.success).toBe(true)
    if (!result.success)
      return

    const findResult = await repo.findById(Number(result.data.lastInsertRowid))
    expect(findResult.success).toBe(true)
    if (!findResult.success)
      return
    expect(findResult.data?.subject).toBeUndefined()
    expect(findResult.data?.body).toBeUndefined()
    expect(findResult.data?.template).toBe('verify')
    expect(findResult.data?.varsJson).toBe('{"code":"1234"}')
    expect(findResult.data?.messageId).toBe('msg-abc')
  })

  // ─── findById ───

  it('findById 应返回指定记录', async () => {
    const createResult = await repo.create({
      provider: 'console',
      toAddr: 'a@test.com',
      subject: null,
      body: 'hello',
      template: null,
      varsJson: null,
      extraJson: null,
      status: 'sent',
      messageId: null,
      createdAt: Date.now(),
    })
    expect(createResult.success).toBe(true)
    if (!createResult.success)
      return

    const findResult = await repo.findById(Number(createResult.data.lastInsertRowid))
    expect(findResult.success).toBe(true)
    if (!findResult.success)
      return
    expect(findResult.data?.toAddr).toBe('a@test.com')
    expect(findResult.data?.body).toBe('hello')
  })

  // ─── findPending ───

  it('findPending 应返回所有 pending 记录（按创建时间升序）', async () => {
    const now = Date.now()
    await repo.create({ provider: 'a', toAddr: 'x', subject: null, body: 'first', template: null, varsJson: null, extraJson: null, status: 'pending', messageId: null, createdAt: now })
    await repo.create({ provider: 'b', toAddr: 'y', subject: null, body: 'second', template: null, varsJson: null, extraJson: null, status: 'sent', messageId: 'done', createdAt: now + 1 })
    await repo.create({ provider: 'c', toAddr: 'z', subject: null, body: 'third', template: null, varsJson: null, extraJson: null, status: 'pending', messageId: null, createdAt: now + 2 })

    const result = await repo.findPending()
    expect(result.success).toBe(true)
    if (!result.success)
      return

    expect(result.data).toHaveLength(2)
    expect(result.data[0].body).toBe('first')
    expect(result.data[1].body).toBe('third')
    expect(result.data[0].status).toBe('pending')
    expect(result.data[1].status).toBe('pending')
  })

  it('findPending 无 pending 记录时应返回空数组', async () => {
    await repo.create({ provider: 'a', toAddr: 'x', subject: null, body: null, template: null, varsJson: null, extraJson: null, status: 'sent', messageId: 'ok', createdAt: Date.now() })
    const result = await repo.findPending()
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data).toHaveLength(0)
  })

  // ─── markSent ───

  it('markSent 应将 pending 记录标记为 sent', async () => {
    const createResult = await repo.create({ provider: 'a', toAddr: 'x', subject: null, body: null, template: null, varsJson: null, extraJson: null, status: 'pending', messageId: null, createdAt: Date.now() })
    expect(createResult.success).toBe(true)
    if (!createResult.success)
      return
    const id = Number(createResult.data.lastInsertRowid)

    const markResult = await repo.markSent(id, 'msg-123')
    expect(markResult.success).toBe(true)

    const findResult = await repo.findById(id)
    expect(findResult.success).toBe(true)
    if (!findResult.success)
      return
    expect(findResult.data?.status).toBe('sent')
    expect(findResult.data?.messageId).toBe('msg-123')
  })

  it('markSent 不传 messageId 时应将 messageId 置为 null', async () => {
    const createResult = await repo.create({ provider: 'a', toAddr: 'x', subject: null, body: null, template: null, varsJson: null, extraJson: null, status: 'pending', messageId: null, createdAt: Date.now() })
    expect(createResult.success).toBe(true)
    if (!createResult.success)
      return

    const id = Number(createResult.data.lastInsertRowid)

    const markResult = await repo.markSent(id)
    expect(markResult.success).toBe(true)

    const findResult = await repo.findById(id)
    expect(findResult.success).toBe(true)
    if (!findResult.success)
      return
    expect(findResult.data?.status).toBe('sent')
    expect(findResult.data?.messageId).toBeUndefined()
  })

  it('markSent 后 findPending 不应返回该记录', async () => {
    const createResult = await repo.create({ provider: 'a', toAddr: 'x', subject: null, body: null, template: null, varsJson: null, extraJson: null, status: 'pending', messageId: null, createdAt: Date.now() })
    expect(createResult.success).toBe(true)
    if (!createResult.success)
      return

    await repo.markSent(Number(createResult.data.lastInsertRowid), 'done')

    const pending = await repo.findPending()
    expect(pending.success).toBe(true)
    if (pending.success)
      expect(pending.data).toHaveLength(0)
  })

  // ─── 单例重置 ───

  it('resetSendLogRepoSingleton 后应创建新实例', async () => {
    const oldRepo = repo
    resetSendLogRepoSingleton()
    const newResult = await createSendLogRepository(reldb)
    expect(newResult.success).toBe(true)
    if (newResult.success)
      expect(newResult.data).not.toBe(oldRepo)
  })

  // ─── count / exists ───

  it('count 应返回总记录数', async () => {
    await repo.create({ provider: 'a', toAddr: 'x', subject: null, body: null, template: null, varsJson: null, extraJson: null, status: 'pending', messageId: null, createdAt: Date.now() })
    await repo.create({ provider: 'b', toAddr: 'y', subject: null, body: null, template: null, varsJson: null, extraJson: null, status: 'sent', messageId: null, createdAt: Date.now() })

    const countResult = await repo.count()
    expect(countResult.success).toBe(true)
    if (countResult.success)
      expect(countResult.data).toBe(2)
  })

  it('existsById 应正确判断记录存在性', async () => {
    const createResult = await repo.create({ provider: 'a', toAddr: 'x', subject: null, body: null, template: null, varsJson: null, extraJson: null, status: 'sent', messageId: null, createdAt: Date.now() })
    expect(createResult.success).toBe(true)
    if (!createResult.success)
      return

    const exists = await repo.existsById(Number(createResult.data.lastInsertRowid))
    expect(exists.success).toBe(true)
    if (exists.success)
      expect(exists.data).toBe(true)

    const notExists = await repo.existsById(99999)
    expect(notExists.success).toBe(true)
    if (notExists.success)
      expect(notExists.data).toBe(false)
  })
})
