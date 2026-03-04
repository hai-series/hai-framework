import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts'],
  external: [
    '@h-ai/core',
    '@h-ai/api-client',
    '@capacitor/core',
    '@capacitor/preferences',
    '@capacitor/device',
    '@capacitor/camera',
    '@capacitor/push-notifications',
    '@capacitor/status-bar',
  ],
})
