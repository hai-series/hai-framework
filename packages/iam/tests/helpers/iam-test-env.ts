/**
 * =============================================================================
 * @hai/iam - 测试辅助工具
 * =============================================================================
 *
 * 提供 IAM 测试的统一初始化/清理逻辑。
 * 使用 SQLite 内存数据库 + 内存缓存，无需外部依赖。
 *
 * 注意：db 和 cache 是全局单例，每个测试文件只能初始化一次。
 * 需要多个 iam 配置时，通过 `createIamInstance()` 创建独立实例。
 */

import type { IamConfigInput, IamInitOptions } from '../../src/iam-main.js'
import { cache } from '@hai/cache'
import { db } from '@hai/db'
import { afterAll, beforeAll } from 'vitest'
import { iam } from '../../src/index.js'

/** 默认测试密码（满足默认策略） */
export const TEST_PASSWORD = 'TestPass123'

/** 弱密码（不满足策略） */
export const WEAK_PASSWORD = 'abc'

/**
 * 创建并初始化独立 IAM 实例
 *
 * db/cache 需要已被初始化。
 */
export async function createIamInstance(
  configInput?: IamConfigInput,
  optionsOverride?: Partial<Omit<IamInitOptions, 'cache'>>,
) {
  const instance = iam.create()
  const result = await instance.init(db, configInput ?? {}, {
    cache,
    ...optionsOverride,
  })
  if (!result.success) {
    throw new Error(`IAM init failed: ${result.error.message}`)
  }
  return instance
}

/**
 * 创建 IAM 测试环境
 *
 * 每个测试文件顶层 describe 调用一次。
 * beforeAll 初始化 db + cache + iam，afterAll 全部清理。
 */
export function defineIamTestEnv(
  _label: string,
  configInput?: IamConfigInput,
  optionsOverride?: Partial<Omit<IamInitOptions, 'cache'>>,
) {
  const iamInstance = iam.create()

  beforeAll(async () => {
    if (!db.isInitialized) {
      await db.init({ type: 'sqlite', database: ':memory:' })
    }
    if (!cache.isInitialized) {
      await cache.init({ type: 'memory' })
    }

    const result = await iamInstance.init(db, configInput ?? {}, {
      cache,
      ...optionsOverride,
    })
    if (!result.success) {
      throw new Error(`IAM init failed in "${_label}": ${result.error.message}`)
    }
  })

  afterAll(async () => {
    await iamInstance.close()
    await cache.close()
    await db.close()
  })

  return iamInstance
}

/**
 * 初始化全局 db + cache（顶层调用一次）
 *
 * 在测试文件最外层 describe 的 beforeAll/afterAll 中使用。
 */
export function setupGlobalDeps() {
  beforeAll(async () => {
    if (!db.isInitialized) {
      await db.init({ type: 'sqlite', database: ':memory:' })
    }
    if (!cache.isInitialized) {
      await cache.init({ type: 'memory' })
    }
  })

  afterAll(async () => {
    await cache.close()
    await db.close()
  })
}
