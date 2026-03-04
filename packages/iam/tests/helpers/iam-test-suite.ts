/**
 * @h-ai/iam — 测试套件辅助
 *
 * 参照 @h-ai/storage 测试风格，提供多环境 IAM 测试支撑：
 * - sqlite + memory：轻量快速（默认，无需 Docker）
 * - postgresql + redis：真实外部服务（需 Docker）
 *
 * 每个 defineIamSuite 会在 beforeAll 初始化 db + cache + iam，
 * afterAll 全部清理。测试体通过闭包拿到 iam 实例。
 */

import type { IamConfigInput, IamFunctions } from '../../src/iam-types.js'
import type { LdapContainerLease } from './ldap-container.js'
import type { PostgresContainerLease } from './postgres-container.js'
import type { RedisContainerLease } from './redis-container.js'
import { cache } from '@h-ai/cache'
import { reldb } from '@h-ai/reldb'
import { afterAll, beforeAll, describe } from 'vitest'
import { iam } from '../../src/index.js'
import { acquireLdapContainer } from './ldap-container.js'
import { acquirePostgresContainer } from './postgres-container.js'
import { acquireRedisContainer } from './redis-container.js'

/** 默认测试密码（满足默认策略） */
export const TEST_PASSWORD = 'TestPass123'

/** 弱密码（不满足策略） */
export const WEAK_PASSWORD = 'abc'

// =============================================================================
// 测试环境定义
// =============================================================================

export interface IamTestEnv {
  /** 标签（用于 describe 输出） */
  label: string
  /** 初始化 db + cache */
  setup: () => Promise<void>
  /** 清理 db + cache 及容器 */
  cleanup: () => Promise<void>
}

/**
 * SQLite 内存 + 内存缓存（快速，无 Docker 依赖）
 */
export function sqliteMemoryEnv(): IamTestEnv {
  return {
    label: 'sqlite+memory',
    async setup() {
      if (!reldb.isInitialized) {
        await reldb.init({ type: 'sqlite', database: ':memory:' })
      }
      if (!cache.isInitialized) {
        await cache.init({ type: 'memory' })
      }
    },
    async cleanup() {
      await cache.close()
      await reldb.close()
    },
  }
}

/** 等待数据库连接就绪（PostgreSQL 连接池可能需要时间建立） */
async function waitForDbReady(maxAttempts = 10, intervalMs = 1000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const ping = await reldb.sql.query('SELECT 1')
    if (ping.success)
      return
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  throw new Error(`db ping failed after ${maxAttempts} attempts`)
}

/**
 * PostgreSQL + Redis（真实外部服务，需 Docker）
 */
export async function postgresRedisEnv(): Promise<IamTestEnv> {
  let pgLease: PostgresContainerLease | null = null
  let redisLease: RedisContainerLease | null = null

  return {
    label: 'postgres+redis',
    async setup() {
      ;[pgLease, redisLease] = await Promise.all([
        acquirePostgresContainer(),
        acquireRedisContainer(),
      ])

      if (!reldb.isInitialized) {
        await reldb.init({
          type: 'postgresql',
          host: pgLease!.host,
          port: pgLease!.port,
          database: pgLease!.database,
          user: pgLease!.user,
          password: pgLease!.password,
          pool: { max: 5 },
        })
      }
      await waitForDbReady()
      if (!cache.isInitialized) {
        await cache.init({
          type: 'redis',
          host: redisLease!.host,
          port: redisLease!.port,
        })
      }
    },
    async cleanup() {
      await cache.close()
      await reldb.close()
      await pgLease?.release()
      await redisLease?.release()
    },
  }
}

/**
 * PostgreSQL + Redis + OpenLDAP（完整集成环境）
 */
export async function fullIntegrationEnv(): Promise<IamTestEnv & { ldapLease: LdapContainerLease }> {
  let pgLease: PostgresContainerLease | null = null
  let redisLease: RedisContainerLease | null = null
  let ldapLease: LdapContainerLease | null = null

  const env: IamTestEnv & { ldapLease: LdapContainerLease } = {
    label: 'postgres+redis+ldap',
    get ldapLease(): LdapContainerLease {
      if (!ldapLease)
        throw new Error('LDAP container not yet started')
      return ldapLease
    },
    async setup() {
      // 并行启动所有容器
      ;[pgLease, redisLease, ldapLease] = await Promise.all([
        acquirePostgresContainer(),
        acquireRedisContainer(),
        acquireLdapContainer(),
      ])

      if (!reldb.isInitialized) {
        await reldb.init({
          type: 'postgresql',
          host: pgLease!.host,
          port: pgLease!.port,
          database: pgLease!.database,
          user: pgLease!.user,
          password: pgLease!.password,
          pool: { max: 5 },
        })
      }
      await waitForDbReady()
      if (!cache.isInitialized) {
        await cache.init({
          type: 'redis',
          host: redisLease!.host,
          port: redisLease!.port,
        })
      }
    },
    async cleanup() {
      await cache.close()
      await reldb.close()
      await pgLease?.release()
      await redisLease?.release()
      await ldapLease?.release()
    },
  }

  return env
}

// =============================================================================
// 测试套件定义
// =============================================================================

/** 测试用的 IAM 设置类型（包含 settings + 运行时依赖，不含 db/cache） */
type IamTestSettings = Omit<IamConfigInput, 'db' | 'cache'>

/**
 * 定义 IAM 测试套件
 *
 * 参照 storage 的 defineStorageSuite 模式：
 * - beforeAll：初始化环境 + 初始化 IAM
 * - afterAll：关闭 IAM + 清理环境
 * - defineTests 接收 iam 实例引用
 */
export function defineIamSuite(
  label: string,
  envOrFactory: IamTestEnv | (() => Promise<IamTestEnv>),
  defineTests: (getIam: () => IamFunctions) => void,
  iamSettings?: IamTestSettings | (() => IamTestSettings),
): void {
  const envRef: { env: IamTestEnv | null } = { env: null }

  describe.sequential(`iam (${label})`, () => {
    beforeAll(async () => {
      const env = typeof envOrFactory === 'function' ? await envOrFactory() : envOrFactory
      envRef.env = env
      await env.setup()

      const resolvedSettings = typeof iamSettings === 'function' ? iamSettings() : (iamSettings ?? {})

      const result = await iam.init({ db: reldb, cache, ...resolvedSettings } as IamConfigInput)
      if (!result.success) {
        throw new Error(`IAM init failed in "${label}": ${JSON.stringify(result.error)}`)
      }
    }, 300_000)

    afterAll(async () => {
      await iam.close()
      await envRef.env?.cleanup()
      envRef.env = null
    }, 300_000)

    defineTests(() => iam)
  })
}

/**
 * 定义仅环境级别的测试套件（不自动创建 IAM 实例）
 *
 * 用于 init 生命周期测试等需要手动管理 IAM 实例的场景。
 * beforeAll 仅初始化 db + cache，afterAll 仅清理环境。
 *
 * @param label - 环境标签
 * @param envOrFactory - 环境对象或异步工厂
 * @param defineTests - 测试定义函数
 */
export function defineIamEnvSuite(
  label: string,
  envOrFactory: IamTestEnv | (() => Promise<IamTestEnv>),
  defineTests: () => void,
): void {
  const envRef: { env: IamTestEnv | null } = { env: null }

  describe.sequential(`iam (${label})`, () => {
    beforeAll(async () => {
      const env = typeof envOrFactory === 'function' ? await envOrFactory() : envOrFactory
      envRef.env = env
      await env.setup()
    }, 300_000)

    afterAll(async () => {
      await envRef.env?.cleanup()
      envRef.env = null
    }, 300_000)

    defineTests()
  })
}

/**
 * 初始化 IAM 单例（不同配置）
 *
 * db / cache 需已初始化。用于需要不同配置的子场景。
 * 注意：会重置当前 IAM 状态。
 */
export async function initIam(settings?: Omit<IamConfigInput, 'db' | 'cache'>): Promise<IamFunctions> {
  await iam.close()
  const result = await iam.init({ db: reldb, cache, ...(settings ?? {}) } as IamConfigInput)
  if (!result.success) {
    throw new Error(`IAM init failed: ${JSON.stringify(result.error)}`)
  }
  return iam
}
