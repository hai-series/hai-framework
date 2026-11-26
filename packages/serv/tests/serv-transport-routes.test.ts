import type { ServContext, ServTransportConfig, ServTransportRoute } from '../src/serv-types.js'
import { apiClient } from '@h-ai/api-client'
import { apiContract } from '@h-ai/api-contract'
import { cache } from '@h-ai/cache'
import { core, HaiCommonError } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'
import { eventIterator } from '@orpc/server'
import { expect, it, vi } from 'vitest'
import { z } from 'zod'
import { serv } from '../src/serv-main.js'

const contract = {
  events: apiContract.route({ method: 'GET', path: '/events' }).output(eventIterator(z.string())),
  upload: apiContract.route({ method: 'POST', path: '/files/upload' })
    .input(z.object({
      file: z.file(),
    }))
    .output(apiContract.haiResultSchema(z.object({
      name: z.string(),
    }))),
  download: apiContract.route({ method: 'GET', path: '/files/download' })
    .input(z.object({
      key: z.string(),
    }))
    .output(z.file()),
}
const transportRoutes: ServTransportRoute[] = [
  { procedure: contract.events, maxRequestBytes: 0 },
  { procedure: contract.upload, maxRequestBytes: 1024 },
  { procedure: contract.download, maxRequestBytes: 0 },
]

function createApp(mounts = transportRoutes, transport?: ServTransportConfig, explicitlyDisabled = false) {
  const onEnd = vi.fn()
  const upload = vi.fn()
  const authorized = 'test-token'
  const procedures = serv.implement(contract).context<ServContext>().route('events').permission('events:read').handleTransport(async function* () {
    try {
      yield 'first'
      yield 'last'
    }
    finally {
      onEnd()
    }
  }).route('upload').auth().handleTransport(({ input }) => {
    upload()
    return core.ok({ name: input.file.name })
  }).route('download').auth().handleTransport(({ input }) => input.key === 'owned'
    ? new File(['document'], 'example.txt', { type: 'text/plain' })
    : core.err(HaiCommonError.NOT_FOUND, 'Unknown file')).build()
  const app = serv.createApp({
    contract,
    procedures,
    transportRoutes: mounts,
    transport,
    http: explicitlyDisabled
      ? {
          access: {
            rules: [
              {
                id: 'upload',
                paths: ['/api/v1/files/upload'],
                methods: ['POST'],
                encryption: 'disabled',
              },
            ],
          },
        }
      : undefined,
    auth: {
      verifyToken: async token => token === authorized
        ? core.ok({
            userId: 'user-1',
            permissions: ['events:read'],
            roles: [],
          })
        : core.err(HaiCommonError.UNAUTHORIZED, 'Unknown test session'),
    },
  })
  const headers = { authorization: `Bearer ${authorized}` }
  return { app, headers, onEnd, upload }
}

it('serves an opted-in event iterator and file through the typed client', async () => {
  const { app, headers, onEnd } = createApp()
  const client = apiClient.create(contract)
  const observed: Headers[] = []
  try {
    expect(await client.init({
      baseUrl: 'https://api.test/api/v1',
      headers,
      fetch: async (input, init) => {
        const response = await app.fetch(new Request(input, init))
        observed.push(response.headers)
        return response
      },
    })).toMatchObject({ success: true })
    const stream = await client.events()
    if (!(Symbol.asyncIterator in stream))
      throw new Error(stream.error.message)
    const iterator = stream[Symbol.asyncIterator]()
    expect(await iterator.next()).toEqual({ done: false, value: 'first' })
    await iterator.return?.()
    await vi.waitFor(() => expect(onEnd).toHaveBeenCalledOnce())
    const document = await client.download({ key: 'owned' })
    expect(document).toBeInstanceOf(File)
    if (document instanceof File)
      expect(await document.text()).toBe('document')
    expect(await client.download({ key: 'missing' })).toMatchObject({
      success: false,
      error: { code: HaiCommonError.NOT_FOUND.code, httpStatus: 404 },
    })
    expect(await client.upload({
      file: new File(['test'], 'upload.txt'),
    })).toEqual({
      success: true,
      data: { name: 'upload.txt' },
    })
    expect(observed.every(value => value.get('cache-control') === 'no-store')).toBe(true)
    expect(observed[1]?.get('content-disposition')).toMatch(/^attachment;/)
  }
  finally {
    await client.close()
  }
})

it('authenticates before parsing and enforces the actual upload wire limit', async () => {
  const { app, headers, upload } = createApp()
  const baseUrl = 'https://api.test/api/v1/files/upload'
  const input = new FormData()
  input.set('file', new File([
    'x'.repeat(1024),
  ], 'large.txt'))
  expect((await app.request(baseUrl, { method: 'POST', body: input })).status).toBe(401)
  const res = await app.request(baseUrl, { method: 'POST', headers, body: input })
  expect(res.status).toBe(413)
  expect(upload).not.toHaveBeenCalled()
})

it('keeps the admission decision through input validation for each dispatch of the same Request', async () => {
  const validating = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  const validate = vi.fn()
    .mockImplementationOnce(async () => {
      validating.resolve()
      await resume.promise
    })
  const contract = {
    download: apiContract.route({ method: 'GET', path: '/document' })
      .input(z.object({
        key: z.string(),
      }).superRefine(async () => validate()))
      .output(z.file()),
  }
  const download = vi.fn(() => new File(['document'], 'document.txt', { type: 'text/plain' }))
  const procedures = serv.implement(contract).context<ServContext>().route('download').auth().handleTransport(download).build()
  const handler = serv.createContractHandler({
    contract,
    procedures,
    transportRoutes: [
      { procedure: contract.download, maxRequestBytes: 0 },
    ],
  })
  const request = new Request('https://api.test/api/v1/document?key=receipt')
  const context = {
    request,
    requestId: 'test-report',
    session: { userId: 'user-1', permissions: [], roles: [] },
  }
  const fetchDocument = () => handler.fetch(request, () => context, { enabled: false })
  const first = fetchDocument()
  let second: Response | undefined
  try {
    await validating.promise
    second = await fetchDocument()
  }
  finally {
    resume.resolve()
  }
  for (const response of [await first, second]) {
    expect(response?.status).toBe(200)
    expect(response?.headers.get('cache-control')).toBe('no-store')
    expect(response?.headers.get('content-disposition')).toMatch(/^attachment;/)
    expect(await response?.text()).toBe('document')
  }
  expect(download).toHaveBeenCalledTimes(2)
})

it('denies a transport procedure until the host opts in', async () => {
  const { app, headers } = createApp([])
  expect((await app.request('https://api.test/api/v1/events', { headers })).status).toBe(403)
})

it('validates that the transport policy refers to a guarded, mounted procedure', () => {
  const invalid = apiContract.route({ method: 'GET', path: '/invalid' }).output(z.file())
  expect(() => createApp([
    { procedure: invalid, maxRequestBytes: 0 },
  ])).toThrow('unique mounted transport procedure')
})

it('rejects trailing slash aliases before reading or decoding multipart', async () => {
  const { app, headers, upload } = createApp()
  const pull = vi.fn()
  const request = new Request('https://api.test/api/v1/files/upload///', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'multipart/form-data; boundary=test' },
    body: new ReadableStream<Uint8Array>({ pull }, { highWaterMark: 0 }),
    // @ts-expect-error Node fetch 的请求流选项。
    duplex: 'half',
  })
  expect((await app.fetch(request)).status).toBe(403)
  expect(pull).not.toHaveBeenCalled()
  expect(upload).not.toHaveBeenCalled()
})

it('cancels a multipart upload that stops sending the request body', async () => {
  const { app, headers, upload } = createApp()
  const controller = new AbortController()
  const pull = vi.fn()
  const cancel = vi.fn()
  const request = new Request('https://api.test/api/v1/files/upload', {
    method: 'POST',
    headers,
    body: new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 }),
    signal: controller.signal,
    // @ts-expect-error Node fetch 的请求流选项。
    duplex: 'half',
  })
  const response = app.fetch(request)
  await vi.waitFor(() => expect(pull).toHaveBeenCalled())
  controller.abort()
  expect((await response).status).toBe(408)
  expect(cancel).toHaveBeenCalledOnce()
  expect(upload).not.toHaveBeenCalled()
})

it('requires a route-specific exclusion when application encryption is configured', async () => {
  const initialized = await crypto.init()
  if (!initialized.success)
    throw new Error(initialized.error.message)
  try {
    const keys = crypto.asymmetric.generateKeyPair()
    if (!keys.success)
      throw new Error(keys.error.message)
    const transport: ServTransportConfig = {
      crypto,
      serverKeyRing: {
        activeKeyId: 'test',
        keys: { test: keys.data },
      },
      keyStore: crypto.transport.createKeyStore({ cache }),
      excludePaths: ['/api/v1/files'],
    }
    const encryptedApp = createApp(transportRoutes, transport)
    const admittedApp = createApp(transportRoutes, transport, true)
    const form = new FormData()
    form.set('file', new File(['test'], 'test.txt'))
    const url = 'https://api.test/api/v1/files/upload'
    expect((await encryptedApp.app.request(url, { method: 'POST', headers: encryptedApp.headers, body: form })).status).toBe(403)
    expect(encryptedApp.upload).not.toHaveBeenCalled()
    expect((await admittedApp.app.request(url, { method: 'POST', headers: admittedApp.headers, body: form })).status).toBe(200)
    const invalidHeaders = { ...admittedApp.headers, [crypto.transport.protocol.ENCRYPTED_HEADER]: 'true' }
    expect((await admittedApp.app.request(url, { method: 'POST', headers: invalidHeaders, body: form })).status).toBe(400)
  }
  finally {
    await crypto.close()
  }
})
