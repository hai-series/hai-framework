/**
 * @h-ai/storage — API Schema 与端点契约测试
 */

import { describe, expect, it } from 'vitest'
import {
  DeleteFileInputSchema,
  DeleteFilesInputSchema,
  FileInfoInputSchema,
  FileMetadataSchema,
  ListFilesOutputSchema,
  PresignGetInputSchema,
  PresignPutInputSchema,
  PresignUrlOutputSchema,
  storageEndpoints,
} from '../src/api/index.js'

// ─── Schema 校验测试 ───

describe('fileMetadataSchema', () => {
  it('合法的文件元数据应通过校验', () => {
    const result = FileMetadataSchema.safeParse({
      key: 'uploads/image.png',
      size: 1024,
      contentType: 'image/png',
      lastModified: '2026-01-01T00:00:00Z',
      etag: '"abc123"',
      metadata: { author: 'test' },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.key).toBe('uploads/image.png')
      expect(result.data.size).toBe(1024)
      expect(result.data.lastModified).toBeInstanceOf(Date)
    }
  })

  it('lastModified 应通过 coerce 将字符串转为 Date', () => {
    const result = FileMetadataSchema.safeParse({
      key: 'a.txt',
      size: 0,
      contentType: 'text/plain',
      lastModified: '2026-03-01',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.lastModified).toBeInstanceOf(Date)
    }
  })

  it('lastModified 接受 Date 对象', () => {
    const now = new Date()
    const result = FileMetadataSchema.safeParse({
      key: 'a.txt',
      size: 0,
      contentType: 'text/plain',
      lastModified: now,
    })
    expect(result.success).toBe(true)
  })

  it('可选字段省略时应通过校验', () => {
    const result = FileMetadataSchema.safeParse({
      key: 'a.txt',
      size: 0,
      contentType: 'text/plain',
      lastModified: new Date(),
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.etag).toBeUndefined()
      expect(result.data.metadata).toBeUndefined()
    }
  })

  it('缺少必填字段应校验失败', () => {
    expect(FileMetadataSchema.safeParse({}).success).toBe(false)
    expect(FileMetadataSchema.safeParse({ key: 'a.txt' }).success).toBe(false)
    expect(FileMetadataSchema.safeParse({ key: 'a.txt', size: 0 }).success).toBe(false)
  })
})

describe('presignGetInputSchema', () => {
  it('仅 key 时应通过校验', () => {
    const result = PresignGetInputSchema.safeParse({ key: 'a.txt' })
    expect(result.success).toBe(true)
  })

  it('带可选 expiresIn 应通过校验', () => {
    const result = PresignGetInputSchema.safeParse({ key: 'a.txt', expiresIn: 600 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.expiresIn).toBe(600)
    }
  })

  it('key 为空字符串应校验失败', () => {
    expect(PresignGetInputSchema.safeParse({ key: '' }).success).toBe(false)
  })

  it('缺少 key 应校验失败', () => {
    expect(PresignGetInputSchema.safeParse({}).success).toBe(false)
  })

  it('expiresIn 为 0 应校验失败', () => {
    expect(PresignGetInputSchema.safeParse({ key: 'a.txt', expiresIn: 0 }).success).toBe(false)
  })

  it('expiresIn 为负数应校验失败', () => {
    expect(PresignGetInputSchema.safeParse({ key: 'a.txt', expiresIn: -1 }).success).toBe(false)
  })

  it('expiresIn 为小数应校验失败', () => {
    expect(PresignGetInputSchema.safeParse({ key: 'a.txt', expiresIn: 1.5 }).success).toBe(false)
  })
})

describe('presignPutInputSchema', () => {
  it('仅 key 时应通过校验', () => {
    const result = PresignPutInputSchema.safeParse({ key: 'upload.png' })
    expect(result.success).toBe(true)
  })

  it('带所有可选字段应通过校验', () => {
    const result = PresignPutInputSchema.safeParse({
      key: 'upload.png',
      contentType: 'image/png',
      contentLength: 5242880,
      expiresIn: 300,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.contentType).toBe('image/png')
      expect(result.data.contentLength).toBe(5242880)
      expect(result.data.expiresIn).toBe(300)
    }
  })

  it('key 为空字符串应校验失败', () => {
    expect(PresignPutInputSchema.safeParse({ key: '' }).success).toBe(false)
  })

  it('contentLength 为 0 应校验失败', () => {
    expect(PresignPutInputSchema.safeParse({ key: 'a.txt', contentLength: 0 }).success).toBe(false)
  })

  it('contentLength 为负数应校验失败', () => {
    expect(PresignPutInputSchema.safeParse({ key: 'a.txt', contentLength: -1 }).success).toBe(false)
  })
})

describe('presignUrlOutputSchema', () => {
  it('完整输出应通过校验', () => {
    const result = PresignUrlOutputSchema.safeParse({
      url: 'https://s3.example.com/bucket/key?signature=abc',
      key: 'uploads/image.png',
      expiresAt: '2026-03-01T12:00:00Z',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.expiresAt).toBeInstanceOf(Date)
    }
  })

  it('省略 expiresAt 应通过校验', () => {
    const result = PresignUrlOutputSchema.safeParse({
      url: 'https://example.com/file',
      key: 'a.txt',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.expiresAt).toBeUndefined()
    }
  })

  it('缺少 url 应校验失败', () => {
    expect(PresignUrlOutputSchema.safeParse({ key: 'a.txt' }).success).toBe(false)
  })

  it('缺少 key 应校验失败', () => {
    expect(PresignUrlOutputSchema.safeParse({ url: 'https://example.com' }).success).toBe(false)
  })
})

describe('listFilesOutputSchema', () => {
  it('完整列表结果应通过校验', () => {
    const result = ListFilesOutputSchema.safeParse({
      files: [
        { key: 'a.txt', size: 100, contentType: 'text/plain', lastModified: new Date() },
        { key: 'b.png', size: 2048, contentType: 'image/png', lastModified: '2026-01-01' },
      ],
      commonPrefixes: ['uploads/', 'docs/'],
      nextContinuationToken: 'token123',
      isTruncated: true,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.files).toHaveLength(2)
      expect(result.data.commonPrefixes).toEqual(['uploads/', 'docs/'])
      expect(result.data.isTruncated).toBe(true)
    }
  })

  it('空列表应通过校验', () => {
    const result = ListFilesOutputSchema.safeParse({
      files: [],
      commonPrefixes: [],
      isTruncated: false,
    })
    expect(result.success).toBe(true)
  })

  it('缺少 isTruncated 应校验失败', () => {
    expect(ListFilesOutputSchema.safeParse({
      files: [],
      commonPrefixes: [],
    }).success).toBe(false)
  })

  it('files 中元素缺少必填字段应校验失败', () => {
    expect(ListFilesOutputSchema.safeParse({
      files: [{ key: 'a.txt' }],
      commonPrefixes: [],
      isTruncated: false,
    }).success).toBe(false)
  })
})

describe('deleteFileInputSchema', () => {
  it('合法 key 应通过校验', () => {
    const result = DeleteFileInputSchema.safeParse({ key: 'uploads/a.txt' })
    expect(result.success).toBe(true)
  })

  it('空 key 应校验失败', () => {
    expect(DeleteFileInputSchema.safeParse({ key: '' }).success).toBe(false)
  })

  it('缺少 key 应校验失败', () => {
    expect(DeleteFileInputSchema.safeParse({}).success).toBe(false)
  })
})

describe('deleteFilesInputSchema', () => {
  it('合法 keys 数组应通过校验', () => {
    const result = DeleteFilesInputSchema.safeParse({ keys: ['a.txt', 'b.txt'] })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.keys).toEqual(['a.txt', 'b.txt'])
    }
  })

  it('空数组应校验失败（min(1)）', () => {
    expect(DeleteFilesInputSchema.safeParse({ keys: [] }).success).toBe(false)
  })

  it('数组含空字符串应校验失败', () => {
    expect(DeleteFilesInputSchema.safeParse({ keys: ['a.txt', ''] }).success).toBe(false)
  })

  it('缺少 keys 应校验失败', () => {
    expect(DeleteFilesInputSchema.safeParse({}).success).toBe(false)
  })
})

describe('fileInfoInputSchema', () => {
  it('合法 key 应通过校验', () => {
    const result = FileInfoInputSchema.safeParse({ key: 'docs/readme.md' })
    expect(result.success).toBe(true)
  })

  it('空 key 应校验失败', () => {
    expect(FileInfoInputSchema.safeParse({ key: '' }).success).toBe(false)
  })
})

// ─── 端点契约测试 ───

describe('storageEndpoints', () => {
  it('应包含所有预期端点', () => {
    expect(storageEndpoints).toHaveProperty('presignDownload')
    expect(storageEndpoints).toHaveProperty('presignUpload')
    expect(storageEndpoints).toHaveProperty('fileInfo')
    expect(storageEndpoints).toHaveProperty('listFiles')
    expect(storageEndpoints).toHaveProperty('deleteFile')
    expect(storageEndpoints).toHaveProperty('deleteFiles')
  })

  describe('presignDownload', () => {
    const ep = storageEndpoints.presignDownload

    it('method 应为 POST', () => {
      expect(ep.method).toBe('POST')
    })

    it('path 应为 /storage/presign/download', () => {
      expect(ep.path).toBe('/storage/presign/download')
    })

    it('input schema 应接受合法入参', () => {
      expect(ep.input.safeParse({ key: 'a.txt' }).success).toBe(true)
    })

    it('input schema 应拒绝空 key', () => {
      expect(ep.input.safeParse({ key: '' }).success).toBe(false)
    })

    it('output schema 应接受合法出参', () => {
      expect(ep.output.safeParse({ url: 'https://x.com/a', key: 'a.txt' }).success).toBe(true)
    })

    it('meta 应包含 tags', () => {
      expect(ep.meta?.tags).toContain('storage')
    })
  })

  describe('presignUpload', () => {
    const ep = storageEndpoints.presignUpload

    it('method 应为 POST', () => {
      expect(ep.method).toBe('POST')
    })

    it('path 应为 /storage/presign/upload', () => {
      expect(ep.path).toBe('/storage/presign/upload')
    })

    it('input schema 应接受带 contentType 的入参', () => {
      expect(ep.input.safeParse({ key: 'a.png', contentType: 'image/png' }).success).toBe(true)
    })

    it('output schema 应接受合法出参', () => {
      expect(ep.output.safeParse({ url: 'https://x.com/a', key: 'a.png' }).success).toBe(true)
    })
  })

  describe('fileInfo', () => {
    const ep = storageEndpoints.fileInfo

    it('method 应为 POST', () => {
      expect(ep.method).toBe('POST')
    })

    it('path 应为 /storage/file/info', () => {
      expect(ep.path).toBe('/storage/file/info')
    })

    it('input schema 应接受合法入参', () => {
      expect(ep.input.safeParse({ key: 'file.pdf' }).success).toBe(true)
    })

    it('output schema 应接受完整元数据', () => {
      expect(ep.output.safeParse({
        key: 'file.pdf',
        size: 512,
        contentType: 'application/pdf',
        lastModified: new Date(),
      }).success).toBe(true)
    })
  })

  describe('listFiles', () => {
    const ep = storageEndpoints.listFiles

    it('method 应为 GET', () => {
      expect(ep.method).toBe('GET')
    })

    it('path 应为 /storage/files', () => {
      expect(ep.path).toBe('/storage/files')
    })

    it('input schema 应接受空对象（全部可选）', () => {
      expect(ep.input.safeParse({}).success).toBe(true)
    })

    it('input schema 应接受 prefix 和 maxKeys', () => {
      expect(ep.input.safeParse({ prefix: 'uploads/', maxKeys: 100 }).success).toBe(true)
    })

    it('input schema 中 maxKeys 字符串应通过 coerce 转为数字', () => {
      const result = ep.input.safeParse({ maxKeys: '50' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.maxKeys).toBe(50)
      }
    })

    it('input schema 中 maxKeys 超过 1000 应校验失败', () => {
      expect(ep.input.safeParse({ maxKeys: 1001 }).success).toBe(false)
    })

    it('input schema 中 maxKeys 为 0 应校验失败', () => {
      expect(ep.input.safeParse({ maxKeys: 0 }).success).toBe(false)
    })

    it('output schema 应接受完整列表输出', () => {
      expect(ep.output.safeParse({
        files: [],
        commonPrefixes: [],
        isTruncated: false,
      }).success).toBe(true)
    })
  })

  describe('deleteFile', () => {
    const ep = storageEndpoints.deleteFile

    it('method 应为 POST', () => {
      expect(ep.method).toBe('POST')
    })

    it('path 应为 /storage/file/delete', () => {
      expect(ep.path).toBe('/storage/file/delete')
    })

    it('input schema 应接受合法入参', () => {
      expect(ep.input.safeParse({ key: 'a.txt' }).success).toBe(true)
    })

    it('input schema 应拒绝空 key', () => {
      expect(ep.input.safeParse({ key: '' }).success).toBe(false)
    })
  })

  describe('deleteFiles', () => {
    const ep = storageEndpoints.deleteFiles

    it('method 应为 POST', () => {
      expect(ep.method).toBe('POST')
    })

    it('path 应为 /storage/files/delete', () => {
      expect(ep.path).toBe('/storage/files/delete')
    })

    it('input schema 应接受合法 keys', () => {
      expect(ep.input.safeParse({ keys: ['a.txt', 'b.txt'] }).success).toBe(true)
    })

    it('input schema 应拒绝空数组', () => {
      expect(ep.input.safeParse({ keys: [] }).success).toBe(false)
    })
  })

  describe('端点路径唯一性', () => {
    it('所有端点路径不应重复', () => {
      const paths = Object.values(storageEndpoints).map(ep => ep.path)
      const unique = new Set(paths)
      expect(unique.size).toBe(paths.length)
    })
  })

  describe('端点 method + path 组合唯一', () => {
    it('不应有相同的 method+path 组合', () => {
      const combos = Object.values(storageEndpoints).map(ep => `${ep.method} ${ep.path}`)
      const unique = new Set(combos)
      expect(unique.size).toBe(combos.length)
    })
  })
})
