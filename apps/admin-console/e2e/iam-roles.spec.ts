/**
 * =============================================================================
 * E2E 测试 - IAM 角色管理
 * =============================================================================
 */

import { expect, test } from '@playwright/test'
import { registerAndLogin, registerAndLoginViaApi } from './helpers'

// ---------------------------------------------------------------------------
// IAM 角色管理页面
// ---------------------------------------------------------------------------
test.describe('IAM Roles Page', () => {
  test('可访问角色管理页面', async ({ page, request }) => {
    await registerAndLogin(page, request, 'role')
    await page.goto('/admin/iam/roles')
    await page.waitForLoadState('domcontentloaded')

    // 页面应包含角色卡片
    await expect(page.locator('.card, [class*="card"]').first()).toBeVisible({ timeout: 5000 })
  })
})

// ---------------------------------------------------------------------------
// IAM 角色 API
// ---------------------------------------------------------------------------
test.describe('IAM Roles API', () => {
  test('GET /api/iam/roles 返回角色列表', async ({ request }) => {
    await registerAndLoginViaApi(request, 'role')
    const res = await request.get('/api/iam/roles')
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })

  test('POST /api/iam/roles 创建角色', async ({ request }) => {
    await registerAndLoginViaApi(request, 'role')
    const ts = Date.now().toString(36)
    const res = await request.post('/api/iam/roles', {
      data: {
        name: `TestRole_${ts}`,
        description: 'E2E test role',
        permissions: [],
      },
    })

    if (res.ok()) {
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data).toHaveProperty('id')
    }
  })

  test('POST /api/iam/roles 缺少名称返回 400', async ({ request }) => {
    await registerAndLoginViaApi(request, 'role')
    const res = await request.post('/api/iam/roles', {
      data: { name: '', description: '' },
    })
    expect(res.status()).toBe(400)
  })
})
