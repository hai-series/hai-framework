/**
 * =============================================================================
 * @hai/core - 依赖注入单元测试
 * =============================================================================
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    CONFIG_TOKEN,
    Container,
    createToken,
    getContainer,
    resetContainer,
    setContainer,
} from '../src/di.js'

describe('di', () => {
    describe('Container', () => {
        let container: Container

        beforeEach(() => {
            container = new Container()
        })

        describe('register', () => {
            it('should register class as singleton', () => {
                class TestService {
                    value = Math.random()
                }

                container.register('test', TestService, 'singleton')

                const instance1 = container.resolve<TestService>('test')
                const instance2 = container.resolve<TestService>('test')

                expect(instance1).toBe(instance2)
                expect(instance1.value).toBe(instance2.value)
            })

            it('should register class as transient', () => {
                class TestService {
                    value = Math.random()
                }

                container.register('test', TestService, 'transient')

                const instance1 = container.resolve<TestService>('test')
                const instance2 = container.resolve<TestService>('test')

                expect(instance1).not.toBe(instance2)
            })

            it('should support chaining', () => {
                class ServiceA { }
                class ServiceB { }

                const result = container
                    .register('a', ServiceA)
                    .register('b', ServiceB)

                expect(result).toBe(container)
                expect(container.has('a')).toBe(true)
                expect(container.has('b')).toBe(true)
            })
        })

        describe('registerFactory', () => {
            it('should register factory function', () => {
                let callCount = 0
                container.registerFactory('counter', () => {
                    callCount++
                    return { count: callCount }
                }, 'singleton')

                const instance1 = container.resolve<{ count: number }>('counter')
                const instance2 = container.resolve<{ count: number }>('counter')

                expect(callCount).toBe(1)
                expect(instance1.count).toBe(1)
                expect(instance2.count).toBe(1)
            })

            it('should call factory each time for transient', () => {
                let callCount = 0
                container.registerFactory('counter', () => {
                    callCount++
                    return { count: callCount }
                }, 'transient')

                container.resolve('counter')
                container.resolve('counter')

                expect(callCount).toBe(2)
            })
        })

        describe('registerInstance', () => {
            it('should register pre-created instance', () => {
                const instance = { name: 'test' }
                container.registerInstance('config', instance)

                const resolved = container.resolve<{ name: string }>('config')
                expect(resolved).toBe(instance)
            })
        })

        describe('resolve', () => {
            it('should throw for unregistered service', () => {
                expect(() => container.resolve('unknown')).toThrow('Service not registered: unknown')
            })

            it('should resolve from parent container', () => {
                const parent = new Container()
                parent.registerInstance('shared', { value: 42 })

                const child = new Container(parent)
                const resolved = child.resolve<{ value: number }>('shared')

                expect(resolved.value).toBe(42)
            })

            it('should override parent registration', () => {
                const parent = new Container()
                parent.registerInstance('config', { env: 'prod' })

                const child = new Container(parent)
                child.registerInstance('config', { env: 'test' })

                expect(parent.resolve<{ env: string }>('config').env).toBe('prod')
                expect(child.resolve<{ env: string }>('config').env).toBe('test')
            })
        })

        describe('tryResolve', () => {
            it('should return undefined for unregistered service', () => {
                const result = container.tryResolve('unknown')
                expect(result).toBeUndefined()
            })

            it('should return instance for registered service', () => {
                container.registerInstance('test', { value: 1 })
                const result = container.tryResolve<{ value: number }>('test')
                expect(result?.value).toBe(1)
            })
        })

        describe('has', () => {
            it('should return false for unregistered service', () => {
                expect(container.has('unknown')).toBe(false)
            })

            it('should return true for registered service', () => {
                container.registerInstance('test', {})
                expect(container.has('test')).toBe(true)
            })

            it('should check parent container', () => {
                const parent = new Container()
                parent.registerInstance('parent-service', {})

                const child = new Container(parent)
                expect(child.has('parent-service')).toBe(true)
            })
        })

        describe('unregister', () => {
            it('should remove registration', () => {
                container.registerInstance('test', {})
                expect(container.has('test')).toBe(true)

                container.unregister('test')
                expect(container.has('test')).toBe(false)
            })

            it('should return true if removed', () => {
                container.registerInstance('test', {})
                expect(container.unregister('test')).toBe(true)
            })

            it('should return false if not found', () => {
                expect(container.unregister('unknown')).toBe(false)
            })
        })

        describe('createChild', () => {
            it('should create child container', () => {
                container.registerInstance('parent', { name: 'parent' })

                const child = container.createChild()
                child.registerInstance('child', { name: 'child' })

                expect(child.resolve('parent')).toEqual({ name: 'parent' })
                expect(child.resolve('child')).toEqual({ name: 'child' })
                expect(container.tryResolve('child')).toBeUndefined()
            })
        })

        describe('clear', () => {
            it('should remove all registrations', () => {
                container.registerInstance('a', {})
                container.registerInstance('b', {})

                container.clear()

                expect(container.has('a')).toBe(false)
                expect(container.has('b')).toBe(false)
            })
        })

        describe('symbol tokens', () => {
            it('should work with symbol tokens', () => {
                const TOKEN = Symbol('my-service')
                container.registerInstance(TOKEN, { value: 'test' })

                const resolved = container.resolve<{ value: string }>(TOKEN)
                expect(resolved.value).toBe('test')
            })
        })
    })

    describe('global container', () => {
        afterEach(() => {
            resetContainer()
        })

        it('should create global container lazily', () => {
            const container1 = getContainer()
            const container2 = getContainer()
            expect(container1).toBe(container2)
        })

        it('should allow setting custom container', () => {
            const custom = new Container()
            custom.registerInstance('custom', { value: 1 })

            setContainer(custom)

            const global = getContainer()
            expect(global.resolve('custom')).toEqual({ value: 1 })
        })

        it('should reset global container', () => {
            const container1 = getContainer()
            resetContainer()
            const container2 = getContainer()

            expect(container1).not.toBe(container2)
        })
    })

    describe('createToken', () => {
        it('should create unique token', () => {
            const token1 = createToken('service1')
            const token2 = createToken('service2')

            expect(typeof token1).toBe('symbol')
            expect(token1).not.toBe(token2)
        })

        it('should return same token for same name', () => {
            const token1 = createToken('same-name')
            const token2 = createToken('same-name')

            expect(token1).toBe(token2)
        })
    })

    describe('predefined tokens', () => {
        it('should have CONFIG_TOKEN', () => {
            expect(typeof CONFIG_TOKEN).toBe('symbol')
        })
    })
})
