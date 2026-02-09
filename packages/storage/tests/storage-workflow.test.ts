/**
 * =============================================================================
 * @hai/storage - 完整工作流测试
 * =============================================================================
 *
 * 模拟真实业务场景下的完整存储操作流程：
 * 1. 初始化存储实例
 * 2. 创建目录结构（通过上传文件隐式创建）
 * 3. 服务端上传文件
 * 4. 列出目录查看文件
 * 5. 获取文件元数据
 * 6. 服务端下载文件并验证内容
 * 7. 复制文件
 * 8. 生成签名 URL（用于前端直传）
 * 9. [S3] 客户端通过签名 URL 上传文件
 * 10. [S3] 客户端通过签名 URL 下载文件
 * 11. 清理：删除文件、删除目录
 * 12. 关闭连接
 */

import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { downloadWithPresignedUrl, storage, uploadWithPresignedUrl } from '../src/index.js'
import { defineStorageSuite, localStorageEnv, s3Env } from './helpers/storage-test-suite.js'

describe('storage workflow', () => {
  /**
   * 公共流程：服务端上传 → 目录列表 → 元数据 → 服务端下载 → 复制 → 签名 URL → 删除
   * 所有实现（local / s3）均覆盖。
   */
  const defineCommon = (label: 'local' | 's3') => {
    it(`${label}: 完整服务端工作流`, async () => {
      // -----------------------------------------------------------------------
      // 1. 确认初始化成功
      // -----------------------------------------------------------------------
      expect(storage.isInitialized).toBe(true)
      expect(storage.config?.type).toBe(label)

      // -----------------------------------------------------------------------
      // 2. 服务端上传文件（隐式创建目录结构）
      // -----------------------------------------------------------------------
      const textContent = '这是一份测试文档，用于验证完整存储流程。'
      const putText = await storage.file.put('workflow/docs/readme.txt', textContent, {
        contentType: 'text/plain',
      })
      expect(putText.success).toBe(true)
      if (putText.success) {
        expect(putText.data.key).toBe('workflow/docs/readme.txt')
        expect(putText.data.contentType).toBe('text/plain')
      }

      const binaryData = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
      const putBinary = await storage.file.put('workflow/images/logo.png', binaryData, {
        contentType: 'image/png',
      })
      expect(putBinary.success).toBe(true)

      const putJson = await storage.file.put('workflow/data/config.json', JSON.stringify({ version: 1, name: 'test' }), {
        contentType: 'application/json',
      })
      expect(putJson.success).toBe(true)

      // -----------------------------------------------------------------------
      // 3. 列出目录，确认文件结构正确
      // -----------------------------------------------------------------------
      const listAll = await storage.dir.list({ prefix: 'workflow/' })
      expect(listAll.success).toBe(true)
      if (listAll.success) {
        const keys = listAll.data.files.map(f => f.key)
        expect(keys).toContain('workflow/docs/readme.txt')
        expect(keys).toContain('workflow/images/logo.png')
        expect(keys).toContain('workflow/data/config.json')
        expect(listAll.data.files.length).toBe(3)
      }

      // 使用 delimiter 列出一级子目录
      const listTopLevel = await storage.dir.list({ prefix: 'workflow/', delimiter: '/' })
      expect(listTopLevel.success).toBe(true)
      if (listTopLevel.success) {
        expect(listTopLevel.data.commonPrefixes).toContain('workflow/docs/')
        expect(listTopLevel.data.commonPrefixes).toContain('workflow/images/')
        expect(listTopLevel.data.commonPrefixes).toContain('workflow/data/')
        // 没有直接位于 workflow/ 下的文件
        expect(listTopLevel.data.files.length).toBe(0)
      }

      // -----------------------------------------------------------------------
      // 4. 获取文件元数据
      // -----------------------------------------------------------------------
      const headResult = await storage.file.head('workflow/docs/readme.txt')
      expect(headResult.success).toBe(true)
      if (headResult.success) {
        expect(headResult.data.key).toBe('workflow/docs/readme.txt')
        expect(headResult.data.size).toBe(Buffer.from(textContent).length)
        expect(headResult.data.lastModified).toBeInstanceOf(Date)
      }

      // -----------------------------------------------------------------------
      // 5. 服务端下载文件，验证内容完整
      // -----------------------------------------------------------------------
      const getText = await storage.file.get('workflow/docs/readme.txt')
      expect(getText.success).toBe(true)
      if (getText.success) {
        expect(getText.data.toString()).toBe(textContent)
      }

      const getBinary = await storage.file.get('workflow/images/logo.png')
      expect(getBinary.success).toBe(true)
      if (getBinary.success) {
        expect(Buffer.compare(getBinary.data, binaryData)).toBe(0)
      }

      const getJson = await storage.file.get('workflow/data/config.json')
      expect(getJson.success).toBe(true)
      if (getJson.success) {
        const parsed = JSON.parse(getJson.data.toString())
        expect(parsed.version).toBe(1)
        expect(parsed.name).toBe('test')
      }

      // -----------------------------------------------------------------------
      // 6. 复制文件并验证
      // -----------------------------------------------------------------------
      const copyResult = await storage.file.copy('workflow/docs/readme.txt', 'workflow/backup/readme.txt')
      expect(copyResult.success).toBe(true)
      if (copyResult.success) {
        expect(copyResult.data.key).toBe('workflow/backup/readme.txt')
      }

      const getCopy = await storage.file.get('workflow/backup/readme.txt')
      expect(getCopy.success).toBe(true)
      if (getCopy.success) {
        expect(getCopy.data.toString()).toBe(textContent)
      }

      // -----------------------------------------------------------------------
      // 7. 生成签名 URL（验证格式合法）
      // -----------------------------------------------------------------------
      const getUrlResult = await storage.presign.getUrl('workflow/docs/readme.txt', { expiresIn: 600 })
      expect(getUrlResult.success).toBe(true)
      if (getUrlResult.success) {
        expect(typeof getUrlResult.data).toBe('string')
        expect(getUrlResult.data.length).toBeGreaterThan(0)
        expect(getUrlResult.data).toContain('readme.txt')
      }

      const putUrlResult = await storage.presign.putUrl('workflow/uploads/new-file.txt', {
        contentType: 'text/plain',
        expiresIn: 600,
      })
      expect(putUrlResult.success).toBe(true)
      if (putUrlResult.success) {
        expect(typeof putUrlResult.data).toBe('string')
        expect(putUrlResult.data.length).toBeGreaterThan(0)
      }

      // -----------------------------------------------------------------------
      // 8. 覆盖写入并验证内容更新
      // -----------------------------------------------------------------------
      const updatedContent = '更新后的文档内容 v2'
      const overwriteResult = await storage.file.put('workflow/docs/readme.txt', updatedContent)
      expect(overwriteResult.success).toBe(true)

      const getUpdated = await storage.file.get('workflow/docs/readme.txt')
      expect(getUpdated.success).toBe(true)
      if (getUpdated.success) {
        expect(getUpdated.data.toString()).toBe(updatedContent)
      }

      // -----------------------------------------------------------------------
      // 9. 批量删除文件
      // -----------------------------------------------------------------------
      const deleteResult = await storage.file.deleteMany([
        'workflow/images/logo.png',
        'workflow/data/config.json',
      ])
      expect(deleteResult.success).toBe(true)

      const existsLogo = await storage.file.exists('workflow/images/logo.png')
      expect(existsLogo.success).toBe(true)
      if (existsLogo.success) {
        expect(existsLogo.data).toBe(false)
      }

      // -----------------------------------------------------------------------
      // 10. 删除整个目录
      // -----------------------------------------------------------------------
      const dirDeleteResult = await storage.dir.delete('workflow/')
      expect(dirDeleteResult.success).toBe(true)

      const listAfterDelete = await storage.dir.list({ prefix: 'workflow/' })
      expect(listAfterDelete.success).toBe(true)
      if (listAfterDelete.success) {
        expect(listAfterDelete.data.files.length).toBe(0)
      }

      // -----------------------------------------------------------------------
      // 11. 验证关闭后状态
      // -----------------------------------------------------------------------
      await storage.close()
      expect(storage.isInitialized).toBe(false)
      expect(storage.config).toBeNull()

      const afterCloseResult = await storage.file.get('any-key')
      expect(afterCloseResult.success).toBe(false)
      if (!afterCloseResult.success) {
        expect(afterCloseResult.error.code).toBe(5010)
      }
    })
  }

  defineStorageSuite('local', localStorageEnv, () => defineCommon('local'))

  defineStorageSuite('s3', s3Env, () => defineCommon('s3'))

  // ===========================================================================
  // S3 专属：通过签名 URL 进行客户端上传/下载（真实 HTTP 请求）
  // ===========================================================================

  defineStorageSuite('s3-presigned-http', s3Env, () => {
    it('s3: 客户端通过签名 URL 上传文件，再通过签名 URL 下载验证', async () => {
      const fileContent = 'client-uploaded content via presigned URL'

      // ----- 1. 生成上传签名 URL -----
      const putUrlResult = await storage.presign.putUrl('presign-test/client-upload.txt', {
        contentType: 'text/plain',
        expiresIn: 600,
      })
      expect(putUrlResult.success).toBe(true)
      if (!putUrlResult.success)
        return

      const uploadUrl = putUrlResult.data
      expect(uploadUrl).toMatch(/^https?:\/\//)

      // ----- 2. 客户端通过签名 URL 上传（模拟前端 fetch PUT） -----
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: fileContent,
        headers: { 'Content-Type': 'text/plain' },
      })
      expect(uploadResponse.ok).toBe(true)

      // ----- 3. 服务端验证文件已落地 -----
      const existsResult = await storage.file.exists('presign-test/client-upload.txt')
      expect(existsResult.success).toBe(true)
      if (existsResult.success) {
        expect(existsResult.data).toBe(true)
      }

      const serverGet = await storage.file.get('presign-test/client-upload.txt')
      expect(serverGet.success).toBe(true)
      if (serverGet.success) {
        expect(serverGet.data.toString()).toBe(fileContent)
      }

      // ----- 4. 生成下载签名 URL -----
      const getUrlResult = await storage.presign.getUrl('presign-test/client-upload.txt', {
        expiresIn: 600,
      })
      expect(getUrlResult.success).toBe(true)
      if (!getUrlResult.success)
        return

      const downloadUrl = getUrlResult.data
      expect(downloadUrl).toMatch(/^https?:\/\//)

      // ----- 5. 客户端通过签名 URL 下载（模拟前端 fetch GET） -----
      const downloadResponse = await fetch(downloadUrl)
      expect(downloadResponse.ok).toBe(true)

      const downloadedText = await downloadResponse.text()
      expect(downloadedText).toBe(fileContent)
    })

    it('s3: 客户端通过签名 URL 上传二进制文件并下载验证', async () => {
      const binaryContent = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF, 0x00, 0x01, 0x02, 0x03])

      // 生成上传签名 URL
      const putUrlResult = await storage.presign.putUrl('presign-test/binary.bin', {
        contentType: 'application/octet-stream',
        expiresIn: 600,
      })
      expect(putUrlResult.success).toBe(true)
      if (!putUrlResult.success)
        return

      // 客户端上传
      const uploadResponse = await fetch(putUrlResult.data, {
        method: 'PUT',
        body: binaryContent,
        headers: { 'Content-Type': 'application/octet-stream' },
      })
      expect(uploadResponse.ok).toBe(true)

      // 服务端验证
      const serverGet = await storage.file.get('presign-test/binary.bin')
      expect(serverGet.success).toBe(true)
      if (serverGet.success) {
        expect(Buffer.compare(serverGet.data, binaryContent)).toBe(0)
      }

      // 客户端下载并验证
      const getUrlResult = await storage.presign.getUrl('presign-test/binary.bin', { expiresIn: 600 })
      expect(getUrlResult.success).toBe(true)
      if (!getUrlResult.success)
        return

      const downloadResponse = await fetch(getUrlResult.data)
      expect(downloadResponse.ok).toBe(true)

      const downloadedBuffer = Buffer.from(await downloadResponse.arrayBuffer())
      expect(Buffer.compare(downloadedBuffer, binaryContent)).toBe(0)
    })

    it('s3: 使用 uploadWithPresignedUrl 上传并验证', async () => {
      const content = 'uploaded via client helper'

      // 生成上传签名 URL
      const putUrlResult = await storage.presign.putUrl('presign-test/client-helper.txt', {
        contentType: 'text/plain',
        expiresIn: 600,
      })
      expect(putUrlResult.success).toBe(true)
      if (!putUrlResult.success)
        return

      // 通过客户端函数上传
      const uploadResult = await uploadWithPresignedUrl(
        putUrlResult.data,
        content,
        { contentType: 'text/plain' },
      )
      expect(uploadResult.success).toBe(true)

      // 服务端验证文件内容
      const serverGet = await storage.file.get('presign-test/client-helper.txt')
      expect(serverGet.success).toBe(true)
      if (serverGet.success) {
        expect(serverGet.data.toString()).toBe(content)
      }
    })

    it('s3: 使用 downloadWithPresignedUrl 下载并验证', async () => {
      const content = 'content for client download test'

      // 服务端上传
      await storage.file.put('presign-test/for-download.txt', content, {
        contentType: 'text/plain',
      })

      // 生成下载签名 URL
      const getUrlResult = await storage.presign.getUrl('presign-test/for-download.txt', {
        expiresIn: 600,
      })
      expect(getUrlResult.success).toBe(true)
      if (!getUrlResult.success)
        return

      // 通过客户端函数下载
      const downloadResult = await downloadWithPresignedUrl(getUrlResult.data)
      expect(downloadResult.success).toBe(true)
      if (downloadResult.success && downloadResult.data) {
        const text = await downloadResult.data.text()
        expect(text).toBe(content)
      }
    })
  })
})
