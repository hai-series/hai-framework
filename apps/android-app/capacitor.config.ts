import type { CapacitorConfig } from '@capacitor/cli'
import process from 'node:process'

const config: CapacitorConfig = {
  appId: 'com.hai.android.app',
  appName: 'hai Android App',
  webDir: 'build',
  server: {
    // 开发时连接本地 API（Android 模拟器用 10.0.2.2 访问宿主机）
    url: process.env.NODE_ENV === 'development'
      ? 'http://10.0.2.2:3000'
      : undefined,
    cleartext: process.env.NODE_ENV === 'development',
  },
}

export default config
