/** 仅用于首次改密与密码复用策略测试；应用启动配置不引用此文件。 */
import path from 'node:path'
import { defineConfig } from '@playwright/test'
import { testServer } from '../../../../packages/cli/tests/fixtures/scenarios/test-server.js'

export default defineConfig({
  testDir: '..',
  testMatch: '**/auth-error-security.spec.ts',
  retries: 0,
  workers: 1,
  use: { baseURL: 'http://localhost:4173', channel: 'chrome' },
  webServer: testServer('e2e/configs/auth-security.env', {
    command: 'pnpm build && pnpm preview --mode test',
    cwd: path.resolve(import.meta.dirname, '../..'),
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 180_000,
  }),
})
