/** 项目工具配置的定位；运行时 YAML 配置仍由各服务目录管理。 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { cliM } from '../cli-i18n.js'

/**
 * 从服务目录向上查找最近的 hai.json；不存在时返回当前目录中的预期位置。
 * @param directory - 项目根或服务 workspace 目录。
 * @returns 工具配置文件的绝对路径。
 * @example 模块内部上下文
 * ```ts
 * const configPath = projectConfigPath('/workspace/shop/packages/shop-serv')
 * // 找到项目根 hai.json 后，CLI 仍在 shop-serv 扫描运行时配置。
 * ```
 */
export function projectConfigPath(directory: string): string {
  const start = resolve(directory)
  let current = start
  while (!existsSync(join(current, 'hai.json')) && dirname(current) !== current)
    current = dirname(current)
  return join(existsSync(join(current, 'hai.json')) ? current : start, 'hai.json')
}

/**
 * 严格读取项目工具配置，解析失败只报告路径，不输出可能包含凭据的 JSON 片段。
 * @param path - hai.json 文件的绝对路径。
 * @returns 项目根配置对象；各分区继续由消费者按实际 Schema 校验。
 * @throws Error - 文件不可读、JSON 无效或根节点不是对象。
 * @example 模块内部上下文
 * ```ts
 * const project = readProjectConfig(projectConfigPath('/workspace/shop'))
 * const deployment = project.deploy // 部署分区仍需校验并解析环境变量。
 * ```
 */
export function readProjectConfig(path: string): Record<string, unknown> {
  try {
    const config: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (config && typeof config === 'object' && !Array.isArray(config))
      return config as Record<string, unknown>
  }
  catch { /* 统一返回脱敏诊断，不能输出配置片段。 */ }
  throw new Error(cliM('cli_project_config_invalid', { params: { path } }))
}
