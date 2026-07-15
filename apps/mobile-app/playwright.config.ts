import process from 'node:process'

import { defineConfig, devices } from '@playwright/test'

const requestedPort = Number(process.env.E2E_PORT ?? 5175)
const e2ePort = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65535 ? requestedPort : 5175
const baseURL = process.env.BASE_URL || `http://127.0.0.1:${e2ePort}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  webServer: {
    command: `pnpm build && pnpm exec vite preview --host 127.0.0.1 --port ${e2ePort} --strictPort`,
    url: baseURL,
  },
  use: {
    baseURL,
    channel: 'chrome',
  },
  projects: [
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
})
