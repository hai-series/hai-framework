import process from 'node:process'
import { defineConfig } from '@playwright/test'

const DEFAULT_BASE_URL = 'http://localhost:4173'
const baseURL = process.env.BASE_URL || DEFAULT_BASE_URL
const previewHost = resolveHostFromBaseUrl(baseURL, 'localhost')
const previewPort = resolvePortFromBaseUrl(baseURL, '4173')

function resolveHostFromBaseUrl(urlString: string, fallbackHost: string): string {
  try {
    const url = new URL(urlString)
    return url.hostname || fallbackHost
  }
  catch {
    return fallbackHost
  }
}

function resolvePortFromBaseUrl(urlString: string, fallbackPort: string): string {
  try {
    const url = new URL(urlString)
    if (url.port) {
      return url.port
    }

    return url.protocol === 'https:' ? '443' : '80'
  }
  catch {
    return fallbackPort
  }
}

/**
 * Playwright E2E 测试配置
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 2,
  reporter: 'list',
  timeout: 30_000,

  use: {
    baseURL,
    channel: 'chrome',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  webServer: {
    command: `pnpm build && pnpm preview --host ${previewHost} --port ${previewPort} --strictPort`,
    env: { HAI_E2E: '1', BASE_URL: baseURL },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
