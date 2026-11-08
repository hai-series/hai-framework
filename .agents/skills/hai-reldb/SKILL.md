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

按 [共享使用契约](../../../packages/cli/templates/skills/hai-reldb/SKILL.md) 选择操作与相邻参考，仅加载当前任务所需小节；模块 API、安全限制、生命周期和失败行为只在共享正文维护。

仓库内修改另按 [工作规范](../../instructions/workspace.md) 与 [模块规范](../../instructions/module-conventions.md)；公开签名以当前源码为准，发布包使用以实际安装版本为准。公共变化同步实现、调用方、模板、文档与测试。
