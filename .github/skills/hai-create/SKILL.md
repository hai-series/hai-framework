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
    xx-repository-zz.ts   # 数据仓库——zz=实体名（可选）
    providers/             # Provider 实现目录（可选，仅需多后端时）
      xx-provider-aaa.ts   # Provider 实现——aaa=实现名
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

---

## 2. 架构决策

创建模块前，回答以下两个**独立**问题，确定模块架构。

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

---

## 3. 文件职责与代码模板

### 3.1 `xx-config.ts` — 错误码 + 配置 Schema

**职责**：定义模块错误码、Zod Schema、配置类型。不含业务逻辑。

**错误码规范**：

- 每个模块分配一个千位段（如 db=3000、cache=4000、storage=5000）
- `NOT_INITIALIZED` 固定为 `X010`（模块段 + 010）
- 按类别分段：通用 X000-X009、初始化 X010-X019、业务操作 X020+

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

### 3.8 `client/xx-client.ts` — 浏览器端客户端

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
| 错误码        | `{Module}ErrorCode` UPPER_SNAKE          | `ReldbErrorCode.NOT_INITIALIZED`                      |
| 配置 Schema   | `{Module}ConfigSchema`                   | `StorageConfigSchema`                                 |
| 配置类型      | `{Module}Config` / `{Module}ConfigInput` | `DbConfig` / `DbConfigInput`                          |
| Provider 工厂 | `create{Impl}Provider`                   | `createSqliteProvider()`                              |
| i18n 获取器   | `{缩写}M`                                | `reldbM()`、`storageM()`                              |
| 日志          | `core.logger.child(...)`                 | `core.logger.child({ module: 'iam', scope: 'auth' })` |
| 消息键        | `{module}_{camelCase}`                   | `storage_notInitialized`、`db_initFailed`             |

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
- ❌ class 实现 Provider — 用工厂函数 + 闭包
- ❌ return 嵌套复杂逻辑
- ❌ 超过 2 层 if 嵌套
- ❌ 重新包装上游 Result 错误
- ❌ 公共 API 中 `throw` — 返回 `Result<T, XxError>`（合规场景见 §4.2）

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

### 5.4 `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config'
import { baseVitestConfig } from '../vitest.base'

export default defineConfig({ ...baseVitestConfig })
```

---

## 6. README 与 Skill 模板

### 6.1 `README.md`（面向人类）

只写"是什么 / 怎么用"，不写接口清单与内部实现。固定结构：

```text
# @h-ai/xx

一句话描述。

## 支持的后端 / 能力

## 快速开始

### Node.js 服务端

### 浏览器客户端（如有）

## 配置

## 错误处理

## 测试

## License

```

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

- [ ] 确定模块名、错误码段、完成 §2 架构决策
- [ ] 创建 `packages/xx/` 目录结构
- [ ] `xx-config.ts`（错误码 + Zod Schema）
- [ ] `messages/zh-CN.json` + `messages/en-US.json`
- [ ] `xx-i18n.ts`
- [ ] `xx-types.ts`
- [ ] 子功能 `yy/xx-yy-types.ts` + `yy/xx-yy-functions.ts`（如有）
- [ ] Provider 实现文件（如需，按 §2 决策放置）
- [ ] `xx-main.ts`
- [ ] `index.ts`（+ `xx-index.browser.ts` 如有 Client）
- [ ] `client/xx-client.ts`（如有）
- [ ] `package.json` / `tsconfig.json` / `tsup.config.ts` / `vitest.config.ts`
- [ ] `README.md`
- [ ] `packages/cli/templates/skills/hai-xx/SKILL.md`（Skill 模板）
- [ ] `pnpm typecheck` → `pnpm lint` → `pnpm test`

---

## 示例触发语句

- "创建一个 @h-ai/notification 模块，支持 email 和 sms 两种 Provider"
- "给 iam 模块新增一个 oauth 子功能"
- "给 storage 模块新增一个 oss Provider"
- "创建一个新模块，包含浏览器端客户端"
