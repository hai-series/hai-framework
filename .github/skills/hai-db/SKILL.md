---
name: hai-db
description: 使用 @h-ai/reldb 进行 SQLite/PostgreSQL/MySQL 的初始化、SQL/DDL/CRUD/事务与分页操作；当需求涉及数据库访问、CRUD 仓库、事务处理、分页查询或 ReldbErrorCode 分支处理时使用。
---

# hai-db

本技能用于指导在本仓库中正确使用 `@h-ai/reldb` 模块进行数据库操作与代码改动。涵盖初始化、DDL、SQL、CRUD 抽象、事务、分页与错误处理的正确姿势，并遵循仓库规范（i18n、日志、导出与测试要求）。

## 适用场景

- 新增或修改数据库访问逻辑（SQL/DDL/CRUD/事务）。
- 使用或扩展 `reldb.crud.table` / `BaseReldbCrudRepository`。
- 处理分页查询或分页结果规范化。
- 需要基于 `ReldbErrorCode` 做错误分支处理。

## 参考资料（优先读取）

- `packages/db/README.md`
- `packages/db/src/db-main.ts`
- `packages/db/src/db-types.ts`
- `packages/db/src/crud/db-crud-kernel.ts`
- `packages/db/src/crud/db-crud-repository.ts`
- `packages/db/src/db-pagination.ts`

## 使用步骤

1. **确认入口与初始化**
   - 统一通过 `import { reldb, ReldbErrorCode } from '@h-ai/reldb'` 使用。
   - 初始化：`await reldb.init(config)`，操作完成后 `await reldb.close()`。

2. **选择正确的操作接口**
   - DDL：`reldb.ddl`（建表/索引/字段变更）。
   - SQL：`reldb.sql`（`query/get/execute/batch/queryPage`）。
   - CRUD：`reldb.crud.table(config)` 或继承 `BaseReldbCrudRepository`。

- BaseReldbCrudRepository：`sql(tx?)` 返回 `DataOperations`（`reldb.sql` 或 `tx`）。
- 事务：`reldb.tx.wrap(fn)` 或 `reldb.tx.begin()`。
- 分页：`reldb.pagination.normalize/build`。

3. **CRUD 与事务的正确组合**
   - 所有 CRUD 方法支持传入 `tx` 句柄（同一事务内跨仓库操作）。
   - `BaseReldbCrudRepository` 适用于业务仓库封装，字段映射应完整声明。

- 自定义 SQL 时优先使用 `this.sql(tx)` 自动选择 `reldb.sql` 或 `tx`。

4. **SQL 规则与参数**
   - 参数占位符统一使用 `?`。
   - 分页查询使用 `queryPage`（或 `reldb.pagination` 构建结果）。

5. **错误处理**
   - 使用 `ReldbErrorCode` 做分支判断（如 `NOT_INITIALIZED`）。
   - 禁止 `console.log`，遵循模块日志规范（如需日志，使用模块 logger）。

6. **变更规范**
   - 仅在需要时修改代码；遵循导出规则（`index.ts` 只做 `export *` 聚合）。
   - 禁止 `any`，必要时用 `unknown` 并做缩窄。
   - 用户可见文本必须使用 i18n key。

7. **测试要求**
   - 有功能变更必须补测试（Vitest）。
   - 避免真实外部依赖；必要时使用注入与 mock。

## 代码示例

### 初始化与 SQL 查询

```ts
import { reldb, ReldbErrorCode } from '@h-ai/reldb'

await reldb.init({ type: 'sqlite', database: ':memory:' })

const result = await reldb.sql.query('SELECT * FROM users')
if (!result.success && result.error.code === ReldbErrorCode.NOT_INITIALIZED) {
  // 请先调用 reldb.init()
}

await reldb.close()
```

### CRUD + 事务

```ts
const userCrud = reldb.crud.table({
  table: 'users',
  idColumn: 'id',
  select: ['id', 'name', 'email'],
  createColumns: ['name', 'email'],
  updateColumns: ['name', 'email'],
})

const txResult = await reldb.tx.begin()
if (txResult.success) {
  const tx = txResult.data
  await userCrud.create({ name: '事务用户', email: 'tx@test.com' }, tx)
  await tx.commit()
}
```

### BaseReldbCrudRepository 业务仓库

```ts
class UserRepository extends BaseReldbCrudRepository<{ id: number, name: string, email: string }> {
  constructor() {
    super(db, {
      table: 'users',
      idColumn: 'id',
      fields: [
        {
          fieldName: 'id',
          columnName: 'id',
          def: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
          select: true,
          create: false,
          update: false,
        },
        {
          fieldName: 'name',
          columnName: 'name',
          def: { type: 'TEXT', notNull: true },
          select: true,
          create: true,
          update: true,
        },
        {
          fieldName: 'email',
          columnName: 'email',
          def: { type: 'TEXT', notNull: true },
          select: true,
          create: true,
          update: true,
        },
      ],
    })
  }
}
```

## 常见边界与注意事项

- `reldb.init` 未调用时，`reldb.ddl/reldb.sql/reldb.tx` 返回 `NOT_INITIALIZED`。
- CRUD 的 `create/update` 在 payload 为空时会返回 `CONFIG_ERROR`。
- SQLite 使用 `database` 作为文件路径或 `:memory:`。
- `reldb.pagination.normalize` 会裁剪 `pageSize`，避免过大分页。

## 触发提示（建议）

当用户提到以下关键词时优先启用本技能：

- “数据库初始化/连接/事务/分页/CRUD/SQL/DDL/ReldbErrorCode/BaseReldbCrudRepository/SQLite/PostgreSQL/MySQL”
