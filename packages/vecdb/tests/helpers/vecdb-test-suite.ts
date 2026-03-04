/**
 * =============================================================================
 * @h-ai/vecdb - 测试套件辅助
 *
 * 参考 @h-ai/reldb 测试架构，提供跨 Provider 的统一测试环境管理。
 * 支持 LanceDB（本地文件）、pgvector（容器）和 Qdrant（容器）三种后端。
 * =============================================================================
 */

import type { VecdbConfigInput } from '../../src/index.js'
import { afterAll, afterEach, beforeAll, beforeEach, describe } from 'vitest'
import { vecdb } from '../../src/index.js'
import { isDockerAvailable } from './check-docker.js'
import { acquirePgvectorContainer } from './pgvector-container.js'
import { acquireQdrantContainer } from './qdrant-container.js'

/** 测试环境描述 */
export interface VecdbTestEnv {
  config: VecdbConfigInput
  release?: () => Promise<void>
}

/**
 * 等待 vecdb 就绪
 *
 * 初始化后通过 collection.list 确认连接可用。
 */
async function waitForReady(maxAttempts = 10, intervalMs = 2000): Promise<void> {
  let lastError: string | null = null
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const ping = await vecdb.collection.list()
    if (ping.success) {
      return
    }
    lastError = ping.error.message
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  throw new Error(`vecdb ping failed after ${maxAttempts} attempts: ${lastError ?? 'unknown error'}`)
}

/**
 * 定义跨 Provider 的向量数据库测试套件
 *
 * 自动管理 init/close 生命周期和容器资源，与 reldb 的 defineDbSuite 对应。
 *
 * @param label - 测试标签，如 'lancedb' / 'pgvector' / 'qdrant'
 * @param setup - 返回测试环境配置（含容器释放回调）
 * @param defineTests - 在套件内部定义具体测试用例
 * @param options - 额外选项
 * @param options.requiresDocker - 是否需要 Docker（默认 false），为 true 时 Docker 不可用则跳过
 */
export function defineVecdbSuite(
  label: string,
  setup: () => Promise<VecdbTestEnv> | VecdbTestEnv,
  defineTests: () => void,
  options?: { requiresDocker?: boolean },
): void {
  const needDocker = options?.requiresDocker ?? false
  const suiteFn = needDocker && !isDockerAvailable()
    ? describe.sequential.skip
    : describe.sequential

  suiteFn(`vecdb (${label})`, () => {
    let env: VecdbTestEnv | null = null

    beforeAll(async () => {
      env = await setup()
    }, 300_000)

    beforeEach(async () => {
      await vecdb.close()
      const initResult = await vecdb.init(env!.config)
      if (!initResult.success) {
        throw new Error(`vecdb init failed: ${initResult.error.code} ${initResult.error.message}`)
      }
      await waitForReady()

      // 清理上一轮测试遗留的集合，确保每个测试用例环境干净
      const listResult = await vecdb.collection.list()
      if (listResult.success) {
        for (const name of listResult.data) {
          await vecdb.collection.drop(name)
        }
      }
    }, 120_000)

    afterEach(async () => {
      await vecdb.close()
    })

    afterAll(async () => {
      await env?.release?.()
      env = null
    }, 300_000)

    defineTests()
  })
}

/**
 * LanceDB 测试环境（本地路径，需要 @lancedb/lancedb 可用）
 */
export function lancedbEnv(path: string): VecdbTestEnv {
  return {
    config: { type: 'lancedb', path },
    release: async () => {
      try {
        const { rm } = await import('node:fs/promises')
        await rm(path, { recursive: true, force: true })
      }
      catch {
        // 忽略清理错误
      }
    },
  }
}

/**
 * pgvector 测试环境（通过 Testcontainers 启动 pgvector 容器）
 */
export async function pgvectorEnv(): Promise<VecdbTestEnv> {
  const lease = await acquirePgvectorContainer()
  return {
    config: {
      type: 'pgvector',
      host: lease.host,
      port: lease.port,
      database: lease.database,
      user: lease.user,
      password: lease.password,
      tablePrefix: 'vec_',
    },
    release: lease.release,
  }
}

/** pgvectorEnv 的 requiresDocker 配套选项 */
export const pgvectorDockerOpts = { requiresDocker: true } as const

/**
 * Qdrant 测试环境（通过 Testcontainers 启动 Qdrant 容器）
 */
export async function qdrantEnv(): Promise<VecdbTestEnv> {
  const lease = await acquireQdrantContainer()
  return {
    config: {
      type: 'qdrant',
      url: lease.url,
    },
    release: lease.release,
  }
}

/** qdrantEnv 的 requiresDocker 配套选项 */
export const qdrantDockerOpts = { requiresDocker: true } as const
