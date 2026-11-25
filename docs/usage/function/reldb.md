# @h-ai/reldb 功能说明

[English](reldb.en.md) · [日本語](reldb.ja.md)

通过 `reldb` 连接 SQLite、PostgreSQL 或 MySQL，执行 SQL、事务及增删改查。使用框架模块时，由模块初始化自己的表。应用的订单等业务表由应用定义和迁移。

[模块 README](../../../packages/reldb/README.md) · [配置清单](../configuration/reldb.md) · [数据结构](../data/reldb.md) · [数据服务接入](../development/data.md)

<a id="quick-start"></a>

## 最小接入示例

```ts
import { reldb } from '@h-ai/reldb'

// 打开本进程的临时 SQLite 数据库。成功后才能执行 SQL。
const initialized = await reldb.init({ type: 'sqlite', database: ':memory:' })
if (!initialized.success)
  throw new Error(initialized.error.message, { cause: initialized.error })

try {
  // 建表并确认成功后再写入，避免把结构错误当作业务写入异常。
  const table = await reldb.ddl.createTable('users', {
    id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
    name: { type: 'TEXT', notNull: true },
    email: { type: 'TEXT', unique: true },
  })
  if (!table.success)
    throw new Error(table.error.message, { cause: table.error })

  // 绑定姓名和邮件。成功结果的 changes 为 1。
  const inserted = await reldb.sql.execute('INSERT INTO users (name, email) VALUES (?, ?)', ['Ada', 'ada@example.com'])
  if (!inserted.success)
    throw new Error(inserted.error.message, { cause: inserted.error })

  // 按 ID 排序查询第一页。成功结果包含 Ada，total 为 1。
  const page = await reldb.sql.queryPage<{ id: number, name: string }>({
    sql: 'SELECT id, name FROM users ORDER BY id',
    pagination: { page: 1, pageSize: 20 },
  })
  if (!page.success)
    throw new Error(page.error.message, { cause: page.error })

  // 将现有表和可写列配置交给 SQLite 仓库。
  const users = reldb.crud.table<{ id: number, name: string, email: string | null }>({
    table: 'users',
    dbType: 'sqlite',
    select: ['id', 'name', 'email'],
    createColumns: ['name', 'email'],
    updateColumns: ['name', 'email'],
  })

  // 使用仓库新增 Lin。成功结果的 changes 为 1。
  const created = await users.create({ name: 'Lin', email: 'lin@example.com' })
  if (!created.success)
    throw new Error(created.error.message, { cause: created.error })

  // 按主键 1 找回 Ada。查不到时，成功结果的 data 为 null。
  const user = await users.findById(1)
  if (!user.success)
    throw new Error(user.error.message, { cause: user.error })
  user.data // { id: 1, name: 'Ada', email: 'ada@example.com' }
}
finally {
  // 关闭本例的数据库连接。关闭失败时保留原因。
  const closed = await reldb.close()
  if (!closed.success)
    throw new Error(closed.error.message, { cause: closed.error })
}
```

`reldb.config` 返回的是**脱敏后的配置快照**：数据库 `password`、URL 内嵌凭证和 TLS 客户端私钥 `ssl.key` 会自动隐藏，便于排查状态但不应用于回放原始连接信息。

<a id="api-reference"></a>

## 功能说明

下面的场景代码沿用最小接入的模块导入。SQL 和结构操作在初始化成功后、关闭前运行。分页和标识符工具可独立调用。每次调用后先检查 `HaiResult.success`，失败时返回原结果，成功后再读取 `data`。未给出函数声明的片段位于应用的异步业务函数内。各场景使用独立测试数据，不能把相邻片段当成无需清理的生产脚本。


<a id="connection"></a>

### 连接、准备结构与关闭：`reldb`

连接 SQLite、PostgreSQL 或 MySQL 后，可以用 `prepareSchema` 准备模块的表、索引或种子数据。使用 PostgreSQL 的多个实例可共享同一个结构准备键。关闭前先结束应用持有的事务。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `reldb.init(config)` | 创建并验证数据库连接 | `config`（必填） | `Promise<HaiResult<void>>` | `await reldb.init({ type: 'sqlite', database: ':memory:' })` |
| `reldb.close()` | 释放连接；先结束应用仍持有的事务 | 先结束应用仍持有的事务；无 | `Promise<HaiResult<void>>` | `await reldb.close()` |
| `reldb.prepareSchema(key, prepare)` | 运行结构准备回调；PostgreSQL 还按键加事务锁 | 必填 `key: string` 和异步 `prepare`。各实例使用同一个稳定的模块键，回调接收 `{ ddl, sql }` | `Promise<HaiResult<T>>`，成功返回回调的结果，未连接返回 `NOT_INITIALIZED` | `await reldb.prepareSchema('docs:demo:schema', ({ ddl }) => ddl.createTable('demo_prepared', { id: { type: 'TEXT', primaryKey: true, notNull: true } }))` |

#### 场景：连接与关闭

已连接时，如果新的配置未通过 Schema 校验，或环境要求使用 PostgreSQL/MySQL 而新配置选择了 SQLite，`init()` 返回配置错误，现有连接仍可用。通过检查的配置会进入替换流程。如果新连接失败，需要重新初始化。

模块在健康检查通过后才允许业务读写。如果初始化失败，会尝试释放已经打开的资源。释放也失败时，返回的 `error.ext.cleanupPending` 为 `true`。

关闭会等待正在进行的初始化，多次同时关闭只执行一次清理。关闭期间 `isInitialized` 为 `false`，配置与读写操作暂停。关闭失败时，下次调用 `close()`，或发起通过配置校验的 `init()`，会先重试释放原连接。检查 `await reldb.close()` 的结果，再停止数据库服务。

```ts
// 无参数关闭当前连接。成功释放资源，失败进入重试分支。
const closed = await reldb.close()
if (!closed.success) {
  // 处理清理故障后有限重试；再次失败应向应用报告。
  // 无参数再次清理原连接，成功无 data，再次失败向调用方抛出。
  const retried = await reldb.close()
  if (!retried.success)
    throw new Error(retried.error.message)
}
```

关闭会等待已借出的事务提交/回滚并释放句柄；应用必须结束事务才能完成关闭。SQLite 的 WAL 配置与 worker 握手也属于初始化资源链。PostgreSQL 空闲连接断开由连接池移除并在后续查询时替换，不使进程退出；日志仅记录安全错误标识，不输出驱动错误原文。

初始化成功后才能调用业务方法。应用代码在调用前准备实际的业务参数，校验输入和权限。收到 `HaiResult` 时先检查 `success`，成功时读 `data`，失败时读 `error`。成功结果为 `void` 时没有业务数据。返回 `null` 时表示没有找到值。

table/column/index 名必须来自可信代码；sql 是可信语句，params 绑定业务值；steps 是模块迁移步骤，options 控制预检和分页。

<a id="prepare-schema"></a>

#### 场景：准备模块结构并验证表可读

SQLite、PostgreSQL 和 MySQL 均可调用此方法。PostgreSQL 在同一连接的事务内持有按键取得的事务锁。同一个数据库中使用同一键的调用依次运行回调，回调失败时回滚。模型调用等外部操作请放在事务结束后。SQLite 和 MySQL 直接用各自的普通 `ddl` 和 `sql` 执行回调，由各数据库决定每次操作的提交方式；`key` 在这两个后端不参与协调。

在应用启动阶段运行下方片段。先连接[所选数据库](../configuration/reldb.md)，使用独立测试库并确保其中没有 `demo_prepared` 表。每个部署实例使用固定键 `docs:demo:schema`。回调通过传入的 `ddl` 和 `sql` 操作表，应用在回调成功后再开始服务。

```ts
// 用固定键开始结构准备，成功时返回回调查询到的 ID 列表。
const prepared = await reldb.prepareSchema('docs:demo:schema', async ({ ddl, sql }) => {
  // 确保示例表存在。成功时不含业务数据，失败时返回建表错误。
  const table = await ddl.createTable('demo_prepared', {
    id: { type: 'TEXT', primaryKey: true, notNull: true },
  }, true)
  if (!table.success)
    return table

  // 用回调提供的 sql 读取表。新建空表返回 []，查询失败会结束此次准备。
  return sql.query<{ id: string }>('SELECT id FROM demo_prepared ORDER BY id')
})
if (!prepared.success)
  return prepared
prepared.data // []

// 清理独立测试库中的示例表。成功时不含业务数据。
const removed = await reldb.ddl.dropTable('demo_prepared', true)
if (!removed.success)
  return removed
```

如果建表成功、后续读取失败，PostgreSQL 会回滚这次建表。SQLite 和 MySQL 中建好的表可能已保留；调用方应检查失败并按后端规则处理。

#### 生产数据库要求

生产仅使用 PostgreSQL/MySQL；SQLite（含磁盘文件）只用于开发/明确测试，不能作为跨主机共享状态。 NODE_ENV 或 HAI_CORE_ENV 为 production 时在初始化发布成功前校验；仅 HAI_E2E=1/HAI_E2E_MOCK=1 明确测试可豁免。 [状态、并发和恢复边界](../../../.agents/instructions/distributed-state.md).

<a id="schema"></a>

### 创建与修改表：`reldb.ddl`

结构操作只接收可信表名、列名和定义；执行前确认不会删除已有业务数据。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `reldb.ddl.createTable(tableName, columns, ifNotExists?)` | 创建业务表 | `tableName: string` 可信表名。`columns: ReldbTableDef` 列名到列定义的对象。`ifNotExists?: boolean` 默认 true，跳过已存在的表。[列与索引定义](#reldb-ddl-fields) | `void` | `await reldb.ddl.createTable('orders', { id: { type: 'TEXT', primaryKey: true } })` |
| `reldb.ddl.dropTable(tableName, ifExists?)` | 删除表及其中数据 | `tableName: string` 可信表名。`ifExists?: boolean` 默认 true，目标不存在时跳过 | `void` | `await reldb.ddl.dropTable('orders_archive', true)` |
| `reldb.ddl.addColumn(tableName, columnName, columnDef)` | 增加字段 | `tableName: string` 可信表名。`columnName: string` 可信列名。`columnDef: ReldbColumnDef` 待增加列的定义。[列与索引定义](#reldb-ddl-fields) | `void` | `await reldb.ddl.addColumn('orders', 'note', { type: 'TEXT' })` |
| `reldb.ddl.dropColumn(tableName, columnName)` | 删除字段 | `tableName: string` 可信表名。`columnName: string` 可信列名 | `void` | `await reldb.ddl.dropColumn('orders', 'note')` |
| `reldb.ddl.renameTable(oldName, newName)` | 重命名表 | `oldName: string, newName: string` 可信的原表名与新表名 | `void` | `await reldb.ddl.renameTable('orders_draft', 'orders')` |
| `reldb.ddl.createIndex(tableName, indexName, indexDef)` | 创建索引 | `tableName: string` 可信表名。`indexName: string` 可信索引名。`indexDef: ReldbIndexDef` 索引列及选项。[列与索引定义](#reldb-ddl-fields) | `void` | `await reldb.ddl.createIndex('orders', 'orders_status', { columns: ['status'] })` |
| `reldb.ddl.dropIndex(indexName, ifExists?)` | 删除索引 | `indexName: string` 可信索引名。`ifExists?: boolean` 默认 true，目标不存在时跳过 | `void` | `await reldb.ddl.dropIndex('orders_status', true)` |
| `reldb.ddl.raw(sql)` | 执行可信的结构变更语句 | `sql: string` 可信代码提供的结构 SQL | `void` | `await reldb.ddl.raw('CREATE TABLE IF NOT EXISTS app_marker (id VARCHAR(255) PRIMARY KEY)')` |
| `reldb.schemaColumns(table, sql?)` | 检查表结构 | `table: string` 可信表名。`sql?: DmlOperations` 可传已有 SQL 操作对象，默认用当前连接 | `string[]` | `await reldb.schemaColumns('orders')` |

在 MySQL 上用 `addColumn()` 添加外键列时，列和 `references` 约束在同一次结构变更中创建。只有某个索引名唯一定位一张表时，`dropIndex()` 才执行。如果多张表存在同名索引，返回 `DDL_FAILED` 并保留这些索引，`ifExists: true` 只跳过不存在的索引。迁移中需要删除指定表的索引时，可用可信静态 SQL 明确写出表名。

SQLite 新建文本主键列时显式写 `notNull: true`，以拒绝空值。旧表需[检查已有结构和记录](../data/reldb.md#schema-migration-checks)。PostgreSQL 的 `prepareSchema()` 会检查已有同名部分索引的定义。如果定义不同或无法核对，返回失败，由调用方通过迁移处理。重复准备部分索引时，数据库账号需要创建临时表的权限。

<a id="reldb-ddl-fields"></a>

**列与索引定义**

| 字段 | 类型 | 必填与默认 | 用途及生效条件 |
| --- | --- | --- | --- |
| `ReldbColumnDef.type` | `ColumnType` | 必填 | 数据库无关的列类型，如 TEXT、INTEGER、BIGINT 或 JSON。 |
| `ReldbColumnDef.primaryKey / autoIncrement` | `boolean` | `false` | 分别标记主键与自增，自增只在主键上生效。 |
| `ReldbColumnDef.notNull / unique` | `boolean` | `false` | 分别限制空值和重复值。 |
| `ReldbColumnDef.defaultValue` | `string \| number \| boolean \| null` | 可省略 | 插入时未指定该列时使用的数据库默认值。 |
| `ReldbColumnDef.references` | `{ table, column, onDelete?, onUpdate? }` | 可省略 | 外键表名和列名必填。删除或更新动作可选 CASCADE、SET NULL、RESTRICT 或 NO ACTION。 |
| `ReldbIndexDef.columns` | `string[]` | 必填 | 索引列名列表，保持列顺序。 |
| `ReldbIndexDef.unique` | `boolean` | `false` | 禁止已索引的键值组合重复。 |
| `ReldbIndexDef.where` | `string` | 可省略 | 支持部分索引的后端用可信静态 SQL 条件缩小索引范围。 |

例如列映射 `{ id: { type: "TEXT", primaryKey: true }, paid: { type: "BOOLEAN", defaultValue: false } }` 建立文本主键与付款标记。插入时省略 `paid` 会采用 `false`。

#### 场景：创建与修改表

```ts
// 以下为应用异步业务函数体片段；失败时返回原结果。
// 为例中的订单创建文本 ID 主键表，成功无 data，DDL 失败时返回原失败结果。
const createTableResult = await reldb.ddl.createTable('demo_orders', { id: { type: 'TEXT', primaryKey: true } })
if (!createTableResult.success)
  return createTableResult
// 给 demo_orders 新增 TEXT 可空列 note，成功改变表结构，失败时返回原失败结果。
const addColumnResult = await reldb.ddl.addColumn('demo_orders', 'note', { type: 'TEXT' })
if (!addColumnResult.success)
  return addColumnResult
// 查询修改后的列名，data 为 ['id', 'note']，查询失败时返回原失败结果。
const schemaColumnsResult = await reldb.schemaColumns('demo_orders')
if (!schemaColumnsResult.success)
  return schemaColumnsResult
schemaColumnsResult.data // ['id', 'note']
// 在 demo_orders.note 上创建示例索引，成功改变表结构，失败时返回原失败结果。
const createIndexResult = await reldb.ddl.createIndex('demo_orders', 'demo_orders_note', { columns: ['note'] })
if (!createIndexResult.success)
  return createIndexResult
// 按名称移除刚建的索引，true 允许不存在，成功无 data，失败时返回原失败结果。
const dropIndexResult = await reldb.ddl.dropIndex('demo_orders_note', true)
if (!dropIndexResult.success)
  return dropIndexResult
// 删除 demo_orders 的 note 列及其值，成功无 data，失败时返回原失败结果。
const dropColumnResult = await reldb.ddl.dropColumn('demo_orders', 'note')
if (!dropColumnResult.success)
  return dropColumnResult
// 将原表重命名为 demo_orders_old，成功无 data，失败时返回原失败结果。
const renameTableResult = await reldb.ddl.renameTable('demo_orders', 'demo_orders_old')
if (!renameTableResult.success)
  return renameTableResult
// 删除已改名的表，true 允许不存在，成功无 data，失败时返回原失败结果。
const dropTableResult = await reldb.ddl.dropTable('demo_orders_old', true)
if (!dropTableResult.success)
  return dropTableResult
// 执行示例常量 DDL 创建标记表，成功无 data，驱动失败时返回原失败结果。
const rawResult = await reldb.ddl.raw('CREATE TABLE IF NOT EXISTS demo_marker (id VARCHAR(255) PRIMARY KEY)')
if (!rawResult.success)
  return rawResult
// All successful DDL calls have no business data.
```

输入限定全新的 demo_ 表和索引，schemaColumns 返回真实列名数组。raw 只使用可信 SQL；DDL 的事务支持取决于数据库，别把该演示直接用于生产迁移。

#### 场景：检查模块需要的表结构

`reldb.schemaColumns(table, sql?)` 只读查询实际列名。传入当前事务的 SQL 操作句柄，可在同一事务中检查表结构。框架模块初始化时校验各自的表结构，业务表由应用管理。

<a id="sql"></a>

### 参数化查询与分页：`reldb.sql`、`reldb.pagination`

动态值用参数传入，查询结果与执行结果分别处理；分页使用稳定排序。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `reldb.sql.query(sql, params?)` | 参数化读取多行 | `sql: string` 可信代码编写的 SQL，业务值用占位符。`params?: unknown[]` 按占位符顺序绑定值，省略时不绑定参数 | `T[]` | `await reldb.sql.query('SELECT id FROM orders WHERE status = ?', ['pending'])` |
| `reldb.sql.get(sql, params?)` | 参数化读取一行 | `sql: string` 可信代码编写的 SQL，业务值用占位符。`params?: unknown[]` 按占位符顺序绑定值，省略时不绑定参数 | `T \| null` | `await reldb.sql.get('SELECT id FROM orders WHERE id = ?', ['o1'])` |
| `reldb.sql.execute(sql, params?)` | 参数化写入并读取影响行数 | `sql: string` 可信代码编写的 SQL，业务值用占位符。`params?: unknown[]` 按占位符顺序绑定值，省略时不绑定参数 | `ExecuteResult` | `await reldb.sql.execute('UPDATE orders SET status = ? WHERE id = ?', ['paid', 'o1'])` |
| `reldb.sql.batch(statements)` | 批量执行语句 | `statements` 依次执行的 SQL 项数组，每项为 sql 与可选 params | `void` | `await reldb.sql.batch([{ sql: 'DELETE FROM orders WHERE id = ?', params: ['o1'] }])` |
| `reldb.sql.queryPage(options)` | 查询分页数据与总数 | 必填 `options: PaginationQueryOptions`。见[查询字段](#reldb-sql-page-options)。 | `PaginatedResult<T>` | `await reldb.sql.queryPage({ sql: 'SELECT id FROM orders ORDER BY id', pagination: { page: 1, pageSize: 20 } })` |
| `reldb.pagination.normalize(options?, overrides?)` | 规范化页码和每页条数 | 可省略 `options: PaginationOptionsInput` 和 `overrides: PaginationOverrides`。见[分页字段](#reldb-sql-page-options)。 | `NormalizedPagination` | `reldb.pagination.normalize({ page: 1, pageSize: 20 })` |
| `reldb.pagination.build(items, total, pagination)` | 组合分页结果 | `items: T[], total: number, pagination: PaginationOptions` 当前页数据、匹配的总条数及页码/每页条数 | `PaginatedResult<T>` | `reldb.pagination.build([], 0, { page: 1, pageSize: 20 })` |

<a id="reldb-sql-page-options"></a>

**SQL 查询分页与默认值**

| 字段 | 类型 | 必填与默认 | 用途及生效条件 |
| --- | --- | --- | --- |
| `PaginationQueryOptions.sql` | `string` | 必填 | 可信查询 SQL，省略 LIMIT/OFFSET。使用含唯一列的 ORDER BY 保持稳定分页。 |
| `PaginationQueryOptions.params` | `unknown[]` | `[]` | 按占位符顺序绑定查询值。 |
| `PaginationQueryOptions.pagination` | `PaginationOptionsInput` | 可省略 | 为空时使用默认页。包含 page 与 pageSize，也可单独传给 normalize。 |
| `pagination.page / pageSize` | `number` | 默认第 1 页、每页 20 条 | 显式有效值向下取整。未传或小于 1 时返默认值。 |
| `PaginationQueryOptions.overrides` | `PaginationOverrides` | 可省略 | 可改默认页、默认页大小与上限，也可作为 normalize 的第二个参数。 |
| `overrides.defaultPage / defaultPageSize` | `number` | 默认 1 和 20 | 无效或缺少对应分页值时使用。应用选择正整数，并确保默认条数不超过上限。 |
| `overrides.maxPageSize` | `number` | `200` | 限制调用方明确传入的页大小。 |

`params` 按占位符顺序绑定业务值，省略时不绑定。分页对象使用从 1 开始的 `page` 和每页条数 `pageSize`。未传或小于 1 时，分别用 `defaultPage` 和 `defaultPageSize`。有效值向下取整，传入的 `pageSize` 受 `maxPageSize` 限制。`overrides` 适合由应用按业务场景选择默认值和上限，请使用正整数并将默认条数设在上限内。

#### 场景：参数化查询与分页

```ts
// 以下为应用异步业务函数体片段；失败时返回原结果。
// 建立有文本主键 id 的查询示例表，成功无 data，DDL 失败时返回原失败结果。
const createTableResult = await reldb.ddl.createTable('demo_sql', { id: { type: 'TEXT', primaryKey: true } })
if (!createTableResult.success)
  return createTableResult
// 将 o1 绑定到插入占位符，结果包含受影响行数，失败时返回原失败结果。
const insertedResult = await reldb.sql.execute('INSERT INTO demo_sql (id) VALUES (?)', ['o1'])
if (!insertedResult.success)
  return insertedResult
const inserted = insertedResult.data // affected-row result
// 读取刚写入的 ID 列，data 为 [{ id: 'o1' }]，查询失败时返回原失败结果。
const queryResult = await reldb.sql.query('SELECT id FROM demo_sql ORDER BY id')
if (!queryResult.success)
  return queryResult
queryResult.data // [{ id: 'o1' }]
// 用参数 o1 读取首条匹配行，返回 { id: 'o1' }，查询失败时返回原失败结果。
const getResult2 = await reldb.sql.get('SELECT id FROM demo_sql WHERE id = ?', ['o1'])
if (!getResult2.success)
  return getResult2
getResult2.data // { id: 'o1' }
// 传可信 SQL 和分页选项，返回 o1 所在一页与总条数 1，失败时返回原结果。
const pageResult = await reldb.sql.queryPage({
  sql: 'SELECT id FROM demo_sql ORDER BY id',
  pagination: { page: 1, pageSize: 20 },
})
if (!pageResult.success)
  return pageResult
const page = pageResult.data
// page.items: [{ id: 'o1' }], total: 1
// 执行批次中绑定 o1 的删除，成功后不再有该行且无 data，批次失败时返回原失败结果。
const batchResult = await reldb.sql.batch([{ sql: 'DELETE FROM demo_sql WHERE id = ?', params: ['o1'] }])
if (!batchResult.success)
  return batchResult
// 成功无业务数据。
// 删除后再按 o1 查找，成功 data 为 null，查询失败时返回原失败结果。
const getResult = await reldb.sql.get('SELECT id FROM demo_sql WHERE id = ?', ['o1'])
if (!getResult.success)
  return getResult
getResult.data // null
```

输入的 o1 是参数，不拼进 SQL。get 返回 null 是成功但没找到，query 返回数组；batch 成功没有业务数据。标识符不能用值参数占位。

<a id="pagination-utils"></a>

#### 场景：对已加载的订单独立分页

列表页收到第 2 页、每页 50 条的请求，页面策略上限为每页 2 条。示例数据是按 ID 排序的 5 条订单。两个函数无需连接数据库，可用于对缓存或内存中的数据分页。

```ts
import { reldb } from '@h-ai/reldb'

const orders = ['o1', 'o2', 'o3', 'o4', 'o5'].map(id => ({ id }))
// 规范化页码及每页条数，得到从第 3 条开始取 2 条。
const pagination = reldb.pagination.normalize({ page: 2, pageSize: 50 }, { maxPageSize: 2 })
pagination // { page: 2, pageSize: 2, offset: 2, limit: 2 }

// 显式截取当前页，再用该页记录、总数和页参数组装返回值。
const items = orders.slice(pagination.offset, pagination.offset + pagination.limit)
const result = reldb.pagination.build(items, orders.length, pagination)
result // { items: [{ id: 'o3' }, { id: 'o4' }], total: 5, page: 2, pageSize: 2 }
```

`build` 直接使用传入的记录和总数。筛选、排序和截取应在调用前完成。

<a id="sql-identifiers"></a>

### 校验与引用 SQL 标识符

应用从允许访问的表和列中选择标识符，再检查名称格式。标识符校验只检查格式，应用还需检查访问权限及后端的长度限制。业务值使用 SQL 参数绑定。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `reldb.validateIdentifier(name)` | 校验单个 SQL 标识符 | `name: string`，必须以 ASCII 字母或下划线开头，其余字符为 ASCII 字母、数字或下划线，最长 128 字符 | `HaiResult<string>`，成功返回原字符串，失败返回 `CONFIG_ERROR` | `reldb.validateIdentifier('order_total')` |
| `reldb.validateIdentifiers(names)` | 依次校验多个 SQL 标识符 | `names: string[]`，每项采用相同规则 | `HaiResult<void>`，全部通过时无 data，否则返回第一个失败 | `reldb.validateIdentifiers(['order_id', 'order_total'])` |
| `reldb.quoteIdentifier(name)` | 用双引号引用已校验的标识符 | `name: string`，适用于 PostgreSQL、SQLite 等支持双引号标识符的方言 | `string`，内部双引号加倍 | `reldb.quoteIdentifier('order_total')` |
| `reldb.escapeSqlString(value)` | 加倍 SQL 字符串字面量中的单引号 | `value: string`，用于可信 DDL 中必须拼写的字符串字面量 | `string`，只转义单引号，调用方负责外层引号 | `reldb.escapeSqlString("O'Reilly")` |

#### 场景：为订单查询检查字段名

报表允许按订单金额排序，也会引用订单号。代码从报表预定义字段中取得 `order_total` 和 `order_id`。这些工具可在未初始化数据库时调用。

```ts
import { reldb } from '@h-ai/reldb'

// 校验预定义排序列，成功时 data 为 order_total。
const column = reldb.validateIdentifier('order_total')
if (!column.success)
  throw new Error(column.error.message, { cause: column.error })

// 两个预定义列都合法，成功时不含业务数据。
const columns = reldb.validateIdentifiers(['order_id', 'order_total'])
if (!columns.success)
  throw new Error(columns.error.message, { cause: columns.error })

// 双引号引用适用于此报表使用的 PostgreSQL 或 SQLite。
const quoted = reldb.quoteIdentifier(column.data) // '"order_total"'

// 点号不符合标识符规则，失败结果的 error.code 为 hai:reldb:013。
const invalid = reldb.validateIdentifier('orders.total')
if (!invalid.success)
  invalid.error.code // 'hai:reldb:013'

// 在可信 DDL 字面量中加倍单引号。此工具不附加外层引号。
const escaped = reldb.escapeSqlString("O'Reilly") // "O''Reilly"
```

<a id="transactions"></a>

<a id="事务"></a>

### 一起提交或回滚：`reldb.tx`

多条读写要保持一致时放入同一事务；分步事务必须在所有路径提交或回滚。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `reldb.tx.begin()` | 开启手工事务 | 无参数 | `DmlWithTxOperations` | `await reldb.tx.begin()` |
| `reldb.tx.wrap(fn)` | 自动提交或回滚回调中的事务 | `fn: TxWrapCallback<T>` 异步回调接收事务句柄。正常返回后提交，抛出时回滚 | `T` | `await reldb.tx.wrap(async tx => { const found = await tx.get('SELECT 1 AS value'); if (!found.success) throw new Error(found.error.message); return found.data })` |
| `reldb.tx.wrapResult(fn)` | 根据回调的业务结果结束事务 | 返回 `Promise<HaiResult<T>>` 的回调 | 成功提交。业务失败时回滚，回滚成功后保留原业务错误 | `await reldb.tx.wrapResult(tx => tx.execute('UPDATE users SET name = ? WHERE id = ?', ['Alice', 'u1']))` |

开始 `commit()` 或 `rollback()` 后，事务立即拒绝新操作和重复结束请求，返回 `TRANSACTION_FAILED`。结束请求等待事务句柄已经接收的 SQL 操作完成，再向数据库发送提交或回滚命令。已经接收的 `tx.batch()` 会在当前事务内完成并返回成功或失败，即使调用方尚未等待它。业务代码仍要处理每次操作的结果，并等待结束请求的结果。

SQLite 的普通全局 SQL 和 DDL 按调用顺序等待连接空闲，等待中的操作最多排队 30 秒。从 `wrap()` 或 `wrapResult()` 回调中误用全局入口会立即失败，此时应改用回调给出的 `tx`。使用 `begin()` 手动管理事务时也用 `tx` 执行本次事务内的操作。SQLite 提交失败后尝试回滚，如果回滚也失败，该连接退出服务，调用方需要执行 `close()` 后再 `init()`。PostgreSQL 如果因事务已中止而把 `COMMIT` 实际执行为回滚，提交结果为 `TRANSACTION_FAILED`。

#### 场景：一起提交或回滚

下图展示自动事务的边界。回调中的每一步仍返回 HaiResult，必须逐步检查，业务失败时抛错才能阻止提交。

![tx.wrap：什么情况提交，什么情况回滚](../images/function-reldb-transaction.svg)

回调普通返回（包括误返回失败 HaiResult）都会进入提交。抛错才进入回滚；提交或回滚本身失败也要上报。事务只覆盖同一数据库连接上的操作，外部发消息、支付或文件上传不会随 SQL 回滚撤销。

下文分别演示 wrap 的返回值、抛错回滚、begin 后 commit/rollback，以及事务内分页和批量操作。业务 HaiResult 失败要先检查，不能把失败对象当回调的普通成功值提交。

#### 场景：保留业务失败并回滚

数据库已初始化，`users` 表已有用户 `u1`。只在必要写入成功后提交。回调抛错，或数据库无法打开、提交、回滚事务时，调用方收到事务错误。

```ts
// 用已知用户 ID 更新名称。成功 data.changes 是更新行数。
// SQL 返回失败时直接带出原错误，回滚此回调中所有数据库写入。
const changed = await reldb.tx.wrapResult(tx =>
  tx.execute('UPDATE users SET name = ? WHERE id = ?', ['Alice', 'u1']))
if (!changed.success) throw new Error(changed.error.message)
```

#### 场景：一起写入并自动提交

`wrap` 的回调正常返回就会提交，返回失败 HaiResult 也不例外。必须检查每一步结果，并在失败时抛出异常触发回滚；wrap 会把异常转为 TRANSACTION_FAILED。需要保留原领域错误时可以调用 `wrapResult`。各片段假定数据库已成功初始化且 users 表已经创建。

```ts
// 用回调运行两次插入，正常返回时提交并将 'ok' 放入 data，失败或抛错进入回滚。
const result = await reldb.tx.wrap(async (tx) => {
  for (const name of ['Alice', 'Bob']) {
    // 在当前事务中绑定循环中的姓名插入一行，data 含受影响行数，失败读取 error。
    const inserted = await tx.execute('INSERT INTO users (name) VALUES (?)', [name])
    if (!inserted.success)
      throw new Error(inserted.error.message, { cause: inserted.error })
  }
  return 'ok'
})
// 回调正常返回 → 自动提交；抛异常 → 自动回滚
```

#### 场景：手动提交并保留领域错误

```ts
// 放在 async 业务函数内，失败时向调用方返回 HaiResult。
// 无参数开启当前数据库事务，成功 data 是事务对象，失败返回或抛出其 error。
const txResult = await reldb.tx.begin()
if (!txResult.success)
  return txResult
const tx = txResult.data
try {
  for (const name of ['Alice', 'Bob']) {
    // 在当前事务中绑定循环中的姓名插入一行，data 含受影响行数，失败读取 error。
    const inserted = await tx.execute('INSERT INTO users (name) VALUES (?)', [name])
    if (!inserted.success) {
      // 无参数回滚当前事务，成功撤销未提交写入且无 data，回滚失败保留 error。
      const rolledBack = await tx.rollback()
      return rolledBack.success ? inserted : rolledBack
    }
  }
  // 无参数提交两次写入并结束事务，成功无 data，提交失败结果原样返回。
  return await tx.commit()
}
catch (error) {
  // 无参数回滚当前事务，成功撤销未提交写入且无 data，回滚失败保留 error。
  const rolledBack = await tx.rollback()
  if (!rolledBack.success)
    return rolledBack
  throw error // 只传播非业务异常，由应用统一的异常处理函数记录。
}
```

#### 场景：试写后主动回滚

```ts
// 独立脚本：试写后回滚，不保留用户数据。
// 无参数开启当前数据库事务，成功 data 是事务对象，失败返回或抛出其 error。
const txResult = await reldb.tx.begin()
if (!txResult.success)
  throw new Error(txResult.error.message, { cause: txResult.error })
const tx = txResult.data
// 两个 API 均返回 HaiResult；同时失败时保留执行和回滚两份原因。
// 将 Alice 绑定到试写语句，成功 data 含变更行数，写入尚待下方回滚，失败保留 error。
const inserted = await tx.execute('INSERT INTO users (name) VALUES (?)', ['Alice'])
// 无参数回滚当前事务，成功撤销未提交写入且无 data，回滚失败保留 error。
const rolledBack = await tx.rollback()
if (!inserted.success && !rolledBack.success)
  throw new AggregateError([inserted.error, rolledBack.error], rolledBack.error.message)
if (!inserted.success)
  throw new Error(inserted.error.message, { cause: inserted.error })
if (!rolledBack.success)
  throw new Error(rolledBack.error.message, { cause: rolledBack.error })
```

#### 场景：在事务内批量写入并分页查询

```ts
// 下列操作使用同一事务，正常返回时提交并返回回调 data，抛错则回滚并返回失败。
await reldb.tx.wrap(async (tx) => {
  // 把 Alice、Bob 两条带参数语句交给当前事务，成功无 data，执行失败读取 error 并抛出。
  const inserted = await tx.batch([
    {
      sql: 'INSERT INTO users (name) VALUES (?)',
      params: ['Alice']
    },
    {
      sql: 'INSERT INTO users (name) VALUES (?)',
      params: ['Bob']
    },
  ])
  if (!inserted.success)
    throw new Error(inserted.error.message, { cause: inserted.error })

  // 同一事务内读取按 ID 排序的第一页最多十条，data 含包括未提交写入的分页结果，失败读取 error。
  const page = await tx.queryPage<{ id: number, name: string }>({
    sql: 'SELECT id, name FROM users ORDER BY id',
    pagination: { page: 1, pageSize: 10 },
  })
  if (!page.success)
    throw new Error(page.error.message, { cause: page.error })
  return page.data
})
```

#### 场景：让仓库操作使用同一事务

所有方法均支持传入 `tx` 参数，自动路由到事务上下文：

```ts
// 用 users 的字段投影与写入列构建 SQLite 仓库，返回支持传入事务的操作对象。
const userCrud = reldb.crud.table<{ id: number, name: string, email: string }>({
  table: 'users', idColumn: 'id', dbType: 'sqlite',
  select: ['id', 'name', 'email'], createColumns: ['name', 'email'], updateColumns: ['name', 'email'],
})
// 下列操作使用同一事务，正常返回时提交并返回回调 data，抛错则回滚并返回失败。
await reldb.tx.wrap(async (tx) => {
  // 将 Alice 及邮箱写入当前事务，data 可能含 SQLite 插入 ID，失败读取 error。
  const created = await userCrud.create({ name: 'Alice', email: 'alice@example.com' }, tx)
  if (!created.success)
    throw new Error(created.error.message, { cause: created.error })
  if (created.data.lastInsertRowid === undefined)
    throw new Error('Insert did not return an ID')
  // 用刚取得的主键在同一事务修改姓名，成功 data 含变更行数，失败读取 error。
  const updated = await userCrud.updateById(created.data.lastInsertRowid, { name: 'Alice Smith' }, tx)
  if (!updated.success)
    throw new Error(updated.error.message, { cause: updated.error })
  // 在同一事务中按新主键读取已更新用户，成功为记录或 null，失败读取 error。
  const user = await userCrud.findById(created.data.lastInsertRowid, tx)
  if (!user.success)
    throw new Error(user.error.message, { cause: user.error })
  return user.data
})
```

<a id="repositories"></a>

### 按记录操作数据：`reldb.crud`

把表字段与应用对象映射为仓库，再创建、查询、更新或删除记录；事务内使用相应事务仓库。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `reldb.crud.table(config)` | 创建指定表的 CRUD 操作对象 | 必填 `config: CrudConfig<TItem>` 描述表到业务记录的映射。见[配置字段](#reldb-crud-config)。 | `ReldbCrudRepository<TItem>` | `reldb.crud.table(orderRepositoryConfig)` |
| `repository.create(data, tx?)` | 新增记录 | `data: Record<string, unknown>` 按数据库列名提供业务值。`tx?: DmlWithTxOperations` 已有事务，省略时走普通连接 | `Promise<HaiResult<ExecuteResult>>` | `await repository.create({ id: 'r1', name: 'Ada' })` |
| `repository.createMany(items, tx?)` | 批量新增 | `items: Array<Record<string, unknown>>` 每项为一条记录的列名和值。`tx?: DmlWithTxOperations` 已有事务，省略时走普通连接 | `Promise<HaiResult<void>>` | `await repository.createMany([{ id: 'r2', name: 'Lin' }])` |
| `repository.createOrUpdate(data, tx?)` | 按配置的键新增或更新 | `data: Record<string, unknown>` 按数据库列名提供业务值。`tx?: DmlWithTxOperations` 已有事务，省略时走普通连接 | `Promise<HaiResult<ExecuteResult>>` | `await repository.createOrUpdate({ id: 'r1', name: 'Ada v2' })` |
| `repository.findById(id, tx?)` | 查找一条，缺失为空 | `id` 主键值，类型应匹配建表列。`tx?: DmlWithTxOperations` 已有事务，省略时走普通连接 | `Promise<HaiResult<TItem \| null>>` | `await repository.findById('r1')` |
| `repository.getById(id, tx?)` | 查找一条，缺失失败 | `id` 主键值，类型应匹配建表列。`tx?: DmlWithTxOperations` 已有事务，省略时走普通连接 | `Promise<HaiResult<TItem>>` | `await repository.getById('r1')` |
| `repository.findAll(options?, tx?)` | 条件查询 | `options` 可选 `where`、`params`、`orderBy`、`limit`、`offset`；可传已有事务 `tx` | `Promise<HaiResult<TItem[]>>` | `await repository.findAll({ orderBy: 'id ASC' })` |
| `repository.findPage(options, tx?)` | 分页查询 | `options` 对象必填，可省略各字段；`where`、`params`、`orderBy` 与 `findAll` 相同，`pagination`、`overrides` 与 [SQL 分页](#sql) 相同；可传 `tx` | `Promise<HaiResult<PaginatedResult<TItem>>>` | `await repository.findPage({ pagination: { page: 1, pageSize: 10 } })` |
| `repository.updateById(id, data, tx?)` | 按主键更新 | `id` 主键值，类型应匹配建表列。`data: Record<string, unknown>` 按数据库列名提供业务值。`tx?: DmlWithTxOperations` 已有事务，省略时走普通连接 | `Promise<HaiResult<ExecuteResult>>` | `await repository.updateById('r1', { name: 'Ada v3' })` |
| `repository.deleteById(id, tx?)` | 按主键删除 | `id` 主键值，类型应匹配建表列。`tx?: DmlWithTxOperations` 已有事务，省略时走普通连接 | `Promise<HaiResult<ExecuteResult>>` | `await repository.deleteById('r2')` |
| `repository.count(options?, tx?)` | 统计记录数 | `options` 可选 `where` 与 `params`（省略条件时统计整表）；可传 `tx` | `Promise<HaiResult<number>>` | `await repository.count()` |
| `repository.exists(options?, tx?)` | 检查条件是否命中 | `options` 可选 `where` 与 `params`（省略条件时检查表内是否有记录）；可传 `tx` | `Promise<HaiResult<boolean>>` | `await repository.exists({ where: 'name = ?', params: ['Lin'] })` |
| `repository.existsById(id, tx?)` | 检查主键是否存在 | `id` 主键值，类型应匹配建表列。`tx?: DmlWithTxOperations` 已有事务，省略时走普通连接 | `Promise<HaiResult<boolean>>` | `await repository.existsById('r2')` |

使用 `createOrUpdate()` 时，`idColumn` 必须对应主键或单列唯一键。以 MySQL 为例，`idColumn: "id"` 时，尝试插入新 ID `o2`，但邮箱已属于 `o1`，会返回 `DUPLICATE_ENTRY` 并保留 `o1`。未提供目标键时执行普通插入。提供 `tx` 时使用该事务，独立调用的 MySQL 新增或更新由框架开启事务。更新成功时，`changes` 是 UPDATE 驱动报告的行数。在 MySQL 上，只有插入分支才可能提供 `lastInsertRowid`。

<a id="reldb-crud-config"></a>

**CrudConfig<TItem>**

| 字段 | 类型 | 必填与默认 | 用途及生效条件 |
| --- | --- | --- | --- |
| `table` | `string` | 必填 | 仓库所操作的可信表名。 |
| `dbType` | `DbType` | 必填 | 当前连接的方言，用于生成 SQL。 |
| `idColumn` | `string` | `id` | 主键定位、冲突更新和删除所用的列。 |
| `select` | `string[]` | `*` | 返回记录的列。 |
| `createColumns / updateColumns` | `string[]` | 按传入数据取列 | 限制可写入的列。省略白名单时按给定数据选列。显式空白名单不允许相应写入，更新仍排除主键。 |
| `mapRow` | `(row: QueryRow) => TItem` | 可省略 | 把查询行转换为宿主业务对象。 |

例如为 `orders` 设 `idColumn: "order_id"`、`select: ["order_id", "status"]`，`findById("o1")` 按 order_id 定位并返回两列，找不到返回 null。

<a id="reldb-repository-query-options"></a>

**仓库查询选项**

| 字段 | 类型 | 必填与默认 | 用途及生效条件 |
| --- | --- | --- | --- |
| `where` | `string` | 可省略 | 适用 findAll、findPage、count、exists。可信静态条件，不含 WHERE。 |
| `params` | `unknown[]` | `[]` | 给 where 里的占位符依次绑定动态数据。 |
| `orderBy` | `string` | 可省略 | findAll / findPage 可传可信排序表达式，不含 ORDER BY。分页与 offset 应使用稳定排序。 |
| `limit / offset` | `number` | 不限条数 / 从开头 | findAll 的返回条数上限与跳过的条数。可只传 offset。 |
| `pagination / overrides` | `PaginationOptionsInput / PaginationOverrides` | 可省略 | 仅 findPage。与 [SQL 查询分页](#reldb-sql-page-options) 使用相同的字段。 |

若已按 ID 保存 `r1` 和 `r2`，用 `findAll({ orderBy: "id ASC", offset: 1 })` 跳过 `r1`，返回只含 `r2` 的数组。可选的 `tx` 用于让读写参与已有事务。

`findAll({ orderBy, offset })` 会跳过指定条数并返回剩余记录，在 SQLite、PostgreSQL 和 MySQL 中均可省略 `limit`。

#### 场景：按记录操作数据

下文先给出完整仓库定义，再逐场景展示各实例方法的输入、成功记录/分页/计数和未找到结果；BaseReldbCrudRepository 是自定义仓库的基类。

#### 场景：按同一记录完成创建、查询、更新与删除

输入为全新的 demo_repository 表和固定 ID r1/r2。先建表再创建仓库；所有 success 数据写在调用旁。where/orderBy 是可信代码，业务值放 params。各方法最后可选传入同一事务句柄。

```ts
// 以下为应用异步业务函数体片段；失败时返回原结果。
// 创建 CRUD 示例表，使用文本主键和必填名称，成功无 data，失败时返回原失败结果。
const createTableResult = await reldb.ddl.createTable('demo_repository', {
  id: { type: 'TEXT', primaryKey: true },
  name: { type: 'TEXT', notNull: true },
})
if (!createTableResult.success)
  return createTableResult
// 绑定示例表、列权限与 SQLite 方言，返回下方使用的仓库对象。
const repository = reldb.crud.table<{ id: string, name: string }>({
  table: 'demo_repository', idColumn: 'id', dbType: 'sqlite',
  select: ['id', 'name'], createColumns: ['id', 'name'], updateColumns: ['name'],
})
// 插入 r1 和 Ada，data.changes 为 1，失败时返回原失败结果。
const createResult = await repository.create({ id: 'r1', name: 'Ada' })
if (!createResult.success)
  return createResult
createResult.data.changes // 1
// 批量写入列表中的 r2，成功无 data，批量失败时返回原失败结果。
const createManyResult = await repository.createMany([{ id: 'r2', name: 'Lin' }])
if (!createManyResult.success)
  return createManyResult
// 成功无业务数据。
// 传已存在的 r1 并更新姓名为 Ada v2，data.changes 为 1，失败时返回原失败结果。
const createOrUpdateResult = await repository.createOrUpdate({ id: 'r1', name: 'Ada v2' })
if (!createOrUpdateResult.success)
  return createOrUpdateResult
createOrUpdateResult.data.changes // 1
// 查询已更新的 r1，返回该行或 null，查询失败时返回原失败结果。
const findByIdResult2 = await repository.findById('r1')
if (!findByIdResult2.success)
  return findByIdResult2
findByIdResult2.data // { id: 'r1', name: 'Ada v2' }
// 必须读取到 r1，成功返回该行，缺失或查询失败时返回原失败结果。
const getByIdResult = await repository.getById('r1')
if (!getByIdResult.success)
  return getByIdResult
getByIdResult.data // same record; missing records fail
// 按 id 升序读取两条记录，成功 data 是数组，查询失败时返回原失败结果。
const findAllResult = await repository.findAll({ orderBy: 'id ASC' })
if (!findAllResult.success)
  return findAllResult
findAllResult.data.length // 2
// 按 id 升序读取第一页最多十条，分页对象中总数为 2，失败时返回原失败结果。
const findPageResult = await repository.findPage({ orderBy: 'id ASC', pagination: { page: 1, pageSize: 10 } })
if (!findPageResult.success)
  return findPageResult
findPageResult.data.total // 2
// 无条件统计示例表，data 为 2，查询失败时返回原失败结果。
const countResult = await repository.count()
if (!countResult.success)
  return countResult
countResult.data // 2
// 用参数 Lin 绑定姓名条件，存在匹配时为 true，查询失败时返回原失败结果。
const existsResult = await repository.exists({ where: 'name = ?', params: ['Lin'] })
if (!existsResult.success)
  return existsResult
existsResult.data // true
// 按主键核对刚批量插入的 r2，返回 true，查询失败时返回原失败结果。
const existsByIdResult = await repository.existsById('r2')
if (!existsByIdResult.success)
  return existsByIdResult
existsByIdResult.data // true
// 将 r1 的名称更新为 Ada v3，data.changes 为 1，失败时返回原失败结果。
const updateByIdResult = await repository.updateById('r1', { name: 'Ada v3' })
if (!updateByIdResult.success)
  return updateByIdResult
updateByIdResult.data.changes // 1
// 按主键删除 r2，data.changes 为 1，删除失败时返回原失败结果。
const deleteByIdResult = await repository.deleteById('r2')
if (!deleteByIdResult.success)
  return deleteByIdResult
deleteByIdResult.data.changes // 1
// 按已删除的 r2 查询，成功 data 为 null，底层查询失败时返回原失败结果。
const findByIdResult = await repository.findById('r2')
if (!findByIdResult.success)
  return findByIdResult
findByIdResult.data // null, a successful lookup with no match
// 要求读取已删除的 r2，返回失败 RECORD_NOT_FOUND。
const missing = await repository.getById('r2') // success: false, RECORD_NOT_FOUND
// 清理本例表，true 允许已不存在，成功无 data，失败时返回原失败结果。
const dropTableResult = await reldb.ddl.dropTable('demo_repository', true)
if (!dropTableResult.success)
  return dropTableResult
// cleanup of this example's table
```

#### 场景：用字段映射扩展业务仓库

业务仓库继承 `BaseReldbCrudRepository`，通过 `fields` 定义字段映射，自动建表、类型转换：

Unix 毫秒字段使用 `BIGINT`（SQLite 为 64 位 INTEGER，PostgreSQL/MySQL 为 BIGINT），普通 INTEGER 在 PostgreSQL/MySQL 中无法容纳当前毫秒时间。BIGINT 的原始 SQL/CRUD 和基类读取值保留驱动的 number/string/bigint 类型；需要 number 的业务仓库须校验安全整数后转换，避免静默精度丢失。TIMESTAMP 字段由基类读取为 Date。

```ts
// import 放在模块顶部；其余片段位于应用的异步业务函数体内，失败时返回原结果。

import { type DmlWithTxOperations, type ReldbCrudFieldDefinition, BaseReldbCrudRepository, reldb } from '@h-ai/reldb'

interface UserRow {
  id: number
  name: string
  email: string
  createdAt: Date
  updatedAt: Date
}

const USER_FIELDS: ReldbCrudFieldDefinition[] = [
  {
    fieldName: 'id',
    columnName: 'id',
    def: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
    select: true,
    create: false,
    update: false
  },
  {
    fieldName: 'name',
    columnName: 'name',
    def: { type: 'TEXT', notNull: true },
    select: true,
    create: true,
    update: true
  },
  {
    fieldName: 'email',
    columnName: 'email',
    def: { type: 'TEXT', notNull: true },
    select: true,
    create: true,
    update: true
  },
  {
    fieldName: 'createdAt',
    columnName: 'created_at',
    def: { type: 'TIMESTAMP', notNull: true },
    select: true,
    create: true,
    update: false
  },
  {
    fieldName: 'updatedAt',
    columnName: 'updated_at',
    def: { type: 'TIMESTAMP', notNull: true },
    select: true,
    create: true,
    update: false
  },
]

class UserRepository extends BaseReldbCrudRepository<UserRow> {
  constructor() {
    // 把已初始化 RelDB、表名、主键和字段映射交给基类，配置当前仓库。
    super(reldb, { table: 'users', idColumn: 'id', fields: USER_FIELDS })
  }

  /** 自定义查询方法 */
  async findByEmail(email: string) {
    // 按调用方 email 参数查最多一条匹配记录，成功为数组，失败结果原样返回。
    return this.findAll({
      where: 'email = ?',
      params: [email],
      limit: 1
    })
  }

  /** 自定义方法中使用 this.sql(tx) 自动路由到事务 */
  async insertRaw(data: { name: string, email: string }, tx?: DmlWithTxOperations) {
    // 自定义原始写操作应先确保表已就绪（避免刚建库/建表较慢时的竞态）
    // 无参数等待基类准备好 users 表。成功后执行写入，失败结果原样返回。
    const ready = await this.ensureReady()
    if (!ready.success)
      return ready
    const now = Date.now()
    // sql 使用调用方事务或常规连接，execute 用姓名、邮箱和时间戳插入，返回影响行数或失败。
    return this.sql(tx).execute(
      'INSERT INTO users (name, email, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [data.name, data.email, now, now],
    )
  }
}

// 使用
const repo = new UserRepository()
// 用示例姓名与邮件创建用户，库可生成主键，执行信息包含影响行数，失败时返回原失败结果。
const createResult3 = await repo.create({ name: '张三', email: 'test@example.com' })
if (!createResult3.success)
  return createResult3
createResult3.data
// 用主键 1 查询，返回映射后的 UserRow 或 null，失败时返回原失败结果。
const userResult = await repo.findById(1)
if (!userResult.success)
  return userResult
const user = userResult.data // UserRow or null

// 创建或更新（upsert）
// 按 id 1 使用示例姓名和邮件更新或新增，返回执行信息，失败时返回原失败结果。
const createOrUpdateResult = await repo.createOrUpdate({ id: 1, name: '李四', email: 'test@example.com' })
if (!createOrUpdateResult.success)
  return createOrUpdateResult
createOrUpdateResult.data
// id=1 已存在 → 更新 name；不存在 → 插入新记录

// tx.wrap 的回调正常返回就会提交，因此在回调内显式抛错触发回滚。
// 用同一事务执行下面的两次仓库写入。全部成功则提交，无业务数据；失败由 wrap 回滚并返回失败结果。
const wrapResult = await reldb.tx.wrap(async (tx) => {
  // 使用回调传入的事务创建用户 A，执行信息含影响行数，插入失败触发回滚。
  const createdA = await repo.create({ name: '用户A', email: 'a@test.com' }, tx)
  if (!createdA.success)
    throw new Error(createdA.error.message, { cause: createdA.error })
  // 用同一事务创建用户 B，执行信息含影响行数，失败时两次写入一起回滚。
  const createdB = await repo.create({ name: '用户B', email: 'b@test.com' }, tx)
  if (!createdB.success)
    throw new Error(createdB.error.message, { cause: createdB.error })
})
if (!wrapResult.success)
  return wrapResult
```

<a id="json-fields"></a>

### 读写 JSON 字段：`reldb.json`

这些函数构造参数化 SQL 表达式，不会立即修改数据库；通过 sql.execute/query 执行表达式。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `reldb.json.extract(column, path)` | 生成提取 JSON 值的 SQL 表达式 | `column: string` 可信 JSON 列名或列 SQL 表达式。`path: string` 目标的 JSON 路径，如 $.status | `JsonSqlExpr` | `reldb.json.extract('payload', '$.status')` |
| `reldb.json.set(column, path, value)` | 生成设置 JSON 路径的 SQL 表达式 | `column: string` 可信 JSON 列名或列 SQL 表达式。`path: string` 目标的 JSON 路径，如 $.status。`value` 要写入指定路径的 JSON 值 | `JsonSqlExpr` | `reldb.json.set('payload', '$.status', 'paid')` |
| `reldb.json.insert(column, path, value)` | 生成仅新增 JSON 路径的 SQL 表达式 | `column: string` 可信 JSON 列名或列 SQL 表达式。`path: string` 目标的 JSON 路径，如 $.status。`value` 要写入指定路径的 JSON 值 | `JsonSqlExpr` | `reldb.json.insert('payload', '$.note', 'checked')` |
| `reldb.json.remove(column, path)` | 生成删除 JSON 路径的 SQL 表达式 | `column: string` 可信 JSON 列名或列 SQL 表达式。`path: string` 目标的 JSON 路径，如 $.status | `JsonSqlExpr` | `reldb.json.remove('payload', '$.note')` |
| `reldb.json.merge(column, patch)` | 生成合并 JSON 对象的 SQL 表达式 | `column: string` 可信 JSON 列名或列 SQL 表达式。`patch: Record<string, unknown>` 合并到 JSON 对象的字段和值 | `JsonSqlExpr` | `reldb.json.merge('payload', { status: 'paid' })` |
| `reldb.parseJsonPath(path)` | 分解 JSON 路径 | `path: string`，例如 `$.profile.name` | `string[]`，可能只返回已识别的路径段 | `reldb.parseJsonPath('$.profile.name')` |
| `reldb.createJsonOps(dbType)` | 按指定方言创建表达式构造器 | `dbType: DbType`，可选值为 `sqlite`、`postgresql`、`mysql`，必填 | `ReldbJsonOps`，可在未连接数据库时使用 | `reldb.createJsonOps('postgresql')` |

#### 场景：读写 JSON 字段

下面从一份 payload 演示 extract、set、insert、remove、merge 的输入路径和执行后的 JSON。方言工具与实际数据库匹配，不把表达式对象当已保存数据。

#### 场景：逐步修改一份订单 JSON

下面在开发用 SQLite 中创建一条记录，输入 ID j1 和初始 JSON。表达式只描述 SQL；执行成功后再查回完整值。各后端提取 JSON 标量的原始返回类型不同，应用需按真实数据库处理；不要把字符串引号规则写死为跨库约定。

```ts
// 以下为应用异步业务函数体片段；失败时返回原结果。
// 创建包含文本主键和 JSON 列的示例表，成功无 data，失败时返回原失败结果。
const createTableResult = await reldb.ddl.createTable('demo_json', {
  id: { type: 'TEXT', primaryKey: true }, payload: { type: 'JSON' },
})
if (!createTableResult.success)
  return createTableResult
// 将 j1 和序列化的草稿 JSON 绑定到两个占位符，成功记录影响行数，失败时返回原失败结果。
const executeResult5 = await reldb.sql.execute('INSERT INTO demo_json (id, payload) VALUES (?, ?)', [
  'j1', JSON.stringify({ status: 'draft', obsolete: true }),
])
if (!executeResult5.success)
  return executeResult5
executeResult5.data
// 用当前方言为 payload 内的 $.status 生成 SQL 表达式及参数，交给下面的查询。
const initialStatus = reldb.json.extract('payload', '$.status')
// 用上一步表达式及绑定的记录 ID j1 查询状态，SQLite 本例返回 draft，查询失败时返回原失败结果。
const getResult = await reldb.sql.get(`SELECT ${initialStatus.sql} AS status FROM demo_json WHERE id = ?`, [...initialStatus.params, 'j1'])
if (!getResult.success)
  return getResult
getResult.data
// SQLite: { status: 'draft' }
// 为 payload 的 $.status 赋值 paid 生成 SQL 和绑定参数。
const changed = reldb.json.set('payload', '$.status', 'paid')
// 将刚生成的设置表达式应用到 j1。成功 data 含影响行数，失败时返回原失败结果。
const executeResult4 = await reldb.sql.execute(`UPDATE demo_json SET payload = ${changed.sql} WHERE id = ?`, [...changed.params, 'j1'])
if (!executeResult4.success)
  return executeResult4
executeResult4.data
// 生成只在 reviewer 路径缺失时插入 Ada 的 SQL 和参数。
const inserted = reldb.json.insert('payload', '$.reviewer', 'Ada')
// 用上一表达式更新 j1 的缺失字段，成功返回受影响行数，失败时返回原失败结果。
const executeResult3 = await reldb.sql.execute(`UPDATE demo_json SET payload = ${inserted.sql} WHERE id = ?`, [...inserted.params, 'j1'])
if (!executeResult3.success)
  return executeResult3
executeResult3.data
// 为从 payload 删除 obsolete 路径生成 SQL 和参数。
const removed = reldb.json.remove('payload', '$.obsolete')
// 对 j1 应用删除表达式，成功 data 含影响行数，失败时返回原失败结果。
const executeResult2 = await reldb.sql.execute(`UPDATE demo_json SET payload = ${removed.sql} WHERE id = ?`, [...removed.params, 'j1'])
if (!executeResult2.success)
  return executeResult2
executeResult2.data
// 为版本号 2 和 reviewer 的 null 补丁生成 SQLite 合并表达式，后者移除该成员。
const merged = reldb.json.merge('payload', { version: 2, reviewer: null })
// 将合并表达式应用到 j1，返回影响行数，失败时返回原失败结果。
const executeResult = await reldb.sql.execute(`UPDATE demo_json SET payload = ${merged.sql} WHERE id = ?`, [...merged.params, 'j1'])
if (!executeResult.success)
  return executeResult
executeResult.data
// 按 j1 读取最终 payload，成功得到 JSON 文本所在行或 null，失败时返回原失败结果。
const finalResult = await reldb.sql.get<{ payload: string }>('SELECT payload FROM demo_json WHERE id = ?', ['j1'])
if (!finalResult.success)
  return finalResult
const final = finalResult.data
if (final)
  JSON.parse(final.payload) // { status: 'paid', version: 2 }
// 删除示例 JSON 表，true 允许不存在，成功无 data，失败时返回原失败结果。
const dropTableResult = await reldb.ddl.dropTable('demo_json', true)
if (!dropTableResult.success)
  return dropTableResult
```

set 创建或替换路径，insert 仅新增，remove 删除路径；merge 递归保留未改键，补丁 null 删除键，数组整体替换。补丁根必须是可序列化的对象。PostgreSQL 使用单条参数化递归 CTE，不要求预装函数，不在应用先读后写。路径格式支持 `$.key`、`$.key.subkey` 和 `$[0]`；列名来自可信代码，路径和值作为参数。

#### 场景：在建立连接前构造 JSON 查询表达式

配置中的路径 `$.profile.name` 读取资料中的姓名。下面为预定使用 PostgreSQL 的报表准备表达式。解析遇到未识别的部分时可能只返回此前识别的路径段；需要完整校验时由应用检查路径和允许的键。

```ts
import { reldb } from '@h-ai/reldb'

const path = '$.profile.name'
// 返回 profile 和 name 两个路径段。
const segments = reldb.parseJsonPath(path) // ['profile', 'name']
// 选择 PostgreSQL 方言，返回表达式构造器。
const pgJson = reldb.createJsonOps('postgresql')
// 把路径作为参数绑定，表达式可以在建立连接后用于查询。
const expression = pgJson.extract('payload', path)
expression // { sql: 'payload #> ?::text[]', params: [['profile', 'name']] }
```

## 错误处理

收到 `HaiResult<T>` 时先检查 `result.success`。成功时读取 `result.data`，失败时查看 `result.error`。记录故障时保留错误码和追踪编号，便于从日志找到对应请求。

执行 SQL 或操作事务得到 `HaiResult<T>`。SQL 标识符检查和 JSON 表达式构造工具的返回类型见各节示例。

```ts
import { HaiReldbError, reldb } from '@h-ai/reldb'

// 读取 users 全部行，成功 data 为记录数组，失败按下方错误码处理。
const result = await reldb.sql.query('SELECT * FROM users')
if (!result.success) {
  switch (result.error.code) {
    case HaiReldbError.NOT_INITIALIZED.code:
      // 请先调用 reldb.init()
      break
    case HaiReldbError.QUERY_FAILED.code:
      // SQL 执行错误
      break
    case HaiReldbError.CONSTRAINT_VIOLATION.code:
      // 约束违反（如唯一约束、外键等）
      break
  }
}
```

常用错误码：

| 错误码                               | code            | 说明                       |
| ------------------------------------ | --------------- | -------------------------- |
| `HaiReldbError.NOT_INITIALIZED`      | `hai:reldb:010` | 未初始化                   |
| `HaiReldbError.CONNECTION_FAILED`    | `hai:reldb:001` | 连接失败                   |
| `HaiReldbError.QUERY_FAILED`         | `hai:reldb:002` | 查询失败                   |
| `HaiReldbError.CONSTRAINT_VIOLATION` | `hai:reldb:003` | 约束违反                   |
| `HaiReldbError.TRANSACTION_FAILED`   | `hai:reldb:004` | 事务失败                   |
| `HaiReldbError.DDL_FAILED`           | `hai:reldb:020` | DDL 操作失败               |
| `HaiReldbError.CONFIG_ERROR`         | `hai:reldb:013` | 配置错误                   |
| `HaiReldbError.TIMEOUT`              | `hai:reldb:009` | MySQL 连接获取超过截止期限 |
| `HaiReldbError.POOL_EXHAUSTED`       | `hai:reldb:011` | MySQL 连接等待队列已满     |

派生 `BaseReldbCrudRepository` 的自定义 SQL 方法先检查 `await this.ensureReady()`；构造函数启动自动建表不等于仓库就绪，服务 init 必须等待候选仓库的就绪入口再发布。PostgreSQL 自动提交的单条 `CREATE TABLE/INDEX IF NOT EXISTS` 仅对 `23505/pg_class_relname_nsp_index`（建表还包括 `pg_type_typname_nsp_index`）目录竞争，以及建表时 `42710/heap_create_with_catalog`、`42710/TypeCreate` 或 `42P07/heap_create_with_catalog` 的目录竞争重执行一次。DDL 和 SQL 入口均保留重试后的错误。事务、业务唯一约束及其他错误不自动重试。初始化连接探测仅对临时 DNS 错误 `EAI_AGAIN` 最多尝试三次，间隔 250/500 ms；不重放业务 SQL。

### 错误提示与关联日志

唯一约束冲突返回 `HaiReldbError.DUPLICATE_ENTRY`（409），SQLite 的 sync 和 worker 执行方式一致；超时、队列已满等已有错误码保持不变。业务按错误码分支，不解析本地化消息或驱动错误文本。日志保留驱动 code/schema/routine/constraint 和堆栈行号；数字绑定值不会误遮蔽这些诊断标识。

HTTP 错误向浏览器返回当前语言的提示和追踪编号。编号既在响应的 `error.traceId`，也在 `X-Trace-Id` 响应头，等于本次请求的 `requestId`。用户可在 Toast 的排查信息中展开并复制编号，开发人员可用它查找前后端日志。异常详情、堆栈和操作信息去除凭据后写入服务端日志。字段校验仅返回字段名和可显示的错误提示。

服务端把错误发给浏览器之前，可用 `core.error.toPublic(error, traceId)` 去除内部信息。界面需要重新显示错误时，可用 `core.error.formatMessage(error)` 格式化提示，重复调用也只附一次追踪编号。

写服务端日志时传入完整的 Error 对象，保留堆栈和错误原因。数据库操作失败时，可按驱动错误码、表和列定位问题。日志不记录 SQL 原文、参数值或数据库凭据。
