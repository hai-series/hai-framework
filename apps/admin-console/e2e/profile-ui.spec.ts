import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'
import { registerAndLogin, registerViaApi, uniqueUser, waitForHydration } from './helpers'

test.describe('Profile UI', () => {
  test('rejects duplicate username without leaking sqlite details', async ({ page, request }) => {
    const existing = uniqueUser('exists')
    const existingRegister = await registerViaApi(request, existing)
    expect(existingRegister.ok()).toBeTruthy()

    await registerAndLogin(page, request, 'profile')
    await page.goto('/admin/profile')

    const response = await request.put('/api/auth/profile', {
      data: { username: existing.username },
    })
    expect([400, 409]).toContain(response.status())

    const body = await response.json()
    expect(String(body.error ?? '')).not.toContain('UNIQUE constraint failed')
  })

  test('通过 UI 表单修改显示名称并保存', async ({ page, request }) => {
    await registerAndLogin(page, request, 'profile')
    await page.goto('/admin/profile')
    await page.waitForLoadState('domcontentloaded')
    await waitForHydration(page)

    const displayName = `UIEdit_${Date.now().toString(36)}`
    const displayNameInput = page.locator('input[name="displayName"]')
    await expect(displayNameInput).toBeVisible()

    await displayNameInput.fill(displayName)

    // 点击保存按钮
    const saveBtn = page.getByRole('button', { name: /save|保存/i }).first()
    await saveBtn.click()

    // 应显示保存成功提示
    await expect(page.locator('[data-testid="profile-save-success"]')).toBeVisible({ timeout: 10_000 })
    await page.goto('/admin')
    await expect(page.locator('.user-menu-container').getByText(displayName, { exact: true })).toBeVisible()
  })

  test('通过 UI 表单修改邮箱并保存', async ({ page, request }) => {
    await registerAndLogin(page, request, 'profile')
    await page.goto('/admin/profile')
    await page.waitForLoadState('domcontentloaded')
    await waitForHydration(page)

    const newEmail = `uiedit_${Date.now()}@test.local`
    const emailInput = page.locator('input[name="email"]')
    await expect(emailInput).toBeVisible()

    await emailInput.fill(newEmail)

    const saveBtn = page.getByRole('button', { name: /save|保存/i }).first()
    await saveBtn.click()

    // 保存成功
    await expect(page.locator('[data-testid="profile-save-success"]')).toBeVisible({ timeout: 10_000 })

    // 刷新后邮箱已更新
    await page.reload()
    await expect(page.locator('[data-testid="profile-email"]')).toContainText(newEmail)
  })

  test('通过 UI 表单修改密码', async ({ page, request }) => {
    const user = await registerAndLogin(page, request, 'profile')
    await page.goto('/admin/profile')
    await page.waitForLoadState('domcontentloaded')
    await waitForHydration(page)

    const newPassword = 'NewUIPass789!'
    const passwordCard = page.locator('[data-testid="profile-password-card"]')
    await expect(passwordCard).toBeVisible()

    // 找到密码区域的 3 个密码输入框
    const pwdInputs = passwordCard.locator('input[type="password"]')
    await expect(pwdInputs.first()).toBeVisible()

    // 旧密码、新密码、确认密码
    await pwdInputs.nth(0).fill(user.password)
    await pwdInputs.nth(1).fill(newPassword)
    await pwdInputs.nth(2).fill(newPassword)

    // 点击提交按钮
    const submitBtn = passwordCard.getByRole('button', { name: /修改|提交|save|保存|change/i })
    await submitBtn.click()

    // 应显示成功提示或跳转到登录页
    const successOrRedirect = await Promise.race([
      page.locator('[data-testid="profile-password-success"]').waitFor({ timeout: 10_000 }).then(() => 'success'),
      page.waitForURL('**/auth/login**', { timeout: 10_000 }).then(() => 'redirect'),
    ])
    expect(['success', 'redirect']).toContain(successOrRedirect)
    const oldLogin = await request.post('/api/auth/login', {
      data: { identifier: user.username, password: user.password },
    })
    expect(oldLogin.status()).toBe(401)
    const newLogin = await request.post('/api/auth/login', {
      data: { identifier: user.username, password: newPassword },
    })
    expect(newLogin.ok()).toBe(true)
    expect((await newLogin.json()).success).toBe(true)
  })

  test('密码不一致时提交按钮禁用', async ({ page, request }) => {
    await registerAndLogin(page, request, 'profile')
    await page.goto('/admin/profile')
    await page.waitForLoadState('domcontentloaded')
    await waitForHydration(page)

    const passwordCard = page.locator('[data-testid="profile-password-card"]')
    const pwdInputs = passwordCard.locator('input[type="password"]')
    await expect(pwdInputs.first()).toBeVisible()

    // 旧密码正确，新密码与确认不一致
    await pwdInputs.nth(0).fill('Test1234!@')
    await pwdInputs.nth(1).fill('NewPass111!')
    await pwdInputs.nth(2).fill('DifferentPass222!')

    // 提交按钮应为禁用状态（客户端验证密码不一致）
    const submitBtn = passwordCard.getByRole('button', { name: /修改|提交|save|保存|change/i })
    await expect(submitBtn).toBeDisabled()

    // 应显示密码不一致提示
    await expect(passwordCard.getByText(/不一致/)).toBeVisible()
  })

  test('通过文件选择框上传头像并在刷新后保留', async ({ page, request }) => {
    await registerAndLogin(page, request, 'profile')
    await page.goto('/admin/profile')
    await waitForHydration(page)
    await expect(page.locator('[data-testid="profile-username"]')).toBeVisible()

    // 准备一个 1x1 透明 PNG
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5n0q8AAAAASUVORK5CYII=',
      'base64',
    )

    const summaryAvatar = page.locator('aside.card').filter({
      has: page.locator('[data-testid="profile-username"]'),
    }).locator('.avatar img')
    const formAvatar = page.locator('.user-profile .avatar img')

    await expect(summaryAvatar).toHaveCount(0)
    await expect(formAvatar).toHaveCount(0)

    // 限定资料表单，避免误选全局反馈组件的附件入口。
    const fileInput = page.locator('.user-profile input[type="file"][accept*="image"]')
    await expect(fileInput).toHaveCount(1)

    const uploadResponsePromise = page.waitForResponse(response =>
      response.url().includes('/api/auth/profile/avatar')
      && response.request().method() === 'POST',
    )
    const saveResponsePromise = page.waitForResponse(response =>
      response.url().endsWith('/api/auth/profile')
      && response.request().method() === 'PUT',
    )

    // 走真实 UI 上传链路（apiFetch + 解密 + 持久化）。
    await fileInput.setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: pngBuffer,
    })

    const uploadResponse = await uploadResponsePromise
    const saveResponse = await saveResponsePromise
    expect(uploadResponse.ok(), `avatar upload status=${uploadResponse.status()}`).toBeTruthy()
    expect(saveResponse.ok(), `profile save status=${saveResponse.status()}`).toBeTruthy()

    await expect(page.locator('[data-testid="profile-save-success"]')).toBeVisible({ timeout: 10_000 })
    await expect(summaryAvatar).toHaveCount(1)
    await expect(formAvatar).toHaveCount(1)

    const summarySrc = await summaryAvatar.first().getAttribute('src')
    const formSrc = await formAvatar.first().getAttribute('src')
    expect(summarySrc).toBeTruthy()
    expect(formSrc).toBe(summarySrc)
    expect(String(summarySrc)).toMatch(/^https?:\/\//)

    const meResponse = await page.request.get('/api/auth/me')
    const meBody = await meResponse.json()
    expect(meResponse.ok()).toBeTruthy()
    expect(meBody.success).toBeTruthy()
    const meUser = meBody.user ?? meBody.data?.user
    expect(meUser?.avatar).toBe(summarySrc)

    const avatarAssetResponse = await page.request.get(String(summarySrc))
    expect(avatarAssetResponse.ok()).toBeTruthy()
    expect(avatarAssetResponse.headers()['content-type']).toMatch(/^image\//)

    await page.reload()
    await expect(summaryAvatar).toHaveCount(1)
    await expect(formAvatar).toHaveCount(1)
    await expect(summaryAvatar.first()).toHaveAttribute('src', String(summarySrc))
    await expect(formAvatar.first()).toHaveAttribute('src', String(summarySrc))
  })
})
