/**
 * =============================================================================
 * @hai/config - 配置加载器单元测试
 * =============================================================================
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { loadConfig, loadConfigs, parseConfig } from '../src/loader.js'

// 测试用 Schema
const TestConfigSchema = z.object({
    name: z.string().default('default-name'),
    port: z.number().default(3000),
    debug: z.boolean().default(false),
    nested: z.object({
        value: z.string().default('nested-default'),
    }).default({}),
})

describe('loader', () => {
    // 测试目录
    let testDir: string

    beforeEach(() => {
        testDir = join(tmpdir(), `hai-config-test-${Date.now()}`)
        mkdirSync(testDir, { recursive: true })
    })

    afterEach(() => {
        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true, force: true })
        }
        // 清理环境变量
        delete process.env.TEST_VAR
        delete process.env.TEST_PORT
    })

    describe('loadConfig', () => {
        it('should load default config only', () => {
            // 创建默认配置
            writeFileSync(
                join(testDir, '_test.yml'),
                'name: from-default\nport: 8080',
            )

            const result = loadConfig({
                basePath: testDir,
                name: 'test',
                schema: TestConfigSchema,
            })

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value.name).toBe('from-default')
                expect(result.value.port).toBe(8080)
            }
        })

        it('should merge user config over default', () => {
            // 创建默认配置
            writeFileSync(
                join(testDir, '_test.yml'),
                'name: from-default\nport: 8080\ndebug: false',
            )
            // 创建用户配置
            writeFileSync(
                join(testDir, 'test.yml'),
                'port: 9000\ndebug: true',
            )

            const result = loadConfig({
                basePath: testDir,
                name: 'test',
                schema: TestConfigSchema,
            })

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value.name).toBe('from-default') // 保留默认值
                expect(result.value.port).toBe(9000) // 用户覆盖
                expect(result.value.debug).toBe(true) // 用户覆盖
            }
        })

        it('should apply schema defaults when both configs are missing', () => {
            const result = loadConfig({
                basePath: testDir,
                name: 'test',
                schema: TestConfigSchema,
                allowMissingDefault: true,
                allowMissingUser: true,
            })

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value.name).toBe('default-name')
                expect(result.value.port).toBe(3000)
            }
        })

        it('should return error when default config is missing and not allowed', () => {
            const result = loadConfig({
                basePath: testDir,
                name: 'test',
                schema: TestConfigSchema,
                allowMissingDefault: false,
            })

            expect(result.ok).toBe(false)
            if (!result.ok) {
                expect(result.error.type).toBe('FILE_NOT_FOUND')
            }
        })

        it('should deep merge nested objects', () => {
            // 创建默认配置
            writeFileSync(
                join(testDir, '_test.yml'),
                'nested:\n  value: default-nested',
            )
            // 创建用户配置
            writeFileSync(
                join(testDir, 'test.yml'),
                'nested:\n  value: user-nested',
            )

            const result = loadConfig({
                basePath: testDir,
                name: 'test',
                schema: TestConfigSchema,
            })

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value.nested.value).toBe('user-nested')
            }
        })
    })

    describe('environment variable interpolation', () => {
        it('should interpolate required env var', () => {
            process.env.TEST_VAR = 'env-value'

            writeFileSync(
                join(testDir, '_test.yml'),
                'name: ${TEST_VAR}',
            )

            const result = loadConfig({
                basePath: testDir,
                name: 'test',
                schema: TestConfigSchema,
            })

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value.name).toBe('env-value')
            }
        })

        it('should use default value for missing env var', () => {
            writeFileSync(
                join(testDir, '_test.yml'),
                'name: ${MISSING_VAR:fallback}',
            )

            const result = loadConfig({
                basePath: testDir,
                name: 'test',
                schema: TestConfigSchema,
            })

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value.name).toBe('fallback')
            }
        })

        it('should return error for missing required env var', () => {
            writeFileSync(
                join(testDir, '_test.yml'),
                'name: ${MISSING_REQUIRED_VAR}',
            )

            const result = loadConfig({
                basePath: testDir,
                name: 'test',
                schema: TestConfigSchema,
            })

            expect(result.ok).toBe(false)
            if (!result.ok) {
                expect(result.error.type).toBe('ENV_VAR_MISSING')
                expect(result.error.message).toContain('MISSING_REQUIRED_VAR')
            }
        })

        it('should interpolate env vars in nested objects', () => {
            process.env.TEST_VAR = 'nested-env'

            writeFileSync(
                join(testDir, '_test.yml'),
                'nested:\n  value: ${TEST_VAR}',
            )

            const result = loadConfig({
                basePath: testDir,
                name: 'test',
                schema: TestConfigSchema,
            })

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value.nested.value).toBe('nested-env')
            }
        })

        it('should interpolate multiple env vars in same string', () => {
            process.env.TEST_VAR = 'hello'
            process.env.TEST_PORT = 'world'

            writeFileSync(
                join(testDir, '_test.yml'),
                'name: ${TEST_VAR}-${TEST_PORT}',
            )

            const result = loadConfig({
                basePath: testDir,
                name: 'test',
                schema: TestConfigSchema,
            })

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value.name).toBe('hello-world')
            }
        })
    })

    describe('validation', () => {
        it('should return validation error for invalid config', () => {
            writeFileSync(
                join(testDir, '_test.yml'),
                'port: not-a-number',
            )

            const result = loadConfig({
                basePath: testDir,
                name: 'test',
                schema: TestConfigSchema,
            })

            expect(result.ok).toBe(false)
            if (!result.ok) {
                expect(result.error.type).toBe('VALIDATION_ERROR')
            }
        })

        it('should return parse error for invalid YAML', () => {
            writeFileSync(
                join(testDir, '_test.yml'),
                'invalid: yaml: content: [',
            )

            const result = loadConfig({
                basePath: testDir,
                name: 'test',
                schema: TestConfigSchema,
            })

            expect(result.ok).toBe(false)
            if (!result.ok) {
                expect(result.error.type).toBe('PARSE_ERROR')
            }
        })
    })

    describe('parseConfig', () => {
        it('should parse config from object', () => {
            const result = parseConfig(
                { name: 'parsed', port: 4000 },
                TestConfigSchema,
            )

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value.name).toBe('parsed')
                expect(result.value.port).toBe(4000)
            }
        })

        it('should interpolate env vars', () => {
            process.env.TEST_VAR = 'from-env'

            const result = parseConfig(
                { name: '${TEST_VAR}' },
                TestConfigSchema,
            )

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value.name).toBe('from-env')
            }
        })
    })

    describe('loadConfigs', () => {
        it('should load multiple configs', () => {
            writeFileSync(
                join(testDir, '_test.yml'),
                'name: test-config',
            )

            const AnotherSchema = z.object({
                enabled: z.boolean().default(true),
            })

            writeFileSync(
                join(testDir, '_another.yml'),
                'enabled: false',
            )

            const result = loadConfigs(testDir, {
                test: TestConfigSchema,
                another: AnotherSchema,
            })

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.value.test.name).toBe('test-config')
                expect(result.value.another.enabled).toBe(false)
            }
        })
    })
})
