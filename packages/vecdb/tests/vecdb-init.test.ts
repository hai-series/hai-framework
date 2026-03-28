/**
 * =============================================================================
 * @h-ai/vecdb - 初始化与生命周期 容器化测试
 *
 * 覆盖 vecdb.init / vecdb.close / vecdb.isInitialized / vecdb.config / 重初始化。
 * 在 pgvector 和 Qdrant 容器上运行。
 * =============================================================================
 */

import type { PgvectorContainerLease } from './helpers/pgvector-container.js'
import type { QdrantContainerLease } from './helpers/qdrant-container.js'
import { rm } from 'node:fs/promises'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { HaiVecdbError, vecdb } from '../src/index.js'
import { isDockerAvailable } from './helpers/check-docker.js'
import { acquirePgvectorContainer } from './helpers/pgvector-container.js'
import { acquireQdrantContainer } from './helpers/qdrant-container.js'

const dockerAvailable = isDockerAvailable()

// ─── LanceDB 初始化测试 ───

describe.sequential('vecdb init — lancedb', () => {
  const LANCE_PATH = './test-data/init-lance-test'

  afterEach(async () => {
    await vecdb.close()
  })

  afterAll(async () => {
    await rm(LANCE_PATH, { recursive: true, force: true }).catch(() => {})
  })

  it('初始化 lancedb 成功', async () => {
    const result = await vecdb.init({ type: 'lancedb', path: LANCE_PATH })
    expect(result.success).toBe(true)
    expect(vecdb.isInitialized).toBe(true)
    expect(vecdb.config?.type).toBe('lancedb')
  })

  it('关闭后 isInitialized 为 false', async () => {
    await vecdb.init({ type: 'lancedb', path: LANCE_PATH })
    await vecdb.close()
    expect(vecdb.isInitialized).toBe(false)
    expect(vecdb.config).toBeNull()
  })

  it('重复 close 安全', async () => {
    await vecdb.init({ type: 'lancedb', path: LANCE_PATH })
    await vecdb.close()
    const result = await vecdb.close()
    expect(result.success).toBe(true)
  })

  it('重新初始化成功', async () => {
    await vecdb.init({ type: 'lancedb', path: LANCE_PATH })
    const result = await vecdb.init({ type: 'lancedb', path: LANCE_PATH })
    expect(result.success).toBe(true)
    expect(vecdb.isInitialized).toBe(true)
  })
})

// ─── pgvector 初始化测试（需要 Docker） ───

describe.skipIf(!dockerAvailable).sequential('vecdb init — pgvector', () => {
  let lease: PgvectorContainerLease

  beforeAll(async () => {
    lease = await acquirePgvectorContainer()
  }, 300_000)

  afterEach(async () => {
    await vecdb.close()
  })

  afterAll(async () => {
    await lease?.release()
  }, 300_000)

  it('初始化 pgvector 成功', async () => {
    const result = await vecdb.init({
      type: 'pgvector',
      host: lease.host,
      port: lease.port,
      database: lease.database,
      user: lease.user,
      password: lease.password,
    })
    expect(result.success).toBe(true)
    expect(vecdb.isInitialized).toBe(true)
    expect(vecdb.config?.type).toBe('pgvector')
  })

  it('关闭后 isInitialized 为 false', async () => {
    await vecdb.init({
      type: 'pgvector',
      host: lease.host,
      port: lease.port,
      database: lease.database,
      user: lease.user,
      password: lease.password,
    })
    await vecdb.close()
    expect(vecdb.isInitialized).toBe(false)
    expect(vecdb.config).toBeNull()
  })

  it('重复 close 安全', async () => {
    await vecdb.init({
      type: 'pgvector',
      host: lease.host,
      port: lease.port,
      database: lease.database,
      user: lease.user,
      password: lease.password,
    })
    await vecdb.close()
    const result = await vecdb.close()
    expect(result.success).toBe(true)
  })

  it('重新初始化成功', async () => {
    await vecdb.init({
      type: 'pgvector',
      host: lease.host,
      port: lease.port,
      database: lease.database,
      user: lease.user,
      password: lease.password,
    })
    // 重新初始化（不先 close）
    const result = await vecdb.init({
      type: 'pgvector',
      host: lease.host,
      port: lease.port,
      database: lease.database,
      user: lease.user,
      password: lease.password,
    })
    expect(result.success).toBe(true)
    expect(vecdb.isInitialized).toBe(true)
  })

  it('错误的连接参数返回 CONNECTION_FAILED', async () => {
    const result = await vecdb.init({
      type: 'pgvector',
      host: 'invalid-host',
      port: 1,
      database: 'nonexistent',
      user: 'nobody',
      password: 'wrong',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiVecdbError.CONNECTION_FAILED.code)
    }
  })
})

// ─── Qdrant 初始化测试（需要 Docker） ───

describe.skipIf(!dockerAvailable).sequential('vecdb init — qdrant', () => {
  let lease: QdrantContainerLease

  beforeAll(async () => {
    lease = await acquireQdrantContainer()
  }, 300_000)

  afterEach(async () => {
    await vecdb.close()
  })

  afterAll(async () => {
    await lease?.release()
  }, 300_000)

  it('初始化 qdrant 成功', async () => {
    const result = await vecdb.init({
      type: 'qdrant',
      url: lease.url,
    })
    expect(result.success).toBe(true)
    expect(vecdb.isInitialized).toBe(true)
    expect(vecdb.config?.type).toBe('qdrant')
  })

  it('关闭后 isInitialized 为 false', async () => {
    await vecdb.init({ type: 'qdrant', url: lease.url })
    await vecdb.close()
    expect(vecdb.isInitialized).toBe(false)
    expect(vecdb.config).toBeNull()
  })

  it('错误的连接 URL 返回 CONNECTION_FAILED', async () => {
    const result = await vecdb.init({
      type: 'qdrant',
      url: 'http://invalid-host:6333',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiVecdbError.CONNECTION_FAILED.code)
    }
  })
})
