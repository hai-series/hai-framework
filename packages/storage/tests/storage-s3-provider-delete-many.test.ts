import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StorageErrorCode } from '../src/storage-config.js'

const awsMocks = vi.hoisted(() => ({
  send: vi.fn(),
  destroy: vi.fn(),
}))

vi.mock('@aws-sdk/client-s3', () => {
  class PutObjectCommand {
    constructor(readonly input: unknown) {}
  }
  class GetObjectCommand {
    constructor(readonly input: unknown) {}
  }
  class HeadObjectCommand {
    constructor(readonly input: unknown) {}
  }
  class DeleteObjectCommand {
    constructor(readonly input: unknown) {}
  }
  class DeleteObjectsCommand {
    constructor(readonly input: unknown) {}
  }
  class CopyObjectCommand {
    constructor(readonly input: unknown) {}
  }
  class ListObjectsV2Command {
    constructor(readonly input: unknown) {}
  }
  class S3Client {
    send(command: unknown): unknown {
      return awsMocks.send(command)
    }
    destroy(): void {
      awsMocks.destroy()
    }
  }

  return {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    CopyObjectCommand,
    ListObjectsV2Command,
  }
})

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}))

import { createS3Provider } from '../src/providers/storage-provider-s3.js'

describe('storage s3 provider deleteMany', () => {
  const config = {
    type: 's3' as const,
    bucket: 'bucket',
    region: 'ap-southeast-1',
    accessKeyId: 'ak',
    secretAccessKey: 'sk',
    prefix: '',
    forcePathStyle: false,
  }

  beforeEach(() => {
    awsMocks.send.mockReset()
    awsMocks.destroy.mockReset()
  })

  it('deleteMany 遇到部分删除失败时应返回失败', async () => {
    awsMocks.send
      .mockResolvedValueOnce({}) // connect listObjects
      .mockResolvedValueOnce({
        Errors: [{ Key: 'a.txt', Code: 'AccessDenied', Message: 'denied' }],
      }) // deleteMany

    const provider = createS3Provider()
    const connected = await provider.connect(config)
    expect(connected.success).toBe(true)

    const result = await provider.file.deleteMany(['a.txt', 'b.txt'])
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(StorageErrorCode.OPERATION_FAILED)
      expect(Array.isArray(result.error.cause)).toBe(true)
    }
  })

  it('deleteMany 无错误时应返回成功', async () => {
    awsMocks.send
      .mockResolvedValueOnce({}) // connect listObjects
      .mockResolvedValueOnce({ Errors: [] }) // deleteMany

    const provider = createS3Provider()
    const connected = await provider.connect(config)
    expect(connected.success).toBe(true)

    const result = await provider.file.deleteMany(['a.txt'])
    expect(result.success).toBe(true)
  })
})
