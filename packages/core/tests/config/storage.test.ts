/**
 * =============================================================================
 * @hai/core - 存储配置 Schema 测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import {
  LocalStorageConfigSchema,
  OSSStorageConfigSchema,
  S3StorageConfigSchema,
  StorageConfigSchema,
  // 错误码
  StorageErrorCode,
  // Schema
  StorageProviderTypeSchema,
  UploadLimitsSchema,
} from '../../src/config/core-config-storage.js'

describe('core-config-storage', () => {
  describe('storageErrorCode', () => {
    it('应有正确的错误码范围 (5000-5999)', () => {
      expect(StorageErrorCode.FILE_NOT_FOUND).toBe(5000)
      expect(StorageErrorCode.WRITE_FAILED).toBe(5001)
      expect(StorageErrorCode.READ_FAILED).toBe(5002)
      expect(StorageErrorCode.DELETE_FAILED).toBe(5003)
      expect(StorageErrorCode.PERMISSION_DENIED).toBe(5004)
      expect(StorageErrorCode.QUOTA_EXCEEDED).toBe(5005)
      expect(StorageErrorCode.INVALID_PATH).toBe(5006)
      expect(StorageErrorCode.FILE_TOO_LARGE).toBe(5007)
      expect(StorageErrorCode.INVALID_FILE_TYPE).toBe(5008)
      expect(StorageErrorCode.UPLOAD_FAILED).toBe(5009)
      expect(StorageErrorCode.DOWNLOAD_FAILED).toBe(5010)
      expect(StorageErrorCode.SIGNED_URL_FAILED).toBe(5011)
    })
  })

  describe('storageProviderTypeSchema', () => {
    it('应接受有效的存储提供者类型', () => {
      const types = ['hai', 'local', 's3', 'oss', 'cos', 'minio', 'custom']
      for (const type of types) {
        expect(StorageProviderTypeSchema.parse(type)).toBe(type)
      }
    })

    it('应拒绝无效的类型', () => {
      expect(() => StorageProviderTypeSchema.parse('invalid')).toThrow()
    })
  })

  describe('localStorageConfigSchema', () => {
    it('应使用默认值', () => {
      const result = LocalStorageConfigSchema.parse({})
      expect(result.root).toBe('./storage')
      expect(result.publicDir).toBe('public')
      expect(result.privateDir).toBe('private')
      expect(result.tempDir).toBe('temp')
    })

    it('应接受自定义配置', () => {
      const config = {
        root: '/data/storage',
        publicDir: 'pub',
        privateDir: 'priv',
        tempDir: 'tmp',
      }
      const result = LocalStorageConfigSchema.parse(config)
      expect(result.root).toBe('/data/storage')
      expect(result.publicDir).toBe('pub')
    })
  })

  describe('s3StorageConfigSchema', () => {
    it('应使用默认值', () => {
      const config = {
        bucket: 'my-bucket',
        accessKeyId: 'AKIAXXXXXXXX',
        secretAccessKey: 'secret-key',
      }
      const result = S3StorageConfigSchema.parse(config)
      expect(result.region).toBe('us-east-1')
      expect(result.forcePathStyle).toBe(false)
      expect(result.signatureVersion).toBe('v4')
    })

    it('应接受完整配置', () => {
      const config = {
        region: 'ap-northeast-1',
        endpoint: 'https://s3.custom.com',
        bucket: 'my-bucket',
        accessKeyId: 'AKIAXXXXXXXX',
        secretAccessKey: 'secret-key',
        forcePathStyle: true,
        signatureVersion: 'v2',
      }
      const result = S3StorageConfigSchema.parse(config)
      expect(result.region).toBe('ap-northeast-1')
      expect(result.forcePathStyle).toBe(true)
      expect(result.signatureVersion).toBe('v2')
    })

    it('应验证端点 URL 格式', () => {
      expect(() => S3StorageConfigSchema.parse({
        bucket: 'bucket',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        endpoint: 'not-a-url',
      })).toThrow()
    })
  })

  describe('oSSStorageConfigSchema', () => {
    it('应使用默认值', () => {
      const config = {
        region: 'oss-cn-hangzhou',
        bucket: 'my-bucket',
        accessKeyId: 'LTAIXXXXXXXX',
        accessKeySecret: 'secret-key',
      }
      const result = OSSStorageConfigSchema.parse(config)
      expect(result.internal).toBe(false)
    })

    it('应接受完整配置', () => {
      const config = {
        region: 'oss-cn-shanghai',
        bucket: 'my-bucket',
        accessKeyId: 'LTAIXXXXXXXX',
        accessKeySecret: 'secret-key',
        internal: true,
        cdnDomain: 'https://cdn.example.com',
      }
      const result = OSSStorageConfigSchema.parse(config)
      expect(result.internal).toBe(true)
      expect(result.cdnDomain).toBe('https://cdn.example.com')
    })
  })

  describe('uploadLimitsSchema', () => {
    it('应使用默认值', () => {
      const result = UploadLimitsSchema.parse({})
      expect(result.maxFileSize).toBe(10485760) // 10MB
      expect(result.generateThumbnails).toBe(true)
    })

    it('应接受自定义配置', () => {
      const config = {
        maxFileSize: 52428800, // 50MB
        allowedMimeTypes: ['image/*', 'application/pdf'],
        forbiddenExtensions: ['.exe'],
        generateThumbnails: false,
      }
      const result = UploadLimitsSchema.parse(config)
      expect(result.maxFileSize).toBe(52428800)
      expect(result.generateThumbnails).toBe(false)
    })

    it('应验证最大文件大小', () => {
      expect(() => UploadLimitsSchema.parse({ maxFileSize: 0 })).toThrow()
    })
  })

  describe('storageConfigSchema', () => {
    it('应使用默认值', () => {
      const result = StorageConfigSchema.parse({})
      expect(result.provider).toBe('hai')
      expect(result.defaultVisibility).toBe('private')
      expect(result.signedUrlExpiry).toBe(3600)
    })

    it('应接受本地存储配置', () => {
      const config = {
        provider: 'local',
        local: {
          root: '/data/files',
        },
      }
      const result = StorageConfigSchema.parse(config)
      expect(result.provider).toBe('local')
      expect(result.local?.root).toBe('/data/files')
    })

    it('应接受 S3 存储配置', () => {
      const config = {
        provider: 's3',
        s3: {
          bucket: 'my-bucket',
          accessKeyId: 'AKIAXXXXXXXX',
          secretAccessKey: 'secret',
        },
        limits: {
          maxFileSize: 20971520, // 20MB
        },
      }
      const result = StorageConfigSchema.parse(config)
      expect(result.provider).toBe('s3')
      expect(result.s3?.bucket).toBe('my-bucket')
      expect(result.limits?.maxFileSize).toBe(20971520)
    })

    it('应接受完整配置', () => {
      const config = {
        provider: 'oss',
        local: { root: './storage' },
        oss: {
          region: 'oss-cn-hangzhou',
          bucket: 'my-bucket',
          accessKeyId: 'LTAIXXXXXXXX',
          accessKeySecret: 'secret',
        },
        limits: {
          maxFileSize: 104857600, // 100MB
        },
        defaultVisibility: 'public',
      }
      const result = StorageConfigSchema.parse(config)
      expect(result.provider).toBe('oss')
      expect(result.oss?.region).toBe('oss-cn-hangzhou')
      expect(result.defaultVisibility).toBe('public')
    })
  })
})
