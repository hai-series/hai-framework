import { HaiCommonError } from '@h-ai/core'
/**
 * =============================================================================
 * @h-ai/kit - Response 测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import {
  badRequest,
  conflict,
  created,
  error,
  forbidden,
  fromError,
  fromResult,
  internalError,
  noContent,
  notFound,
  ok,
  redirect,
  unauthorized,
  validationError,
} from '../src/kit-response.js'

describe('response Helpers', () => {
  it('未分类错误和非法状态统一返回安全500，显式业务状态仍可映射', async () => {
    for (const response of [
      fromError({ code: 'unknown', message: 'SELECT private_data' }),
      fromResult({
        success: false,
        error: { code: 'unknown', message: 'SELECT private_data' },
      }),
      error('unknown', 'SELECT private_data', 200, undefined, { detail: 'private detail' }),
    ]) {
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error.httpStatus).toBe(500)
      expect(JSON.stringify(body)).not.toContain('private')
      expect(JSON.stringify(body)).not.toContain('SELECT')
    }
    const business = fromResult({
      success: false,
      error: { code: 'missing', message: '文件不存在' },
    }, { missing: 404 })
    expect(business.status).toBe(404)
    expect((await business.json()).error.message).toContain('文件不存在')
  })
  it('非法追踪编号不会原样返回，公开编号与响应头保持一致', async () => {
    const response = fromError({ code: 'app:failed', message: 'Invalid input', httpStatus: 400 }, 'invalid\ntrace')
    const body = await response.json()
    expect(body.requestId).toBe(body.error.traceId)
    expect(response.headers.get('X-Trace-Id')).toBe(body.requestId)
    expect(body.requestId).toMatch(/^[\w.:-]{1,128}$/)
  })
  it('模块失败保留安全字段校验和公开上下文', async () => {
    const response = fromResult({
      success: false,
      error: {
        code: 'app:validation',
        message: '请检查邮箱',
        httpStatus: 422,
        cause: [
          { field: 'email', message: '邮箱格式不正确', rejectedValue: 'private@example.com' },
        ],
        ext: { privateNote: 'internal only' },
        publicExt: { retryable: false },
      },
    }, undefined, 'validation-1')
    const body = await response.json()
    expect(response.status).toBe(422)
    expect(body.error).toMatchObject({
      code: 'app:validation',
      httpStatus: 422,
      traceId: 'validation-1',
      cause: [
        { field: 'email', message: '邮箱格式不正确' },
      ],
      ext: { retryable: false },
    })
    expect(JSON.stringify(body)).not.toContain('private@example.com')
    expect(JSON.stringify(body)).not.toContain('internal only')
    expect(response.headers.get('X-Trace-Id')).toBe(body.error.traceId)
  })

  it('模块内部错误仅显示安全提示且保留追踪编号', async () => {
    const response = fromError({
      code: 'app:storage',
      message: 'SELECT secret FROM private_table',
      httpStatus: 500,
      cause: new Error('Database password is private'),
      ext: { secret: 'internal only' },
    }, 'storage-1')
    const body = await response.json()
    expect(response.status).toBe(500)
    expect(body.error.httpStatus).toBe(500)
    expect(body.error.traceId).toBe('storage-1')
    expect(body.error.cause).toBeUndefined()
    expect(body.error.ext).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('private')
    expect(JSON.stringify(body)).not.toContain('SELECT')
  })

  describe('ok', () => {
    it('应该创建 200 响应', async () => {
      const response = ok({ message: 'hello' }, 'req123')

      expect(response.status).toBe(200)

      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.data).toEqual({ message: 'hello' })
      expect(body.requestId).toBe('req123')
    })
  })

  describe('created', () => {
    it('应该创建 201 响应', async () => {
      const response = created({ id: '1' })

      expect(response.status).toBe(201)

      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.data).toEqual({ id: '1' })
    })
  })

  describe('noContent', () => {
    it('应该创建 204 响应', () => {
      const response = noContent()

      expect(response.status).toBe(204)
    })
  })

  describe('error', () => {
    it('应该创建错误响应', async () => {
      const response = error('TEST_ERROR', 'Test message', 400, 'req123', { extra: 'data' })

      expect(response.status).toBe(400)

      const body = await response.json()
      expect(body.success).toBe(false)
      expect(body.error.code).toBe('TEST_ERROR')
      expect(body.error.message).toBe('Test message (traceId: req123)')
      expect(body.error.traceId).toBe('req123')
      expect(body.error.details).toEqual({ extra: 'data' })
    })
  })

  describe('badRequest', () => {
    it('应该创建 400 响应', async () => {
      const response = badRequest('Invalid input')

      expect(response.status).toBe(400)

      const body = await response.json()
      expect(body.error.code).toBe(HaiCommonError.INVALID_REQUEST.code)
    })
  })

  describe('unauthorized', () => {
    it('应该创建 401 响应', async () => {
      const response = unauthorized()

      expect(response.status).toBe(401)

      const body = await response.json()
      expect(body.error.code).toBe(HaiCommonError.UNAUTHORIZED.code)
    })
  })

  describe('forbidden', () => {
    it('应该创建 403 响应', async () => {
      const response = forbidden()

      expect(response.status).toBe(403)

      const body = await response.json()
      expect(body.error.code).toBe(HaiCommonError.FORBIDDEN.code)
    })
  })

  describe('notFound', () => {
    it('应该创建 404 响应', async () => {
      const response = notFound('User not found')

      expect(response.status).toBe(404)

      const body = await response.json()
      expect(body.error.message).toMatch(/^User not found \(traceId:/)
    })
  })

  describe('conflict', () => {
    it('应该创建 409 响应', async () => {
      const response = conflict('Resource already exists')

      expect(response.status).toBe(409)

      const body = await response.json()
      expect(body.error.code).toBe(HaiCommonError.CONFLICT.code)
    })
  })

  describe('validationError', () => {
    it('仅公开字段和提示，不回显结构兼容对象中的输入值或SQL', async () => {
      const issues = [
        {
          field: 'email',
          message: 'Invalid email',
          rejectedValue: 'private@example.com',
          sql: 'SELECT secret',
        },
      ]
      const response = validationError(issues)
      const body = await response.json()
      expect(body.error.cause).toEqual([
        { field: 'email', message: 'Invalid email' },
      ])
      expect(body.error.details).toBeUndefined()
      expect(JSON.stringify(body)).not.toContain('private@example.com')
      expect(JSON.stringify(body)).not.toContain('SELECT')
    })
    it('应该创建 422 响应并包含错误详情', async () => {
      const errors = [
        { field: 'email', message: 'Invalid email' },
        { field: 'password', message: 'Too short' },
      ]

      const response = validationError(errors, 'req123')

      expect(response.status).toBe(422)

      const body = await response.json()
      expect(body.error.code).toBe(HaiCommonError.VALIDATION_ERROR.code)
      expect(body.error.cause).toEqual(errors)
    })
  })

  describe('internalError', () => {
    it('应该创建 500 响应', async () => {
      const response = internalError()

      expect(response.status).toBe(500)

      const body = await response.json()
      expect(body.error.code).toBe(HaiCommonError.INTERNAL_ERROR.code)
    })
  })

  describe('redirect', () => {
    it('应该创建重定向响应', () => {
      const response = redirect('/dashboard')

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe('/dashboard')
    })

    it('应该支持不同的重定向状态码', () => {
      const response = redirect('/permanent', 301)

      expect(response.status).toBe(301)
    })
  })
})
