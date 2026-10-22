import type { FileMetadata, ListResult, StorageFunctions } from '@h-ai/storage'
import type { StorageProcedureDeps } from '../src/features/serv-feature-storage.js'
import type { ServContext } from '../src/serv-context.js'
import { Buffer } from 'node:buffer'
import { apiContract } from '@h-ai/api-contract'
import { core, HaiCommonError, ok } from '@h-ai/core'
import { describe, expect, it, vi } from 'vitest'
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
    checksum: { generate: async () => ok('digest'), verify: async () => ok(true) },
    file: {
      put: async () => ok(baseFileMetadata),
      get: async () => ok(Buffer.from('demo')),
      getStream: async () => ok((async function* () { yield Buffer.from('demo') })()),
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

const authorizeUserKeys: StorageProcedureDeps['authorize'] = ({ context, keys }) => {
  const root = `users/${encodeURIComponent(context.session.userId)}/`
  return keys.every(key => key.startsWith(root))
}

describe('serv feature storage', () => {
  it('对非法存储 key 返回本地化字段错误', async () => {
    const app = serv.createApp({
      contract: apiContract.storage,
      procedures: createStorageProcedures({ storage: createStorageMock(), authorize: authorizeUserKeys }),
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
      procedures: createStorageProcedures({ storage: createStorageMock(), authorize: authorizeUserKeys }),
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

  it.each([
    { path: '/storage/presigned-urls/download', method: 'POST', input: { key: 'users/user-2/private.txt' }, target: 'download' },
    { path: '/storage/presigned-urls/upload', method: 'POST', input: { key: 'users/user-2/private.txt' }, target: 'upload' },
    { path: '/storage/files/metadata', method: 'POST', input: { key: 'users/user-2/private.txt' }, target: 'metadata' },
    { path: '/storage/files', method: 'DELETE', input: { key: 'users/user-2/private.txt' }, target: 'delete' },
    { path: '/storage/files/delete-many', method: 'POST', input: { keys: ['users/user-1/own.txt', 'users/user-2/private.txt'] }, target: 'deleteMany' },
    { path: '/storage/files?prefix=users%2Fuser-2%2F', method: 'GET', input: undefined, target: 'list' },
    { path: '/storage/files', method: 'GET', input: undefined, target: 'list' },
    { path: '/storage/files?prefix=users%2Fuser-10%2F', method: 'GET', input: undefined, target: 'list' },
  ])('拒绝用户越权 $target 且不调用存储（$path）', async ({ path, method, input }) => {
    const storage = createStorageMock()
    const spies = [
      vi.spyOn(storage.presign, 'getUrl'),
      vi.spyOn(storage.presign, 'putUrl'),
      vi.spyOn(storage.file, 'head'),
      vi.spyOn(storage.file, 'delete'),
      vi.spyOn(storage.file, 'deleteMany'),
      vi.spyOn(storage.dir, 'list'),
    ]
    const app = serv.createApp({
      contract: apiContract.storage,
      procedures: createStorageProcedures({ storage, authorize: authorizeUserKeys }),
      createContext: createContext('en-US'),
    })
    const response = await app.request(`/api/v1${path}`, {
      method,
      headers: input ? { 'Content-Type': 'application/json' } : undefined,
      body: input ? JSON.stringify(input) : undefined,
    })
    const result = await response.json()
    expect(result.success).toBe(false)
    expect(result.error.code).toBe(HaiCommonError.FORBIDDEN.code)
    expect(spies.every(spy => spy.mock.calls.length === 0)).toBe(true)
  })

  it('授权策略读取可信 session，允许本人访问并明确授予管理员访问', async () => {
    const storage = createStorageMock()
    const head = vi.spyOn(storage.file, 'head')
    const authorize = vi.fn(authorizeUserKeys)
    const app = serv.createApp({
      contract: apiContract.storage,
      procedures: createStorageProcedures({ storage, authorize }),
      createContext: createContext('en-US'),
    })
    const response = await app.request('/api/v1/storage/files/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'users/user-1/own.txt', userId: 'user-2' }),
    })
    expect((await response.json()).success).toBe(true)
    expect(head).toHaveBeenCalledWith('users/user-1/own.txt')
    expect(authorize.mock.calls[0]?.[0].context.session.userId).toBe('user-1')

    const adminApp = serv.createApp({
      contract: apiContract.storage,
      procedures: createStorageProcedures({
        storage,
        authorize: request => request.context.session.permissions.includes('storage.manage'),
      }),
      createContext: ({ request }) => ({ ...createContext('en-US')({ request }), session: { userId: 'admin', roles: [], permissions: ['storage.manage'] } }),
    })
    const adminResponse = await adminApp.request('/api/v1/storage/files/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'users/user-2/private.txt' }),
    })
    expect((await adminResponse.json()).success).toBe(true)
    expect(head).toHaveBeenLastCalledWith('users/user-2/private.txt')
  })

  it.each([
    { path: '/storage/presigned-urls/download', method: 'POST', input: { key: 'users/user-1/own.txt' }, operation: 'download' },
    { path: '/storage/presigned-urls/upload', method: 'POST', input: { key: 'users/user-1/own.txt' }, operation: 'upload' },
    { path: '/storage/files/metadata', method: 'POST', input: { key: 'users/user-1/own.txt' }, operation: 'metadata' },
    { path: '/storage/files', method: 'DELETE', input: { key: 'users/user-1/own.txt' }, operation: 'delete' },
    { path: '/storage/files/delete-many', method: 'POST', input: { keys: ['users/user-1/a.txt', 'users/user-1/b.txt'] }, operation: 'deleteMany' },
    { path: '/storage/files?prefix=users%2Fuser-1%2F', method: 'GET', input: undefined, operation: 'list' },
  ])('本人资源的 $operation 通过异步授权后正常执行', async ({ path, method, input, operation }) => {
    const authorize = vi.fn(async (request: Parameters<StorageProcedureDeps['authorize']>[0]) => authorizeUserKeys(request))
    const app = serv.createApp({
      contract: apiContract.storage,
      procedures: createStorageProcedures({ storage: createStorageMock(), authorize }),
      createContext: createContext('en-US'),
    })
    const response = await app.request(`/api/v1${path}`, {
      method,
      headers: input ? { 'Content-Type': 'application/json' } : undefined,
      body: input ? JSON.stringify(input) : undefined,
    })
    expect((await response.json()).success).toBe(true)
    expect(authorize).toHaveBeenCalledOnce()
    expect(authorize.mock.calls[0]?.[0].operation).toBe(operation)
  })

  it('遗漏授权策略的调用方默认被拒绝', async () => {
    const storage = createStorageMock()
    const head = vi.spyOn(storage.file, 'head')
    const app = serv.createApp({
      contract: apiContract.storage,
      // @ts-expect-error 模拟未经过 TypeScript 检查的调用方，运行时必须默认拒绝。
      procedures: createStorageProcedures({ storage }),
      createContext: createContext('en-US'),
    })
    const response = await app.request('/api/v1/storage/files/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'users/user-1/own.txt' }),
    })
    expect((await response.json()).error.code).toBe(HaiCommonError.FORBIDDEN.code)
    expect(head).not.toHaveBeenCalled()
  })
})
