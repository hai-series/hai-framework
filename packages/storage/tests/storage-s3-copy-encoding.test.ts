import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { expect, it } from 'vitest'
import { storage } from '../src/index.js'

it('s3 copies keys containing Unicode and URL delimiters without changing the source object', async () => {
  const objects = new Map<string, Buffer>()
  const copies: string[] = []
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const key = decodeURIComponent(url.pathname).slice('/fixture/'.length)
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      response.setHeader('ETag', '"fixture-etag"')
      if (url.searchParams.has('list-type')) {
        response.setHeader('Content-Type', 'application/xml')
        response.end('<ListBucketResult><Name>fixture</Name><KeyCount>0</KeyCount><MaxKeys>1</MaxKeys><IsTruncated>false</IsTruncated></ListBucketResult>')
      }
      else if (request.method === 'PUT') {
        const source = request.headers['x-amz-copy-source']
        if (typeof source === 'string') {
          copies.push(source)
          const content = objects.get(decodeURIComponent(source).slice('fixture/'.length))
          if (!content) {
            response.writeHead(404).end()
            return
          }
          objects.set(key, content)
          response.setHeader('Content-Type', 'application/xml')
          response.end('<CopyObjectResult><ETag>"fixture-etag"</ETag><LastModified>2026-11-08T00:00:00Z</LastModified></CopyObjectResult>')
        }
        else {
          objects.set(key, Buffer.concat(chunks))
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
      prefix: '目录/',
    })).success).toBe(true)
    const key = '报告 ?#%+!().txt'
    expect((await storage.file.put(key, 'original content')).success).toBe(true)
    expect((await storage.file.copy(key, 'copied.txt')).success).toBe(true)
    const copied = await storage.file.get('copied.txt')
    expect(copied.success).toBe(true)
    if (copied.success)
      expect(copied.data.toString()).toBe('original content')
    expect(copies).toEqual(['fixture/%E7%9B%AE%E5%BD%95/%E6%8A%A5%E5%91%8A%20%3F%23%25%2B%21%28%29.txt'])
  }
  finally {
    await storage.close()
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error
      ? reject(error)
      : resolve()))
  }
})
