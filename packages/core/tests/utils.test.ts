/**
 * =============================================================================
 * @hai/core - 工具函数单元测试
 * =============================================================================
 */

import { describe, expect, it, vi } from 'vitest'
import {
    camelCase,
    capitalize,
    chunk,
    deepClone,
    deepMerge,
    delay,
    formatDate,
    generateId,
    generateRequestId,
    generateShortId,
    generateTraceId,
    groupBy,
    isDefined,
    isFunction,
    isObject,
    isPromise,
    kebabCase,
    omit,
    pick,
    retry,
    timeAgo,
    truncate,
    unique,
    withTimeout,
} from '../src/utils.js'

describe('utils', () => {
    describe('ID generation', () => {
        describe('generateId', () => {
            it('should generate ID with default length', () => {
                const id = generateId()
                expect(id).toHaveLength(21)
            })

            it('should generate ID with custom length', () => {
                const id = generateId(10)
                expect(id).toHaveLength(10)
            })

            it('should generate unique IDs', () => {
                const ids = new Set(Array.from({ length: 100 }, () => generateId()))
                expect(ids.size).toBe(100)
            })
        })

        describe('generateShortId', () => {
            it('should generate short ID', () => {
                const id = generateShortId()
                expect(id).toHaveLength(8)
            })
        })

        describe('generateTraceId', () => {
            it('should generate trace ID with prefix', () => {
                const id = generateTraceId()
                expect(id).toMatch(/^trace_/)
                expect(id).toHaveLength(22) // 'trace_' + 16 chars
            })
        })

        describe('generateRequestId', () => {
            it('should generate request ID with prefix', () => {
                const id = generateRequestId()
                expect(id).toMatch(/^req_/)
                expect(id).toHaveLength(16) // 'req_' + 12 chars
            })
        })
    })

    describe('type utilities', () => {
        describe('isDefined', () => {
            it('should return true for defined values', () => {
                expect(isDefined(0)).toBe(true)
                expect(isDefined('')).toBe(true)
                expect(isDefined(false)).toBe(true)
                expect(isDefined({})).toBe(true)
            })

            it('should return false for null and undefined', () => {
                expect(isDefined(null)).toBe(false)
                expect(isDefined(undefined)).toBe(false)
            })
        })

        describe('isObject', () => {
            it('should return true for objects', () => {
                expect(isObject({})).toBe(true)
                expect(isObject({ a: 1 })).toBe(true)
            })

            it('should return false for non-objects', () => {
                expect(isObject(null)).toBe(false)
                expect(isObject([])).toBe(false)
                expect(isObject('string')).toBe(false)
                expect(isObject(123)).toBe(false)
            })
        })

        describe('isFunction', () => {
            it('should return true for functions', () => {
                expect(isFunction(() => { })).toBe(true)
                expect(isFunction(function () { })).toBe(true)
                expect(isFunction(async () => { })).toBe(true)
            })

            it('should return false for non-functions', () => {
                expect(isFunction({})).toBe(false)
                expect(isFunction(null)).toBe(false)
            })
        })

        describe('isPromise', () => {
            it('should return true for promises', () => {
                expect(isPromise(Promise.resolve())).toBe(true)
                expect(isPromise(new Promise(() => { }))).toBe(true)
            })

            it('should return true for thenable objects', () => {
                expect(isPromise({ then: () => { } })).toBe(true)
            })

            it('should return false for non-promises', () => {
                expect(isPromise({})).toBe(false)
                expect(isPromise(null)).toBe(false)
            })
        })
    })

    describe('object utilities', () => {
        describe('deepClone', () => {
            it('should clone primitive values', () => {
                expect(deepClone(123)).toBe(123)
                expect(deepClone('str')).toBe('str')
                expect(deepClone(null)).toBe(null)
            })

            it('should clone objects', () => {
                const obj = { a: 1, b: { c: 2 } }
                const cloned = deepClone(obj)

                expect(cloned).toEqual(obj)
                expect(cloned).not.toBe(obj)
                expect(cloned.b).not.toBe(obj.b)
            })

            it('should clone arrays', () => {
                const arr = [1, [2, 3], { a: 4 }]
                const cloned = deepClone(arr)

                expect(cloned).toEqual(arr)
                expect(cloned).not.toBe(arr)
                expect(cloned[1]).not.toBe(arr[1])
            })

            it('should clone dates', () => {
                const date = new Date()
                const cloned = deepClone(date)

                expect(cloned).toEqual(date)
                expect(cloned).not.toBe(date)
            })
        })

        describe('deepMerge', () => {
            it('should merge objects', () => {
                const target = { a: 1, b: { c: 2 } }
                const source = { b: { d: 3 }, e: 4 }

                const result = deepMerge(target, source)

                expect(result).toEqual({ a: 1, b: { c: 2, d: 3 }, e: 4 })
            })

            it('should not mutate original objects', () => {
                const target = { a: 1 }
                const source = { b: 2 }

                deepMerge(target, source)

                expect(target).toEqual({ a: 1 })
            })

            it('should merge multiple sources', () => {
                const target = { a: 1 }
                const source1 = { b: 2 }
                const source2 = { c: 3 }

                const result = deepMerge(target, source1, source2)

                expect(result).toEqual({ a: 1, b: 2, c: 3 })
            })
        })

        describe('pick', () => {
            it('should pick specified keys', () => {
                const obj = { a: 1, b: 2, c: 3 }
                const result = pick(obj, ['a', 'c'])

                expect(result).toEqual({ a: 1, c: 3 })
            })

            it('should ignore missing keys', () => {
                const obj = { a: 1 }
                const result = pick(obj, ['a', 'b' as keyof typeof obj])

                expect(result).toEqual({ a: 1 })
            })
        })

        describe('omit', () => {
            it('should omit specified keys', () => {
                const obj = { a: 1, b: 2, c: 3 }
                const result = omit(obj, ['b'])

                expect(result).toEqual({ a: 1, c: 3 })
            })
        })
    })

    describe('string utilities', () => {
        describe('capitalize', () => {
            it('should capitalize first letter', () => {
                expect(capitalize('hello')).toBe('Hello')
                expect(capitalize('HELLO')).toBe('HELLO')
                expect(capitalize('')).toBe('')
            })
        })

        describe('kebabCase', () => {
            it('should convert to kebab case', () => {
                expect(kebabCase('helloWorld')).toBe('hello-world')
                expect(kebabCase('HelloWorld')).toBe('hello-world')
                expect(kebabCase('hello world')).toBe('hello-world')
                expect(kebabCase('hello_world')).toBe('hello-world')
            })
        })

        describe('camelCase', () => {
            it('should convert to camel case', () => {
                expect(camelCase('hello-world')).toBe('helloWorld')
                expect(camelCase('hello_world')).toBe('helloWorld')
                expect(camelCase('hello world')).toBe('helloWorld')
                expect(camelCase('Hello-World')).toBe('helloWorld')
            })
        })

        describe('truncate', () => {
            it('should truncate long strings', () => {
                expect(truncate('Hello World', 8)).toBe('Hello...')
            })

            it('should not truncate short strings', () => {
                expect(truncate('Hello', 10)).toBe('Hello')
            })

            it('should use custom suffix', () => {
                expect(truncate('Hello World', 8, '…')).toBe('Hello W…')
            })
        })
    })

    describe('array utilities', () => {
        describe('unique', () => {
            it('should remove duplicates', () => {
                expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3])
            })
        })

        describe('groupBy', () => {
            it('should group by key function', () => {
                const items = [
                    { type: 'a', value: 1 },
                    { type: 'b', value: 2 },
                    { type: 'a', value: 3 },
                ]

                const result = groupBy(items, item => item.type)

                expect(result).toEqual({
                    a: [{ type: 'a', value: 1 }, { type: 'a', value: 3 }],
                    b: [{ type: 'b', value: 2 }],
                })
            })
        })

        describe('chunk', () => {
            it('should split array into chunks', () => {
                expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
                expect(chunk([1, 2, 3], 3)).toEqual([[1, 2, 3]])
                expect(chunk([], 2)).toEqual([])
            })
        })
    })

    describe('async utilities', () => {
        describe('delay', () => {
            it('should delay execution', async () => {
                const start = Date.now()
                await delay(100)
                const elapsed = Date.now() - start

                expect(elapsed).toBeGreaterThanOrEqual(90)
            })
        })

        describe('withTimeout', () => {
            it('should resolve if within timeout', async () => {
                const result = await withTimeout(Promise.resolve('success'), 1000)
                expect(result).toBe('success')
            })

            it('should reject if timeout exceeded', async () => {
                await expect(
                    withTimeout(delay(1000), 50, 'Timed out!'),
                ).rejects.toThrow('Timed out!')
            })
        })

        describe('retry', () => {
            it('should succeed on first try', async () => {
                const fn = vi.fn().mockResolvedValue('success')

                const result = await retry(fn)

                expect(result).toBe('success')
                expect(fn).toHaveBeenCalledTimes(1)
            })

            it('should retry on failure', async () => {
                const fn = vi.fn()
                    .mockRejectedValueOnce(new Error('fail'))
                    .mockRejectedValueOnce(new Error('fail'))
                    .mockResolvedValue('success')

                const result = await retry(fn, { maxAttempts: 3, delayMs: 10 })

                expect(result).toBe('success')
                expect(fn).toHaveBeenCalledTimes(3)
            })

            it('should throw after max attempts', async () => {
                const fn = vi.fn().mockRejectedValue(new Error('always fails'))

                await expect(
                    retry(fn, { maxAttempts: 2, delayMs: 10 }),
                ).rejects.toThrow('always fails')

                expect(fn).toHaveBeenCalledTimes(2)
            })

            it('should call onRetry callback', async () => {
                const fn = vi.fn()
                    .mockRejectedValueOnce(new Error('fail'))
                    .mockResolvedValue('success')

                const onRetry = vi.fn()

                await retry(fn, { maxAttempts: 3, delayMs: 10, onRetry })

                expect(onRetry).toHaveBeenCalledTimes(1)
                expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1)
            })
        })
    })

    describe('time utilities', () => {
        describe('formatDate', () => {
            it('should format date with default format', () => {
                const date = new Date('2024-01-15T10:30:45.123Z')
                const formatted = formatDate(date)

                expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
            })

            it('should format with custom format', () => {
                const date = new Date('2024-01-15T10:30:45.123Z')

                expect(formatDate(date, 'YYYY/MM/DD')).toMatch(/^\d{4}\/\d{2}\/\d{2}$/)
                expect(formatDate(date, 'HH:mm')).toMatch(/^\d{2}:\d{2}$/)
            })
        })

        describe('timeAgo', () => {
            it('should return relative time', () => {
                const now = new Date()

                expect(timeAgo(now)).toBe('just now')
                expect(timeAgo(new Date(now.getTime() - 60 * 1000))).toBe('1 minutes ago')
                expect(timeAgo(new Date(now.getTime() - 60 * 60 * 1000))).toBe('1 hours ago')
                expect(timeAgo(new Date(now.getTime() - 24 * 60 * 60 * 1000))).toBe('1 days ago')
            })
        })
    })
})
