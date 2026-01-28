/**
 * =============================================================================
 * @hai/core - Result 类型单元测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import {
    all,
    any,
    Err,
    err,
    fromPromise,
    fromThrowable,
    isErr,
    isOk,
    ok,
    Ok,
} from '../src/result.js'

describe('result', () => {
    describe('ok', () => {
        it('should create Ok result', () => {
            const result = ok(42)
            expect(result).toBeInstanceOf(Ok)
            expect(result.isOk).toBe(true)
            expect(result.isErr).toBe(false)
            expect(result.value).toBe(42)
        })

        it('should unwrap value', () => {
            const result = ok('hello')
            expect(result.unwrap()).toBe('hello')
        })

        it('should return value for unwrapOr', () => {
            const result = ok(10)
            expect(result.unwrapOr(0)).toBe(10)
        })

        it('should return value for unwrapOrThrow', () => {
            const result = ok('success')
            expect(result.unwrapOrThrow()).toBe('success')
        })

        it('should return undefined for unwrapErr', () => {
            const result = ok(123)
            expect(result.unwrapErr()).toBeUndefined()
        })
    })

    describe('err', () => {
        it('should create Err result', () => {
            const result = err('error message')
            expect(result).toBeInstanceOf(Err)
            expect(result.isOk).toBe(false)
            expect(result.isErr).toBe(true)
            expect(result.error).toBe('error message')
        })

        it('should return undefined for unwrap', () => {
            const result = err('error')
            expect(result.unwrap()).toBeUndefined()
        })

        it('should return default for unwrapOr', () => {
            const result = err<number, string>('error')
            expect(result.unwrapOr(999)).toBe(999)
        })

        it('should throw for unwrapOrThrow', () => {
            const result = err(new Error('test error'))
            expect(() => result.unwrapOrThrow()).toThrow('test error')
        })

        it('should throw string error for unwrapOrThrow', () => {
            const result = err('string error')
            expect(() => result.unwrapOrThrow()).toThrow('string error')
        })

        it('should return error for unwrapErr', () => {
            const result = err('the error')
            expect(result.unwrapErr()).toBe('the error')
        })
    })

    describe('match', () => {
        it('should call ok handler for Ok result', () => {
            const result = ok(42)
            const value = result.match({
                ok: v => v * 2,
                err: () => 0,
            })
            expect(value).toBe(84)
        })

        it('should call err handler for Err result', () => {
            const result = err<number, string>('error')
            const value = result.match({
                ok: v => v * 2,
                err: e => e.length,
            })
            expect(value).toBe(5)
        })
    })

    describe('map', () => {
        it('should transform Ok value', () => {
            const result = ok(5).map(x => x * 3)
            expect(result.unwrap()).toBe(15)
        })

        it('should not transform Err', () => {
            const result = err<number, string>('error').map(x => x * 3)
            expect(result.isErr).toBe(true)
            expect(result.unwrapErr()).toBe('error')
        })
    })

    describe('mapErr', () => {
        it('should not transform Ok', () => {
            const result = ok<number, string>(10).mapErr(e => e.toUpperCase())
            expect(result.isOk).toBe(true)
            expect(result.unwrap()).toBe(10)
        })

        it('should transform Err', () => {
            const result = err<number, string>('error').mapErr(e => e.toUpperCase())
            expect(result.isErr).toBe(true)
            expect(result.unwrapErr()).toBe('ERROR')
        })
    })

    describe('flatMap', () => {
        it('should chain Ok results', () => {
            const result = ok(10)
                .flatMap(x => ok(x + 5))
                .flatMap(x => ok(x * 2))
            expect(result.unwrap()).toBe(30)
        })

        it('should short-circuit on Err', () => {
            const result = ok(10)
                .flatMap(() => err<number, string>('failed'))
                .flatMap(x => ok(x * 2))
            expect(result.isErr).toBe(true)
            expect(result.unwrapErr()).toBe('failed')
        })
    })

    describe('flatMapErr', () => {
        it('should not transform Ok', () => {
            const result = ok<number, string>(10).flatMapErr(() => ok(0))
            expect(result.unwrap()).toBe(10)
        })

        it('should chain Err recovery', () => {
            const result = err<number, string>('error').flatMapErr(() => ok(42))
            expect(result.isOk).toBe(true)
            expect(result.unwrap()).toBe(42)
        })
    })

    describe('toPromise', () => {
        it('should resolve for Ok', async () => {
            const result = ok(100)
            await expect(result.toPromise()).resolves.toBe(100)
        })

        it('should reject for Err', async () => {
            const result = err('failure')
            await expect(result.toPromise()).rejects.toBe('failure')
        })
    })

    describe('isOk / isErr', () => {
        it('should correctly identify Ok', () => {
            const result = ok(1)
            expect(isOk(result)).toBe(true)
            expect(isErr(result)).toBe(false)
        })

        it('should correctly identify Err', () => {
            const result = err('x')
            expect(isOk(result)).toBe(false)
            expect(isErr(result)).toBe(true)
        })
    })

    describe('fromPromise', () => {
        it('should return Ok for resolved promise', async () => {
            const result = await fromPromise(Promise.resolve(42))
            expect(result.isOk).toBe(true)
            expect(result.unwrap()).toBe(42)
        })

        it('should return Err for rejected promise', async () => {
            const result = await fromPromise(Promise.reject(new Error('oops')))
            expect(result.isErr).toBe(true)
            expect(result.unwrapErr()).toBeInstanceOf(Error)
        })
    })

    describe('fromThrowable', () => {
        it('should return Ok for non-throwing function', () => {
            const result = fromThrowable(() => 'success')
            expect(result.isOk).toBe(true)
            expect(result.unwrap()).toBe('success')
        })

        it('should return Err for throwing function', () => {
            const result = fromThrowable(() => {
                throw new Error('boom')
            })
            expect(result.isErr).toBe(true)
            expect(result.unwrapErr()).toBeInstanceOf(Error)
        })
    })

    describe('all', () => {
        it('should return Ok with all values for all Ok results', () => {
            const results = [ok(1), ok(2), ok(3)]
            const combined = all(results)
            expect(combined.isOk).toBe(true)
            expect(combined.unwrap()).toEqual([1, 2, 3])
        })

        it('should return first Err for mixed results', () => {
            const results = [ok(1), err<number, string>('first error'), ok(3)]
            const combined = all(results)
            expect(combined.isErr).toBe(true)
            expect(combined.unwrapErr()).toBe('first error')
        })
    })

    describe('any', () => {
        it('should return first Ok for mixed results', () => {
            const results = [err<number, string>('a'), ok(42), err('b')]
            const combined = any(results)
            expect(combined.isOk).toBe(true)
            expect(combined.unwrap()).toBe(42)
        })

        it('should return all errors for all Err results', () => {
            const results = [err<number, string>('a'), err('b'), err('c')]
            const combined = any(results)
            expect(combined.isErr).toBe(true)
            expect(combined.unwrapErr()).toEqual(['a', 'b', 'c'])
        })
    })
})
