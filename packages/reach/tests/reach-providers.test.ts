/**
 * =============================================================================
 * @h-ai/reach - Provider 单元测试
 * =============================================================================
 *
 * 覆盖所有 Provider 的初始化、发送、关闭等核心逻辑。
 */

import type { ProviderConfig } from '../src/reach-config.js'
import type { ReachMessage, ReachProvider } from '../src/reach-types.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAliyunSmsProvider } from '../src/providers/reach-provider-aliyun-sms.js'
import { createApiProvider } from '../src/providers/reach-provider-api.js'
import { createConsoleProvider } from '../src/providers/reach-provider-console.js'
import { createSmtpProvider } from '../src/providers/reach-provider-smtp.js'
import { ReachErrorCode } from '../src/reach-config.js'

// =============================================================================
// Console Provider
// =============================================================================

describe('console provider', () => {
  let provider: ReachProvider

  beforeEach(() => {
    provider = createConsoleProvider()
  })

  afterEach(async () => {
    await provider.close()
  })

  it('connect 后应处于已连接状态', async () => {
    expect(provider.isConnected()).toBe(false)

    const result = await provider.connect({ name: 'dev', type: 'console' })
    expect(result.success).toBe(true)
    expect(provider.isConnected()).toBe(true)
  })

  it('close 后应处于未连接状态', async () => {
    await provider.connect({ name: 'dev', type: 'console' })
    expect(provider.isConnected()).toBe(true)

    await provider.close()
    expect(provider.isConnected()).toBe(false)
  })

  it('send 应返回带 messageId 的成功结果', async () => {
    await provider.connect({ name: 'dev', type: 'console' })

    const result = await provider.send({
      provider: 'dev',
      to: 'user@example.com',
      subject: '测试邮件',
      body: '测试内容',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.success).toBe(true)
      expect(result.data.messageId).toBeDefined()
      expect(result.data.messageId).toMatch(/^console-\d+$/)
    }
  })

  it('send 应正确传递所有消息字段', async () => {
    await provider.connect({ name: 'dev', type: 'console' })

    const message: ReachMessage = {
      provider: 'dev',
      to: '13800138000',
      template: 'sms_code',
      vars: { code: '123456' },
      extra: { templateCode: 'SMS_001' },
    }

    const result = await provider.send(message)
    expect(result.success).toBe(true)
  })

  it('name 属性应为 console', () => {
    expect(provider.name).toBe('console')
  })
})

// =============================================================================
// SMTP Provider
// =============================================================================

describe('smtp provider', () => {
  let provider: ReachProvider

  beforeEach(() => {
    provider = createSmtpProvider()
  })

  afterEach(async () => {
    await provider.close()
  })

  it('connect 传入非 smtp 类型应返回 CONFIG_ERROR', async () => {
    const result = await provider.connect({ name: 'wrong', type: 'console' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReachErrorCode.CONFIG_ERROR)
    }
  })

  it('close 未连接时应安全执行', async () => {
    await provider.close()
    expect(provider.isConnected()).toBe(false)
  })

  it('send 未连接时应返回 NOT_INITIALIZED', async () => {
    const result = await provider.send({
      provider: 'email',
      to: 'user@example.com',
      body: 'test',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReachErrorCode.NOT_INITIALIZED)
    }
  })

  it('name 属性应为 smtp', () => {
    expect(provider.name).toBe('smtp')
  })
})

// =============================================================================
// Aliyun SMS Provider
// =============================================================================

describe('aliyun-sms provider', () => {
  let provider: ReachProvider

  beforeEach(() => {
    provider = createAliyunSmsProvider()
  })

  afterEach(async () => {
    await provider.close()
  })

  it('connect 传入非 aliyun-sms 类型应返回 CONFIG_ERROR', async () => {
    const result = await provider.connect({ name: 'wrong', type: 'console' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReachErrorCode.CONFIG_ERROR)
    }
  })

  it('connect 成功后应处于已连接状态', async () => {
    expect(provider.isConnected()).toBe(false)

    const result = await provider.connect({
      name: 'sms',
      type: 'aliyun-sms',
      accessKeyId: 'test-ak',
      accessKeySecret: 'test-sk',
      signName: '测试签名',
      endpoint: 'dysmsapi.aliyuncs.com',
    } as ProviderConfig)

    expect(result.success).toBe(true)
    expect(provider.isConnected()).toBe(true)
  })

  it('close 后应处于未连接状态', async () => {
    await provider.connect({
      name: 'sms',
      type: 'aliyun-sms',
      accessKeyId: 'test-ak',
      accessKeySecret: 'test-sk',
      signName: '测试签名',
      endpoint: 'dysmsapi.aliyuncs.com',
    } as ProviderConfig)

    await provider.close()
    expect(provider.isConnected()).toBe(false)
  })

  it('send 未连接时应返回 NOT_INITIALIZED', async () => {
    const result = await provider.send({
      provider: 'sms',
      to: '13800138000',
      body: '测试',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReachErrorCode.NOT_INITIALIZED)
    }
  })

  it('send 网络错误时应返回 SEND_FAILED', async () => {
    await provider.connect({
      name: 'sms',
      type: 'aliyun-sms',
      accessKeyId: 'test-ak',
      accessKeySecret: 'test-sk',
      signName: '测试签名',
      endpoint: 'invalid.endpoint.local',
    } as ProviderConfig)

    // 模拟 fetch 失败
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'))

    const result = await provider.send({
      provider: 'sms',
      to: '13800138000',
      extra: { templateCode: 'SMS_123' },
      vars: { code: '654321' },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReachErrorCode.SEND_FAILED)
    }

    vi.restoreAllMocks()
  })

  it('send 阿里云返回非 OK 时应返回 SEND_FAILED', async () => {
    await provider.connect({
      name: 'sms',
      type: 'aliyun-sms',
      accessKeyId: 'test-ak',
      accessKeySecret: 'test-sk',
      signName: '测试签名',
      endpoint: 'dysmsapi.aliyuncs.com',
    } as ProviderConfig)

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ Code: 'isv.BUSINESS_LIMIT_CONTROL', Message: '触发业务限流' }), { status: 200 }),
    )

    const result = await provider.send({
      provider: 'sms',
      to: '13800138000',
      extra: { templateCode: 'SMS_123' },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReachErrorCode.SEND_FAILED)
    }

    vi.restoreAllMocks()
  })

  it('send 阿里云返回 OK 时应返回成功结果', async () => {
    await provider.connect({
      name: 'sms',
      type: 'aliyun-sms',
      accessKeyId: 'test-ak',
      accessKeySecret: 'test-sk',
      signName: '测试签名',
      endpoint: 'dysmsapi.aliyuncs.com',
    } as ProviderConfig)

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ Code: 'OK', Message: 'OK', BizId: 'biz-123' }), { status: 200 }),
    )

    const result = await provider.send({
      provider: 'sms',
      to: '13800138000',
      extra: { templateCode: 'SMS_123' },
      vars: { code: '654321' },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.success).toBe(true)
      expect(result.data.messageId).toBe('biz-123')
    }

    vi.restoreAllMocks()
  })

  it('name 属性应为 aliyun-sms', () => {
    expect(provider.name).toBe('aliyun-sms')
  })
})

// =============================================================================
// API Provider
// =============================================================================

describe('api provider', () => {
  let provider: ReachProvider

  beforeEach(() => {
    provider = createApiProvider()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await provider.close()
  })

  it('connect 传入非 api 类型应返回 CONFIG_ERROR', async () => {
    const result = await provider.connect({ name: 'wrong', type: 'console' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReachErrorCode.CONFIG_ERROR)
    }
  })

  it('connect 成功后应处于已连接状态', async () => {
    expect(provider.isConnected()).toBe(false)

    const result = await provider.connect({
      name: 'webhook',
      type: 'api',
      url: 'https://api.example.com/notify',
      method: 'POST',
      timeout: 10000,
    } as ProviderConfig)

    expect(result.success).toBe(true)
    expect(provider.isConnected()).toBe(true)
  })

  it('close 后应处于未连接状态', async () => {
    await provider.connect({
      name: 'webhook',
      type: 'api',
      url: 'https://api.example.com/notify',
      method: 'POST',
      timeout: 10000,
    } as ProviderConfig)

    await provider.close()
    expect(provider.isConnected()).toBe(false)
  })

  it('send 未连接时应返回 NOT_INITIALIZED', async () => {
    const result = await provider.send({
      provider: 'webhook',
      to: 'user@example.com',
      body: 'test',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReachErrorCode.NOT_INITIALIZED)
    }
  })

  it('send 成功应返回正确结果', async () => {
    await provider.connect({
      name: 'webhook',
      type: 'api',
      url: 'https://api.example.com/notify',
      method: 'POST',
      timeout: 10000,
    } as ProviderConfig)

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ messageId: 'api-msg-001' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await provider.send({
      provider: 'webhook',
      to: 'user@example.com',
      subject: '通知',
      body: '测试内容',
      extra: { customField: 'value' },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.success).toBe(true)
      expect(result.data.messageId).toBe('api-msg-001')
    }
  })

  it('send 应发送正确的 JSON payload', async () => {
    await provider.connect({
      name: 'webhook',
      type: 'api',
      url: 'https://api.example.com/notify',
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
      timeout: 5000,
    } as ProviderConfig)

    let capturedBody: unknown
    let capturedHeaders: Record<string, string> = {}
    let capturedMethod: string = ''

    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (_url, init) => {
      capturedBody = JSON.parse(init!.body as string)
      capturedMethod = init!.method as string
      capturedHeaders = init!.headers as Record<string, string>
      return new Response(JSON.stringify({ messageId: 'test-msg' }), { status: 200 })
    })

    await provider.send({
      provider: 'webhook',
      to: 'user@example.com',
      subject: '主题',
      body: '正文',
      template: 'tpl1',
      vars: { key: 'value' },
      extra: { custom: true },
    })

    expect(capturedMethod).toBe('POST')
    expect(capturedHeaders).toHaveProperty('Authorization', 'Bearer test-token')
    expect(capturedHeaders).toHaveProperty('Content-Type', 'application/json')
    expect(capturedBody).toEqual({
      to: 'user@example.com',
      subject: '主题',
      body: '正文',
      template: 'tpl1',
      vars: { key: 'value' },
      extra: { custom: true },
    })
  })

  it('send HTTP 非 200 应返回 SEND_FAILED', async () => {
    await provider.connect({
      name: 'webhook',
      type: 'api',
      url: 'https://api.example.com/notify',
      method: 'POST',
      timeout: 10000,
    } as ProviderConfig)

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    )

    const result = await provider.send({
      provider: 'webhook',
      to: 'user@example.com',
      body: 'test',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReachErrorCode.SEND_FAILED)
    }
  })

  it('send 网络错误应返回 SEND_FAILED', async () => {
    await provider.connect({
      name: 'webhook',
      type: 'api',
      url: 'https://api.example.com/notify',
      method: 'POST',
      timeout: 10000,
    } as ProviderConfig)

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'))

    const result = await provider.send({
      provider: 'webhook',
      to: 'user@example.com',
      body: 'test',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(ReachErrorCode.SEND_FAILED)
    }
  })

  it('name 属性应为 api', () => {
    expect(provider.name).toBe('api')
  })
})
