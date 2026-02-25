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
    containerPromise = new GenericContainer('minio/minio:latest')
      .withExposedPorts(9000)
      .withEnvironment({
        MINIO_ROOT_USER,
        MINIO_ROOT_PASSWORD,
      })
      .withCommand(['server', '/data'])
      .withWaitStrategy(Wait.forHttp('/minio/health/ready', 9000))
      .start()
  }

  const container = await containerPromise
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
