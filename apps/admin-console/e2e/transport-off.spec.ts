import { expect, test } from '@playwright/test'
import { transportAdmin } from './helpers'

test.describe('Transport disabled E2E', () => {
  test('plain auth request works without encrypted response headers', async ({ request }) => {
    const loginRes = await request.post('/api/auth/login', {
      data: { identifier: transportAdmin.username, password: transportAdmin.password },
    })
    const rawBody = await loginRes.text()

    expect(loginRes.ok(), `status=${loginRes.status()} body=${rawBody}`).toBeTruthy()
    expect(loginRes.headers()['x-encrypted']).toBeUndefined()

    const body = JSON.parse(rawBody) as {
      success?: boolean
      user?: { username?: string }
      data?: {
        accessToken?: string
        user?: { username?: string }
      }
    }

    expect(body.success).toBe(true)

    const meRes = await request.get('/api/auth/profile')
    expect(meRes.ok()).toBeTruthy()

    const meBody = await meRes.json() as {
      success?: boolean
      data?: { user?: { username?: string } }
    }

    expect(meBody.success).toBe(true)
    expect(meBody.data?.user?.username).toBe(transportAdmin.username)
  })
})
