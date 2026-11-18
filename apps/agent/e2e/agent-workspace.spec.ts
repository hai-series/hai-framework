import type { Page } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'

async function signup(page: Page, username: string) {
  await page.goto('/')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill('Reliable-Passphrase-42')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('button', { name: 'New task' })).toBeEnabled()
}

test('sign-out can be retried when the server cannot confirm revocation', async ({ page }) => {
  await signup(page, `logout-${Date.now()}`)
  const endpoint = (url: URL) => url.searchParams.has('/logout')
  await page.route(endpoint, async (route) => {
    // 模拟 SvelteKit 的 503 action 回包，第二次提交走真实路由。
    await route.fulfill({
      status: 503,
      json: {
        type: 'failure',
        status: 503,
        data: JSON.stringify([
          { error: 1, traceId: 2 },
          'logout-unconfirmed',
          'fixture-reference',
        ]),
      },
    })
  }, { times: 1 })

  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('The server could not confirm sign-out.')
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0)
  expect((await page.request.get('/api/workspace')).status()).toBe(200)
  await page.getByRole('button', { name: 'Retry sign-out' }).click()
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  expect((await page.request.get('/api/workspace')).status()).toBe(401)
})

test('keeps settings, memory, knowledge and task history in the authenticated account', async ({ browser, page }) => {
  const a = `alice-${Date.now()}`
  await signup(page, a)
  await page.getByRole('button', { name: 'Personal' }).click()
  await page.getByLabel('Response preference').fill('Always answer with a checklist')
  await page.getByLabel('Use my memory').check()
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Settings saved')).toBeVisible()
  await page.getByRole('button', { name: 'Memory' }).click()
  await page.getByLabel('New memory').fill('Alice prefers checklists')
  await page.getByRole('button', { name: 'Add memory' }).click()
  await expect(page.getByText('Alice prefers checklists')).toBeVisible()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('New memory').fill('Alice prefers concise checklists')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Alice prefers concise checklists')).toBeVisible()
  await page.getByRole('button', { name: 'Knowledge' }).click()
  await page.getByLabel('Knowledge name').fill('Private handbook')
  await page.getByRole('button', { name: 'Create knowledge base' }).click()
  await expect(page.getByText('Private handbook', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'New task' }).click()
  await expect(page.getByLabel('Message')).toBeVisible()
  const useMemory = page.getByRole('button', { name: 'Use my memory', exact: true })
  await expect(useMemory).toHaveAttribute('aria-pressed', 'true')
  await useMemory.click()
  await page.getByLabel('Message').fill('An unfinished draft')
  await page.locator('input[type=file]:not([accept])').setInputFiles({
    name: 'first-task.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Data selected for only the first task'),
  })
  await expect(page.getByRole('button', { name: 'first-task.txt' })).toBeVisible()
  await page.getByRole('button', { name: 'New task' }).click()
  await expect(page.getByLabel('Message')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'first-task.txt' })).toHaveCount(0)
  await expect(useMemory).toHaveAttribute('aria-pressed', 'true')
  const other = await browser.newPage({ locale: 'en-US' })
  try {
    await signup(other, `bob-${Date.now()}`)
    await other.getByRole('button', { name: 'Memory' }).click()
    await expect(other.getByText('Alice prefers concise checklists')).toHaveCount(0)
    await other.getByRole('button', { name: 'Knowledge' }).click()
    await expect(other.getByText('Private handbook')).toHaveCount(0)
  }
  finally {
    await other.close()
  }
})

test('keeps uploaded files private and validates mutation origins', async ({ browser, page }) => {
  await signup(page, `files-${Date.now()}`)
  await page.getByRole('button', { name: 'Files', exact: true }).click()
  await page.locator('input[type=file]').setInputFiles({
    name: 'private-notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Private notes from the owner'),
  })
  await expect(page.getByText('private-notes.txt')).toBeVisible()
  const download = (await page.getByRole('link', { name: 'Download' }).getAttribute('href'))!
  const owned = await page.request.get(download)
  expect(owned.status()).toBe(200)
  expect(await owned.text()).toBe('Private notes from the owner')
  const rejected = await page.request.post('/api/workspace', {
    headers: { Origin: 'https://other.example.invalid' },
    data: { type: 'new' },
  })
  expect(rejected.status()).toBe(403)
  expect((await page.request.post('/api/media', {
    data: { text: 'no origin' },
  })).status()).toBe(403)

  const other = await browser.newPage({ locale: 'en-US' })
  try {
    expect((await other.request.get(new URL(download, page.url()).href)).status()).toBe(401)
    await signup(other, `other-files-${Date.now()}`)
    expect((await other.request.get(new URL(download, page.url()).href)).status()).toBe(404)
  }
  finally {
    await other.close()
  }
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  expect((await page.request.get(download)).status()).toBe(401)
})
