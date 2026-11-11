import type { LogRecord } from '@h-ai/core'
import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { createReadStream } from 'node:fs'
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { core } from '@h-ai/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HaiStorageError, storage } from '../src/index.js'

describe('storage 操作日志', () => {
  const records: LogRecord[] = []
  let root: string
  let restore: () => void

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'hai-storage-log-'))
    const previousLevel = core.logger.getLevel()
    core.logger.setLevel('debug')
    records.length = 0
    const stop = core.logger.observe((record) => {
      if (record.context.module === 'storage')
        records.push(record)
    })
    restore = () => {
      stop()
      core.logger.setLevel(previousLevel)
    }
  })

  afterEach(async () => {
    restore()
    await storage.close()
    await rm(root, { recursive: true, force: true })
  })

  it('默认只记录写操作，批量委托不重复输出内部写入或失败', async () => {
    expect((await storage.init({ type: 'local', root })).success).toBe(true)
    const key = 'private-fixture-name.txt'
    expect((await storage.file.put(key, 'abc', {
      metadata: { label: 'private-fixture-metadata' },
    })).success).toBe(true)
    expect(await storage.file.exists('missing.txt')).toEqual({ success: true, data: false })
    const missing = await storage.file.get('missing.txt')
    expect(missing).toMatchObject({
      success: false,
      error: { code: HaiStorageError.NOT_FOUND.code },
    })
    const removed = await storage.file.deleteMany([key, '../outside.txt'])
    expect(removed).toMatchObject({
      success: false,
      error: {
        ext: {
          deleteMany: {
            deletedKeys: [key],
          },
        },
      },
    })
    const operations = records.filter(record => record.context.operation)
    expect(operations.map(record => [record.level, record.context.operation])).toEqual([
      ['debug', 'file.put'],
      ['warn', 'file.get'],
      ['debug', 'file.deleteMany'],
      ['warn', 'file.deleteMany'],
    ])
    expect(operations[0].context.payload).toBe('{"byteLength":3}')
    expect(JSON.stringify(operations)).not.toContain('private-fixture-')
  })

  it('写日志开关和 Core 阈值只控制操作日志，失败继续记录', async () => {
    expect((await storage.init({
      type: 'local',
      root,
      operationLog: { write: false, read: true },
    })).success).toBe(true)
    expect((await storage.file.put('fixture.txt', 'abc')).success).toBe(true)
    expect((await storage.file.get('fixture.txt')).success).toBe(true)
    core.logger.setLevel('info')
    const result = await storage.presign.putUrl('fixture.txt')
    expect(result).toMatchObject({
      success: false,
      error: { code: HaiStorageError.UNSUPPORTED_OPERATION.code },
    })
    await storage.file.get('fixture.txt')
    expect(records.filter(record => record.context.operation).map(record => [record.level, record.context.operation])).toEqual([
      ['debug', 'file.get'],
      ['warn', 'presign.putUrl'],
    ])
  })

  it('下载流在消费期间失败时记录告警并保留原异常', async () => {
    expect((await storage.init({ type: 'local', root })).success).toBe(true)
    expect((await storage.file.put('removed.txt', 'content')).success).toBe(true)
    const stream = await storage.file.getStream('removed.txt')
    expect(stream.success).toBe(true)
    if (!stream.success)
      throw new Error('Expected a lazy stream')
    await unlink(join(root, 'removed.txt'))
    const consume = async () => {
      for await (const chunk of stream.data)
        void chunk
    }
    await expect(consume()).rejects.toMatchObject({ code: 'ENOENT' })
    expect(records.filter(record => record.level === 'warn')).toMatchObject([
      {
        context: { operation: 'file.getStream', causeCode: 'ENOENT' },
      },
    ])
  })

  it('文件流上传保留源错误、目标冲突和取消原因，并给出对应告警', async () => {
    expect((await storage.init({
      type: 'local',
      root: join(root, 'objects'),
    })).success).toBe(true)
    const source = join(root, 'private-upload-source.zip')
    const options = { ifNoneMatch: '*' as const, contentType: 'application/zip', contentDisposition: 'attachment' }
    const missing = await storage.file.put('archive.zip', createReadStream(source), options)
    expect(missing).toMatchObject({
      success: false,
      error: {
        code: HaiStorageError.UPLOAD_FAILED.code,
        cause: { code: 'ENOENT' },
      },
    })
    await writeFile(source, 'archive data')
    expect((await storage.file.put('archive.zip', createReadStream(source), options)).success).toBe(true)
    const conflict = await storage.file.put('archive.zip', createReadStream(source), options)
    expect(conflict).toMatchObject({
      success: false,
      error: {
        code: HaiStorageError.ALREADY_EXISTS.code,
        cause: { code: 'EEXIST' },
      },
    })
    const controller = new AbortController()
    const cancellation = new Error('cancelled by the caller')
    controller.abort(cancellation)
    const unopened = createReadStream(source)
    const cancelled = await storage.file.put('cancelled.zip', unopened, { ...options, signal: controller.signal })
    expect(cancelled.success).toBe(false)
    if (!cancelled.success)
      expect(cancelled.error.cause).toBe(cancellation)
    expect(unopened.destroyed).toBe(true)
    expect(records.filter(record => record.level === 'warn')).toMatchObject([
      {
        context: { operation: 'file.put', reason: 'Could not read the upload source', causeCode: 'ENOENT' },
      },
      {
        context: { operation: 'file.put', reason: 'Destination object already exists', causeCode: 'EEXIST' },
      },
      {
        context: { operation: 'file.put', reason: 'Storage operation was cancelled' },
      },
    ])
    expect(JSON.stringify(records)).not.toMatch(/private-upload-source|cancelled by the caller|archive data/)
  })

  it('上传源清理失败不会覆盖原始读取原因', async () => {
    expect((await storage.init({ type: 'local', root })).success).toBe(true)
    const cause = { detail: 'private source detail' }
    const closeSource = vi.fn().mockRejectedValue(new Error('source cleanup failed'))
    const input: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(cause),
        return: closeSource,
      }),
    }
    const result = await storage.file.put('archive.zip', input)
    expect(result).toMatchObject({
      success: false,
      error: { code: HaiStorageError.UPLOAD_FAILED.code },
    })
    if (!result.success)
      expect(result.error.cause).toBe(cause)
    expect(closeSource).toHaveBeenCalledOnce()
    expect(records.filter(record => record.level === 'warn')).toMatchObject([
      {
        context: { reason: 'Could not read the upload source' },
      },
    ])
    expect(JSON.stringify(records)).not.toContain('private source detail')
  })

  it('s3 上传及连接拒绝分别输出一次 warn 和 error，保留上游状态', async () => {
    let listAllowed = true
    const server = createServer((request, response) => {
      request.resume()
      request.once('end', () => {
        response.setHeader('Content-Type', 'application/xml')
        if (request.method === 'GET' && listAllowed)
          response.end('<ListBucketResult><Name>fixture</Name><IsTruncated>false</IsTruncated></ListBucketResult>')
        else if (request.method === 'PUT' && request.headers['if-none-match'] === '*')
          response.writeHead(412).end('<Error><Code>PreconditionFailed</Code><Message>private upstream message</Message></Error>')
        else
          response.writeHead(403).end('<Error><Code>AccessDenied</Code><Message>private upstream message</Message></Error>')
      })
    })
    try {
      server.listen(0, '127.0.0.1')
      await once(server, 'listening')
      const address = server.address()
      if (!address || typeof address === 'string')
        throw new Error('Missing S3 fixture address')
      const config = {
        type: 's3' as const,
        bucket: 'fixture',
        region: 'us-east-1',
        accessKeyId: 'fixture',
        secretAccessKey: 'fixture',
        endpoint: `http://127.0.0.1:${address.port}`,
        forcePathStyle: true,
      }
      expect((await storage.init(config)).success).toBe(true)
      const missing = await storage.file.put('missing.zip', createReadStream(join(root, 'missing.zip')))
      expect(missing).toMatchObject({
        success: false,
        error: {
          code: HaiStorageError.UPLOAD_FAILED.code,
          cause: { code: 'ENOENT' },
        },
      })
      expect(await storage.file.put('fixture.txt', 'content')).toMatchObject({
        success: false,
        error: { code: HaiStorageError.PERMISSION_DENIED.code },
      })
      const source = join(root, 'archive.zip')
      await writeFile(source, 'synthetic archive data')
      const conflict = await storage.file.put('fixture.zip', createReadStream(source), { ifNoneMatch: '*', contentType: 'application/zip', contentDisposition: 'attachment' })
      expect(conflict).toMatchObject({
        success: false,
        error: {
          code: HaiStorageError.ALREADY_EXISTS.code,
          cause: { name: 'PreconditionFailed' },
        },
      })
      listAllowed = false
      expect(await storage.init(config)).toMatchObject({
        success: false,
        error: { code: HaiStorageError.PERMISSION_DENIED.code },
      })
      expect(records.filter(record => record.level === 'warn' || record.level === 'error')).toMatchObject([
        {
          level: 'warn',
          context: { operation: 'file.put', reason: 'Could not read the upload source', causeCode: 'ENOENT' },
        },
        {
          level: 'warn',
          context: { operation: 'file.put', causeCode: 'AccessDenied', httpStatus: 403 },
        },
        {
          level: 'warn',
          context: {
            operation: 'file.put',
            reason: 'Destination object already exists',
            causeCode: 'PreconditionFailed',
            httpStatus: 412,
          },
        },
        {
          level: 'error',
          context: { provider: 's3', causeCode: 'AccessDenied', httpStatus: 403 },
        },
      ])
      expect(JSON.stringify(records)).not.toContain('private upstream message')
    }
    finally {
      await storage.close()
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error
        ? reject(error)
        : resolve()))
    }
  })

  it('s3 分片失败后清理被拒绝时保留原始错误，并发上传诊断互不影响', async () => {
    const server = createServer((request, response) => {
      request.resume()
      request.once('end', () => {
        const path = new URL(request.url ?? '/', 'http://fixture')
        const cleanupDenied = path.pathname.endsWith('/cleanup-denied.zip')
        const missingETag = path.pathname.endsWith('/missing-etag.zip')
        response.setHeader('Content-Type', 'application/xml')
        if (request.method === 'GET') {
          response.end('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>')
        }
        else if (path.searchParams.has('uploads')) {
          response.end('<InitiateMultipartUploadResult><UploadId>fixture</UploadId></InitiateMultipartUploadResult>')
        }
        else if (path.searchParams.get('partNumber') === '1' && missingETag) {
          response.setHeader('x-amz-request-id', 'missing-etag-part')
          response.end()
        }
        else if (path.searchParams.get('partNumber') === '1') {
          response.setHeader('x-amz-request-id', cleanupDenied ? 'first-failure' : 'other-failure')
          response.writeHead(400).end(`<Error><Code>${cleanupDenied ? 'InvalidRequest' : 'BadDigest'}</Code><Message>private upstream reason</Message></Error>`)
        }
        else if (path.searchParams.has('partNumber')) {
          response.setHeader('ETag', '"fixture-part"')
          response.end()
        }
        else if (request.method === 'DELETE' && (cleanupDenied || missingETag)) {
          response.setHeader('x-amz-request-id', missingETag ? 'missing-etag-cleanup' : 'cleanup-failure')
          response.writeHead(403).end('<Error><Code>AccessDenied</Code><Message>private cleanup reason</Message></Error>')
        }
        else {
          response.writeHead(204).end()
        }
      })
    })
    try {
      server.listen(0, '127.0.0.1')
      await once(server, 'listening')
      const address = server.address()
      if (!address || typeof address === 'string')
        throw new Error('Missing S3 fixture address')
      expect((await storage.init({
        type: 's3',
        bucket: 'fixture',
        region: 'us-east-1',
        accessKeyId: 'fixture',
        secretAccessKey: 'fixture',
        endpoint: `http://127.0.0.1:${address.port}`,
        forcePathStyle: true,
      })).success).toBe(true)
      const source = join(root, 'archive.zip')
      await writeFile(source, Buffer.alloc(5 * 1024 * 1024 + 1))
      const options = { ifNoneMatch: '*' as const, signal: new AbortController().signal }
      const [denied, cleaned, missingETag] = await Promise.all([
        storage.file.put('cleanup-denied.zip', createReadStream(source), options),
        storage.file.put('cleanup-succeeded.zip', createReadStream(source), options),
        storage.file.put('missing-etag.zip', createReadStream(source), options),
      ])
      expect(denied).toMatchObject({
        success: false,
        error: {
          code: HaiStorageError.OPERATION_FAILED.code,
          cause: {
            name: 'InvalidRequest',
            $metadata: { httpStatusCode: 400, requestId: 'first-failure' },
          },
          ext: {
            s3Operation: 'UploadPart',
            cleanupPending: true,
            cleanupError: {
              code: HaiStorageError.PERMISSION_DENIED.code,
              cause: {
                name: 'AccessDenied',
                $metadata: { httpStatusCode: 403, requestId: 'cleanup-failure' },
              },
            },
          },
        },
      })
      expect(cleaned).toMatchObject({
        success: false,
        error: {
          cause: { name: 'BadDigest' },
          ext: { s3Operation: 'UploadPart' },
        },
      })
      if (!cleaned.success)
        expect(cleaned.error.ext?.cleanupError).toBeUndefined()
      expect(missingETag).toMatchObject({
        success: false,
        error: {
          code: HaiStorageError.OPERATION_FAILED.code,
          cause: {
            name: 'MissingETag',
            partNumber: 1,
            $metadata: { httpStatusCode: 200, requestId: 'missing-etag-part' },
          },
          ext: {
            s3Operation: 'UploadPart',
            cleanupPending: true,
            cleanupError: {
              code: HaiStorageError.PERMISSION_DENIED.code,
              cause: {
                name: 'AccessDenied',
                $metadata: { httpStatusCode: 403, requestId: 'missing-etag-cleanup' },
              },
            },
          },
        },
      })
      const warnings = records.filter(record => record.level === 'warn')
      expect(warnings).toHaveLength(3)
      expect(warnings).toEqual(expect.arrayContaining([
        expect.objectContaining({
          context: expect.objectContaining({
            operation: 'file.put',
            s3Operation: 'UploadPart',
            causeCode: 'InvalidRequest',
            providerRequestId: 'first-failure',
            cleanupError: expect.objectContaining({
              causeCode: 'AccessDenied',
              httpStatus: 403,
              providerRequestId: 'cleanup-failure',
            }),
          }),
        }),
        expect.objectContaining({
          context: expect.objectContaining({ causeCode: 'BadDigest', providerRequestId: 'other-failure' }),
        }),
        expect.objectContaining({
          context: expect.objectContaining({
            operation: 'file.put',
            s3Operation: 'UploadPart',
            causeCode: 'MissingETag',
            partNumber: 1,
            providerRequestId: 'missing-etag-part',
            cleanupError: expect.objectContaining({ causeCode: 'AccessDenied', providerRequestId: 'missing-etag-cleanup' }),
          }),
        }),
      ]))
      expect(JSON.stringify(records)).not.toMatch(/private upstream reason|private cleanup reason|cleanup-denied\.zip|missing-etag\.zip/)
    }
    finally {
      await storage.close()
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error
        ? reject(error)
        : resolve()))
    }
  })
})
