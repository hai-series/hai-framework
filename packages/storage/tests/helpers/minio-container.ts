/**
 * =============================================================================
 * @h-ai/storage - MinIO 测试容器管理
 * =============================================================================
 *
 * 使用 Testcontainers 启动 MinIO 实例，为 S3 Provider 提供集成测试环境。
 */

import type { StartedTestContainer } from 'testcontainers'
import { GenericContainer, Wait } from 'testcontainers'

let containerPromise: Promise<StartedTestContainer> | null = null
let refCount = 0

export interface MinioContainerLease {
  host: string
  port: number
  accessKeyId: string
  secretAccessKey: string
  endpoint: string
  release: () => Promise<void>
}

const MINIO_ROOT_USER = 'minioadmin'
const MINIO_ROOT_PASSWORD = 'minioadmin'
const MINIO_BUCKET = 'test-bucket'

export async function acquireMinioContainer(): Promise<MinioContainerLease> {
  refCount += 1

  if (!containerPromise) {
    // 固定镜像版本：minio/minio:latest 的新版本会改动启动行为导致 /minio/health/ready 在 CI 永不就绪。
    containerPromise = new GenericContainer('minio/minio:RELEASE.2025-09-07T16-13-09Z')
      .withExposedPorts(9000)
      .withEnvironment({
        MINIO_ROOT_USER,
        MINIO_ROOT_PASSWORD,
      })
      .withCommand(['server', '/data'])
      .withWaitStrategy(Wait.forHttp('/minio/health/ready', 9000))
      .start()
  }

  let container: StartedTestContainer
  try {
    container = await containerPromise
  }
  catch (error) {
    // 启动失败时重置共享状态：避免被拒绝的 promise 级联失败同一 worker 内的后续测试文件，并防止引用计数泄漏。
    refCount = Math.max(0, refCount - 1)
    if (refCount === 0)
      containerPromise = null
    throw error
  }
  const host = container.getHost()
  const port = container.getMappedPort(9000)
  const endpoint = `http://${host}:${port}`

  // 通过 S3 API 创建测试 bucket
  const { S3Client, CreateBucketCommand, HeadBucketCommand } = await import('@aws-sdk/client-s3')
  const s3 = new S3Client({
    region: 'us-east-1',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: MINIO_ROOT_USER,
      secretAccessKey: MINIO_ROOT_PASSWORD,
    },
  })

  try {
    await s3.send(new HeadBucketCommand({ Bucket: MINIO_BUCKET }))
  }
  catch {
    await s3.send(new CreateBucketCommand({ Bucket: MINIO_BUCKET }))
  }
  s3.destroy()

  return {
    host,
    port,
    accessKeyId: MINIO_ROOT_USER,
    secretAccessKey: MINIO_ROOT_PASSWORD,
    endpoint,
    release: async () => {
      refCount -= 1
      if (refCount <= 0) {
        refCount = 0
        await container.stop()
        containerPromise = null
      }
    },
  }
}
