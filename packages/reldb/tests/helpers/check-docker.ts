/**
 * =============================================================================
 * Docker 可用性检测
 *
 * 在测试启动时检查 Docker daemon 是否可用。
 * 不可用时容器测试立即跳过，避免等待 300 秒超时。
 * =============================================================================
 */

import { execSync } from 'node:child_process'

let _dockerAvailable: boolean | null = null

/**
 * 检测 Docker daemon 是否可用
 *
 * 结果会被缓存，多次调用不会重复执行命令。
 */
export function isDockerAvailable(): boolean {
  if (_dockerAvailable !== null) {
    return _dockerAvailable
  }

  try {
    execSync('docker info', { stdio: 'ignore', timeout: 5000 })
    _dockerAvailable = true
  }
  catch {
    _dockerAvailable = false
  }
  return _dockerAvailable
}
