/**
 * @h-ai/reldb — JSON 操作 SQL 构建器
 *
 * 为不同数据库后端提供统一的 JSON 路径操作 SQL 表达式构建能力。
 * 路径格式遵循 SQL/JSON Path 标准（`$.key` / `$.key.subkey` / `$[0]`）。
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
 *
 * @example
 * ```ts
 * const { sql, params } = reldb.json.set('settings', '$.theme', 'dark')
 * // 将 sql 和 params 嵌入到完整 SQL 中执行
 * await reldb.sql.execute(
 *   `UPDATE users SET settings = ${sql} WHERE id = ?`,
 *   [...params, userId],
 * )
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
 * 路径格式：遵循 SQL/JSON Path 标准，以 `$` 开头：
 * - 对象字段：`$.key`、`$.key.subkey`
 * - 数组元素：`$[0]`、`$.items[1]`
 *
 * @example
 * ```ts
 * // 提取 JSON 字段值（用于 SELECT 或 WHERE）
 * const { sql, params } = reldb.json.extract('settings', '$.theme')
 * const rows = await reldb.sql.query(
 *   `SELECT * FROM users WHERE ${sql} = ?`,
 *   [...params, '"dark"'],
 * )
 *
 * // 设置 JSON 字段的某个路径（用于 UPDATE SET）
 * const { sql, params } = reldb.json.set('settings', '$.theme', 'dark')
 * await reldb.sql.execute(
 *   `UPDATE users SET settings = ${sql} WHERE id = ?`,
 *   [...params, userId],
 * )
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
   *
   * @example
   * ```ts
   * const { sql, params } = reldb.json.extract('data', '$.status')
   * // SQLite:     sql = "json_extract(data, ?)",    params = ["$.status"]
   * // PostgreSQL: sql = "data #> ?::text[]",         params = [["status"]]
   * // MySQL:      sql = "JSON_EXTRACT(data, ?)",     params = ["$.status"]
   * ```
   */
  extract: (column: string, path: string) => JsonSqlExpr

  /**
   * JSON 路径设置表达式（创建或替换）
   *
   * 在 JSON 列的指定路径设置新值。若路径不存在则创建，若已存在则替换。
   * 返回修改后的完整 JSON 值，通常用于 `UPDATE SET col = ...`。
   *
   * @param column - 列名（开发者负责安全性，禁止传入用户输入）
   * @param path - JSON 路径
   * @param value - 要设置的值（支持任意 JSON 兼容类型）
   * @returns SQL 表达式与参数
   *
   * @example
   * ```ts
   * const { sql, params } = reldb.json.set('settings', '$.theme', 'dark')
   * await reldb.sql.execute(
   *   `UPDATE users SET settings = ${sql} WHERE id = ?`,
   *   [...params, id],
   * )
   * ```
   */
  set: (column: string, path: string, value: unknown) => JsonSqlExpr

  /**
   * JSON 路径插入表达式（仅当路径不存在时）
   *
   * 仅在指定路径不存在时插入新值，已存在的路径不会被覆盖。
   * 返回修改后的完整 JSON 值。
   *
   * @param column - 列名（开发者负责安全性，禁止传入用户输入）
   * @param path - JSON 路径
   * @param value - 要插入的值
   * @returns SQL 表达式与参数
   *
   * @example
   * ```ts
   * const { sql, params } = reldb.json.insert('data', '$.newField', 'value')
   * await reldb.sql.execute(
   *   `UPDATE items SET data = ${sql} WHERE id = ?`,
   *   [...params, id],
   * )
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
   *
   * @example
   * ```ts
   * const { sql, params } = reldb.json.remove('settings', '$.deprecated')
   * await reldb.sql.execute(
   *   `UPDATE users SET settings = ${sql} WHERE id = ?`,
   *   [...params, id],
   * )
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
   *
   * @example
   * ```ts
   * const { sql, params } = reldb.json.merge('profile', { bio: 'new bio', avatar: null })
   * await reldb.sql.execute(
   *   `UPDATE users SET profile = ${sql} WHERE id = ?`,
   *   [...params, id],
   * )
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
 *
 * @example
 * ```ts
 * parseJsonPath('$.user.name')  // ['user', 'name']
 * parseJsonPath('$.items[0]')   // ['items', '0']
 * parseJsonPath('$[1]')         // ['1']
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
 * 使用 MySQL 内置 JSON 函数（需 MySQL 5.7.8+ 或 MariaDB 10.2+）。
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
 *
 * @example
 * ```ts
 * // 通过 reldb.json 直接使用（推荐）
 * const { sql, params } = reldb.json.extract('data', '$.key')
 *
 * // 手动创建（用于测试或特殊场景）
 * const jsonOps = createJsonOps('sqlite')
 * const { sql, params } = jsonOps.set('data', '$.key', 'value')
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
