import type { FileMetadata, ListResult, StorageFunctions } from '@h-ai/storage'
import type { ServContext } from '../src/serv-context.js'
import { Buffer } from 'node:buffer'
import { apiContract } from '@h-ai/api-contract'
import { core, HaiCommonError, ok } from '@h-ai/core'
import { describe, expect, it } from 'vitest'
import { createStorageProcedures } from '../src/features/serv-feature-storage.js'
import { serv } from '../src/serv-main.js'

const logger = core.logger.child({ module: 'serv-test', scope: 'feature-storage' })

const baseFileMetadata: FileMetadata = {
  key: 'uploads/demo.txt',
  size: 1,
  contentType: 'text/plain',
  lastModified: new Date('2024-01-01T00:00:00.000Z'),
}

const baseListResult: ListResult = {
  files: [baseFileMetadata],
  commonPrefixes: [],
  isTruncated: false,
}

function createStorageMock(): StorageFunctions {
  return {
    init: async () => ok(undefined),
    close: async () => {},
    config: null,
    isInitialized: true,
    file: {
      put: async () => ok(baseFileMetadata),
      get: async () => ok(Buffer.from('demo')),
      head: async key => ok({ ...baseFileMetadata, key }),
      exists: async () => ok(true),
      delete: async () => ok(undefined),
      deleteMany: async () => ok(undefined),
      copy: async (_sourceKey, destKey) => ok({ ...baseFileMetadata, key: destKey }),
    },
    dir: {
      list: async () => ok(baseListResult),
      delete: async () => ok(undefined),
    },
    presign: {
      getUrl: async key => ok(`https://download.test/${key}`),
      putUrl: async key => ok(`https://upload.test/${key}`),
      publicUrl: key => `https://public.test/${key}`,
    },
  }
}

function createContext(locale: string) {
  return ({ request }: { request: Request }): ServContext => ({
    requestId: 'req-storage-1',
    locale,
    request,
    logger,
    session: { userId: 'user-1', roles: [], permissions: [] },
  })
}

describe('serv feature storage', () => {
  it('对非法存储 key 返回本地化字段错误', async () => {
    const app = serv.createApp({
      contract: apiContract.storage,
      procedures: createStorageProcedures({ storage: createStorageMock() }),
      createContext: createContext('en-US'),
      http: { openapi: false, docs: false, rpc: false },
    })

    const response = await app.request('/api/v1/storage/presigned-urls/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: '/private/demo.txt' }),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe(HaiCommonError.VALIDATION_ERROR.code)
    expect(body.error.message).toBe('Validation failed')
    expect(body.error.cause).toEqual([
      { field: 'key', message: 'Storage key contains illegal characters' },
    ])
  })

  it('deleteMany 会指出首个非法 key 的数组字段路径', async () => {
    const app = serv.createApp({
      contract: apiContract.storage,
      procedures: createStorageProcedures({ storage: createStorageMock() }),
      createContext: createContext('zh-CN'),
      http: { openapi: false, docs: false, rpc: false },
    })

    const response = await app.request('/api/v1/storage/files/delete-many', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: ['ok/demo.txt', '../escape.txt'] }),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe(HaiCommonError.VALIDATION_ERROR.code)
    expect(body.error.message).toBe('数据验证失败')
    expect(body.error.cause).toEqual([
      { field: 'keys.1', message: '存储 key 不能包含 . 或 .. 路径段' },
    ])
  })
})
