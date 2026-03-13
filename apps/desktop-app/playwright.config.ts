import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  webServer: {
    command: 'pnpm build && pnpm exec vite preview --port 5176 --strictPort',
    port: 5176,
  },
  use: {
    baseURL: 'http://localhost:5176',
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
