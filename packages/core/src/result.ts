/**
 * =============================================================================
 * @hai/core - Result 类型
 * =============================================================================
 * 实现 Result<T, E> 模式，用于函数式错误处理
 * 
 * @description
 * Result 类型是一种函数式编程模式，用于明确表示操作可能成功或失败。
 * 相比传统的 try-catch，Result 模式具有以下优势：
 * - 强制调用者处理错误情况
 * - 类型安全，编译时检查
 * - 支持链式操作（map、flatMap、match）
 * - 避免异常导致的控制流中断
 * 
 * @example
 * ```typescript
 * import { ok, err, type Result } from '@hai/core/result'
 * 
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) return err('Division by zero')
 *   return ok(a / b)
 * }
 * 
 * const result = divide(10, 2)
 * result.match({
 *   ok: (value) => console.log(`Result: ${value}`),
 *   err: (error) => console.error(`Error: ${error}`),
 * })
 * ```
 * =============================================================================
 */

/**
 * Result 类型 - 表示操作结果，可以是成功(Ok)或失败(Err)
 * @template T - 成功时的值类型
 * @template E - 失败时的错误类型
 */
export type Result<T, E = Error> = Ok<T, E> | Err<T, E>

/**
 * 成功结果的标识符
 */
const OK_SYMBOL = Symbol('Ok')

/**
 * 失败结果的标识符
 */
const ERR_SYMBOL = Symbol('Err')

/**
 * 匹配处理器接口
 */
export interface MatchHandlers<T, E, R> {
    /** 成功时的处理函数 */
    ok: (value: T) => R
    /** 失败时的处理函数 */
    err: (error: E) => R
}

/**
 * Result 基础接口
 */
interface ResultBase<T, E> {
    /** 是否成功 (别名) */
    readonly ok: boolean
    /** 是否成功 */
    readonly isOk: boolean
    /** 是否失败 */
    readonly isErr: boolean
    /** 成功时的值（失败时为 undefined） */
    readonly value: T | undefined
    /** 获取成功值，失败时返回 undefined */
    unwrap(): T | undefined
    /** 获取成功值，失败时返回默认值 */
    unwrapOr(defaultValue: T): T
    /** 获取成功值，失败时抛出错误 */
    unwrapOrThrow(): T
    /** 获取错误值，成功时返回 undefined */
    unwrapErr(): E | undefined
    /** 模式匹配 */
    match<R>(handlers: MatchHandlers<T, E, R>): R
    /** 转换成功值 */
    map<U>(fn: (value: T) => U): Result<U, E>
    /** 转换错误值 */
    mapErr<F>(fn: (error: E) => F): Result<T, F>
    /** 链式操作 */
    flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E>
    /** 链式错误操作 */
    flatMapErr<F>(fn: (error: E) => Result<T, F>): Result<T, F>
    /** 转换为 Promise */
    toPromise(): Promise<T>
}

/**
 * 成功结果类型
 */
export class Ok<T, E = never> implements ResultBase<T, E> {
    /** 类型标识 */
    readonly _tag = OK_SYMBOL as typeof OK_SYMBOL

    /** 成功值 */
    readonly value: T

    constructor(value: T) {
        this.value = value
    }

    /** 是否成功 (别名 isOk) */
    get ok(): true {
        return true
    }

    get isOk(): true {
        return true
    }

    get isErr(): false {
        return false
    }

    unwrap(): T {
        return this.value
    }

    unwrapOr(_defaultValue: T): T {
        return this.value
    }

    unwrapOrThrow(): T {
        return this.value
    }

    unwrapErr(): undefined {
        return undefined
    }

    match<R>(handlers: MatchHandlers<T, E, R>): R {
        return handlers.ok(this.value)
    }

    map<U>(fn: (value: T) => U): Result<U, E> {
        return new Ok(fn(this.value))
    }

    mapErr<F>(_fn: (error: E) => F): Result<T, F> {
        return new Ok(this.value)
    }

    flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
        return fn(this.value)
    }

    flatMapErr<F>(_fn: (error: E) => Result<T, F>): Result<T, F> {
        return new Ok(this.value)
    }

    toPromise(): Promise<T> {
        return Promise.resolve(this.value)
    }
}

/**
 * 失败结果类型
 */
export class Err<T, E> implements ResultBase<T, E> {
    /** 类型标识 */
    readonly _tag = ERR_SYMBOL as typeof ERR_SYMBOL

    /** 错误值 */
    readonly error: E

    /** 为了兼容 Ok 类型，提供 undefined 的 value */
    readonly value: undefined = undefined

    constructor(error: E) {
        this.error = error
    }

    /** 是否成功 (别名 isOk) */
    get ok(): false {
        return false
    }

    get isOk(): false {
        return false
    }

    get isErr(): true {
        return true
    }

    unwrap(): undefined {
        return undefined
    }

    unwrapOr(defaultValue: T): T {
        return defaultValue
    }

    unwrapOrThrow(): never {
        if (this.error instanceof Error) {
            throw this.error
        }
        throw new Error(String(this.error))
    }

    unwrapErr(): E {
        return this.error
    }

    match<R>(handlers: MatchHandlers<T, E, R>): R {
        return handlers.err(this.error)
    }

    map<U>(_fn: (value: T) => U): Result<U, E> {
        return new Err(this.error)
    }

    mapErr<F>(fn: (error: E) => F): Result<T, F> {
        return new Err(fn(this.error))
    }

    flatMap<U>(_fn: (value: T) => Result<U, E>): Result<U, E> {
        return new Err(this.error)
    }

    flatMapErr<F>(fn: (error: E) => Result<T, F>): Result<T, F> {
        return fn(this.error)
    }

    toPromise(): Promise<never> {
        return Promise.reject(this.error)
    }
}

// =============================================================================
// 工厂函数
// =============================================================================

/**
 * 创建成功结果
 * @param value - 成功值
 * @returns 成功的 Result
 */
export function ok<T>(value: T): Ok<T, never> {
    return new Ok(value)
}

/**
 * 创建失败结果
 * @param error - 错误值
 * @returns 失败的 Result
 */
export function err<E>(error: E): Err<never, E> {
    return new Err(error)
}

// =============================================================================
// 类型守卫
// =============================================================================

/**
 * 检查是否为成功结果
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T, E> {
    return result.isOk
}

/**
 * 检查是否为失败结果
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<T, E> {
    return result.isErr
}

// =============================================================================
// 实用函数
// =============================================================================

/**
 * 从 Promise 创建 Result
 * @param promise - 要包装的 Promise
 * @returns 包含结果的 Promise
 */
export async function fromPromise<T, E = Error>(
    promise: Promise<T>,
): Promise<Result<T, E>> {
    try {
        const value = await promise
        return ok(value)
    }
    catch (error) {
        return err(error as E)
    }
}

/**
 * 从可能抛出异常的函数创建 Result
 * @param fn - 要执行的函数
 * @returns Result
 */
export function fromThrowable<T, E = Error>(fn: () => T): Result<T, E> {
    try {
        return ok(fn())
    }
    catch (error) {
        return err(error as E)
    }
}

/**
 * 组合多个 Result，全部成功则返回成功数组
 * @param results - Result 数组
 * @returns 组合后的 Result
 */
export function all<T, E>(results: Result<T, E>[]): Result<T[], E> {
    const values: T[] = []
    for (const result of results) {
        if (result.isErr) {
            return result as unknown as Err<T[], E>
        }
        values.push(result.unwrap()!)
    }
    return ok(values)
}

/**
 * 组合多个 Result，返回第一个成功的
 * @param results - Result 数组
 * @returns 第一个成功的 Result 或最后一个错误
 */
export function any<T, E>(results: Result<T, E>[]): Result<T, E[]> {
    const errors: E[] = []
    for (const result of results) {
        if (result.isOk) {
            return result as unknown as Ok<T, E[]>
        }
        errors.push(result.unwrapErr()!)
    }
    return err(errors)
}
