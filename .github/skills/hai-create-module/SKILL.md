---
name: hai-create-module
description: "Use when: creating a new module, new package, scaffold, add sub-feature, add provider, create repository, module structure, tsup config, error codes, NotInitializedKit pattern. 在 hai-framework 中创建新模块（package），包含目录结构、配置、类型、i18n、服务入口、Provider、Client 等脚手架代码。"
---

# hai-create-module — 模块创建规范

> 面向 AI 助手的模块创建指南。所有新模块必须遵循本规范。
>
> **变量约定**：`xx` = 模块名（如 storage、iam），`yy` / `zz` = 子功能名（如 authn、rbac），`aaa` = Provider 实现名（如 mysql、redis）。
>
> **代码块说明**：本文所有代码块均为**结构示例**，展示文件骨架与编码模式。生成实际代码时，必须根据需求替换名称、字段和业务逻辑，**不可照搬示例中的占位名称和伪逻辑**。

---

## §1 架构决策

创建模块前，依次回答以下问题，确定模块架构。

### 前置：模块类型

确定模块属于以下哪种类型，后续所有决策基于此分类：

| 类型             | 特征                                          | 代表模块                                                                                                       |
| ---------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **生命周期单例** | `export const xx: XxFunctions`，有 init/close | reldb, storage, cache, ai, iam, payment, crypto, capacitor, vecdb, audit, scheduler, reach, deploy, api-client |
| **纯函数模块**   | 无状态，无 init/close，直接调用               | datapipe                                                                                                       |
| **基础设施模块** | 提供底层能力（日志、配置、i18n、Result 等）   | core                                                                                                           |

- 生命周期单例模块必须遵循 §6 的 init/close/getter 全套规范
- 纯函数模块不需要 init/close，`XxFunctions` 接口直接声明操作方法

### 问题 1：模块是否有子功能？

| 判断         | main.ts 模式               | 说明                                                          |
| ------------ | -------------------------- | ------------------------------------------------------------- |
| **无子功能** | main.ts 直接管理操作       | 操作接口在 xx-types.ts 定义，由 functions.ts 或 Provider 实现 |
| **有子功能** | main.ts 通过工厂创建子功能 | 各子功能在独立目录，通过 `get` 访问器暴露                     |

### 问题 2：是否需要 Provider？

> Provider 用于同一功能需支持**多种后端实现**（如 MySQL / PostgreSQL / SQLite）。不需要多后端切换时，不使用 Provider。

| 判断                 | Provider 位置                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| **不需要**           | 无 Provider，功能直接实现                                                                           |
| 需要，且**无子功能** | 模块 Provider 目录 `src/providers/xx-provider-aaa.ts`，由 main.ts 管理                              |
| 需要，且**有子功能** | 子功能 Provider 目录 `src/yy/providers/xx-yy-provider-aaa.ts`，由子功能工厂内部管理，main.ts 不感知 |

### 组合速查

| 子功能 | Provider           | main.ts 写法   | 参考        |
| ------ | ------------------ | -------------- | ----------- |
| 无     | 无                 | 直接实现       | §6 示例 1   |
| 无     | 有（模块级）       | Provider 委托  | §6 示例 2   |
| 有     | 无或有（子功能级） | 工厂创建子功能 | §6 示例 3   |

### 问题 3：API 风格——扁平方法 vs 子操作对象？

模块函数接口 `XxFunctions` 的方法可以**直接暴露**（扁平）或通过 **getter 返回子操作对象**（分组）。

| 判断条件                                                | API 风格                 | 示例模块                                                                                                                                                                                                                                       |
| ------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 操作可按领域分为 ≥2 组且每组 ≥2 个方法                  | **子操作对象**（getter） | reldb (sql/migration), cache (kv/hash/list/set/zset), ai (llm/mcp/embedding/...), iam (authn/authz/user/session), crypto (asymmetric/hash/symmetric/password), capacitor (device/camera/push/statusBar/preferences), vecdb (collection/vector) |
| 模块操作少（≤6 个）或语义高度内聚，分组反而增加访问成本 | **扁平方法**             | payment (createOrder/refund/...), audit (log/list/stats), scheduler (register/start/stop), deploy (deployApp/provision/scanApp), reach (send)                                                                                                  |

**扁平风格**（操作直接挂在服务对象上）：

```ts
export interface XxFunctions {
  init: (config: XxConfigInput) => Promise<Result<void, XxError>>
  close: () => Promise<void>
  doSomething: (input: Input) => Promise<Result<Output, XxError>>
  doAnother: (id: string) => Promise<Result<void, XxError>>
  readonly config: XxConfig | null
  readonly isInitialized: boolean
}
```

**子操作风格**（通过 getter 暴露操作组）：

```ts
export interface XxFunctions {
  init: (config: XxConfigInput) => Promise<Result<void, XxError>>
  close: () => Promise<void>
  readonly yy: YyOperations // 子操作组
  readonly zz: ZzOperations // 子操作组
  readonly config: XxConfig | null
  readonly isInitialized: boolean
}
```

> 选定后整个模块保持统一风格，禁止同一模块混用两种风格。

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
    index.ts              # 唯一入口，仅做 export * 聚合
    xx-main.ts            # 服务对象（export const xx）
    xx-types.ts           # 公共类型
    xx-config.ts          # 错误码 + Zod Schema + 配置类型
    xx-i18n.ts            # i18n 消息获取器
    xx-functions.ts       # 功能业务逻辑——工厂函数（可选）
    xx-utils.ts           # 工具函数（可选）
    xx-repository-zz.ts   # 数据仓库——zz=实体名（可选，见 §7.6）
    providers/             # Provider 实现目录（可选，仅需多后端时）
      xx-provider-aaa.ts   # Provider 实现——aaa=实现名
    repositories/          # 多 Repository 集中目录（可选，≥3 个时用）
      xx-zz-repository.ts  # 每个实体一个文件
  tests/
```

### 2.2 有子功能的模块

子功能用独立目录，目录内**不需要 index.ts**。

```
packages/xx/
  ...                      # 同 §2.1 基础文件
  src/
    index.ts
    xx-main.ts
    xx-types.ts            # 聚合 + re-export 子功能类型
    xx-config.ts
    xx-i18n.ts
    yy/                    # 子功能目录（如 authn/、session/）
      xx-yy-types.ts       # 子功能类型
      xx-yy-functions.ts   # 子功能工厂函数
      xx-yy-utils.ts       # 子功能工具（可选）
      xx-yy-repository-zz.ts # 数据仓库（可选）
      providers/             # 子功能 Provider 目录（可选，仅需多后端时）
        xx-yy-provider-aaa.ts  # 子功能 Provider 实现
    zz/                    # 另一个子功能
      ...
  tests/
```

### 2.3 带 Client 的模块（前后端分离）

在 §2.1 或 §2.2 基础上增加：

```
packages/xx/
  src/
    index.ts              # Node 入口
    xx-index.browser.ts   # Browser 入口（仅 client + types）
    client/
      index.ts
      xx-client.ts        # 浏览器端 HTTP 客户端
```

### 2.4 带 API 契约的模块（对外提供 HTTP 端点）

如果模块需要对外暴露 HTTP API（如 storage、iam、ai、payment），则在 §2.1/§2.2/§2.3 基础上增加 `api/` 子目录：

```
packages/xx/
  src/
    api/                        # API 契约子模块（客户端/服务端共享）
      index.ts                  # export * 聚合
      xx-api-schemas.ts         # Zod Schema（入参/出参/实体）
      xx-api-contract.ts        # 端点定义（xxEndpoints）
```

对应 `package.json` 需声明 `./api` 子路径导出（见 §11.1）；`tsup.config.ts` 需增加 `api/index` 入口（见 §11.3）。

---

## §3 命名规范

### 3.1 文件命名

| 类别          | 规范                                     | 示例                                                  |
| ------------- | ---------------------------------------- | ----------------------------------------------------- |
| 文件名        | `{模块}-{职责}.ts` kebab-case            | `db-main.ts`、`iam-authn-functions.ts`                |
| 子功能文件    | `{模块}-{功能}-{角色}.ts`                | `iam-session-types.ts`、`ai-llm-functions.ts`         |
| Provider 文件 | `{模块}-provider-{实现}.ts`              | `reldb-provider-sqlite.ts`                            |
| Repository    | `{模块}-repository-{实体}.ts`            | `audit-repository-log.ts`                             |

### 3.2 标识符命名

| 类别          | 规范                                     | 示例                                                  |
| ------------- | ---------------------------------------- | ----------------------------------------------------- |
| 服务对象      | 小写模块名                               | `export const db`                                     |
| 函数接口      | `{Module}Functions`                      | `ReldbFunctions`、`PaymentFunctions`                  |
| 子操作接口    | `{Domain}Operations`                     | `KvOperations`、`DeviceOperations`                    |
| 错误码对象    | `{Module}ErrorCode` UPPER_SNAKE          | `ReldbErrorCode.NOT_INITIALIZED`                      |
| 错误HTTP映射  | `{Module}ErrorHttpStatus`                | `IamErrorHttpStatus`、`ReldbErrorHttpStatus`          |
| 错误类型      | `{Module}Error`                          | `StorageError`、`IamError`                            |
| 配置 Schema   | `{Module}ConfigSchema`                   | `StorageConfigSchema`                                 |
| 配置类型      | `{Module}Config` / `{Module}ConfigInput` | `DbConfig` / `DbConfigInput`                          |
| Provider 接口 | `{Module}Provider`                       | `ReldbProvider`、`CacheProvider`                      |
| Provider 工厂 | `create{Impl}Provider`                   | `createSqliteProvider()`                              |
| Repository 类 | `{Module}{Entity}Repository`             | `AuditLogRepository`、`SchedulerTaskRepository`       |
| i18n 获取器   | `{缩写}M`                                | `reldbM()`、`storageM()`                              |
| 日志          | `core.logger.child(...)`                 | `core.logger.child({ module: 'iam', scope: 'auth' })` |
| 消息键        | `{module}_{camelCase}`                   | `storage_notInitialized`、`db_initFailed`             |
| 请求体        | `{Domain}Req`                            | `LoginReq`、`CreateUserReq`                           |
| 响应体        | `{Domain}Resp`                           | `LoginResp`、`ListUsersResp`                          |
| 端点对象      | `{module}Endpoints`                      | `storageEndpoints`、`iamEndpoints`                    |

### 3.3 命名三问（每次命名前自问）

1. 看名字能知道它是做什么的吗？
2. 会和项目中其他名字混淆吗？
3. 6 个月后还能理解这个名字的含义吗？

### 3.4 表名与缓存 key 命名（强制）

- 关系表名必须使用：`hai_<module>_<feature>`（全小写 `snake_case`）
  - 示例：`hai_iam_users`、`hai_scheduler_tasks`
- 缓存 key 必须使用：`hai:<module>:<feature>`（全小写 + `:` 分隔）
  - 示例：`hai:iam:user:123`、`hai:scheduler:task:job-1`
- 表名与缓存 key 常量必须**贴近使用处定义**（Repository / functions 文件内）
- 表名与缓存 key **不支持配置化**（禁止 `config.tableName`、`config.keyPrefix`）

---

## §4 错误码与配置

### 4.1 错误码规范

- 每个模块分配一个**独占千位段**，禁止与已分配段重叠
- `NOT_INITIALIZED` 固定为 `X010`（模块段 + 010）
- 按类别分段：通用 X000-X009、初始化 X010-X019、业务操作 X020+
- 新模块必须在下表中选取未被占用的段位

**已分配的错误码段位注册表**：

| 段位        | 模块       | 说明                    |
| ----------- | ---------- | ----------------------- |
| 1000-1199   | core       | 通用错误 + 配置错误     |
| 1200-1299   | api-client | HTTP 客户端             |
| 2000-2099   | crypto     | 加密/签名/哈希          |
| 3000-3499   | reldb      | 关系数据库              |
| 3500-3999   | vecdb      | 向量数据库              |
| 4000-4999   | cache      | 缓存                    |
| 5000-5999   | iam        | 身份认证与授权          |
| 6000-6999   | storage    | 对象存储                |
| 7000-7999   | payment    | 支付                    |
| 8000-8099   | capacitor  | 移动端原生能力          |
| 8100-8199   | reach      | 消息触达（短信/邮件等） |
| 8500-8599   | datapipe   | 数据管道（纯函数）      |
| 9000-9099   | deploy     | 部署与资源配置          |
| 10000-10999 | audit      | 审计日志                |
| 11000-11999 | scheduler  | 定时任务调度            |
| 12000-12999 | ai         | AI / LLM / RAG / MCP    |
| 13000+      | —          | 预留给未来模块          |

### 4.2 配置 Schema

- 多 Provider 使用 `z.discriminatedUnion('type', [...])`
- 导出 `XxConfig`（parse 后类型）和 `XxConfigInput`（用户输入类型）
- Schema 验证消息使用 i18n

**`xx-config.ts` 模板**：

```ts
// ⚠️ 示例 — 替换 Xx 为实际模块名，按需调整错误码段和配置字段

import { z } from 'zod'
import { xxM } from './xx-i18n.js'

// ─── 错误码 ───

export const XxErrorCode = {
  CONNECTION_FAILED: 6000,
  OPERATION_FAILED: 6001,
  NOT_INITIALIZED: 6010,
  UNSUPPORTED_TYPE: 6011,
  CONFIG_ERROR: 6012,
} as const

export type XxErrorCodeType = (typeof XxErrorCode)[keyof typeof XxErrorCode]

// ─── 错误码 → HTTP 状态码映射 ───

export const XxErrorHttpStatus: Record<number, number> = {
  [XxErrorCode.CONNECTION_FAILED]: 500,
  [XxErrorCode.OPERATION_FAILED]: 500,
  [XxErrorCode.NOT_INITIALIZED]: 500,
  [XxErrorCode.UNSUPPORTED_TYPE]: 400,
  [XxErrorCode.CONFIG_ERROR]: 500,
}

// ─── 配置 Schema ───

export const TypeAConfigSchema = z.object({
  type: z.literal('typeA'),
  host: z.string().min(1, xxM('xx_config_hostRequired')),
  port: z.number().int().default(8080),
})

export const TypeBConfigSchema = z.object({
  type: z.literal('typeB'),
  path: z.string().min(1, xxM('xx_config_pathRequired')),
})

export const XxConfigSchema = z.discriminatedUnion('type', [
  TypeAConfigSchema,
  TypeBConfigSchema,
])

export type XxConfig = z.infer<typeof XxConfigSchema>
export type XxConfigInput = z.input<typeof XxConfigSchema>
```

---

## §5 类型定义

### 5.1 `xx-types.ts` 结构

**职责**：

- 定义 `XxError`（模块错误接口）
- 定义 `XxFunctions`（模块函数接口，必须包含 `init` / `close` / `config` / `isInitialized`）
- 无子功能 + 需多后端时：定义 `XxProvider`（见 §1 决策表）
- 有子功能时：re-export 子功能类型

**规范**：

- 对外类型集中于此文件
- 操作返回值统一用 `Result<T, XxError>`
- 只 export 使用方直接需要的类型，内部辅助类型不导出
- Provider 接口是内部实现，禁止暴露给模块消费者

**模板**：

```ts
// ⚠️ 示例 — 替换类型名和字段，按模块实际需求增删接口

import type { Result } from '@h-ai/core'
import type { XxConfig, XxConfigInput, XxErrorCodeType } from './xx-config.js'

// ─── 错误类型 ───

export interface XxError {
  code: XxErrorCodeType
  message: string
  cause?: unknown
}

// ─── 操作接口（按业务需求定义） ───

export interface ZzOperations {
  create: (data: CreateInput) => Promise<Result<Item, XxError>>
  get: (id: string) => Promise<Result<Item | null, XxError>>
  remove: (id: string) => Promise<Result<void, XxError>>
}

// ─── 函数接口 ───

export interface XxFunctions {
  init: (config: XxConfigInput) => Promise<Result<void, XxError>>
  close: () => Promise<void>
  readonly config: XxConfig | null
  readonly isInitialized: boolean
  readonly zz: ZzOperations
}

// ─── Provider 接口（仅无子功能 + 需多后端时定义） ───

export interface XxProvider {
  readonly name: string
  connect: (config: XxConfig) => Promise<Result<void, XxError>>
  close: () => Promise<void>
  isConnected: () => boolean
  readonly zz: ZzOperations
}

// ─── 子功能类型 re-export（有子功能时） ───
// export type { XxYyFunctions, YyItem } from './yy/xx-yy-types.js'
```

### 5.2 最小暴露原则

- 返回使用方关心的业务类型，不暴露 DB 行结构 / ORM 对象 / 内部中间态
- 需要返回部分字段时，定义专用类型（如 `XxSummary`），不使用 `Partial<XxInternal>`
- 分页结果统一使用 `PageResult<T>` 包装
- 模块消费者需要的上游类型，在模块自身 re-export，不要求消费者 import 上游包

---

## §6 入口与生命周期

### 6.1 `xx-main.ts` 规范

**职责**：管理运行时状态、实现生命周期（`init` / `close`）、通过 `get` 访问器暴露操作或子功能。

- 唯一导出 `export const xx: XxFunctions`
- `init` 流程：并发防护 → 关闭旧实例 → Zod 校验 → 创建功能实例 → 保存状态 → 释放防护标志
- `close` 流程：关闭连接/子功能 → 置空
- `get` 访问器：`currentXxx ?? notInitializedXxx`
- return 语句不含复杂逻辑
- **并发初始化防护**：`init()` 必须使用 `initInProgress` 标志防止并发调用。在 `init` 入口检查标志，`try/finally` 中释放。并发调用时返回 `OPERATION_FAILED` 错误。
- **❌ 禁止在 main.ts 中编写具体业务逻辑**

### 6.2 NotInitializedKit 安全访问模式

使用 `core.module.createNotInitializedKit<E>()` 创建一组工具：

```ts
const notInitialized = core.module.createNotInitializedKit<XxError>(
  XxErrorCode.NOT_INITIALIZED,
  () => xxM('xx_notInitialized'),
)
```

**返回的工具集**：

| 方法                              | 说明                                                                  | 返回值               |
| --------------------------------- | --------------------------------------------------------------------- | -------------------- |
| `notInitialized.error()`          | 创建未初始化错误对象                                                  | `XxError`            |
| `notInitialized.result<T>()`      | 创建包含未初始化错误的失败 Result                                     | `Result<T, XxError>` |
| `notInitialized.proxy<T>()`       | 创建 Proxy 代理（默认 async），拦截所有方法调用返回 `Promise<Result>` | `T`                  |
| `notInitialized.proxy<T>('sync')` | 创建同步 Proxy 代理，所有方法返回 `Result`                            | `T`                  |

**使用要点**：

- 所有 `get` 访问器必须使用此模式，**禁止裸返回 `null` / `undefined`**
- Proxy 对象在模块顶层创建（模块加载时），而非每次 `get` 调用时创建
- `close()` 后状态回到未初始化，访问器自动切换回 Proxy 占位

### 6.3 Getter 模式——三种状态管理变体

```ts
// ─── 变体 A：Provider 引用（有 Provider 时） ───
const currentProvider: XxProvider | null = null
const notInitializedZz = notInitialized.proxy<ZzOperations>()
const storage = {
  get zz(): ZzOperations { return currentProvider?.zz ?? notInitializedZz },
}

// ─── 变体 B：操作实例引用（有子功能工厂时） ───
const currentYy: XxYyFunctions | null = null
const notInitializedYy = notInitialized.proxy<XxYyFunctions>()
const iam = {
  get yy(): XxYyFunctions { return currentYy ?? notInitializedYy },
}

// ─── 变体 C：布尔标志（操作是静态对象时） ───
const initialized = false
const deviceOps: DeviceOperations = { getInfo, getAppVersion }
const notInitializedDevice = notInitialized.proxy<DeviceOperations>()
const capacitor = {
  get device(): DeviceOperations { return initialized ? deviceOps : notInitializedDevice },
}
```

### 6.4 三种 main.ts 模板

#### 示例 1：无子功能 + 无 Provider

```ts
// ⚠️ 示例 — 最简模式，功能由 functions.ts 直接实现

import type { Result } from '@h-ai/core'
import type { XxConfig, XxConfigInput } from './xx-config.js'
import type { XxError, XxFunctions, ZzOperations } from './xx-types.js'
import { core, err, ok } from '@h-ai/core'
import { XxConfigSchema, XxErrorCode } from './xx-config.js'
import { createXxFunctions } from './xx-functions.js'
import { xxM } from './xx-i18n.js'

const logger = core.logger.child({ module: 'xx', scope: 'main' })

let currentConfig: XxConfig | null = null
let currentZz: ZzOperations | null = null
let initInProgress = false

const notInitialized = core.module.createNotInitializedKit<XxError>(
  XxErrorCode.NOT_INITIALIZED,
  () => xxM('xx_notInitialized'),
)
const notInitializedZz = notInitialized.proxy<ZzOperations>()

export const xx: XxFunctions = {
  async init(config: XxConfigInput): Promise<Result<void, XxError>> {
    if (initInProgress) {
      logger.warn('Xx init already in progress, skipping concurrent call')
      return err({ code: XxErrorCode.OPERATION_FAILED, message: xxM('xx_operationFailed', { params: { error: 'Concurrent initialization detected' } }) })
    }
    initInProgress = true
    try {
      if (currentConfig) {
        logger.warn('Xx module is already initialized, reinitializing')
        await xx.close()
      }
      logger.info('Initializing xx module')
      const parsed = XxConfigSchema.parse(config)
      currentZz = createXxFunctions({ config: parsed })
      currentConfig = parsed
      logger.info('Xx module initialized')
      return ok(undefined)
    }
    catch (error) {
      logger.error('Xx module initialization failed', { error })
      return err({
        code: XxErrorCode.CONFIG_ERROR,
        message: xxM('xx_initFailed', {
          params: { error: error instanceof Error ? error.message : String(error) },
        }),
        cause: error,
      })
    }
    finally {
      initInProgress = false
    }
  },

  get zz(): ZzOperations { return currentZz ?? notInitializedZz },
  get config() { return currentConfig },
  get isInitialized() { return currentConfig !== null },

  async close() {
    if (!currentConfig) return
    logger.info('Closing xx module')
    currentZz = null
    currentConfig = null
    logger.info('Xx module closed')
  },
}
```

#### 示例 2：无子功能 + 有 Provider

```ts
// ⚠️ 示例 — Provider 在模块级管理，按 config.type 选择后端实现

import type { Result } from '@h-ai/core'
import type { XxConfig, XxConfigInput } from './xx-config.js'
import type { XxError, XxFunctions, XxProvider, ZzOperations } from './xx-types.js'
import { core, err, ok } from '@h-ai/core'
import { createTypeAProvider } from './providers/xx-provider-typeA.js'
import { createTypeBProvider } from './providers/xx-provider-typeB.js'
import { XxConfigSchema, XxErrorCode } from './xx-config.js'
import { xxM } from './xx-i18n.js'

const logger = core.logger.child({ module: 'xx', scope: 'main' })

let currentProvider: XxProvider | null = null
let currentConfig: XxConfig | null = null
let initInProgress = false

function createProvider(config: XxConfig): XxProvider {
  switch (config.type) {
    case 'typeA': return createTypeAProvider()
    case 'typeB': return createTypeBProvider()
    default:
      throw new Error(xxM('xx_unsupportedType', { params: { type: config.type } }))
  }
}

const notInitialized = core.module.createNotInitializedKit<XxError>(
  XxErrorCode.NOT_INITIALIZED,
  () => xxM('xx_notInitialized'),
)
const notInitializedZz = notInitialized.proxy<ZzOperations>()

export const xx: XxFunctions = {
  async init(config: XxConfigInput): Promise<Result<void, XxError>> {
    if (initInProgress) {
      logger.warn('Xx init already in progress, skipping concurrent call')
      return err({ code: XxErrorCode.OPERATION_FAILED, message: xxM('xx_operationFailed', { params: { error: 'Concurrent initialization detected' } }) })
    }
    initInProgress = true
    try {
      if (currentProvider) {
        logger.warn('Xx module is already initialized, reinitializing')
        await xx.close()
      }
      logger.info('Initializing xx module')
      const parsed = XxConfigSchema.parse(config)
      const provider = createProvider(parsed)
      const connectResult = await provider.connect(parsed)
      if (!connectResult.success) {
        logger.error('Xx module initialization failed', { code: connectResult.error.code, message: connectResult.error.message })
        return connectResult
      }
      currentProvider = provider
      currentConfig = parsed
      logger.info('Xx module initialized', { type: parsed.type })
      return ok(undefined)
    }
    catch (error) {
      logger.error('Xx module initialization failed', { error })
      return err({
        code: XxErrorCode.CONNECTION_FAILED,
        message: xxM('xx_initFailed', {
          params: { error: error instanceof Error ? error.message : String(error) },
        }),
        cause: error,
      })
    }
    finally {
      initInProgress = false
    }
  },

  get zz(): ZzOperations { return currentProvider?.zz ?? notInitializedZz },
  get config() { return currentConfig },
  get isInitialized() { return currentProvider !== null },

  async close() {
    if (!currentProvider) { 
      currentConfig = null
      return
    }
    logger.info('Closing xx module')
    try { 
      await currentProvider.close()
      logger.info('Xx module closed')
    }
    catch (error) { 
      logger.error('Xx module close failed', { error })
    }
    finally { currentProvider = null; currentConfig = null }
  }
}
```

#### 示例 3：有子功能

```ts
// ⚠️ 示例 — main.ts 只创建和组装子功能，不关心子功能是否内部使用 Provider

import type { Result } from '@h-ai/core'
import type { XxConfig, XxConfigInput } from './xx-config.js'
import type { XxError, XxFunctions } from './xx-types.js'
import type { XxYyFunctions } from './yy/xx-yy-types.js'
import type { XxZzFunctions } from './zz/xx-zz-types.js'
import { core, err, ok } from '@h-ai/core'
import { XxConfigSchema, XxErrorCode } from './xx-config.js'
import { xxM } from './xx-i18n.js'
import { createXxYyFunctions } from './yy/xx-yy-functions.js'
import { createXxZzFunctions } from './zz/xx-zz-functions.js'

const logger = core.logger.child({ module: 'xx', scope: 'main' })

let currentConfig: XxConfig | null = null
let currentYy: XxYyFunctions | null = null
let currentZz: XxZzFunctions | null = null
let initInProgress = false

const notInitialized = core.module.createNotInitializedKit<XxError>(
  XxErrorCode.NOT_INITIALIZED,
  () => xxM('xx_notInitialized'),
)
const notInitializedYy = notInitialized.proxy<XxYyFunctions>()
const notInitializedZz = notInitialized.proxy<XxZzFunctions>()

export const xx: XxFunctions = {
  async init(config: XxConfigInput): Promise<Result<void, XxError>> {
    if (initInProgress) {
      logger.warn('Xx init already in progress, skipping concurrent call')
      return err({ code: XxErrorCode.OPERATION_FAILED, message: xxM('xx_operationFailed', { params: { error: 'Concurrent initialization detected' } }) })
    }
    initInProgress = true
    try {
      if (currentConfig) {
        logger.warn('Xx module is already initialized, reinitializing')
        await xx.close()
      }
      logger.info('Initializing xx module')
      const parsed = XxConfigSchema.parse(config)
      const yyResult = await createXxYyFunctions({ config: parsed })
      if (!yyResult.success) {
        logger.error('Xx module initialization failed', { code: yyResult.error.code, message: yyResult.error.message })
        return yyResult
      }
      currentYy = yyResult.data
      currentZz = createXxZzFunctions({ config: parsed })
      currentConfig = parsed
      logger.info('Xx module initialized')
      return ok(undefined)
    }
    catch (error) {
      logger.error('Xx module initialization failed', { error })
      return err({
        code: XxErrorCode.CONFIG_ERROR,
        message: xxM('xx_initFailed', {
          params: { error: error instanceof Error ? error.message : String(error) },
        }),
        cause: error,
      })
    }
    finally {
      initInProgress = false
    }
  },

  get yy(): XxYyFunctions { return currentYy ?? notInitializedYy },
  get zz(): XxZzFunctions { return currentZz ?? notInitializedZz },
  get config() { return currentConfig },
  get isInitialized() { return currentConfig !== null },

  async close() {
    if (!currentConfig) return
    logger.info('Closing xx module')
    await currentYy?.close?.()
    currentYy = null
    currentZz = null
    currentConfig = null
    logger.info('Xx module closed')
  },
}
```

### 6.5 `index.ts` — 入口聚合

纯 re-export，不含逻辑。只使用 `export *`。

```ts
export * from './xx-main.js'
export * from './xx-types.js'
```

---

## §7 业务实现

### 7.1 `xx-functions.ts` 工厂函数

工厂函数接收依赖，返回操作接口。所有业务逻辑在此实现。

```ts
// ⚠️ 示例 — 无 Provider 的工厂函数

import type { XxError } from '../xx-types.js'
import type { CreateYyInput, XxYyFunctions, XxYyFunctionsDeps } from './xx-yy-types.js'
import { core, err, ok } from '@h-ai/core'
import { XxErrorCode } from '../xx-config.js'
import { xxM } from '../xx-i18n.js'

const logger = core.logger.child({ module: 'xx', scope: 'yy' })

export function createXxYyFunctions(deps: XxYyFunctionsDeps): XxYyFunctions {
  const { config } = deps
  return {
    async create(input: CreateYyInput) {
      logger.debug('Creating yy item', { name: input.name })
      if (!input.name) {
        return err({ code: XxErrorCode.VALIDATION_ERROR, message: xxM('xx_yy_nameRequired') })
      }
      try {
        const item = await doCreate(input)
        return ok(item)
      }
      catch (error) {
        return err({ code: XxErrorCode.OPERATION_FAILED, message: xxM('xx_yy_createFailed'), cause: error })
      }
    },
    // ...
  }
}
```

### 7.2 Provider 模式

Provider 用**工厂 + 闭包**实现，不用 class。

- 模块级 Provider：`src/providers/xx-provider-aaa.ts`，实现 `XxProvider`
- 子功能级 Provider：`src/yy/providers/xx-yy-provider-aaa.ts`，实现 `XxYyProvider`
- 统一的 `toXxError()` 辅助函数包装异常
- 外部依赖通过 `createRequire` 动态加载

### 7.3 子功能类型 `xx-yy-types.ts`

定义子功能对外接口（`XxYyFunctions`）、依赖接口（`XxYyFunctionsDeps`）、业务实体类型。

模块根 `xx-types.ts` 必须 re-export 子功能类型：

```ts
export type { CreateYyInput, XxYyFunctions, YyItem } from './yy/xx-yy-types.js'
```

### 7.4 `xx-i18n.ts` — 固定模式

```ts
import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

type XxMessageKey = keyof typeof messagesZhCN
export const xxM = core.i18n.createMessageGetter<XxMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
```

### 7.5 API 契约层（可选）

当模块需要对外暴露 HTTP API 时，创建 `src/api/` 子目录：

- `xx-api-schemas.ts`：Zod Schema（入参/出参/实体）
- `xx-api-contract.ts`：端点定义（`xxEndpoints`）
- `api/index.ts`：聚合导出

端到端契约流：

```
┌─────────── @h-ai/xx/api ────────────┐
│  Schema（唯一真相源）+ Endpoints    │
└────────┬─────────────────┬──────────┘
  客户端 api.call(ep, i)   服务端 kit.fromContract
```

### 7.6 Repository 数据仓库（可选）

- **继承 `BaseReldbCrudRepository<T>`**
- 类名为 `{Module}{Entity}Repository`
- 文件位置：单一放模块根，子功能内放子功能目录，≥3 个时用 `repositories/` 集中
- 表名常量在 Repository 文件内就近定义，命名为 `hai_<module>_<feature>`
- 禁止在 main.ts、全局 constants、配置文件中定义并传递表名

> **Provider 用工厂 + 闭包，Repository 用 class + 继承**——两者职责不同。

### 7.7 `client/xx-client.ts` — 浏览器端客户端

- 工厂函数 `createXxClient(config)` 创建
- 零 Node.js 依赖
- 使用 `fetch` API
- 支持 `getAccessToken` 回调和 `onAuthError` 回调

---

## §8 国际化

### 8.1 messages 目录

```jsonc
// messages/zh-CN.json — 键名前缀统一为 xx_
{
  "xx_notInitialized": "XX 模块尚未初始化，请先调用 xx.init()",
  "xx_initFailed": "XX 模块初始化失败：{error}",
  "xx_unsupportedType": "不支持的类型：{type}"
}
```

### 8.2 规则

- 日志消息英文，代码注释中文
- 用户可见文本必须 i18n key
- 消息键格式：`{module}_{camelCase}`

### 8.3 日志脱敏

当日志上下文中可能包含敏感信息（URL 中的认证信息、连接字符串中的密码、配置对象中的 apiKey / token / password 等），**必须**先通过 `sanitize*` 辅助函数脱敏后再输出，禁止将原始值直接传入 logger。

脱敏规则：
- URL 类：用 `URL` 对象解析，将 `username` / `password` 替换为 `***`，解析失败返回 `'(invalid url)'`
- 配置对象类：输出前剥离或遮蔽 `password` / `token` / `apiKey` / `secret` 等字段
- 函数命名：`sanitize{Subject}`，放在使用它的 Provider / functions 文件顶部

参考实现（cache 模块 `sanitizeRedisUrl`）：

```ts
/** 剥离 URL 中的认证信息，避免密码泄露到日志 */
function sanitizeRedisUrl(url: string): string {
  try {
    const u = new URL(url)
    if (u.password) u.password = '***'
    if (u.username) u.username = '***'
    return u.toString()
  } catch {
    return '(invalid url)'
  }
}

// 日志中使用脱敏后的地址
logger.info('Redis connected', { address: sanitizeRedisUrl(config.url) })
```

---

## §9 注释规范

### 9.1 公共 API JSDoc

所有公共导出 API（入口模块、类型、配置、工具函数）必须 JSDoc 注释，且**必须包含 `@example`**：

```ts
/**
 * 创建存储客户端
 *
 * 根据配置初始化对应后端（S3/OSS/本地），建立连接并验证凭据。
 *
 * @param config - 存储配置（包含 type、bucket、credentials 等）
 * @returns 成功返回 StorageClient 实例；失败返回含错误码的 Result
 *
 * @example
 * ```ts
 * const result = await storage.init({ type: 's3', bucket: 'my-bucket' })
 * if (result.ok) {
 *   // 使用 storage 客户端
 * }
 * ```
 */
```

#### `@example` 规则

- 公共 API JSDoc **必须**包含 `@example`，因为它是使用方最直观的上手资料
- 示例代码使用 ` ```ts ` 围栏，内容必须是可执行的代码片段（非伪代码）
- 示例应展示最常见的调用方式，包含必要的错误处理（Result 判断）
- 若 API 有多种典型用法，可用多个 `@example` 或在一个示例中展示
- 内部函数的 `@example` 为可选，但复杂逻辑（序列化、状态机、多步骟操作）建议补充

### 9.2 内部函数

内部函数（工厂方法、辅助函数、校验函数）也应补 JSDoc，重点说明：

- 参数含义与取值范围
- 返回值结构与失败分支
- 重要边界条件（空值、格式校验、异常分支）

### 9.3 类型/接口注释

- 类型/接口用一句话说明用途
- 字段逐条说明含义
- 关键步骤或限制说明

### 9.4 代码分隔线

模块 section 用注释分隔线：`// ─── 内部状态 ────`

### 9.5 语言规则

- 代码注释统一中文
- 日志消息统一英文

---

## §10 测试规范

### 10.1 文件拆分

按功能拆分测试文件：`<模块名>-init.test.ts`、`<模块名>-sm2.test.ts`。

### 10.2 统一入口原则

测试通过 `<模块名>.xx` 进入（如 `crypto.sm2`、`storage.file`），不直接调用内部实现或工厂函数。

### 10.3 覆盖范围

- **正常路径**：核心功能可用
- **边界路径**：非法输入、空值、格式校验失败
- **参数选项**：可选配置的差异化行为
- **多实现**：如有多种实现，先抽象公共测试套件再分别执行

### 10.4 断言风格

- 始终校验 `Result.success`
- 成功时检查返回数据，失败时校验 `error.code`
- 不使用 `try/catch` 来断言 Result 型 API

### 10.5 从实际场景出发

验证实际使用时的行为和结果，不做形式覆盖。测试不通过时先审查业务逻辑是否有问题。

### 10.6 容器化

如有外部依赖（数据库、缓存等），优先使用 Testcontainers 隔离环境。

---

## §11 包配置

### 11.1 `package.json`

**单入口**：

```jsonc
{
  "name": "@h-ai/xx",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "test": "vitest run",
    "test:watch": "vitest watch"
  },
  "dependencies": {
    "@h-ai/core": "workspace:*",
    "zod": "catalog:"
  },
  "devDependencies": {
    "tsup": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

**双入口 + API 契约**（追加 exports）：

```jsonc
{
  "exports": {
    ".": { "types": "...", "browser": "...", "import": "...", "default": "..." },
    "./client": { "types": "...", "import": "..." },
    "./api": { "types": "./dist/api/index.d.ts", "import": "./dist/api/index.js" }
  }
}
```

### 11.2 `tsconfig.json`

```jsonc
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "rootDir": ".", "outDir": "./dist" },
  "include": ["src/**/*", "messages/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### 11.3 `tsup.config.ts`

```ts
import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: { index: 'src/index.ts' },
  external: ['@h-ai/core', 'zod'],
})
```

### 11.4 `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config'
import { baseVitestConfig } from '../vitest.base'

export default defineConfig({ ...baseVitestConfig })
```

---

## §12 文档

### 12.1 `README.md`（面向人类）

> 让开发者 **30 秒搞清楚模块能做什么、3 分钟跑通第一个示例**。

**固定结构**：

```text
# @h-ai/xx
一句话描述 + 核心价值。

## 支持的 xxx                  ← 能力概览
## 快速开始                    ← init → 核心操作 → close
  ### Node.js 服务端           ← 条件
  ### 浏览器客户端             ← 条件
## API 契约                    ← 条件：有 src/api/
## API 概览                    ← 条件：子操作较多
## 配置
## 错误处理
## 测试
## License
```

**禁止事项**：

- ❌ 贴完整类型定义
- ❌ 列完整 API 表格（那是 Skill 模板的职责）
- ❌ 写内部实现原理
- ❌ 代码示例中出现 `console.log`

### 12.2 Skill 模板（面向 AI）

统一管理在 `packages/cli/templates/skills/hai-<模块名>/SKILL.md`，通过 CLI 分发。

必须包含：YAML frontmatter、模块概述、使用步骤、核心 API、错误码、常见模式、相关 Skills。

---

## §13 代码统一规范

### 13.1 return 语句

return 只返回已计算的值。禁止内嵌条件判断、循环、多级调用链。

### 13.2 错误处理

公共 API 不 throw，返回 `Result<T, XxError>`。允许 throw 的合规场景：

| 场景                                 | 说明                                  |
| ------------------------------------ | ------------------------------------- |
| 内部 throw + 外层 try-catch → Result | 标准 catch-and-wrap 模式              |
| SvelteKit 控制流                     | `throw redirect()`、`throw error()`   |
| 浏览器端 Client 代码                 | `client/xx-client.ts`，非模块公共 API |
| CLI 命令                             | `packages/cli/`，非模块 API           |
| `getOrThrow()` 等显式命名            | 函数名已表达 throw 语义               |
| async generator（如 `chatStream()`） | 无法返回 Result，需在 JSDoc 中注明    |

### 13.3 提前返回

使用 Early Return 减少嵌套，禁止超过 2 层 if 嵌套。

### 13.4 函数体量

单个函数 ≤ **120 行**（不含注释和空行）。

### 13.5 参数设计

公共 API 参数 ≤ 3 个；超过合并为配置对象。聚合依赖为接口，避免散乱回调参数。

### 13.6 import 顺序

```ts
// 1. type-only imports（第三方）
// 2. type-only imports（内部）
// 3. value imports（第三方）
// 4. value imports（内部）
```

### 13.7 日志输出规范

| 级别    | 场景                                                 |
| ------- | ---------------------------------------------------- |
| `trace` | 循环体内、变量快照、详细执行路径                     |
| `debug` | 函数进入、中间状态、参数概要                         |
| `info`  | 业务里程碑事件（初始化完成、连接就绪、关键操作成功） |
| `warn`  | 异常但可恢复（重试、降级、校验失败）                 |
| `error` | 操作失败且需人工排查                                 |
| `fatal` | 致命错误、服务无法继续                               |

日志实例创建：`core.logger.child({ module: 'xx', scope: 'yy' })`

### 13.8 分布式友好

- 禁止模块级 Map/Set 缓存需跨节点一致的业务数据
- 允许缓存：SDK client 实例、不可变配置、连接池
- DB 是唯一数据源

### 13.9 禁止清单

- ❌ `any` — 用 `unknown` + 缩窄
- ❌ `console.log` — 用 `core.logger`
- ❌ 硬编码字符串 — 用 `xxM('key')`
- ❌ 硬编码密钥 — 用环境变量
- ❌ `index.ts` 写逻辑 — 仅 `export *`
- ❌ `main.ts` 写业务逻辑
- ❌ class 实现 Provider — 工厂 + 闭包
- ❌ return 嵌套复杂逻辑
- ❌ 超过 2 层 if 嵌套
- ❌ 重新包装上游 Result 错误
- ❌ 公共 API 中 `throw`（合规场景除外）
- ❌ 错误码段位冲突
- ❌ 同一模块混用两种 API 风格

---

## §14 创建检查清单

- [ ] 确定模块类型（§1：生命周期单例 / 纯函数 / 基础设施）
- [ ] 确定模块名、API 风格（§1：扁平 vs 子操作）
- [ ] 分配错误码段位（§4 注册表），确认不冲突
- [ ] 完成架构决策（§1：子功能 / Provider）
- [ ] 创建目录结构（§2）
- [ ] `xx-config.ts`（§4：错误码 + Zod Schema）
- [ ] `messages/zh-CN.json` + `messages/en-US.json`（§8）
- [ ] `xx-i18n.ts`（§7.4）
- [ ] `xx-types.ts`（§5）
- [ ] 子功能 types + functions（§7：如有）
- [ ] Provider 实现（§7.2：如需）
- [ ] Repository 实现（§7.6：如需）
- [ ] `xx-main.ts`（§6）
- [ ] `index.ts`（§6.5）
- [ ] Client（§7.7：如有）
- [ ] API 契约（§7.5：如有）
- [ ] 注释（§9：公共 API JSDoc）
- [ ] 测试（§10）
- [ ] 包配置（§11）
- [ ] README（§12.1）
- [ ] Skill 模板（§12.2）
- [ ] 命名一致性（§3）
- [ ] 表名符合 `hai_<module>_<feature>`（§3.4）
- [ ] 缓存 key 符合 `hai:<module>:<feature>`（§3.4）
- [ ] 表名/缓存 key 就近定义且不可配置（§3.4）
- [ ] `pnpm typecheck` → `pnpm lint` → `pnpm test`

---

## 示例触发语句

- "创建一个 @h-ai/notification 模块，支持 email 和 sms 两种 Provider"
- "给 iam 模块新增一个 oauth 子功能"
- "给 storage 模块新增一个 oss Provider"
- "创建一个新模块，包含浏览器端客户端"
