# @h-ai/reldb

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/core](../core/README.md)

关系型数据库访问模块，通过统一的 `reldb` 对象访问 SQLite、PostgreSQL、MySQL。

## 快速开始

[跟着最小示例完成接入](../../docs/usage/function/reldb.md#最小接入示例)。

## 配置清单

生成的项目在 `config/_db.yml` 中设置数据库类型、地址和连接选项。应用启动代码读取该文件，把配置对象传给 `reldb.init(config)`。

在[模块配置清单](../../docs/usage/configuration/reldb.md)中查阅配置入口、默认值、取值限制和生效条件。

## 功能说明

[查 API 清单](../../docs/usage/function/reldb.md#api-reference)，包含调用入口、输入、返回值和用法。

<a id="事务"></a>

[事务用法](../../docs/usage/function/reldb.md#事务)

## 数据结构

模块没有自建数据库表。

查看[数据结构](../../docs/usage/data/reldb.md)，了解连接池、应用表、DDL 约定与事务状态。

## 开发测试

```bash
pnpm --filter @h-ai/reldb test
```

> MySQL/PostgreSQL 测试需要 Docker。

源码 JSDoc 遵循[统一规范](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)：公开示例使用实际发布入口，内部示例在原模块作用域检查。构建后执行 `pnpm check:jsdoc --package reldb`；示例编译不代替真实后端行为验证。

## 许可证

Apache-2.0
