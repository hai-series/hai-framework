import fs from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

/**
 * E2E 全局初始化：清理 corporate-website 旧的独立测试数据目录
 */
function getE2EDataDirs() {
  const root = process.env.HAI_E2E_DATA_ROOT ?? path.join(tmpdir(), 'hai-framework-corporate-website-e2e')

  if (!fs.existsSync(root)) {
    return []
  }

  return fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('data-e2e-'))
    .map(entry => path.resolve(root, entry.name))
}

export default function globalSetup() {
  // 统一入口提供的是本轮新目录，webServer 已打开数据库；它由入口在服务退出后清理。
  const managedRoot = process.env.HAI_E2E_DATA_ROOT
  if (managedRoot && path.basename(managedRoot).startsWith('hai-browser-e2e-'))
    return
  for (const dataDir of getE2EDataDirs()) {
    if (fs.existsSync(dataDir)) {
      try {
        fs.rmSync(dataDir, { recursive: true, force: true })
        // eslint-disable-next-line no-console -- E2E setup 允许输出初始化日志
        console.log(`[E2E Setup] Cleaned previous test data directory: ${dataDir}`)
      }
      catch {
        // eslint-disable-next-line no-console -- E2E setup 允许输出初始化日志
        console.log(`[E2E Setup] Could not remove ${dataDir} (file may be locked). Tests will continue with existing data.`)
      }
    }
  }
}
