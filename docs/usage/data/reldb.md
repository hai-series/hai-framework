# reldb 数据结构

[English](reldb.en.md) · [日本語](reldb.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/reldb.md) · [功能说明](../function/reldb.md)

应用查询订单时，RelDB 使用当前数据库连接执行 SQL，并返回应用定义的列。表、约束和记录的保留期由建表的应用或模块决定。

<a id="database-connections"></a>

## 表、连接与事务

可用 `reldb.init()` 连接 SQLite、PostgreSQL 或 MySQL，再通过 `reldb.ddl` 建表、`reldb.sql` 查询或执行 SQL。业务表由使用数据库的模块定义并创建，例如 [IAM](iam.md)、[runner](runner.md)、[scheduler](scheduler.md) 和 [audit](audit.md)。

表名、字段类型、默认值、主键、唯一约束、外键和索引由调用方 DDL 决定。建表时，`reldb.ddl` 按已连接的数据库把字段定义转成相应的 SQL。模块没有 Redis 键或业务查询缓存。`reldb.init()` 打开连接，`reldb.close()` 释放连接。SQLite 可写到指定文件，开发时也可用 `:memory:` 创建只在内存中存在的数据库。

<a id="example-data"></a>

### 业务自己定义的订单表

RelDB 只提供数据库访问能力，不替应用决定订单字段。下面是假设应用自行建表后查到的订单。

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

user-42 的订单金额为1200分，即12元；note 为 null 表示没有备注。这不是框架自动创建的表。
