/**
 * =============================================================================
 * E2E 测试 - 健康检查 API
 * =============================================================================
 */

import { expect, test } from '@playwright/test'
import { registerAndLogin } from './helpers'

test.describe('Health Check API', () => {
  test('GET /api/health 未认证返回 401', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.status()).toBe(401)
  })

  test('GET /api/health 认证后返回健康状态', async ({ page, request }) => {
    await registerAndLogin(page, request, 'health')

    const response = await page.request.get('/api/health')
    expect(response.ok()).toBeTruthy()

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data.status).toBe('healthy')
    expect(body.data).toHaveProperty('timestamp')
    expect(body.data).toHaveProperty('version')
  })
})
