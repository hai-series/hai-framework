import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { localizeZodError, resolveRequestLocale, validateInputOrFail } from '../src/serv-validation.js'

describe('serv-validation', () => {
  it('resolveRequestLocale 应该优先使用 x-hai-locale', () => {
    const locale = resolveRequestLocale({
      'x-hai-locale': 'en-US',
      'accept-language': 'zh-CN,zh;q=0.9',
    })

    expect(locale).toBe('en-US')
  })

  it('resolveRequestLocale 应该把简写 en 规范化为 en-US', () => {
    const locale = resolveRequestLocale({
      'accept-language': 'en,en;q=0.9',
    })

    expect(locale).toBe('en-US')
  })

  it('localizeZodError 应该本地化 Zod 默认英文错误', () => {
    const result = z.object({ email: z.string().email() }).safeParse({ email: 'bad' })

    expect(result.success).toBe(false)
    if (result.success)
      return

    expect(localizeZodError(result.error, 'zh-CN')).toEqual([
      { field: 'email', message: '请输入有效的邮箱地址' },
    ])
  })

  it('没有业务消息的 refine 使用请求 locale，不保留 Zod 默认英文', () => {
    const result = z.object({ key: z.string().refine(() => false) }).safeParse({ key: '../private' })
    if (result.success)
      throw new Error('Expected default refinement failure')
    expect(localizeZodError(result.error, 'zh-CN')).toEqual([{ field: 'key', message: '输入格式无效' }])
    expect(localizeZodError(result.error, 'en-US')).toEqual([{ field: 'key', message: 'Invalid input format' }])
  })

  it('validateInputOrFail 应该保留 schema 自定义错误消息', () => {
    const result = validateInputOrFail(
      z.object({ name: z.string().min(3, '名字太短') }),
      { name: 'a' },
      'zh-CN',
    )

    expect(result.success).toBe(false)
    if (result.success)
      return

    expect(result.error.message).toBe('数据验证失败')
    expect(result.error.cause).toEqual([
      { field: 'name', message: '名字太短' },
    ])
  })
})
