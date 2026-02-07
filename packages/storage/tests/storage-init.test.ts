/**
 * =============================================================================
 * @hai/storage - 初始化与状态测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { storage } from '../src/storage-index.node.js'
import { defineStorageSuite, localStorageEnv, s3Env } from './helpers/storage-test-suite.js'

describe('storage.init', () => {
  const defineCommon = (label: 'local' | 's3') => {
    it(`${label}: init 后应记录配置并处于已初始化状态`, () => {
      expect(storage.isInitialized).toBe(true)
      expect(storage.config?.type).toBe(label)
    })

    it(`${label}: close 后应恢复未初始化状态`, async () => {
      await storage.close()
      expect(storage.isInitialized).toBe(false)
      expect(storage.config).toBeNull()
    })

    it(`${label}: close 后文件操作应返回 NOT_INITIALIZED`, async () => {
      await storage.close()
      const result = await storage.file.put('test.txt', 'hello')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(5010)
      }
    })

    it(`${label}: 重复 init 应先关闭旧连接再初始化`, async () => {
      expect(storage.isInitialized).toBe(true)
      const oldConfig = storage.config

      const result = await storage.init(oldConfig!)
      expect(result.success).toBe(true)
      expect(storage.isInitialized).toBe(true)
    })

    it(`${label}: 重复 close 不应报错`, async () => {
      await storage.close()
      await storage.close()
      expect(storage.isInitialized).toBe(false)
    })
  }

  defineStorageSuite('local', localStorageEnv, () => defineCommon('local'))

  defineStorageSuite('s3', s3Env, () => defineCommon('s3'))
})

describe('storage.init 配置校验', () => {
  it('缺少 root 的 local 配置应初始化失败', async () => {
    await storage.close()
    const result = await storage.init({ type: 'local', root: '' } as any)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(5000)
    }
  })

  it('不支持的存储类型应初始化失败', async () => {
    await storage.close()
    const result = await storage.init({ type: 'unknown' } as any)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(5000)
    }
  })
})
