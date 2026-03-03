import fs from 'node:fs'
import path from 'node:path'
import { cwd } from 'node:process'

/**
 * E2E 全局初始化：清理历史数据目录
 */
export default function globalSetup() {
  const dataDir = path.resolve(cwd(), 'data')

  if (fs.existsSync(dataDir)) {
    try {
      fs.rmSync(dataDir, { recursive: true, force: true })
    }
    catch {
      // Windows 上文件句柄可能暂时被占用，清理失败时允许继续执行测试
    }
  }
}
