/**
 * @h-ai/iam — 测试辅助工具
 *
 * 提供 IAM 测试的统一初始化/清理逻辑。
 * 使用 SQLite 内存数据库 + 内存缓存，无需外部依赖。
 */

import type { IamConfigSettingsInput } from '../../src/iam-config.js'
import type { IamFunctions } from '../../src/iam-types.js'
import { cache } from '@h-ai/cache'
import { db } from '@h-ai/db'
import { afterAll, beforeAll } from 'vitest'
import { iam } from '../../src/index.js'

/** 默认测试密码（满足默认策略） */
export const TEST_PASSWORD = 'TestPass123'

/** 弱密码（不满足策略） */
export const WEAK_PASSWORD = 'abc'

/**
 * 初始化 IAM 单例
 *
 * db / cache 需已初始化。用于需要不同配置的子场景。
 */
export async function initIam(settings?: IamConfigSettingsInput): Promise<IamFunctions> {
  const result = await iam.init({ db, cache, ...(settings ?? {}) })
  if (!result.success) {
    throw new Error(`IAM init failed: ${result.error.message}`)
  }
  return iam
}

/**
 * 创建 IAM 测试环境
 *
 * 每个测试文件顶层 describe 调用一次。
 * beforeAll 初始化 db + cache + iam，afterAll 全部清理。
 */
export function defineIamTestEnv(
  _label: string,
  settings?: IamConfigSettingsInput,
) {
  beforeAll(async () => {
    if (!db.isInitialized) {
      await db.init({ type: 'sqlite', database: ':memory:' })
    }
    if (!cache.isInitialized) {
      await cache.init({ type: 'memory' })
    }

    const result = await iam.init({ db, cache, ...(settings ?? {}) })
    if (!result.success) {
      throw new Error(`IAM init failed in "${_label}": ${result.error.message}`)
    }
  })

  afterAll(async () => {
    await iam.close()
    await cache.close()
    await db.close()
  })

  return iam
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
