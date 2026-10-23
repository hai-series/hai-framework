import path from 'node:path'
import process from 'node:process'

import { defineConfig, devices } from '@playwright/test'
import { createE2eServerEnv, createE2eTransportRing } from '../../scripts/e2e-env.js'

const requestedPort = Number(process.env.E2E_PORT ?? 5175)
const e2ePort = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65535 ? requestedPort : 5175
const baseURL = process.env.BASE_URL || `http://127.0.0.1:${e2ePort}`
const servicePort = 12581
const desktopPort = 12582
const dataDir = path.join(process.env.HAI_E2E_DATA_ROOT || '.', `data-e2e-iam-${Date.now()}`)
const apiEnv = { PUBLIC_API_BASE: `http://127.0.0.1:${servicePort}/api/v1` }

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  webServer: [{
    command: 'node ../admin-console/e2e/notification-fixture.mjs',
    url: 'http://127.0.0.1:12580',
    timeout: 30_000,
  }, {
    command: 'pnpm --filter api-service build && pnpm --filter api-service exec node dist/index.js',
    env: createE2eServerEnv({
      HAI_DB: JSON.stringify({ type: 'sqlite', database: `${dataDir}/app.db` }),
      HAI_CACHE: JSON.stringify({ type: 'memory' }),
      HAI_STORAGE: JSON.stringify({ type: 'local', root: `${dataDir}/uploads` }),
      HAI_VECDB: JSON.stringify({ type: 'lancedb', path: `${dataDir}/vecdb` }),
      HAI_CRYPTO_TRANSPORT_SERVERKEYRING: createE2eTransportRing(),
      HAI_SERV_SERVER_PORT: String(servicePort),
      HAI_CORE_ENV: 'test',
      HAI_CORE_LOGGING_LEVEL: 'warn',
      HAI_DB_DATABASE: `${dataDir}/app.db`,
      HAI_VECDB_PATH: `${dataDir}/vecdb`,
      HAI_STORAGE_ROOT: `${dataDir}/uploads`,
      HAI_IAM_LOGIN_OTP: 'true',
      HAI_IAM_REGISTER_ENABLED: 'true',
      HAI_REACH_PROVIDERS: JSON.stringify([{ name: 'email', type: 'api', url: 'http://127.0.0.1:12580/send' }, { name: 'sms', type: 'api', url: 'http://127.0.0.1:12580/send' }]),
      HAI_IAM_AGREEMENTS: JSON.stringify({ showOnRegister: true, showOnLogin: false, userAgreementMarkdown: '# 移动与桌面配置协议\n\n**注册须知**\n\n- 请妥善保管账户凭据。', userAgreementUrl: 'http://127.0.0.1:12580/terms', privacyPolicyUrl: 'http://127.0.0.1:12580/privacy' }),
    }),
    url: `http://127.0.0.1:${servicePort}/health`,
    timeout: 180_000,
  }, {
    command: `pnpm build && pnpm exec vite preview --host 127.0.0.1 --port ${e2ePort} --strictPort`,
    env: createE2eServerEnv(apiEnv),
    url: baseURL,
    timeout: 180_000,
  }, {
    command: `pnpm --filter desktop-app build && pnpm --filter desktop-app exec vite preview --host 127.0.0.1 --port ${desktopPort} --strictPort`,
    env: createE2eServerEnv(apiEnv),
    url: `http://127.0.0.1:${desktopPort}`,
    timeout: 180_000,
  }],
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
