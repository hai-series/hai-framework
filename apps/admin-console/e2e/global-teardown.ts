/**
 * =============================================================================
 * E2E 测试 - 全局清理
 * =============================================================================
 *
 * Playwright globalTeardown 脚本。
 * 所有 E2E 测试完成后尝试删除测试数据库文件。
 * 如果文件被锁定（Windows 上 SQLite 可能未释放），静默跳过，
 * globalSetup 会在下次运行前清理。
 */

import fs from 'node:fs'
import path from 'node:path'
import { cwd } from 'node:process'

export default function globalTeardown() {
  const dataDir = path.resolve(cwd(), 'data')

  if (fs.existsSync(dataDir)) {
    try {
      fs.rmSync(dataDir, { recursive: true, force: true })
      // eslint-disable-next-line no-console -- 全局清理脚本，需要输出清理结果
      console.log(`[E2E Teardown] Removed test data directory: ${dataDir}`)
    }
    catch {
      // Windows 上数据库文件可能仍被锁定，globalSetup 会在下次运行前清理
      // eslint-disable-next-line no-console
      console.log(`[E2E Teardown] Could not remove ${dataDir} (file may be locked). Will be cleaned on next run.`)
    }
  }
}
