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
const MINIO_IMAGE = 'quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z'
const CONTAINER_STOP_TIMEOUT_MS = 10_000

async function stopMinioContainer(container: StartedTestContainer): Promise<void> {
  await container.stop({
    timeout: CONTAINER_STOP_TIMEOUT_MS,
    remove: true,
    removeVolumes: true,
  })
}

export async function acquireMinioContainer(): Promise<MinioContainerLease> {
  refCount += 1

  if (!containerPromise) {
    // Docker Hub 上的 minio/minio 已归档，干净的 CI runner 无法再拉取；固定版本从官方 Quay 仓库获取。
    containerPromise = new GenericContainer(MINIO_IMAGE)
      .withExposedPorts(9000)
      .withEnvironment({
        MINIO_ROOT_USER,
        MINIO_ROOT_PASSWORD,
      })
      .withCommand(['server', '/data'])
      .withWaitStrategy(Wait.forHttp('/minio/health/ready', 9000))
      .withStartupTimeout(120_000)
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

  let released = false
  const release = async (): Promise<void> => {
    if (released)
      return
    released = true

    refCount -= 1
    if (refCount <= 0) {
      refCount = 0
      containerPromise = null
      await stopMinioContainer(container)
    }
  }

  try {
    await s3.send(new HeadBucketCommand({ Bucket: MINIO_BUCKET }))
  }
  catch {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: MINIO_BUCKET }))
    }
    catch (error) {
      await release()
      throw error
    }
  }
  finally {
    s3.destroy()
  }

  return {
    host,
    port,
    accessKeyId: MINIO_ROOT_USER,
    secretAccessKey: MINIO_ROOT_PASSWORD,
    endpoint,
    release,
  }
}
