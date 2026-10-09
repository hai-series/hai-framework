/**
 * @h-ai/storage — S3 测试容器租约管理
 *
 * MinIO、RustFS 共用建桶、引用计数和失败清理逻辑，各自保留独立的容器状态。
 */

import type { StartedTestContainer } from 'testcontainers'
import { randomBytes } from 'node:crypto'
import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3'

export interface S3ContainerLease {
  host: string
  port: number
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  endpoint: string
  release: () => Promise<void>
}

/** 创建独立的 S3 容器管理器；最后一个租约释放时停止并移除容器及匿名卷 */
export function createS3ContainerManager(
  startContainer: (credentials: Pick<S3ContainerLease, 'accessKeyId' | 'secretAccessKey'>) => Promise<StartedTestContainer>,
): () => Promise<S3ContainerLease> {
  let containerPromise: Promise<StartedTestContainer> | null = null
  let refCount = 0
  // 测试凭据临时生成，避免沿用服务默认的管理员密钥。
  const credentials = {
    accessKeyId: randomBytes(10).toString('hex'),
    secretAccessKey: randomBytes(20).toString('hex'),
  }
  const bucket = 'test-bucket'
  const region = 'us-east-1'

  return async () => {
    refCount += 1
    containerPromise ??= startContainer(credentials)

    let container: StartedTestContainer
    try {
      container = await containerPromise
    }
    catch (error) {
      // 启动失败时重置共享状态，防止拒绝的 promise 污染后续测试。
      refCount -= 1
      if (refCount === 0)
        containerPromise = null
      throw error
    }

    let released = false
    const release = async (): Promise<void> => {
      if (released)
        return
      released = true
      refCount -= 1
      if (refCount === 0) {
        containerPromise = null
        await container.stop({ timeout: 10_000, remove: true, removeVolumes: true })
      }
    }

    const host = container.getHost()
    const port = container.getMappedPort(9000)
    const endpoint = `http://${host}:${port}`
    const s3 = new S3Client({ region, endpoint, forcePathStyle: true, credentials })

    try {
      try {
        await s3.send(new HeadBucketCommand({ Bucket: bucket }))
      }
      catch {
        await s3.send(new CreateBucketCommand({ Bucket: bucket }))
      }
    }
    catch (error) {
      await release()
      throw error
    }
    finally {
      s3.destroy()
    }

    return { host, port, bucket, region, ...credentials, endpoint, release }
  }
}
