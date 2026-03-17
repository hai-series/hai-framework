---
applyTo: "packages/**"
---

# Package 模块开发规范

> 编辑 packages/ 下的文件时自动激活。模块专属的结构、生命周期、错误码、Provider 模式等规范。

## 文件命名与职责

- `xx-main.ts`：模块主入口，仅生命周期管理（init/close）和 API 编排，禁止具体业务逻辑（调度循环、数据处理等）
- `xx-types.ts`：对外接口类型定义（public types）
- `xx-config.ts`：配置定义与默认值、错误码枚举
- `xx-functions.ts`：具体业务逻辑委托目标
- `xx-i18n.ts`：i18n 消息获取器

## 导出规则

- `index.ts` 仅做 `export *` 聚合，禁止选择性导出/重命名
- 在源文件中控制导出边界
- 任何 API 变更必须同步 README / Skill 模板 / 测试

## 错误处理

- 公共 API 禁止 throw，必须返回 `Result<T, XxError>` 或 `Promise<Result<T, XxError>>`
- 调用方不应使用 `try/catch` 来处理模块返回的错误
- 错误码：每模块独占千位段（注册表见 hai-create-module §4），NOT_INITIALIZED 固定为 X010
- 错误创建：错误码 + `xxM('key')`，禁止硬编码消息

### 合规 throw 场景

| 场景                                 | 说明                                         |
| ------------------------------------ | -------------------------------------------- |
| 内部 throw + 外层 try-catch → Result | 标准 catch-and-wrap 模式                     |
| `getOrThrow()` 等显式命名            | 函数名已表达 throw 语义                      |
| async generator（如 `chatStream()`） | 无法返回 Result，须 JSDoc 注明               |
| 浏览器端 Client 代码                 | `client/xx-client.ts` 等，不属于模块公共 API |
| CLI 命令                             | `packages/cli/` 中的命令行工具，非模块 API   |

### Result 使用模式

```ts
// ✅ 返回 Result
async function create(input: Input): Promise<Result<Item, XxError>> {
  try {
    const item = await doCreate(input)
    return ok(item)
  }
  catch (error) {
    return err({ code: XxErrorCode.CREATE_FAILED, message: xxM('xx_createFailed'), cause: error })
  }
}

// ✅ 返回 Result（非异步）
function register(tool: Tool): Result<void, XxError> {
  if (!isInitialized)
    return notInitialized.result()
  return ok(undefined)
}
```

## 模块生命周期

- 初始化统一 `<模块>.init(config)` / `<模块>.close()`
- Node 与 Browser 的 API 形态必须一致，浏览器端不暴露独立 init 函数
- 使用 NotInitializedKit 模式防止未初始化调用：
  - `core.module.createNotInitializedKit<XxError>(XxErrorCode.NOT_INITIALIZED, () => xxM('xx_notInitialized'))`
  - 每个子操作接口都有对应 `notInitialized.proxy<T>()` 占位
  - Proxy 在模块顶层创建（非 getter 内部）
  - close() 后状态回到未初始化，getter 自动切换回 Proxy

## 配置校验

- 模块使用配置前必须 `core.config.validate(name, schema)` 校验
- 不允许在模块入口做隐式注册/自动校验（避免副作用和隐藏依赖）
- Zod Schema 完整、导出 `XxConfig`（parse 后）+ `XxConfigInput`（用户输入）

## Provider 模式

- Provider 接口：`{Module}Provider`；工厂：`create{Impl}Provider`
- Provider 用工厂 + 闭包实现，不用 class
- main.ts 不感知子功能内部的 Provider
- provider 位置：无子功能 → `src/providers/`；有子功能 → 子功能目录内

## 命名一致性

- 类名、文件名、变量名三者一致
- 接口名与实现类名对应（例如 `StorageProvider` ↔ `S3StorageProvider`）
- 重命名必须同步更新：引用点、测试、注释、文档
- 禁止含糊命名（如 data / info / handle / process）
- 服务对象：小写模块名（`export const storage`）
- 函数接口：`{Module}Functions`；子操作接口：`{Domain}Operations`
- 错误码：`{Module}ErrorCode`（UPPER_SNAKE）；错误类型：`{Module}Error`
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
- Provider 接口是内部实现，禁止暴露给模块消费者
- 模块消费者需要的上游类型，在模块自身 re-export，不要求消费者 import 上游包

### 参数精简

- 公共 API 参数 ≤ 3 个；超过必须合并为配置对象
- 配置对象字段尽可能可选（Zod `.default()` 提供合理默认值），只有使用方必须决策的字段才 required
- 禁止要求使用方传入内部概念（Provider 实例、内部 ID 格式、DB 连接句柄等）
- 布尔型开关参数禁止裸传，使用配置对象具名字段（`{ verbose: true }` 而非 `fn(true)`）

### 返回值聚焦

- 返回使用方关心的业务类型，不暴露 DB 行结构 / ORM 对象 / 内部中间态
- 需要返回部分字段时，定义专用类型（如 `XxSummary`），不使用 `Partial<XxInternal>`
- 分页结果统一使用 `PageResult<T>` 包装，不自定义结构

### 封装边界

- 使用方通过 `xx.operation()` 调用，不直接调用内部 functions / utils
- 子功能通过 main 统一暴露（如 `iam.authn`），消费者不需要了解内部目录结构
- 模块间只依赖对方的公共类型（`xx-types.ts`），不 import 对方内部文件

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

| 场景                                        | 脱敏方式                                                                                |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| URL 类（redis://、postgres://、http:// 等） | `new URL()` 解析后将 `username`/`password` 替换为 `***`，解析失败返回 `'(invalid url)'` |
| 配置对象                                    | 剥离或遮蔽 `password`/`token`/`apiKey`/`secret` 字段                                    |
| 函数命名                                    | `sanitize{Subject}`，放在对应 Provider / functions 文件顶部                             |

## 模块禁止事项

- 在 `xx-main.ts` 中编写具体业务逻辑（调度循环、数据处理等），main 仅做生命周期管理和 API 编排
- 在公共模块 API 中使用 `throw`（必须返回 `Result<T, E>`）
- 错误码段位与已有模块冲突（段位注册表见 hai-create-module §4）
- 同一模块混用扁平方法与子操作对象两种 API 风格
- 做兼容性处理（开发期，不考虑兼容旧版本）
- 在模块内为已有依赖包的类型定义本地鸭子类型接口：若 `dependencies` 中已有对应包，直接 import 使用真实类型；禁止以 `as unknown as` 强转规避类型不兼容
- `as unknown as T` 类型强转：禁止用此模式绕过真实类型差异，应修改接口/函数签名使用正确的类型；合规例外：第三方库类型缺失时的 workaround（须加注释说明原因）
- 将表名/缓存 key 定义在模块 main、全局 constants 或配置文件中，导致与实现分离
- 将表名/缓存 key 设计为可配置项（如 `config.tableName` / `config.keyPrefix`）
