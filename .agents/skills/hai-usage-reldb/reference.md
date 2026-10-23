# hai-usage-reldb — 详细用法

从 [SKILL.md](SKILL.md) 选择主题后读取对应小节。代码片段展示 API 用法；省略的业务变量、schema、依赖与 return 上下文需由应用补齐。

> `@h-ai/reldb` 提供统一的数据库操作接口，支持 SQLite、PostgreSQL、MySQL，包含 DDL、SQL、CRUD 抽象、事务与分页。


派生 `BaseReldbCrudRepository` 的自定义 SQL 方法先检查 `await this.ensureReady()`；构造函数启动自动建表不等于仓库就绪，服务 init 必须等待候选仓库的就绪入口再发布。PostgreSQL 并发首次 `CREATE TABLE IF NOT EXISTS` 的 `23505/pg_type_typname_nsp_index` 目录冲突仅重执行相同 DDL 一次，其他错误继续失败。

## §1 配置与初始化

只做校验时从 `@h-ai/reldb/schemas` 导入同一组 Schema/类型；该入口只依赖 Zod，无数据库实例或驱动。MySQL `ssl` 只接受 `false` 或严格对象；`{}` 默认开启证书链和 DNS 身份验证，不能用 `true` 或 PostgreSQL 字符串模式。实际连接仍需服务端驱动。

### 配置

```yaml
# config/_db.yml
type: sqlite
database: ./data/app.db
# PostgreSQL/MySQL 额外字段：
# host: localhost
# port: 5432
# user: postgres
# password: ''
operationLog:
  read: false # query / get / queryPage
  write: false # DDL, execute / batch, tx.begin / tx.commit / tx.rollback
  maxLength: 1000
  level: debug # info | debug | trace
```

YAML 写可审查的默认值；`HAI_DB_TYPE`、`HAI_DB_DATABASE`、
`HAI_DB_OPERATIONLOG_LEVEL` 等约定环境变量可覆盖对应叶子项，且优先级更高。

`operationLog` 在 reldb provider-base 的 DML 操作层统一输出日志，不要在 `reldb-main.ts`、各 raw provider 或调用方重复包装。`read` 覆盖 `query/get/queryPage`，`write` 覆盖 DDL、`execute/batch` 与 `tx.begin/commit/rollback`，`maxLength` 限制安全数量摘要的字符数（0 表示省略摘要），永不记录 SQL 原文、参数值、DDL 默认值或驱动原始错误，`level` 默认 `debug`。

### 初始化与关闭

MySQL `pool` 仅支持 `{ max: 10, acquireTimeout: 10000, queueLimit: 1000 }`（也是省略时默认值）。`acquireTimeout` 为 1–2147483647 毫秒的整数，涵盖排队和建立连接；`queueLimit` 为正整数，禁止无限队列。SQL/DDL/CRUD/batch/tx 共用有限 FIFO：排队超时移除并返回 `TIMEOUT`，满额返回 `POOL_EXHAUSTED`；迟到连接只释放，不执行 SQL，原建连结算前仍占槽位。关闭取消排队，等待借用/事务和驱动有界建连结算，不中止已开始的 SQL。MySQL 的 `min` / `idleTimeout` / `mysql.timezone` 明确拒绝，不承诺最小空闲保留或回收期限；PostgreSQL 保留自己的 min/idleTimeout/允许 acquireTimeout=0 契约，min 不会预建连接。

MySQL 可仅传 `mysql://` URL，优先于 host/port/database/user/password；无 URL 时 database 必填。URL 禁止 query/fragment；pool、mysql.charset、ssl 和 operationLog 独立适用。`ssl` 仅 false 或严格对象，空对象默认校验证书链和 DNS 身份；ca/cert/key 使用 PEM 内容，cert/key 成对。当前驱动不能验证 IP 身份，验证开启的 IP 目标返回 CONFIG_ERROR；关闭验证会记录风险日志，不能把加密等同于服务端认证。环境变量使用 `HAI_DB_POOL_*` / `HAI_DB_SSL_*`，min/idleTimeout 仅适用 PostgreSQL，queueLimit/verifyIdentity 仅适用 MySQL。

```ts
// trustedCaPem 来自部署信任配置；业务变量由应用提供。
const result = await reldb.init({ type: 'mysql', host: 'db.example.com', database: 'app', pool: { max: 10, acquireTimeout: 5000, queueLimit: 100 }, ssl: { ca: trustedCaPem } })
if (!result.success) return result
```

PostgreSQL 空闲连接错误已监听，由池移除并在下一次查询替换；日志仅含固定说明与安全 code/name，不记录驱动错误原文。关闭会等待已借出事务完成，应用必须提交/回滚并释放句柄。

`reldb.config` 是脱敏快照，数据库密码、URL 凭证和 TLS 私钥 `ssl.key` 均隐藏，不能用于回放连接配置。

初始化只在健康检查成功后发布连接；失败时释放候选资源。若清理仍失败，初始化错误的 `error.ext.cleanupPending` 为 `true`。`reldb.close()` 返回 `Promise<HaiResult<void>>`，等待正在进行的初始化，并合并并发关闭。开始清理后 `isInitialized` 为 `false`，配置与业务操作不再可用；清理失败仍保留资源，后续 `close()` 或 `init()` 先重试释放，成功前不会创建替代连接。调用方必须检查关闭结果。

```ts
const closed = await reldb.close()
if (!closed.success) {
  // 处理清理故障后有限重试；再次失败应向应用报告。
  const retried = await reldb.close()
  if (!retried.success) throw new Error(retried.error.message)
}
```


```typescript
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'

await reldb.init(core.config.get('db'))
// ... 使用数据库
await reldb.close()
```

### 命名约定（与模块规范保持一致）

- 表名必须使用 `hai_<module>_<feature>`（如 `hai_iam_users`）
- 缓存 key（如该仓库逻辑涉及 cache）必须使用 `hai:<module>:<feature>`（如 `hai:iam:user:123`）
- 表名/缓存 key 常量应在使用处就近定义，不做配置项暴露

## §2 操作接口总览

| 接口 | 用途 | 入口 |
|------|------|------|
| DDL | 建表/索引/字段变更 | `reldb.ddl` |
| SQL | 原始查询/执行/分页 | `reldb.sql` |
| CRUD | 通用增删改查 | `reldb.crud.table(config)` |
| 仓库 | 业务数据仓库封装 | `extends BaseReldbCrudRepository` |
| 事务 | 事务管理 | `reldb.tx` |
| 分页 | 分页参数与结果 | `reldb.pagination` |
| JSON | JSON 路径操作 | `reldb.json` |

## §3 DDL — `reldb.ddl`

| 方法 | 签名 | 说明 |
|------|------|------|
| `createTable` | `(tableName, columns: ReldbTableDef, ifNotExists?) => HaiResult<void>` | 建表（默认 IF NOT EXISTS） |
| `dropTable` | `(tableName, ifExists?) => HaiResult<void>` | 删除表 |
| `addColumn` | `(tableName, columnName, columnDef) => HaiResult<void>` | 添加列 |
| `dropColumn` | `(tableName, columnName) => HaiResult<void>` | 删除列 |
| `renameTable` | `(oldName, newName) => HaiResult<void>` | 重命名表 |
| `createIndex` | `(tableName, indexName, indexDef) => HaiResult<void>` | 创建索引 |
| `dropIndex` | `(indexName, ifExists?) => HaiResult<void>` | 删除索引 |
| `raw` | `(sql: string) => HaiResult<void>` | 执行原始 DDL |

> 所有方法返回 `Promise<HaiResult<void>>`。

### ReldbTableDef 与 ReldbColumnDef

```typescript
const columns: ReldbTableDef = {
  id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
  name: { type: 'TEXT', notNull: true },
  email: { type: 'TEXT', unique: true },
  score: { type: 'REAL', defaultValue: 0 },
  active: { type: 'BOOLEAN' },
  metadata: { type: 'JSON' },
  created_at: { type: 'TIMESTAMP' },
}
```

### 跨数据库类型映射

| 类型 | SQLite | PostgreSQL | MySQL |
|------|--------|-----------|-------|
| TEXT | TEXT | TEXT | VARCHAR(255) |
| INTEGER | INTEGER | INTEGER/BIGSERIAL | INT/BIGINT |
| BIGINT | INTEGER（64 位） | BIGINT | BIGINT |
| REAL | REAL | DOUBLE PRECISION | DOUBLE |
| BLOB | BLOB | BYTEA | BLOB |
| BOOLEAN | INTEGER | BOOLEAN | TINYINT(1) |
| TIMESTAMP | INTEGER | TIMESTAMP | DATETIME |
| JSON | TEXT | JSONB | JSON |

Unix 毫秒使用 BIGINT，不能使用 PostgreSQL/MySQL 的普通 INTEGER。原始 SQL/CRUD 与 BaseReldbCrudRepository 的 BIGINT 值保留驱动返回类型（number/string/bigint）；需要 number 的业务仓库应在读取边界校验非负整数及 Number.isSafeInteger 后转换，拒绝精度丢失。TIMESTAMP 经 BaseReldbCrudRepository 映射为 Date。

## §4 SQL — `reldb.sql`

| 方法 | 签名 | 说明 |
|------|------|------|
| `query` | `<T>(sql, params?) => HaiResult<T[]>` | 查询多行 |
| `get` | `<T>(sql, params?) => HaiResult<T \| null>` | 查询单行 |
| `execute` | `(sql, params?) => HaiResult<ExecuteResult>` | 执行写操作 |
| `batch` | `(statements: Array<{ sql, params? }>) => HaiResult<void>` | 批量执行 |
| `queryPage` | `<T>(options) => HaiResult<PaginatedResult>` | 分页查询 |

**参数占位符统一使用 `?`**（PostgreSQL 的 `$n` 由 Provider 自动转换）：

```typescript
const result = await reldb.sql.query<User>(
  'SELECT * FROM hai_demo_users WHERE status = ? AND age > ?',
  ['active', 18],
)
```

**分页查询**：

```typescript
const page = await reldb.sql.queryPage<User>({
  sql: 'SELECT * FROM hai_demo_users WHERE status = ? ORDER BY id',
  params: ['active'],
  pagination: { page: 1, pageSize: 20 },
  overrides: { maxPageSize: 100 },
})
// page.data => { items, total, page, pageSize }
```

## §5 CRUD — `reldb.crud.table(config)`

通过配置创建单表 CRUD 仓库，免写 SQL：

`CrudConfig.dbType` 必填，必须与实际初始化的数据库后端一致（含环境变量覆盖后的类型）。以下为 SQLite 示例；切换到 PostgreSQL/MySQL 时同步修改。`BaseReldbCrudRepository` 会从已初始化的 `reldb.config.type` 获取类型，无需手动传入。

```typescript
const userCrud = reldb.crud.table<{ id: number, name: string, email: string }>({
  table: 'hai_demo_users',
  idColumn: 'id',
  select: ['id', 'name', 'email'],
  createColumns: ['name', 'email'],
  updateColumns: ['name', 'email'],
  dbType: 'sqlite', // 必填，与本例初始化后端一致
})
```

### CRUD 方法

| 方法 | 签名 | 说明 |
|------|------|------|
| `create` | `(data, tx?) => HaiResult<ExecuteResult>` | 创建 |
| `createMany` | `(items, tx?) => HaiResult<void>` | 批量创建 |
| `createOrUpdate` | `(data, tx?) => HaiResult<ExecuteResult>` | 创建或更新（upsert） |
| `findById` | `(id, tx?) => HaiResult<T \| null>` | 按 ID 查（不存在返回 null） |
| `getById` | `(id, tx?) => HaiResult<T>` | 按 ID 获取（不存在返回 RECORD_NOT_FOUND 错误） |
| `findAll` | `(options?, tx?) => HaiResult<T[]>` | 条件查询 |
| `findPage` | `(options, tx?) => HaiResult<PaginatedResult<T>>` | 分页查询 |
| `updateById` | `(id, data, tx?) => HaiResult<ExecuteResult>` | 按 ID 更新 |
| `deleteById` | `(id, tx?) => HaiResult<ExecuteResult>` | 按 ID 删除 |
| `count` | `(options?, tx?) => HaiResult<number>` | 计数 |
| `exists` | `(options?, tx?) => HaiResult<boolean>` | 条件存在 |
| `existsById` | `(id, tx?) => HaiResult<boolean>` | ID 存在 |

> 所有方法支持可选 `tx` 事务参数。

### 使用示例

```typescript
// 创建
await userCrud.create({ name: '张三', email: 'test@example.com' })

// 创建或更新
await userCrud.createOrUpdate({ id: 1, name: '张三', email: 'new@example.com' })
// 不存在 → 插入；主键冲突 → 更新 updateColumns 中的字段

// 条件查询
const actives = await userCrud.findAll({
  where: 'name LIKE ?',
  params: ['%张%'],
  orderBy: 'id DESC',
  limit: 10,
})

// 分页
const page = await userCrud.findPage({
  where: 'name LIKE ?',
  params: ['%张%'],
  pagination: { page: 1, pageSize: 20 },
})

// 事务中使用
await reldb.tx.wrap(async (tx) => {
  const created = await userCrud.create({ name: '用户A', email: 'a@test.com' }, tx)
  if (!created.success) throw new Error(created.error.message)
  const updated = await userCrud.updateById(1, { name: '新名字' }, tx)
  if (!updated.success) throw new Error(updated.error.message)
})
```

## §6 BaseReldbCrudRepository

业务仓库基类，提供字段映射、自动建表与类型转换：

```typescript
import { BaseReldbCrudRepository } from '@h-ai/reldb'

interface User { id: number, name: string, email: string, createdAt: Date }

class UserRepository extends BaseReldbCrudRepository<User> {
  constructor() {
    super(db, {
      table: 'hai_demo_users',
      idColumn: 'id',
      fields: [
        { fieldName: 'id', columnName: 'id', def: { type: 'INTEGER', primaryKey: true, autoIncrement: true }, select: true, create: false, update: false },
        { fieldName: 'name', columnName: 'name', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: true },
        { fieldName: 'email', columnName: 'email', def: { type: 'TEXT', notNull: true }, select: true, create: true, update: true },
        { fieldName: 'createdAt', columnName: 'created_at', def: { type: 'TIMESTAMP', notNull: true }, select: true, create: true, update: false },
      ],
    })
  }

  async findByEmail(email: string, tx?: DmlWithTxOperations) {
    return this.sql(tx).get<User>('SELECT * FROM hai_demo_users WHERE email = ?', [email])
  }
}
```

**`this.sql(tx?)`**：返回当前数据操作对象（自动适配事务）。

**自动能力**：createdAt/updatedAt 自动时间戳、BOOLEAN → 1/0、TIMESTAMP → 毫秒、JSON → 序列化。

**createOrUpdate**：`repo.createOrUpdate({ id: 1, name: '新名字' })` — 主键存在时更新（保留 createdAt），否则插入。dbType 自动获取，无需手动传入。

## §7 事务

`tx.wrap` 正常返回即提交，不识别失败 HaiResult；回调内失败须抛错，由外层回滚并返回 TRANSACTION_FAILED。需保留原错误码时用手动事务。 — `reldb.tx`

```typescript
// 方式1：wrap（自动 commit/rollback）
const result = await reldb.tx.wrap(async (tx) => {
  const inserted = await tx.execute('INSERT INTO hai_demo_users (name) VALUES (?)', ['张三'])
  if (!inserted.success) throw new Error(inserted.error.message)
  const logged = await tx.execute('INSERT INTO logs (action) VALUES (?)', ['user_created'])
  if (!logged.success) throw new Error(logged.error.message)
  return 'done'
})

// 方式2：手动管理，保留原领域错误（置于 async 函数内）
const txResult = await reldb.tx.begin()
if (!txResult.success) return txResult
const tx = txResult.data
const inserted = await tx.execute('INSERT INTO users (name) VALUES (?)', ['李四'])
if (!inserted.success) {
  const rollback = await tx.rollback()
  if (!rollback.success) return rollback
  return inserted
}
return tx.commit()
```

事务内可用：`tx.query / tx.get / tx.execute / tx.batch / tx.queryPage / tx.crud.table / tx.commit / tx.rollback`

## §8 JSON 操作 — `reldb.json`

跨数据库统一的 JSON 路径操作（路径以 `$` 开头）：

`merge` 的补丁根限于可 JSON 序列化对象：三种后端均按 RFC 7396 递归保留未变键、用 null 删除指定键、整体替换数组；PostgreSQL 使用参数化递归 CTE，在同一次 SQL 内更新当前行，不做应用先读再写。路径和值全部参数化，column 只能由开发者静态编写。路径解析只支持简单点号/方括号形式，不是完整 SQL/JSON Path 校验器；PostgreSQL set 要求父路径存在，insert 对已有对象键报错且数组按原生位置插入，不应把不同后端的原生路径行为视为完全相同。

```typescript
import { reldb, type ReldbFunctions } from '@h-ai/reldb'

// db 已初始化，users 表已有 settings/profile JSON 列。
async function updateSettings(db: ReldbFunctions, userId: string) {
  const extracted = db.json.extract('settings', '$.theme')
  const rows = await db.sql.query(`SELECT * FROM users WHERE ${extracted.sql} = ?`, [...extracted.params, '"dark"'])
  if (!rows.success) return rows

  const changed = db.json.set('settings', '$.theme', 'dark')
  const updated = await db.sql.execute(`UPDATE users SET settings = ${changed.sql} WHERE id = ?`, [...changed.params, userId])
  if (!updated.success) return updated

  const removed = db.json.remove('settings', '$.deprecated')
  const deleted = await db.sql.execute(`UPDATE users SET settings = ${removed.sql} WHERE id = ?`, [...removed.params, userId])
  if (!deleted.success) return deleted

  const patch = db.json.merge('profile', { bio: '新简介', avatar: null })
  return db.sql.execute(`UPDATE users SET profile = ${patch.sql} WHERE id = ?`, [...patch.params, userId])
}

const result = await updateSettings(reldb, 'u1')
if (!result.success) throw new Error(result.error.message)
```

> `column` 参数为列名，**禁止传入用户输入**。

## §9 分页 — `reldb.pagination`

| 方法 | 签名 | 说明 |
|------|------|------|
| `normalize` | `(options?, overrides?) => NormalizedPagination` | 规范化分页参数 |
| `build` | `<T>(items, total, pagination) => PaginatedResult<T>` | 构建分页结果 |

默认值：page=1, pageSize=20, maxPageSize=200。

## §10 错误码 — `HaiReldbError`

| 错误码 | code | 说明 |
|--------|------|------|
| `HaiReldbError.CONNECTION_FAILED` | `hai:reldb:001` | 连接失败 |
| `HaiReldbError.QUERY_FAILED` | `hai:reldb:002` | 查询失败 |
| `HaiReldbError.CONSTRAINT_VIOLATION` | `hai:reldb:003` | 约束违反 |
| `HaiReldbError.TRANSACTION_FAILED` | `hai:reldb:004` | 事务失败 |
| `HaiReldbError.MIGRATION_FAILED` | `hai:reldb:005` | 迁移失败 |
| `HaiReldbError.RECORD_NOT_FOUND` | `hai:reldb:006` | 记录不存在 |
| `HaiReldbError.DUPLICATE_ENTRY` | `hai:reldb:007` | 重复条目 |
| `HaiReldbError.DEADLOCK` | `hai:reldb:008` | 死锁 |
| `HaiReldbError.TIMEOUT` | `hai:reldb:009` | 超时 |
| `HaiReldbError.NOT_INITIALIZED` | `hai:reldb:010` | 未初始化 |
| `HaiReldbError.POOL_EXHAUSTED` | `hai:reldb:011` | 连接池耗尽 |
| `HaiReldbError.UNSUPPORTED_TYPE` | `hai:reldb:012` | 不支持的类型 |
| `HaiReldbError.CONFIG_ERROR` | `hai:reldb:013` | 配置错误 |
| `HaiReldbError.DDL_FAILED` | `hai:reldb:020` | DDL 失败 |

## §11 常见模式

### API 端点中使用

```typescript
import { kit } from '@h-ai/kit'

export const GET = kit.handler(async ({ url }) => {
  const pagination = kit.validate.query(url, PaginationQuerySchema)
  const result = await userCrud.findPage({ pagination, orderBy: 'id ASC' })
  if (!result.success) return kit.response.internalError()
  return kit.response.ok(result.data)
})
```

### 事务跨仓库

```typescript
const result = await reldb.tx.wrap(async (tx) => {
  const user = await userRepo.create(userData, tx)
  if (!user.success) throw new Error(user.error.message)
  const profile = await profileRepo.create({ userId: user.data.lastInsertRowid, ...profileData }, tx)
  if (!profile.success) throw new Error(profile.error.message)
  return user.data
})
```

### SQL 安全

- 所有 SQL 必须参数化（`?` 占位符），禁止字符串拼接/模板字面量
- `reldb.json` 的 `column` 参数禁止传入用户输入

MySQL 空 url（含空环境变量占位）按未配置处理，使用分字段；非空仍严格校验。
