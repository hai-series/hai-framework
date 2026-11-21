import { expect, test } from '@playwright/test'

test('real application starts with its declared test environment', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const response = await page.goto('/')
  expect(response?.ok()).toBe(true)
  await expect(page.locator('body')).not.toBeEmpty()
  expect(errors).toEqual([])
})
