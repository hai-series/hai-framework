---
name: hai-reldb
description: "使用 @h-ai/reldb 访问 SQLite/PostgreSQL/MySQL，编写 SQL、CRUD、DDL、事务和分页。"
---

# hai-reldb

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/reldb 访问 SQLite/PostgreSQL/MySQL，编写 SQL、CRUD、DDL、事务和分页 |
| 适用场景 | 关系数据读写、仓库封装或事务一致性 |
| 输入 | ReldbConfigInput、参数化 SQL、CRUD 配置、事务句柄 |
| 输出 | DB 操作为 HaiResult；crud.table 和分页/JSON 工具按签名返回 |
| 限制 | 运行时仅服务端，纯 schemas 入口可用于浏览器；tx.wrap 只在回调抛错时回滚，返回失败 HaiResult 不会触发回滚。动态值参数化，标识符用白名单。 |

## 使用路径

- `_db.yml` 对应 core.config 的 db；先校验 ReldbConfigSchema，再 init 并检查 success。仅做配置校验可从 `@h-ai/reldb/schemas` 导入，纯入口只依赖 Zod，不加载数据库实例/驱动，可用于 CLI 和浏览器；运行时数据库操作仍仅服务端。
- `reldb.crud.table` / `tx.crud.table` 的 `dbType` 必填并与实际后端一致；`BaseReldbCrudRepository` 自动读取已初始化的配置。
- 事务每步检查结果，避免把失败当普通返回值提交；同一事务操作须共享 tx。
- SQL 值参数化；where/orderBy/json 列名不是任意用户输入。分页使用 PaginatedResult。
- MySQL 的 pool 仅 max/acquireTimeout/queueLimit；超时返回 TIMEOUT 并移除排队项，队列满返回 POOL_EXHAUSTED，迟到建连结算前仍占槽位。min/idleTimeout/timezone 不支持。URL 优先于分字段且禁止 query/fragment；TLS 仅 false 或严格对象，默认验证证书和 DNS 身份，验证开启的 IP 目标拒绝，cert/key 成对。详见 reference 的配置章节。

错误提示与诊断分离：HTTP/UI 边界用 core.error.toPublic，仅公开 i18n 安全消息及 error.traceId；重新翻译后用 core.error.formatMessage 保留关联。ToastContainer 默认只显示可读说明，自动将编号移入排查信息图标，展开后可查看、复制并提供给客户支持或开发人员。前后端日志传完整 Error 和操作上下文，使用同一 requestId/traceId 并脱敏；禁止只写通用错误标题，也不能把 cause/ext/SQL/绑定值直接返回用户。数据库日志保留安全的驱动错误码、消息和堆栈。

## 按需参考

唯一约束冲突按 HaiReldbError.DUPLICATE_ENTRY 分支，不解析本地化 message 或驱动字符串。连接超时、队列已满等已有错误码保持不变；日志保留安全驱动 code/schema/routine/constraint 和堆栈位置，数值参数不遮蔽诊断标识。

按任务读取 [reference.md](reference.md) 的对应小节；签名以当前源码或安装版本的公开类型为准，不默认加载全部资料。示例中的业务变量由应用提供。

- 运行环境
- 适用场景
- 使用步骤
- 核心 API
- 错误码 — `HaiReldbError`
- 常见模式
- 相关 Skills

JSON 对象合并使用 RFC 7396 补丁，必须将返回的 SQL/params 放在同一次 UPDATE 内；禁止先读对象再覆盖整个列来模拟跨节点原子合并。路径函数的后端差异和完整可类型检查示例见 [reference.md](reference.md)。

框架模块维护自己的版本迁移，应用不直接 ALTER 框架表。schemaColumns 只读真实列；migrateSchema(...,{dryRun:true}) 不创建账本。生产先停旧写入并备份 DB/共享会话缓存；SQLite/PostgreSQL 事务，MySQL DDL 隐式提交须可重入，失败不推进版本且重试检查真实结构。回退恢复兼容 DB 与代码，不只换二进制。模块 migrateIam/migrateReach/migrateScheduler 分别预检，初始化执行受支持步骤。
