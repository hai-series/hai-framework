# Package 模块开发规范

> 适用于 packages/ 下的文件的修改。模块专属的结构、生命周期、错误码、Provider 模式等规范。

## 先确定模块类型

生命周期约定适用于 reldb/cache/iam/ai 等有状态模块。core.init 同步返回 void 且无 close；datapipe、kit、api-contract 是纯函数/定义；serv 是 App 工厂；ui 是组件库。不要为这些模块补造 init/close 或 HaiResult 包装。

以 package.json.exports 为公开导入边界：/client、/adapter、UI 子路径可合法存在，禁止跨包导入未公开源码。Node/Browser 共享形态不代表能力完全相同，例如 crypto.password 仅服务端。

## 文件命名与职责

- 常规模块源文件使用 `<模块>[-<领域>]-<角色>[-<实体或实现>].ts`；同族文件的角色位置一致，例如 `scheduler-repository-task.ts`、`payment-provider-wechat.ts`。嵌套目录也保留模块前缀，便于日志、搜索和独立审阅定位。
- 框架固定入口 `index.ts`、条件入口 `browser.ts`、Svelte 组件 `PascalCase.svelte` 及其局部工具保留实际契约；`api-contract` 按协议领域命名 `payment-schemas.ts` 等，不叠加无意义的包名前缀。审查依据与 22 包例外见[代码风格清单](module-conventions.md#文件族清单)。
- `xx-main.ts`：模块主入口，仅生命周期管理（init/close）和 API 编排，禁止具体业务逻辑（调度循环、数据处理等）
- `xx-types.ts`：对外接口类型定义（public types）
- `xx-config.ts`：配置定义与默认值、错误定义（现有模块通常在 xx-types.ts；以实际定义为准）
- `xx-functions.ts`：具体业务逻辑委托目标
- `xx-i18n.ts`：i18n 消息获取器

## 导出规则

- 分清三层：`package.json.exports` 声明可导入的公开入口；入口文件选择公共符号；普通源文件的 `export` 只供模块内部跨文件复用，不自动成为包 API。
- 入口保持转发，不放业务逻辑；仅在源文件全部导出都属于公共契约时使用 `export *`。允许选择性导出、`export type`、明确别名和 Svelte 组件默认导出的转发，保留 client/server 条件入口。CLI 命令启动入口按命令契约处理。
- 内置 Provider、Repository、工厂依赖等类型放在实际实现边界，不经公共 barrel 转出。公开签名需要的扩展接口必须保留，例如 `PaymentProvider` 和 `AIStoreProvider`；不能只因仓库内调用少就删掉真实扩展能力。
- browser 分支先于 Node types，分别声明真实 types/default；声明打包后再次检查 type-only 语义，必要时改为明确类型列表，不能让不存在的运行时函数出现在可调用声明中。
- `exports` 的每个条件/子路径必须有真实构建文件与配套声明；不声明空实现或将目录通配当作任意内部文件的公开许可。
- 变更后构建受影响包，执行 `pnpm generate:api`、`pnpm check:api` 与 `pnpm test:api`，核对 [公开 API 清单](../../scripts/generated/module-api-inventory.md)。浏览器入口完整打包不得引入 Node 内建模块，Svelte 组件由真实编译器验证。
- 任何 API 变更必须同步实现、消费者、README、Skill 模板、LLMS 与测试。

## 错误处理

- 领域业务操作返回 `HaiResult<T>` 或 `Promise<HaiResult<T>>`，不得抛业务异常；工具/工厂/流及框架适配 API 按下述边界处理
- 调用方不应使用 `try/catch` 来处理模块返回的错误
- 错误码：每模块独占命名空间（注册表见 hai-module-create §4）；新模块 `NOT_INITIALIZED` 使用 `hai:<module>:010`，历史模块若不一致需在审查中标出并同步实现/文档
- 错误创建：错误码 + `xxM('key')`，禁止硬编码消息

### Throw / HaiResult 判定

- 领域业务 API：返回 HaiResult。纯工具、schema、工厂和配置 getter 等按公开签名返回直接值，不强行包装。
- 内部 helper / Provider / Repository：可 throw，但最近外层必须 catch 并转换为 HaiResult。
- `getOrThrow()` 等显式命名、async generator（如 `chatStream()`）、浏览器端 Client、CLI 命令可 throw；JSDoc 必须说明。
- 审查先确认签名和边界：普通业务异常不得越过 HaiResult API；显式抛错 API、SvelteKit 控制流和流迭代分别按契约判断。
- reldb.tx.wrap 回调正常返回就提交（包括返回失败 HaiResult）；回调内每次操作须检查 success，失败抛错以触发外层回滚。需透传原领域错误时改用 begin/rollback/commit。

### HaiResult 使用模式

```ts
// ✅ 返回 HaiResult
async function create(input: Input): Promise<HaiResult<Item>> {
  try {
    const item = await doCreate(input)
    return ok(item)
  }
  catch (error) {
    return err(HaiXxError.CREATE_FAILED, xxM('xx_createFailed'), error)
  }
}

// ✅ 返回 HaiResult（非异步）
function register(tool: Tool): HaiResult<void> {
  if (!isInitialized)
    return notInitialized.result()
  return ok(undefined)
}
```

## 模块生命周期

- 初始化统一 `<模块>.init(config)` / `<模块>.close()`
- `init()` 使用 `initInProgress` 防并发；并发调用返回 HaiResult 错误，`try/finally` 释放标记，禁止抛异常或泄漏连接
- 同一项跨端能力保持一致调用形态；Node 专属服务不伪造浏览器实现。浏览器纯配置/类型入口可显式收窄导出，文档须说明条件差异，不暴露独立 init 函数。
- 使用 NotInitializedKit 模式防止未初始化调用：
  - `core.module.createNotInitializedKit(HaiXxError.NOT_INITIALIZED, () => xxM('xx_notInitialized'))`
  - 每个子操作接口都有对应 `notInitialized.proxy<T>()` 占位
  - Proxy 在模块顶层创建（非 getter 内部）
  - close() 后状态回到未初始化，getter 自动切换回 Proxy

## 配置校验

生产共享状态要求以 `core.module.requiresSharedState(process.env)` 为准：`NODE_ENV` 或 `HAI_CORE_ENV` 为 production 时拒绝本机业务状态后端，显式 E2E 测试除外。初始化依赖、Provider 能力与故障恢复见[生产共享状态表](distributed-state.md)。公开初始化结果失败时不能继续启动依赖模块；自定义 Store 的 `stateScope` 必须反映真实持久化/原子能力，不能仅按工厂名称声明共享。

环境文件包含 `.env.example` 清单、`.env` 基础、`.env.dev/test/prod` 公共差异，以及不提交 Git 的 `.env.local` 和 `.env.<mode>.local` 私有值。统一优先级：进程 > 模式私有 > 全局私有 > 模式公共 > 基础 > YAML。Vite 使用 `core.config.loadEnvFiles`，Node 启动复用 `scripts/run-node.mjs`，不串联原生 `--env-file` 绕过结构合并；`core.init` 不自行读取 dotenv。宿主显式传入 `configSchemas` 提供路径与类型，业务校验留在模块。

- 应用从 YAML 加载配置时使用 `core.config.validate(name, schema)` 后检查结果；模块 init 自身仍须用模块 schema 校验直接传入的配置
- 不允许在模块入口做隐式注册/自动校验（避免副作用和隐藏依赖）
- Zod Schema 完整、导出 `XxConfig`（parse 后）+ `XxConfigInput`（用户输入）

## Provider 模式

- 新增 Provider 前必须确认同 PR/仓库内有 ≥2 个真实实现；否则用函数或对象直接实现
- Provider 接口：`{Module}Provider`；工厂：`create{Impl}Provider`
- Provider 用工厂 + 闭包实现，不用 class
- main.ts 不感知子功能内部的 Provider
- provider 位置：无子功能 → `src/providers/`；有子功能 → 子功能目录内

## 命名一致性

- 类名、文件名、变量名三者一致
- 接口名与实现工厂对应（例如 `StorageProvider` ↔ `createS3Provider`）
- 重命名必须同步更新：引用点、测试、注释、文档
- 名称应说明职责；避免在缺少上下文时使用 data / info / handle / process 等泛称。保留 HaiResult.data、日志 info、框架 handle 回调及 SDK 原生字段等既有契约，不为改名而破坏公共接口。
- 服务对象：小写模块名（`export const storage`）
- 函数接口：`{Module}Functions`；子操作接口：`{Domain}Operations`
- 错误定义：`Hai{Module}Error`（通过 `buildHaiErrorsDef` 生成，键名 UPPER_SNAKE）；错误类型：统一 `HaiError`
- Repository：`{Module}{Entity}Repository`，继承 `BaseReldbCrudRepository`
- i18n 获取器：`{缩写}M()`；消息键：`{module}_{camelCase}`
- 请求-响应结构体：请求体 `{Domain}Req`，响应体 `{Domain}Resp`（如 `LoginReq` / `LoginResp`）
- 关系表名统一：`hai_<module>_<feature>`（全小写 snake_case），例如 `hai_iam_users`
- 缓存 key 统一：`hai:<module>:<feature>`（全小写 + 冒号分隔），例如 `hai:iam:user:123`
- 表名与缓存 key 必须就近定义在使用处（Repository/Functions 文件内），禁止散落在 main/constants
- 表名与缓存 key 禁止通过配置项覆盖（无需支持可配置）

## 最小知识原则（API 设计）

### 导出最小化

- 只 export 使用方直接需要的类型/函数，内部辅助类型不导出
- `xx-types.ts` 中的公共类型只含使用方关心的字段，不暴露内部实现细节（DB 列名、Provider 内部状态等）
- 内置 Provider 的装配接口属于内部实现；公开注册/依赖注入契约所需的 Provider 类型可以导出，范围以真实扩展入口为准（如 `payment.registerProvider`、`AIStoreProvider`）。
- 模块消费者需要的上游类型，在模块自身 re-export，不要求消费者 import 上游包

### 参数精简

- 公共 API 参数 ≤ 3 个；超过必须合并为配置对象
- 配置对象字段尽可能可选（Zod `.default()` 提供合理默认值），只有使用方必须决策的字段才 required
- 禁止要求使用方传入内部概念（Provider 实例、内部 ID 格式、DB 连接句柄等）
- 布尔型开关参数禁止裸传，使用配置对象具名字段（`{ verbose: true }` 而非 `fn(true)`）

### 返回值聚焦

- 返回使用方关心的业务类型，不暴露 DB 行结构 / ORM 对象 / 内部中间态
- 需要返回部分字段时，定义专用类型（如 `XxSummary`），不使用 `Partial<XxInternal>`
- 分页结果统一使用 `PaginatedResult<T>` 包装，不自定义结构

### 封装边界

- 使用方通过 `xx.operation()` 调用，不直接调用内部 functions / utils
- 子功能通过 main 统一暴露（如 `iam.auth`），消费者不需要了解内部目录结构
- 模块间仅通过包公开入口导入服务对象与类型，不 import 对方内部文件
- 常见操作不要求调用方跨越多层对象 / 中间态 / Provider 才能完成
- 上游依赖在顶层注入一次，模块内部派生所需回调，禁止把转发样板交给使用方

## 类型约束

- 禁止 `any`，用 `unknown` + 类型缩窄
- 禁止 `as unknown as T`（第三方库 workaround 除外，须加注释）
- 对外类型集中在 `xx-types.ts`，不泄漏内部实现类型
- Core 的公共类型统一在 `core-types.ts`，Schema 在 `core-config.ts` 或其领域配置文件中维护；函数实现放 `functions/`，由 `core-main` 注册为 `core.xx`，不增加包级函数入口。Node 专属能力只注册到 Node main，浏览器不提供伪实现；配置/类型仍可供浏览器校验。
- 已有依赖包的类型直接 import，禁止定义本地鸭子类型

## 构建配置（tsup.config.ts）

- `defineConfig()` + `...baseConfig`，不覆盖基础属性
- `@h-ai/core` 列入 `external`（core 自身除外）；原生/大体积依赖必须 external

## 日志级别规范

| 位置                        | 级别                  | 说明                             |
| --------------------------- | --------------------- | -------------------------------- |
| init 重复初始化             | `warn`                | 提示重新初始化                   |
| init 进入/成功              | `info`                | 附带关键配置                     |
| init 失败                   | `error`               | 附带校验/异常信息                |
| close 已关闭/进入/完成      | `info`                | —                                |
| close 异常                  | `error`               | `{ error }`                      |
| 业务写操作                  | `debug`/`info`/`warn` | 进入 debug，成功 info，失败 warn |
| Provider connect/disconnect | `info`                | 附带连接目标                     |
| 读操作/查询                 | `debug`               | 不使用 info                      |
| 循环体内详细记录            | `trace`               | —                                |

### 日志脱敏

日志上下文中可能包含敏感信息时（URL / 连接字符串 / 配置对象中的 password、token、apiKey、secret 等），必须先通过 `sanitize*` 辅助函数脱敏后再传入 logger，禁止直接输出原始值。

| 场景                                        | 脱敏方式                                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| URL 类（redis://、postgres://、http:// 等） | 使用 `core.sanitize.sanitizeUrl()`；遮蔽 userinfo、敏感 query/OAuth fragment，非法地址返回固定占位符 |
| 配置对象                                    | 剥离或遮蔽 `password`/`token`/`apiKey`/`secret` 字段                                                 |
| 函数命名                                    | `sanitize{Subject}`，放在对应 Provider / functions 文件顶部                                          |

## 模块禁止事项

- 在 `xx-main.ts` 中编写具体业务逻辑（调度循环、数据处理等），main 仅做生命周期管理和 API 编排
- 在 HaiResult 型业务 API 中泄漏 throw（例外按上文边界判断）
- 错误码段位与已有模块冲突（段位注册表见 hai-module-create §4）
- 为单一实现新增 Provider / Factory / Strategy / Base 抽象
- 同一模块混用扁平方法与子操作对象两种 API 风格
- 做兼容性处理（开发期，不考虑兼容旧版本）
- 在模块内为已有依赖包的类型定义本地鸭子类型接口：若 `dependencies` 中已有对应包，直接 import 使用真实类型；禁止以 `as unknown as` 强转规避类型不兼容
- `as unknown as T` 类型强转：禁止用此模式绕过真实类型差异，应修改接口/函数签名使用正确的类型；合规例外：第三方库类型缺失时的 workaround（须加注释说明原因）
- 将表名/缓存 key 定义在模块 main、全局 constants 或配置文件中，导致与实现分离
- 将表名/缓存 key 设计为可配置项（如 `config.tableName` / `config.keyPrefix`）

公开声明与内部结构的 JSDoc 示例使用真实入口及合法参数；内部上下文要显式标明，禁止占位断言或虚构 export。具体范围、格式与仅编译不执行的校验见 [模块 JSDoc](module-conventions.md#jsdoc-与示例验证)。构建受影响包后运行 `node scripts/check-module-jsdoc.mjs --package <模块>`；全库最终执行 `pnpm check:jsdoc`。

## 文件族清单

本清单记录 22 个框架包的命名与导出边界。规则正文见[模块规范](module-conventions.md)，实际公开符号见[API 清单](../../scripts/generated/module-api-inventory.md)；不把普通源文件的 `export` 当作包的公开 API。

### 文件族

常规 TypeScript 源文件使用 `<模块>[-<领域>]-<角色>[-<实体或实现>].ts`。同一文件族保持角色位置一致，例如 `scheduler-repository-task.ts`、`scheduler-repository-log.ts`、`payment-provider-wechat.ts`。已有明确协议领域与框架固定名称按下表保留，避免只为增加前缀而产生路径迁移。

| 包           | 命名依据与保留的入口                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| ai           | `ai-*`、`ai-<领域>-*`；A2A Card 构建为 `ai-a2a-card.ts`，任务运行逻辑为 `ai-a2a-runtime.ts`                       |
| api-client   | `api-client-*`，`index.ts` 转发公共客户端契约                                                                     |
| api-contract | 根入口及协议领域目录；`payment-schemas.ts`、`storage-contract.ts` 等直接表达对应协议                              |
| audit        | `audit-*`；便捷记录器工厂只在模块内部复用                                                                         |
| cache        | `cache-*`，后端为 `cache-provider-*`                                                                              |
| capacitor    | `capacitor-*`，Node/Browser 条件入口保留对应构建契约                                                              |
| cli          | `cli-*`；命令启动入口与生成模板遵循 CLI、SvelteKit、Vite、Tauri 各自固定名称                                      |
| core         | `core-*`、`core-function-*`、`core-util-*`；Node/Browser 入口保持实际环境差异                                     |
| crypto       | `crypto-*`、`crypto-transport-*`；客户端子路径与服务端入口分开                                                    |
| datapipe     | `datapipe-*`；纯函数与显式抛错工具按签名处理                                                                      |
| deploy       | `deploy-*`、`deploy-<领域>-*`；容器与平台配置文件保留工具原生名称                                                 |
| feedback     | `feedback-*`；根入口为 Node 服务，`/client` 为浏览器采集器，`/bundle` 为 Node/浏览器共享的纯离线协议与工具        |
| iam          | `iam-*`、`iam-<领域>-*`；Provider 与 Repository 在实际实现目录中                                                  |
| kit          | `kit-*`；`browser.ts` 是已发布的条件入口，SvelteKit 路由文件保留框架名称                                          |
| payment      | Provider 统一为 `payment-provider-<渠道>.ts`，渠道协议工具为 `payment-<渠道>-<角色>.ts`                           |
| reach        | `reach-*`、`reach-provider-*`                                                                                     |
| reldb        | `reldb-*`、`reldb-provider-*`；内部 Provider 契约留在 providers 目录；纯 schemas 子路径独立构建                                              |
| scheduler    | `scheduler-*`；Repository 统一为 `scheduler-repository-<实体>.ts`                                                 |
| serv         | `serv-*`、`serv-feature-*`、`serv-middleware-*`；App 工厂保持实际生命周期                                         |
| storage      | `storage-*`、`storage-provider-*`；browser-safe schemas 子路径独立构建                                            |
| ui           | Svelte 组件保留 `PascalCase.svelte`，局部工具按组件/场景命名，`.svelte.ts` 表示实际 rune 模块；不改组件公共导入名 |
| vecdb        | `vecdb-*`、`vecdb-provider-*`；直接复用各可选 SDK 的真实类型                                                      |

`index.ts` 等转发入口可按公共契约选择性导出。仅当整个源文件都是公共契约时使用 `export *`。测试可按行为或对应源文件命名；源文件镜像测试随文件族同步迁移，测试夹具与框架路由不强加模块前缀。

### 冗余与边界

- A2A 的持久任务与事件只由共享 journal 发布。旧 `ReldbA2ATaskStore` 与 SDK 默认 handler 的重复装配已删除，不再注册旧 tasks 表。Card、send/stream/get/cancel/resubscribe 和不支持 RPC 的标准错误仍由完整 handler 契约覆盖；取消、代际、期限、租约与消息幂等规则不变。SDK ResultManager 的事件合并对象只用于当前事件的局部计算，合并结果与事件一次 CAS 发布，不能成为独立的任务权威。
- 内部审计记录器工厂通过源文件 export 供模块复用；调用方使用 `audit.helper` 与其公开 `AuditHelper` 类型。真实 Provider 注册扩展，如 `PaymentProvider`、`AIStoreProvider`，继续保留。
- Qdrant/Chroma 使用 type import 与动态 import，删除仿造 SDK 接口、重复字段断言和没有当前驱动依据的旧错误/返回值兼容分支。Qdrant 只把真实 REST 错误的顶层 HTTP 404 视为集合不存在；外部 named-vector 或 Manhattan 集合不映射为未命名 cosine 集合。Chroma 宽 metadata/filter 边界仍交给真实 SDK 校验，省略的可选 content 按当前 SDK 的字符串字段处理。
- Qdrant URL 复用 `core.sanitize.sanitizeUrl`，同时覆盖用户信息、敏感 query 和 fragment。原 logger 链已经再次脱敏；这里删除的是冗余局部 helper，不把 helper 的覆盖差异宣称为已发生的日志泄漏。

### 验证方式

迁移后核对旧路径零引用、相对导入大小写、实际包构建与公开入口声明，再执行受影响行为用例。可选后端类型与协议行为必须用对应真实 SDK/服务验证；mock 只验证受控故障或日志上下文边界。模板完整门禁与根全量测试在所有修正任务完成后统一执行。

## JSDoc 与示例验证

公开函数、常量、工厂、类以及全部 `type` / `interface` 都应紧邻声明编写中文 JSDoc。说明用途、状态所有者、默认值和单位；函数说明参数、返回值及实际失败方式。有生命周期时展示初始化结果检查和关闭；纯函数、工厂、Core、serv 和 kit 按各自真实契约使用。关键并发、授权、原子提交、外部效果与清理逻辑说明约束及失败边界，不用注释重复代码。

每个声明至少有一个 fenced `ts` / `svelte` 的 `@example`。公开用法从真实 package exports 导入并包含所需数据；业务操作先检查 `HaiResult.success`。示例不能靠 `any`、空对象断言、虚构 API 或未声明的业务变量通过。类型示例应展示有含义的数据或消费方式。

```ts
import { ok, type HaiResult } from '@h-ai/core'

const result: HaiResult<{ id: string }> = ok({ id: 'order-1' })
const label = result.success ? result.data.id : result.error.message
```

内部工厂或结构不能伪造包公开入口。它们的示例以 `@example 模块内部上下文` 标明，在声明的词法作用域内说明实际参数、状态或调用；不嵌入 `import` / `export`。无法提供真实调用前提时，可展示接收该类型的完整函数及其实际字段消费。Svelte `<script>` 内的注释使用 TypeScript 组件属性或 `mount` 示例，避免示例中的结束标签提前关闭宿主脚本。

仓库维护命令：

```sh
pnpm check:jsdoc
node scripts/check-module-jsdoc.mjs --package core
node scripts/check-module-jsdoc.mjs --package core --coverage-only
```

校验扫描自有运行时代码、Svelte 脚本、公开声明和全部内部结构；生成的 Paraglide 与构建声明不重复计入。公开示例独立使用真实发布声明和条件解析；内部示例在内存中注入原词法作用域。Svelte 示例通过实际编译器转换后类型检查。编译使用 `noEmit`，不执行示例、不写源码旁文件、不连接后端。门禁验证类型和可消费性，不能替代对注释语义、关键逻辑、真实 Provider 或 UI 行为的人工审查和行为测试。

先构建受影响包，再校验其公开示例；缺失构建不能用旧声明补成通过。修改示例不得扩大包导出面，公开入口变化继续执行 [API 边界验证](module-conventions.md#公开入口验证)。这些仓库脚本不复制到生成应用；应用示例以安装版本公开入口和自身类型检查为准。

## 公开入口验证

公开边界由 `package.json.exports`、入口转发和构建声明共同决定。[实际 API 清单](../../scripts/generated/module-api-inventory.md)覆盖 22 个包；完整 JSON 记录每个条件、子路径、导出名称和运行时/类型种类。普通源文件为跨文件复用而 export，不代表使用方可以跨包导入该文件。

维护公开入口时先确认用途。配置、业务类型、公开操作与实际扩展点保留；内置适配器、Repository 状态和工厂依赖留在实现目录。`PaymentProvider` 通过 registerProvider/getProvider 扩展支付渠道，`AIStoreProvider` 通过初始化注入存储，二者是公共契约。cache/storage/reldb/reach 的固定后端 Provider、LLM 内部适配器/工厂依赖、Context 组装依赖及会话存储键不属于包 API。删除没有实现的入口，不为它补造功能。

入口只聚合必要契约。允许选择性导出、类型转发、明确别名、Svelte 默认组件转发及 client/server 分隔。`export *` 适用于被转发源文件的全部导出都确为公共 API 的情况。Kit 的运行时方法通过 kit 命名空间及明确子路径使用；UI 只开放清单中的 13 个组件 barrel，保留样式资产子路径，不开放任意组件实现或内部存储 helper。Kit 没有 vite 插件；Vite 接入使用 `@sveltejs/kit/vite`，UI 开发预打包辅助使用真实的 `@h-ai/ui/vite`。

Node 与浏览器条件分别指向真实 JS 和声明文件，browser 分支在 Node types 前。IAM 浏览器入口只提供配置、错误与类型；AI 浏览器入口提供配置、协议、领域类型及 HTTP 客户端；服务端实例、构造器和工厂留在 Node。core 浏览器保留配置占位接口，文件配置方法按原契约返回 SERVICE_UNAVAILABLE。不能仅依据源码 type-only 标记判断发布声明：声明打包器可能把星号类型转发提升为可调用值，实际输出须用正负类型消费验证；必要时改为明确的类型列表。

更改公开 API 后按依赖顺序构建受影响包，再执行：

```sh
pnpm generate:api
pnpm check:api
pnpm test:api
```

`generate:api` 从实际构建产物生成快照，缺失产物会失败；`check:api` 验证快照与产物一致。`test:api` 使用真实自引用包解析检查 22 包声明、Node/Browser 条件及内部导出的拒绝，随后隔离进程导入各包，完整打包浏览器入口并拒绝 Node 内建模块。UI 经真实 Svelte 编译器转换并执行 SSR 导入，浏览器组件及 Rune 模块也完整编译；CLI 以独立进程运行 help/version。SvelteKit 的 `$app/navigation`、`$app/state` 是宿主提供的虚拟模块，不是 Node polyfill；CSS 只在此 JavaScript 图验证中省略输出，组件视觉行为仍需各自测试。

API 冒烟不初始化服务、连接外部后端、发送支付或消息，也不替代功能回归。更新 Schema 或扩展协议仍须同步调用方、三语 README、skills、LLMS、配置和对应验证。生成应用仅按安装版本的公开入口消费；仓库维护脚本不复制到应用。
