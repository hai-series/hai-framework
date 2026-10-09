/**
 * @h-ai/storage — MinIO 测试容器
 *
 * 使用固定版本的社区源码构建镜像，避免依赖不稳定的 MinIO 官方镜像仓库。
 */

import { GenericContainer, Wait } from 'testcontainers'
import { createS3ContainerManager } from './s3-container.js'

const MINIO_IMAGE = 'ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z'

export const acquireMinioContainer = createS3ContainerManager(credentials =>
  new GenericContainer(MINIO_IMAGE)
    .withExposedPorts(9000)
    .withEnvironment({
      MINIO_ROOT_USER: credentials.accessKeyId,
      MINIO_ROOT_PASSWORD: credentials.secretAccessKey,
    })
    .withCommand(['server', '/data'])
    .withWaitStrategy(Wait.forHttp('/minio/health/ready', 9000))
    .withStartupTimeout(120_000)
    .start(),
)
