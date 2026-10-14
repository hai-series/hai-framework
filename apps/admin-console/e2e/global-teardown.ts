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

import type { FullConfig } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { cwd } from 'node:process'

function getE2EDataDirs() {
  const root = cwd()
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('data-e2e-transport-'))
    .map(entry => path.resolve(root, entry.name))
}

export default async function globalTeardown(config: FullConfig) {
  // 在 Playwright 终止 Windows 子进程前释放 LDAP，避免占用下一轮的固定端口。
  if (config.metadata.notificationFixture === true) {
    const response = await fetch('http://127.0.0.1:12580/shutdown', { method: 'POST', signal: AbortSignal.timeout(15_000) })
    if (!response.ok)
      throw new Error('Notification fixture shutdown failed')
    await response.json()
  }
  for (const dataDir of getE2EDataDirs()) {
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
}
