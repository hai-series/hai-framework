import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { createReadStream } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HaiStorageError, storage } from '../src/index.js'
import { defineS3StorageSuites, defineStorageSuite, localStorageEnv } from './helpers/storage-test-suite.js'

function defineStreamTests() {
  it('流式写入跨多个 S3 分片，流式读取与范围读取保持字节一致', async () => {
    const chunk = Buffer.alloc(256 * 1024, 7)
    const count = 44
    async function* content() {
      for (let index = 0; index < count; index++)
        yield chunk
    }
    const put = await storage.file.put('stream/large.bin', content(), { ifNoneMatch: '*', contentType: 'application/octet-stream' })
    expect(put.success).toBe(true)
    if (!put.success)
      return
    expect(put.data.size).toBe(chunk.length * count)
    const read = await storage.file.getStream('stream/large.bin')
    expect(read.success).toBe(true)
    if (!read.success)
      return
    const expected = createHash('sha256')
    for (let index = 0; index < count; index++)
      expected.update(chunk)
    expect(await storage.checksum.verify(read.data, expected.digest('hex'))).toEqual({ success: true, data: true })
    const range = await storage.file.getStream('stream/large.bin', { rangeStart: 255, rangeEnd: 258 })
    expect(range.success).toBe(true)
    if (range.success) {
      const bytes = []
      for await (const part of range.data)
        bytes.push(part)
      expect(Buffer.concat(bytes)).toEqual(Buffer.alloc(4, 7))
    }
  })

  it('并发仅创建写入只有一个成功，失败写入不覆盖已存在对象', async () => {
    const writes = await Promise.all(['first', 'second'].map(text => storage.file.put('stream/once.txt', text, { ifNoneMatch: '*' })))
    expect(writes.filter(result => result.success)).toHaveLength(1)
    const failed = writes.find(result => !result.success)
    expect(failed?.success).toBe(false)
    if (failed && !failed.success)
      expect(failed.error.code).toBe(HaiStorageError.ALREADY_EXISTS.code)
    const before = await storage.file.get('stream/once.txt')
    const rejected = await storage.file.put('stream/once.txt', 'replacement', { ifNoneMatch: '*' })
    expect(rejected.success).toBe(false)
    expect(await storage.file.get('stream/once.txt')).toEqual(before)
  })

  it('源流失败不会发布半成品，也不会破坏已有对象', async () => {
    await storage.file.put('stream/stable.txt', 'original')
    async function* broken() {
      yield Buffer.from('partial')
      throw new Error('source failed')
    }
    expect((await storage.file.put('stream/stable.txt', broken())).success).toBe(false)
    expect(await storage.file.get('stream/stable.txt')).toEqual({
      success: true,
      data: Buffer.from('original'),
    })
    const listed = await storage.dir.list({ prefix: 'stream/' })
    expect(listed.success).toBe(true)
    if (listed.success)
      expect(listed.data.files.some(item => item.key.endsWith('.upload.tmp'))).toBe(false)
  })

  it('预先取消不写入对象，缺失文件读取返回错误', async () => {
    expect((await storage.file.put('stream/cancelled.txt', 'content', {
      signal: AbortSignal.abort(),
    })).success).toBe(false)
    expect(await storage.file.exists('stream/cancelled.txt')).toEqual({ success: true, data: false })
    const missing = await storage.file.getStream('stream/missing.txt')
    expect(missing.success).toBe(false)
    if (!missing.success)
      expect(missing.error.code).toBe(HaiStorageError.NOT_FOUND.code)
  })
}

describe('storage streams', () => {
  defineStorageSuite('local', localStorageEnv, defineStreamTests)
  defineS3StorageSuites(defineStreamTests, 'stream')
})

it('s3 流式上传按配置切片并并发发送三片', async () => {
  const partSizeBytes = 6 * 1024 ** 2
  const partSizes: number[] = []
  const pendingParts: Array<() => void> = []
  let singlePutSize: number | undefined
  const directory = await mkdtemp(join(tmpdir(), 'hai-storage-multipart-config-'))
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://fixture')
    let bytes = 0
    request.on('data', (chunk: Buffer) => {
      bytes += chunk.byteLength
    })
    request.once('end', () => {
      if (request.method === 'GET') {
        response.setHeader('Content-Type', 'application/xml')
        response.end('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>')
      }
      else if (request.method === 'HEAD') {
        response.setHeader('Content-Length', url.pathname.endsWith('/single.zip')
          ? singlePutSize ?? 0
          : partSizes.reduce((total, size) => total + size, 0))
        response.end()
      }
      else if (request.method === 'PUT' && url.searchParams.has('partNumber')) {
        partSizes[Number(url.searchParams.get('partNumber')) - 1] = bytes
        pendingParts.push(() => {
          response.setHeader('ETag', '"fixture-part"')
          response.end()
        })
        // 三个请求都已到达后才返回；SDK 使用默认并发 2 时无法进入这个分支。
        if (pendingParts.length === 3) {
          for (const finish of pendingParts)
            finish()
        }
      }
      else if (request.method === 'PUT') {
        singlePutSize = bytes
        response.end()
      }
      else if (url.searchParams.has('uploads') && url.pathname.endsWith('/multipart.zip')) {
        response.setHeader('Content-Type', 'application/xml')
        response.end('<InitiateMultipartUploadResult><UploadId>fixture</UploadId></InitiateMultipartUploadResult>')
      }
      else if (url.searchParams.has('uploadId') && request.method === 'POST') {
        response.setHeader('Content-Type', 'application/xml')
        response.end('<CompleteMultipartUploadResult/>')
      }
      else {
        response.writeHead(400).end('<Error><Code>InvalidRequest</Code></Error>')
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
      multipart: { partSizeBytes, queueSize: 3 },
    })).success).toBe(true)
    const singleSource = join(directory, 'single.zip')
    await writeFile(singleSource, Buffer.alloc(partSizeBytes))
    await expect(storage.file.put('single.zip', createReadStream(singleSource), {
      signal: AbortSignal.timeout(5000),
    }))
      .resolves
      .toMatchObject({
        success: true,
        data: { size: partSizeBytes },
      })
    expect(singlePutSize).toBe(partSizeBytes)

    const size = 2 * partSizeBytes + 1
    const multipartSource = join(directory, 'multipart.zip')
    await writeFile(multipartSource, Buffer.alloc(size))
    await expect(storage.file.put('multipart.zip', createReadStream(multipartSource), {
      signal: AbortSignal.timeout(5000),
    }))
      .resolves
      .toMatchObject({
        success: true,
        data: { size },
      })
    expect(partSizes).toEqual([partSizeBytes, partSizeBytes, 1])
  }
  finally {
    await storage.close()
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error
      ? reject(error)
      : resolve()))
    await rm(directory, { recursive: true, force: true })
  }
}, 15_000)

defineStorageSuite('local stream boundaries', localStorageEnv, () => {
  it('目录不是文件，流式读取在返回阶段报告 INVALID_PATH', async () => {
    expect((await storage.file.put('directory/file.txt', 'content')).success).toBe(true)
    const result = await storage.file.getStream('directory')
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.code).toBe(HaiStorageError.INVALID_PATH.code)
  })
})
