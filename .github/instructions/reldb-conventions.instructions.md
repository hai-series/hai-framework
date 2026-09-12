---
applyTo: "packages/reldb/**"
---

# @h-ai/reldb 模块规范

> 适用于 reldb 实现或使用方式的修改。

## 核心 API

- `reldb.ddl.*`：Schema 管理（createTable, dropTable, addColumn, createIndex, raw）
- `reldb.sql.*`：原生 SQL（query, get, execute, batch, queryPage）
- `reldb.crud.table()`：轻量级 CRUD
- `reldb.tx.wrap()` / `reldb.tx.begin()`：事务
- `reldb.json.*`：JSON 路径操作（extract, set, insert, remove, merge）

## 错误码段位

`HaiReldbError` 定义见 `packages/reldb/src/reldb-types.ts`，code 为 `hai:reldb:<三位码>`。

## SQL 安全

- SQL 动态值必须参数化（`?`）；动态表/列/排序仅使用白名单或可信代码，不能把用户输入直接拼入 SQL
- 使用 `reldb.sql.query(sql, params)` 而非内联参数

## Repository 模式

- 业务仓库继承 `BaseReldbCrudRepository`
- 类名：`{Module}{Entity}Repository`
- 构造配置使用 `fields` 的 fieldName/columnName 映射、`def` 列定义与 select/create/update 标记；不要臆造 fieldMapping/toEntity/fromEntity 扩展方法
- 跨仓库事务：多个 Repository 共享同一 `tx` 句柄
- 表名规则以 module-conventions 为准：`hai_<module>_<feature>`、就近定义、不可配置

## 缓存 key 约定（涉及 cache 时）

- 缓存 key 规则以 module-conventions 为准：`hai:<module>:<feature>`、就近定义、不可配置

## 详细 API 文档

完整用法见 `packages/reldb/README.md` 和 skill `hai-usage-reldb`。
