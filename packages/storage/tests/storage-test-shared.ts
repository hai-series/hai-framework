/**
 * =============================================================================
 * @hai/storage - 共享测试模块
 * =============================================================================
 *
 * 抽象统一的存储测试逻辑，各存储类型测试文件只需提供：
 * - 初始化/清理逻辑
 * - 存储特定的差异化测试
 *
 * =============================================================================
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { storage, StorageErrorCode } from '../src/index.js'

/**
 * 测试配置
 */
export interface StorageTestConfig {
    /** 存储类型名称 */
    name: string
    /** 存储类型 */
    type: 's3' | 'local'
    /** 是否支持签名 URL（用于真实下载） */
    supportRealPresignUrl: boolean
    /** 公开 URL 前缀（如果配置了的话） */
    publicUrlPrefix?: string
}

/**
 * 运行文件操作测试
 */
export function runFileTests(config: StorageTestConfig) {
    describe('文件操作 (storage.file)', () => {
        beforeEach(async () => {
            // 清理测试文件
            await storage.file.delete('test.txt')
            await storage.file.delete('binary.bin')
            await storage.file.delete('meta.txt')
            await storage.file.delete('exists.txt')
            await storage.file.delete('to-delete.txt')
            await storage.file.delete('file1.txt')
            await storage.file.delete('file2.txt')
            await storage.file.delete('file3.txt')
            await storage.file.delete('source.txt')
            await storage.file.delete('copy.txt')
            await storage.file.delete('range.txt')
            await storage.dir.delete('nested/')
        })

        it('put/get - 应该上传和下载文件', async () => {
            const content = `Hello, ${config.name}!`
            const result = await storage.file.put('test.txt', content, {
                contentType: 'text/plain',
            })

            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data.key).toBe('test.txt')
                expect(result.data.size).toBe(Buffer.from(content).length)
            }

            const getResult = await storage.file.get('test.txt')
            expect(getResult.success).toBe(true)
            if (getResult.success) {
                expect(getResult.data.toString()).toBe(content)
            }
        })

        it('put/get - 应该支持 Buffer 上传', async () => {
            const buffer = Buffer.from([0x01, 0x02, 0x03, 0x04])
            const result = await storage.file.put('binary.bin', buffer)

            expect(result.success).toBe(true)

            const getResult = await storage.file.get('binary.bin')
            expect(getResult.success).toBe(true)
            if (getResult.success) {
                expect(getResult.data).toEqual(buffer)
            }
        })

        it('put - 应该支持嵌套路径', async () => {
            const result = await storage.file.put('nested/deep/dir/file.txt', 'content')
            expect(result.success).toBe(true)

            const getResult = await storage.file.get('nested/deep/dir/file.txt')
            expect(getResult.success).toBe(true)
        })

        it('head - 应该获取文件元数据', async () => {
            await storage.file.put('meta.txt', 'test content', {
                contentType: 'text/plain',
                metadata: { custom: 'value' },
            })

            const result = await storage.file.head('meta.txt')
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data.key).toBe('meta.txt')
                expect(result.data.contentType).toBe('text/plain')
                expect(result.data.size).toBe(Buffer.from('test content').length)
            }
        })

        it('exists - 应该检查文件是否存在', async () => {
            const notExists = await storage.file.exists('nonexistent-file.txt')
            expect(notExists.success).toBe(true)
            if (notExists.success) {
                expect(notExists.data).toBe(false)
            }

            await storage.file.put('exists.txt', 'content')

            const exists = await storage.file.exists('exists.txt')
            expect(exists.success).toBe(true)
            if (exists.success) {
                expect(exists.data).toBe(true)
            }
        })

        it('delete - 应该删除文件', async () => {
            await storage.file.put('to-delete.txt', 'content')

            const deleteResult = await storage.file.delete('to-delete.txt')
            expect(deleteResult.success).toBe(true)

            const existsResult = await storage.file.exists('to-delete.txt')
            expect(existsResult.success).toBe(true)
            if (existsResult.success) {
                expect(existsResult.data).toBe(false)
            }
        })

        it('deleteMany - 应该批量删除文件', async () => {
            await storage.file.put('file1.txt', 'content1')
            await storage.file.put('file2.txt', 'content2')
            await storage.file.put('file3.txt', 'content3')

            const deleteResult = await storage.file.deleteMany(['file1.txt', 'file2.txt'])
            expect(deleteResult.success).toBe(true)

            const exists1 = await storage.file.exists('file1.txt')
            const exists2 = await storage.file.exists('file2.txt')
            const exists3 = await storage.file.exists('file3.txt')

            expect(exists1.success && exists1.data).toBe(false)
            expect(exists2.success && exists2.data).toBe(false)
            expect(exists3.success && exists3.data).toBe(true)
        })

        it('copy - 应该复制文件', async () => {
            await storage.file.put('source.txt', 'original content')

            const copyResult = await storage.file.copy('source.txt', 'copy.txt')
            expect(copyResult.success).toBe(true)

            const getResult = await storage.file.get('copy.txt')
            expect(getResult.success).toBe(true)
            if (getResult.success) {
                expect(getResult.data.toString()).toBe('original content')
            }
        })

        it('get 范围请求 - 应该返回部分内容', async () => {
            await storage.file.put('range.txt', '0123456789')

            const result = await storage.file.get('range.txt', {
                rangeStart: 2,
                rangeEnd: 5,
            })

            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data.toString()).toBe('2345')
            }
        })
    })
}

/**
 * 运行目录操作测试
 */
export function runDirTests(config: StorageTestConfig) {
    describe('目录操作 (storage.dir)', () => {
        beforeEach(async () => {
            // 清理测试目录
            await storage.dir.delete('uploads/')
            await storage.dir.delete('docs/')
            await storage.dir.delete('folder/')
            await storage.dir.delete('folder1/')
            await storage.dir.delete('folder2/')
            await storage.dir.delete('other/')
        })

        it('list - 应该列出文件', async () => {
            await storage.file.put('uploads/image1.png', 'image1')
            await storage.file.put('uploads/image2.png', 'image2')
            await storage.file.put('docs/readme.md', 'readme')

            const result = await storage.dir.list({ prefix: 'uploads/' })
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data.files.length).toBe(2)
                expect(result.data.files.map(f => f.key)).toContain('uploads/image1.png')
                expect(result.data.files.map(f => f.key)).toContain('uploads/image2.png')
            }
        })

        it('list - 应该支持分隔符列出目录', async () => {
            await storage.file.put('folder1/file1.txt', 'content1')
            await storage.file.put('folder2/file2.txt', 'content2')

            const result = await storage.dir.list({ delimiter: '/' })
            expect(result.success).toBe(true)
            if (result.success) {
                expect(result.data.commonPrefixes).toContain('folder1/')
                expect(result.data.commonPrefixes).toContain('folder2/')
            }
        })

        it('delete - 应该删除目录下所有文件', async () => {
            await storage.file.put('folder/file1.txt', 'content1')
            await storage.file.put('folder/file2.txt', 'content2')
            await storage.file.put('other/file.txt', 'other')

            const deleteResult = await storage.dir.delete('folder/')
            expect(deleteResult.success).toBe(true)

            const exists1 = await storage.file.exists('folder/file1.txt')
            const exists2 = await storage.file.exists('folder/file2.txt')
            const existsOther = await storage.file.exists('other/file.txt')

            expect(exists1.success && exists1.data).toBe(false)
            expect(exists2.success && exists2.data).toBe(false)
            expect(existsOther.success && existsOther.data).toBe(true)
        })
    })
}

/**
 * 运行签名 URL 测试
 */
export function runPresignTests(config: StorageTestConfig) {
    describe('签名 URL (storage.presign)', () => {
        beforeEach(async () => {
            await storage.file.delete('download.txt')
        })

        it('getUrl - 应该生成下载签名 URL', async () => {
            await storage.file.put('download.txt', 'test content', {
                contentType: 'text/plain',
            })

            const result = await storage.presign.getUrl('download.txt', { expiresIn: 3600 })
            expect(result.success).toBe(true)
            if (result.success) {
                expect(typeof result.data).toBe('string')
                expect(result.data.length).toBeGreaterThan(0)
            }
        })

        it('putUrl - 应该生成上传签名 URL', async () => {
            const result = await storage.presign.putUrl('upload.txt', {
                contentType: 'text/plain',
                expiresIn: 3600,
            })

            expect(result.success).toBe(true)
            if (result.success) {
                expect(typeof result.data).toBe('string')
                expect(result.data.length).toBeGreaterThan(0)
            }
        })

        if (config.publicUrlPrefix) {
            it('publicUrl - 应该返回公开 URL', () => {
                const url = storage.presign.publicUrl('images/photo.jpg')
                expect(url).toBe(`${config.publicUrlPrefix}/images/photo.jpg`)
            })
        } else {
            it('publicUrl - 未配置 publicUrl 应该返回 null', () => {
                const url = storage.presign.publicUrl('any.txt')
                expect(url).toBeNull()
            })
        }
    })
}

/**
 * 运行错误处理测试
 */
export function runErrorTests(config: StorageTestConfig) {
    describe('错误处理', () => {
        it('get 不存在的文件应该返回 NOT_FOUND 错误', async () => {
            const result = await storage.file.get('nonexistent-file-12345.txt')
            expect(result.success).toBe(false)
            if (!result.success) {
                expect(result.error.code).toBe(StorageErrorCode.NOT_FOUND)
            }
        })

        it('head 不存在的文件应该返回 NOT_FOUND 错误', async () => {
            const result = await storage.file.head('nonexistent-file-12345.txt')
            expect(result.success).toBe(false)
            if (!result.success) {
                expect(result.error.code).toBe(StorageErrorCode.NOT_FOUND)
            }
        })

        it('copy 不存在的源文件应该返回 NOT_FOUND 错误', async () => {
            const result = await storage.file.copy('nonexistent-file-12345.txt', 'dest.txt')
            expect(result.success).toBe(false)
            if (!result.success) {
                expect(result.error.code).toBe(StorageErrorCode.NOT_FOUND)
            }
        })
    })
}

/**
 * 运行未初始化测试
 */
export function runNotInitializedTests() {
    describe('未初始化', () => {
        it('未初始化时操作应该返回 NOT_INITIALIZED 错误', async () => {
            expect(storage.isInitialized).toBe(false)

            const result = await storage.file.get('test.txt')
            expect(result.success).toBe(false)
            if (!result.success) {
                expect(result.error.code).toBe(StorageErrorCode.NOT_INITIALIZED)
            }
        })
    })
}

/**
 * 运行所有标准测试
 */
export function runAllTests(config: StorageTestConfig) {
    runFileTests(config)
    runDirTests(config)
    runPresignTests(config)
    runErrorTests(config)
}
