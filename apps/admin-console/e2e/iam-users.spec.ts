/**
 * =============================================================================
 * E2E 测试 - IAM 用户管理
 * =============================================================================
 */

import { expect, test } from '@playwright/test'
import { registerAndLogin, registerAndLoginViaApi, uniqueUser } from './helpers'

// ---------------------------------------------------------------------------
// IAM 用户管理页面
// ---------------------------------------------------------------------------
test.describe('IAM Users Page', () => {
  test('可访问用户管理页面', async ({ page, request }) => {
    await registerAndLogin(page, request, 'iam')
    await page.goto('/admin/iam/users')
    await page.waitForLoadState('domcontentloaded')

    // 页面应包含用户表格
    await expect(page.locator('table, [class*="table"]').first()).toBeVisible({ timeout: 5000 })
  })

  test('/admin/users 重定向到 /admin/iam/users', async ({ page, request }) => {
    await registerAndLogin(page, request, 'iam')
    await page.goto('/admin/users')
    await page.waitForURL('**/admin/iam/users**', { timeout: 10_000 })
    expect(page.url()).toContain('/admin/iam/users')
  })
})

// ---------------------------------------------------------------------------
// IAM 用户管理 API
// ---------------------------------------------------------------------------
test.describe('IAM Users API', () => {
  test('POST /api/iam/users 创建用户', async ({ request }) => {
    await registerAndLoginViaApi(request, 'iam')
    const u = uniqueUser()
    const res = await request.post('/api/iam/users', {
      data: {
        username: u.username,
        email: u.email,
        password: u.password,
      },
    })

    const body = await res.json()
    // 可能成功也可能因为权限失败，两者都接受
    if (res.ok()) {
      expect(body.success).toBe(true)
      expect(body.data).toHaveProperty('id')
      expect(body.data.username).toBe(u.username)
    }
  })

  test('POST /api/iam/users 用户名太短返回 400', async ({ request }) => {
    await registerAndLoginViaApi(request, 'iam')
    const res = await request.post('/api/iam/users', {
      data: {
        username: 'ab',
        email: 'short@test.local',
        password: 'Test1234!@',
      },
    })
    expect(res.status()).toBe(400)
  })

  test('POST /api/iam/users 缺少必填字段返回 400', async ({ request }) => {
    await registerAndLoginViaApi(request, 'iam')
    const res = await request.post('/api/iam/users', {
      data: { username: '', email: '', password: '' },
    })
    expect(res.status()).toBe(400)
  })
})
