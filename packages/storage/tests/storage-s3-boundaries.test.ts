import { Readable } from 'node:stream'
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HaiStorageError, storage } from '../src/index.js'

describe('s3 storage operation boundaries', () => {
  beforeEach(async () => {
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({})
    expect(await storage.init({
      type: 's3',
      bucket: 'test-uploads',
      region: 'us-east-1',
      accessKeyId: 'fixture',
      secretAccessKey: 'fixture',
      prefix: 'uploads',
      publicUrl: 'https://files.example.test/assets/?locale=ja#preview',
    })).toEqual({ success: true, data: undefined })
  })

  afterEach(async () => {
    await storage.close()
    vi.restoreAllMocks()
  })

  it('closes the download body before the iterator reads its first chunk', async () => {
    const body = new Readable({
      read() {},
    })
    vi.mocked(S3Client.prototype.send).mockResolvedValueOnce({ Body: body })
    const result = await storage.file.getStream('report.txt')
    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(await result.data[Symbol.asyncIterator]().return?.()).toEqual({ done: true, value: undefined })
    expect(body.destroyed).toBe(true)
  })

  it('aborts a download even after the SDK has returned its response', async () => {
    const body = new Readable({
      read() {},
    })
    const closed = new Promise<void>(resolve => body.once('close', resolve))
    vi.mocked(S3Client.prototype.send).mockResolvedValueOnce({ Body: body })
    const controller = new AbortController()
    const result = await storage.file.getStream('report.txt', { signal: controller.signal })
    expect(result.success).toBe(true)
    if (!result.success)
      return
    const reason = new Error('Reader cancelled')
    controller.abort(reason)
    expect(body.destroyed).toBe(true)
    await closed
    await expect(result.data[Symbol.asyncIterator]().next()).rejects.toMatchObject({ name: 'AbortError', cause: reason })
  })

  it('encodes the key in the public pathname and keeps the base URL components', () => {
    const key = 'reports/月次 #1? 50%.pdf'
    const result = storage.presign.publicUrl(key)
    expect(result).not.toBeNull()
    if (result === null)
      return
    const url = new URL(result)
    expect(decodeURIComponent(url.pathname)).toBe(`/assets/uploads/${key}`)
    expect(url.searchParams.get('locale')).toBe('ja')
    expect(url.hash).toBe('#preview')
  })

  it('reports an explicit missing bucket as a configuration error', async () => {
    const cause = Object.assign(new Error('Bucket was removed'), {
      name: 'NoSuchBucket',
      $metadata: { httpStatusCode: 404 },
    })
    vi.mocked(S3Client.prototype.send).mockRejectedValueOnce(cause)
    expect(await storage.file.exists('report.txt')).toMatchObject({
      success: false,
      error: { code: HaiStorageError.CONFIG_ERROR.code, cause },
    })
  })

  it('uses a single SDK attempt for a single object deletion', async () => {
    expect(await storage.file.delete('report.txt')).toEqual({ success: true, data: undefined })
    const send = vi.mocked(S3Client.prototype.send)
    expect(send).toHaveBeenLastCalledWith(expect.any(DeleteObjectCommand))
    const client = send.mock.contexts.at(-1)
    expect(client).toBeInstanceOf(S3Client)
    if (client instanceof S3Client)
      expect(await client.config.maxAttempts()).toBe(1)
  })

  it('stops a prefix deletion if a truncated page supplies no continuation token', async () => {
    const send = vi.mocked(S3Client.prototype.send)
    send.mockClear().mockResolvedValueOnce({
      IsTruncated: true,
      Contents: [
        { Key: 'uploads/reports/a.txt' },
      ],
    })
    expect(await storage.dir.delete('reports/')).toMatchObject({
      success: false,
      error: { code: HaiStorageError.OPERATION_FAILED.code },
    })
    expect(send).toHaveBeenCalledExactlyOnceWith(expect.any(ListObjectsV2Command))
  })

  it('does not delete the page whose continuation token repeats', async () => {
    const send = vi.mocked(S3Client.prototype.send)
    send.mockClear()
      .mockResolvedValueOnce({ IsTruncated: true, NextContinuationToken: 'page-2' })
      .mockResolvedValueOnce({
        IsTruncated: true,
        NextContinuationToken: 'page-2',
        Contents: [
          { Key: 'uploads/reports/a.txt' },
        ],
      })
    expect(await storage.dir.delete('reports/')).toMatchObject({
      success: false,
      error: { code: HaiStorageError.OPERATION_FAILED.code },
    })
    expect(send.mock.calls.map(([command]) => command.constructor)).toEqual([ListObjectsV2Command, ListObjectsV2Command])
  })
})
