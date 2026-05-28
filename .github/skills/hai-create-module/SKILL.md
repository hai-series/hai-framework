---
name: hai-create-module
description: "Use when: creating a new module, new package, scaffold, add sub-feature, add provider, create repository, module structure, tsup config, error codes, NotInitializedKit pattern. 在 hai-framework 中创建新模块（package）。"
---

# hai-create-module — 模块创建决策手册

> 面向 AI 助手的模块创建指南。**本文档只含决策表与原则**；代码范本（main.ts、types.ts、config.ts、package.json 等可直接套用的模板）请按需读 [reference.md](reference.md)。
>
> 模块通用约束（命名、暴露形式、HaiResult、NotInitializedKit、日志、错误码段位）见 [.github/instructions/module-conventions.instructions.md](../../instructions/module-conventions.instructions.md)（编辑 `packages/` 时自动注入）。
>
> **变量约定**：`xx` = 模块名（如 storage、iam），`yy` / `zz` = 子功能名，`aaa` = Provider 实现名。

---

## §0 核心原则（动手前重读）

> 优先级固定：**正确性 > 简单性 > 可读性 > 可扩展性**。"更通用"与"更清晰"冲突时，永远选"更清晰"。

### 简单优先（Less is More）

- 最少目录、最少接口、最少配置、最少层级。
- 能放在现有模块/现有文件解决，不要新增一层概念。
- 一个清晰实现优先于"理论上更灵活"的多层封装。

### 最小知识（Law of Demeter）

- 使用方只需要知道公共入口 `xx`、必要配置和业务返回值。
- 对外类型只暴露业务字段，不暴露 DB 行 / 内部状态 / 中间对象。
- 多子特性依赖同一上游时，顶层注入一次，由模块内部派生，禁止使用方写转发样板。

### 整洁代码

- 命名直白；函数主流程一眼可读；单一职责 + early return。
- 死代码、注释代码、一次性包装、纯转发样板：**删除**。

### 反过度设计（YAGNI）

- 没有第二个真实实现 → 不引入 Provider / 抽象基类 / 策略层。
- 没有真实使用场景 → 不新增配置项、扩展点、兼容层、开关。
- 没有跨文件复用 → 不预先拆出 utils / constants / helper。
- 没有对外使用 → 不新增导出。

### 创建前四问（动笔前必须先答）

1. 不加这个抽象 / 子目录 / 配置项，模块会不会更简单？
2. 仓库里是否已有可复用的模式或实现？
3. 使用方会不会因为这次设计被迫理解内部结构？
4. 这个扩展点是否有**当前、明确、可验证**的真实场景？

---

## §1 架构决策（按顺序回答）

### 前置：模块类型

| 类型 | 特征 | 代表模块 |
| --- | --- | --- |
| **生命周期单例** | `export const xx: XxFunctions`，有 init/close | reldb, storage, cache, ai, iam, payment, crypto, capacitor, vecdb, audit, scheduler, reach, deploy, api-client |
| **纯函数模块** | 无状态，无 init/close | datapipe |
| **基础设施模块** | 提供底层能力（日志、配置、i18n、HaiResult） | core |

### 决策红线（任一命中即停手）

- 没有第二个真实实现 → **不引入 Provider / 抽象接口 / 策略层**
- 没有两个明确操作域 → **不拆子操作对象，扁平 API**
- 没有跨文件复用 → **不提前提取 utils / helper / constants**
- 没有真实 consumer → **不导出类型、函数、配置项**
- 只是转发上游能力 → **不要求使用方手写样板转发**

### 问题 1：是否有子功能？

| 判断 | main.ts 模式 | 说明 |
| --- | --- | --- |
| 无子功能 | main.ts 直接管理操作 | 操作接口在 xx-types.ts 定义，由 functions.ts 或 Provider 实现 |
| 有子功能 | main.ts 通过工厂创建子功能 | 各子功能在独立目录，通过 `get` 访问器暴露 |

### 问题 2：是否需要 Provider？

> Provider 是高成本抽象。**只有同 PR/仓库内已有 ≥2 个真实后端**时才用。禁止"先抽出来以后可能用"。

| 判断 | Provider 位置 |
| --- | --- |
| 不需要 | 无 Provider，功能直接实现 |
| 需要 + 无子功能 | `src/providers/xx-provider-aaa.ts`，由 main.ts 管理 |
| 需要 + 有子功能 | `src/yy/providers/xx-yy-provider-aaa.ts`，由子功能工厂内部管理，main.ts 不感知 |

### 组合速查 → 选 main.ts 模板

| 子功能 | Provider | main.ts 写法 | 范本 |
| --- | --- | --- | --- |
| 无 | 无 | 直接实现 | `reference.md` §R3.1 |
| 无 | 有（模块级） | Provider 委托 | `reference.md` §R3.2 |
| 有 | 无 或 有（子功能级） | 工厂创建子功能 | `reference.md` §R3.3 |

### 问题 3：API 风格——扁平方法 vs 子操作对象？

> **默认优先扁平 API**。只有分组能明显降低理解成本时才用子操作对象。

| 判断 | 风格 | 示例模块 |
| --- | --- | --- |
| 操作可按领域分 ≥2 组且每组 ≥2 个方法 | 子操作对象（getter） | reldb (sql/migration), cache (kv/hash/list/set/zset), ai (llm/mcp/embedding/...), iam (authn/authz/user/session), crypto (asymmetric/hash/symmetric/password), capacitor (device/camera/push/statusBar/preferences), vecdb (collection/vector) |
| 操作少（≤6）或语义高度内聚 | 扁平方法 | payment, audit, scheduler, deploy, reach |

**选定后整个模块保持统一风格，禁止混用。**

---

## §2 目录结构

### 2.1 基础模块（无子功能）

```
packages/xx/
  package.json
  README.md
  tsconfig.json
  tsup.config.ts
  vitest.config.ts
  messages/
    en-US.json
    zh-CN.json
  src/
    index.ts              # 唯一入口，仅 export *
    xx-main.ts            # 服务对象（export const xx）
    xx-types.ts           # 公共类型
    xx-config.ts          # 错误码 + Zod Schema
    xx-i18n.ts            # i18n 获取器
    xx-functions.ts       # 业务逻辑工厂（可选）
    xx-utils.ts           # 工具（可选）
    xx-repository-zz.ts   # Repository（可选）
    providers/            # Provider 实现（可选，仅多后端时）
      xx-provider-aaa.ts
    repositories/         # ≥3 个 Repository 时集中（可选）
  tests/
```

### 2.2 有子功能的模块

子功能用独立目录，**目录内不放 index.ts**。

```
packages/xx/
  src/
    index.ts
    xx-main.ts
    xx-types.ts            # 聚合 + re-export 子功能类型
    xx-config.ts
    xx-i18n.ts
    yy/                    # 子功能目录
      xx-yy-types.ts
      xx-yy-functions.ts
      xx-yy-repository-zz.ts  # 可选
      providers/              # 子功能 Provider（可选）
        xx-yy-provider-aaa.ts
    zz/
      ...
```

### 2.3 带 Client（前后端分离）

在 2.1/2.2 基础上：

```
packages/xx/
  src/
    index.ts              # Node 入口
    xx-index.browser.ts   # Browser 入口（仅 client + types）
    client/
      index.ts
      xx-client.ts        # 浏览器端 HTTP 客户端
```

### 2.4 带 API 契约的模块

契约统一放 `packages/api-contract`，服务端 procedure 放 `packages/serv`，**不在业务模块内新增 `./api` 子路径**。详见 `reference.md` §R4.5。

---

## §3 命名规范

### 3.1 文件命名

| 类别 | 规范 | 示例 |
| --- | --- | --- |
| 文件名 | `{模块}-{职责}.ts` kebab-case | `db-main.ts`、`iam-authn-functions.ts` |
| 子功能文件 | `{模块}-{功能}-{角色}.ts` | `iam-session-types.ts`、`ai-llm-functions.ts` |
| Provider 文件 | `{模块}-provider-{实现}.ts` | `reldb-provider-sqlite.ts` |
| Repository | `{模块}-repository-{实体}.ts` | `audit-repository-log.ts` |

### 3.2 标识符命名

| 类别 | 规范 | 示例 |
| --- | --- | --- |
| 服务对象 | 小写模块名 | `export const db` |
| 函数接口 | `{Module}Functions` | `ReldbFunctions` |
| 子操作接口 | `{Domain}Operations` | `KvOperations`、`DeviceOperations` |
| 错误定义对象 | `Hai{Module}Error`（`buildHaiErrorsDef` 生成） | `HaiReldbError.NOT_INITIALIZED` |
| 错误类型 | 统一 `HaiError` | `HaiError` |
| 配置 Schema | `{Module}ConfigSchema` | `StorageConfigSchema` |
| 配置类型 | `{Module}Config` / `{Module}ConfigInput` | `DbConfig` / `DbConfigInput` |
| Provider 接口 | `{Module}Provider` | `ReldbProvider` |
| Provider 工厂 | `create{Impl}Provider` | `createSqliteProvider()` |
| Repository 类 | `{Module}{Entity}Repository` | `AuditLogRepository` |
| i18n 获取器 | `{缩写}M` | `reldbM()` |
| 消息键 | `{module}_{camelCase}` | `storage_notInitialized` |
| 请求体 | `{Domain}Req` | `LoginReq` |
| 响应体 | `{Domain}Resp` | `LoginResp` |
| HTTP 契约对象 | `apiContract.{module}` | `apiContract.storage` |

### 3.3 命名三问

1. 看名字能知道它是做什么的吗？
2. 会和项目中其他名字混淆吗？
3. 6 个月后还能理解这个名字的含义吗？

### 3.4 表名与缓存 key（强制）

- 关系表名：`hai_<module>_<feature>`（snake_case），示例 `hai_iam_users`。
- 缓存 key：`hai:<module>:<feature>`，示例 `hai:iam:user:123`。
- 常量**就近定义**在 Repository / functions 文件内。
- **不支持配置化**（禁止 `config.tableName` / `config.keyPrefix`）。

---

## §4 错误码段位（注册表）

> 详细 ErrorInfo 格式与 Schema 模板见 `reference.md` §R1-R2。

- 每模块通过 `buildHaiErrorsDef('module', ErrorInfo)` 生成，格式 `hai:{module}:{NNN}`。
- ErrorInfo 值格式 `'NNN:HTTP'`，NNN 三位编号，HTTP 为状态码。
- `NOT_INITIALIZED` 固定 `010`。
- 段位规则：通用 000-009、初始化 010-019、业务操作 020+。

**已注册命名空间**：

| 命名空间 | 模块 | 说明 |
| --- | --- | --- |
| `hai:common` | core | 通用错误 |
| `hai:core` | core | 配置错误 |
| `hai:api-client` | api-client | HTTP 客户端 |
| `hai:crypto` | crypto | 加密/签名/哈希 |
| `hai:reldb` | reldb | 关系数据库 |
| `hai:vecdb` | vecdb | 向量数据库 |
| `hai:cache` | cache | 缓存 |
| `hai:iam` | iam | 身份认证与授权 |
| `hai:storage` | storage | 对象存储 |
| `hai:payment` | payment | 支付 |
| `hai:capacitor` | capacitor | 移动端原生 |
| `hai:reach` | reach | 消息触达 |
| `hai:datapipe` | datapipe | 数据管道 |
| `hai:deploy` | deploy | 部署 |
| `hai:audit` | audit | 审计 |
| `hai:scheduler` | scheduler | 定时任务 |
| `hai:ai` | ai | AI / LLM / RAG / MCP |

---

## §5 实施步骤（套用范本）

按下列顺序生成文件，每一步对应 `reference.md` 范本：

1. **架构决策**（§1）→ 选定模块类型 / 子功能 / Provider / API 风格
2. **目录骨架**（§2）→ 创建文件夹与空文件
3. **`xx-config.ts`** → R1
4. **`messages/{zh-CN,en-US}.json`** → R5
5. **`xx-i18n.ts`** → R4.4
6. **`xx-types.ts`** → R2
7. **子功能 types + functions**（如有）→ R4.1
8. **Provider 实现**（如需）→ R4.2
9. **Repository 实现**（如需）→ R4.3
10. **`xx-main.ts`** → R3.1/R3.2/R3.3
11. **`index.ts`** → 仅 `export * from './xx-main.js'` + `export * from './xx-types.js'`
12. **Client / API 契约**（如有）→ R4.5/R4.6
13. **公共 API JSDoc** → R6
14. **测试** → R7
15. **包配置**（`package.json` / `tsconfig.json` / `tsup.config.ts` / `vitest.config.ts`）→ R8
16. **README** → R9

---

## §6 创建检查清单

- [ ] 已答 §0 创建前四问
- [ ] 已通过 §1 决策红线检查（无单实现 Provider / 无单组子操作）
- [ ] 模块类型 / API 风格已确定
- [ ] 错误码段位不与注册表冲突
- [ ] 目录结构符合 §2
- [ ] 命名符合 §3（含表名/缓存 key 规则）
- [ ] 表名/缓存 key 就近定义且不可配置
- [ ] 所有公共 API JSDoc 含 `@example`
- [ ] 公共方法返回 `HaiResult<T>`，未使用 `throw`（合规场景除外）
- [ ] 已实现 NotInitializedKit + `initInProgress` 并发防护（并发调用返回 HaiResult 错误）
- [ ] 测试覆盖正常 / 边界 / 多实现
- [ ] README + 对应 CLI Skill 模板（如存在）同步
- [ ] `pnpm typecheck` → `pnpm lint` → `pnpm test` → `pnpm build` 全部通过
