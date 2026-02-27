/**
 * =============================================================================
 * @h-ai/reach - 配置 Schema 测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { ReachConfigSchema, ReachErrorCode } from '../src/index.js'

describe('reach config', () => {
  it('console 配置应正确解析', () => {
    const result = ReachConfigSchema.safeParse({ type: 'console' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.type).toBe('console')
    }
  })

  it('smtp 配置应正确解析并补齐默认值', () => {
    const result = ReachConfigSchema.safeParse({
      type: 'smtp',
      host: 'smtp.example.com',
      from: 'no-reply@example.com',
    })
    expect(result.success).toBe(true)
    if (result.success && result.data.type === 'smtp') {
      expect(result.data.host).toBe('smtp.example.com')
      expect(result.data.port).toBe(465)
      expect(result.data.secure).toBe(true)
      expect(result.data.from).toBe('no-reply@example.com')
    }
  })

  it('aliyun-sms 配置应正确解析并补齐默认值', () => {
    const result = ReachConfigSchema.safeParse({
      type: 'aliyun-sms',
      accessKeyId: 'LTAI_test',
      accessKeySecret: 'secret_test',
      signName: '测试签名',
    })
    expect(result.success).toBe(true)
    if (result.success && result.data.type === 'aliyun-sms') {
      expect(result.data.accessKeyId).toBe('LTAI_test')
      expect(result.data.signName).toBe('测试签名')
      expect(result.data.endpoint).toBe('dysmsapi.aliyuncs.com')
    }
  })

  it('无效 type 应校验失败', () => {
    const result = ReachConfigSchema.safeParse({ type: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('smtp 缺少必填字段应校验失败', () => {
    const result = ReachConfigSchema.safeParse({
      type: 'smtp',
      host: '',
      from: 'test@example.com',
    })
    expect(result.success).toBe(false)
  })

  it('aliyun-sms 缺少必填字段应校验失败', () => {
    const result = ReachConfigSchema.safeParse({
      type: 'aliyun-sms',
      accessKeyId: '',
      accessKeySecret: 'secret',
      signName: '签名',
    })
    expect(result.success).toBe(false)
  })

  it('错误码应正确定义', () => {
    expect(ReachErrorCode.SEND_FAILED).toBe(8000)
    expect(ReachErrorCode.NOT_INITIALIZED).toBe(8010)
    expect(ReachErrorCode.TEMPLATE_NOT_FOUND).toBe(8001)
    expect(ReachErrorCode.CONFIG_ERROR).toBe(8012)
  })
})
