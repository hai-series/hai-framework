import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { expect, it } from 'vitest'
import { HaiStorageError, storage } from '../src/index.js'

it('s3 encodes copy sources and preserves metadata not replaced by the caller', async () => {
  const objects = new Map<string, Buffer>()
  const headers = new Map<string, Record<string, string>>()
  const copies: string[] = []
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const key = decodeURIComponent(url.pathname).slice('/fixture/'.length)
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const etag = '"fixture-etag"'
      response.setHeader('ETag', etag)
      if (url.searchParams.has('list-type')) {
        response.setHeader('Content-Type', 'application/xml')
        response.end('<ListBucketResult><Name>fixture</Name><KeyCount>0</KeyCount><MaxKeys>1</MaxKeys><IsTruncated>false</IsTruncated></ListBucketResult>')
      }
      else if (request.method === 'PUT') {
        const source = request.headers['x-amz-copy-source']
        const uploadHeaders: Record<string, string> = {}
        for (const name of [
          'content-type',
          'cache-control',
          'content-disposition',
          'x-amz-meta-label',
        ]) {
          const value = request.headers[name]
          if (typeof value === 'string')
            uploadHeaders[name] = value
        }
        if (typeof source === 'string') {
          copies.push(source)
          const sourceKey = decodeURIComponent(source).slice('fixture/'.length)
          const content = objects.get(sourceKey)
          if (!content) {
            response.writeHead(404).end()
            return
          }
          if (request.headers['x-amz-metadata-directive'] === 'REPLACE') {
            const requiredSource = key.endsWith('/changed.txt')
              ? '"updated-etag"'
              : etag
            if (request.headers['x-amz-copy-source-if-match'] !== requiredSource) {
              response.writeHead(412, { 'Content-Type': 'application/xml' }).end('<Error><Code>PreconditionFailed</Code></Error>')
              return
            }
          }
          objects.set(key, content)
          headers.set(key, request.headers['x-amz-metadata-directive'] === 'REPLACE'
            ? uploadHeaders
            : headers.get(sourceKey) ?? {})
          response.setHeader('Content-Type', 'application/xml')
          response.end('<CopyObjectResult><ETag>"fixture-etag"</ETag><LastModified>2026-11-08T00:00:00Z</LastModified></CopyObjectResult>')
        }
        else {
          objects.set(key, Buffer.concat(chunks))
          headers.set(key, uploadHeaders)
          response.end()
        }
      }
      else {
        const content = objects.get(key)
        if (!content) {
          response.writeHead(404).end()
          return
        }
        response.setHeader('Content-Length', String(content.length))
        for (const [name, value] of Object.entries(headers.get(key) ?? {}))
          response.setHeader(name, value)
        response.end(request.method === 'HEAD'
          ? undefined
          : content)
      }
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing S3 fixture address')
  try {
    expect((await storage.init({
      type: 's3',
      bucket: 'fixture',
      region: 'us-east-1',
      accessKeyId: 'fixture',
      secretAccessKey: 'fixture',
      endpoint: `http://127.0.0.1:${address.port}`,
      forcePathStyle: true,
      prefix: '目录///',
    })).success).toBe(true)
    const key = '报告 ?#%+!().txt'
    expect((await storage.file.put(key, 'original content', {
      contentType: 'text/plain',
      cacheControl: 'max-age=60',
      contentDisposition: 'attachment',
      metadata: { label: 'original' },
    })).success).toBe(true)
    expect((await storage.file.copy(key, 'copied.txt')).success).toBe(true)
    const copied = await storage.file.get('copied.txt')
    expect(copied.success).toBe(true)
    if (copied.success)
      expect(copied.data.toString()).toBe('original content')
    expect(copies).toEqual(['fixture/%E7%9B%AE%E5%BD%95/%E6%8A%A5%E5%91%8A%20%3F%23%25%2B%21%28%29.txt'])
    expect(await storage.file.copy(key, 'new-type.txt', { contentType: 'text/csv' })).toMatchObject({
      success: true,
      data: {
        contentType: 'text/csv',
        metadata: { label: 'original' },
      },
    })
    expect(await storage.file.copy(key, 'new-label.txt', {
      metadata: { label: 'updated' },
    })).toMatchObject({
      success: true,
      data: {
        contentType: 'text/plain',
        metadata: { label: 'updated' },
      },
    })
    expect(headers.get('目录/new-label.txt')).toMatchObject({
      'cache-control': 'max-age=60',
      'content-disposition': 'attachment',
    })
    expect(await storage.file.copy(key, 'changed.txt', { contentType: 'text/csv' })).toMatchObject({
      success: false,
      error: {
        code: HaiStorageError.OPERATION_FAILED.code,
        cause: {
          $metadata: { httpStatusCode: 412 },
        },
      },
    })
    expect(objects.has('目录/changed.txt')).toBe(false)
  }
  finally {
    await storage.close()
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error
      ? reject(error)
      : resolve()))
  }
})
