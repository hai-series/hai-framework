/**
 * =============================================================================
 * @h-ai/reach - 发送操作测试（使用 console Provider）
 * =============================================================================
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { reach, ReachErrorCode } from '../src/index.js'

describe.sequential('reach.send (console)', () => {
  beforeEach(async () => {
    await reach.init({ type: 'console' })
  })

  afterEach(async () => {
    await reach.close()
  })

  it('直接发送消息应成功', async () => {
    const result = await reach.send({
      channel: 'email',
      to: 'user@example.com',
      subject: '测试邮件',
      body: '这是测试内容',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.success).toBe(true)
      expect(result.data.messageId).toBeDefined()
    }
  })

  it('使用模板发送消息应成功', async () => {
    reach.template.register({
      name: 'verification',
      subject: '验证码: {code}',
      body: '您的验证码是 {code}，有效期 {minutes} 分钟。',
    })

    const result = await reach.send({
      channel: 'email',
      to: 'user@example.com',
      template: 'verification',
      vars: { code: '123456', minutes: '5' },
    })

    expect(result.success).toBe(true)
  })

  it('使用不存在的模板应返回 TEMPLATE_NOT_FOUND', async () => {
    const result = await reach.send({
      channel: 'email',
      to: 'user@example.com',
      template: 'nonexistent',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReachErrorCode.TEMPLATE_NOT_FOUND)
    }
  })

  it('空接收方应返回 INVALID_RECIPIENT', async () => {
    const result = await reach.send({
      channel: 'email',
      to: '',
      body: 'test',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReachErrorCode.INVALID_RECIPIENT)
    }
  })

  it('发送短信消息应成功', async () => {
    const result = await reach.send({
      channel: 'sms',
      to: '13800138000',
      body: '测试短信',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.success).toBe(true)
    }
  })

  it('close 后模板注册表应被重置', async () => {
    reach.template.register({ name: 'temp', body: 'test' })
    expect(reach.template.has('temp')).toBe(true)

    await reach.close()
    await reach.init({ type: 'console' })

    expect(reach.template.has('temp')).toBe(false)
  })
})
