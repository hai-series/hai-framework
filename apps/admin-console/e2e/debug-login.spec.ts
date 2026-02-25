/* eslint-disable no-console */
/**
 * Debug test to understand the login cookie issue
 */
import { expect, test } from '@playwright/test'
import { registerViaApi, uniqueUser } from './helpers'

test('Debug: login flow cookie inspection', async ({ page, request }) => {
  const user = uniqueUser('debug')
  await registerViaApi(request, user)

  // Step 1: Go to login page
  await page.goto('/auth/login')
  await page.waitForLoadState('domcontentloaded')

  // Step 2: Call login API from browser context
  const loginResult = await page.evaluate(async (creds: { identifier: string, password: string }) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(creds),
    })
    const body = await res.json()
    return { status: res.status, ok: res.ok, body }
  }, { identifier: user.username, password: user.password })

  console.log('Login result:', JSON.stringify(loginResult, null, 2))

  // Step 3: Check cookies in browser context
  const cookiesAfterFetch = await page.context().cookies()
  console.log('Cookies after page.evaluate fetch:', JSON.stringify(cookiesAfterFetch.map(c => ({ name: c.name, value: `${c.value.substring(0, 20)}...` })), null, 2))

  // Step 4: Try using page.request instead
  const res2 = await page.request.post('/api/auth/login', {
    data: { identifier: user.username, password: user.password },
  })
  const body2 = await res2.json()
  console.log('page.request login result:', body2.success)

  const headersArray = res2.headersArray()
  const setCookieHeaders = headersArray.filter(h => h.name.toLowerCase() === 'set-cookie')
  console.log('Set-Cookie headers from page.request:', JSON.stringify(setCookieHeaders))

  const cookiesAfterPageRequest = await page.context().cookies()
  console.log('Cookies after page.request:', JSON.stringify(cookiesAfterPageRequest.map(c => ({ name: c.name, value: `${c.value.substring(0, 20)}...` })), null, 2))

  // Step 5: Try manually adding cookie
  if (!cookiesAfterPageRequest.find(c => c.name === 'session_token')) {
    console.log('No session_token found! Extracting from Set-Cookie header...')
    for (const h of setCookieHeaders) {
      const match = h.value.match(/session_token=([^;]+)/)
      if (match) {
        console.log('Found session_token in header, adding manually...')
        await page.context().addCookies([{
          name: 'session_token',
          value: match[1],
          domain: 'localhost',
          path: '/',
          httpOnly: true,
          sameSite: 'Lax',
        }])
      }
    }
  }

  const cookiesFinal = await page.context().cookies()
  console.log('Final cookies:', JSON.stringify(cookiesFinal.map(c => ({ name: c.name, value: `${c.value.substring(0, 20)}...` })), null, 2))

  // Step 6: Try navigating to /admin
  const response = await page.goto('/admin')
  console.log('Navigation to /admin: status =', response?.status(), 'url =', page.url())

  // If we're still on the login page, the cookie didn't work
  const finalUrl = page.url()
  console.log('Final URL:', finalUrl)

  expect(loginResult.body.success).toBe(true)
})
