/**
 * @h-ai/storage — 配置 Schema 与错误码测试
 */

import { describe, expect, it } from 'vitest'
import {
  HaiStorageError,
  LocalConfigSchema,
  PresignOptionsSchema,
  PresignUploadOptionsSchema,
  S3ConfigSchema,
  StorageConfigSchema,
} from '../src/index.js'

describe('haiStorageError', () => {
  it('错误码应符合 hai:storage:NNN 格式', () => {
    for (const [, def] of Object.entries(HaiStorageError)) {
      expect(def.code).toMatch(/^hai:storage:\d{3}$/)
    }
  })

  it('错误码不应有重复值', () => {
    const codes = Object.values(HaiStorageError).map(d => d.code)
    const unique = new Set(codes)
    expect(unique.size).toBe(codes.length)
  })

  it('应包含所有预期的错误码', () => {
    expect(HaiStorageError.CONNECTION_FAILED.code).toBe('hai:storage:001')
    expect(HaiStorageError.OPERATION_FAILED.code).toBe('hai:storage:002')
    expect(HaiStorageError.NOT_FOUND.code).toBe('hai:storage:003')
    expect(HaiStorageError.ALREADY_EXISTS.code).toBe('hai:storage:004')
    expect(HaiStorageError.PERMISSION_DENIED.code).toBe('hai:storage:005')
    expect(HaiStorageError.QUOTA_EXCEEDED.code).toBe('hai:storage:006')
    expect(HaiStorageError.INVALID_PATH.code).toBe('hai:storage:007')
    expect(HaiStorageError.IO_ERROR.code).toBe('hai:storage:008')
    expect(HaiStorageError.NETWORK_ERROR.code).toBe('hai:storage:009')
    expect(HaiStorageError.NOT_INITIALIZED.code).toBe('hai:storage:010')
    expect(HaiStorageError.UNSUPPORTED_TYPE.code).toBe('hai:storage:011')
    expect(HaiStorageError.CONFIG_ERROR.code).toBe('hai:storage:012')
    expect(HaiStorageError.PRESIGN_FAILED.code).toBe('hai:storage:013')
    expect(HaiStorageError.UPLOAD_FAILED.code).toBe('hai:storage:014')
    expect(HaiStorageError.DOWNLOAD_FAILED.code).toBe('hai:storage:015')
  })
})

describe('storageConfigSchema', () => {
  // ─── S3 配置 ───

  describe('s3ConfigSchema', () => {
    const validS3 = {
      type: 's3' as const,
      bucket: 'my-bucket',
      region: 'us-east-1',
      accessKeyId: 'AKIAXXXXXXXX',
      secretAccessKey: 'secret123',
    }

    it('合法的 S3 配置应通过校验', () => {
      const result = S3ConfigSchema.parse(validS3)
      expect(result.type).toBe('s3')
      expect(result.bucket).toBe('my-bucket')
      expect(result.forcePathStyle).toBe(false)
      expect(result.prefix).toBe('')
    })

    it('缺少 bucket 应校验失败', () => {
      const { bucket: _, ...noBucket } = validS3
      expect(() => S3ConfigSchema.parse(noBucket)).toThrow()
    })

    it('空 bucket 应校验失败', () => {
      expect(() => S3ConfigSchema.parse({ ...validS3, bucket: '' })).toThrow()
    })

    it('缺少 region 应校验失败', () => {
      const { region: _, ...noRegion } = validS3
      expect(() => S3ConfigSchema.parse(noRegion)).toThrow()
    })

    it('空 region 应校验失败', () => {
      expect(() => S3ConfigSchema.parse({ ...validS3, region: '' })).toThrow()
    })

    it('缺少 accessKeyId 应校验失败', () => {
      const { accessKeyId: _, ...noKey } = validS3
      expect(() => S3ConfigSchema.parse(noKey)).toThrow()
    })

    it('空 accessKeyId 应校验失败', () => {
      expect(() => S3ConfigSchema.parse({ ...validS3, accessKeyId: '' })).toThrow()
    })

    it('缺少 secretAccessKey 应校验失败', () => {
      const { secretAccessKey: _, ...noSecret } = validS3
      expect(() => S3ConfigSchema.parse(noSecret)).toThrow()
    })

    it('空 secretAccessKey 应校验失败', () => {
      expect(() => S3ConfigSchema.parse({ ...validS3, secretAccessKey: '' })).toThrow()
    })

    it('带可选字段的完整 S3 配置应通过', () => {
      const full = {
        ...validS3,
        endpoint: 'http://localhost:9000',
        forcePathStyle: true,
        prefix: 'uploads',
        publicUrl: 'https://cdn.example.com',
      }
      const result = S3ConfigSchema.parse(full)
      expect(result.endpoint).toBe('http://localhost:9000')
      expect(result.forcePathStyle).toBe(true)
      expect(result.prefix).toBe('uploads')
      expect(result.publicUrl).toBe('https://cdn.example.com')
    })

    it('非法 endpoint URL 应校验失败', () => {
      expect(() => S3ConfigSchema.parse({ ...validS3, endpoint: 'not-a-url' })).toThrow()
    })

    it('非法 publicUrl 应校验失败', () => {
      expect(() => S3ConfigSchema.parse({ ...validS3, publicUrl: 'not-a-url' })).toThrow()
    })
  })

  // ─── Local 配置 ───

  describe('localConfigSchema', () => {
    const validLocal = {
      type: 'local' as const,
      root: '/data/uploads',
    }

    it('合法的 local 配置应通过校验', () => {
      const result = LocalConfigSchema.parse(validLocal)
      expect(result.type).toBe('local')
      expect(result.root).toBe('/data/uploads')
      expect(result.directoryMode).toBe(0o755)
      expect(result.fileMode).toBe(0o644)
    })

    it('缺少 root 应校验失败', () => {
      expect(() => LocalConfigSchema.parse({ type: 'local' })).toThrow()
    })

    it('空 root 应校验失败', () => {
      expect(() => LocalConfigSchema.parse({ type: 'local', root: '' })).toThrow()
    })

    it('自定义权限应正确解析', () => {
      const result = LocalConfigSchema.parse({
        ...validLocal,
        directoryMode: 0o700,
        fileMode: 0o600,
      })
      expect(result.directoryMode).toBe(0o700)
      expect(result.fileMode).toBe(0o600)
    })
  })

  // ─── 联合 Schema ───

  describe('discriminatedUnion', () => {
    it('应根据 type 正确区分 S3 和 Local', () => {
      const s3 = StorageConfigSchema.parse({
        type: 's3',
        bucket: 'b',
        region: 'r',
        accessKeyId: 'k',
        secretAccessKey: 's',
      })
      expect(s3.type).toBe('s3')

      const local = StorageConfigSchema.parse({
        type: 'local',
        root: '/tmp',
      })
      expect(local.type).toBe('local')
    })

    it('未知 type 应校验失败', () => {
      expect(() => StorageConfigSchema.parse({ type: 'unknown' })).toThrow()
    })

    it('缺少 type 应校验失败', () => {
      expect(() => StorageConfigSchema.parse({ root: '/tmp' })).toThrow()
    })
  })
})

describe('presignOptionsSchema', () => {
  it('默认 expiresIn 应为 3600', () => {
    const result = PresignOptionsSchema.parse({})
    expect(result.expiresIn).toBe(3600)
  })

  it('有效的 expiresIn 应通过（范围 1-604800）', () => {
    expect(PresignOptionsSchema.parse({ expiresIn: 1 }).expiresIn).toBe(1)
    expect(PresignOptionsSchema.parse({ expiresIn: 604800 }).expiresIn).toBe(604800)
    expect(PresignOptionsSchema.parse({ expiresIn: 60 }).expiresIn).toBe(60)
  })

  it('expiresIn 超出范围应校验失败', () => {
    expect(() => PresignOptionsSchema.parse({ expiresIn: 0 })).toThrow()
    expect(() => PresignOptionsSchema.parse({ expiresIn: -1 })).toThrow()
    expect(() => PresignOptionsSchema.parse({ expiresIn: 604801 })).toThrow()
  })

  it('可选字段 responseContentType 应正确传递', () => {
    const result = PresignOptionsSchema.parse({
      responseContentType: 'application/pdf',
      responseContentDisposition: 'attachment; filename="test.pdf"',
    })
    expect(result.responseContentType).toBe('application/pdf')
    expect(result.responseContentDisposition).toBe('attachment; filename="test.pdf"')
  })
})

describe('presignUploadOptionsSchema', () => {
  it('默认 contentType 应为 application/octet-stream', () => {
    const result = PresignUploadOptionsSchema.parse({})
    expect(result.contentType).toBe('application/octet-stream')
  })

  it('自定义 contentType 应正确传递', () => {
    const result = PresignUploadOptionsSchema.parse({ contentType: 'image/png' })
    expect(result.contentType).toBe('image/png')
  })

  it('可选 maxSize 应正确传递', () => {
    const result = PresignUploadOptionsSchema.parse({ maxSize: 10 * 1024 * 1024 })
    expect(result.maxSize).toBe(10 * 1024 * 1024)
  })

  it('继承 PresignOptions 的 expiresIn 默认值', () => {
    const result = PresignUploadOptionsSchema.parse({})
    expect(result.expiresIn).toBe(3600)
  })
})
