/**
 * =============================================================================
 * @h-ai/reach - 配置 Schema 测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { DndConfigSchema, ReachConfigSchema, ReachErrorCode, TemplateConfigSchema } from '../src/index.js'

describe('reach config', () => {
  it('单个 console provider 配置应正确解析', () => {
    const result = ReachConfigSchema.safeParse({
      providers: [{ name: 'dev', type: 'console' }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.providers).toHaveLength(1)
      expect(result.data.providers[0].type).toBe('console')
      expect(result.data.providers[0].name).toBe('dev')
    }
  })

  it('多个 provider 配置应正确解析', () => {
    const result = ReachConfigSchema.safeParse({
      providers: [
        { name: 'email', type: 'smtp', host: 'smtp.example.com', from: 'no-reply@example.com' },
        { name: 'sms', type: 'aliyun-sms', accessKeyId: 'AK', accessKeySecret: 'SK', signName: '签名' },
        { name: 'webhook', type: 'api', url: 'https://api.example.com/notify' },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.providers).toHaveLength(3)
    }
  })

  it('smtp 配置应补齐默认值', () => {
    const result = ReachConfigSchema.safeParse({
      providers: [{ name: 'email', type: 'smtp', host: 'smtp.example.com', from: 'no-reply@example.com' }],
    })
    expect(result.success).toBe(true)
    if (result.success && result.data.providers[0].type === 'smtp') {
      expect(result.data.providers[0].port).toBe(465)
      expect(result.data.providers[0].secure).toBe(true)
    }
  })

  it('aliyun-sms 配置应补齐默认值', () => {
    const result = ReachConfigSchema.safeParse({
      providers: [{ name: 'sms', type: 'aliyun-sms', accessKeyId: 'AK', accessKeySecret: 'SK', signName: '签名' }],
    })
    expect(result.success).toBe(true)
    if (result.success && result.data.providers[0].type === 'aliyun-sms') {
      expect(result.data.providers[0].endpoint).toBe('dysmsapi.aliyuncs.com')
    }
  })

  it('api 配置应补齐默认值', () => {
    const result = ReachConfigSchema.safeParse({
      providers: [{ name: 'webhook', type: 'api', url: 'https://api.example.com' }],
    })
    expect(result.success).toBe(true)
    if (result.success && result.data.providers[0].type === 'api') {
      expect(result.data.providers[0].method).toBe('POST')
      expect(result.data.providers[0].timeout).toBe(10000)
    }
  })

  it('空 providers 数组应校验失败', () => {
    const result = ReachConfigSchema.safeParse({ providers: [] })
    expect(result.success).toBe(false)
  })

  it('无效 type 应校验失败', () => {
    const result = ReachConfigSchema.safeParse({
      providers: [{ name: 'x', type: 'invalid' }],
    })
    expect(result.success).toBe(false)
  })

  it('smtp 缺少必填字段应校验失败', () => {
    const result = ReachConfigSchema.safeParse({
      providers: [{ name: 'email', type: 'smtp', host: '', from: 'test@example.com' }],
    })
    expect(result.success).toBe(false)
  })

  it('错误码应正确定义', () => {
    expect(ReachErrorCode.SEND_FAILED).toBe(8000)
    expect(ReachErrorCode.NOT_INITIALIZED).toBe(8010)
    expect(ReachErrorCode.TEMPLATE_NOT_FOUND).toBe(8001)
    expect(ReachErrorCode.PROVIDER_NOT_FOUND).toBe(8004)
    expect(ReachErrorCode.DND_BLOCKED).toBe(8005)
    expect(ReachErrorCode.DND_DEFERRED).toBe(8006)
    expect(ReachErrorCode.CONFIG_ERROR).toBe(8012)
  })

  it('模板配置 schema 应正确解析', () => {
    const result = TemplateConfigSchema.safeParse({
      name: 'welcome',
      provider: 'email',
      subject: '欢迎 {userName}',
      body: '亲爱的 {userName}，欢迎使用！',
    })
    expect(result.success).toBe(true)
  })

  it('模板配置缺少 body 应校验失败', () => {
    const result = TemplateConfigSchema.safeParse({
      name: 'test',
      provider: 'email',
    })
    expect(result.success).toBe(false)
  })

  it('配置中包含模板数组应正确解析', () => {
    const result = ReachConfigSchema.safeParse({
      providers: [{ name: 'email', type: 'console' }],
      templates: [
        { name: 'welcome', provider: 'email', subject: '欢迎', body: '欢迎使用！' },
        { name: 'code', provider: 'email', body: '验证码: {code}' },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.templates).toHaveLength(2)
    }
  })

  it('dnd 配置应正确解析并补齐默认值', () => {
    const result = DndConfigSchema.safeParse({
      enabled: true,
      start: '22:00',
      end: '08:00',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.enabled).toBe(true)
      expect(result.data.strategy).toBe('discard')
      expect(result.data.start).toBe('22:00')
      expect(result.data.end).toBe('08:00')
    }
  })

  it('dnd 配置默认应禁用', () => {
    const result = DndConfigSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.enabled).toBe(false)
      expect(result.data.strategy).toBe('discard')
    }
  })

  it('dnd 时间格式不合法应校验失败', () => {
    const result = DndConfigSchema.safeParse({
      enabled: true,
      start: '9pm',
    })
    expect(result.success).toBe(false)
  })

  it('配置中包含 DND 应正确解析', () => {
    const result = ReachConfigSchema.safeParse({
      providers: [{ name: 'email', type: 'console' }],
      dnd: { enabled: true, start: '22:00', end: '08:00' },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.dnd?.enabled).toBe(true)
    }
  })

  it('dnd strategy delay 应正确解析', () => {
    const result = DndConfigSchema.safeParse({
      enabled: true,
      strategy: 'delay',
      start: '22:00',
      end: '08:00',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.strategy).toBe('delay')
    }
  })
})
