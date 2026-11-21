/** 仅用于普通认证功能场景；测试条件在同目录 iam-flow.env，不改变开发配置。 */
import path from 'node:path'
import { defineConfig } from '@playwright/test'
import { testServer } from '../../../../packages/cli/tests/fixtures/scenarios/test-server.js'

const cwd = path.resolve(import.meta.dirname, '../..')
const baseURL = 'http://localhost:4173'
export default defineConfig({
  testDir: '..',
  testIgnore: [
    '**/debug-login.spec.ts',
    '**/transport-on.spec.ts',
    '**/auth-error-security.spec.ts',
    '**/smoke.spec.ts',
  ],
  globalTeardown: '../global-teardown.ts',
  metadata: { notificationFixture: true },
  retries: 0,
  workers: 2,
  use: {
    baseURL,
    channel: 'chrome',
    extraHTTPHeaders: { Origin: baseURL },
  },
  webServer: [
    {
      command: 'node e2e/notification-fixture.mjs --ldap',
      cwd,
      url: 'http://127.0.0.1:12580',
      timeout: 90_000,
      reuseExistingServer: false,
    },
    testServer('e2e/configs/iam-flow.env', {
      command: 'pnpm build && pnpm preview --mode test',
      cwd,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 180_000,
    }),
  ],
})
