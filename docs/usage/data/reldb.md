# @h-ai/reldb 数据结构

<a id="reldb-数据结构"></a>

[English](reldb.en.md) · [日本語](reldb.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/reldb.md) · [功能说明](../function/reldb.md)

应用查询订单时，RelDB 使用当前数据库连接执行 SQL，并返回应用定义的列。表、约束和记录的保留期由建表的应用或模块决定。

<a id="database-connections"></a>

## 表、连接与事务

RelDB 管理连接或连接池，以及当前进程借出的事务句柄。业务表由使用数据库的模块定义并创建，例如 [IAM](iam.md)、[Runner](runner.md)、[Scheduler](scheduler.md) 和 [Audit](audit.md)。RelDB 自己创建 0 张业务表和 0 个缓存键。

| 数据 | 所有者 | 读写及保留 |
| --- | --- | --- |
| 业务表及索引 | 定义表的应用或模块 | 调用方通过 `reldb.ddl` 管理结构，通过 `reldb.sql` 或仓库访问记录。持久化数据库中的记录按调用方规则保留和迁移。 |
| SQLite 数据库文件 | 应用或部署环境 | 保存到配置的文件路径。开发时用 `:memory:` 创建的数据库在连接关闭时释放。 |
| 连接、连接池与事务句柄 | 当前进程的 RelDB 实例 | `reldb.init()` 建立连接或连接池。事务持有借出的连接，应用提交或回滚后释放，`reldb.close()` 负责关闭连接资源。 |

<a id="example-data"></a>

### 业务自己定义的订单表

下面是应用定义的订单表中的一行。示例展示查询返回的四列。订单号 `order-42` 关联客户 `user-42`，订单金额为 1200 分，即 12 元。`note: null` 表示暂时没有备注。

```json
[
  {
    "id": "order-42",
    "user_id": "user-42",
    "total_cents": 1200,
    "note": null
  }
]
```

<a id="result-examples"></a>

### 订单查询和写入结果

应用按稳定顺序分页查询 21 条订单。每页 10 条时，第 3 页只剩 `order-42`。`reldb.sql.queryPage()` 成功返回下列对象。`total` 表示符合条件的总条数，`items` 仅包含当前页记录。

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "order-42",
        "user_id": "user-42",
        "total_cents": 1200,
        "note": null
      }
    ],
    "total": 21,
    "page": 3,
    "pageSize": 10
  }
}
```

应用用参数化 `UPDATE` 为这笔订单添加备注时，`reldb.sql.execute()` 返回驱动报告的影响行数。以下展示成功结果的投影，保留了 `success` 和 `data.changes`。如果写入在事务里，仍需等待事务成功提交才能把备注视为已保存。

```json
{
  "success": true,
  "data": { "changes": 1 }
}
```

[分页查询用法](../function/reldb.md#sql) · [事务与提交结果](../function/reldb.md#transactions)

<a id="schema-migration-checks"></a>

### 核对现有 SQLite 表的主键

应用已有 SQLite 订单表时，使用 `PRAGMA table_info(orders)` 检查文本主键 `id` 的 `pk` 和 `notnull` 列，再用 `SELECT COUNT(*) AS total FROM orders WHERE id IS NULL` 检查已有记录。对于声明了 `primaryKey: true, notNull: true` 的新文本主键，预期 `pk` 和 `notnull` 均为 1。曾用旧版创建的表可能仍允许空值。迁移前由应用确定这些记录的处理方式，再重建约束并读回核对。

### 核对现有 MySQL 约束和 PostgreSQL 部分索引

在 MySQL 中，如果旧版通过 `addColumn()` 增加了订单明细的 `order_id`，使用 `SHOW CREATE TABLE order_items` 检查外键是否指向 `orders(id)`，以及删除和更新动作是否符合应用定义。缺少外键时，先核对是否有明细指向不存在的订单，再由应用迁移添加约束。对可能使用同名索引的表分别执行 `SHOW INDEX FROM order_items` 和 `SHOW INDEX FROM orders`，核对索引所在表、列顺序及是否唯一。

在 PostgreSQL 中，可用 `SELECT pg_get_indexdef(to_regclass('public.orders_pending_idx'))` 检查现有索引的完整定义和 `WHERE` 条件。将实际条件与当前的 `prepareSchema()` 定义对照。条件需要变更时，由应用显式迁移索引，再重新执行结构准备。
