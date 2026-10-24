/** S3 可选建桶经公开初始化入口验证；SDK 请求以本地替身覆盖错误与竞争分支。 */
import type { StorageConfigInput } from '../src/storage-config.js'
import { CreateBucketCommand, HeadBucketCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HaiStorageError, S3ConfigSchema, storage } from '../src/index.js'

const config = {
  type: 's3' as const,
  bucket: 'test-uploads',
  region: 'us-east-1',
  accessKeyId: 'test-key',
  secretAccessKey: 'test-secret',
}

function sdkError(name: string, httpStatusCode: number): Error {
  return Object.assign(new Error(name), { name, $metadata: { httpStatusCode } })
}

describe.sequential('storage.init optional S3 bucket creation', () => {
  beforeEach(async () => {
    await storage.close()
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({})
  })
  afterEach(async () => {
    expect((await storage.close()).success).toBe(true)
    vi.restoreAllMocks()
  })

  it('defaults to no bucket management and validates the explicit boolean', async () => {
    expect(S3ConfigSchema.parse(config).createBucket).toBe(false)
    expect(S3ConfigSchema.safeParse({ ...config, createBucket: 'true' }).success).toBe(false)
    expect((await storage.init(config)).success).toBe(true)
    const send = vi.mocked(S3Client.prototype.send)
    expect(send).toHaveBeenCalledExactlyOnceWith(expect.any(ListObjectsV2Command))
  })

  it('checks an existing bucket without creating it', async () => {
    expect((await storage.init({ ...config, createBucket: true })).success).toBe(true)
    const send = vi.mocked(S3Client.prototype.send)
    expect(send.mock.calls.map(([command]) => command.constructor.name)).toEqual(['HeadBucketCommand', 'ListObjectsV2Command'])
    expect(storage.isInitialized).toBe(true)
  })

  it.each(['us-east-1', 'eu-west-1'])('creates a missing bucket with the correct %s location', async (region) => {
    const send = vi.mocked(S3Client.prototype.send)
    send.mockRejectedValueOnce(sdkError('NotFound', 404))
    expect((await storage.init({ ...config, region, createBucket: true })).success).toBe(true)
    expect(send.mock.calls.map(([command]) => command.constructor.name)).toEqual(['HeadBucketCommand', 'CreateBucketCommand', 'ListObjectsV2Command'])
    const creation = send.mock.calls[1]?.[0]
    expect(creation).toBeInstanceOf(CreateBucketCommand)
    expect(creation.input).toEqual(region === 'us-east-1'
      ? { Bucket: config.bucket }
      : { Bucket: config.bucket, CreateBucketConfiguration: { LocationConstraint: region } })
  })

  it.each([sdkError('AccessDenied', 403), sdkError('ServiceUnavailable', 503), new Error('network interrupted')])('does not create on an uncertain or forbidden HeadBucket response: %s', async (error) => {
    const send = vi.mocked(S3Client.prototype.send)
    send.mockRejectedValueOnce(error)
    const destroy = vi.spyOn(S3Client.prototype, 'destroy')
    const result = await storage.init({ ...config, createBucket: true })
    expect(result.success).toBe(false)
    expect(send).toHaveBeenCalledExactlyOnceWith(expect.any(HeadBucketCommand))
    expect(destroy).toHaveBeenCalledTimes(2)
    expect(storage.isInitialized).toBe(false)
    expect(storage.config).toBeNull()
    expect(await storage.file.exists('a.txt')).toMatchObject({ success: false, error: { code: HaiStorageError.NOT_INITIALIZED.code } })
  })

  it('releases both SDK clients when bucket creation fails', async () => {
    const send = vi.mocked(S3Client.prototype.send)
    send.mockRejectedValueOnce(sdkError('NoSuchBucket', 404)).mockRejectedValueOnce(sdkError('AccessDenied', 403))
    const destroy = vi.spyOn(S3Client.prototype, 'destroy')
    const result = await storage.init({ ...config, createBucket: true })
    expect(result).toMatchObject({ success: false, error: { code: HaiStorageError.PERMISSION_DENIED.code } })
    expect(destroy).toHaveBeenCalledTimes(2)
    expect(storage.isInitialized).toBe(false)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('accepts a concurrent creator only after confirming the bucket is accessible', async () => {
    const send = vi.mocked(S3Client.prototype.send)
    send.mockRejectedValueOnce(sdkError('NotFound', 404)).mockRejectedValueOnce(sdkError('BucketAlreadyOwnedByYou', 409))
    expect((await storage.init({ ...config, createBucket: true })).success).toBe(true)
    expect(send.mock.calls.map(([command]) => command.constructor.name)).toEqual(['HeadBucketCommand', 'CreateBucketCommand', 'HeadBucketCommand', 'ListObjectsV2Command'])
  })

  it.each(['BucketAlreadyExists', 'BucketAlreadyOwnedByYou'])('does not accept %s without access', async (name) => {
    const send = vi.mocked(S3Client.prototype.send)
    send.mockRejectedValueOnce(sdkError('NotFound', 404)).mockRejectedValueOnce(sdkError(name, 409)).mockRejectedValueOnce(sdkError('AccessDenied', 403))
    expect((await storage.init({ ...config, createBucket: true })).success).toBe(false)
    expect(storage.isInitialized).toBe(false)
    expect(send.mock.calls.some(([command]) => command instanceof ListObjectsV2Command)).toBe(false)
  })

  it('does not publish readiness if the post-creation connection check fails', async () => {
    const send = vi.mocked(S3Client.prototype.send)
    send.mockRejectedValueOnce(sdkError('NotFound', 404)).mockResolvedValueOnce({}).mockRejectedValueOnce(sdkError('AccessDenied', 403))
    const destroy = vi.spyOn(S3Client.prototype, 'destroy')
    const result = await storage.init({ ...config, createBucket: true } satisfies StorageConfigInput)
    expect(result.success).toBe(false)
    expect(storage.isInitialized).toBe(false)
    expect(destroy).toHaveBeenCalledTimes(2)
  })
})
