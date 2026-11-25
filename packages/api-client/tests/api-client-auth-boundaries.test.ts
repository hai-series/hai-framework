import { apiContract } from '@h-ai/api-contract'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { apiClient, HaiApiClientError } from '../src/index.js'

const protectedContract = {
  read: apiContract.route({ method: 'GET', path: '/protected' })
    .output(apiContract.haiResultSchema(z.string())),
}

function deferred<T>() {
  let resolve = (_value: T) => {}
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

function tokenPair(name: string) {
  return {
    accessToken: `${name}-access`,
    refreshToken: `${name}-refresh`,
    expiresIn: 3600,
    tokenType: 'Bearer' as const,
  }
}

function expired() {
  return Response.json({
    success: false,
    error: { code: 'hai:iam:105', message: 'Expired session', httpStatus: 401 },
  }, { status: 401 })
}

function reauthenticationRequired() {
  return Response.json({
    success: false,
    error: { code: 'hai:iam:027', message: 'Reauthentication required', httpStatus: 401 },
  }, { status: 401 })
}

describe('认证凭据与请求生命周期', () => {
  it('读取安全存储时登录状态变更，调用不会离开本地', async () => {
    const client = apiClient.create(protectedContract)
    const previous = apiClient.tokenStorage.memory()
    const reading = deferred<void>()
    const release = deferred<void>()
    const storage = {
      ...previous,
      async getAccessToken() {
        const token = await previous.getAccessToken()
        reading.resolve()
        await release.promise
        return token
      },
    }
    const fetch = vi.fn<typeof globalThis.fetch>()
    let request: ReturnType<typeof client.read> | undefined
    try {
      expect(await client.init({
        baseUrl: 'https://api.test',
        auth: { storage },
        fetch,
      })).toMatchObject({ success: true })
      await client.auth.setTokens(tokenPair('initial'))
      request = client.read()
      await reading.promise
      await client.auth.setTokens(tokenPair('current'))
      release.resolve()
      expect(await request).toMatchObject({
        success: false,
        error: { code: HaiApiClientError.UNAUTHORIZED.code },
      })
      expect(await previous.getAccessToken()).toBe('current-access')
      expect(fetch).not.toHaveBeenCalled()
    }
    finally {
      release.resolve()
      await request
      await client.close()
    }
  })

  it('关闭等待凭据写入退出，宿主不会保留未完成的凭据', async () => {
    const client = apiClient.create(protectedContract)
    const previous = apiClient.tokenStorage.memory()
    const started = deferred<void>()
    const release = deferred<void>()
    const storage = {
      ...previous,
      async setAccessToken(token: string) {
        await previous.setAccessToken(token)
        started.resolve()
        await release.promise
      },
    }
    let write: Promise<void> | undefined
    let close: Promise<void> | undefined
    try {
      expect(await client.init({
        baseUrl: 'https://api.test',
        auth: { storage },
      })).toMatchObject({ success: true })
      write = client.auth.setTokens(tokenPair('pending'))
      await started.promise
      close = client.close()
      release.resolve()
      await Promise.all([write, close])
      expect(await previous.getAccessToken()).toBeNull()
      expect(await previous.getRefreshToken()).toBeNull()
    }
    finally {
      release.resolve()
      await Promise.all([write, close])
      await client.close()
    }
  })

  it.each(['clear', 'reinitialize'] as const)('%s 保留当前的凭据状态，废弃未完成的认证动作', async (transition) => {
    const client = apiClient.create({ iam: apiContract.iam })
    const actions = apiClient.createAuthActions(client)
    const storage = apiClient.tokenStorage.memory()
    const entered = deferred<void>()
    const server = deferred<Response>()
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      entered.resolve()
      return server.promise
    })
    const config = {
      baseUrl: 'https://api.test',
      auth: { storage },
      fetch,
    }
    let request: ReturnType<typeof actions.login> | undefined
    try {
      expect(await client.init(config)).toMatchObject({ success: true })
      request = actions.login({ identifier: 'example', password: 'sample-password' })
      await entered.promise
      if (transition === 'clear') {
        await client.auth.clear()
      }
      else {
        await client.close()
        expect(await client.init(config)).toMatchObject({ success: true })
        await client.auth.setTokens(tokenPair('current'))
      }
      server.resolve(Response.json({
        success: true,
        data: {
          tokens: tokenPair('superseded'),
          user: {
            id: 'example',
            username: 'example',
            accountStatus: 'active',
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        },
      }))
      expect(await request).toMatchObject({
        success: false,
        error: { code: HaiApiClientError.UNAUTHORIZED.code },
      })
      expect(await storage.getAccessToken()).toBe(transition === 'clear'
        ? null
        : 'current-access')
    }
    finally {
      server.resolve(new Response(null, { status: 503 }))
      await request
      await client.close()
    }
  })

  it('取消一个等待者时共享刷新仍服务于其它请求', async () => {
    const client = apiClient.create(protectedContract)
    const controller = new AbortController()
    const refresh = deferred<Response>()
    const refreshing = deferred<void>()
    const secondDenied = deferred<void>()
    const recoverSession = vi.fn(async () => false)
    let refreshSignal: AbortSignal | null | undefined
    let denied = 0
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init)
      if (request.url.endsWith('/auth/refresh')) {
        refreshSignal = init?.signal
        refreshing.resolve()
        return refresh.promise
      }
      if (++denied === 2)
        secondDenied.resolve()
      return expired()
    })
    let first: ReturnType<typeof client.read> | undefined
    let second: ReturnType<typeof client.read> | undefined
    try {
      expect(await client.init({
        baseUrl: 'https://api.test',
        auth: {
          storage: apiClient.tokenStorage.memory(),
          recoverSession,
        },
        fetch,
      })).toMatchObject({ success: true })
      await client.auth.setTokens(tokenPair('initial'))
      first = client.read(undefined, { signal: controller.signal })
      await refreshing.promise
      second = client.read()
      await secondDenied.promise
      controller.abort()
      expect(await first).toMatchObject({
        success: false,
        error: { code: HaiApiClientError.TIMEOUT.code },
      })
      expect(refreshSignal?.aborted).toBe(false)
      expect(recoverSession).not.toHaveBeenCalled()
      refresh.resolve(expired())
      expect(await second).toMatchObject({ success: false })
      expect(recoverSession).toHaveBeenCalledOnce()
    }
    finally {
      controller.abort()
      refresh.resolve(expired())
      await Promise.all([first, second])
      await client.close()
    }
  })

  it.each(['恢复会话', '重新验证'] as const)('已开始的%s不会阻塞取消后的调用', async (interaction) => {
    const client = apiClient.create(protectedContract)
    const controller = new AbortController()
    const recovering = deferred<void>()
    const recovery = deferred<boolean>()
    const recover = async () => {
      recovering.resolve()
      return recovery.promise
    }
    const fetch = vi.fn<typeof globalThis.fetch>(async () => interaction === '恢复会话'
      ? expired()
      : reauthenticationRequired())
    let request: ReturnType<typeof client.read> | undefined
    try {
      expect(await client.init({
        baseUrl: 'https://api.test',
        auth: {
          storage: apiClient.tokenStorage.memory(),
          recoverSession: recover,
        },
        fetch,
      })).toMatchObject({ success: true })
      request = client.read(undefined, {
        signal: controller.signal,
        context: interaction === '重新验证'
          ? {
              reauthorize: async () => await recover()
                ? 'confirmed'
                : null,
            }
          : {},
      })
      await recovering.promise
      controller.abort()
      expect(await request).toMatchObject({
        success: false,
        error: { code: HaiApiClientError.TIMEOUT.code },
      })
      expect(fetch).toHaveBeenCalledOnce()
    }
    finally {
      controller.abort()
      recovery.resolve(false)
      await request
      await client.close()
    }
  })

  it('自定义认证的旧运行期即使重新验证完成也不重发请求', async () => {
    const client = apiClient.create(protectedContract)
    const entered = deferred<void>()
    const confirmation = deferred<string>()
    const fetch = vi.fn<typeof globalThis.fetch>(async () => reauthenticationRequired())
    const config = {
      baseUrl: 'https://api.test',
      fetch,
      headers: { authorization: 'Bearer sample' },
    }
    let request: ReturnType<typeof client.read> | undefined
    try {
      expect(await client.init(config)).toMatchObject({ success: true })
      request = client.read(undefined, {
        context: {
          async reauthorize() {
            entered.resolve()
            return confirmation.promise
          },
        },
      })
      await entered.promise
      await client.close()
      expect(await client.init(config)).toMatchObject({ success: true })
      confirmation.resolve('approved')
      expect(await request).toMatchObject({
        success: false,
        error: { code: 'hai:iam:027' },
      })
      expect(fetch).toHaveBeenCalledOnce()
    }
    finally {
      confirmation.resolve('approved')
      await request
      await client.close()
    }
  })
})
