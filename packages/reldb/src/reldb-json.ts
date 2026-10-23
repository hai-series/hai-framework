/**
 * @h-ai/reldb — JSON 操作 SQL 构建器
 *
 * 为不同数据库后端提供统一的 JSON 路径操作 SQL 表达式构建能力。
 * 路径支持简单点号与方括号路径（`$.key` / `$.key.subkey` / `$[0]`），不是完整 SQL/JSON Path 校验器。
 *
 * 各数据库后端映射：
 *
 * | 操作     | SQLite                | PostgreSQL                    | MySQL                       |
 * |---------|----------------------|-------------------------------|-----------------------------|
 * | extract | json_extract          | #> (text[])                   | JSON_EXTRACT                |
 * | set     | json_set + json()     | jsonb_set + ::jsonb            | JSON_SET + CAST AS JSON      |
 * | insert  | json_insert + json()  | jsonb_insert + ::jsonb         | JSON_INSERT + CAST AS JSON   |
 * | remove  | json_remove           | #- (text[])                   | JSON_REMOVE                 |
 * | merge   | json_patch            | 参数化递归 CTE                 | JSON_MERGE_PATCH + CAST      |
 *
 * @module reldb-json
 */

import { reldbM } from './reldb-i18n.js'

// ─── 类型定义 ───

/**
 * JSON SQL 表达式结果
 *
 * 包含可嵌入 SQL 语句的表达式片段与对应参数列表。
 * 参数占位符统一使用 `?`，各 Provider 会在执行前自动转换。
 * @example
 * ```ts
 * import { createJsonOps, type JsonSqlExpr } from '@h-ai/reldb'
 *
 * const expression: JsonSqlExpr = createJsonOps('postgresql').set('settings', '$.theme', 'dark')
 * void [expression.sql, expression.params]
 * ```
 */
export interface JsonSqlExpr {
  /** SQL 表达式片段（含 ? 占位符） */
  sql: string
  /** 参数列表（对应 ? 占位符，顺序与 sql 中出现顺序一致） */
  params: unknown[]
}

/**
 * JSON 操作接口
 *
 * 提供跨数据库统一的 JSON 路径操作 SQL 构建能力。
 * 所有方法返回 `JsonSqlExpr`，可嵌入 `reldb.sql.query` / `reldb.sql.execute` 等调用。
 *
 * 路径使用以下简单形式，建议以 `$` 开头：
 * - 对象字段：`$.key`、`$.key.subkey`
 * - 数组元素：`$[0]`、`$.items[1]`
 * @example
 * ```ts
 * import { createJsonOps, type ReldbJsonOps } from '@h-ai/reldb'
 *
 * const json: ReldbJsonOps = createJsonOps('postgresql')
 * const patch = json.merge('settings', { theme: 'dark', obsolete: null })
 * void patch // 作为同一次 UPDATE 的 SQL 表达式执行，值在 params。
 * ```
 */
export interface ReldbJsonOps {
  /**
   * JSON 路径提取表达式
   *
   * 提取 JSON 列中指定路径的值，返回 JSON 类型的值。
   * 可用于 SELECT 列表、WHERE 条件或 ORDER BY。
   *
   * @param column - 列名（或 SQL 列表达式，开发者负责安全性，禁止传入用户输入）
   * @param path - JSON 路径（如 `$.status`、`$.user.name`、`$[0]`）
   * @returns SQL 表达式与参数
   * @example
   * ```ts
   * import { reldb } from '@h-ai/reldb'
   *
   * const expression = reldb.json.extract('settings', '$.theme')
   * void [expression.sql, expression.params]
   * ```
   */
  extract: (column: string, path: string) => JsonSqlExpr

  /**
   * JSON 路径设置表达式（创建或替换）
   *
   * 设置指定路径的值；PostgreSQL 要求父路径存在，其他后端按原生 JSON 函数处理缺失父路径。
   * 返回修改后的完整 JSON 值，通常用于 `UPDATE SET col = ...`。
   *
   * @param column - 列名（开发者负责安全性，禁止传入用户输入）
   * @param path - JSON 路径
   * @param value - 要设置的值（支持任意 JSON 兼容类型）
   * @returns SQL 表达式与参数
   * @example
   * ```ts
   * import { reldb } from '@h-ai/reldb'
   *
   * const expression = reldb.json.set('settings', '$.theme', 'dark')
   * const result = await reldb.sql.execute(`UPDATE users SET settings = ${expression.sql} WHERE id = ?`, [...expression.params, 'u1'])
   * if (!result.success) throw new Error(result.error.message)
   * ```
   */
  set: (column: string, path: string, value: unknown) => JsonSqlExpr

  /**
   * JSON 路径插入表达式（仅当路径不存在时）
   *
   * 使用后端原生插入语义：SQLite/MySQL 不覆盖已有值；PostgreSQL 对已有对象键报错，数组路径按 jsonb_insert 插入。
   * 返回修改后的完整 JSON 值。
   *
   * @param column - 列名（开发者负责安全性，禁止传入用户输入）
   * @param path - JSON 路径
   * @param value - 要插入的值
   * @returns SQL 表达式与参数
   * @example
   * ```ts
   * import { reldb } from '@h-ai/reldb'
   *
   * const expression = reldb.json.insert('settings', '$.newField', 'value')
   * const result = await reldb.sql.execute(`UPDATE users SET settings = ${expression.sql} WHERE id = ?`, [...expression.params, 'u1'])
   * if (!result.success) throw new Error(result.error.message)
   * ```
   */
  insert: (column: string, path: string, value: unknown) => JsonSqlExpr

  /**
   * JSON 路径删除表达式
   *
   * 从 JSON 列中移除指定路径对应的键或数组元素。
   * 返回删除后的完整 JSON 值。
   *
   * @param column - 列名（开发者负责安全性，禁止传入用户输入）
   * @param path - JSON 路径
   * @returns SQL 表达式与参数
   * @example
   * ```ts
   * import { reldb } from '@h-ai/reldb'
   *
   * const expression = reldb.json.remove('settings', '$.obsolete')
   * const result = await reldb.sql.execute(`UPDATE users SET settings = ${expression.sql} WHERE id = ?`, [...expression.params, 'u1'])
   * if (!result.success) throw new Error(result.error.message)
   * ```
   */
  remove: (column: string, path: string) => JsonSqlExpr

  /**
   * JSON 合并/补丁表达式（RFC 7396 Merge Patch）
   *
   * 将 patch 对象合并到 JSON 列：
   * - patch 中存在的键：覆盖原值
   * - patch 中值为 null 的键：删除原键
   * - patch 中不存在的键：保持不变
   *
   * 返回合并后的完整 JSON 值，通常用于 `UPDATE SET col = ...`。
   *
   * @param column - 列名（开发者负责安全性，禁止传入用户输入）
   * @param patch - 要合并的 JSON 对象
   * @returns SQL 表达式与参数
   * @example
   * ```ts
   * import { reldb } from '@h-ai/reldb'
   *
   * const expression = reldb.json.merge('settings', { theme: 'dark', obsolete: null })
   * const result = await reldb.sql.execute(`UPDATE users SET settings = ${expression.sql} WHERE id = ?`, [...expression.params, 'u1'])
   * if (!result.success) throw new Error(result.error.message)
   * ```
   */
  merge: (column: string, patch: Record<string, unknown>) => JsonSqlExpr
}

const JSON_PATH_OBJECT_SEGMENT_REGEX = /^([^.[]+)/

// ─── 路径解析工具 ───

/**
 * 解析 JSON Path 为路径段数组
 *
 * 将 `$.key.subkey[0]` 格式的路径解析为 `['key', 'subkey', '0']`。
 *
 * @param path - JSON 路径（以 `$` 开头）
 * @returns 路径段数组
 * @example
 * ```ts
 * import { parseJsonPath } from '@h-ai/reldb'
 *
 * void parseJsonPath('$.items[0].name') // ['items', '0', 'name']
 * ```
 */
export function parseJsonPath(path: string): string[] {
  // 移除前缀 $
  let remaining = path.startsWith('$') ? path.slice(1) : path
  const segments: string[] = []

  while (remaining.length > 0) {
    if (remaining.startsWith('[')) {
      // 数组索引：[0] 或 ['key'] 或 ["key"]
      const end = remaining.indexOf(']')
      if (end === -1)
        break
      let segment = remaining.slice(1, end)
      // 去除首尾引号
      if (
        (segment.startsWith('"') && segment.endsWith('"'))
        || (segment.startsWith('\'') && segment.endsWith('\''))
      ) {
        segment = segment.slice(1, -1)
      }
      segments.push(segment)
      remaining = remaining.slice(end + 1)
    }
    else if (remaining.startsWith('.')) {
      remaining = remaining.slice(1)
      // 若下一段是 [ 则继续循环处理数组索引
      if (remaining.startsWith('['))
        continue
      // 对象字段名（截取到下一个 . 或 [ 为止）
      const match = remaining.match(JSON_PATH_OBJECT_SEGMENT_REGEX)
      if (match) {
        segments.push(match[1])
        remaining = remaining.slice(match[1].length)
      }
    }
    else {
      break
    }
  }

  return segments
}

// ─── 各数据库 JSON 操作实现 ───

/**
 * 创建 SQLite 的 JSON 操作实现
 *
 * 使用 SQLite 内置的 JSON 函数（需 SQLite 3.38+ 或 json1 扩展）。
 * 路径格式遵循 JSON Path 标准（`$.key`）。
 */
function createSqliteJsonOps(): ReldbJsonOps {
  return {
    extract(column, path) {
      return {
        sql: `json_extract(${column}, ?)`,
        params: [path],
      }
    },

    set(column, path, value) {
      return {
        sql: `json_set(${column}, ?, json(?))`,
        params: [path, JSON.stringify(value)],
      }
    },

    insert(column, path, value) {
      return {
        sql: `json_insert(${column}, ?, json(?))`,
        params: [path, JSON.stringify(value)],
      }
    },

    remove(column, path) {
      return {
        sql: `json_remove(${column}, ?)`,
        params: [path],
      }
    },

    merge(column, patch) {
      return {
        sql: `json_patch(${column}, ?)`,
        params: [JSON.stringify(patch)],
      }
    },
  }
}

/**
 * 将对象 Merge Patch 编译为一次 PostgreSQL 表达式，逐步修改同一行版本。
 *
 * 不能先在应用读取再合并写回，否则跨节点并发更新会丢失。PostgreSQL 的 || 仅浅拼接，
 * 不删除 null，也不能保留未修改的嵌套兄弟字段；这里以参数化路径执行 RFC 7396 对象补丁。
 * 对象节点先建立或保留对象，随后应用子项；数组整体替换，null 只删除补丁所指向的键。
 * @param column - 开发者提供的静态 JSONB 列表达式，不接受外部输入。
 * @param patch - 可 JSON 序列化的对象补丁；与其他后端一致，undefined 字段被序列化忽略。
 * @returns SQL 片段及单个参数；无连接与初始化需求。
 * @throws 非 JSON 对象、循环引用或 BigInt 等无法序列化的输入。
 * @example 模块内部上下文
 * ```ts
 * const expression = buildPostgresMergePatch('profile', { settings: { theme: 'dark', obsolete: null } })
 * void expression.params // 值与路径均不拼接进 SQL。
 * ```
 */
function buildPostgresMergePatch(column: string, patch: Record<string, unknown>): JsonSqlExpr {
  const normalized: unknown = JSON.parse(JSON.stringify(patch))
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized))
    throw new TypeError(reldbM('reldb_jsonPatchObjectRequired'))

  const steps: Array<{ path: string[], value: unknown, object: boolean }> = []
  const pending: Array<{ path: string[], value: unknown }> = Object.entries(normalized).reverse().map(([key, value]) => ({ path: [key], value }))
  while (pending.length > 0) {
    const entry = pending.pop()!
    const object = entry.value !== null && typeof entry.value === 'object' && !Array.isArray(entry.value)
    steps.push({ path: entry.path, value: object ? {} : entry.value, object })
    if (object) {
      for (const [key, value] of Object.entries(entry.value as Record<string, unknown>).reverse())
        pending.push({ path: [...entry.path, key], value })
    }
  }

  return {
    sql: `(WITH RECURSIVE
      patch_steps AS (
        SELECT ordinality AS step,
          ARRAY(SELECT jsonb_array_elements_text(item->'path')) AS path,
          item->'value' AS value, (item->>'object')::boolean AS object
        FROM jsonb_array_elements(?::jsonb) WITH ORDINALITY AS input(item, ordinality)
      ),
      merged(step, document) AS (
        SELECT 0::bigint, CASE WHEN jsonb_typeof(${column}) = 'object' THEN ${column} ELSE '{}'::jsonb END
        UNION ALL
        SELECT patch_steps.step,
          CASE
            WHEN patch_steps.object THEN jsonb_set(merged.document, patch_steps.path,
              CASE WHEN jsonb_typeof(merged.document #> patch_steps.path) = 'object'
                THEN merged.document #> patch_steps.path ELSE '{}'::jsonb END, true)
            WHEN patch_steps.value = 'null'::jsonb THEN merged.document #- patch_steps.path
            ELSE jsonb_set(merged.document, patch_steps.path, patch_steps.value, true)
          END
        FROM merged JOIN patch_steps ON patch_steps.step = merged.step + 1
      )
      SELECT document FROM merged ORDER BY step DESC LIMIT 1)`,
    params: [JSON.stringify(steps)],
  }
}

/**
 * 创建 PostgreSQL 的 JSON 操作实现
 *
 * 使用 PostgreSQL JSONB 操作符和函数。
 * 路径以 `text[]` 形式传递（由 `parseJsonPath` 解析后发送）。
 */
function createPostgresJsonOps(): ReldbJsonOps {
  return {
    extract(column, path) {
      const segments = parseJsonPath(path)
      return {
        sql: `${column} #> ?::text[]`,
        params: [segments],
      }
    },

    set(column, path, value) {
      const segments = parseJsonPath(path)
      return {
        sql: `jsonb_set(${column}, ?::text[], ?::jsonb)`,
        params: [segments, JSON.stringify(value)],
      }
    },

    insert(column, path, value) {
      const segments = parseJsonPath(path)
      return {
        sql: `jsonb_insert(${column}, ?::text[], ?::jsonb)`,
        params: [segments, JSON.stringify(value)],
      }
    },

    remove(column, path) {
      const segments = parseJsonPath(path)
      return {
        sql: `${column} #- ?::text[]`,
        params: [segments],
      }
    },

    merge(column, patch) {
      return buildPostgresMergePatch(column, patch)
    },
  }
}

/**
 * 创建 MySQL 的 JSON 操作实现
 *
 * 使用 MySQL 内置 JSON 函数；本仓库使用真实 MySQL 8.4 验证，不声明 MariaDB 兼容。
 * 路径使用 JSON Path 标准格式（`$.key`）。
 */
function createMysqlJsonOps(): ReldbJsonOps {
  return {
    extract(column, path) {
      return {
        sql: `JSON_EXTRACT(${column}, ?)`,
        params: [path],
      }
    },

    set(column, path, value) {
      return {
        sql: `JSON_SET(${column}, ?, CAST(? AS JSON))`,
        params: [path, JSON.stringify(value)],
      }
    },

    insert(column, path, value) {
      return {
        sql: `JSON_INSERT(${column}, ?, CAST(? AS JSON))`,
        params: [path, JSON.stringify(value)],
      }
    },

    remove(column, path) {
      return {
        sql: `JSON_REMOVE(${column}, ?)`,
        params: [path],
      }
    },

    merge(column, patch) {
      return {
        sql: `JSON_MERGE_PATCH(${column}, CAST(? AS JSON))`,
        params: [JSON.stringify(patch)],
      }
    },
  }
}

// ─── 工厂函数 ───

/**
 * 创建指定数据库类型的 JSON 操作实例
 *
 * @param dbType - 数据库类型（来自 `reldb.config?.type`）
 * @returns JSON 操作实例
 * @example
 * ```ts
 * import { createJsonOps } from '@h-ai/reldb'
 *
 * const sqlite = createJsonOps('sqlite')
 * const expression = sqlite.extract('settings', '$.theme')
 * void expression
 * ```
 */
export function createJsonOps(dbType: 'sqlite' | 'postgresql' | 'mysql'): ReldbJsonOps {
  switch (dbType) {
    case 'sqlite':
      return createSqliteJsonOps()
    case 'postgresql':
      return createPostgresJsonOps()
    case 'mysql':
      return createMysqlJsonOps()
  }
}
