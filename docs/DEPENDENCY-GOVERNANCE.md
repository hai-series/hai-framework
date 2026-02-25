# 依赖治理规范

> 本文件定义模块间依赖方向、错误码分配、变更回归策略。所有模块变更必须遵守本规范。

---

## 依赖分层图

```text
Layer 0: @hai/core                     ← 基础能力，无 @hai/* 依赖
Layer 1: @hai/crypto, @hai/cache,      ← 独立能力模块，仅依赖 core
         @hai/db, @hai/storage, @hai/ai
Layer 2: @hai/iam                      ← 依赖 core + crypto + cache + db
Layer 3: @hai/kit, @hai/ui             ← kit 依赖 core/cache/db/iam；ui 仅依赖 core
Layer 4: @hai/cli                      ← 仅依赖 core（模板生成，无运行时 @hai/* 导入）
Layer 5: apps/admin-console            ← 可依赖全部模块
```

### 依赖方向约束

- **向内收敛**：上层可以依赖下层，禁止反向依赖。
- **同层隔离**：Layer 1 模块之间禁止互相依赖。
- **无循环依赖**：任何模块对之间不得形成循环引用链。

---

## 错误码分配表

每个模块拥有独占的错误码数值范围，禁止跨模块重叠。

| 范围      | 模块           | 常量前缀                              | 说明                |
| --------- | -------------- | ------------------------------------- | ------------------- |
| 1000–1199 | `@hai/core`    | `CommonErrorCode` / `ConfigErrorCode` | 通用错误 + 配置错误 |
| 2000–2099 | `@hai/crypto`  | `CryptoErrorCode`                     | 加密模块错误        |
| 3000–3099 | `@hai/db`      | `DbErrorCode`                         | 数据库模块错误      |
| 4000–4099 | `@hai/cache`   | `CacheErrorCode`                      | 缓存模块错误        |
| 5000–5999 | `@hai/iam`     | `IamErrorCode`                        | 身份权限模块错误    |
| 6000–6099 | `@hai/storage` | `StorageErrorCode`                    | 存储模块错误        |
| 7000–7499 | `@hai/ai`      | `AIErrorCode`                         | AI 模块错误         |
| 8000–8099 | （保留）       | —                                     | 未来扩展            |

### 错误码规则

1. 新模块申请新范围，在本文档登记后方可使用。
2. 单个模块内按功能分段（如 x000–x009 通用、x010–x019 初始化、x100–x199 子功能 A）。
3. 测试中优先使用符号常量（`StorageErrorCode.NOT_FOUND`），避免硬编码数值。

---

## 变更回归策略

当被依赖模块发生以下变更时，必须检查所有依赖方：

| 变更类型             | 回归范围                                 |
| -------------------- | ---------------------------------------- |
| 公共类型/接口签名    | 所有直接引用该类型的模块                 |
| 错误码新增/变更      | 所有匹配该错误码的上层 catch/switch 分支 |
| init/close 行为调整  | 所有调用该模块 init/close 的模块与应用   |
| 配置 Schema 字段变更 | 所有使用该配置的模块、应用、配置文件     |
| 导出删除/重命名      | `grep_search` 全量搜索引用点，逐一更新   |

### 回归检查清单

1. `grep_search` 搜索被改接口/类型/常量名，确认所有引用已同步。
2. 运行受影响模块的 `pnpm --filter <pkg> test`。
3. 若影响 admin-console，追加 `pnpm --filter admin-console typecheck`。
4. 全量质量门禁：`pnpm typecheck && pnpm lint && pnpm test`。

---

## 依赖声明规则

1. `dependencies`：运行时实际 `import` 的包。
2. `peerDependencies`：由应用层提供的框架级依赖（如 `svelte`、`@sveltejs/kit`）。
3. `optionalDependencies`：可选后端（如 `mysql2`、`pg`、`pino`）。
4. 禁止在 `dependencies` 中声明未被源码 `import` 的包（Kit 的 cache/db/iam 为集成模块设计，属例外）。
5. Workspace 依赖统一使用 `workspace:*`。
6. 外部依赖统一使用 `catalog:` 版本管理。
