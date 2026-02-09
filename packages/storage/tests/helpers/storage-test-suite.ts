/**
 * =============================================================================
 * @hai/storage - 测试套件辅助
 * =============================================================================
 */

import type { StorageConfigInput } from '../../src/index.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe } from 'vitest'
import { storage } from '../../src/index.js'
import { acquireMinioContainer } from './minio-container.js'

export interface StorageTestEnv {
  config: StorageConfigInput
  /** 测试结束后的清理函数 */
  cleanup?: () => Promise<void>
}

/**
 * 定义存储测试套件，自动处理 init / close / cleanup 生命周期
 */
export function defineStorageSuite(
  label: string,
  setup: () => Promise<StorageTestEnv> | StorageTestEnv,
  defineTests: () => void,
): void {
  describe.sequential(`storage (${label})`, () => {
    let env: StorageTestEnv | null = null

    beforeAll(async () => {
      env = await setup()
    }, 300000)

    beforeEach(async () => {
      await storage.close()
      const initResult = await storage.init(env!.config)
      if (!initResult.success) {
        throw new Error(`storage init failed: ${initResult.error.code} ${initResult.error.message}`)
      }
    }, 120000)

    afterEach(async () => {
      await storage.close()
    })

    afterAll(async () => {
      await env?.cleanup?.()
      env = null
    }, 300000)

    defineTests()
  })
}

/**
 * 创建本地存储测试环境（使用临时目录）
 */
export function localStorageEnv(): StorageTestEnv {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hai-storage-test-'))
  return {
    config: { type: 'local', root },
    cleanup: async () => {
      fs.rmSync(root, { recursive: true, force: true })
    },
  }
}

/**
 * 创建 S3（MinIO）存储测试环境
 */
export async function s3Env(): Promise<StorageTestEnv> {
  const lease = await acquireMinioContainer()
  return {
    config: {
      type: 's3',
      bucket: 'test-bucket',
      region: 'us-east-1',
      endpoint: lease.endpoint,
      accessKeyId: lease.accessKeyId,
      secretAccessKey: lease.secretAccessKey,
      forcePathStyle: true,
    },
    cleanup: lease.release,
  }
}
