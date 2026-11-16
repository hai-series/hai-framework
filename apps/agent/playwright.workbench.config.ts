import { defineConfig } from '@playwright/test'
import base from './playwright.config.js'

export default defineConfig({
  ...base,
  testMatch: 'workbench.spec.ts',
  use: {
    ...base.use,
    viewport: { width: 1440, height: 900 },
  },
})
