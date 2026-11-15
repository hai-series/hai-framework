import process from 'node:process'
import { defineConfig } from '@playwright/test'
import { createE2eServerEnv } from '../../scripts/e2e-env.js'

const port = Number(process.env.AGENT_E2E_PORT ?? 4191)
const origin = `http://127.0.0.1:${port}`
const root = process.env.HAI_E2E_DATA_ROOT ?? `./data/e2e-${process.pid}`
export default defineConfig({
  testDir: './e2e',
  testMatch: '*.spec.ts',
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: origin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-US',
    extraHTTPHeaders: { 'Accept-Language': 'en-US' },
    channel: process.env.AGENT_E2E_CHROME ? undefined : 'chrome',
    launchOptions: { executablePath: process.env.AGENT_E2E_CHROME },
  },
  webServer: process.env.AGENT_E2E_EXTERNAL === '1'
    ? undefined
    : {
        command: `pnpm build && pnpm exec vite preview --mode test --host 127.0.0.1 --port ${port} --strictPort`,
        url: origin,
        timeout: 180_000,
        reuseExistingServer: false,
        env: createE2eServerEnv({
          HAI_E2E: '1',
          HAI_CORE_DEFAULTLOCALE: 'en-US',
          HAI_IAM_REGISTER_ENABLED: 'true',
          HAI_DB_DATABASE: `${root}/agent.db`,
          HAI_STORAGE_ROOT: `${root}/storage`,
          HAI_VECDB_PATH: `${root}/vectors`,
          HAI_RUNNER_EXECUTOR: 'false',
        }),
      },
})
