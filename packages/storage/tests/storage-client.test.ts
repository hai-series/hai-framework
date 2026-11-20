/**
 * @h-ai/storage — 前端客户端工具函数测试
 */

import type { LogRecord } from '@h-ai/core'
import { core } from '@h-ai/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  downloadAndSave,
  downloadWithPresignedUrl,
  formatFileSize,
  getFileExtension,
  getMimeType,
  uploadWithPresignedUrl,
} from '../src/index.js'
import * as storageBrowser from '../src/storage-index.browser.js'

describe('storage client 工具函数', () => {
  // ─── getMimeType ───

  describe('getMimeType', () => {
    it('常见图片扩展名应返回正确 MIME 类型', () => {
      expect(getMimeType('jpg')).toBe('image/jpeg')
      expect(getMimeType('jpeg')).toBe('image/jpeg')
      expect(getMimeType('png')).toBe('image/png')
      expect(getMimeType('gif')).toBe('image/gif')
      expect(getMimeType('webp')).toBe('image/webp')
      expect(getMimeType('svg')).toBe('image/svg+xml')
      expect(getMimeType('ico')).toBe('image/x-icon')
    })

    it('常见文档扩展名应返回正确 MIME 类型', () => {
      expect(getMimeType('pdf')).toBe('application/pdf')
      expect(getMimeType('doc')).toBe('application/msword')
      expect(getMimeType('docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      expect(getMimeType('xls')).toBe('application/vnd.ms-excel')
      expect(getMimeType('xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      expect(getMimeType('ppt')).toBe('application/vnd.ms-powerpoint')
      expect(getMimeType('pptx')).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation')
      expect(getMimeType('json')).toBe('application/json')
      expect(getMimeType('xml')).toBe('application/xml')
    })

    it('常见文本扩展名应返回正确 MIME 类型', () => {
      expect(getMimeType('txt')).toBe('text/plain')
      expect(getMimeType('html')).toBe('text/html')
      expect(getMimeType('css')).toBe('text/css')
      expect(getMimeType('js')).toBe('text/javascript')
      expect(getMimeType('csv')).toBe('text/csv')
      expect(getMimeType('md')).toBe('text/markdown')
    })

    it('音视频扩展名应返回正确 MIME 类型', () => {
      expect(getMimeType('mp3')).toBe('audio/mpeg')
      expect(getMimeType('wav')).toBe('audio/wav')
      expect(getMimeType('ogg')).toBe('audio/ogg')
      expect(getMimeType('mp4')).toBe('video/mp4')
      expect(getMimeType('webm')).toBe('video/webm')
    })

    it('常见压缩包扩展名应返回正确 MIME 类型', () => {
      expect(getMimeType('zip')).toBe('application/zip')
      expect(getMimeType('gz')).toBe('application/gzip')
      expect(getMimeType('tar')).toBe('application/x-tar')
      expect(getMimeType('rar')).toBe('application/x-rar-compressed')
      expect(getMimeType('7z')).toBe('application/x-7z-compressed')
    })

    it('未知扩展名应返回 application/octet-stream', () => {
      expect(getMimeType('xyz')).toBe('application/octet-stream')
      expect(getMimeType('unknown')).toBe('application/octet-stream')
      expect(getMimeType('')).toBe('application/octet-stream')
      expect(getMimeType('constructor')).toBe('application/octet-stream')
      expect(getMimeType('__proto__')).toBe('application/octet-stream')
    })

    it('大写扩展名应正确识别（大小写不敏感）', () => {
      expect(getMimeType('PNG')).toBe('image/png')
      expect(getMimeType('JPG')).toBe('image/jpeg')
      expect(getMimeType('PDF')).toBe('application/pdf')
      expect(getMimeType('Mp4')).toBe('video/mp4')
    })
  })

  // ─── getFileExtension ───

  describe('getFileExtension', () => {
    it('应从文件名中提取扩展名', () => {
      const file = new File(['content'], 'photo.jpg')
      expect(getFileExtension(file)).toBe('jpg')
    })

    it('多层扩展名应取最后一段', () => {
      const file = new File([''], 'archive.tar.gz')
      expect(getFileExtension(file)).toBe('gz')
    })

    it('无扩展名的文件应返回空字符串', () => {
      const file = new File([''], 'Makefile')
      expect(getFileExtension(file)).toBe('')
    })

    it('扩展名应转为小写', () => {
      const file = new File([''], 'Image.PNG')
      expect(getFileExtension(file)).toBe('png')
    })

    it('以点开头的隐藏文件应正确处理', () => {
      const file = new File([''], '.gitignore')
      expect(getFileExtension(file)).toBe('gitignore')
    })

    it('文件名含多个点应取最后一段', () => {
      const file = new File([''], 'my.report.2024.pdf')
      expect(getFileExtension(file)).toBe('pdf')
    })
  })

  // ─── formatFileSize ───

  describe('formatFileSize', () => {
    it('0 字节应返回 "0 B"', () => {
      expect(formatFileSize(0)).toBe('0 B')
    })

    it('小于 1KB 应以 B 为单位', () => {
      expect(formatFileSize(512)).toBe('512 B')
      expect(formatFileSize(1)).toBe('1 B')
      expect(formatFileSize(1023)).toBe('1023 B')
    })

    it('1024 字节应显示为 1.00 KB', () => {
      expect(formatFileSize(1024)).toBe('1.00 KB')
    })

    it('应正确格式化 MB 级别', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1.00 MB')
      expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.50 MB')
    })

    it('应正确格式化 GB 级别', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.00 GB')
    })

    it('应正确格式化 TB 级别', () => {
      expect(formatFileSize(1024 ** 4)).toBe('1.00 TB')
      expect(formatFileSize(1024 ** 5)).toBe('1024.00 TB')
    })

    it('精确的 KB 值应保留两位小数', () => {
      expect(formatFileSize(2048)).toBe('2.00 KB')
      expect(formatFileSize(1536)).toBe('1.50 KB')
    })
  })

  // ─── uploadWithPresignedUrl ───

  describe('uploadWithPresignedUrl', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('fetch 成功时应返回 success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))

      const result = await uploadWithPresignedUrl('https://example.com/upload', 'file-data')
      expect(result.success).toBe(true)
    })

    it('fetch 返回非 2xx 状态应返回失败', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      }))

      const warnings: LogRecord[] = []
      const stop = core.logger.observe((record) => {
        if (record.level === 'warn' && record.context.scope === 'client')
          warnings.push(record)
      })
      try {
        const result = await uploadWithPresignedUrl('https://example.com/upload?X-Amz-Signature=fixture-value', 'private body')
        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(warnings).toMatchObject([
          {
            context: { operation: 'uploadWithPresignedUrl', httpStatus: 403 },
          },
        ])
        expect(JSON.stringify(warnings)).not.toMatch(/fixture-value|private body/)
      }
      finally {
        stop()
      }
    })

    it('fetch 抛出网络错误时应返回失败', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

      const result = await uploadWithPresignedUrl('https://example.com/upload', 'data')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Network error')
    })

    it('指定 contentType 应传递给 fetch headers', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
      vi.stubGlobal('fetch', mockFetch)

      await uploadWithPresignedUrl('https://example.com/upload', 'data', {
        contentType: 'text/plain',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/upload',
        expect.objectContaining({
          method: 'PUT',
          headers: { 'Content-Type': 'text/plain' },
        }),
      )
    })

    it('使用 abortController 取消时应返回取消错误', async () => {
      const abortError = new Error('The operation was aborted')
      abortError.name = 'AbortError'
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))

      const controller = new AbortController()
      const result = await uploadWithPresignedUrl('https://example.com/upload', 'data', {
        abortController: controller,
      })
      expect(result.success).toBe(false)
    })

    it('fetch 上传取消时使用本地化提示，包括自定义原因', async () => {
      const controller = new AbortController()
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
        controller.abort(new Error('Do not display this abort reason'))
        controller.signal.throwIfAborted()
      }))

      const result = await core.i18n.runWithLocale('en-US', () => uploadWithPresignedUrl(
        'https://example.com/upload',
        'data',
        { abortController: controller },
      ))
      expect(result).toEqual({ success: false, error: 'Upload canceled' })
    })

    it('预先取消时不调用 fetch', async () => {
      const fetch = vi.fn()
      vi.stubGlobal('fetch', fetch)
      const controller = new AbortController()
      controller.abort(new Error('Cancelled before upload'))
      const result = await uploadWithPresignedUrl('https://example.com/upload', 'data', { abortController: controller })
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
      expect(fetch).not.toHaveBeenCalled()
    })

    it('非 Error 异常也应被捕获', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue('string error'))

      const result = await uploadWithPresignedUrl('https://example.com/upload', 'data')
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  // ─── downloadWithPresignedUrl ───

  describe('downloadWithPresignedUrl', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('fetch 成功时应返回 Blob 数据', async () => {
      const blob = new Blob(['test content'])
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(blob),
      }))

      const result = await downloadWithPresignedUrl('https://example.com/download')
      expect(result.success).toBe(true)
      expect(result.data).toBeInstanceOf(Blob)
    })

    it('fetch 返回非 2xx 状态应返回失败', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }))

      const result = await downloadWithPresignedUrl('https://example.com/download')
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('fetch 抛出网络错误时应返回失败', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')))

      const result = await downloadWithPresignedUrl('https://example.com/download')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Connection refused')
    })

    it('使用 abortController 取消时应返回取消错误', async () => {
      const abortError = new Error('The operation was aborted')
      abortError.name = 'AbortError'
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))

      const result = await downloadWithPresignedUrl('https://example.com/download', {
        abortController: new AbortController(),
      })
      expect(result.success).toBe(false)
    })

    it('读取响应时取消下载应使用本地化提示，包括自定义原因', async () => {
      const controller = new AbortController()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => {
          controller.abort({ source: 'user' })
          controller.signal.throwIfAborted()
        },
      }))

      const result = await core.i18n.runWithLocale('en-US', () => downloadWithPresignedUrl(
        'https://example.com/download',
        { abortController: controller },
      ))
      expect(result).toEqual({ success: false, error: 'Download canceled' })
    })

    it('传递 abortController.signal 给 fetch', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob()),
      })
      vi.stubGlobal('fetch', mockFetch)

      const controller = new AbortController()
      await downloadWithPresignedUrl('https://example.com/download', {
        abortController: controller,
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/download',
        expect.objectContaining({
          signal: controller.signal,
        }),
      )
    })
  })

  // ─── downloadAndSave ───

  describe('downloadAndSave', () => {
    afterEach(() => {
      vi.restoreAllMocks()
      vi.unstubAllGlobals()
    })

    it('下载失败时应透传错误', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      }))

      const result = await downloadAndSave('https://example.com/file')
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('在没有 document 的环境中应返回错误', async () => {
      const blob = new Blob(['content'])
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(blob),
      }))

      const result = await downloadAndSave('https://example.com/file', {
        filename: 'test.txt',
      })
      // Node.js 环境没有 document.createElement，应触发 catch 分支
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it.each([
      { clickFails: false, outcome: '成功' },
      { clickFails: true, outcome: '失败' },
    ])('点击链接$outcome时清理链接和 Blob URL', async ({ clickFails }) => {
      const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fixture')
      const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      const link = {
        href: '',
        download: '',
        click: vi.fn(() => {
          if (clickFails)
            throw new Error('Click failed')
        }),
        remove: vi.fn(),
      }
      const appendChild = vi.fn()
      vi.stubGlobal('document', {
        createElement: () => link,
        body: { appendChild, removeChild: link.remove },
      })
      const blob = new Blob(['content'])
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => blob,
      }))

      const result = await downloadAndSave('https://example.com/file', { filename: 'report.txt' })

      expect(result.success).toBe(!clickFails)
      if (clickFails)
        expect(result.error).toBe('Click failed')
      expect(createObjectURL).toHaveBeenCalledWith(blob)
      expect(appendChild).toHaveBeenCalledWith(link)
      expect(link.download).toBe('report.txt')
      expect(link.click).toHaveBeenCalledOnce()
      expect(link.remove).toHaveBeenCalledOnce()
      expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:fixture')
    })
  })

  // ─── 浏览器入口导出 ───

  describe('browser entry exports', () => {
    it('浏览器入口不应导出 storage 主对象', () => {
      expect('storage' in storageBrowser).toBe(false)
    })

    it('浏览器入口应导出前端客户端方法', () => {
      expect(typeof storageBrowser.uploadWithPresignedUrl).toBe('function')
      expect(typeof storageBrowser.downloadWithPresignedUrl).toBe('function')
      expect(typeof storageBrowser.downloadAndSave).toBe('function')
    })

    it('浏览器入口应导出工具函数', () => {
      expect(typeof storageBrowser.getMimeType).toBe('function')
      expect(typeof storageBrowser.formatFileSize).toBe('function')
      expect(typeof storageBrowser.getFileExtension).toBe('function')
    })

    it('浏览器入口应导出配置与类型', () => {
      expect('HaiStorageError' in storageBrowser).toBe(true)
      expect('StorageConfigSchema' in storageBrowser).toBe(true)
    })
  })
})
