/**
 * =============================================================================
 * @hai/storage - 本地存储测试
 * =============================================================================
 *
 * 测试本地文件系统存储 Provider。
 * 不需要 Docker，直接在临时目录运行。
 *
 * 运行方式：
 *   pnpm test
 *
 * =============================================================================
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { storage } from '../src/index.js'
import {
    StorageTestConfig,
    runAllTests,
    runNotInitializedTests,
} from './storage-test-shared.js'

// =============================================================================
// Local 测试配置
// =============================================================================

const localConfig: StorageTestConfig = {
    name: 'Local',
    type: 'local',
    supportRealPresignUrl: false,
}

// =============================================================================
// 测试套件
// =============================================================================

describe('@hai/storage - Local Provider', () => {
    let testRoot: string

    beforeAll(async () => {
        // 创建临时测试目录
        testRoot = path.join(os.tmpdir(), `hai-storage-test-${Date.now()}`)
        await fs.mkdir(testRoot, { recursive: true })

        // 初始化本地存储
        const result = await storage.init({
            type: 'local',
            root: testRoot,
            directoryMode: 0o755,
            fileMode: 0o644,
        })

        expect(result.success).toBe(true)
    })

    afterAll(async () => {
        await storage.close()

        // 清理测试目录
        try {
            await fs.rm(testRoot, { recursive: true, force: true })
        } catch {
            // 忽略清理错误
        }
    })

    // -------------------------------------------------------------------------
    // 初始化测试
    // -------------------------------------------------------------------------
    describe('初始化', () => {
        it('应该正确初始化', () => {
            expect(storage.isInitialized).toBe(true)
            expect(storage.config?.type).toBe('local')
        })
    })

    // -------------------------------------------------------------------------
    // 共享测试
    // -------------------------------------------------------------------------
    runAllTests(localConfig)

    // -------------------------------------------------------------------------
    // Local 特有测试
    // -------------------------------------------------------------------------
    describe('Local 特有功能', () => {
        it('应该自动创建嵌套目录', async () => {
            const result = await storage.file.put('deeply/nested/dir/structure/file.txt', 'content')
            expect(result.success).toBe(true)

            // 验证文件确实存在
            const exists = await storage.file.exists('deeply/nested/dir/structure/file.txt')
            expect(exists.success && exists.data).toBe(true)
        })

        it('应该防止路径穿越攻击', async () => {
            // 尝试使用 ../ 穿越，实际上会被规范化到 root 目录下
            const result = await storage.file.put('../../../etc/passwd', 'safe content')
            expect(result.success).toBe(true)

            // 验证文件确实在 root 目录下（而不是穿越出去）
            const exists = await storage.file.exists('etc/passwd')
            expect(exists.success && exists.data).toBe(true)
        })

        it('签名 URL 应该包含 local:// 协议', async () => {
            await storage.file.put('presign-test.txt', 'content')

            const getUrl = await storage.presign.getUrl('presign-test.txt')
            expect(getUrl.success).toBe(true)
            if (getUrl.success) {
                expect(getUrl.data.startsWith('local://')).toBe(true)
                expect(getUrl.data).toContain('expires=')
                expect(getUrl.data).toContain('signature=')
            }

            const putUrl = await storage.presign.putUrl('new-file.txt')
            expect(putUrl.success).toBe(true)
            if (putUrl.success) {
                expect(putUrl.data.startsWith('local://')).toBe(true)
                expect(putUrl.data).toContain('action=put')
            }
        })
    })
})

// =============================================================================
// 未初始化测试
// =============================================================================

describe('@hai/storage - 未初始化', () => {
    beforeAll(async () => {
        // 确保关闭任何现有连接
        await storage.close()
    })

    runNotInitializedTests()
})
