/**
 * =============================================================================
 * @hai/core - 依赖注入模块
 * =============================================================================
 * 轻量级依赖注入容器实现
 * 
 * @description
 * 提供简单但功能完整的依赖注入支持：
 * - 支持单例和瞬态生命周期
 * - 支持工厂函数注册
 * - 支持标签（token）注入
 * - 类型安全
 * 
 * @example
 * ```typescript
 * import { Container, Injectable, Inject } from '@hai/core/di'
 * 
 * // 创建容器
 * const container = new Container()
 * 
 * // 注册服务
 * container.register('logger', LoggerService, 'singleton')
 * container.registerFactory('config', () => loadConfig())
 * 
 * // 解析服务
 * const logger = container.resolve('logger')
 * ```
 * =============================================================================
 */

/**
 * 服务生命周期类型
 */
export type Lifetime = 'singleton' | 'transient'

/**
 * 服务注册信息
 */
interface ServiceRegistration<T = unknown> {
    /** 服务工厂 */
    factory: () => T
    /** 生命周期 */
    lifetime: Lifetime
    /** 单例实例 */
    instance?: T
}

/**
 * 服务标识类型
 */
export type ServiceToken<T = unknown> = string | symbol | (new (...args: unknown[]) => T)

/**
 * 服务定义映射
 */
export type ServiceMap = Record<string | symbol, unknown>

/**
 * 依赖注入容器
 */
export class Container {
    /** 服务注册表 */
    private readonly registrations = new Map<string | symbol, ServiceRegistration>()

    /** 父容器 */
    private readonly parent?: Container

    /**
     * 创建容器
     * @param parent - 可选的父容器
     */
    constructor(parent?: Container) {
        this.parent = parent
    }

    /**
     * 注册类服务
     * @param token - 服务标识
     * @param Class - 服务类
     * @param lifetime - 生命周期
     */
    register<T>(
        token: string | symbol,
        Class: new (...args: unknown[]) => T,
        lifetime: Lifetime = 'singleton',
    ): this {
        this.registrations.set(token, {
            factory: () => new Class(),
            lifetime,
        })
        return this
    }

    /**
     * 注册工厂函数
     * @param token - 服务标识
     * @param factory - 工厂函数
     * @param lifetime - 生命周期
     */
    registerFactory<T>(
        token: string | symbol,
        factory: () => T,
        lifetime: Lifetime = 'singleton',
    ): this {
        this.registrations.set(token, {
            factory,
            lifetime,
        })
        return this
    }

    /**
     * 注册实例（单例）
     * @param token - 服务标识
     * @param instance - 服务实例
     */
    registerInstance<T>(token: string | symbol, instance: T): this {
        this.registrations.set(token, {
            factory: () => instance,
            lifetime: 'singleton',
            instance,
        })
        return this
    }

    /**
     * 解析服务
     * @param token - 服务标识
     * @returns 服务实例
     * @throws 如果服务未注册
     */
    resolve<T>(token: string | symbol): T {
        const registration = this.registrations.get(token)

        if (!registration) {
            // 尝试从父容器解析
            if (this.parent) {
                return this.parent.resolve<T>(token)
            }
            throw new Error(`Service not registered: ${String(token)}`)
        }

        // 单例：返回缓存实例或创建新实例
        if (registration.lifetime === 'singleton') {
            if (registration.instance === undefined) {
                registration.instance = registration.factory()
            }
            return registration.instance as T
        }

        // 瞬态：每次创建新实例
        return registration.factory() as T
    }

    /**
     * 尝试解析服务
     * @param token - 服务标识
     * @returns 服务实例或 undefined
     */
    tryResolve<T>(token: string | symbol): T | undefined {
        try {
            return this.resolve<T>(token)
        }
        catch {
            return undefined
        }
    }

    /**
     * 检查服务是否已注册
     * @param token - 服务标识
     */
    has(token: string | symbol): boolean {
        if (this.registrations.has(token)) {
            return true
        }
        return this.parent?.has(token) ?? false
    }

    /**
     * 移除服务注册
     * @param token - 服务标识
     */
    unregister(token: string | symbol): boolean {
        return this.registrations.delete(token)
    }

    /**
     * 创建子容器
     */
    createChild(): Container {
        return new Container(this)
    }

    /**
     * 清空容器
     */
    clear(): void {
        this.registrations.clear()
    }
}

// =============================================================================
// 全局容器
// =============================================================================

/**
 * 全局默认容器
 */
let globalContainer: Container | null = null

/**
 * 获取全局容器
 */
export function getContainer(): Container {
    if (!globalContainer) {
        globalContainer = new Container()
    }
    return globalContainer
}

/**
 * 设置全局容器
 */
export function setContainer(container: Container): void {
    globalContainer = container
}

/**
 * 重置全局容器
 */
export function resetContainer(): void {
    globalContainer = null
}

// =============================================================================
// 服务标记工具
// =============================================================================

/**
 * 服务标记存储
 */
const SERVICE_TOKENS = new Map<string, symbol>()

/**
 * 创建服务标记
 * @param name - 标记名称
 */
export function createToken<T>(name: string): symbol & { __type?: T } {
    let token = SERVICE_TOKENS.get(name)
    if (!token) {
        token = Symbol(name)
        SERVICE_TOKENS.set(name, token)
    }
    return token as symbol & { __type?: T }
}

// =============================================================================
// 常用服务标记
// =============================================================================

/** 配置服务标记 */
export const CONFIG_TOKEN = createToken<unknown>('hai:config')

/** 日志服务标记 */
export const LOGGER_TOKEN = createToken<unknown>('hai:logger')

/** 数据库服务标记 */
export const DATABASE_TOKEN = createToken<unknown>('hai:database')

/** 缓存服务标记 */
export const CACHE_TOKEN = createToken<unknown>('hai:cache')

/** 认证服务标记 */
export const AUTH_TOKEN = createToken<unknown>('hai:auth')

/** AI 服务标记 */
export const AI_TOKEN = createToken<unknown>('hai:ai')

/** 存储服务标记 */
export const STORAGE_TOKEN = createToken<unknown>('hai:storage')
