import { expect, test } from '@playwright/test'

test.describe('Health API', () => {
  test('GET /api/v1/health returns healthy/degraded with checks', async ({ request }) => {
    const response = await request.get('/api/v1/health')
    expect(response.ok()).toBeTruthy()

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data).toHaveProperty('status')
    expect(['healthy', 'degraded']).toContain(body.data.status)
    expect(body.data).toHaveProperty('timestamp')
    expect(body.data).toHaveProperty('version')
    expect(body.data).toHaveProperty('checks')
    expect(body.data.checks).toHaveProperty('database')
    expect(body.data.checks).toHaveProperty('cache')
  })
})
