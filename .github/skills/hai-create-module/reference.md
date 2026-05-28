# hai-create-module — 详细范本（reference）

> 本文件是 [SKILL.md](SKILL.md) 的范本附录，**仅在需要套用具体模板时主动加载**。
>
> SKILL.md 已包含全部决策表、原则与检查清单；本文件只保留可直接复制粘贴的代码骨架与文件级模板。
>
> 所有代码块均为示例占位（`xx` = 模块名，`yy`/`zz` = 子功能名，`aaa` = Provider 实现名），生成实际代码时必须替换。

---

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

---

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
  close: () => Promise<void>
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

---

## R3 入口 main.ts 三种范本（对应 SKILL §1 决策表）

### R3.1 无子功能 + 无 Provider

```ts
// xx-main.ts ——示例
import type { HaiResult } from '@h-ai/core'
import type { XxConfig, XxConfigInput } from './xx-config.js'
import type { XxFunctions, ZzOperations } from './xx-types.js'
import { core, err, ok } from '@h-ai/core'
import { XxConfigSchema } from './xx-config.js'
import { HaiXxError } from './xx-types.js'
import { createXxFunctions } from './xx-functions.js'
import { xxM } from './xx-i18n.js'

const logger = core.logger.child({ module: 'xx', scope: 'main' })

let currentConfig: XxConfig | null = null
let currentZz: ZzOperations | null = null
let initInProgress = false

const notInitialized = core.module.createNotInitializedKit(
  HaiXxError.NOT_INITIALIZED,
  () => xxM('xx_notInitialized'),
)
const notInitializedZz = notInitialized.proxy<ZzOperations>()

export const xx: XxFunctions = {
  async init(config: XxConfigInput): Promise<HaiResult<void>> {
    if (initInProgress) {
      logger.warn('Xx init already in progress, skipping concurrent call')
      return err(HaiXxError.OPERATION_FAILED, xxM('xx_operationFailed', {
        params: { error: 'Concurrent initialization detected' },
      }))
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
      return err(HaiXxError.CONFIG_ERROR, xxM('xx_initFailed', {
        params: { error: error instanceof Error ? error.message : String(error) },
      }), error)
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

### R3.2 无子功能 + 有 Provider

```ts
// xx-main.ts ——示例（按 config.type 切换后端）
import type { HaiResult } from '@h-ai/core'
import type { XxConfig, XxConfigInput } from './xx-config.js'
import type { XxFunctions, XxProvider, ZzOperations } from './xx-types.js'
import { core, err, ok } from '@h-ai/core'
import { createTypeAProvider } from './providers/xx-provider-typeA.js'
import { createTypeBProvider } from './providers/xx-provider-typeB.js'
import { XxConfigSchema } from './xx-config.js'
import { HaiXxError } from './xx-types.js'
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

const notInitialized = core.module.createNotInitializedKit(
  HaiXxError.NOT_INITIALIZED,
  () => xxM('xx_notInitialized'),
)
const notInitializedZz = notInitialized.proxy<ZzOperations>()

export const xx: XxFunctions = {
  async init(config: XxConfigInput): Promise<HaiResult<void>> {
    if (initInProgress) {
      logger.warn('Xx init already in progress, skipping concurrent call')
      return err(HaiXxError.OPERATION_FAILED, xxM('xx_operationFailed', {
        params: { error: 'Concurrent initialization detected' },
      }))
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
        logger.error('Xx module initialization failed', {
          code: connectResult.error.code,
          message: connectResult.error.message,
        })
        return connectResult
      }
      currentProvider = provider
      currentConfig = parsed
      logger.info('Xx module initialized', { type: parsed.type })
      return ok(undefined)
    }
    catch (error) {
      logger.error('Xx module initialization failed', { error })
      return err(HaiXxError.CONNECTION_FAILED, xxM('xx_initFailed', {
        params: { error: error instanceof Error ? error.message : String(error) },
      }), error)
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
    finally {
      currentProvider = null
      currentConfig = null
    }
  },
}
```

### R3.3 有子功能

```ts
// xx-main.ts ——示例（main.ts 只组装子功能）
import type { HaiResult } from '@h-ai/core'
import type { XxConfig, XxConfigInput } from './xx-config.js'
import type { XxFunctions } from './xx-types.js'
import type { XxYyFunctions } from './yy/xx-yy-types.js'
import type { XxZzFunctions } from './zz/xx-zz-types.js'
import { core, err, ok } from '@h-ai/core'
import { XxConfigSchema } from './xx-config.js'
import { HaiXxError } from './xx-types.js'
import { xxM } from './xx-i18n.js'
import { createXxYyFunctions } from './yy/xx-yy-functions.js'
import { createXxZzFunctions } from './zz/xx-zz-functions.js'

const logger = core.logger.child({ module: 'xx', scope: 'main' })

let currentConfig: XxConfig | null = null
let currentYy: XxYyFunctions | null = null
let currentZz: XxZzFunctions | null = null
let initInProgress = false

const notInitialized = core.module.createNotInitializedKit(
  HaiXxError.NOT_INITIALIZED,
  () => xxM('xx_notInitialized'),
)
const notInitializedYy = notInitialized.proxy<XxYyFunctions>()
const notInitializedZz = notInitialized.proxy<XxZzFunctions>()

export const xx: XxFunctions = {
  async init(config: XxConfigInput): Promise<HaiResult<void>> {
    if (initInProgress) {
      logger.warn('Xx init already in progress, skipping concurrent call')
      return err(HaiXxError.OPERATION_FAILED, xxM('xx_operationFailed', {
        params: { error: 'Concurrent initialization detected' },
      }))
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
        logger.error('Xx module initialization failed', {
          code: yyResult.error.code,
          message: yyResult.error.message,
        })
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
      return err(HaiXxError.CONFIG_ERROR, xxM('xx_initFailed', {
        params: { error: error instanceof Error ? error.message : String(error) },
      }), error)
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

### R3.4 NotInitializedKit 与 Getter 三种变体

```ts
// 变体 A：Provider 引用（有 Provider 时）
const currentProvider: XxProvider | null = null
const notInitializedZz = notInitialized.proxy<ZzOperations>()
const xx = {
  get zz(): ZzOperations { return currentProvider?.zz ?? notInitializedZz },
}

// 变体 B：操作实例引用（有子功能工厂时）
const currentYy: XxYyFunctions | null = null
const notInitializedYy = notInitialized.proxy<XxYyFunctions>()
const xx = {
  get yy(): XxYyFunctions { return currentYy ?? notInitializedYy },
}

// 变体 C：布尔标志（操作是静态对象时）
const initialized = false
const deviceOps: DeviceOperations = { getInfo, getAppVersion }
const notInitializedDevice = notInitialized.proxy<DeviceOperations>()
const xx = {
  get device(): DeviceOperations { return initialized ? deviceOps : notInitializedDevice },
}
```

---

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

---

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

---

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

---

## R7 测试规范要点

- 文件拆分：`<模块名>-init.test.ts`、`<模块名>-<feature>.test.ts`。
- 统一入口：通过服务对象（如 `crypto.sm2`、`storage.file`）调用，不直接调用内部工厂。
- 覆盖：正常 / 边界 / 参数选项 / 多实现。
- 断言：始终校验 `result.success`；失败时检查 `error.code`；**不用 try/catch 包裹 HaiResult API**。
- 外部依赖：优先 Testcontainers 隔离。
- 详细规范见 [test-conventions.instructions.md](../../instructions/test-conventions.instructions.md)。

---

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

---

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
