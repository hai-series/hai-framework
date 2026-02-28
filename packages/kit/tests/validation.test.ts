/**
 * =============================================================================
 * @h-ai/kit - Validation 测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { validateForm, validateFormOrFail, validateParams, validateParamsOrFail, validateQuery, validateQueryOrFail } from '../src/kit-validation.js'

describe('validateForm', () => {
  const userSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    age: z.coerce.number().min(0).optional(),
  })

  it('应该验证 JSON 请求体', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'John', email: 'john@example.com' }),
    })

    const result = await validateForm(request, userSchema)

    expect(result.valid).toBe(true)
    expect(result.data).toEqual({ name: 'John', email: 'john@example.com' })
    expect(result.errors).toEqual([])
  })

  it('应该返回验证错误', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', email: 'invalid' }),
    })

    const result = await validateForm(request, userSchema)

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    // 空字符串会触发 min(1) 错误，无效邮箱会触发 email 错误
  })

  it('应该验证 FormData', async () => {
    const formData = new FormData()
    formData.append('name', 'John')
    formData.append('email', 'john@example.com')
    formData.append('age', '25')

    const request = new Request('http://localhost', {
      method: 'POST',
      body: formData,
    })

    const result = await validateForm(request, userSchema)

    expect(result.valid).toBe(true)
    expect(result.data?.name).toBe('John')
    expect(result.data?.age).toBe(25)
  })

  it('应该处理不支持的 content-type', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'plain text',
    })

    const result = await validateForm(request, userSchema)

    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.message.includes('Unsupported'))).toBe(true)
  })
})

describe('validateQuery', () => {
  const querySchema = z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(10),
    search: z.string().optional(),
  })

  it('应该验证查询参数', () => {
    const url = new URL('http://localhost?page=2&limit=20&search=test')

    const result = validateQuery(url, querySchema)

    expect(result.valid).toBe(true)
    expect(result.data).toEqual({ page: 2, limit: 20, search: 'test' })
  })

  it('应该使用默认值', () => {
    const url = new URL('http://localhost')

    const result = validateQuery(url, querySchema)

    expect(result.valid).toBe(true)
    expect(result.data?.page).toBe(1)
    expect(result.data?.limit).toBe(10)
  })

  it('应该返回验证错误', () => {
    // 使用一个更严格的 schema 来确保产生错误
    const strictSchema = z.object({
      page: z.coerce.number().min(1),
      limit: z.coerce.number().min(1).max(100),
    })
    const url = new URL('http://localhost?page=0&limit=200')

    const result = validateQuery(url, strictSchema)

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

describe('validateParams', () => {
  const paramsSchema = z.object({
    id: z.string().uuid(),
    slug: z.string().min(1),
  })

  it('应该验证路径参数', () => {
    const params = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      slug: 'hello-world',
    }

    const result = validateParams(params, paramsSchema)

    expect(result.valid).toBe(true)
    expect(result.data).toEqual(params)
  })

  it('应该返回验证错误', () => {
    const params = {
      id: 'not-a-uuid',
      slug: '',
    }

    const result = validateParams(params, paramsSchema)

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

// =============================================================================
// OrFail 变体
// =============================================================================

describe('validateFormOrFail', () => {
  const schema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
  })

  it('校验通过时返回数据', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'John', email: 'john@example.com' }),
    })

    const data = await validateFormOrFail(request, schema)
    expect(data).toEqual({ name: 'John', email: 'john@example.com' })
  })

  it('校验失败时 throw 400 Response', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', email: 'invalid' }),
    })

    try {
      await validateFormOrFail(request, schema)
      expect.fail('Should have thrown')
    }
    catch (error) {
      expect(error).toBeInstanceOf(Response)
      expect((error as Response).status).toBe(400)
    }
  })
})

describe('validateQueryOrFail', () => {
  const schema = z.object({
    page: z.coerce.number().min(1),
    limit: z.coerce.number().min(1).max(100),
  })

  it('校验通过时返回数据', () => {
    const url = new URL('http://localhost?page=2&limit=50')
    const data = validateQueryOrFail(url, schema)
    expect(data).toEqual({ page: 2, limit: 50 })
  })

  it('校验失败时 throw 400 Response', () => {
    const url = new URL('http://localhost?page=0&limit=200')

    expect(() => validateQueryOrFail(url, schema)).toThrow()
    try {
      validateQueryOrFail(url, schema)
    }
    catch (error) {
      expect(error).toBeInstanceOf(Response)
      expect((error as Response).status).toBe(400)
    }
  })
})

describe('validateParamsOrFail', () => {
  const schema = z.object({
    id: z.string().uuid(),
  })

  it('校验通过时返回数据', () => {
    const params = { id: '550e8400-e29b-41d4-a716-446655440000' }
    const data = validateParamsOrFail(params, schema)
    expect(data).toEqual(params)
  })

  it('校验失败时 throw 400 Response', () => {
    const params = { id: 'not-a-uuid' }

    expect(() => validateParamsOrFail(params, schema)).toThrow()
    try {
      validateParamsOrFail(params, schema)
    }
    catch (error) {
      expect(error).toBeInstanceOf(Response)
      expect((error as Response).status).toBe(400)
    }
  })
})
