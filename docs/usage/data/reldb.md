# reldb 数据结构

[English](reldb.en.md) · [日本語](reldb.ja.md)

[数据结构索引](README.md) · [模块配置](../configuration/reldb.md) · [功能说明](../function/reldb.md)

## 数据库与缓存

可用 `reldb.init()` 连接 SQLite、PostgreSQL 或 MySQL，再通过 `reldb.ddl` 建表、`reldb.sql` 查询或执行 SQL。业务表由使用数据库的模块定义并创建，例如 [IAM](iam.md)、[runner](runner.md)、[scheduler](scheduler.md) 和 [audit](audit.md)。

## 字段、键与连接

表名、字段类型、默认值、主键、唯一约束、外键和索引由调用方 DDL 决定。建表时，`reldb.ddl` 按已连接的数据库把字段定义转成相应的 SQL。模块没有 Redis 键或业务查询缓存。`reldb.init()` 打开连接，`reldb.close()` 释放连接。SQLite 可写到指定文件，开发时也可用 `:memory:` 创建只在内存中存在的数据库。
