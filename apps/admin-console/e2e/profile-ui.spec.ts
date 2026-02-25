import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'
import { registerAndLogin, registerViaApi, uniqueUser } from './helpers'

test.describe('Profile UI', () => {
  test('shows current username and email', async ({ page, request }) => {
    const user = await registerAndLogin(page, request, 'profile')
    await page.goto('/admin/profile')

    await expect(page.locator('[data-testid="profile-username"]')).toContainText(user.username)
    await expect(page.locator('[data-testid="profile-email"]')).toContainText(user.email)
  })

  test('updates username and email with valid values', async ({ page, request }) => {
    const user = await registerAndLogin(page, request, 'profile')
    await page.goto('/admin/profile')

    const nextUsername = `pf_${Date.now().toString().slice(-8)}`
    const nextEmail = `pf_${Date.now()}@test.local`

    await page.locator('input[name="username"]').fill(nextUsername)
    await page.locator('input[name="email"]').fill(nextEmail)

    const saveResponse = page.waitForResponse(
      resp => resp.url().includes('/api/auth/profile') && resp.request().method() === 'PUT',
    )
    await page.getByRole('button', { name: /save|保存/i }).first().click()
    const resp = await saveResponse
    expect(resp.status()).toBe(200)

    await expect(page.locator('[data-testid="profile-save-success"]')).toBeVisible()
    await expect(page.locator('[data-testid="profile-username"]')).toContainText(nextUsername)
    await expect(page.locator('[data-testid="profile-email"]')).toContainText(nextEmail)

    const relogin = await request.post('/api/auth/login', {
      data: { identifier: nextUsername, password: user.password },
    })
    const loginBody = await relogin.json()
    expect(relogin.ok()).toBeTruthy()
    expect(loginBody.success).toBeTruthy()
  })

  test('rejects invalid email update on client side', async ({ page, request }) => {
    await registerAndLogin(page, request, 'profile')
    await page.goto('/admin/profile')

    let submitRequests = 0
    page.on('request', (req) => {
      if (req.url().includes('/api/auth/profile') && req.method() === 'PUT') {
        submitRequests += 1
      }
    })

    await page.locator('input[name="email"]').fill('invalid-email')
    await page.getByRole('button', { name: /save|保存/i }).first().click()
    await page.waitForTimeout(300)

    await expect(page.locator('[data-testid="profile-save-success"]')).toHaveCount(0)
    expect(submitRequests).toBe(0)
  })

  test('rejects duplicate username without leaking sqlite details', async ({ page, request }) => {
    const existing = uniqueUser('exists')
    const existingRegister = await registerViaApi(request, existing)
    expect(existingRegister.ok()).toBeTruthy()

    await registerAndLogin(page, request, 'profile')
    await page.goto('/admin/profile')

    await page.locator('input[name="username"]').fill(existing.username)

    const saveResponse = page.waitForResponse(
      resp => resp.url().includes('/api/auth/profile') && resp.request().method() === 'PUT',
    )
    await page.getByRole('button', { name: /save|保存/i }).first().click()
    const response = await saveResponse
    expect([400, 409]).toContain(response.status())

    const body = await response.json()
    expect(String(body.error ?? '')).not.toContain('UNIQUE constraint failed')
  })

  test('uploads avatar and persists it to profile', async ({ page, request }) => {
    await registerAndLogin(page, request, 'profile')
    await page.goto('/admin/profile')

    const avatarUploadResponse = page.waitForResponse(
      resp => resp.url().includes('/api/auth/profile/avatar') && resp.request().method() === 'POST',
    )
    const profileSaveResponse = page.waitForResponse(
      resp => resp.url().includes('/api/auth/profile') && resp.request().method() === 'PUT',
    )

    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5n0q8AAAAASUVORK5CYII=',
      'base64',
    )

    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: pngBuffer,
    })

    const uploadResp = await avatarUploadResponse
    expect(uploadResp.status()).toBe(200)
    const saveResp = await profileSaveResponse
    expect(saveResp.status()).toBe(200)
    await expect(page.locator('[data-testid="profile-save-success"]')).toBeVisible()

    const meResponse = await request.get('/api/auth/me')
    const meBody = await meResponse.json()
    expect(meResponse.ok()).toBeTruthy()
    expect(meBody.success).toBeTruthy()
    expect(String(meBody.user?.avatar ?? '')).toContain('data:image/png;base64,')
  })

  test('updates display name and shows it in top user menu', async ({ page, request }) => {
    await registerAndLogin(page, request, 'profile')
    await page.goto('/admin/profile')

    const displayName = `Display ${Date.now().toString().slice(-6)}`
    await page.locator('input[name="displayName"]').fill(displayName)

    const saveResponse = page.waitForResponse(
      resp => resp.url().includes('/api/auth/profile') && resp.request().method() === 'PUT',
    )
    await page.getByRole('button', { name: /save|保存/i }).first().click()
    const response = await saveResponse
    expect(response.status()).toBe(200)

    await page.goto('/admin')
    await expect(page.getByText(displayName)).toBeVisible()
  })

  test('changes password and forces re-login', async ({ page, request }) => {
    const user = await registerAndLogin(page, request, 'profile')
    await page.goto('/admin/profile')

    const newPassword = 'NewPass789!'
    const card = page.locator('[data-testid="profile-password-card"]')
    const passwordInputs = card.locator('input[type="password"], input[type="text"]')

    await passwordInputs.nth(0).fill(user.password)
    await passwordInputs.nth(1).fill(newPassword)
    await passwordInputs.nth(2).fill(newPassword)

    const changePasswordResponse = page.waitForResponse(
      resp => resp.url().includes('/api/auth/profile/password') && resp.request().method() === 'PUT',
    )

    const submitButton = card.getByRole('button', { name: /change password|修改密码/i })
    await expect(submitButton).toBeEnabled()
    await submitButton.click()
    const response = await changePasswordResponse
    expect(response.status()).toBe(200)

    await page.waitForURL('**/auth/login**', { timeout: 15_000 })

    const oldLogin = await request.post('/api/auth/login', {
      data: { identifier: user.username, password: user.password },
    })
    const oldBody = await oldLogin.json()
    expect(oldLogin.status()).toBe(401)
    expect(oldBody.success).toBeFalsy()

    const newLogin = await request.post('/api/auth/login', {
      data: { identifier: user.username, password: newPassword },
    })
    const newBody = await newLogin.json()
    expect(newLogin.ok()).toBeTruthy()
    expect(newBody.success).toBeTruthy()
  })
})
