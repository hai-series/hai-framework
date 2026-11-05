import type { CapacitorConfig } from '@capacitor/cli'
import { resolve } from 'node:path'
import process from 'node:process'
import { resolveNativeName } from '../../scripts/native-name.mjs'

const config: CapacitorConfig = {
  appId: 'com.hai.mobile.app',
  appName: resolveNativeName(process.cwd(), resolve('config/_core.yml')),
  webDir: 'build',
  server: {
    // 仅用于 Capacitor live reload 前端页面；API 地址由 PUBLIC_API_BASE 配置。
    url: process.env.CAPACITOR_SERVER_URL,
    cleartext: process.env.CAPACITOR_SERVER_URL?.startsWith('http://') ?? false,
  },
}

export default config
