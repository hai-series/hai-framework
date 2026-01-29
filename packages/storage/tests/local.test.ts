/**
 * =============================================================================
 * @hai/storage - 本地存储测试（契约化精简版）
 * =============================================================================
 *
 * 测试本地文件系统存储 Provider，不需要 Docker。
 *
 * =============================================================================
 */

import type { StorageTestConfig } from './storage-test-shared.js'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { storage } from '../src/index.js'
import { runAllTests, runNotInitializedTests } from './storage-test-shared.js'

const localConfig: StorageTestConfig = {
  name: 'Local',
  type: 'local',
  supportRealPresignUrl: false,
}

describe('@hai/storage - Local Provider', () => {
  let testRoot: string

  beforeAll(async () => {
    testRoot = path.join(os.tmpdir(), `hai-storage-test-${Date.now()}`)
    await fs.mkdir(testRoot, { recursive: true })

    const result = await storage.init({
      type: 'local',
      root: testRoot,
    })
    expect(result.success).toBe(true)
  })

  afterAll(async () => {
    await storage.close()
    try {
      await fs.rm(testRoot, { recursive: true, force: true })
    }
    catch { /* ignore */ }
  })

  describe('初始化', () => {
    it('应该正确初始化', () => {
      expect(storage.isInitialized).toBe(true)
      expect(storage.config?.type).toBe('local')
    })
  })

  runAllTests(localConfig)

  describe('local 特有', () => {
    it('路径穿越防护', async () => {
      const r = await storage.file.put('../../../etc/passwd', 'safe')
      expect(r.success).toBe(true)
      // 实际写到 root 下的 etc/passwd
      expect((await storage.file.exists('etc/passwd')).data).toBe(true)
    })
  })
})

describe('@hai/storage - 未初始化', () => {
  beforeAll(async () => {
    await storage.close()
  })
  runNotInitializedTests()
})
