import fs from 'node:fs'
import path from 'node:path'
import { cwd } from 'node:process'

/**
 * E2E 全局清理：只删除独立的测试数据目录
 */
export default function globalTeardown() {
  const root = cwd()
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('data-e2e-h5-')) {
      try {
        fs.rmSync(path.resolve(root, entry.name), { recursive: true, force: true })
      }
      catch {
        // Windows 上文件句柄可能暂时被占用，清理失败时允许继续执行测试
      }
    }
  }
}
