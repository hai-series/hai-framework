/**
 * @h-ai/iam — 一次性票据测试
 *
 * 验证 `iam.ticket.issue` / `iam.ticket.consume`：密码学随机、TTL、原子单次消费、
 * 用途绑定、grant 透传。使用 SQLite 内存 + 内存缓存，无需外部依赖。
 */

import { describe, expect, it } from 'vitest'
import { iam } from '../src/index.js'
import { defineIamTestEnv } from './helpers/iam-test-env.js'

describe('iam ticket', () => {
  defineIamTestEnv('ticket')

  it('签发后可原子消费一次，返回主体、用途与 grant', async () => {
    const issued = await iam.ticket.issue({
      subjectId: 'user-1',
      purpose: 'ai-audio',
      grant: { operation: 'transcribe', model: 'whisper-1' },
    })
    expect(issued.success).toBe(true)
    if (!issued.success)
      return
    expect(typeof issued.data.ticket).toBe('string')
    expect(issued.data.ticket.length).toBeGreaterThan(20)
    expect(issued.data.expiresAt).toBeGreaterThan(Date.now())

    const consumed = await iam.ticket.consume(issued.data.ticket)
    expect(consumed.success).toBe(true)
    if (!consumed.success)
      return
    expect(consumed.data.subjectId).toBe('user-1')
    expect(consumed.data.purpose).toBe('ai-audio')
    expect(consumed.data.grant).toMatchObject({ operation: 'transcribe', model: 'whisper-1' })
  })

  it('同一票据只能消费一次（原子单次）', async () => {
    const issued = await iam.ticket.issue({ subjectId: 'user-2', purpose: 'ai-audio' })
    if (!issued.success)
      throw new Error('issue failed')

    const first = await iam.ticket.consume(issued.data.ticket)
    expect(first.success).toBe(true)

    const second = await iam.ticket.consume(issued.data.ticket)
    expect(second.success).toBe(false)
    if (!second.success)
      expect(String(second.error.code)).toContain('iam:110')
  })

  it('并发消费同一票据仅一个成功', async () => {
    const issued = await iam.ticket.issue({ subjectId: 'user-3', purpose: 'ai-audio' })
    if (!issued.success)
      throw new Error('issue failed')

    const results = await Promise.all([
      iam.ticket.consume(issued.data.ticket),
      iam.ticket.consume(issued.data.ticket),
      iam.ticket.consume(issued.data.ticket),
    ])
    const successCount = results.filter(r => r.success).length
    expect(successCount).toBe(1)
  })

  it('未知票据返回 TICKET_INVALID', async () => {
    const consumed = await iam.ticket.consume('nonexistent-ticket')
    expect(consumed.success).toBe(false)
  })

  it('用途不匹配时拒绝（防止跨用途重放）', async () => {
    const issued = await iam.ticket.issue({ subjectId: 'user-4', purpose: 'ai-audio' })
    if (!issued.success)
      throw new Error('issue failed')

    const consumed = await iam.ticket.consume(issued.data.ticket, { purpose: 'other-purpose' })
    expect(consumed.success).toBe(false)
  })

  it('两次签发生成不同的票据值（密码学随机）', async () => {
    const a = await iam.ticket.issue({ subjectId: 'u', purpose: 'p' })
    const b = await iam.ticket.issue({ subjectId: 'u', purpose: 'p' })
    if (!a.success || !b.success)
      throw new Error('issue failed')
    expect(a.data.ticket).not.toBe(b.data.ticket)
  })

  it('过期票据无法消费', async () => {
    const issued = await iam.ticket.issue({ subjectId: 'user-5', purpose: 'ai-audio', ttlMs: 20 })
    if (!issued.success)
      throw new Error('issue failed')
    await new Promise(resolve => setTimeout(resolve, 40))
    const consumed = await iam.ticket.consume(issued.data.ticket)
    expect(consumed.success).toBe(false)
  })
})
