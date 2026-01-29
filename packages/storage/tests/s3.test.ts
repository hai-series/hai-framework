/**
 * =============================================================================
 * @hai/storage - S3 容器化测试（契约化精简版）
 * =============================================================================
 *
 * 使用 testcontainers 启动 MinIO 容器进行 S3 协议集成测试。
 *
 * =============================================================================
 */

import type { StartedTestContainer } from 'testcontainers'
import type { StorageTestConfig } from './storage-test-shared.js'
import { GenericContainer, Wait } from 'testcontainers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { storage } from '../src/index.js'
import { runAllTests } from './storage-test-shared.js'

const s3Config: StorageTestConfig = {
  name: 'S3 (MinIO)',
  type: 's3',
  supportRealPresignUrl: true,
}

describe('@hai/storage - S3 (容器化测试)', () => {
  let container: StartedTestContainer

  beforeAll(async () => {
    container = await new GenericContainer('minio/minio:latest')
      .withEnvironment({
        MINIO_ROOT_USER: 'minioadmin',
        MINIO_ROOT_PASSWORD: 'minioadmin',
      })
      .withCommand(['server', '/data'])
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forHttp('/minio/health/ready', 9000))
      .start()

    const host = container.getHost()
    const port = container.getMappedPort(9000)
    const endpoint = `http://${host}:${port}`

    // 创建测试 bucket
    const { S3Client, CreateBucketCommand } = await import('@aws-sdk/client-s3')
    const client = new S3Client({
      region: 'us-east-1',
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: 'minioadmin', secretAccessKey: 'minioadmin' },
    })
    try {
      await client.send(new CreateBucketCommand({ Bucket: 'test-bucket' }))
    }
    catch { /* ignore */ }
    client.destroy()

    const result = await storage.init({
      type: 's3',
      bucket: 'test-bucket',
      region: 'us-east-1',
      endpoint,
      accessKeyId: 'minioadmin',
      secretAccessKey: 'minioadmin',
      forcePathStyle: true,
    })
    expect(result.success).toBe(true)
  }, 120000)

  afterAll(async () => {
    await storage.close()
    if (container)
      await container.stop()
  })

  describe('初始化', () => {
    it('应该正确初始化', () => {
      expect(storage.isInitialized).toBe(true)
      expect(storage.config?.type).toBe('s3')
    })
  })

  runAllTests(s3Config)
})
