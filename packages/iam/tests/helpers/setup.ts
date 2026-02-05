/**
 * =============================================================================
 * @hai/iam - 测试辅助模块
 * =============================================================================
 *
 * 提供测试环境的初始化和清理功能。
 *
 * @module tests/helpers/setup
 * =============================================================================
 */

import type { CacheService } from '@hai/cache'
import type { IamConfigInput } from '../../src/iam-config.js'
import { ok } from '@hai/core'
import { db } from '@hai/db'

/**
 * 初始化测试数据库（使用 sqlite 内存数据库）
 */
export async function setupTestDb() {
  const initResult = await db.init({
    type: 'sqlite',
    database: ':memory:',
  })

  if (!initResult.success) {
    throw new Error(`初始化测试数据库失败: ${initResult.error.message}`)
  }

  return db
}

/**
 * 关闭测试数据库
 */
export async function teardownTestDb() {
  await db.close()
}

/**
 * 创建内存 Cache Mock（用于测试）
 */
export function createMockCacheService(): CacheService {
  const store = new Map<string, { value: unknown, expiresAt?: number }>()

  return {
    isConnected: true,
    async get<T>(key: string) {
      const entry = store.get(key)
      if (!entry) {
        return ok(undefined as T | undefined)
      }
      // 检查过期
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        store.delete(key)
        return ok(undefined as T | undefined)
      }
      return ok(entry.value as T)
    },
    async set(key: string, value: unknown, options?: { ex?: number }) {
      const expiresAt = options?.ex ? Date.now() + options.ex * 1000 : undefined
      store.set(key, { value, expiresAt })
      return ok(undefined)
    },
    async del(key: string) {
      store.delete(key)
      return ok(1)
    },
    async exists(key: string) {
      return ok(store.has(key) ? 1 : 0)
    },
    async expire(key: string, seconds: number) {
      const entry = store.get(key)
      if (entry) {
        entry.expiresAt = Date.now() + seconds * 1000
        return ok(true)
      }
      return ok(false)
    },
    async ttl(key: string) {
      const entry = store.get(key)
      if (!entry || !entry.expiresAt) {
        return ok(-1)
      }
      return ok(Math.ceil((entry.expiresAt - Date.now()) / 1000))
    },
    async keys(_pattern: string) {
      return ok([...store.keys()])
    },
    async flushdb() {
      store.clear()
      return ok(undefined)
    },
    async ping() {
      return ok('PONG')
    },
    async close() {
      return ok(undefined)
    },
  }
}

/**
 * 默认测试配置
 */
export const defaultTestConfig: IamConfigInput = {
  strategies: ['password'],
  password: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
  },
  session: {
    type: 'jwt',
    jwt: {
      secret: 'test-secret-key-must-be-at-least-32-characters',
      algorithm: 'HS256',
      accessTokenExpiresIn: 900,
      refreshTokenExpiresIn: 604800,
    },
  },
}
