/**
 * =============================================================================
 * @h-ai/reach - 发送日志存储测试
 * =============================================================================
 */

import type { SendLogRepository, SendLogStatus, StoredSendLog } from '../src/reach-repository-send-log.js'
import { describe, expect, it } from 'vitest'

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
})

describe('reach-repository-send-log: interface', () => {
  it('sendLogRepository 接口应定义 findPending 和 markSent 方法', () => {
    // 验证接口结构（编译时检查）
    const _check: keyof SendLogRepository = 'findPending'
    const _check2: keyof SendLogRepository = 'markSent'
    expect(_check).toBe('findPending')
    expect(_check2).toBe('markSent')
  })
})
