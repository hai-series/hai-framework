import { createDeploymentJsonTool } from './deploy-json.js'

/**
 * 生成独立 JSON 读取器；上传脚本仅需 POSIX awk，无 Node 或 jq 依赖。
 * @returns 可作为部署包 read-target.awk 文件内容的 POSIX awk 程序。
 * @example 模块内部上下文
 * ```ts
 * const reader: string = createTargetReader()
 * // 将 reader 写入部署包，由上传脚本读取 deploy-target.json 中的目标配置。
 * ```
 */
export function createTargetReader(): string {
  return createDeploymentJsonTool().replace('Invalid deployment JSON:', 'Invalid deploy-target.json:')
}
