---
name: hai-create
description: 在 hai-framework 中创建新模块（package），包含目录结构、配置、类型、i18n、服务入口、Provider、Client 等脚手架代码。适用于新建模块、添加子功能、扩展 Provider 等场景。
---

# hai-create — 模块创建规范

> 面向 AI 助手的模块创建指南。所有新模块必须遵循本规范。
>
> **变量约定**：`xx` = 模块名（如 storage、iam），`yy` / `zz` = 子功能名（如 authn、rbac），`aaa` = Provider 实现名（如 mysql、redis）。
>
> **代码块说明**：本文所有代码块均为**结构示例**，展示文件骨架与编码模式。生成实际代码时，必须根据需求替换名称、字段和业务逻辑，**不可照搬示例中的占位名称和伪逻辑**。

---

## 1. 目录结构

### 1.1 基础模块（无子功能）

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
    xx-repository-zz.ts   # 数据仓库——zz=实体名（可选，见 §3.7.4）
    providers/             # Provider 实现目录（可选，仅需多后端时）
      xx-provider-aaa.ts   # Provider 实现——aaa=实现名
    repositories/          # 多 Repository 集中目录（可选，≥3 个时用）
      xx-zz-repository.ts  # 每个实体一个文件
  tests/
```

### 1.2 有子功能的模块

子功能用独立目录，目录内**不需要 index.ts**。

```
packages/xx/
  ...                      # 同 §1.1 基础文件
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

### 1.3 带 Client 的模块（前后端分离）

在 §1.1 或 §1.2 基础上增加：

```
packages/xx/
  src/
    index.ts              # Node 入口
    xx-index.browser.ts   # Browser 入口（仅 client + types）
    client/
      index.ts
      xx-client.ts        # 浏览器端 HTTP 客户端
```

### 1.4 带 API 契约的模块（对外提供 HTTP 端点）

如果模块需要对外暴露 HTTP API（如 storage、iam、ai、payment），则在 §1.1/§1.2/§1.3 基础上增加 `api/` 子目录：

```
packages/xx/
  src/
    api/                        # API 契约子模块（客户端/服务端共享）
      index.ts                  # export * 聚合
      xx-api-schemas.ts         # Zod Schema（入参/出参/实体）
      xx-api-contract.ts        # 端点定义（xxEndpoints）
```

对应 `package.json` 需声明 `./api` 子路径导出（见 §5.1）；`tsup.config.ts` 需增加 `api/index` 入口（见 §5.3）。

---

## 2. 架构决策

创建模块前，依次回答以下问题，确定模块架构。

### 前置：模块类型

确定模块属于以下哪种类型，后续所有决策基于此分类：

| 类型             | 特征                                          | 代表模块                                                                                                       |
| ---------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **生命周期单例** | `export const xx: XxFunctions`，有 init/close | reldb, storage, cache, ai, iam, payment, crypto, capacitor, vecdb, audit, scheduler, reach, deploy, api-client |
| **纯函数模块**   | 无状态，无 init/close，直接调用               | datapipe                                                                                                       |
| **基础设施模块** | 提供底层能力（日志、配置、i18n、Result 等）   | core                                                                                                           |

- 生命周期单例模块必须遵循 §3.4 的 init/close/getter 全套规范
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
| 无     | 无                 | 直接实现       | §3.4 示例 1 |
| 无     | 有（模块级）       | Provider 委托  | §3.4 示例 2 |
| 有     | 无或有（子功能级） | 工厂创建子功能 | §3.4 示例 3 |

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

## 3. 文件职责与代码模板

### 3.1 `xx-config.ts` — 错误码 + 配置 Schema

**职责**：定义模块错误码、Zod Schema、配置类型。不含业务逻辑。

**错误码规范**：

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

**配置 Schema 规范**：

- 多 Provider 使用 `z.discriminatedUnion('type', [...])`
- 导出 `XxConfig`（parse 后类型）和 `XxConfigInput`（用户输入类型）
- Schema 验证消息使用 i18n

**示例**：

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

### 3.2 `xx-types.ts` — 公共类型定义

**职责**：

- 定义 `XxError`（模块错误接口）
- 定义 `XxFunctions`（模块函数接口，必须包含 `init` / `close` / `config` / `isInitialized`）
- 无子功能 + 需多后端时：定义 `XxProvider`（见 §2 决策表）
- 有子功能时：re-export 子功能类型

**规范**：

- 对外类型集中于此文件
- 操作返回值统一用 `Result<T, XxError>`

**示例**：

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
  // 无子功能时：直接声明操作接口
  readonly zz: ZzOperations
  // 有子功能时：声明子功能接口（从子功能 types re-export）
  // readonly yy: XxYyFunctions
}

// ─── Provider 接口（仅无子功能 + 需多后端时定义） ───
// 有子功能时，Provider 在子功能 types 中定义（见 §3.6）

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

### 3.3 `xx-i18n.ts` — i18n 消息获取器

固定模式，只需替换模块名。

**示例**：

```ts
// ⚠️ 示例 — 替换 Xx/xx 为实际模块名

import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

type XxMessageKey = keyof typeof messagesZhCN

export const xxM = core.i18n.createMessageGetter<XxMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
```

**messages 文件示例**（键名前缀统一为 `xx_`）：

```jsonc
// messages/zh-CN.json
{
  "xx_notInitialized": "XX 模块尚未初始化，请先调用 xx.init()",
  "xx_initFailed": "XX 模块初始化失败：{error}",
  "xx_unsupportedType": "不支持的类型：{type}"
}
```

```jsonc
// messages/en-US.json
{
  "xx_notInitialized": "XX module not initialized, call xx.init() first",
  "xx_initFailed": "XX module initialization failed: {error}",
  "xx_unsupportedType": "Unsupported type: {type}"
}
```

### 3.4 `xx-main.ts` — 服务对象主入口

**职责**：管理运行时状态、实现生命周期（`init` / `close`）、通过 `get` 访问器暴露操作或子功能。

**规范**：

- 唯一导出 `export const xx: XxFunctions`
- `init` 流程：关闭旧实例 → Zod 校验 → 创建功能实例 → 保存状态
- `close` 流程：关闭连接/子功能 → 置空
- `get` 访问器：`currentXxx ?? notInitializedXxx`
- return 语句不含复杂逻辑（见 §4.1）
- **❌ 禁止在 main.ts 中编写具体业务逻辑**（如调度循环、数据处理、任务执行等重操作）。所有具体逻辑必须委托给 `xx-functions.ts`、`xx-runner.ts` 或其他职责文件，main.ts 仅做 API 编排和委托调用。

#### NotInitializedKit 安全访问模式

> **核心问题**：模块在 `init()` 之前被调用时，`get` 访问器指向的操作实例尚未创建。直接返回 `null` 或 `undefined` 会导致运行时 crash，而手动在每个方法里判断初始化状态则过于冗余。
>
> **解决方案**：使用 `core.module.createNotInitializedKit<E>()` 创建一组工具，包含错误工厂、Result 工厂和 **Proxy 代理**。代理对象可作为任意操作接口的占位——当模块未初始化时，调用代理上的任何方法均会安全返回包含 `NOT_INITIALIZED` 错误的 `Result`，而非 crash。

**API 签名**：

```ts
const notInitialized = core.module.createNotInitializedKit<XxError>(
  XxErrorCode.NOT_INITIALIZED, // 固定使用模块的 NOT_INITIALIZED 错误码
  () => xxM('xx_notInitialized'), // 延迟求值 i18n 消息（确保运行时 locale 正确）
)
```

**返回的工具集**：

| 方法                              | 说明                                                                  | 返回值               |
| --------------------------------- | --------------------------------------------------------------------- | -------------------- |
| `notInitialized.error()`          | 创建未初始化错误对象                                                  | `XxError`            |
| `notInitialized.result<T>()`      | 创建包含未初始化错误的失败 Result                                     | `Result<T, XxError>` |
| `notInitialized.proxy<T>()`       | 创建 Proxy 代理（默认 async），拦截所有方法调用返回 `Promise<Result>` | `T`                  |
| `notInitialized.proxy<T>('sync')` | 创建同步 Proxy 代理，所有方法返回 `Result`                            | `T`                  |

**Getter 模式**——三种状态管理变体：

```ts
// ─── 变体 A：Provider 引用（有 Provider 时） ───
// 适用：storage、reldb、cache 等需多后端切换的模块
const currentProvider: XxProvider | null = null
const notInitializedZz = notInitialized.proxy<ZzOperations>()

const storage = {
  get zz(): ZzOperations { return currentProvider?.zz ?? notInitializedZz },
}

// ─── 变体 B：操作实例引用（有子功能工厂时） ───
// 适用：iam 等有子功能的模块，init 时创建操作实例
const currentYy: XxYyFunctions | null = null
const notInitializedYy = notInitialized.proxy<XxYyFunctions>()

const iam = {
  get yy(): XxYyFunctions { return currentYy ?? notInitializedYy },
}

// ─── 变体 C：布尔标志（无 Provider / 工厂，操作是静态对象时） ───
// 适用：capacitor 等运行时检测环境的模块，操作实现不需动态创建
const initialized = false
const deviceOps: DeviceOperations = { getInfo, getAppVersion }
const notInitializedDevice = notInitialized.proxy<DeviceOperations>()

const capacitor = {
  get device(): DeviceOperations { return initialized ? deviceOps : notInitializedDevice },
}
```

**使用要点**：

- 所有 `get` 访问器必须使用此模式，**禁止裸返回 `null` / `undefined`**
- Proxy 对象在模块顶层创建（模块加载时），而非每次 `get` 调用时创建
- 默认 `proxy<T>()` 为 async 模式（方法返回 `Promise<Result>`），仅当接口全部是同步方法时使用 `proxy<T>('sync')`
- `close()` 后状态回到未初始化，访问器自动切换回 Proxy 占位

根据 §2 决策表选择对应模式：

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

let currentConfig: XxConfig | null = null
let currentZz: ZzOperations | null = null

const notInitialized = core.module.createNotInitializedKit<XxError>(
  XxErrorCode.NOT_INITIALIZED,
  () => xxM('xx_notInitialized'),
)
const notInitializedZz = notInitialized.proxy<ZzOperations>()

export const xx: XxFunctions = {
  async init(config: XxConfigInput): Promise<Result<void, XxError>> {
    await xx.close()
    try {
      const parsed = XxConfigSchema.parse(config)
      currentZz = createXxFunctions({ config: parsed })
      currentConfig = parsed
      return ok(undefined)
    }
    catch (error) {
      return err({
        code: XxErrorCode.CONFIG_ERROR,
        message: xxM('xx_initFailed', {
          params: { error: error instanceof Error ? error.message : String(error) },
        }),
        cause: error,
      })
    }
  },

  get zz(): ZzOperations { return currentZz ?? notInitializedZz },
  get config() { return currentConfig },
  get isInitialized() { return currentConfig !== null },

  async close() {
    currentZz = null
    currentConfig = null
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

let currentProvider: XxProvider | null = null
let currentConfig: XxConfig | null = null

/** 按配置创建 Provider（模块私有） */
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
    await xx.close()
    try {
      const parsed = XxConfigSchema.parse(config)
      const provider = createProvider(parsed)
      const connectResult = await provider.connect(parsed)
      if (!connectResult.success) {
        return connectResult
      }
      currentProvider = provider
      currentConfig = parsed
      return ok(undefined)
    }
    catch (error) {
      return err({
        code: XxErrorCode.CONNECTION_FAILED,
        message: xxM('xx_initFailed', {
          params: { error: error instanceof Error ? error.message : String(error) },
        }),
        cause: error,
      })
    }
  },

  get zz(): ZzOperations { return currentProvider?.zz ?? notInitializedZz },
  get config() { return currentConfig },
  get isInitialized() { return currentProvider !== null },

  async close() {
    if (currentProvider) {
      await currentProvider.close()
      currentProvider = null
    }
    currentConfig = null
  },
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

let currentConfig: XxConfig | null = null
let currentYy: XxYyFunctions | null = null
let currentZz: XxZzFunctions | null = null

const notInitialized = core.module.createNotInitializedKit<XxError>(
  XxErrorCode.NOT_INITIALIZED,
  () => xxM('xx_notInitialized'),
)
const notInitializedYy = notInitialized.proxy<XxYyFunctions>()
const notInitializedZz = notInitialized.proxy<XxZzFunctions>()

export const xx: XxFunctions = {
  async init(config: XxConfigInput): Promise<Result<void, XxError>> {
    await xx.close()
    try {
      const parsed = XxConfigSchema.parse(config)

      // 异步工厂：子功能内部有初始化逻辑（如连接 Provider）
      const yyResult = await createXxYyFunctions({ config: parsed })
      if (!yyResult.success) {
        return yyResult
      }
      currentYy = yyResult.data

      // 同步工厂：子功能无需异步初始化
      currentZz = createXxZzFunctions({ config: parsed })

      currentConfig = parsed
      return ok(undefined)
    }
    catch (error) {
      return err({
        code: XxErrorCode.CONFIG_ERROR,
        message: xxM('xx_initFailed', {
          params: { error: error instanceof Error ? error.message : String(error) },
        }),
        cause: error,
      })
    }
  },

  get yy(): XxYyFunctions { return currentYy ?? notInitializedYy },
  get zz(): XxZzFunctions { return currentZz ?? notInitializedZz },
  get config() { return currentConfig },
  get isInitialized() { return currentConfig !== null },

  async close() {
    await currentYy?.close?.()
    currentYy = null
    currentZz = null
    currentConfig = null
  },
}
```

> **工厂函数的两种返回形式**：
>
> - **同步**：`createXxZzFunctions(deps): XxZzFunctions` — 子功能无需异步初始化时
> - **异步**：`createXxYyFunctions(deps): Promise<Result<XxYyFunctions, XxError>>` — 子功能有异步初始化时（如内部 Provider 连接）
>
> main.ts **不关心**子功能内部是否用了 Provider，只需按工厂返回类型正确调用。

### 3.5 `index.ts` — 入口聚合

纯 re-export，不含逻辑。只使用 `export *`。

**示例**（单入口）：

```ts
// ⚠️ 示例
export * from './xx-main.js'
export * from './xx-types.js'
```

**示例**（双入口 — Node 端）：

```ts
// ⚠️ 示例 — index.ts
export * from './client/index.js'
export * from './xx-main.js'
export * from './xx-types.js'
```

```ts
// ⚠️ 示例 — xx-index.browser.ts
export * from './client/index.js'
export * from './xx-types.js'
```

### 3.6 Provider 实现文件（可选）

> 仅需要多后端切换时创建。位置由 §2 决策表决定。

**通用规范**：

- 导出工厂函数 `createXxxProvider(): XxProvider`（闭包，不用 class）
- 使用 `ok()` / `err()` 返回 Result
- 统一的 `toXxError()` 辅助函数包装异常
- 外部依赖通过 `createRequire` 动态加载（ESM 兼容）

#### 模块级 Provider（无子功能时）

文件路径：`src/providers/xx-provider-aaa.ts`，实现 `XxProvider` 接口（定义在 `xx-types.ts`）。

**示例**：

```ts
// ⚠️ 示例 — 模块级 Provider 实现，替换类型名和操作

import type { Result } from '@h-ai/core'
import type { XxConfig } from './xx-config.js'
import type { XxError, XxProvider, ZzOperations } from './xx-types.js'
import { err, ok } from '@h-ai/core'
import { XxErrorCode } from './xx-config.js'

function toXxError(error: unknown): XxError {
  return {
    code: XxErrorCode.OPERATION_FAILED,
    message: error instanceof Error ? error.message : String(error),
    cause: error,
  }
}

export function createTypeAProvider(): XxProvider {
  let client: ExternalClient | null = null

  const zz: ZzOperations = {
    async create(data) {
      try {
        return ok(await client!.insert(data))
      }
      catch (error) {
        return err(toXxError(error))
      }
    },
    async get(id) {
      try {
        return ok(await client!.get(id))
      }
      catch (error) {
        return err(toXxError(error))
      }
    },
    async remove(id) {
      // 同上模式
    },
  }

  return {
    name: 'typeA',
    async connect(config) {
      try {
        client = new ExternalClient(config)
        await client.connect()
        return ok(undefined)
      }
      catch (error) {
        return err(toXxError(error))
      }
    },
    async close() {
      await client?.close()
      client = null
    },
    isConnected: () => client !== null,
    get zz() { return zz },
  }
}
```

#### 子功能级 Provider（有子功能时）

文件路径：`src/yy/providers/xx-yy-provider-aaa.ts`，实现 `XxYyProvider` 接口（定义在 `xx-yy-types.ts`）。

> Provider 接口在子功能 types 中定义，仅子功能内部使用，不对外暴露。由子功能工厂（`createXxYyFunctions`）内部创建和管理，main.ts 不感知。

**示例**（types 中定义接口）：

```ts
// ⚠️ 示例 — 在 yy/xx-yy-types.ts 中定义子功能 Provider 接口

export interface XxYyProvider {
  readonly name: string
  connect: (config: XxConfig) => Promise<Result<void, XxError>>
  close: () => Promise<void>
  isConnected: () => boolean
  readonly data: YyDataOperations
}
```

**示例**（工厂内部创建 Provider）：

```ts
// ⚠️ 示例 — 在 yy/xx-yy-functions.ts 中，工厂内部管理 Provider

import { createTypeAYyProvider } from './providers/xx-yy-provider-typeA.js'
import { createTypeBYyProvider } from './providers/xx-yy-provider-typeB.js'

/** 按配置创建子功能 Provider（子功能私有） */
function createYyProvider(config: XxConfig): XxYyProvider {
  switch (config.yy.type) {
    case 'typeA': return createTypeAYyProvider()
    case 'typeB': return createTypeBYyProvider()
    default:
      throw new Error(xxM('xx_yy_unsupportedType', { params: { type: config.yy.type } }))
  }
}

export async function createXxYyFunctions(
  deps: XxYyFunctionsDeps,
): Promise<Result<XxYyFunctions, XxError>> {
  const provider = createYyProvider(deps.config)
  const connectResult = await provider.connect(deps.config)
  if (!connectResult.success) {
    return connectResult
  }

  return ok({
    async create(input) {
      const result = await provider.data.insert(input)
      if (!result.success) {
        return result
      }
      return ok(result.data)
    },
    async get(id) {
      // 同上模式
    },
    async list() {
      // 同上模式
    },
    async close() {
      await provider.close()
    },
  })
}
```

### 3.7 子功能

模块的核心业务以子功能目录组织。每个子功能在独立目录，通过工厂函数创建，在 `init()` 中实例化，通过 `get` 访问器暴露。

**命名规则**：`{模块}-{功能}-{角色}.ts`

| 文件                              | 职责                           | 必须 |
| --------------------------------- | ------------------------------ | ---- |
| `xx-yy-types.ts`                  | 对外接口 + 依赖接口 + 实体类型 | ✅   |
| `xx-yy-functions.ts`              | 工厂函数（业务逻辑）           | ✅   |
| `xx-yy-utils.ts`                  | 工具函数                       | 可选 |
| `xx-yy-repository-zz.ts`          | 数据仓库（zz=实体名）          | 可选 |
| `providers/xx-yy-provider-aaa.ts` | 多后端 Provider（见 §3.6）     | 可选 |

#### 3.7.1 `xx-yy-types.ts` — 子功能类型

定义子功能对外接口（`XxYyFunctions`）、依赖接口（`XxYyFunctionsDeps`）、业务实体类型。

**示例**：

```ts
// ⚠️ 示例 — 替换 Yy 为实际子功能名，按业务需求定义实体和操作

import type { Result } from '@h-ai/core'
import type { XxConfig } from '../xx-config.js'
import type { XxError } from '../xx-types.js'

// ─── 业务实体 ───

export interface YyItem {
  id: string
  name: string
  createdAt: Date
}

export interface CreateYyInput {
  name: string
}

// ─── 子功能接口 ───

export interface XxYyFunctions {
  create: (input: CreateYyInput) => Promise<Result<YyItem, XxError>>
  get: (id: string) => Promise<Result<YyItem | null, XxError>>
  list: () => Promise<Result<YyItem[], XxError>>
  remove: (id: string) => Promise<Result<void, XxError>>
  // 如子功能有内部 Provider 或需要清理资源，加 close：
  // close: () => Promise<void>
}

// ─── 依赖接口 ───

export interface XxYyFunctionsDeps {
  config: XxConfig
  // 按需添加：sql、cache、其他子功能引用等
}
```

#### 3.7.2 `xx-yy-functions.ts` — 子功能工厂

工厂函数接收依赖，返回子功能操作接口。所有业务逻辑在此实现。

**示例**（无 Provider，同步返回）：

```ts
// ⚠️ 示例 — 无 Provider 的子功能工厂

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
        return err({
          code: XxErrorCode.VALIDATION_ERROR,
          message: xxM('xx_yy_nameRequired'),
        })
      }
      try {
        const item = await doCreate(input)
        return ok(item)
      }
      catch (error) {
        return err({
          code: XxErrorCode.OPERATION_FAILED,
          message: xxM('xx_yy_createFailed'),
          cause: error,
        })
      }
    },

    async get(id) {
      const result = await someDataSource.query(id)
      if (!result.success) {
        return result
      }
      return ok(mapToYyItem(result.data))
    },

    async list() {
      // 同上模式
    },
    async remove(id) {
      // 同上模式
    },
  }
}
```

> 有 Provider 的子功能工厂示例见 §3.6「子功能级 Provider」。

#### 3.7.3 类型聚合

模块根 `xx-types.ts` 必须 re-export 子功能类型，使外部通过 `@h-ai/xx` 一站式引入：

```ts
// xx-types.ts 底部追加
export type { CreateYyInput, XxYyFunctions, YyItem } from './yy/xx-yy-types.js'
export type { XxZzFunctions, ZzItem } from './zz/xx-zz-types.js'
```

#### 3.7.4 Repository 数据仓库（可选）

当模块需要持久化业务数据时，通过 Repository 封装数据访问逻辑。

**文件位置**：

| 场景                 | 位置                                         |
| -------------------- | -------------------------------------------- |
| 模块级（无子功能）   | `src/xx-repository-{entity}.ts`              |
| 子功能目录内         | `src/yy/xx-yy-repository-{entity}.ts`        |
| 多个 Repository 集中 | `src/repositories/xx-{entity}-repository.ts` |

> 三种位置按模块复杂度选择：单一 Repository 放模块根；子功能内的放子功能目录；≥3 个同级 Repository 时用 `repositories/` 目录集中管理。

**实现规范**：

- **继承 `BaseReldbCrudRepository<T>`**（`@h-ai/reldb` 提供），获得标准 CRUD 能力
- 导出 class（Repository 是有状态的数据访问层，适合用 class + 继承）
- 类名为 `{Module}{Entity}Repository`（如 `AuditLogRepository`、`SchedulerTaskRepository`）
- 子功能的 Repository 类名含域名：`{Module}{Domain}{Entity}Repository`
- 如需抽象（多存储后端切换），先定义 `interface XxRepository`，再用 class 实现

**示例**：

```ts
// ⚠️ 示例 — Repository 继承标准 CRUD 基类

import { BaseReldbCrudRepository } from '@h-ai/reldb'

export class XxItemRepository extends BaseReldbCrudRepository<XxItem> {
  constructor(sql: SqlOperations) {
    super(sql, 'xx_items')
  }

  /** 业务特有的查询方法 */
  async findByStatus(status: string): Promise<Result<XxItem[], XxError>> {
    // 利用 this.sql 执行自定义查询
  }
}
```

> **Provider 用工厂 + 闭包，Repository 用 class + 继承**——两者职责不同，实现模式不同。Provider 是可替换的后端适配器，Repository 是 CRUD 数据访问层。

### 3.8 `api/` — API 契约层（可选）

> 当模块需要对外暴露 HTTP API 时，创建 `src/api/` 子目录。契约定义是客户端（`api.call`）和服务端（`kit.fromContract`）的**唯一真相源**，编译时保证两端 I/O 类型一致。

#### 判断是否需要 API 契约

| 条件                               | 需要 `api/` |
| ---------------------------------- | ----------- |
| 模块有面向浏览器/App 的 HTTP 端点  | ✅          |
| 其他模块或应用需要类型安全地调用它 | ✅          |
| 模块仅供服务端内部调用，无 HTTP 层 | ❌          |

#### 3.8.1 `xx-api-schemas.ts` — Zod Schema 定义

**职责**：定义所有入参/出参/实体的 Zod Schema 和推导类型。只包含 Schema 定义，不含端点路由信息。

**规范**：

- Schema 命名：`{Entity}Schema`、`{Action}{Direction}Schema`（如 `PresignGetInputSchema`、`ListFilesOutputSchema`）
- 导出推导类型：`export type XxxInput = z.infer<typeof XxxInputSchema>`
- 使用 `z.coerce.date()` 等 coerce 处理跨端序列化差异
- 字符串类 key 字段统一 `z.string().min(1)` 防空值

**示例**：

```ts
// ⚠️ 示例 — 替换 Xx 为实际模块名和业务字段

import { z } from 'zod'

/** 实体 Schema */
export const XxItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.coerce.date(),
})

/** 创建入参 */
export const CreateXxInputSchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
})

/** 创建出参 */
export const CreateXxOutputSchema = XxItemSchema

/** 列表出参 */
export const ListXxOutputSchema = z.object({
  items: z.array(XxItemSchema),
  total: z.number(),
  nextCursor: z.string().optional(),
})

/** 删除入参 */
export const DeleteXxInputSchema = z.object({
  id: z.string().min(1),
})

// ─── 推导类型 ───

export type XxItem = z.infer<typeof XxItemSchema>
export type CreateXxInput = z.infer<typeof CreateXxInputSchema>
export type CreateXxOutput = z.infer<typeof CreateXxOutputSchema>
export type ListXxOutput = z.infer<typeof ListXxOutputSchema>
export type DeleteXxInput = z.infer<typeof DeleteXxInputSchema>
```

#### 3.8.2 `xx-api-contract.ts` — 端点定义

**职责**：定义 `xxEndpoints` 对象，关联 HTTP method + path + Schema + 元数据。

**规范**：

- 内联 `EndpointDef` 接口和 `defineEndpoint` 辅助函数（避免对 `@h-ai/api-client` 的循环依赖）
- 导出唯一的 `xxEndpoints` 对象（`as const`），以端点名为 key
- `path` 以模块名开头（如 `/storage/...`、`/auth/...`）
- `meta.tags` 至少包含模块名，便于 OpenAPI 文档分组

**示例**：

```ts
// ⚠️ 示例 — 替换 Xx 为实际模块名和业务端点

import { z } from 'zod'
import {
  CreateXxInputSchema,
  CreateXxOutputSchema,
  DeleteXxInputSchema,
  ListXxOutputSchema,
  XxItemSchema,
} from './xx-api-schemas.js'

// ─── 内联端点辅助（避免循环依赖 @h-ai/api-client） ───

interface EndpointDef<TInput = unknown, TOutput = unknown> {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  input: z.ZodType<TInput>
  output: z.ZodType<TOutput>
  requireAuth?: boolean
  meta?: { summary?: string, tags?: string[] }
}

function defineEndpoint<TInput, TOutput>(def: EndpointDef<TInput, TOutput>): EndpointDef<TInput, TOutput> {
  return def
}

// ─── 端点定义 ───

export const xxEndpoints = {
  create: defineEndpoint({
    method: 'POST',
    path: '/xx/create',
    input: CreateXxInputSchema,
    output: CreateXxOutputSchema,
    meta: { summary: 'Create xx item', tags: ['xx'] },
  }),

  list: defineEndpoint({
    method: 'GET',
    path: '/xx/list',
    input: z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    }),
    output: ListXxOutputSchema,
    meta: { summary: 'List xx items', tags: ['xx'] },
  }),

  get: defineEndpoint({
    method: 'POST',
    path: '/xx/info',
    input: z.object({ id: z.string().min(1) }),
    output: XxItemSchema,
    meta: { summary: 'Get xx item info', tags: ['xx'] },
  }),

  delete: defineEndpoint({
    method: 'POST',
    path: '/xx/delete',
    input: DeleteXxInputSchema,
    output: z.void(),
    meta: { summary: 'Delete xx item', tags: ['xx'] },
  }),
} as const
```

#### 3.8.3 `api/index.ts` — 聚合导出

```ts
export * from './xx-api-contract.js'
export * from './xx-api-schemas.js'
```

#### 3.8.4 客户端消费（`@h-ai/api-client`）

```ts
import { xxEndpoints } from '@h-ai/xx/api'

// api.call 自动做入参 Zod 校验 + 出参类型推导
const result = await api.call(xxEndpoints.create, { name: 'test' })
if (result.success) {
  // result.data 类型自动为 CreateXxOutput
}
```

#### 3.8.5 服务端消费（`@h-ai/kit`）

```ts
import { kit } from '@h-ai/kit'
import { xx } from '@h-ai/xx'
import { xxEndpoints } from '@h-ai/xx/api'

// kit.fromContract 自动做入参 Zod 校验，handler 入参类型安全
export const POST = kit.fromContract(xxEndpoints.create, async (input, event) => {
  kit.guard.requirePermission(event.locals.session, 'xx:write')
  const result = await xx.create(input)
  if (!result.success) {
    return kit.response.internalError(result.error.message)
  }
  return kit.response.created(result.data)
})
```

#### 3.8.6 端到端契约流

```
┌─────────────────────────────────────────────────────────────┐
│                    @h-ai/xx/api                             │
│  xx-api-schemas.ts  ←  Zod Schema（唯一真相源）            │
│  xx-api-contract.ts ←  xxEndpoints（method + path + schema）│
└─────────────┬──────────────────────────┬────────────────────┘
              │                          │
     ┌────────▼────────┐       ┌─────────▼─────────┐
     │  客户端（浏览器）│       │  服务端（SvelteKit）│
     │  api.call(ep, i) │       │  kit.fromContract  │
     │  @h-ai/api-client│       │  @h-ai/kit         │
     └────────┬────────┘       └─────────┬─────────┘
              │      HTTP（类型安全）     │
              └──────────────────────────┘
```

### 3.9 `client/xx-client.ts` — 浏览器端客户端

**规范**：

- 工厂函数 `createXxClient(config)` 创建
- 零 Node.js 依赖
- 使用 `fetch` API（可注入自定义实现）
- 支持 `getAccessToken` 回调和 `onAuthError` 回调

**示例**：

```ts
// ⚠️ 示例 — 替换接口名和 API 路径

export interface XxClientConfig {
  baseUrl: string
  getAccessToken?: () => string | Promise<string>
  onAuthError?: () => void
  fetch?: typeof globalThis.fetch
}

export interface XxClient {
  list: () => Promise<Item[]>
  get: (id: string) => Promise<Item | null>
}

export function createXxClient(config: XxClientConfig): XxClient {
  const { baseUrl, getAccessToken, onAuthError, fetch: customFetch } = config
  const fetchFn = customFetch ?? globalThis.fetch

  async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (getAccessToken) {
      const token = await getAccessToken()
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
    }
    const response = await fetchFn(`${baseUrl}${path}`, {
      ...options,
      headers: { ...headers, ...options?.headers },
    })
    if (response.status === 401) {
      onAuthError?.()
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    return response.json() as Promise<T>
  }

  return {
    list: () => request<Item[]>('/items'),
    get: id => request<Item | null>(`/items/${id}`),
  }
}
```

```ts
// client/index.ts
export * from './xx-client.js'
```

---

## 4. 代码统一规范

### 4.1 return 语句

return 只返回已计算的值。禁止内嵌条件判断、循环、多级调用链。

```ts
// ❌ return 中嵌套复杂逻辑
return db.query(sql).then(r => r.success ? ok(r.data.map(mapFn)) : err(r.error))

// ✅ 拆分为步骤
const result = await db.query(sql)
if (!result.success) {
  return result
}
const user = mapRowToUser(result.data)
return ok(user)
```

### 4.2 错误处理

> 核心原则：**公共模块 API 不抛异常，统一返回 `Result<T, E>`**。

所有 `packages/*/src/` 下对外暴露的函数/方法，返回值必须是 `Result<T, XxError>` 或 `Promise<Result<T, XxError>>`。调用方不应使用 `try/catch` 来处理模块返回的错误。

**允许 throw 的合规场景**：

| 场景                                 | 说明                                  |
| ------------------------------------ | ------------------------------------- |
| 内部 throw + 外层 try-catch → Result | 标准 catch-and-wrap 模式              |
| SvelteKit 控制流                     | `throw redirect()`、`throw error()`   |
| 浏览器端 Client 代码                 | `client/xx-client.ts`，非模块公共 API |
| CLI 命令                             | `packages/cli/`，非模块 API           |
| `getOrThrow()` 等显式命名            | 函数名已表达 throw 语义               |
| async generator（如 `chatStream()`） | 无法返回 Result，需在 JSDoc 中注明    |

```ts
// ✅ 错误码 + i18n
return err({ code: XxErrorCode.OPERATION_FAILED, message: xxM('xx_failed'), cause: error })

// ✅ Result 透传（不重新包装上游错误）
const result = await upstream()
if (!result.success) {
  return result
}

// ❌ 硬编码消息
return err({ code: XxErrorCode.FAILED, message: '操作失败' })

// ❌ 重新包装已有错误
return err({ code: XxErrorCode.QUERY_FAILED, message: result.error.message })
```

### 4.3 提前返回

使用 Early Return 减少嵌套，禁止超过 2 层 if 嵌套。

```ts
// ✅ 提前返回
async function process(input: Input): Promise<Result<Output, XxError>> {
  if (!input.name) {
    return err({ code: XxErrorCode.VALIDATION, message: xxM('xx_nameRequired') })
  }
  const result = await doWork(input)
  if (!result.success) {
    return result
  }
  return ok(transform(result.data))
}

// ❌ 深层嵌套
async function process(input: Input) {
  if (input.name) {
    const result = await doWork(input)
    if (result.success) {
      return ok(transform(result.data))
    }
    else {
      return result
    }
  }
  else {
    return err({ code: XxErrorCode.VALIDATION, message: xxM('xx_nameRequired') })
  }
}
```

### 4.4 函数体量

单个函数 ≤ **60 行**（不含注释和空行）。超过时拆分为子函数。

### 4.5 参数设计

聚合依赖为接口，避免散乱回调参数：

```ts
// ✅ 接口聚合
interface ServiceDeps {
  sql: SqlOperations
  config: XxConfig
}
function createService(deps: ServiceDeps): XxOperations {
  // 实现
}

// ❌ 散乱回调
function createService(
  query: (sql: string) => Promise<Result<unknown[], XxError>>,
  getConfig: () => XxConfig,
): XxOperations {
  // 实现
}
```

### 4.6 命名规范

| 类别          | 规范                                     | 示例                                                  |
| ------------- | ---------------------------------------- | ----------------------------------------------------- |
| 文件名        | `{模块}-{职责}.ts` kebab-case            | `db-main.ts`、`iam-authn-functions.ts`                |
| 服务对象      | 小写模块名                               | `export const db`                                     |
| 函数接口      | `{Module}Functions`                      | `ReldbFunctions`、`PaymentFunctions`                  |
| 子操作接口    | `{Domain}Operations`                     | `KvOperations`、`DeviceOperations`                    |
| 错误码对象    | `{Module}ErrorCode` UPPER_SNAKE          | `ReldbErrorCode.NOT_INITIALIZED`                      |
| 错误类型      | `{Module}Error`                          | `StorageError`、`IamError`                            |
| 配置 Schema   | `{Module}ConfigSchema`                   | `StorageConfigSchema`                                 |
| 配置类型      | `{Module}Config` / `{Module}ConfigInput` | `DbConfig` / `DbConfigInput`                          |
| Provider 接口 | `{Module}Provider`                       | `ReldbProvider`、`CacheProvider`                      |
| Provider 工厂 | `create{Impl}Provider`                   | `createSqliteProvider()`                              |
| Repository 类 | `{Module}{Entity}Repository`             | `AuditLogRepository`、`SchedulerTaskRepository`       |
| i18n 获取器   | `{缩写}M`                                | `reldbM()`、`storageM()`                              |
| 日志          | `core.logger.child(...)`                 | `core.logger.child({ module: 'iam', scope: 'auth' })` |
| 消息键        | `{module}_{camelCase}`                   | `storage_notInitialized`、`db_initFailed`             |
| 端点对象      | `{module}Endpoints`                      | `storageEndpoints`、`iamEndpoints`                    |

### 4.7 import 顺序

按以下分组排列（组间空行分隔）：

```ts
// 1. type-only imports（第三方）
import type { Result } from '@h-ai/core'

// 2. type-only imports（内部）
import type { XxConfig } from './xx-config.js'

// 3. value imports（第三方）
import { core, err, ok } from '@h-ai/core'

// 4. value imports（内部）
import { XxConfigSchema } from './xx-config.js'
```

### 4.8 注释

- **代码注释**中文，**日志消息**英文
- 公共 API 必须 JSDoc（`@param`、`@returns`、`@example`）
- 模块 section 用注释分隔线：`// ─── 内部状态 ────`

### 4.9 禁止清单

- ❌ `any` — 用 `unknown` + 缩窄
- ❌ `console.log` — 用 `core.logger`
- ❌ 硬编码字符串 — 用 `xxM('key')`
- ❌ 硬编码密钥 — 用环境变量
- ❌ `index.ts` 写逻辑 — 仅 `export *`
- ❌ `main.ts` 写业务逻辑 — 仅做生命周期管理和 API 编排，具体逻辑委托给 `functions.ts` / `runner.ts` 等
- ❌ class 实现 Provider — 用工厂函数 + 闭包（Repository 用 class + 继承，见 §3.7.4）
- ❌ return 嵌套复杂逻辑
- ❌ 超过 2 层 if 嵌套
- ❌ 重新包装上游 Result 错误
- ❌ 公共 API 中 `throw` — 返回 `Result<T, XxError>`（合规场景见 §4.2）
- ❌ 模块级 `Map` / `Set` 缓存需跨节点一致的业务数据 — 必须使用数据库持久化（详见 §4.11）
- ❌ 错误码段位与已有模块冲突 — 新模块必须在 §3.1 注册表中选取未占用段位
- ❌ 同一模块混用扁平方法与子操作对象两种 API 风格（见 §2 问题 3）

### 4.10 日志输出规范

模块在关键生命周期节点与业务操作中**必须输出日志**，帮助开发与运维追踪执行流程、定位问题。

#### 日志实例创建

每个文件使用 `core.logger.child` 创建局部 logger，标注模块与作用域：

```ts
import { core } from '@h-ai/core'

// main.ts
const logger = core.logger.child({ module: 'xx', scope: 'main' })

// 子功能文件
const logger = core.logger.child({ module: 'xx', scope: 'yy' })

// Provider 实现
const logger = core.logger.child({ module: 'xx', scope: 'provider-aaa' })
```

#### 日志级别与使用场景

| 级别    | 场景                                                 | 示例                                   |
| ------- | ---------------------------------------------------- | -------------------------------------- |
| `trace` | 循环体内、变量快照、详细执行路径                     | 逐行处理记录、缓存命中/未命中          |
| `debug` | 函数进入、中间状态、参数概要                         | 开始处理请求、解析配置                 |
| `info`  | 业务里程碑事件（初始化完成、连接就绪、关键操作成功） | 服务启动、用户创建、会话建立           |
| `warn`  | 异常但可恢复（重试、降级、校验失败）                 | 认证失败、速率限制触发、配置回退默认值 |
| `error` | 操作失败且需人工排查                                 | 数据库连接失败、Provider 异常          |
| `fatal` | 致命错误、服务无法继续                               | 核心依赖不可用、数据损坏               |

#### 必须输出日志的位置

**1. 生命周期（init / close）**

```ts
export const xx: XxFunctions = {
  async init(config: XxConfigInput): Promise<Result<void, XxError>> {
    await xx.close()
    try {
      const parsed = XxConfigSchema.parse(config)
      logger.debug('Initializing xx module', { type: parsed.type })

      // ... 创建功能实例 ...

      currentConfig = parsed
      logger.info('XX module initialized', { type: parsed.type })
      return ok(undefined)
    }
    catch (error) {
      logger.error('XX module initialization failed', { error })
      return err({ code: XxErrorCode.CONFIG_ERROR, message: xxM('xx_initFailed', { params: { error: String(error) } }), cause: error })
    }
  },

  async close() {
    if (currentProvider) {
      await currentProvider.close()
      currentProvider = null
    }
    currentConfig = null
    logger.info('XX module closed')
  },
}
```

**2. 业务操作（成功 / 失败 / 异常分支）**

```ts
const yyOperations = {
  async create(input: CreateYyInput) {
    logger.debug('Creating yy item', { name: input.name })

    if (!input.name) {
      logger.warn('Yy creation rejected: name is empty')
      return err({ code: XxErrorCode.VALIDATION_ERROR, message: xxM('xx_yy_nameRequired') })
    }

    try {
      const item = await doCreate(input)
      logger.info('Yy item created', { itemId: item.id, name: item.name })
      return ok(item)
    }
    catch (error) {
      logger.error('Failed to create yy item', { name: input.name, error })
      return err({ code: XxErrorCode.OPERATION_FAILED, message: xxM('xx_yy_createFailed'), cause: error })
    }
  },

  async remove(id: string) {
    logger.debug('Removing yy item', { id })
    const result = await dataSource.delete(id)
    if (!result.success) {
      logger.warn('Failed to remove yy item', { id, reason: result.error.code })
      return result
    }
    logger.info('Yy item removed', { id })
    return ok(undefined)
  },
}
```

**3. Provider 连接 / 断开**

```ts
export function createTypeAProvider(): XxProvider {
  const logger = core.logger.child({ module: 'xx', scope: 'provider-typeA' })
  let client: ExternalClient | null = null

  return {
    name: 'typeA',
    async connect(config) {
      logger.debug('Connecting to TypeA backend', { host: config.host })
      try {
        client = new ExternalClient(config)
        await client.connect()
        logger.info('TypeA backend connected', { host: config.host })
        return ok(undefined)
      }
      catch (error) {
        logger.error('TypeA connection failed', { host: config.host, error })
        return err(toXxError(error))
      }
    },
    async close() {
      await client?.close()
      client = null
      logger.info('TypeA backend disconnected')
    },
    // ...
  }
}
```

**4. 认证 / 权限等安全敏感操作**

```ts
const authOperations = {
  async login(credentials) {
    const authResult = await strategy.authenticate(credentials)
    if (!authResult.success) {
      logger.warn('Login failed', { type: credentials.type, reason: authResult.error.code })
      return authResult
    }
    logger.info('Login succeeded', { type: credentials.type, userId: authResult.data.id })
    return buildAuthResult(authResult.data)
  },

  async logout(accessToken: string) {
    // ...
    logger.info('User logged out', { userId: session.userId })
    return ok(undefined)
  },
}
```

#### 日志内容规范

- **消息文本**：英文，简洁动宾结构（如 `'XX module initialized'`、`'Failed to create yy item'`）
- **上下文对象**：携带关键业务标识（`id`、`userId`、`type`），禁止输出密码、token 明文等敏感信息
- **错误上下文**：失败日志携带 `{ error }` 或 `{ reason: errorCode }`，便于排查
- **不要过度日志**：循环体内用 `trace`；正常查询/读取操作用 `debug`，不要用 `info`

### 4.11 分布式友好 — 多节点状态管理

> 核心原则：**服务可能多节点部署，进程内状态（`Map` / `Set` / 普通变量）仅对当前节点可见，不得作为业务数据的唯一存储**。

#### 禁止模式

```ts
// ❌ 用 Map 缓存模板 — 节点 A 写入后，节点 B 读不到
const templates = new Map<string, ReachTemplate>()

// ❌ 用 Set 防重 — 节点 A 标记正在运行，节点 B 不知道
const runningTasks = new Set<string>()
```

#### 正确模式

| 场景                                   | 方案                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| 业务数据缓存（模板、配置、用户数据等） | 使用 `@h-ai/reldb` 的 `BaseReldbCrudRepository` 持久化到数据库，DB 作为唯一数据源 |
| 分布式互斥（任务防重、资源占用）       | 使用数据库锁表 + UNIQUE 约束（参考 `scheduler-lock-repository`）                  |
| 跨节点共享缓存                         | 使用 `@h-ai/cache`（Redis 等外部缓存）                                            |

#### 允许的内存状态

以下场景可以使用模块级内存变量，但需在注释中标明 **「仅当前节点有效」**：

- **函数引用**：JS handler、回调注册（`handlers: Map<string, Function>`）— 不可序列化，只能存内存
- **派生缓存**：从 DB 加载后在内存中建立的查找索引，用于加速热路径；DB 仍为数据源
- **连接对象**：数据库连接、HTTP 客户端实例
- **运行时标志**：`isInitialized`、`isRunning` 等节点本地状态

---

## 5. 工程化配置

### 5.1 `package.json`

**示例**（单入口）：

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

**示例**（双入口，有 Client）：

```jsonc
{
  "name": "@h-ai/xx",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/node.d.ts",
      "browser": "./dist/browser.js",
      "import": "./dist/node.js",
      "default": "./dist/node.js"
    },
    "./client": {
      "types": "./dist/client/index.d.ts",
      "import": "./dist/client/index.js"
    }
  },
  "main": "./dist/node.js",
  "browser": "./dist/browser.js",
  "types": "./dist/node.d.ts"
}
```

**示例**（有 API 契约的子路径导出 — 在任意入口模式基础上追加）：

```jsonc
{
  "exports": {
    // ... 原有 "." 和 "./client" 不变
    "./api": {
      "types": "./dist/api/index.d.ts",
      "import": "./dist/api/index.js"
    }
  }
}
```

### 5.2 `tsconfig.json`

```jsonc
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "./dist"
  },
  "include": ["src/**/*", "messages/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### 5.3 `tsup.config.ts`

**示例**（单入口）：

```ts
import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: { index: 'src/index.ts' },
  external: ['@h-ai/core', 'zod'],
})
```

**示例**（双入口）：

```ts
import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: {
    'node': 'src/index.ts',
    'browser': 'src/xx-index.browser.ts',
    'client/index': 'src/client/index.ts',
  },
  external: ['@h-ai/core', 'zod'],
})
```

**示例**（有 API 契约 — 在任意入口模式基础上追加 `api/index` 入口）：

```ts
import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: {
    // ... 原有入口不变
    'api/index': 'src/api/index.ts', // ← 追加
  },
  external: ['@h-ai/core', 'zod'],
})
```

### 5.4 `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config'
import { baseVitestConfig } from '../vitest.base'

export default defineConfig({ ...baseVitestConfig })
```

---

## 6. README 与 Skill 模板

### 6.1 `README.md`（面向人类）

> README 是开发者和使用者的**第一入口**，必须让人 **30 秒搞清楚模块能做什么、3 分钟跑通第一个示例**。
> 只写"是什么 / 怎么用"，不写完整接口清单与内部实现细节。

#### 固定结构

以下为**必须包含**的章节及其要求，按顺序排列。标注「条件」的章节仅在满足条件时出现。

```text
# @h-ai/xx                          ← 包名
一句话描述 + 核心价值。              ← 紧跟标题后，无需额外标题

## 支持的 xxx                        ← §A 能力概览
## 快速开始                          ← §B 核心示例
  ### Node.js 服务端                 ← 条件：有 Node 入口
  ### 浏览器客户端                   ← 条件：有 Browser 入口 / Client
## API 契约                          ← 条件：有 src/api/
## API 概览                          ← 条件：子操作较多
## 配置                              ← §C 配置说明
## 错误处理                          ← §D 错误码
## 测试                              ← §E 测试命令
## License                           ← §F 许可证
```

#### 各章节编写要求

##### §A 能力概览（`## 支持的 xxx`）

- **标题**根据模块类型选择合适的名词：`支持的数据库`（reldb）、`支持的后端`（storage）、`支持的能力`（core、capacitor、crypto）等。
- **呈现方式**：2 种选其一
  - **表格**（有插件依赖或多 Provider 时优先）：列出「能力 | 依赖 | 说明」
  - **列表**（能力同质时）：用 `- **名称** — 描述` 格式
- 只列**用户需要知道的**外部依赖/后端；不列内部实现细节。

##### §B 快速开始（`## 快速开始`）

- **目标**：让读者从零到能跑的最小代码路径。
- **必须包含**：`init`→ 核心操作 → `close` 的完整生命周期。
- **多平台 / 多能力**时，用 `###` 子标题分节：
  - **Node.js 服务端** / **浏览器客户端**（双端模块）
  - 按能力分节（如 capacitor 按设备信息、推送、状态栏等分节）
- **代码示例规范**：
  - 使用 `typescript` 语言标注。
  - 只展示**导入 → 初始化 → 调用 → 关闭**，不写辅助函数。
  - 注释简短标注返回值含义。
  - 多 Provider/后端时写**默认示例 + 一个备选**，不逐一列举。

##### API 契约（`## API 契约`）— 条件：模块有 `src/api/`

- 说明子路径导出（如 `@h-ai/storage/api`）的用途。
- 给出**客户端调用**和**服务端路由**各一个 3-5 行的示例。
- 列出导出的 **Schema 名称**和推导类型（仅名称列表，不展开字段）。

##### API 概览（`## API 概览`）— 条件：子操作接口 ≥ 3 个

- 用缩进列表展示操作分类层级，一行一个方法（仅方法名，不需要签名）。
  ```text
  - `xx.file` — `put / get / head / exists / delete / copy`
  - `xx.dir` — `list / delete`
  ```
- **不需要**完整的参数/返回值表格（那是 SKILL.md 的职责）。

##### §C 配置（`## 配置`）

- **有 Zod Schema 的模块**：用文字简要描述必填/可选字段，给出 1-2 个典型配置代码。
- **无配置的模块**：一句话说明即可（如 `capacitor.init()` 仅检测环境）。
- **不需要**贴出完整 Schema 定义或每个字段的类型。

##### §D 错误处理（`## 错误处理`）

- 给出一个 3-5 行的 `Result` 判断示例（含错误码 switch/if）。
- 列出**常用错误码**（仅名称 + 一句话含义），无需列所有错误码。

##### §E 测试（`## 测试`）

- 给出 `pnpm --filter @h-ai/xx test` 命令。
- 有外部依赖时补一句提示（如 `> MySQL/PostgreSQL 测试需要 Docker。`）。

##### §F License

- 固定写 `Apache-2.0`。

#### 禁止事项

- ❌ 贴完整类型定义（`interface XxFunctions { ... }`）
- ❌ 列完整 API 表格（含参数/返回值类型）— 那是 SKILL.md 的职责
- ❌ 写内部实现原理（如 Provider 分发逻辑、Proxy 机制）
- ❌ 写安装步骤（monorepo 内部模块不需要 `pnpm add`）
- ❌ 写 `## 依赖` 章节单独列依赖包（`package.json` 已声明）
- ❌ 代码示例中出现 `console.log`

### 6.2 Skill 模板（面向 AI）

模块的 Skill 文件已统一管理在 `packages/cli/templates/skills/` 中，通过 CLI 分发到用户项目。
新建模块时，需在 `packages/cli/templates/skills/hai-<模块名>/SKILL.md` 创建对应 Skill 文件，遵循 agentskills.io 标准。

必须包含：

1. **YAML frontmatter** — `name`（小写+连字符）+ `description`（做什么+何时用）
2. **模块概述** — 一句话描述
3. **使用步骤** — 配置 / init / close 示例
4. **核心 API** — 方法签名表 + 代码示例
5. **错误码** — 数值 + 含义
6. **常见模式** — 典型使用场景
7. **相关 Skills** — 交叉引用

---

## 7. 创建检查清单

- [ ] 确定模块类型（§2 前置：生命周期单例 / 工厂 / 纯函数 / 基础设施）
- [ ] 确定模块名、API 风格（§2 问题 3：扁平 vs 子操作）
- [ ] 分配错误码段位（§3.1 注册表），确认与已有模块不冲突
- [ ] 完成 §2 其他架构决策（子功能 / Provider）
- [ ] 创建 `packages/xx/` 目录结构
- [ ] `xx-config.ts`（错误码 + Zod Schema）
- [ ] `messages/zh-CN.json` + `messages/en-US.json`
- [ ] `xx-i18n.ts`
- [ ] `xx-types.ts`（函数接口 + 错误类型 + 操作接口 / 子操作接口）
- [ ] 子功能 `yy/xx-yy-types.ts` + `yy/xx-yy-functions.ts`（如有）
- [ ] Provider 实现文件（如需，按 §2 决策放置）
- [ ] Repository 实现文件（如需，按 §3.7.4 规范）
- [ ] `xx-main.ts`
- [ ] `index.ts`（+ `xx-index.browser.ts` 如有 Client）
- [ ] `client/xx-client.ts`（如有）
- [ ] `package.json` / `tsconfig.json` / `tsup.config.ts` / `vitest.config.ts`
- [ ] `README.md`（按 §6.1 结构）
- [ ] `packages/cli/templates/skills/hai-xx/SKILL.md`（Skill 模板，按 §6.2）
- [ ] `src/api/`（如需 HTTP API：`xx-api-schemas.ts` + `xx-api-contract.ts` + `index.ts`）
- [ ] `package.json` 追加 `"./api"` 子路径导出（如有 `src/api/`）
- [ ] `tsup.config.ts` 追加 `'api/index'` 入口（如有 `src/api/`）
- [ ] 命名一致性：服务对象 / 函数接口 / 错误码 / 配置类型 / i18n 获取器（§4.6）
- [ ] `pnpm typecheck` → `pnpm lint` → `pnpm test`

---

## 示例触发语句

- "创建一个 @h-ai/notification 模块，支持 email 和 sms 两种 Provider"
- "给 iam 模块新增一个 oauth 子功能"
- "给 storage 模块新增一个 oss Provider"
- "创建一个新模块，包含浏览器端客户端"
