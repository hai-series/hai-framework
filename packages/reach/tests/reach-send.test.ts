/**
 * =============================================================================
 * @h-ai/reach - 发送操作测试（使用 console Provider）
 * =============================================================================
 */

import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { reach, ReachErrorCode } from '../src/index.js'
import { resetTemplateRepoSingleton } from '../src/repositories/reach-repository-template.js'

describe.sequential('reach.send (multi-provider)', () => {
  beforeEach(async () => {
    resetTemplateRepoSingleton()
    await reldb.init({ type: 'sqlite', database: ':memory:' })
    await reach.init({
      providers: [
        { name: 'email', type: 'console' },
        { name: 'sms', type: 'console' },
      ],
    })
  })

  afterEach(async () => {
    await reach.close()
    resetTemplateRepoSingleton()
    await reldb.close()
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
    await reach.template.save({
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
    await reach.template.save({
      name: 'sms_code',
      provider: 'sms',
      body: '验证码: {code}',
    })

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

  it('空 provider 且无模板应返回 PROVIDER_NOT_FOUND', async () => {
    const result = await reach.send({
      provider: '',
      to: 'user@example.com',
      body: 'test',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReachErrorCode.PROVIDER_NOT_FOUND)
    }
  })

  it('close 后模板注册表应被重置', async () => {
    await reach.template.save({ name: 'temp', provider: 'email', body: 'test' })
    const before = await reach.template.resolve('temp')
    expect(before.success).toBe(true)

    await reach.close()
    // 重新初始化 DB（模拟新节点启动，旧数据已丢失）
    resetTemplateRepoSingleton()
    await reldb.close()
    await reldb.init({ type: 'sqlite', database: ':memory:' })
    await reach.init({ providers: [{ name: 'email', type: 'console' }] })

    const after = await reach.template.resolve('temp')
    expect(after.success).toBe(false)
  })

  it('extra 字段应传递到 Provider', async () => {
    const result = await reach.send({
      provider: 'sms',
      to: '13800138000',
      body: '测试',
      extra: { templateCode: 'SMS_123456' },
    })

    expect(result.success).toBe(true)
  })
})

describe.sequential('reach.send (template from config)', () => {
  beforeEach(async () => {
    resetTemplateRepoSingleton()
    await reldb.init({ type: 'sqlite', database: ':memory:' })
  })

  afterEach(async () => {
    await reach.close()
    resetTemplateRepoSingleton()
    await reldb.close()
  })

  it('配置中的模板应自动注册', async () => {
    await reach.init({
      providers: [{ name: 'email', type: 'console' }],
      templates: [
        { name: 'config_tpl', provider: 'email', subject: '来自配置 {name}', body: '内容 {name}' },
      ],
    })

    const resolved = await reach.template.resolve('config_tpl')
    expect(resolved.success).toBe(true)

    const result = await reach.send({
      provider: 'email',
      to: 'user@example.com',
      template: 'config_tpl',
      vars: { name: '张三' },
    })
    expect(result.success).toBe(true)
  })
})

describe.sequential('reach.send (DND)', () => {
  afterEach(async () => {
    await reach.close()
  })

  it('dnd 禁用时消息应正常发送', async () => {
    await reach.init({
      providers: [{ name: 'email', type: 'console' }],
      dnd: { enabled: false, start: '00:00', end: '23:59' },
    })

    const result = await reach.send({
      provider: 'email',
      to: 'user@example.com',
      body: 'test',
    })

    expect(result.success).toBe(true)
  })

  it('dnd discard 策略应返回 DND_BLOCKED', async () => {
    // 设置一个全天的 DND（00:00 - 23:59），确保当前时间在 DND 内
    await reach.init({
      providers: [{ name: 'email', type: 'console' }],
      dnd: { enabled: true, strategy: 'discard', start: '00:00', end: '23:59' },
    })

    const result = await reach.send({
      provider: 'email',
      to: 'user@example.com',
      body: 'test',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReachErrorCode.DND_BLOCKED)
    }
  })

  it('dnd delay 策略应返回 deferred 结果', async () => {
    await reach.init({
      providers: [{ name: 'email', type: 'console' }],
      dnd: { enabled: true, strategy: 'delay', start: '00:00', end: '23:59' },
    })

    const result = await reach.send({
      provider: 'email',
      to: 'user@example.com',
      body: 'deferred test',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.deferred).toBe(true)
    }
  })

  it('dnd delay 策略下不存在的 provider 仍应返回 PROVIDER_NOT_FOUND', async () => {
    await reach.init({
      providers: [{ name: 'email', type: 'console' }],
      dnd: { enabled: true, strategy: 'delay', start: '00:00', end: '23:59' },
    })

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
})
