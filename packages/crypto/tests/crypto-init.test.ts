import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { core } from '@hai/core'
import { describe, expect, it } from 'vitest'
import { crypto, CryptoConfigSchema } from '../src/index.js'

/**
 * @example
 * ```ts
 * core.config.load('crypto', '/path/to/crypto.yml', CryptoConfigSchema)
 * crypto.init(core.config.get('crypto'))
 * ```
 */

describe('crypto.init', () => {
  it('should throw when config not loaded', () => {
    expect(() => crypto.init()).toThrow()
  })

  it('should initialize after loading config', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hai-crypto-'))
    const filePath = path.join(tempDir, 'crypto.yml')

    fs.writeFileSync(filePath, 'defaultAlgorithm: sm\n', 'utf8')

    const loadResult = core.config.load('crypto', filePath, CryptoConfigSchema)
    expect(loadResult.success).toBe(true)

    const cfg = core.config.get('crypto')
    expect(cfg).toBeTruthy()

    crypto.init(cfg as { defaultAlgorithm?: 'sm', custom?: Record<string, unknown> })
    expect(crypto.isInitialized).toBe(true)
  })

  it('should return a new config object', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hai-crypto-'))
    const filePath = path.join(tempDir, 'crypto.yml')

    fs.writeFileSync(filePath, 'defaultAlgorithm: sm\ncustom:\n  feature: true\n', 'utf8')

    const loadResult = core.config.load('crypto', filePath, CryptoConfigSchema)
    expect(loadResult.success).toBe(true)

    const cfg = core.config.get('crypto')
    expect(cfg).toBeTruthy()

    crypto.init(cfg as { defaultAlgorithm?: 'sm', custom?: Record<string, unknown> })

    const first = crypto.config
    const second = crypto.config
    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    expect(first.defaultAlgorithm).toBe('sm')
  })
})
