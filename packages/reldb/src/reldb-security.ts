/**
 * @h-ai/reldb — 安全工具
 *
 * 提供 SQL 标识符校验与字符串值转义功能，防止注入风险。
 * @module reldb-security
 */

import type { HaiResult } from '@h-ai/core'
import type { } from './reldb-types.js'
import { err, ok } from '@h-ai/core'
import { reldbM } from './reldb-i18n.js'
import { HaiReldbError } from './reldb-types.js'

// ─── 标识符校验 ───

/**
 * 合法 SQL 标识符正则
 *
 * 仅允许字母、数字、下划线，且必须以字母或下划线开头。
 * 本层限制 128 字符；具体数据库可能有更短上限，仍需遵守其标识符规则。
 */
const VALID_IDENTIFIER_RE = /^[a-z_]\w{0,127}$/i

/**
 * 校验 SQL 标识符合法性
 *
 * 防止因动态拼接表名/列名/索引名而产生 SQL 注入风险。
 * 仅允许 `[a-zA-Z_][a-zA-Z0-9_]*`，最长 128 字符。
 *
 * @param name - 待校验的标识符
 * @returns 校验通过时返回 ok(name)；不合法时返回错误 HaiResult
 * @example
 * ```ts
 * import { validateIdentifier } from '@h-ai/reldb'
 *
 * const checked = validateIdentifier('users')
 * if (!checked.success) throw new Error(checked.error.message)
 * void checked.data
 * ```
 */
export function validateIdentifier(name: string): HaiResult<string> {
  if (VALID_IDENTIFIER_RE.test(name)) {
    return ok(name)
  }
  return err(HaiReldbError.CONFIG_ERROR, reldbM('reldb_invalidIdentifier', { params: { name } }))
}

/**
 * 批量校验多个 SQL 标识符
 *
 * 逐个校验，遇到第一个不合法的立即返回错误。
 *
 * @param names - 待校验的标识符数组
 * @returns 全部合法时返回 ok(undefined)；否则返回第一个不合法项的错误
 * @example
 * ```ts
 * import { validateIdentifiers } from '@h-ai/reldb'
 *
 * const checked = validateIdentifiers(['users', 'id'])
 * if (!checked.success) throw new Error(checked.error.message)
 * ```
 */
export function validateIdentifiers(names: string[]): HaiResult<void> {
  for (const name of names) {
    const result = validateIdentifier(name)
    if (!result.success) {
      return err(result.error)
    }
  }
  return ok(undefined)
}

// ─── 字符串值转义 ───

/**
 * 用双引号包裹 SQL 标识符（适用于 PostgreSQL / SQLite / 标准 SQL）
 *
 * 标识符内的双引号会被转义为两个双引号。
 * 使用场景：DDL 中的表名、列名、索引名。
 * 调用前应先通过 `validateIdentifier` 校验合法性。
 *
 * @param name - 已校验的标识符
 * @returns 双引号包裹的安全标识符
 * @example
 * ```ts
 * import { quoteIdentifier, validateIdentifier } from '@h-ai/reldb'
 *
 * const checked = validateIdentifier('order')
 * if (!checked.success) throw new Error(checked.error.message)
 * void quoteIdentifier(checked.data)
 * ```
 */
export function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

/**
 * 转义 SQL 字符串字面量中的单引号
 *
 * 将 `'` 转义为 `''`，用于 DDL 中 DEFAULT 值等需要直接拼接的场景。
 * 注意：仅用于标识符/DDL 场景，数据操作应始终使用参数化查询。
 *
 * @param value - 原始字符串
 * @returns 转义后的安全字符串
 * @example
 * ```ts
 * import { escapeSqlString } from '@h-ai/reldb'
 *
 * void escapeSqlString("it's") // it''s；仅用于可信 DDL 字面量，业务值使用占位符。
 * ```
 */
export function escapeSqlString(value: string): string {
  return value.replace(/'/g, '\'\'')
}
