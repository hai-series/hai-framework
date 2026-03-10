import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  webServer: {
    command: 'pnpm build && pnpm exec vite preview --port 5175 --strictPort',
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
