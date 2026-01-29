/**
 * =============================================================================
 * @hai/storage - S3 容器化测试
 * =============================================================================
 *
 * 使用 testcontainers 启动 MinIO 容器进行 S3 协议集成测试。
 * 测试需要 Docker 环境。
 *
 * 运行方式：
 *   pnpm test:container
 *
 * =============================================================================
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers'
import { storage } from '../src/index.js'
import {
    StorageTestConfig,
    runAllTests,
} from './storage-test-shared.js'

// =============================================================================
// S3 测试配置
// =============================================================================

const s3Config: StorageTestConfig = {
    name: 'S3 (MinIO)',
    type: 's3',
    supportRealPresignUrl: true,
}

// =============================================================================
// 测试套件
// =============================================================================

describe('@hai/storage - S3 (容器化测试)', () => {
    let container: StartedTestContainer

    beforeAll(async () => {
        // 启动 MinIO 容器
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

        // 创建测试 bucket（使用 MinIO client API）
        const { S3Client, CreateBucketCommand } = await import('@aws-sdk/client-s3')
        const client = new S3Client({
            region: 'us-east-1',
            endpoint,
            forcePathStyle: true,
            credentials: {
                accessKeyId: 'minioadmin',
                secretAccessKey: 'minioadmin',
            },
        })

        try {
            await client.send(new CreateBucketCommand({ Bucket: 'test-bucket' }))
        } catch (error) {
            // 忽略 bucket 已存在的错误
        }

        client.destroy()

        // 初始化存储连接
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
    }, 120000) // 2 分钟超时

    afterAll(async () => {
        await storage.close()
        if (container) {
            await container.stop()
        }
    })

    // -------------------------------------------------------------------------
    // 初始化测试
    // -------------------------------------------------------------------------
    describe('初始化', () => {
        it('应该正确初始化', () => {
            expect(storage.isInitialized).toBe(true)
            expect(storage.config?.type).toBe('s3')
        })
    })

    // -------------------------------------------------------------------------
    // 共享测试
    // -------------------------------------------------------------------------
    runAllTests(s3Config)
})

// =============================================================================
// 带前缀的 S3 测试
// =============================================================================

describe('@hai/storage - S3 with prefix (容器化测试)', () => {
    let container: StartedTestContainer

    beforeAll(async () => {
        // 启动 MinIO 容器
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
            credentials: {
                accessKeyId: 'minioadmin',
                secretAccessKey: 'minioadmin',
            },
        })

        try {
            await client.send(new CreateBucketCommand({ Bucket: 'test-bucket-prefix' }))
        } catch {
            // 忽略
        }

        client.destroy()

        // 初始化带前缀的存储连接
        const result = await initStorage({
            type: 's3',
            bucket: 'test-bucket-prefix',
            region: 'us-east-1',
            endpoint,
            accessKeyId: 'minioadmin',
            secretAccessKey: 'minioadmin',
            forcePathStyle: true,
            prefix: 'app/uploads',
        })

        expect(result.success).toBe(true)
    }, 120000)

    afterAll(async () => {
        await closeStorage()
        if (container) {
            await container.stop()
        }
    })

    it('应该正确处理路径前缀', async () => {
        const content = 'test with prefix'
        const putResult = await storage.file.put('file.txt', content)

        expect(putResult.success).toBe(true)

        // 验证可以用同样的 key 获取
        const getResult = await storage.file.get('file.txt')
        expect(getResult.success).toBe(true)
        if (getResult.success) {
            expect(getResult.data.toString()).toBe(content)
        }
    })

    it('列表应该正确处理前缀', async () => {
        await storage.file.put('dir/file1.txt', 'content1')
        await storage.file.put('dir/file2.txt', 'content2')

        const result = await storage.dir.list({ prefix: 'dir/' })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.files.length).toBe(2)
            // 返回的 key 应该不包含全局前缀
            expect(result.data.files.map(f => f.key)).toContain('dir/file1.txt')
            expect(result.data.files.map(f => f.key)).toContain('dir/file2.txt')
        }
    })
})

// =============================================================================
// 带公开 URL 的 S3 测试
// =============================================================================

describe('@hai/storage - S3 with publicUrl (容器化测试)', () => {
    let container: StartedTestContainer

    beforeAll(async () => {
        // 启动 MinIO 容器
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
            credentials: {
                accessKeyId: 'minioadmin',
                secretAccessKey: 'minioadmin',
            },
        })

        try {
            await client.send(new CreateBucketCommand({ Bucket: 'test-bucket-public' }))
        } catch {
            // 忽略
        }

        client.destroy()

        // 初始化带 publicUrl 的存储连接
        const result = await initStorage({
            type: 's3',
            bucket: 'test-bucket-public',
            region: 'us-east-1',
            endpoint,
            accessKeyId: 'minioadmin',
            secretAccessKey: 'minioadmin',
            forcePathStyle: true,
            publicUrl: 'https://cdn.example.com',
        })

        expect(result.success).toBe(true)
    }, 120000)

    afterAll(async () => {
        await closeStorage()
        if (container) {
            await container.stop()
        }
    })

    it('publicUrl - 应该返回正确的公开 URL', () => {
        const url = storage.presign.publicUrl('images/photo.jpg')
        expect(url).toBe('https://cdn.example.com/images/photo.jpg')
    })

    it('publicUrl - 带前缀应该正确拼接', async () => {
        // 重新初始化带前缀
        await closeStorage()

        const host = container.getHost()
        const port = container.getMappedPort(9000)

        await initStorage({
            type: 's3',
            bucket: 'test-bucket-public',
            region: 'us-east-1',
            endpoint: `http://${host}:${port}`,
            accessKeyId: 'minioadmin',
            secretAccessKey: 'minioadmin',
            forcePathStyle: true,
            prefix: 'app',
            publicUrl: 'https://cdn.example.com',
        })

        const url = storage.presign.publicUrl('images/photo.jpg')
        expect(url).toBe('https://cdn.example.com/app/images/photo.jpg')
    })
})
