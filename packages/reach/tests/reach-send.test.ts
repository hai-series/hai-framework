/**
 * =============================================================================
 * @h-ai/reach - 发送操作测试（使用 console Provider）
 * =============================================================================
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { reach, ReachErrorCode } from '../src/index.js'

describe.sequential('reach.send (multi-provider)', () => {
  beforeEach(async () => {
    await reach.init({
      providers: [
        { name: 'email', type: 'console' },
        { name: 'sms', type: 'console' },
      ],
    })
  })

  afterEach(async () => {
    await reach.close()
  })

  it('通过 provider 名称直接发送消息应成功', async () => {
    const result = await reach.send({
      provider: 'email',
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

  it('使用模板发送消息应成功（模板绑定 Provider）', async () => {
    reach.template.register({
      name: 'verification',
      provider: 'email',
      subject: '验证码: {code}',
      body: '您的验证码是 {code}，有效期 {minutes} 分钟。',
    })

    const result = await reach.send({
      provider: 'email',
      to: 'user@example.com',
      template: 'verification',
      vars: { code: '123456', minutes: '5' },
    })

    expect(result.success).toBe(true)
  })

  it('使用模板时可从模板推导 Provider', async () => {
    reach.template.register({
      name: 'sms_code',
      provider: 'sms',
      body: '验证码: {code}',
    })

    // provider 设为空字符串，应从模板推导
    const result = await reach.send({
      provider: '',
      to: '13800138000',
      template: 'sms_code',
      vars: { code: '123456' },
    })

    expect(result.success).toBe(true)
  })

  it('发送到不同 Provider 应成功', async () => {
    const emailResult = await reach.send({
      provider: 'email',
      to: 'user@example.com',
      body: '邮件内容',
    })
    expect(emailResult.success).toBe(true)

    const smsResult = await reach.send({
      provider: 'sms',
      to: '13800138000',
      body: '短信内容',
    })
    expect(smsResult.success).toBe(true)
  })

  it('使用不存在的模板应返回 TEMPLATE_NOT_FOUND', async () => {
    const result = await reach.send({
      provider: 'email',
      to: 'user@example.com',
      template: 'nonexistent',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReachErrorCode.TEMPLATE_NOT_FOUND)
    }
  })

  it('使用不存在的 Provider 应返回 PROVIDER_NOT_FOUND', async () => {
    const result = await reach.send({
      provider: 'nonexistent',
      to: 'user@example.com',
      body: 'test',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReachErrorCode.PROVIDER_NOT_FOUND)
    }
  })

  it('空接收方应返回 INVALID_RECIPIENT', async () => {
    const result = await reach.send({
      provider: 'email',
      to: '',
      body: 'test',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReachErrorCode.INVALID_RECIPIENT)
    }
  })

  it('close 后模板注册表应被重置', async () => {
    reach.template.register({ name: 'temp', provider: 'email', body: 'test' })
    expect(reach.template.has('temp')).toBe(true)

    await reach.close()
    await reach.init({ providers: [{ name: 'email', type: 'console' }] })

    expect(reach.template.has('temp')).toBe(false)
  })
})
