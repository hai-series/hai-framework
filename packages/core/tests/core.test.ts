/**
 * =============================================================================
 * @hai/core - Core 模块测试
 * =============================================================================
 * 测试统一 core.xxx API
 */

import { describe, expect, it } from 'vitest'
import {
    // Result
    ok,
    err,
    // 错误码
    CommonErrorCode,
    ConfigErrorCode,
    AuthErrorCode,
    DbErrorCode,
    AIErrorCode,
    StorageErrorCode,
    CryptoErrorCode,
    // core 服务
    core,
} from '../src/core-index.node.js'

describe('core.type - 类型检查', () => {
    it('isDefined should work', () => {
        expect(core.type.isDefined(null)).toBe(false)
        expect(core.type.isDefined(undefined)).toBe(false)
        expect(core.type.isDefined(0)).toBe(true)
        expect(core.type.isDefined('')).toBe(true)
        expect(core.type.isDefined(false)).toBe(true)
    })

    it('isObject should work', () => {
        expect(core.type.isObject({})).toBe(true)
        expect(core.type.isObject({ a: 1 })).toBe(true)
        expect(core.type.isObject(null)).toBe(false)
        expect(core.type.isObject([])).toBe(false)
    })
})

describe('core.object - 对象操作', () => {
    it('deepClone should create independent copy', () => {
        const original = { a: 1, nested: { b: 2 } }
        const cloned = core.object.deepClone(original)
        cloned.nested.b = 99
        expect(original.nested.b).toBe(2)
    })

    it('deepMerge should merge objects deeply', () => {
        const obj1 = { a: 1, nested: { x: 1 } }
        const obj2 = { b: 2, nested: { y: 2 } }
        const result = core.object.deepMerge(obj1, obj2)
        expect(result).toEqual({ a: 1, b: 2, nested: { x: 1, y: 2 } })
    })

    it('pick should select specified keys', () => {
        const obj = { a: 1, b: 2, c: 3 }
        expect(core.object.pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 })
    })

    it('omit should exclude specified keys', () => {
        const obj = { a: 1, b: 2, c: 3 }
        expect(core.object.omit(obj, ['b'])).toEqual({ a: 1, c: 3 })
    })
})

describe('core.string - 字符串操作', () => {
    it('capitalize should capitalize first letter', () => {
        expect(core.string.capitalize('hello')).toBe('Hello')
    })

    it('kebabCase should convert to kebab-case', () => {
        expect(core.string.kebabCase('helloWorld')).toBe('hello-world')
    })

    it('camelCase should convert to camelCase', () => {
        expect(core.string.camelCase('hello-world')).toBe('helloWorld')
    })

    it('truncate should truncate long strings', () => {
        expect(core.string.truncate('hello world', 5)).toBe('hello...')
        expect(core.string.truncate('hi', 5)).toBe('hi')
    })
})

describe('core.array - 数组操作', () => {
    it('unique should remove duplicates', () => {
        expect(core.array.unique([1, 1, 2, 2, 3])).toEqual([1, 2, 3])
    })

    it('groupBy should group items by key', () => {
        const items = [
            { type: 'a', value: 1 },
            { type: 'b', value: 2 },
            { type: 'a', value: 3 },
        ]
        const grouped = core.array.groupBy(items, item => item.type)
        expect(grouped).toEqual({
            a: [{ type: 'a', value: 1 }, { type: 'a', value: 3 }],
            b: [{ type: 'b', value: 2 }],
        })
    })

    it('chunk should split array into chunks', () => {
        expect(core.array.chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    })
})

describe('core.async - 异步操作', () => {
    it('delay should wait for specified time', async () => {
        const start = Date.now()
        await core.async.delay(50)
        const elapsed = Date.now() - start
        expect(elapsed).toBeGreaterThanOrEqual(45)
    })

    it('withTimeout should timeout slow promises', async () => {
        const slowPromise = new Promise(resolve => setTimeout(resolve, 100))
        await expect(core.async.withTimeout(slowPromise, 20)).rejects.toThrow('Timeout')
    })

    it('retry should retry failed operations', async () => {
        let attempts = 0
        const fn = async () => {
            attempts++
            if (attempts < 3) throw new Error('fail')
            return 'success'
        }
        const result = await core.async.retry(fn, { maxRetries: 3, delay: 10 })
        expect(result).toBe('success')
        expect(attempts).toBe(3)
    })
})

describe('core.time - 时间操作', () => {
    it('formatDate should format dates', () => {
        const date = new Date('2024-01-15T12:00:00Z')
        expect(core.time.formatDate(date)).toBe('2024-01-15')
    })

    it('timeAgo should return relative time', () => {
        const now = new Date()
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)
        expect(core.time.timeAgo(fiveMinutesAgo)).toBe('5分钟前')
    })
})

describe('Result 类型', () => {
    it('ok should create success result', () => {
        const result = ok(42)
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data).toBe(42)
        }
    })

    it('err should create error result', () => {
        const result = err('some error')
        expect(result.success).toBe(false)
        if (!result.success) {
            expect(result.error).toBe('some error')
        }
    })
})

describe('错误码', () => {
    it('should have correct common error codes', () => {
        expect(CommonErrorCode.UNKNOWN).toBe(1000)
        expect(CommonErrorCode.VALIDATION).toBe(1001)
        expect(CommonErrorCode.NOT_FOUND).toBe(1002)
    })

    it('should have correct config error codes', () => {
        expect(ConfigErrorCode.FILE_NOT_FOUND).toBe(1100)
        expect(ConfigErrorCode.PARSE_ERROR).toBe(1101)
        expect(ConfigErrorCode.VALIDATION_ERROR).toBe(1102)
    })

    it('should have correct domain-specific error codes', () => {
        expect(AuthErrorCode.INVALID_CREDENTIALS).toBeGreaterThanOrEqual(2000)
        expect(DbErrorCode.CONNECTION_FAILED).toBeGreaterThanOrEqual(3000)
        expect(AIErrorCode.API_ERROR).toBeGreaterThanOrEqual(4000)
        expect(StorageErrorCode.FILE_NOT_FOUND).toBeGreaterThanOrEqual(5000)
        expect(CryptoErrorCode.ENCRYPT_FAILED).toBeGreaterThanOrEqual(6000)
    })
})

describe('core.id - ID 生成', () => {
    it('should generate standard nanoid', () => {
        const myId = core.id.generate()
        expect(myId).toHaveLength(21)
        expect(core.isValidNanoId(myId)).toBe(true)
    })

    it('should generate short id', () => {
        const shortId = core.id.short()
        expect(shortId).toHaveLength(10)
    })

    it('should generate id with prefix', () => {
        const prefixedId = core.id.withPrefix('user_')
        expect(prefixedId).toMatch(/^user_/)
    })

    it('should generate trace id', () => {
        const traceId = core.id.trace()
        expect(traceId).toMatch(/^trace-/)
    })

    it('should generate request id', () => {
        const reqId = core.id.request()
        expect(reqId).toMatch(/^req-/)
    })

    it('should generate valid UUID', () => {
        const uuid = core.id.uuid()
        expect(core.isValidUUID(uuid)).toBe(true)
    })

    it('should validate nanoid format', () => {
        expect(core.isValidNanoId('V1StGXR8_Z5jdHi6B-myT')).toBe(true)
        expect(core.isValidNanoId('invalid!')).toBe(false)
    })
})

describe('core service', () => {
    it('should provide logger', () => {
        expect(core.logger).toBeDefined()
        expect(typeof core.logger.info).toBe('function')
    })

    it('should provide id utilities', () => {
        expect(core.id).toBeDefined()
        expect(typeof core.id.generate).toBe('function')
    })

    it('should provide type utilities', () => {
        expect(core.type).toBeDefined()
        expect(core.type.isDefined(0)).toBe(true)
        expect(core.type.isObject({})).toBe(true)
    })

    it('should provide object utilities', () => {
        expect(core.object).toBeDefined()
        expect(core.object.deepClone({ a: 1 })).toEqual({ a: 1 })
        expect(core.object.pick({ a: 1, b: 2 }, ['a'])).toEqual({ a: 1 })
    })

    it('should provide string utilities', () => {
        expect(core.string).toBeDefined()
        expect(core.string.capitalize('hello')).toBe('Hello')
    })

    it('should provide array utilities', () => {
        expect(core.array).toBeDefined()
        expect(core.array.unique([1, 1, 2])).toEqual([1, 2])
    })

    it('should provide async utilities', () => {
        expect(core.async).toBeDefined()
        expect(typeof core.async.delay).toBe('function')
    })

    it('should provide time utilities', () => {
        expect(core.time).toBeDefined()
        expect(typeof core.time.formatDate).toBe('function')
    })

    it('should provide config (Node.js)', () => {
        expect(core.config).toBeDefined()
        expect(typeof core.config.load).toBe('function')
        expect(typeof core.config.get).toBe('function')
    })
})
