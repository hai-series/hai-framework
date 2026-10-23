import process from 'node:process'
import { defineConfig } from '@playwright/test'
import { createE2eServerEnv } from '../../scripts/e2e-env.js'

const baseURL = process.env.BASE_URL || 'http://localhost:4180'
const live = process.env.HAI_E2E_LIVE === '1'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  timeout: live ? 180_000 : 30_000,

  use: {
    baseURL,
    channel: 'chrome',
    extraHTTPHeaders: { Origin: baseURL },
    permissions: ['microphone'],
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  webServer: {
    command: 'pnpm build && pnpm exec vite preview --port 4180 --strictPort',
    env: createE2eServerEnv({
      // 实际商业模型仅在调用方显式选择 live 并注入该前缀时启用。
      ...(live ? Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[0].startsWith('HAI_AI_') && entry[1] !== undefined)) : {}),
      HAI_CORE_ENV: 'test',
      HAI_CACHE: JSON.stringify({ type: 'memory' }),
      HAI_DB: JSON.stringify({ type: 'sqlite', database: `${process.env.HAI_E2E_DATA_ROOT}/ai-playground.db` }),
      HAI_VECDB: JSON.stringify({ type: 'lancedb', path: `${process.env.HAI_E2E_DATA_ROOT}/vecdb` }),
      HAI_E2E: '1',
      HAI_E2E_MOCK: live ? '0' : '1',
    }),
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
