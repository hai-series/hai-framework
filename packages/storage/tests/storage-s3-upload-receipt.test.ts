import type { Server } from 'node:http'
import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { storage } from '../src/index.js'

const PART_SIZE = 5 * 1024 * 1024

describe('s3 upload receipt', () => {
  let server: Server
  let firstWrite: PromiseWithResolvers<void>
  let confirmFirstWrite: PromiseWithResolvers<void>
  let reads: string[]
  let writers: Array<string | string[] | undefined>

  beforeEach(async () => {
    firstWrite = Promise.withResolvers()
    confirmFirstWrite = Promise.withResolvers()
    reads = []
    writers = []
    server = createServer((request, response) => {
      request.resume()
      request.once('end', async () => {
        const url = new URL(request.url ?? '/', 'http://fixture')
        const writer = request.headers['x-amz-meta-writer']
        if (request.method === 'GET') {
          response.setHeader('Content-Type', 'application/xml')
          response.end('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>')
        }
        else if (request.method === 'HEAD') {
          reads.push(url.pathname)
          response.writeHead(200, {
            'Content-Type': 'application/json',
            'Content-Length': '4',
            'Last-Modified': 'Wed, 01 Jan 2025 00:00:00 GMT',
            'ETag': '"single"',
            'x-amz-meta-writer': 'replacement',
          }).end()
        }
        else if (url.searchParams.has('uploads')) {
          writers.push(writer)
          response.setHeader('Content-Type', 'application/xml')
          response.end('<InitiateMultipartUploadResult><UploadId>fixture-upload</UploadId></InitiateMultipartUploadResult>')
        }
        else if (url.searchParams.has('partNumber')) {
          response.setHeader('ETag', '"part"')
          response.end()
        }
        else if (request.method === 'POST' && url.searchParams.has('uploadId')) {
          response.setHeader('Content-Type', 'application/xml')
          response.end('<CompleteMultipartUploadResult><ETag>"multipart-2"</ETag></CompleteMultipartUploadResult>')
        }
        else if (request.method === 'PUT') {
          writers.push(writer)
          if (writer === 'original') {
            firstWrite.resolve()
            await confirmFirstWrite.promise
          }
          if (!url.pathname.endsWith('/untagged.txt'))
            response.setHeader('ETag', '"single"')
          response.end()
        }
        else {
          response.writeHead(400).end()
        }
      })
    })
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
  })

  afterEach(async () => {
    confirmFirstWrite.resolve()
    await storage.close()
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error
      ? reject(error)
      : resolve()))
  })

  it('returns the committed upload metadata after a same-ETag overwrite', async () => {
    const startedAt = Date.now()
    const original = storage.file.put('shared.txt', '1234', {
      contentType: 'text/plain',
      metadata: { writer: 'original' },
    })
    try {
      await Promise.race([
        firstWrite.promise,
        original.then(() => { throw new Error('Original upload settled before reaching the fixture') }),
      ])
      expect(await storage.file.put('shared.txt', '1234', {
        contentType: 'application/json',
        metadata: { writer: 'replacement' },
      })).toMatchObject({ success: true })
    }
    finally {
      confirmFirstWrite.resolve()
    }
    const result = await original
    expect(result).toMatchObject({
      success: true,
      data: {
        key: 'shared.txt',
        size: 4,
        contentType: 'text/plain',
        etag: '"single"',
        metadata: { writer: 'original' },
      },
    })
    if (result.success)
      expect(result.data.lastModified.getTime()).toBeGreaterThanOrEqual(startedAt)
    expect(writers).toEqual(['original', 'replacement'])
    expect(reads).toEqual([])
  })

  it.each([
    { name: 'single-part stream', size: 4, etag: '"single"' },
    { name: 'multipart stream', size: PART_SIZE + 1, etag: '"multipart-2"' },
  ])('returns the $name receipt and preserves the submitted metadata', async ({ size, etag }) => {
    const metadata = { writer: 'submitted' }
    async function* source() {
      metadata.writer = 'edited while streaming'
      yield Buffer.alloc(size)
    }
    expect(await storage.file.put('stream.bin', source(), { metadata })).toMatchObject({
      success: true,
      data: {
        key: 'stream.bin',
        size,
        contentType: 'application/octet-stream',
        etag,
        metadata: { writer: 'submitted' },
      },
    })
    expect(writers).toEqual(['submitted'])
    expect(reads).toEqual([])
  })

  it('keeps a successful write without an ETag', async () => {
    const result = await storage.file.put('untagged.txt', 'untagged')
    expect(result).toMatchObject({
      success: true,
      data: {
        key: 'untagged.txt',
        size: 8,
        contentType: 'application/octet-stream',
      },
    })
    if (result.success)
      expect(result.data.etag).toBeUndefined()
    expect(reads).toEqual([])
  })
})
