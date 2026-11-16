# reldb 数据结构

[数据结构索引](README.md) · [模块配置](../configuration/reldb.md) · [功能说明](../function/reldb.md)

## 数据库与缓存

模块提供 SQLite、PostgreSQL 和 MySQL 连接、DDL、CRUD、事务和 SQL 原语。各使用方负责声明和创建业务表，例如 [IAM](iam.md)、[runner](runner.md)、[scheduler](scheduler.md) 和 [audit](audit.md)。

## 字段、键与连接

表名、字段类型、默认值、主键、唯一约束、外键和索引由调用方 DDL 决定。声明式字段映射为当前方言的实际列。模块没有 Redis 键或业务查询缓存。连接池随 `init` 和 `close` 管理，SQLite 使用配置路径的数据库文件或显式开发内存库。
