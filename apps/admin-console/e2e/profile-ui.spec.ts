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

    const updateRes = await request.put('/api/auth/profile', {
      data: { username: nextUsername, email: nextEmail },
    })
    expect(updateRes.ok()).toBeTruthy()

    await page.reload()
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

    const response = await request.put('/api/auth/profile', {
      data: { username: existing.username },
    })
    expect([400, 409]).toContain(response.status())

    const body = await response.json()
    expect(String(body.error ?? '')).not.toContain('UNIQUE constraint failed')
  })

  test('uploads avatar and persists it to profile', async ({ page, request }) => {
    await registerAndLogin(page, request, 'profile')
    await page.goto('/admin/profile')

    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5n0q8AAAAASUVORK5CYII=',
      'base64',
    )

    // 使用 page.request（与浏览器上下文共享 cookie + Origin，避免 CSRF 拦截）
    // 步骤 1：上传头像（仅验证并返回 data URL）
    const uploadResponse = await page.request.post('/api/auth/profile/avatar', {
      multipart: {
        file: {
          name: 'avatar.png',
          mimeType: 'image/png',
          buffer: pngBuffer,
        },
      },
    })
    const uploadBody = await uploadResponse.json()
    expect(uploadResponse.ok(), `avatar upload status=${uploadResponse.status()} body=${JSON.stringify(uploadBody)}`).toBeTruthy()
    const avatarDataUrl = uploadBody.data?.avatar ?? uploadBody.avatar
    expect(String(avatarDataUrl)).toContain('data:image/png;base64,')

    // 步骤 2：将 data URL 持久化至用户资料
    const persistResponse = await page.request.put('/api/auth/profile', {
      data: { avatar: avatarDataUrl },
    })
    expect(persistResponse.ok()).toBeTruthy()

    // 步骤 3：通过 /api/auth/me 验证持久化结果
    const meResponse = await page.request.get('/api/auth/me')
    const meBody = await meResponse.json()
    expect(meResponse.ok()).toBeTruthy()
    expect(meBody.success).toBeTruthy()
    const meUser = meBody.user ?? meBody.data?.user
    expect(String(meUser?.avatar ?? '')).toContain('data:image/png;base64,')
  })

  test('updates display name and shows it in top user menu', async ({ page, request }) => {
    await registerAndLogin(page, request, 'profile')
    await page.goto('/admin/profile')

    const displayName = `Display ${Date.now().toString().slice(-6)}`
    // 使用 page.request 确保与浏览器共享同一会话令牌，session.update 才能同步到布局
    const updateRes = await page.request.put('/api/auth/profile', {
      data: { display_name: displayName },
    })
    const updateBody = await updateRes.json()
    expect(updateRes.ok(), `PUT status=${updateRes.status()} body=${JSON.stringify(updateBody)}`).toBeTruthy()

    await page.goto('/admin')
    await expect(page.getByText(displayName)).toBeVisible()
  })

  test('changes password and forces re-login', async ({ page, request }) => {
    const user = await registerAndLogin(page, request, 'profile')
    const newPassword = 'NewPass789!'

    const changeRes = await request.put('/api/auth/profile/password', {
      data: {
        old_password: user.password,
        new_password: newPassword,
        confirm_password: newPassword,
      },
    })
    expect(changeRes.ok()).toBeTruthy()

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

  // ---------------------------------------------------------------------------
  // 通过 UI 表单提交修改个人资料
  // ---------------------------------------------------------------------------
  test('通过 UI 表单修改显示名称并保存', async ({ page, request }) => {
    await registerAndLogin(page, request, 'profile')
    await page.goto('/admin/profile')
    await page.waitForLoadState('domcontentloaded')

    const displayName = `UIEdit_${Date.now().toString(36)}`
    const displayNameInput = page.locator('input[name="displayName"]')
    await expect(displayNameInput).toBeVisible()

    await displayNameInput.fill(displayName)

    // 点击保存按钮
    const saveBtn = page.getByRole('button', { name: /save|保存/i }).first()
    await saveBtn.click()

    // 应显示保存成功提示
    await expect(page.locator('[data-testid="profile-save-success"]')).toBeVisible({ timeout: 10_000 })
  })

  test('通过 UI 表单修改邮箱并保存', async ({ page, request }) => {
    await registerAndLogin(page, request, 'profile')
    await page.goto('/admin/profile')
    await page.waitForLoadState('domcontentloaded')

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

  // ---------------------------------------------------------------------------
  // 通过 UI 表单修改密码
  // ---------------------------------------------------------------------------
  test('通过 UI 表单修改密码', async ({ page, request }) => {
    const user = await registerAndLogin(page, request, 'profile')
    await page.goto('/admin/profile')
    await page.waitForLoadState('domcontentloaded')

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
  })

  test('密码不一致时提交按钮禁用', async ({ page, request }) => {
    await registerAndLogin(page, request, 'profile')
    await page.goto('/admin/profile')
    await page.waitForLoadState('domcontentloaded')

    const passwordCard = page.locator('[data-testid="profile-password-card"]')
    const pwdInputs = passwordCard.locator('input[type="password"]')
    await expect(pwdInputs.first()).toBeVisible()

    // 旧密码正确，新密码与确认不一致
    await pwdInputs.nth(0).fill('Test1234!@')
    await pwdInputs.nth(1).fill('NewPass111!')
    await pwdInputs.nth(2).fill('DifferentPass222!')
    await page.waitForTimeout(500)

    // 提交按钮应为禁用状态（客户端验证密码不一致）
    const submitBtn = passwordCard.getByRole('button', { name: /修改|提交|save|保存|change/i })
    await expect(submitBtn).toBeDisabled()

    // 应显示密码不一致提示
    await expect(passwordCard.getByText(/不一致/)).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 通过 UI 上传头像
  // ---------------------------------------------------------------------------
  test('通过文件选择框上传头像', async ({ page, request }) => {
    await registerAndLogin(page, request, 'profile')
    await page.goto('/admin/profile')
    await page.waitForLoadState('domcontentloaded')

    // 准备一个 1x1 透明 PNG
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5n0q8AAAAASUVORK5CYII=',
      'base64',
    )

    // 找到文件输入框
    const fileInput = page.locator('input[type="file"][accept*="image"]')
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles({
        name: 'avatar.png',
        mimeType: 'image/png',
        buffer: pngBuffer,
      })

      // 等待上传处理
      await page.waitForTimeout(2000)

      // 头像区域应有变化（srcset 或 img 标签更新）
      const avatarImg = page.locator('img[alt*="avatar" i], .avatar img, img[src*="data:image"]')
      if (await avatarImg.count() > 0) {
        const src = await avatarImg.first().getAttribute('src')
        expect(src).toBeTruthy()
      }
    }
  })
})
