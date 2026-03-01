/**
 * =============================================================================
 * E2E 测试 - 全局初始化
 * =============================================================================
 *
 * Playwright globalSetup 脚本。
 * 在所有 E2E 测试开始前清理上次残留的测试数据库文件，
 * 确保每次测试运行都从干净状态开始。
 * 如果文件被锁定（Windows 上可能发生），静默跳过。
 */

import fs from 'node:fs'
import path from 'node:path'
import { cwd } from 'node:process'

export default function globalSetup() {
  const dataDir = path.resolve(cwd(), 'data')

  if (fs.existsSync(dataDir)) {
    try {
      fs.rmSync(dataDir, { recursive: true, force: true })
      // eslint-disable-next-line no-console -- 全局初始化脚本，需要输出清理结果
      console.log(`[E2E Setup] Cleaned previous test data directory: ${dataDir}`)
    }
    catch {
      // eslint-disable-next-line no-console
      console.log(`[E2E Setup] Could not remove ${dataDir} (file may be locked). Tests will continue with existing data.`)
    }
  }
}
