import fs from 'node:fs'
import path from 'node:path'
import { cwd } from 'node:process'

/**
 * E2E 全局初始化：清理历史 SQLite 数据文件
 */
export default function globalSetup() {
  const dataDir = path.resolve(cwd(), 'data')

  if (fs.existsSync(dataDir)) {
    try {
      fs.rmSync(dataDir, { recursive: true, force: true })
      // eslint-disable-next-line no-console -- E2E setup 允许输出初始化日志
      console.log(`[E2E Setup] Cleaned data directory: ${dataDir}`)
    }
    catch {
      // eslint-disable-next-line no-console -- E2E setup 允许输出初始化日志
      console.log(`[E2E Setup] Failed to clean data directory: ${dataDir}`)
    }
  }
}
