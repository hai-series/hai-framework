/**
 * =============================================================================
 * @hai/core - 错误处理单元测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import {
    AppError,
    ErrorCode,
    internalError,
    notFoundError,
    unauthenticatedError,
    unauthorizedError,
    validationError,
} from '../src/error.js'

describe('error', () => {
    describe('AppError', () => {
        it('should create error with code and message', () => {
            const error = new AppError(ErrorCode.NOT_FOUND, 'Resource not found')
            expect(error.code).toBe(ErrorCode.NOT_FOUND)
            expect(error.message).toBe('Resource not found')
            expect(error.name).toBe('AppError')
            expect(error.httpStatus).toBe(404)
        })

        it('should create error with details', () => {
            const error = new AppError(
                ErrorCode.VALIDATION,
                'Invalid input',
                { field: 'email', expected: 'valid email' },
            )
            expect(error.details).toEqual({ field: 'email', expected: 'valid email' })
        })

        it('should create error with cause', () => {
            const cause = new Error('Original error')
            const error = new AppError(
                ErrorCode.INTERNAL,
                'Wrapped error',
                undefined,
                cause,
            )
            expect(error.cause).toBe(cause)
        })

        it('should create error with traceId', () => {
            const error = new AppError(
                ErrorCode.UNKNOWN,
                'Unknown error',
                undefined,
                undefined,
                'trace_123',
            )
            expect(error.traceId).toBe('trace_123')
        })

        it('should have timestamp', () => {
            const before = new Date()
            const error = new AppError(ErrorCode.UNKNOWN, 'test')
            const after = new Date()

            expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime())
            expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime())
        })

        it('should map error codes to HTTP status', () => {
            const testCases: [ErrorCode, number][] = [
                [ErrorCode.VALIDATION, 400],
                [ErrorCode.UNAUTHENTICATED, 401],
                [ErrorCode.UNAUTHORIZED, 403],
                [ErrorCode.NOT_FOUND, 404],
                [ErrorCode.CONFLICT, 409],
                [ErrorCode.RATE_LIMITED, 429],
                [ErrorCode.INTERNAL, 500],
                [ErrorCode.SERVICE_UNAVAILABLE, 503],
            ]

            for (const [code, expectedStatus] of testCases) {
                const error = new AppError(code, 'test')
                expect(error.httpStatus).toBe(expectedStatus)
            }
        })
    })

    describe('toJSON', () => {
        it('should serialize basic error', () => {
            const error = new AppError(ErrorCode.NOT_FOUND, 'Not found')
            const json = error.toJSON()

            expect(json.code).toBe(ErrorCode.NOT_FOUND)
            expect(json.message).toBe('Not found')
            expect(json.timestamp).toBeDefined()
        })

        it('should serialize error with details', () => {
            const error = new AppError(
                ErrorCode.VALIDATION,
                'Invalid',
                { field: 'name' },
            )
            const json = error.toJSON()

            expect(json.details).toEqual({ field: 'name' })
        })

        it('should serialize error with traceId', () => {
            const error = new AppError(
                ErrorCode.INTERNAL,
                'Internal',
                undefined,
                undefined,
                'trace_abc',
            )
            const json = error.toJSON()

            expect(json.traceId).toBe('trace_abc')
        })

        it('should serialize nested AppError cause', () => {
            const cause = new AppError(ErrorCode.DATABASE, 'DB error')
            const error = new AppError(
                ErrorCode.INTERNAL,
                'Wrapped',
                undefined,
                cause,
            )
            const json = error.toJSON()

            expect(json.cause).toBeDefined()
            expect((json.cause as { code: number }).code).toBe(ErrorCode.DATABASE)
        })

        it('should serialize regular Error cause', () => {
            const cause = new Error('Regular error')
            const error = new AppError(
                ErrorCode.INTERNAL,
                'Wrapped',
                undefined,
                cause,
            )
            const json = error.toJSON()

            expect(json.cause).toBe('Regular error')
        })
    })

    describe('fromJSON', () => {
        it('should deserialize error', () => {
            const original = new AppError(
                ErrorCode.VALIDATION,
                'Invalid',
                { field: 'email' },
                undefined,
                'trace_xyz',
            )
            const json = original.toJSON()
            const restored = AppError.fromJSON(json)

            expect(restored.code).toBe(original.code)
            expect(restored.message).toBe(original.message)
            expect(restored.details).toEqual(original.details)
            expect(restored.traceId).toBe(original.traceId)
        })
    })

    describe('wrap', () => {
        it('should return AppError unchanged', () => {
            const error = new AppError(ErrorCode.NOT_FOUND, 'Not found')
            const wrapped = AppError.wrap(error)
            expect(wrapped).toBe(error)
        })

        it('should add traceId to existing AppError', () => {
            const error = new AppError(ErrorCode.NOT_FOUND, 'Not found')
            const wrapped = AppError.wrap(error, undefined, undefined, undefined, 'trace_new')
            expect(wrapped.traceId).toBe('trace_new')
        })

        it('should wrap regular Error', () => {
            const error = new Error('Regular error')
            const wrapped = AppError.wrap(error, ErrorCode.INTERNAL)

            expect(wrapped).toBeInstanceOf(AppError)
            expect(wrapped.code).toBe(ErrorCode.INTERNAL)
            expect(wrapped.message).toBe('Regular error')
            expect(wrapped.cause).toBe(error)
        })

        it('should wrap with custom message', () => {
            const error = new Error('Original')
            const wrapped = AppError.wrap(error, ErrorCode.INTERNAL, 'Custom message')

            expect(wrapped.message).toBe('Custom message')
        })

        it('should wrap unknown type', () => {
            const wrapped = AppError.wrap('string error', ErrorCode.UNKNOWN)

            expect(wrapped).toBeInstanceOf(AppError)
            expect(wrapped.message).toBe('string error')
        })
    })

    describe('factory functions', () => {
        it('should create validation error', () => {
            const error = validationError('Invalid email', 'email', { format: 'xxx' })

            expect(error.code).toBe(ErrorCode.VALIDATION)
            expect(error.message).toBe('Invalid email')
            expect(error.details?.field).toBe('email')
            expect(error.details?.format).toBe('xxx')
        })

        it('should create not found error', () => {
            const error = notFoundError('User', 123)

            expect(error.code).toBe(ErrorCode.NOT_FOUND)
            expect(error.message).toBe('User with id \'123\' not found')
            expect(error.details?.resource).toBe('User')
            expect(error.details?.id).toBe(123)
        })

        it('should create not found error without id', () => {
            const error = notFoundError('Configuration')

            expect(error.message).toBe('Configuration not found')
        })

        it('should create unauthenticated error', () => {
            const error = unauthenticatedError()

            expect(error.code).toBe(ErrorCode.UNAUTHENTICATED)
            expect(error.message).toBe('Authentication required')
        })

        it('should create unauthenticated error with custom message', () => {
            const error = unauthenticatedError('Token expired')

            expect(error.message).toBe('Token expired')
        })

        it('should create unauthorized error', () => {
            const error = unauthorizedError()

            expect(error.code).toBe(ErrorCode.UNAUTHORIZED)
            expect(error.message).toBe('Permission denied')
        })

        it('should create internal error', () => {
            const cause = new Error('DB connection failed')
            const error = internalError('Database error', cause, 'trace_123')

            expect(error.code).toBe(ErrorCode.INTERNAL)
            expect(error.message).toBe('Database error')
            expect(error.cause).toBe(cause)
            expect(error.traceId).toBe('trace_123')
        })
    })
})
