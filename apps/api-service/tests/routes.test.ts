/**
 * api-service — 关键路由 e2e 测试
 *
 * 验证以下端点路由注册正确、响应格式合规，不依赖外部服务：
 *   - /health、/ready、/openapi.json、/docs
 *   - POST /api/v1/auth/register、/login、/logout（完整认证流）
 *
 * 基础设施：SQLite 内存 + 内存缓存 + LanceDB 临时目录 + 本地临时存储。
 * 不发起真实 LLM 调用；LLM key 使用占位符（仅测试路由可达性）。
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ai } from '@h-ai/ai'
import { cache } from '@h-ai/cache'
import { iam } from '@h-ai/iam'
import { reldb } from '@h-ai/reldb'
import { storage } from '@h-ai/storage'
import { vecdb } from '@h-ai/vecdb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApiServiceApp } from '../src/app.js'

// ─── 测试全局变量 ────────────────────────────────────────────────────────────

let vecdbDir: string
let storageDir: string

// ─── 初始化 / 清理 ───────────────────────────────────────────────────────────

beforeAll(async () => {
  vecdbDir = mkdtempSync(join(tmpdir(), 'api-svc-test-vecdb-'))
  storageDir = mkdtempSync(join(tmpdir(), 'api-svc-test-storage-'))

  const dbResult = await reldb.init({ type: 'sqlite', database: ':memory:' })
  if (!dbResult.success)
    throw new Error(`reldb: ${dbResult.error.message}`)

  const cacheResult = await cache.init({ type: 'memory' })
  if (!cacheResult.success)
    throw new Error(`cache: ${cacheResult.error.message}`)

  const vecdbResult = await vecdb.init({ type: 'lancedb', path: vecdbDir })
  if (!vecdbResult.success)
    throw new Error(`vecdb: ${vecdbResult.error.message}`)

  const iamResult = await iam.init({})
  if (!iamResult.success)
    throw new Error(`iam: ${iamResult.error.message}`)

  const storageResult = await storage.init({ type: 'local', root: storageDir })
  if (!storageResult.success)
    throw new Error(`storage: ${storageResult.error.message}`)

  // AI 使用占位 key；测试不发起真实 LLM 调用
  const aiResult = await ai.init({})
  if (!aiResult.success)
    throw new Error(`ai: ${aiResult.error.message}`)
}, 30_000)

afterAll(async () => {
  await ai.close()
  await storage.close()
  await iam.close()
  await vecdb.close()
  await cache.close()
  await reldb.close()
  try {
    rmSync(vecdbDir, { recursive: true, force: true })
  }
  catch { /* 忽略清理失败 */ }
  try {
    rmSync(storageDir, { recursive: true, force: true })
  }
  catch { /* 忽略清理失败 */ }
})

// ─── 测试套件 ────────────────────────────────────────────────────────────────

describe('api-service 路由', () => {
  const app = createApiServiceApp()

  // ── 基础设施端点 ──────────────────────────────────────────────────────────

  it('gET /health 返回 200 { status: ok }', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('gET /ready 返回 200 { status: ready }', async () => {
    const res = await app.request('/ready')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ready' })
  })

  it('gET /openapi.json 返回合规 OpenAPI 3.1 JSON', async () => {
    const res = await app.request('/openapi.json')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')

    const spec = await res.json() as Record<string, unknown>
    expect(spec.openapi).toMatch(/^3\./)
    expect(spec.info).toBeDefined()
    expect(spec.paths).toBeDefined()
    // 核心路由必须出现在 spec 中
    const paths = spec.paths as Record<string, unknown>
    expect(paths['/auth/login']).toBeDefined()
    expect(paths['/auth/logout']).toBeDefined()
    expect(paths['/auth/refresh']).toBeDefined()
  })

  it('gET /docs 返回 200 HTML 文档页', async () => {
    const res = await app.request('/docs')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html.toLowerCase()).toContain('<!doctype html>')
  })

  // ── 安全响应头 ─────────────────────────────────────────────────────────────

  it('响应头包含基础安全字段', async () => {
    const res = await app.request('/health')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
  })

  // ── 认证流 ────────────────────────────────────────────────────────────────

  it('pOST /api/v1/auth/login 缺少必填字段时返回 400', async () => {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it('pOST /api/v1/auth/register 注册新用户并返回 tokens', async () => {
    const res = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'e2e_test_user',
        password: 'TestPass123',
        email: 'e2e@test.local',
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean, data?: { tokens?: { accessToken?: string } } }
    expect(body.success).toBe(true)
    expect(body.data?.tokens?.accessToken).toBeTruthy()
  })

  it('pOST /api/v1/auth/login 正确凭据返回 tokens', async () => {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'e2e_test_user', password: 'TestPass123' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean, data?: { tokens?: { accessToken?: string, refreshToken?: string } } }
    expect(body.success).toBe(true)
    expect(body.data?.tokens?.accessToken).toBeTruthy()
    expect(body.data?.tokens?.refreshToken).toBeTruthy()
  })

  it('pOST /api/v1/auth/login 错误密码返回 success:false', async () => {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'e2e_test_user', password: 'WrongPassword!' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean }
    expect(body.success).toBe(false)
  })

  it('pOST /api/v1/auth/logout 无 token 时返回 success:false（认证拦截）', async () => {
    const res = await app.request('/api/v1/auth/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean }
    expect(body.success).toBe(false)
  })

  it('pOST /api/v1/auth/logout 有效 token 返回 success:true', async () => {
    // 先登录取 token
    const loginRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'e2e_test_user', password: 'TestPass123' }),
    })
    const loginBody = await loginRes.json() as { success: boolean, data?: { tokens?: { accessToken?: string } } }
    expect(loginBody.success).toBe(true)
    const token = loginBody.data?.tokens?.accessToken ?? ''

    // 使用 token 登出
    const logoutRes = await app.request('/api/v1/auth/logout', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    })
    expect(logoutRes.status).toBe(200)
    const logoutBody = await logoutRes.json() as { success: boolean }
    expect(logoutBody.success).toBe(true)
  })

  // ── 认证守卫：受保护端点不接受无效 token ─────────────────────────────────

  it('pOST /api/v1/storage/presigned-urls/upload 无 token 时返回 success:false', async () => {
    const res = await app.request('/api/v1/storage/presigned-urls/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'uploads/test.png', contentType: 'image/png' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean }
    expect(body.success).toBe(false)
  })

  it('pOST /api/v1/storage/presigned-urls/upload 伪造 token 返回 success:false', async () => {
    const res = await app.request('/api/v1/storage/presigned-urls/upload', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer totally-fake-token-xyz',
      },
      body: JSON.stringify({ key: 'uploads/test.png', contentType: 'image/png' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean }
    expect(body.success).toBe(false)
  })

  it('pOST /api/v1/storage/presigned-urls/upload 有效 token 返回 success:true', async () => {
    // 先注册并登录取 token
    const regRes = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'storage_test_user', password: 'StorageTest123', email: 'storage@test.local' }),
    })
    const regBody = await regRes.json() as { success: boolean, data?: { tokens?: { accessToken?: string } } }
    expect(regBody.success).toBe(true)
    const token = regBody.data?.tokens?.accessToken ?? ''

    const res = await app.request('/api/v1/storage/presigned-urls/upload', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ key: 'uploads/test.png', contentType: 'image/png' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean, data?: { url?: string } }
    expect(body.success).toBe(true)
    expect(body.data?.url).toBeTruthy()
  })
})
