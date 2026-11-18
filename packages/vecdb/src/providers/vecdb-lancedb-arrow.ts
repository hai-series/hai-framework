import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/**
 * 使用 LanceDB 安装实例解析的 Arrow peer，保留 schema 与表的类型身份。
 * @example 模块内部上下文
 * ```ts
 * const { Table, tableToIPC } = loadLancedbArrow()
 * const empty = tableToIPC(new Table())
 * ```
 */
export function loadLancedbArrow(): typeof import('apache-arrow') {
  const requirePeer = createRequire(require.resolve('@lancedb/lancedb'))
  return requirePeer('apache-arrow') as typeof import('apache-arrow')
}
