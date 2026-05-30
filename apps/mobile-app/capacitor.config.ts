import type { CapacitorConfig } from '@capacitor/cli'
import process from 'node:process'

const config: CapacitorConfig = {
  appId: 'com.hai.mobile.app',
  appName: 'hai Mobile App',
  webDir: 'build',
  server: {
    // 仅用于 Capacitor live reload 前端页面；API 地址由 PUBLIC_API_BASE 配置。
    url: process.env.CAPACITOR_SERVER_URL,
    cleartext: process.env.CAPACITOR_SERVER_URL?.startsWith('http://') ?? false,
  },
}

export default config
