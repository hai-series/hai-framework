/**
 * =============================================================================
 * @hai/config - 配置管理器单元测试
 * =============================================================================
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ConfigManager, getConfigManager } from '../src/manager.js'

// 测试用 Schema
const TestConfigSchema = z.object({
    name: z.string().default('default'),
    value: z.number().default(42),
})
type TestConfig = z.infer<typeof TestConfigSchema>

describe('ConfigManager', () => {
    let testDir: string

    beforeEach(() => {
        // 重置单例
        ConfigManager.resetInstance()

        // 创建测试目录
        testDir = join(tmpdir(), `hai-config-manager-test-${Date.now()}`)
        mkdirSync(testDir, { recursive: true })
    })

    afterEach(() => {
        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true, force: true })
        }
        ConfigManager.resetInstance()
    })

    describe('singleton', () => {
        it('should return same instance', () => {
            const instance1 = ConfigManager.getInstance()
            const instance2 = ConfigManager.getInstance()

            expect(instance1).toBe(instance2)
        })

        it('should return same instance via getConfigManager', () => {
            const instance1 = getConfigManager()
            const instance2 = ConfigManager.getInstance()

            expect(instance1).toBe(instance2)
        })

        it('should reset instance', () => {
            const instance1 = ConfigManager.getInstance()
            ConfigManager.resetInstance()
            const instance2 = ConfigManager.getInstance()

            expect(instance1).not.toBe(instance2)
        })
    })

    describe('load', () => {
        it('should load and cache config', () => {
            writeFileSync(
                join(testDir, '_test.yml'),
                'name: loaded\nvalue: 100',
            )

            const manager = getConfigManager()
            const result = manager.load({
                basePath: testDir,
                name: 'test',
                schema: TestConfigSchema,
            })

            expect(result.ok).toBe(true)
            expect(manager.has('test')).toBe(true)
        })

        it('should return cached config via get', () => {
            writeFileSync(
                join(testDir, '_test.yml'),
                'name: cached',
            )

            const manager = getConfigManager()
            manager.load({
                basePath: testDir,
                name: 'test',
                schema: TestConfigSchema,
            })

            const config = manager.get<TestConfig>('test')

            expect(config).toBeDefined()
            expect(config?.name).toBe('cached')
        })

        it('should return undefined for non-existent config', () => {
            const manager = getConfigManager()
            const config = manager.get<TestConfig>('non-existent')

            expect(config).toBeUndefined()
        })
    })

    describe('require', () => {
        it('should return config when exists', () => {
            writeFileSync(
                join(testDir, '_test.yml'),
                'name: required',
            )

            const manager = getConfigManager()
            manager.load({
                basePath: testDir,
                name: 'test',
                schema: TestConfigSchema,
            })

            const config = manager.require<TestConfig>('test')

            expect(config.name).toBe('required')
        })

        it('should throw when config not found', () => {
            const manager = getConfigManager()

            expect(() => manager.require('missing')).toThrow(
                "Config 'missing' not found",
            )
        })
    })

    describe('set', () => {
        it('should set config directly', () => {
            const manager = getConfigManager()
            const result = manager.set('test', { name: 'direct', value: 200 }, TestConfigSchema)

            expect(result.ok).toBe(true)
            expect(manager.get<TestConfig>('test')?.name).toBe('direct')
        })

        it('should validate config when setting', () => {
            const manager = getConfigManager()
            const result = manager.set('test', { value: 'not-a-number' }, TestConfigSchema)

            expect(result.ok).toBe(false)
        })
    })

    describe('reload', () => {
        it('should reload config from file', () => {
            const configPath = join(testDir, '_test.yml')
            writeFileSync(configPath, 'name: original')

            const manager = getConfigManager()
            manager.load({
                basePath: testDir,
                name: 'test',
                schema: TestConfigSchema,
            })

            expect(manager.get<TestConfig>('test')?.name).toBe('original')

            // 修改文件
            writeFileSync(configPath, 'name: updated')

            // 重载
            const result = manager.reload('test')

            expect(result.ok).toBe(true)
            expect(manager.get<TestConfig>('test')?.name).toBe('updated')
        })

        it('should return error when reloading non-existent config', () => {
            const manager = getConfigManager()
            const result = manager.reload('non-existent')

            expect(result.ok).toBe(false)
        })
    })

    describe('onChange', () => {
        it('should call listener on reload', () => {
            const configPath = join(testDir, '_test.yml')
            writeFileSync(configPath, 'name: original')

            const manager = getConfigManager()
            manager.load({
                basePath: testDir,
                name: 'test',
                schema: TestConfigSchema,
            })

            const listener = vi.fn()
            manager.onChange<TestConfig>('test', listener)

            // 修改并重载
            writeFileSync(configPath, 'name: changed')
            manager.reload('test')

            expect(listener).toHaveBeenCalledTimes(1)
            expect(listener).toHaveBeenCalledWith(expect.objectContaining({ name: 'changed' }))
        })

        it('should call listener on set', () => {
            const manager = getConfigManager()

            const listener = vi.fn()
            manager.onChange<TestConfig>('test', listener)

            manager.set('test', { name: 'set-value' }, TestConfigSchema)

            expect(listener).toHaveBeenCalledTimes(1)
        })

        it('should remove listener when unsubscribe is called', () => {
            const configPath = join(testDir, '_test.yml')
            writeFileSync(configPath, 'name: original')

            const manager = getConfigManager()
            manager.load({
                basePath: testDir,
                name: 'test',
                schema: TestConfigSchema,
            })

            const listener = vi.fn()
            const unsubscribe = manager.onChange<TestConfig>('test', listener)

            // 取消订阅
            unsubscribe()

            // 重载
            writeFileSync(configPath, 'name: changed')
            manager.reload('test')

            expect(listener).not.toHaveBeenCalled()
        })
    })

    describe('getLoadedAt', () => {
        it('should return load timestamp', () => {
            writeFileSync(
                join(testDir, '_test.yml'),
                'name: timed',
            )

            const beforeLoad = Date.now()

            const manager = getConfigManager()
            manager.load({
                basePath: testDir,
                name: 'test',
                schema: TestConfigSchema,
            })

            const loadedAt = manager.getLoadedAt('test')

            expect(loadedAt).toBeDefined()
            expect(loadedAt).toBeGreaterThanOrEqual(beforeLoad)
        })

        it('should return undefined for non-existent config', () => {
            const manager = getConfigManager()
            expect(manager.getLoadedAt('missing')).toBeUndefined()
        })
    })

    describe('getLoadedNames', () => {
        it('should return all loaded config names', () => {
            writeFileSync(join(testDir, '_config1.yml'), 'name: one')
            writeFileSync(join(testDir, '_config2.yml'), 'name: two')

            const manager = getConfigManager()
            manager.load({ basePath: testDir, name: 'config1', schema: TestConfigSchema })
            manager.load({ basePath: testDir, name: 'config2', schema: TestConfigSchema })

            const names = manager.getLoadedNames()

            expect(names).toContain('config1')
            expect(names).toContain('config2')
        })
    })

    describe('clear', () => {
        it('should clear specific config', () => {
            writeFileSync(join(testDir, '_test.yml'), 'name: to-clear')

            const manager = getConfigManager()
            manager.load({ basePath: testDir, name: 'test', schema: TestConfigSchema })

            expect(manager.has('test')).toBe(true)

            manager.clear('test')

            expect(manager.has('test')).toBe(false)
        })

        it('should clear all configs', () => {
            writeFileSync(join(testDir, '_config1.yml'), 'name: one')
            writeFileSync(join(testDir, '_config2.yml'), 'name: two')

            const manager = getConfigManager()
            manager.load({ basePath: testDir, name: 'config1', schema: TestConfigSchema })
            manager.load({ basePath: testDir, name: 'config2', schema: TestConfigSchema })

            manager.clear()

            expect(manager.getLoadedNames()).toHaveLength(0)
        })
    })

    describe('reloadAll', () => {
        it('should reload all configs', () => {
            const path1 = join(testDir, '_config1.yml')
            const path2 = join(testDir, '_config2.yml')

            writeFileSync(path1, 'name: original1')
            writeFileSync(path2, 'name: original2')

            const manager = getConfigManager()
            manager.load({ basePath: testDir, name: 'config1', schema: TestConfigSchema })
            manager.load({ basePath: testDir, name: 'config2', schema: TestConfigSchema })

            // 修改文件
            writeFileSync(path1, 'name: updated1')
            writeFileSync(path2, 'name: updated2')

            const result = manager.reloadAll()

            expect(result.ok).toBe(true)
            expect(manager.get<TestConfig>('config1')?.name).toBe('updated1')
            expect(manager.get<TestConfig>('config2')?.name).toBe('updated2')
        })
    })
})
