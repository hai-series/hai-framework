/**
 * =============================================================================
 * @hai/core - Browser 入口测试
 * =============================================================================
 * 测试浏览器环境下的 core.xxx API
 */

import { describe, expect, it } from 'vitest'
import {
    // core 服务
    core,
    // Result
    ok,
    err,
    // 配置占位
    loadConfig,
    config,
} from '../src/core-index.browser.js'

describe('browser entry', () => {
    describe('Result 类型', () => {
        it('should export Result utilities', () => {
            const success = ok(42)
            expect(success.success).toBe(true)
            if (success.success) {
                expect(success.data).toBe(42)
            }

            const failure = err('error')
            expect(failure.success).toBe(false)
            if (!failure.success) {
                expect(failure.error).toBe('error')
            }
        })
    })

    describe('core.id - ID 生成', () => {
        it('should generate nanoid', () => {
            const myId = core.id.generate()
            expect(myId).toHaveLength(21)
        })

        it('should generate UUID', () => {
            const uuid = core.id.uuid()
            expect(core.isValidUUID(uuid)).toBe(true)
        })
    })

    describe('core.type - 类型检查', () => {
        it('should provide type utilities', () => {
            expect(core.type.isDefined(null)).toBe(false)
            expect(core.type.isDefined(undefined)).toBe(false)
            expect(core.type.isDefined(0)).toBe(true)
            expect(core.type.isDefined('')).toBe(true)
            expect(core.type.isObject({})).toBe(true)
            expect(core.type.isObject(null)).toBe(false)
        })
    })

    describe('core.object - 对象操作', () => {
        it('should provide object utilities', () => {
            const merged = core.object.deepMerge({ a: 1 }, { b: 2 })
            expect(merged).toEqual({ a: 1, b: 2 })
            expect(core.object.deepClone({ a: 1 })).toEqual({ a: 1 })
        })
    })

    describe('core.logger - 日志', () => {
        it('should provide logger', () => {
            expect(core.logger).toBeDefined()
            expect(typeof core.logger.info).toBe('function')
        })

        it('should create logger', () => {
            const logger = core.createLogger({ name: 'test-logger' })
            expect(logger).toBeDefined()
            expect(logger.info).toBeDefined()
            expect(logger.debug).toBeDefined()
            expect(logger.error).toBeDefined()
            expect(logger.child).toBeDefined()
        })

        it('should get and set level', () => {
            core.setLogLevel('debug')
            expect(core.getLogLevel()).toBe('debug')
        })

        it('should create child logger', () => {
            const logger = core.createLogger()
            const childLogger = logger.child({ requestId: '123' })
            expect(childLogger).toBeDefined()
        })
    })

    describe('core service (browser)', () => {
        it('should provide id utilities', () => {
            expect(core.id).toBeDefined()
            expect(typeof core.id.generate).toBe('function')
        })

        it('should provide type utilities', () => {
            expect(core.type).toBeDefined()
        })

        it('should provide object utilities', () => {
            expect(core.object).toBeDefined()
        })

        it('should provide string utilities', () => {
            expect(core.string).toBeDefined()
        })

        it('should provide array utilities', () => {
            expect(core.array).toBeDefined()
        })

        it('should provide async utilities', () => {
            expect(core.async).toBeDefined()
        })

        it('should provide time utilities', () => {
            expect(core.time).toBeDefined()
        })
    })

    describe('config 不可用（浏览器环境）', () => {
        it('should throw for loadConfig', () => {
            expect(() => loadConfig()).toThrow()
        })

        it('should throw for config.load', () => {
            expect(() => config.load()).toThrow()
        })

        it('config.has should return false', () => {
            expect(config.has('any')).toBe(false)
        })
    })
})
