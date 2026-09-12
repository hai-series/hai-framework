# hai-create-module — 详细范本（reference）

> 本文件是 [SKILL.md](SKILL.md) 的范本附录，**仅在需要套用具体模板时主动加载**。
>
> SKILL.md 已包含全部决策表、原则与检查清单；本文件提供需按需求补齐的骨架与源码参考，不保证把不同变体直接拼接即可编译。
>
> 所有代码块均为示例占位（`xx` = 模块名，`yy`/`zz` = 子功能名，`aaa` = Provider 实现名），生成实际代码时必须替换。

## R1 配置 Schema 范本（对应 SKILL §4）

```ts
// xx-config.ts ——示例
import { z } from 'zod'
import { xxM } from './xx-i18n.js'

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

## R2 类型定义范本（对应 SKILL §3、§4）

```ts
// xx-types.ts ——示例
import type { ErrorInfo, HaiResult } from '@h-ai/core'
import type { XxConfig, XxConfigInput } from './xx-config.js'
import { core } from '@h-ai/core'

const XxErrorInfo = {
  CONNECTION_FAILED: '001:500',
  OPERATION_FAILED: '002:500',
  NOT_INITIALIZED: '010:500',
  UNSUPPORTED_TYPE: '011:400',
  CONFIG_ERROR: '012:500',
} satisfies ErrorInfo

export const HaiXxError = core.error.buildHaiErrorsDef('xx', XxErrorInfo)

export interface ZzOperations {
  create: (data: CreateInput) => Promise<HaiResult<Item>>
  get: (id: string) => Promise<HaiResult<Item | null>>
  remove: (id: string) => Promise<HaiResult<void>>
}

export interface XxFunctions {
  init: (config: XxConfigInput) => Promise<HaiResult<void>>
  close: () => Promise<HaiResult<void>>
  readonly config: XxConfig | null
  readonly isInitialized: boolean
  readonly zz: ZzOperations
}

// 仅无子功能 + 需多后端时
export interface XxProvider {
  readonly name: string
  connect: (config: XxConfig) => Promise<HaiResult<void>>
  close: () => Promise<void>
  isConnected: () => boolean
  readonly zz: ZzOperations
}
```

## R3 生命周期与 Provider 范本

先按 SKILL §1 决定模块类型，再参考下面真实实现；不要复制一个通用闭包后补造未需要的能力。下面链接均从仓库源码读取，避免范本与实际实现长期漂移。

### R3.1 无子功能 + 无 Provider

参考 [audit-main.ts](../../../packages/audit/src/audit-main.ts) 的生命周期及公开操作装配。业务逻辑留在 functions，main 管理依赖、状态和公共入口。

### R3.2 多 Provider

配置选择单一后端时参考 [reldb-main.ts](../../../packages/reldb/src/reldb-main.ts)；注册多个支付渠道时参考 [payment-main.ts](../../../packages/payment/src/payment-main.ts)。选择机制由实际需求决定，不把“Provider”一律等同于 config.type 切换。

### R3.3 有子功能

参考 [iam-main.ts](../../../packages/iam/src/iam-main.ts) 的 session/auth/authz/user 装配与 [iam-types.ts](../../../packages/iam/src/iam-types.ts) 的公共类型。用户使用 iam.auth，内部 authn 目录名不是公共 API。

### R3.4 NotInitializedKit 与 Getter

参考 [core-util-module.ts](../../../packages/core/src/utils/core-util-module.ts) 的公开 NotInitializedKit 类型与 [storage-main.ts](../../../packages/storage/src/storage-main.ts) 的占位 getter。

按实际资源验证以下边界：

- init 有并发标记及 finally 释放；配置校验失败不发布半初始化状态。
- 重新初始化先检查 close 的 HaiResult，关闭失败不继续创建新实例。
- connect 返回失败或抛异常时，释放本次已创建的 Provider；创建后续子功能失败时清理先前子功能。
- public close 按模块签名返回 HaiResult，不吞掉关闭错误；内部 Provider 的 close 可返回 void 或 HaiResult，以类型为准。
- 所有关闭/失败路径清空状态，getter 切回顶层创建的未初始化 Proxy；不得在 getter 中重复创建 Proxy。
- 纯函数、无资源模块不为套用范本添加 init/close；配置含凭据时公开 config 使用脱敏快照。

## R4 业务实现范本（对应 SKILL §3）

### R4.1 工厂函数

```ts
// xx-yy-functions.ts ——示例
import type { CreateYyInput, XxYyFunctions, XxYyFunctionsDeps } from './xx-yy-types.js'
import { core, err, ok } from '@h-ai/core'
import { HaiXxError } from '../xx-types.js'
import { xxM } from '../xx-i18n.js'

const logger = core.logger.child({ module: 'xx', scope: 'yy' })

export function createXxYyFunctions(deps: XxYyFunctionsDeps): XxYyFunctions {
  const { config } = deps
  return {
    async create(input: CreateYyInput) {
      logger.debug('Creating yy item', { name: input.name })
      if (!input.name) {
        return err(HaiXxError.VALIDATION_ERROR, xxM('xx_yy_nameRequired'))
      }
      try {
        const item = await doCreate(input)
        return ok(item)
      }
      catch (error) {
        return err(HaiXxError.OPERATION_FAILED, xxM('xx_yy_createFailed'), error)
      }
    },
  }
}
```

### R4.2 Provider 模式

- Provider 用**工厂 + 闭包**实现，不用 class。
- 模块级：`src/providers/xx-provider-aaa.ts`，实现 `XxProvider`。
- 子功能级：`src/yy/providers/xx-yy-provider-aaa.ts`，实现 `XxYyProvider`。
- 外部依赖通过 `createRequire` 动态加载。

### R4.3 Repository

- **继承 `BaseReldbCrudRepository<T>`**，class 命名 `{Module}{Entity}Repository`。
- 表名常量在 Repository 文件内就近定义，命名 `hai_<module>_<feature>`。
- 单一放模块根，子功能内放子功能目录，≥3 个时用 `repositories/` 集中。

### R4.4 i18n 获取器

```ts
// xx-i18n.ts ——固定模式
import { core } from '@h-ai/core'
import messagesEnUS from '../messages/en-US.json'
import messagesZhCN from '../messages/zh-CN.json'

type XxMessageKey = keyof typeof messagesZhCN
export const xxM = core.i18n.createMessageGetter<XxMessageKey>({
  'zh-CN': messagesZhCN,
  'en-US': messagesEnUS,
})
```

### R4.5 HTTP API 契约层（可选）

- 契约统一放在 `packages/api-contract`：`packages/api-contract/src/{module}/`（Schema + oRPC Contract）。
- 服务端 procedure 统一放在 `packages/serv/src/features/{module}-procedures.ts`。
- 应用通过 `@h-ai/api-client` typed client 调用，不在业务模块内新增 `./api` 子路径。

### R4.6 浏览器端 Client

```
src/client/xx-client.ts  —— 工厂函数 createXxClient(config) 创建
零 Node.js 依赖；使用 fetch；支持 getAccessToken / onAuthError 回调
```

### R4.7 日志脱敏

```ts
function sanitizeRedisUrl(url: string): string {
  try {
    const u = new URL(url)
    if (u.password) u.password = '***'
    if (u.username) u.username = '***'
    return u.toString()
  }
  catch {
    return '(invalid url)'
  }
}

logger.info('Redis connected', { address: sanitizeRedisUrl(config.url) })
```

## R5 messages JSON 范本

```jsonc
// messages/zh-CN.json —— 键名前缀统一为 xx_
{
  "xx_notInitialized": "XX 模块尚未初始化，请先调用 xx.init()",
  "xx_initFailed": "XX 模块初始化失败：{error}",
  "xx_unsupportedType": "不支持的类型：{type}"
}
```

规则：日志英文、代码注释中文、用户可见文本必须 i18n、键格式 `{module}_{camelCase}`。

## R6 注释规范（公共 API JSDoc）

```ts
/**
 * 创建存储客户端
 *
 * 根据配置初始化对应后端（S3/OSS/本地），建立连接并验证凭据。
 *
 * @param config - 存储配置（包含 type、bucket、credentials 等）
 * @returns 成功返回 StorageClient 实例；失败返回含错误码的 HaiResult
 *
 * @example
 * ```ts
 * const result = await storage.init({ type: 's3', bucket: 'my-bucket' })
 * if (result.success) {
 *   // 使用 storage 客户端
 * }
 * ```
 */
```

- 公共 API JSDoc **必须** `@example`，使用 ` ```ts ` 围栏，可执行片段（非伪代码）。
- 内部函数 JSDoc 重点：参数含义、返回结构、边界条件。
- 类型/接口：一句话用途 + 字段逐条说明 + 关键限制。
- 模块 section 分隔线：`// ─── 内部状态 ────`
- **代码注释中文、日志消息英文**。

## R7 测试规范要点

- 文件拆分：`<模块名>-init.test.ts`、`<模块名>-<feature>.test.ts`。
- 统一入口：通过服务对象（如 `crypto.asymmetric`、`storage.file`）调用，不直接调用内部工厂。
- 覆盖：正常 / 边界 / 参数选项 / 多实现。
- 断言：始终校验 `result.success`；失败时检查 `error.code`；**不用 try/catch 包裹 HaiResult API**。
- 外部依赖：优先 Testcontainers 隔离。
- 详细规范见 [test-conventions.instructions.md](../../instructions/test-conventions.instructions.md)。

## R8 包配置范本

### `package.json`（单入口）

```jsonc
{
  "name": "@h-ai/xx",
  "version": "0.1.0-alpha1",
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

### `package.json`（双入口 + Browser/Client）

```jsonc
{
  "exports": {
    ".": { "types": "...", "browser": "...", "import": "...", "default": "..." },
    "./client": { "types": "...", "import": "..." }
  }
}
```

### `tsconfig.json`

```jsonc
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "rootDir": ".", "outDir": "./dist" },
  "include": ["src/**/*", "messages/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### `tsup.config.ts`

```ts
import { defineConfig } from 'tsup'
import { baseConfig } from '../tsup.base'

export default defineConfig({
  ...baseConfig,
  entry: { index: 'src/index.ts' },
  external: ['@h-ai/core', 'zod'],
})
```

### `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config'
import { baseVitestConfig } from '../vitest.base'

export default defineConfig({ ...baseVitestConfig })
```

## R9 README 章节顺序（面向人类）

```text
# @h-ai/xx
一句话描述 + 核心价值。

## 支持的 xxx                  ← 能力概览
## 快速开始                    ← init → 核心操作 → close
  ### Node.js 服务端           ← 条件
  ### 浏览器客户端             ← 条件
## API 契约                    ← 条件：有 api 子模块
## API 概览                    ← 条件：子操作较多
## 配置
## 错误处理
## 测试
## License
```

禁止：贴完整类型 / 列完整 API 表 / 写内部实现原理 / 示例中出现 `console.log`。
