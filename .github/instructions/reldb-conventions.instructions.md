---
applyTo: "packages/reldb/**"
---

# @h-ai/reldb 模块规范

> 编辑 reldb 代码时自动激活。

## 核心 API

- `reldb.ddl.*`：Schema 管理（createTable, dropTable, addColumn, createIndex, raw）
- `reldb.sql.*`：原生 SQL（query, get, execute, batch, queryPage）
- `reldb.crud.table()`：轻量级 CRUD
- `reldb.tx.wrap()` / `reldb.tx.begin()`：事务
- `reldb.json.*`：JSON 路径操作（extract, set, insert, remove, merge）

## 错误码段位

3000-3499（ReldbErrorCode）

## SQL 安全

- 所有 SQL 必须参数化（使用 `?` 占位符），禁止字符串拼接/模板字面量构造 SQL
- 使用 `reldb.sql.query(sql, params)` 而非内联参数

## Repository 模式

- 业务仓库继承 `BaseReldbCrudRepository`
- 类名：`{Module}{Entity}Repository`
- 实现 `fieldMapping`、`toEntity`、`fromEntity`
- 跨仓库事务：多个 Repository 共享同一 `tx` 句柄
- 表名命名必须使用 `hai_<module>_<feature>`（全小写 snake_case）
- 表名常量必须与 Repository 实现同文件就近定义，禁止放在 main/constants 并跨层传递
- 表名禁止做成可配置项（禁止 `config.tableName`）

## 缓存 key 约定（涉及 cache 时）

- 缓存 key 命名必须使用 `hai:<module>:<feature>`（全小写 + 冒号分隔）
- key 前缀常量必须在实际使用该 key 的 Functions/Repository 文件内定义
- 缓存 key 禁止做成可配置项（禁止 `config.keyPrefix`）

## 详细 API 文档

完整用法见 `packages/reldb/README.md` 和 skill `hai-usage-reldb`。
