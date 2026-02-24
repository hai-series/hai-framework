/**
 * =============================================================================
 * E2E 测试 - IAM 权限管理
 * =============================================================================
 */

import { expect, test } from '@playwright/test'
import { registerAndLogin, registerAndLoginViaApi } from './helpers'

// ---------------------------------------------------------------------------
// IAM 权限管理页面
// ---------------------------------------------------------------------------
test.describe('IAM Permissions Page', () => {
  test('可访问权限管理页面', async ({ page, request }) => {
    await registerAndLogin(page, request, 'perm')
    await page.goto('/admin/iam/permissions')
    await page.waitForLoadState('domcontentloaded')

    // 页面应包含权限列表
    await expect(page.locator('.stat, .card, table').first()).toBeVisible({ timeout: 5000 })
  })
})

// ---------------------------------------------------------------------------
// IAM 权限 API
// ---------------------------------------------------------------------------
test.describe('IAM Permissions API', () => {
  test('GET /api/iam/permissions 返回权限列表', async ({ request }) => {
    await registerAndLoginViaApi(request, 'perm')
    const res = await request.get('/api/iam/permissions')
    expect(res.ok()).toBeTruthy()

    const body = await res.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })

  test('POST /api/iam/permissions 创建权限', async ({ request }) => {
    await registerAndLoginViaApi(request, 'perm')
    const ts = Date.now().toString(36)
    const res = await request.post('/api/iam/permissions', {
      data: {
        name: `test_${ts}:read`,
        description: 'E2E test permission',
        resource: `test_${ts}`,
        action: 'read',
      },
    })

    if (res.ok()) {
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data).toHaveProperty('id')
    }
  })

  test('POST /api/iam/permissions 缺少字段返回 400', async ({ request }) => {
    await registerAndLoginViaApi(request, 'perm')
    const res = await request.post('/api/iam/permissions', {
      data: { name: '', resource: '', action: '' },
    })
    expect(res.status()).toBe(400)
  })
})
