/**
 * =============================================================================
 * @hai/core - 配置 Schema 测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import {
  // 错误码
  CommonErrorCode,
  ConfigErrorCode,
  CoreConfigSchema,
  // Schema
  EnvSchema,
  IdConfigSchema,
  LogFormatSchema,
  LoggingConfigSchema,
  LogLevelSchema,
} from '../../src/config/index.js'

describe('core-config', () => {
  describe('错误码', () => {
    describe('commonErrorCode', () => {
      it('应有正确的错误码范围 (1000-1099)', () => {
        expect(CommonErrorCode.UNKNOWN).toBe(1000)
        expect(CommonErrorCode.VALIDATION).toBe(1001)
        expect(CommonErrorCode.NOT_FOUND).toBe(1002)
        expect(CommonErrorCode.UNAUTHORIZED).toBe(1003)
        expect(CommonErrorCode.FORBIDDEN).toBe(1004)
        expect(CommonErrorCode.CONFLICT).toBe(1005)
        expect(CommonErrorCode.INTERNAL).toBe(1006)
        expect(CommonErrorCode.TIMEOUT).toBe(1007)
        expect(CommonErrorCode.NETWORK).toBe(1008)
      })
    })

    describe('configErrorCode', () => {
      it('应有正确的错误码范围 (1100-1199)', () => {
        expect(ConfigErrorCode.FILE_NOT_FOUND).toBe(1100)
        expect(ConfigErrorCode.PARSE_ERROR).toBe(1101)
        expect(ConfigErrorCode.VALIDATION_ERROR).toBe(1102)
        expect(ConfigErrorCode.ENV_VAR_MISSING).toBe(1103)
        expect(ConfigErrorCode.NOT_LOADED).toBe(1104)
      })
    })
  })

  describe('schema 验证', () => {
    describe('envSchema', () => {
      it('应接受有效的环境值', () => {
        expect(EnvSchema.parse('development')).toBe('development')
        expect(EnvSchema.parse('production')).toBe('production')
        expect(EnvSchema.parse('test')).toBe('test')
        expect(EnvSchema.parse('staging')).toBe('staging')
      })

      it('应拒绝无效的环境值', () => {
        expect(() => EnvSchema.parse('invalid')).toThrow()
      })
    })

    describe('logLevelSchema', () => {
      it('应接受有效的日志级别', () => {
        const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']
        for (const level of levels) {
          expect(LogLevelSchema.parse(level)).toBe(level)
        }
      })

      it('应拒绝无效的日志级别', () => {
        expect(() => LogLevelSchema.parse('verbose')).toThrow()
      })
    })

    describe('logFormatSchema', () => {
      it('应接受有效的日志格式', () => {
        expect(LogFormatSchema.parse('json')).toBe('json')
        expect(LogFormatSchema.parse('pretty')).toBe('pretty')
      })

      it('应拒绝无效的日志格式', () => {
        expect(() => LogFormatSchema.parse('text')).toThrow()
      })
    })

    describe('loggingConfigSchema', () => {
      it('应使用默认值', () => {
        const result = LoggingConfigSchema.parse({})
        expect(result.level).toBe('info')
        expect(result.format).toBe('json')
        expect(result.redact).toEqual([])
      })

      it('应接受完整配置', () => {
        const config = {
          level: 'debug',
          format: 'pretty',
          context: { app: 'test' },
          redact: ['password', 'token'],
        }
        const result = LoggingConfigSchema.parse(config)
        expect(result.level).toBe('debug')
        expect(result.format).toBe('pretty')
        expect(result.context).toEqual({ app: 'test' })
        expect(result.redact).toEqual(['password', 'token'])
      })
    })

    describe('idConfigSchema', () => {
      it('应使用默认值', () => {
        const result = IdConfigSchema.parse({})
        expect(result.length).toBe(21)
      })

      it('应接受完整配置', () => {
        const config = {
          prefix: 'user_',
          length: 16,
        }
        const result = IdConfigSchema.parse(config)
        expect(result.prefix).toBe('user_')
        expect(result.length).toBe(16)
      })

      it('应验证长度范围', () => {
        expect(() => IdConfigSchema.parse({ length: 5 })).toThrow()
        expect(() => IdConfigSchema.parse({ length: 65 })).toThrow()
      })
    })

    describe('coreConfigSchema', () => {
      it('应使用默认值', () => {
        const result = CoreConfigSchema.parse({})
        expect(result.name).toBe('hai Admin')
        expect(result.version).toBe('0.1.0')
        expect(result.env).toBe('development')
        expect(result.debug).toBe(false)
        expect(result.defaultLocale).toBe('zh-CN')
      })

      it('应接受完整配置', () => {
        const config = {
          name: 'My App',
          version: '1.0.0',
          env: 'production',
          debug: true,
          logging: { level: 'warn' },
          id: { prefix: 'app_' },
          defaultLocale: 'en-US',
        }
        const result = CoreConfigSchema.parse(config)
        expect(result.name).toBe('My App')
        expect(result.env).toBe('production')
        expect(result.logging?.level).toBe('warn')
      })
    })
  })
})
