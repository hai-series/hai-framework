---
name: hai-usage-reldb
description: "使用 @h-ai/reldb 访问 SQLite/PostgreSQL/MySQL，编写 SQL、CRUD、DDL、事务和分页。"
---

# hai-usage-reldb

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/reldb 访问 SQLite/PostgreSQL/MySQL，编写 SQL、CRUD、DDL、事务和分页 |
| 适用场景 | 关系数据读写、仓库封装或事务一致性 |
| 输入 | ReldbConfigInput、参数化 SQL、CRUD 配置、事务句柄 |
| 输出 | DB 操作为 HaiResult；crud.table 和分页/JSON 工具按签名返回 |
| 限制 | 仅服务端；tx.wrap 只在回调抛错时回滚，返回失败 HaiResult 不会触发回滚。动态值参数化，标识符用白名单。 |

## 使用路径

- `_db.yml` 对应 core.config 的 db；先校验 ReldbConfigSchema，再 init 并检查 success。
- 事务每步检查结果，避免把失败当普通返回值提交；同一事务操作须共享 tx。
- SQL 值参数化；where/orderBy/json 列名不是任意用户输入。分页使用 PaginatedResult。

## 按需参考

详细配置、API 签名、错误码和范本在 [reference.md](reference.md)。按下列标题定位所需小节，不默认通读；用例中的业务变量需结合当前应用补齐。

- §1 配置与初始化
- §2 操作接口总览
- §3 DDL — `reldb.ddl`
- §4 SQL — `reldb.sql`
- §5 CRUD — `reldb.crud.table(config)`
- §6 BaseReldbCrudRepository
- §7 事务
- §8 JSON 操作 — `reldb.json`
- §9 分页 — `reldb.pagination`
- §10 错误码 — `HaiReldbError`
- §11 常见模式
