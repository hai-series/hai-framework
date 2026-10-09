/**
 * @h-ai/storage — RustFS 测试容器
 *
 * 使用官方固定版本镜像，通过 S3 API 验证单节点单盘实例。
 */

import { GenericContainer, Wait } from 'testcontainers'
import { createS3ContainerManager } from './s3-container.js'

const RUSTFS_IMAGE = 'ghcr.io/rustfs/rustfs:1.0.1'

export const acquireRustfsContainer = createS3ContainerManager(credentials =>
  new GenericContainer(RUSTFS_IMAGE)
    .withExposedPorts(9000)
    .withEnvironment({
      RUSTFS_ACCESS_KEY: credentials.accessKeyId,
      RUSTFS_SECRET_KEY: credentials.secretAccessKey,
      RUSTFS_ADDRESS: '0.0.0.0:9000',
      RUSTFS_VOLUMES: '/data',
      RUSTFS_CONSOLE_ENABLE: 'false',
    })
    .withWaitStrategy(Wait.forHttp('/health/ready', 9000))
    .withStartupTimeout(120_000)
    .start(),
)
