/**
 * =============================================================================
 * @hai/iam - 测试套件辅助
 * =============================================================================
 *
 * 参照 @hai/storage 测试风格，提供多环境 IAM 测试支撑：
 * - sqlite + memory：轻量快速（默认，无需 Docker）
 * - postgresql + redis：真实外部服务（需 Docker）
 *
 * 每个 defineIamSuite 会在 beforeAll 初始化 db + cache + iam，
 * afterAll 全部清理。测试体通过闭包拿到 iam 实例。
 */

import type { IamConfigInput, IamInitOptions, IamService } from '../../src/iam-main.js'
import type { LdapContainerLease } from './ldap-container.js'
import type { PostgresContainerLease } from './postgres-container.js'
import type { RedisContainerLease } from './redis-container.js'
import { cache } from '@hai/cache'
import { db } from '@hai/db'
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
      if (!db.isInitialized) {
        await db.init({ type: 'sqlite', database: ':memory:' })
      }
      if (!cache.isInitialized) {
        await cache.init({ type: 'memory' })
      }
    },
    async cleanup() {
      await cache.close()
      await db.close()
    },
  }
}

/** 等待数据库连接就绪（PostgreSQL 连接池可能需要时间建立） */
async function waitForDbReady(maxAttempts = 10, intervalMs = 1000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const ping = await db.sql.query('SELECT 1')
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

      if (!db.isInitialized) {
        await db.init({
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
      await db.close()
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

      if (!db.isInitialized) {
        await db.init({
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
      await db.close()
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

/**
 * 定义 IAM 测试套件
 *
 * 参照 storage 的 defineStorageSuite 模式：
 * - beforeAll：初始化环境 + 创建 IAM 实例
 * - afterAll：关闭 IAM + 清理环境
 * - defineTests 接收 iam 实例引用
 *
 * @param label - 环境标签（如 'sqlite+memory'）
 * @param envOrFactory - 环境对象或异步工厂
 * @param defineTests - 测试定义函数，参数为 () => IamService 的 getter
 * @param iamConfig - IAM 配置（可选，同步值或延迟工厂）
 * @param iamOptions - IAM 初始化选项（可选，同步值或延迟工厂，不含 cache）
 */
export function defineIamSuite(
  label: string,
  envOrFactory: IamTestEnv | (() => Promise<IamTestEnv>),
  defineTests: (getIam: () => IamService) => void,
  iamConfig?: IamConfigInput | (() => IamConfigInput),
  iamOptions?: Partial<Omit<IamInitOptions, 'cache'>> | (() => Partial<Omit<IamInitOptions, 'cache'>>),
): void {
  const envRef: { env: IamTestEnv | null } = { env: null }
  const iamRef: { instance: IamService | null } = { instance: null }

  describe.sequential(`iam (${label})`, () => {
    beforeAll(async () => {
      const env = typeof envOrFactory === 'function' ? await envOrFactory() : envOrFactory
      envRef.env = env
      await env.setup()

      const resolvedConfig = typeof iamConfig === 'function' ? iamConfig() : (iamConfig ?? {})
      const resolvedOptions = typeof iamOptions === 'function' ? iamOptions() : (iamOptions ?? {})

      const instance = iam.create()
      const result = await instance.init(db, resolvedConfig, {
        cache,
        ...resolvedOptions,
      })
      if (!result.success) {
        throw new Error(`IAM init failed in "${label}": ${JSON.stringify(result.error)}`)
      }
      iamRef.instance = instance
    }, 300_000)

    afterAll(async () => {
      await iamRef.instance?.close()
      iamRef.instance = null
      await envRef.env?.cleanup()
      envRef.env = null
    }, 300_000)

    defineTests(() => {
      if (!iamRef.instance)
        throw new Error('IAM instance not initialized')
      return iamRef.instance
    })
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
 * 创建并初始化独立 IAM 实例
 *
 * db / cache 需已初始化。用于需要不同配置的子场景。
 */
export async function createIamInstance(
  configInput?: IamConfigInput,
  optionsOverride?: Partial<Omit<IamInitOptions, 'cache'>>,
): Promise<IamService> {
  const instance = iam.create()
  const result = await instance.init(db, configInput ?? {}, {
    cache,
    ...optionsOverride,
  })
  if (!result.success) {
    throw new Error(`IAM init failed: ${JSON.stringify(result.error)}`)
  }
  return instance
}
