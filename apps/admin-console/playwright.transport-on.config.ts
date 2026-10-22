import { createECDH } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'

import { defineConfig } from '@playwright/test'

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4173'
const previewUrl = new URL(baseURL)
const previewHost = previewUrl.hostname || '127.0.0.1'
const previewPort = Number.parseInt(previewUrl.port || '4173', 10)
const testDataDir = path.join(process.env.HAI_E2E_DATA_ROOT || '.', `data-e2e-transport-on-${Date.now()}`)
// 每轮测试显式创建独立 ring，通过服务端子进程环境注入，不依赖开发者的私密文件。
const transportKey = createECDH('SM2')
transportKey.generateKeys()
const transportRing = JSON.stringify({
  activeKeyId: 'e2e-v1',
  keys: { 'e2e-v1': { publicKey: transportKey.getPublicKey('hex'), privateKey: transportKey.getPrivateKey('hex').padStart(64, '0') } },
})

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/transport-on.spec.ts',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL,
    channel: 'chrome',
    extraHTTPHeaders: {
      Origin: baseURL,
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [{
    // 共用 globalTeardown 会关闭通知 fixture，传输组也需完整装配它。
    command: 'node e2e/notification-fixture.mjs',
    url: 'http://127.0.0.1:12580',
    reuseExistingServer: false,
    timeout: 90_000,
  }, {
    command: `pnpm build && pnpm exec vite preview --host ${previewHost} --port ${previewPort} --strictPort`,
    env: {
      HAI_E2E: '1',
      // 测试数据目录使用独立本地后端，不继承生产 Compose 服务地址。
      HAI_DB_TYPE: 'sqlite',
      HAI_CACHE_TYPE: 'memory',
      HAI_STORAGE_TYPE: 'local',
      HAI_CORE_ENV: 'development',
      HAI_ADMIN_DEFAULT_PASSWORD: 'admin123456',
      HAI_DB_DATABASE: `${testDataDir}/admin.db`,
      HAI_STORAGE_ROOT: `${testDataDir}/uploads`,
      HAI_CRYPTO_TRANSPORT_SERVERKEYRING: transportRing,
      NODE_ENV: 'test',
      HAI_KIT_TRANSPORT: JSON.stringify({ keyExchangePath: '/api/_hai/key-exchange', excludePaths: ['/api/storage', '/api/public', '/api/auth/profile/avatar'] }),
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  }],
})
