import { expect, test } from '@playwright/test'

const DEFAULT_ADMIN = {
  username: 'admin',
  password: 'admin123456',
}

test.describe('Transport disabled E2E', () => {
  test('plain auth request works without encrypted response headers', async ({ request }) => {
    const loginRes = await request.post('/api/auth/login', {
      data: { identifier: DEFAULT_ADMIN.username, password: DEFAULT_ADMIN.password },
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

    const meRes = await request.get('/api/auth/me')
    expect(meRes.ok()).toBeTruthy()

    const meBody = await meRes.json() as {
      success?: boolean
      user?: { username?: string }
      data?: { user?: { username?: string } }
    }

    expect(meBody.success).toBe(true)
    expect(meBody.user?.username ?? meBody.data?.user?.username).toBe(DEFAULT_ADMIN.username)
  })
})
