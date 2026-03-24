/**
 * =============================================================================
 * @h-ai/core - 错误处理函数测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { err, HaiCommonError, HaiConfigError } from '../src/index.js'

describe('core.error', () => {
  // =========================================================================
  // HaiCommonError 和 HaiConfigError（buildHaiErrorsDef 结果）
  // =========================================================================

  describe('haiCommonError', () => {
    it('should contain all standard error definitions', () => {
      expect(HaiCommonError.NOT_INITIALIZED).toBeDefined()
      expect(HaiCommonError.INIT_FAILED).toBeDefined()
      expect(HaiCommonError.UNAUTHORIZED).toBeDefined()
      expect(HaiCommonError.VALIDATION_ERROR).toBeDefined()
      expect(HaiCommonError.NOT_FOUND).toBeDefined()
      expect(HaiCommonError.INTERNAL_ERROR).toBeDefined()
    })

    it('each error definition should have required fields', () => {
      const def = HaiCommonError.NOT_INITIALIZED
      expect(def.code).toBe('hai:common:001')
      expect(def.httpStatus).toBe(500)
      expect(def.system).toBe('hai')
      expect(def.module).toBe('common')
    })

    it('error code format should be system:module:number', () => {
      const defs = [
        HaiCommonError.NOT_INITIALIZED,
        HaiCommonError.UNAUTHORIZED,
        HaiCommonError.VALIDATION_ERROR,
      ]
      defs.forEach((def) => {
        expect(def.code).toMatch(/^hai:common:\d{3}$/)
      })
    })

    it('should map HTTP status codes correctly', () => {
      expect(HaiCommonError.NOT_INITIALIZED.httpStatus).toBe(500)
      expect(HaiCommonError.UNAUTHORIZED.httpStatus).toBe(401)
      expect(HaiCommonError.FORBIDDEN.httpStatus).toBe(403)
      expect(HaiCommonError.NOT_FOUND.httpStatus).toBe(404)
      expect(HaiCommonError.VALIDATION_ERROR.httpStatus).toBe(400)
      expect(HaiCommonError.TIMEOUT.httpStatus).toBe(504)
      expect(HaiCommonError.SERVICE_UNAVAILABLE.httpStatus).toBe(503)
    })
  })

  describe('haiConfigError', () => {
    it('should contain all config error codes', () => {
      expect(HaiConfigError.CONFIG_FILE_NOT_FOUND).toBeDefined()
      expect(HaiConfigError.CONFIG_PARSE_ERROR).toBeDefined()
      expect(HaiConfigError.CONFIG_VALIDATION_ERROR).toBeDefined()
      expect(HaiConfigError.CONFIG_ENV_VAR_MISSING).toBeDefined()
      expect(HaiConfigError.CONFIG_NOT_LOADED).toBeDefined()
    })

    it('error definition should identify the core module', () => {
      const def = HaiConfigError.CONFIG_FILE_NOT_FOUND
      expect(def.code).toContain('core')
      expect(def.module).toBe('core')
    })

    it('config errors should all be server errors (500 status)', () => {
      Object.values(HaiConfigError).forEach((def) => {
        expect(def.httpStatus).toBe(500)
      })
    })
  })

  // =========================================================================
  // Integration with err() function
  // =========================================================================

  describe('integration with err() function', () => {
    it('should work with err() to create Result', () => {
      const result = err(HaiCommonError.NOT_FOUND, 'Resource not found')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('hai:common:300')
        expect(result.error.message).toBe('Resource not found')
        expect(result.error.httpStatus).toBe(404)
      }
    })

    it('should support cause and suggestion', () => {
      const cause = new Error('Original error')
      const result = err(
        HaiCommonError.INTERNAL_ERROR,
        'Processing failed',
        cause,
        'Check the logs',
      )
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.cause).toBe(cause)
        expect(result.error.suggestion).toBe('Check the logs')
      }
    })
  })

  // =========================================================================
  // Error code consistency checks
  // =========================================================================

  describe('error code consistency', () => {
    it('reference to same error definition should be identical', () => {
      const def1 = HaiCommonError.NOT_INITIALIZED
      const def2 = HaiCommonError.NOT_INITIALIZED
      expect(def1).toBe(def2)
    })

    it('different errors should not have duplicate codes', () => {
      const codes = Object.values(HaiCommonError).map(def => def.code)
      const uniqueCodes = new Set(codes)
      expect(uniqueCodes.size).toBe(codes.length)
    })

    it('config and COMMON error codes should not overlap', () => {
      const commonCodes = Object.values(HaiCommonError).map(def => def.code)
      const configCodes = Object.values(HaiConfigError).map(def => def.code)
      const overlap = commonCodes.filter(code => configCodes.includes(code))
      expect(overlap).toHaveLength(0)
    })
  })

  // =========================================================================
  // Error definition structure
  // =========================================================================

  describe('error definition structure', () => {
    it('should have all required fields', () => {
      const def = HaiCommonError.VALIDATION_ERROR
      expect('code' in def).toBe(true)
      expect('httpStatus' in def).toBe(true)
      expect('system' in def).toBe(true)
      expect('module' in def).toBe(true)
      expect(def.code).toBeTruthy()
      expect(def.httpStatus).toBeTruthy()
      expect(def.system).toBeTruthy()
      expect(def.module).toBeTruthy()
    })

    it('httpStatus should be valid HTTP status codes', () => {
      Object.values(HaiCommonError).forEach((def) => {
        expect(def.httpStatus).toBeGreaterThanOrEqual(100)
        expect(def.httpStatus).toBeLessThan(600)
      })
    })

    it('system should consistently be hai', () => {
      Object.values(HaiCommonError).forEach((def) => {
        expect(def.system).toBe('hai')
      })
    })
  })
})
