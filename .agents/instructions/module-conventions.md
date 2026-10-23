# Package 模块开发规范

> 适用于 packages/ 下的文件的修改。模块专属的结构、生命周期、错误码、Provider 模式等规范。

## 先确定模块类型

生命周期约定适用于 reldb/cache/iam/ai 等有状态模块。core.init 同步返回 void 且无 close；datapipe、kit、api-contract 是纯函数/定义；serv 是 App 工厂；ui 是组件库。不要为这些模块补造 init/close 或 HaiResult 包装。

以 package.json.exports 为公开导入边界：/client、/adapter、UI 子路径可合法存在，禁止跨包导入未公开源码。Node/Browser 共享形态不代表能力完全相同，例如 crypto.password 仅服务端。

## 文件命名与职责

- 常规模块源文件使用 `<模块>[-<领域>]-<角色>[-<实体或实现>].ts`；同族文件的角色位置一致，例如 `scheduler-repository-task.ts`、`payment-provider-wechat.ts`。嵌套目录也保留模块前缀，便于日志、搜索和独立审阅定位。
- 框架固定入口 `index.ts`、条件入口 `browser.ts`、Svelte 组件 `PascalCase.svelte` 及其局部工具保留实际契约；`api-contract` 按协议领域命名 `payment-schemas.ts` 等，不叠加无意义的包名前缀。审查依据与 21 包例外见[代码风格清单](../../docs/module-code-style.md)。
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
- 变更后构建受影响包，执行 `pnpm generate:api`、`pnpm check:api` 与 `pnpm test:api`，核对 [公开 API 清单](../../docs/module-api-inventory.md)。浏览器入口完整打包不得引入 Node 内建模块，Svelte 组件由真实编译器验证。
- 任何 API 变更必须同步实现、消费者、README、Skill 模板、LLMS 与测试。

## 错误处理

- 领域业务操作返回 `HaiResult<T>` 或 `Promise<HaiResult<T>>`，不得抛业务异常；工具/工厂/流及框架适配 API 按下述边界处理
- 调用方不应使用 `try/catch` 来处理模块返回的错误
- 错误码：每模块独占命名空间（注册表见 hai-create-module §4）；新模块 `NOT_INITIALIZED` 使用 `hai:<module>:010`，历史模块若不一致需在审查中标出并同步实现/文档
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

生产共享状态要求以 `core.module.requiresSharedState(process.env)` 为准：`NODE_ENV` 或 `HAI_CORE_ENV` 为 production 时拒绝本机业务状态后端，显式 E2E 测试除外。初始化依赖、Provider 能力与故障恢复见[生产共享状态表](../../docs/distributed-state.md)。公开初始化结果失败时不能继续启动依赖模块；自定义 Store 的 `stateScope` 必须反映真实持久化/原子能力，不能仅按工厂名称声明共享。

环境文件采用六类：`.env.example` 完整列出字段用途、默认值、枚举和范围；`.env` 为公共基础；`.env.dev`、`.env.test`、`.env.prod` 为公共环境覆盖，这五类均提交 Git。`.env.local` 为本机私有配置，不提交 Git。优先级为进程环境 > `.env.local` > 环境文件 > `.env`；Vite 在 Node 配置阶段调用 `core.config.loadEnvFiles({ mode, envDir })` 并检查 success 后注入进程，Node 脚本按相同顺序传入 `--env-file`。`core.init` 不自行读取 dotenv。

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
- 禁止含糊命名（如 data / info / handle / process）
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
- 错误码段位与已有模块冲突（段位注册表见 hai-create-module §4）
- 为单一实现新增 Provider / Factory / Strategy / Base 抽象
- 同一模块混用扁平方法与子操作对象两种 API 风格
- 做兼容性处理（开发期，不考虑兼容旧版本）
- 在模块内为已有依赖包的类型定义本地鸭子类型接口：若 `dependencies` 中已有对应包，直接 import 使用真实类型；禁止以 `as unknown as` 强转规避类型不兼容
- `as unknown as T` 类型强转：禁止用此模式绕过真实类型差异，应修改接口/函数签名使用正确的类型；合规例外：第三方库类型缺失时的 workaround（须加注释说明原因）
- 将表名/缓存 key 定义在模块 main、全局 constants 或配置文件中，导致与实现分离
- 将表名/缓存 key 设计为可配置项（如 `config.tableName` / `config.keyPrefix`）

公开声明与内部结构的 JSDoc 示例使用真实入口及合法参数；内部上下文要显式标明，禁止占位断言或虚构 export。具体范围、格式与仅编译不执行的校验见 [模块 JSDoc](../../docs/module-jsdoc.md)。构建受影响包后运行 `node scripts/check-module-jsdoc.mjs --package <模块>`；全库最终执行 `pnpm check:jsdoc`。
