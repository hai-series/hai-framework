/**
 * =============================================================================
 * @hai/storage - 前端客户端工具函数测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { formatFileSize, getMimeType, storage } from '../src/index.js'

describe('storage.client 工具函数', () => {
  // ===========================================================================
  // getMimeType
  // ===========================================================================

  describe('getMimeType', () => {
    it('常见图片扩展名应返回正确 MIME 类型', () => {
      expect(getMimeType('jpg')).toBe('image/jpeg')
      expect(getMimeType('jpeg')).toBe('image/jpeg')
      expect(getMimeType('png')).toBe('image/png')
      expect(getMimeType('gif')).toBe('image/gif')
      expect(getMimeType('webp')).toBe('image/webp')
      expect(getMimeType('svg')).toBe('image/svg+xml')
    })

    it('常见文档扩展名应返回正确 MIME 类型', () => {
      expect(getMimeType('pdf')).toBe('application/pdf')
      expect(getMimeType('doc')).toBe('application/msword')
      expect(getMimeType('json')).toBe('application/json')
      expect(getMimeType('xml')).toBe('application/xml')
    })

    it('常见文本扩展名应返回正确 MIME 类型', () => {
      expect(getMimeType('txt')).toBe('text/plain')
      expect(getMimeType('html')).toBe('text/html')
      expect(getMimeType('css')).toBe('text/css')
      expect(getMimeType('csv')).toBe('text/csv')
      expect(getMimeType('md')).toBe('text/markdown')
    })

    it('常见压缩包扩展名应返回正确 MIME 类型', () => {
      expect(getMimeType('zip')).toBe('application/zip')
      expect(getMimeType('gz')).toBe('application/gzip')
      expect(getMimeType('tar')).toBe('application/x-tar')
    })

    it('未知扩展名应返回 application/octet-stream', () => {
      expect(getMimeType('xyz')).toBe('application/octet-stream')
      expect(getMimeType('unknown')).toBe('application/octet-stream')
      expect(getMimeType('')).toBe('application/octet-stream')
    })

    it('大写扩展名应正确识别（大小写不敏感）', () => {
      expect(getMimeType('PNG')).toBe('image/png')
      expect(getMimeType('JPG')).toBe('image/jpeg')
      expect(getMimeType('PDF')).toBe('application/pdf')
    })
  })

  // ===========================================================================
  // formatFileSize
  // ===========================================================================

  describe('formatFileSize', () => {
    it('0 字节应返回 "0 B"', () => {
      expect(formatFileSize(0)).toBe('0 B')
    })

    it('小于 1KB 应以 B 为单位', () => {
      expect(formatFileSize(512)).toBe('512 B')
      expect(formatFileSize(1)).toBe('1 B')
    })

    it('1024 字节应显示为 1.00 KB', () => {
      expect(formatFileSize(1024)).toBe('1.00 KB')
    })

    it('mB 级别应正确格式化', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1.00 MB')
      expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.50 MB')
    })

    it('gB 级别应正确格式化', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.00 GB')
    })

    it('tB 级别应正确格式化', () => {
      expect(formatFileSize(1024 ** 4)).toBe('1.00 TB')
    })
  })

  // ===========================================================================
  // storage.client 入口一致性
  // ===========================================================================

  describe('storage.client 入口', () => {
    it('client 对象应包含 getMimeType 方法', () => {
      expect(typeof storage.client.getMimeType).toBe('function')
    })

    it('client 对象应包含 formatFileSize 方法', () => {
      expect(typeof storage.client.formatFileSize).toBe('function')
    })

    it('client 对象应包含 getFileExtension 方法', () => {
      expect(typeof storage.client.getFileExtension).toBe('function')
    })

    it('client 对象应包含 uploadWithPresignedUrl 方法', () => {
      expect(typeof storage.client.uploadWithPresignedUrl).toBe('function')
    })

    it('client 对象应包含 downloadWithPresignedUrl 方法', () => {
      expect(typeof storage.client.downloadWithPresignedUrl).toBe('function')
    })

    it('client 对象应包含 downloadAndSave 方法', () => {
      expect(typeof storage.client.downloadAndSave).toBe('function')
    })

    it('client.getMimeType 与直接导入的 getMimeType 行为一致', () => {
      expect(storage.client.getMimeType('png')).toBe(getMimeType('png'))
      expect(storage.client.getMimeType('unknown')).toBe(getMimeType('unknown'))
    })

    it('client.formatFileSize 与直接导入的 formatFileSize 行为一致', () => {
      expect(storage.client.formatFileSize(1024)).toBe(formatFileSize(1024))
      expect(storage.client.formatFileSize(0)).toBe(formatFileSize(0))
    })
  })
})
