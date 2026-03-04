import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  webServer: {
    command: 'npm run preview',
    port: 5175,
  },
  use: {
    baseURL: 'http://localhost:5175',
  },
  projects: [
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
})
