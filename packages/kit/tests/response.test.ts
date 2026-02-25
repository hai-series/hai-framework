/**
 * =============================================================================
 * @hai/kit - Response 测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import {
  badRequest,
  conflict,
  created,
  error,
  forbidden,
  internalError,
  noContent,
  notFound,
  ok,
  redirect,
  unauthorized,
  validationError,
} from '../src/kit-response.js'

describe('response Helpers', () => {
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
      expect(body.error.message).toBe('Test message')
      expect(body.error.details).toEqual({ extra: 'data' })
    })
  })

  describe('badRequest', () => {
    it('应该创建 400 响应', async () => {
      const response = badRequest('Invalid input')

      expect(response.status).toBe(400)

      const body = await response.json()
      expect(body.error.code).toBe('BAD_REQUEST')
    })
  })

  describe('unauthorized', () => {
    it('应该创建 401 响应', async () => {
      const response = unauthorized()

      expect(response.status).toBe(401)

      const body = await response.json()
      expect(body.error.code).toBe('UNAUTHORIZED')
    })
  })

  describe('forbidden', () => {
    it('应该创建 403 响应', async () => {
      const response = forbidden()

      expect(response.status).toBe(403)

      const body = await response.json()
      expect(body.error.code).toBe('FORBIDDEN')
    })
  })

  describe('notFound', () => {
    it('应该创建 404 响应', async () => {
      const response = notFound('User not found')

      expect(response.status).toBe(404)

      const body = await response.json()
      expect(body.error.message).toBe('User not found')
    })
  })

  describe('conflict', () => {
    it('应该创建 409 响应', async () => {
      const response = conflict('Resource already exists')

      expect(response.status).toBe(409)

      const body = await response.json()
      expect(body.error.code).toBe('CONFLICT')
    })
  })

  describe('validationError', () => {
    it('应该创建 422 响应并包含错误详情', async () => {
      const errors = [
        { field: 'email', message: 'Invalid email' },
        { field: 'password', message: 'Too short' },
      ]

      const response = validationError(errors, 'req123')

      expect(response.status).toBe(422)

      const body = await response.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
      expect(body.error.details.errors).toEqual(errors)
    })
  })

  describe('internalError', () => {
    it('应该创建 500 响应', async () => {
      const response = internalError()

      expect(response.status).toBe(500)

      const body = await response.json()
      expect(body.error.code).toBe('INTERNAL_ERROR')
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
