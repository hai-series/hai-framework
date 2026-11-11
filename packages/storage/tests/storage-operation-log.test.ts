import type { LogRecord } from '@h-ai/core'
import { once } from 'node:events'
import { mkdtemp, rm, unlink } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { core } from '@h-ai/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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

  it('s3 上传及连接拒绝分别输出一次 warn 和 error，保留上游状态', async () => {
    let listAllowed = true
    const server = createServer((request, response) => {
      request.resume()
      request.once('end', () => {
        response.setHeader('Content-Type', 'application/xml')
        if (request.method === 'GET' && listAllowed)
          response.end('<ListBucketResult><Name>fixture</Name><IsTruncated>false</IsTruncated></ListBucketResult>')
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
      expect(await storage.file.put('fixture.txt', 'content')).toMatchObject({
        success: false,
        error: { code: HaiStorageError.PERMISSION_DENIED.code },
      })
      listAllowed = false
      expect(await storage.init(config)).toMatchObject({
        success: false,
        error: { code: HaiStorageError.PERMISSION_DENIED.code },
      })
      expect(records.filter(record => record.level === 'warn' || record.level === 'error')).toMatchObject([
        {
          level: 'warn',
          context: { operation: 'file.put', causeCode: 'AccessDenied', httpStatus: 403 },
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
})
