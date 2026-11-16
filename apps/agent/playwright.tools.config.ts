import { defineConfig } from '@playwright/test'
import base from './playwright.config.js'

export default defineConfig({
  ...base,
  testMatch: 'tools-workbench.spec.ts',
  use: {
    ...base.use,
    viewport: { width: 1440, height: 900 },
  },
  webServer: base.webServer && !Array.isArray(base.webServer)
    ? {
        ...base.webServer,
        env: { ...base.webServer.env, HAI_RUNNER_EXECUTOR: 'true' },
      }
    : base.webServer,
})
