/**
 * =============================================================================
 * @h-ai/storage - 初始化与状态测试
 * =============================================================================
 */

import type { StorageConfigInput } from '../src/storage-config.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { storage } from '../src/index.js'
import { HaiStorageError } from '../src/storage-types.js'
import { defineS3StorageSuites, defineStorageSuite, localStorageEnv } from './helpers/storage-test-suite.js'

const localRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hai-storage-init-'))

afterAll(() => {
  fs.rmSync(localRoot, { recursive: true, force: true })
})

describe('storage.init', () => {
  const defineCommon = (label: 'local' | 's3') => {
    it(`${label}: 初始化配置脱敏，关闭后入口受保护，重复关闭幂等`, async () => {
      expect(storage.isInitialized).toBe(true)
      expect(storage.config?.type).toBe(label)
      if (storage.config?.type === 's3') {
        expect(storage.config.accessKeyId).toBe('[REDACTED]')
        expect(storage.config.secretAccessKey).toBe('[REDACTED]')
      }
      const closeResult = await storage.close()
      expect(closeResult.success).toBe(true)
      expect(storage.isInitialized).toBe(false)
      expect(storage.config).toBeNull()
      const result = await storage.file.put('test.txt', 'hello')
      expect(result).toMatchObject({ success: false, error: { code: HaiStorageError.NOT_INITIALIZED.code } })
      expect((await storage.close()).success).toBe(true)
      expect(storage.isInitialized).toBe(false)
    })

    if (label === 'local') {
      it('local: 重复 init 应先关闭旧连接再初始化', async () => {
        expect(storage.isInitialized).toBe(true)
        const oldConfig = storage.config
        expect(oldConfig?.type).toBe('local')

        const result = await storage.init(oldConfig!)
        expect(result.success).toBe(true)
        expect(storage.isInitialized).toBe(true)
      })
    }
  }

  defineStorageSuite('local', localStorageEnv, () => defineCommon('local'))

  defineS3StorageSuites(() => defineCommon('s3'))
})

describe('storage.init 配置校验', () => {
  it('缺少 root 的 local 配置应初始化失败', async () => {
    await storage.close()
    const result = await storage.init({ type: 'local', root: '' } as unknown as StorageConfigInput)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiStorageError.CONFIG_ERROR.code)
    }
  })

  it('不支持的存储类型应初始化失败', async () => {
    await storage.close()
    const result = await storage.init({ type: 'unknown' } as unknown as StorageConfigInput)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiStorageError.CONFIG_ERROR.code)
    }
  })

  it('缺少 type 字段应初始化失败', async () => {
    await storage.close()
    const result = await storage.init({} as unknown as StorageConfigInput)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiStorageError.CONFIG_ERROR.code)
    }
  })

  it('s3 配置缺少 bucket 应初始化失败', async () => {
    await storage.close()
    const result = await storage.init({
      type: 's3',
      region: 'us-east-1',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
    } as unknown as StorageConfigInput)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiStorageError.CONFIG_ERROR.code)
    }
  })

  it('s3 配置缺少 accessKeyId 应初始化失败', async () => {
    await storage.close()
    const result = await storage.init({
      type: 's3',
      bucket: 'test',
      region: 'us-east-1',
      secretAccessKey: 'secret',
    } as unknown as StorageConfigInput)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiStorageError.CONFIG_ERROR.code)
    }
  })

  it('s3 配置非法 endpoint 应初始化失败', async () => {
    await storage.close()
    const result = await storage.init({
      type: 's3',
      bucket: 'test',
      region: 'us-east-1',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      endpoint: 'not-a-valid-url',
    } as unknown as StorageConfigInput)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiStorageError.CONFIG_ERROR.code)
    }
  })

  it('init 后 isInitialized 应为 true', async () => {
    await storage.close()
    const result = await storage.init({ type: 'local', root: localRoot })
    expect(result.success).toBe(true)
    expect(storage.isInitialized).toBe(true)
  })

  it('init 后 config 应包含解析后的完整配置', async () => {
    await storage.close()
    const result = await storage.init({ type: 'local', root: localRoot })
    expect(result.success).toBe(true)
    expect(storage.config).not.toBeNull()
    expect(storage.config?.type).toBe('local')
    if (storage.config?.type === 'local') {
      expect(storage.config.directoryMode).toBe(0o755)
      expect(storage.config.fileMode).toBe(0o644)
    }
  })
})
