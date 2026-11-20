# hai-core — 详细用法

HTTP/UI 边界只对明确的有效 4xx 状态公开业务提示；错误缺少 `httpStatus` 或状态非法时按 500 返回安全提示。手写业务错误须提供完整错误定义或显式状态，不能依赖缺省状态展示原文。

从 [SKILL.md](SKILL.md) 选择主题后读取对应小节。代码片段展示 API 用法；省略的业务变量、schema、依赖与 return 上下文需由应用补齐。

> `@h-ai/core` 是 hai-framework 的基础模块，提供配置管理、结构化日志、国际化、HaiResult 错误模型、Zod 校验错误本地化与模块生命周期工具。所有其他模块均依赖 core。

## 运行环境

**Node.js + 浏览器双端可用。** 构建工具自动选择正确入口（`package.json` exports 条件导出）。

| 能力 | Node.js | 浏览器 |
|------|---------|--------|
| `core.logger` | ✅ pino（结构化 JSON / pretty） | ✅ loglevel（DevTools console） |
| `core.config` | ✅ 读取 YAML、校验和监听文件 | 不能读取/监听本地文件；文件方法返回 `SERVICE_UNAVAILABLE` |
| `core.i18n` | ✅ 每个请求保留自己的语言，等待异步操作后不受其他请求影响 | ✅ 设置页面语言；`runWithLocale` 调用抛错 |
| `core.context` | ✅ 等待异步操作后仍可读取当前请求编号，其他请求不会覆盖它 | 仅同步回调中可读取，await 后不保留 |
| `core.access` | ✅ 可信地址与请求策略 | 不提供 |
| `core.zodValidation` | ✅ | ✅ |
| `core.id` | ✅ | ✅ |
| 工具函数 | ✅ | ✅ |

## 适用场景

- 项目初始化与配置加载
- 使用 `core.logger` 记录日志
- 使用 `core.config` 读取/校验模块配置
- 使用 `core.i18n` 管理多语言
- 使用 `core.zodValidation` 将 Zod 默认英文错误映射为模块自己的 i18n 文案
- 使用 `ok()` / `err()` 构建 HaiResult 类型返回值
- 创建模块级 logger 或 i18n 消息获取器

## 使用步骤

### 1. 初始化

```typescript
import { core } from '@h-ai/core'

// 加载 ./config 中的 YAML 配置到进程配置中心，返回 void。
core.init({ configDir: './config' })

// 可选启用配置监听
// 加载同一目录并监听配置变化，返回 void。仅在选用监听的初始化方式时调用。
core.init({ configDir: './config', watchConfig: true })
```

Core 扫描配置目录直属的 YAML。启用 `watchConfig` 后只监听本次成功加载的配置。单项读取或校验失败时记录文件位置和错误码，再继续加载其他文件。应用在启动时应确认必需配置已加载，并检查业务校验结果。目录扫描、日志设置等异常仍可能传播。项目根 `hai.json` 的 `build` / `deploy` 由 CLI 读取。

应用需要同时启动多个模块时，可将各模块的初始化/关闭函数交给 `core.module.createRuntime`。创建时只记录这些函数；调用返回对象的 start 按顺序初始化，close 反序释放，失败时清理已尝试启动的模块。两者返回 HaiResult，需检查 success。带注释的数据库/缓存示例见[应用启动与关闭](https://github.com/hai-series/hai-framework/blob/main/packages/core/README.md#应用启动与关闭)。

失败消息保留模块、错误码与配置字段路径，不回显配置值或 SDK 原始异常。启动配置错误附带原因和处理建议：`ext.fields` 配合 `HaiConfigError.CONFIG_ENV_VAR_MISSING.code` 明确提示环境变量未设置，`CONFIG_VALIDATION_ERROR.code` 或 Schema 异常提示校验未通过；只有字段路径时提示配置缺失或无效，不推断缺失。自定义启动钩子缺少必需变量时可抛出带上述错误码和 `ext: { fields: ['变量名'] }` 的异常。即使只打印 `error.message`，也能定位配置项并看到处理方式。

### 2. 使用功能

```typescript
// 记录 info 级服务启动日志，附端口 3000。返回 void。
core.logger.info('Server started', { port: 3000 })

// 取配置中心中名为 db 的已加载配置，未加载时返回 undefined。
const dbConfig = core.config.get('db')

// 将 zodError 的校验问题与 getMessage 映射为包含 field 和 message 的表单错误数组。
const formErrors = core.zodValidation.mapZodErrorToFormErrors(zodError, getMessage)
```

## 核心 API

### 生命周期

| 方法        | 签名                              | 说明                                      |
| ----------- | --------------------------------- | ----------------------------------------- |
| `core.init` | `(options?: CoreOptions) => void` | 同步扫描指定目录直属的全部运行时 YAML，无保留文件名 |

> `CoreOptions`：`{ logging?: Partial<LoggingConfig>, configDir?: string, configSchemas?: Readonly<Record<string, z.ZodType>>, watchConfig?: boolean }`
>
> 注意：core 没有 `close()` 方法，初始化后持续可用。

### 配置管理 — `core.config`

> 浏览器不能读取或监听本地配置文件，也没有 Node 专属的 resolve/mergeEnv/toEnv/parseEnv/stringifyEnv。`get()` 返回 `undefined`，`has()` 返回 `false`，`keys()` 返回 `[]`；`loadEnvFiles()` / `load()` / `validate()` / `reload()` 返回 `HaiCommonError.SERVICE_UNAVAILABLE`；`getOrThrow()` 抛错，`watch()` 立即回调不可用错误并返回不执行操作的取消函数。

| 方法         | 签名                                                           | 说明                           |
| ------------ | -------------------------------------------------------------- | ------------------------------ |
| `get`        | `<T>(name: string) => T \| undefined`                          | 获取模块配置段                 |
| `getOrThrow` | `<T>(name: string) => T`                                       | 获取配置（未加载时抛异常）     |
| `load`       | `<T>(name, filePath, schema?) => HaiResult<T>`       | 手动加载配置文件               |
| `validate`   | `<T>(name: string, schema: ZodType) => HaiResult<T>` | 用 Zod Schema 校验已加载的配置 |
| `has`        | `(name: string) => boolean`                                    | 检查配置段是否存在             |
| `reload`     | `(name: string) => HaiResult<unknown>`               | 重新从磁盘加载配置             |
| `clear`      | `(name?: string) => void`                                      | 清除配置缓存                   |
| `keys`       | `() => string[]`                                               | 获取所有已加载的配置名称       |
| `watch`      | `<T>(name, callback) => () => void`                            | 监听配置文件变更并自动重载     |
| `unwatch`    | `(name?: string) => void`                                      | 停止配置文件监听               |
| `isWatching` | `(name: string) => boolean`                                    | 检查是否正在监听某个配置       |

Node 的 `loadEnvFiles({ mode, envDir? })` 返回合并变量的 HaiResult，不修改进程；`core.init` 不自动读取 dotenv。`resolve`/`mergeEnv`/`toEnv`/`parseEnv`/`stringifyEnv` 用于配置生成，返回值可能含秘密，不能整体记录日志。完整来源与生成规则见[基础配置手册](https://github.com/hai-series/hai-framework/blob/main/docs/usage/configuration/runtime.md)。

`load(name, file, schema)` 按同步 Schema 解析并校验。扫描时可用 `configSchemas` 为插值提供类型提示。`validate()` 每次从最近一次成功加载的 YAML 快照出发，用当前环境变量和传入的 Schema 校验，`reload()` 会先重新读盘。Schema 失败返回 `CONFIG_VALIDATION_ERROR`，`error.cause` 保留 issues 或自定义校验抛出的异常。

`stringifyEnv()` 默认生成 Node dotenv，配合 `parseEnv()` 或 `loadEnvFiles()` 读取可保留值中的回车与 CRLF。文件编辑时保留生成行末的 `# hai:json` 标记。为 Compose 的 `env_file` 生成文本时指定 `{ target: 'compose' }`。

变量替换示例：`app.yml` 写 `port: ${PORT:3000}`，PORT 未设置时读取默认值 3000，`PORT=4000` 时读取 4000；设置 `HAI_APP_PORT=5000` 则直接覆盖为 5000，不再要求 PORT 存在。Schema 的数字/布尔字段可把单个表达式转换为对应类型，字符串字段保留前导零；混合文本仍为字符串。空串表示已设置，不使用默认值；环境值里的 `${PORT}` 保持原样，不继续替换。分步解释与可运行示例见[Core 文件与环境配置](https://github.com/hai-series/hai-framework/blob/main/packages/core/README.md#文件与环境配置coreconfig)。

**`watch()` 回调处理**：

监听支持原地写入、原子替换及删除重建。读取或校验失败时，回调收到错误，最近成功的缓存仍能读取。配置名尚未加载时立即回调 `CONFIG_NOT_LOADED`。底层监听无法创建或报错时返回 `SERVICE_UNAVAILABLE`，目录恢复后可以重新注册。重载成功只更新 Core 缓存，各业务模块按自己的生命周期应用设置。

```typescript
// watch 回调签名：(config: T | null, error?: HaiError) => void
// - 成功重载时：传入新配置，error 为 undefined
// - 重载失败时：config 为 null，error 为错误详情（包含 code 和 message）

// 监听 db 配置变化，返回取消函数。每次回调接收重载结果或错误。
const unwatch = core.config.watch('db', (cfg, error) => {
  if (error) {
    // 处理重载失败（如文件解析错误），不应更新本地使用的配置
    // 以 error 级记录 db 重载失败的错误码，返回 void。
    core.logger.error('Config reload failed', {
      name: 'db',
      code: error.code,
    })
    return
  }
  // 使用新配置
  // 注意：此时 core.config.get('db') 已经指向新数据
  // 记录 db 已更新的 info 日志，返回 void。
  core.logger.info('Config updated', { name: 'db' }) // 不记录含密码的完整配置
})

// 调用 watch 返回的无参函数移除这个监听，返回 void。
unwatch()
```

配置文件格式（YAML，支持约定式环境变量映射和显式插值）：

- YAML 根、对象、数组和叶子节点均可映射为 `HAI_<配置名>_<YAML 路径>`；配置名和 key 转大写、层级以 `_` 分隔，camelCase 不拆词
- 例如 `core.config.load('ai', ...)` 加载的 `llm.apiKey` 对应 `HAI_AI_LLM_APIKEY`，`llm.models[0].temperature` 对应 `HAI_AI_LLM_MODELS_0_TEMPERATURE`
- 父 JSON 提供节点基础，随后细项覆盖；例如 HAI_DB 提供连接基础，HAI_DB_HOST 细化主机。数组 JSON 替换完整列表，索引仅更新已有元素，缺少列表或越界报错。Schema 决定字段类型，字符串保留前导零，变量/JSON 中的内容不再次插值。
- 所有入口统一来源：进程 > `.env.<mode>.local` > `.env.local` > `.env.<mode>` > `.env` > YAML。同源先父后子，与行序无关；高来源整段替换清除低来源细项。约定变量优先于显式 `${VAR}`。`configSchemas` 由宿主显式传入，Core 不导入业务模块；扫描只使用结构，模块负责完整校验。

- `${VAR}` — 读取 `process.env.VAR`；缺失则返回 `HaiConfigError.CONFIG_ENV_VAR_MISSING` 错误
- `${VAR:default}` — 读取 `process.env.VAR`；缺失则使用默认值
- **类型还原**：整个值恰好是单个变量表达式时，结果还原为原生类型（number / boolean 等）；混合文本始终为字符串
- **空值语义**：`${VAR:}` 或值为空字符串的 `${VAR}` 保持为 `''`，不会被 YAML 解析为 `null`；是否把空字符串视为未配置由模块 Schema 明确定义

```yaml
# config/_core.yml
name: my-app
env: development
defaultLocale: zh-CN
logging:
  level: info
  format: pretty
```

`_core.yml` 只接受应用元数据和 logging；defaultLocale 由宿主读取后调用 `core.i18n.setGlobalLocale`，配置加载本身不切换语言。业务字段放独立 YAML，再用业务 Schema 校验，例如：

```yaml
# config/app.yml
feature:
  debug: false
  maxRetries: 3
  # 只有特殊变量名才需要显式语法：
  url: http://${HOST}:${PORT} # → string（混合文本，不还原）
```

<a id="worker-api"></a>

### 通过 `core.worker` 执行 CPU 工作

每个入口是应用发布的受信任 Worker 脚本。Node 传入 `new URL('./job-worker.mjs', import.meta.url)`。Vite 浏览器使用 `() => new Worker(new URL('./job-worker.js', import.meta.url), { type: 'module' })`。

- `core.worker.createPool<Input, Output>(entry, { maxWorkers, maxQueuedJobs, idleTimeoutMs? })` 按需起线程。每个线程收到一个任务后回复一次。等待队列满、池关闭、线程或消息失败分别返回通用的限流、未初始化、内部错误。对 `pool.run(input)` 检查 `success`，在所有者关闭时等待 `pool.close()`。
- `core.worker.start<Input, Output>(entry, options?)` 建立独占线程。用 `postMessage()` 发送、`onMessage()` 订阅并取得退订函数、`exited` 观察退出、`terminate()` 等待关闭。Node 选项支持 `workerData` 和 `execArgv`。状态协调和事务协议由调用模块管理。
- 消息使用结构化克隆。转移列表交出缓冲区所有权，Node 接收 ArrayBuffer，浏览器还可转移 ImageBitmap 等对象。传递业务操作所需的最小输入。

### 日志 — `core.logger`

`core.logger` 既是默认 Logger 实例，也是日志管理的统一入口。

`core.init` 加载 `_core.yml.logging`、`configure` 和 `setLevel` 会改变已有默认、模块及嵌套 child Logger 的后续实际输出；不需要重新创建模块 Logger。`create` 显式指定的 level/format/context 保持优先，未指定选项动态继承全局配置；调用时 context 覆盖固定 context，附加 redact 规则统一生效。

**日志记录**（实例方法）：`trace` / `debug` / `info` / `warn` / `error` / `fatal`

```typescript
// 用 info 级记录创建用户，附示例用户 ID 123。返回 void。
core.logger.info('User created', { userId: '123' })
// 用 error 级记录连接失败及捕获的 Error，返回 void。
core.logger.error('Failed to connect', { error })
// 用 debug 级记录当前 id 和 validation 步骤，返回 void。
core.logger.debug('Processing item', { id, step: 'validation' })
```

原生 `Error` 的 `name/message/stack/cause`、`AggregateError.errors` 与可枚举自有上下文先转成副本，再走字段/URL 脱敏与附加 `redact`；两端原异常均不变。Error 子图循环用 `[Circular]`，达到 32 层用 `[MaxDepth]`，自定义替换值也经过同一规范化；普通对象的循环与替换语义不变。自由文本不会自动解析秘密，可配置 `redact: ['error.message', 'error.stack']` 遮蔽整条诊断路径。

**管理方法**：

| 方法        | 签名                                   | 说明                     |
| ----------- | -------------------------------------- | ------------------------ |
| `create`    | `(options?: LoggerOptions) => Logger`  | 创建新 Logger 实例       |
| `child`     | `(context: Record<string, unknown>) => Logger` | 创建携带固定上下文的子 Logger |
| `configure` | `(config: Partial<LoggingConfig>) => void` | 配置全局日志选项（级别、格式等） |
| `setLevel`  | `(level: LogLevel) => void`            | 设置全局日志级别         |
| `getLevel`  | `() => LogLevel`                       | 获取当前全局日志级别     |

```typescript
// 创建名为 my-module 的日志实例，返回 logger。
const logger = core.logger.create({ name: 'my-module' })
// 通过模块 logger 记录初始化完成，返回 void。
logger.info('Module initialized')

// 基于当前 logger 创建带固定 requestId 的子 logger，返回该实例。
const reqLogger = core.logger.child({ requestId: 'req-001' })
// 用子 logger 写 debug 级请求日志并带上 requestId，返回 void。
reqLogger.debug('Request started') // 日志中自动包含 requestId

// 将全局日志设为 warn、JSON 格式并脱敏指定字段，返回 void。
core.logger.configure({
  level: 'warn',
  format: 'json',
  redact: ['password', 'token'], // 脱敏字段
})
// 把当前最低输出级别设为 debug，返回 void。
core.logger.setLevel('debug')
// 无参数，读取当前最低输出级别，此时是 'debug'。
const level = core.logger.getLevel() // 'debug'
```

日志级别、业务错误处理和字段选择见 [日志与错误诊断](../hai-app-create/logging.md)。

### 国际化 — `core.i18n`

| 方法                  | 签名                                                                  | 说明           |
| --------------------- | --------------------------------------------------------------------- | -------------- |
| `getGlobalLocale`     | `() => string`                                                        | 获取当前语言   |
| `setGlobalLocale`     | `(locale: string) => void`                                            | 浏览器语言/启动默认值；请求内只改当前上下文 |
| `runWithLocale`       | `<T>(locale: string, callback: () => T) => T`                           | Node 请求/SSR 异步语言隔离 |
| `createMessageGetter` | `(messages: Record<string, Record<string, string>>) => MessageGetter` | 创建消息获取器 |

创建模块 i18n：

```typescript
import enUS from '../messages/en-US.json'
import jaJP from '../messages/ja-JP.json'
import zhCN from '../messages/zh-CN.json'

// 用三个语言字典创建消息读取函数，调用时按选中的语言读取消息。
const m = core.i18n.createMessageGetter({
  'zh-CN': zhCN,
  'en-US': enUS,
  'ja-JP': jaJP,
})

// 使用
// 读取当前语言的 user_created 文本，中文下返回「用户已创建」。
m('user_created') // "用户已创建"
// 用 name 参数替换欢迎语中的占位符，中文下返回「欢迎，张三」。
m('welcome', { params: { name: '张三' } }) // "欢迎，张三"
```

### Zod 校验错误映射 — `core.zodValidation`

适用于 `@h-ai/kit`、`@h-ai/serv`、`@h-ai/api-client` 等需要把 Zod 默认英文错误
转换为模块自身 i18n 文案的场景。优先复用 `core.zodValidation`，不要在各模块重复维护
默认消息正则 / issue 本地化逻辑。

| 方法 | 签名 | 说明 |
|------|------|------|
| `createPrefixedZodMessageGetter` | `(prefix, getMessage) => ZodMessageGetter` | 按模块前缀自动派生 `serv_validation*` / `kit_validation*` 这类消息 key |
| `mapZodErrorToFormErrors` | `(error, getMessage) => ValidationFormError[]` | 一步完成提取 + 本地化 + 扁平化 |

```typescript
import type { ZodMessageGetter } from '@h-ai/core'
import { core } from '@h-ai/core'
import { z } from 'zod'

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  nickname: z.string().min(1, '请填写昵称'),
})

const getMessage: ZodMessageGetter = (key, params) => {
  switch (key) {
    case 'validationEmail':
      return '请输入合法邮箱地址'
    case 'validationStringMin':
      return `至少输入 ${params?.min} 个字符`
    default:
      return '输入不合法'
  }
}

const result = LoginSchema.safeParse({
  email: 'bad',
  password: '123',
  nickname: '',
})

if (!result.success) {
  // 用 serv 前缀和提供的翻译回调创建 Zod 消息读取函数。
  const getMessage = core.zodValidation.createPrefixedZodMessageGetter(
    'serv',
    (messageKey, params) => {
      if (messageKey === 'serv_validationEmail')
        return '请输入合法邮箱地址'
      if (messageKey === 'serv_validationStringMin')
        return `至少输入 ${params?.min} 个字符`
      return '输入不合法'
    },
  )
  // 用读取函数翻译本轮校验错误，返回表单字段与消息列表并保留 Schema 自定义消息。
  const errors = core.zodValidation.mapZodErrorToFormErrors(result.error, getMessage)

  errors[0]?.field // 'email'
  errors[0]?.message // '请输入合法邮箱地址'
  errors[2]?.message // '请填写昵称'（schema 自定义消息原样保留）
}
```

### ID 生成 — `core.id`

| 方法           | 签名                                    | 说明                          |
| -------------- | --------------------------------------- | ----------------------------- |
| `generate`     | `(size?: number) => string`             | nanoid（默认 21 字符）        |
| `short`        | `() => string`                          | 10 字符短 ID                  |
| `withPrefix`   | `(prefix: string, length?: number) => string` | 带前缀的 nanoid               |
| `trace`        | `() => string`                          | `trace-` 前缀 ID              |
| `request`      | `() => string`                          | `req-` 前缀 ID                |
| `uuid`         | `() => string`                          | UUID v4                       |
| `isValidUUID`  | `(value: string) => boolean`            | 校验 UUID 格式                |
| `isValidNanoId`| `(value: string, size?: number) => boolean` | 校验 nanoid 格式          |

```typescript
const id = core.id.generate()          // 'V1StGXR_Z5j3eK4uA9b8c'
const shortId = core.id.short()        // 10 字符
const prefixed = core.id.withPrefix('order_') // 'order_V1StGXR...'
const traceId = core.id.trace()        // 'trace-V1StGXR...'
const reqId = core.id.request()        // 'req-V1StGXR...'
const uuid = core.id.uuid()            // UUID v4

// 检查字符串是否是完整 UUID，示例的省略写法返回 false。
core.id.isValidUUID('f47ac10b-...')    // true/false
// 检查字母表及指定长度 6，示例 abc123 返回 true。
core.id.isValidNanoId('abc123', 6)     // true/false
```

#### UUID 生成规范（强制）

- 生成 UUID **一律用 `core.id.uuid()`**，禁止裸调 `crypto.randomUUID()`。
- 原因：`crypto.randomUUID` 仅在**安全上下文（HTTPS / localhost）**下可用，生产 http 环境会抛
  `crypto.randomUUID is not a function`；`core.id.uuid()` 仅使用 randomUUID 或密码学安全的 getRandomValues；两者不可用时明确抛错，绝不降级到 Math.random。
- 需要不带横线的 compact 形式：`core.id.uuid().replaceAll('-', '')`。
- 代码评审与新建代码时以此为准，发现裸调 `crypto.randomUUID()` 一律改走 `core.id.uuid()`。

### 工具函数

#### 类型检查 — `core.typeUtils`

`isDefined` / `isObject` / `isFunction` / `isPromise` / `isString` / `isNumber` / `isBoolean` / `isArray`

`isDefined` 同时排除 null 与 undefined；`isObject` 排除 null 和数组，但也接受 Date、Map 和类实例，不是纯对象判定。

#### 对象操作 — `core.object`

`deepClone` / `deepMerge` / `pick` / `omit` / `keys` / `values` / `entries` / `fromEntries`

`deepMerge` 只递归合并普通对象（含空原型对象）；数组、Date、Map、Set 和类实例由后值覆盖，不修改输入对象。

```typescript
// 从左到右合并 a、b、c 的对象属性，返回合并结果并忽略污染原型的键。
core.object.deepMerge(a, b, c)       // 递归合并（防原型污染）
// 只复制 obj 的 a、b 属性到返回对象。
core.object.pick(obj, ['a', 'b'])
// 复制 obj 中除 c、d 以外的属性到返回对象。
core.object.omit(obj, ['c', 'd'])
```

#### 字符串操作 — `core.string`

`capitalize` / `kebabCase` / `camelCase` / `snakeCase` / `pascalCase` / `truncate` / `trim` / `isBlank` / `isNotBlank` / `padStart` / `padEnd` / `constantTimeEqual`

```typescript
core.string.capitalize('hello')      // 'Hello'
core.string.kebabCase('helloWorld')  // 'hello-world'
// 比较两个字符串 a、b 是否相等，返回布尔值。
core.string.constantTimeEqual(a, b)  // Node 使用原生等长比较；浏览器不保证恒时
```

#### 数组操作 — `core.array`

`unique` / `chunk` / `groupBy` / `first` / `last` / `flatten` / `compact` / `shuffle` / `intersection` / `difference`

`groupBy` 的原型同名键（如 constructor、__proto__）也会建立独立的自有分组，数字键和分组内的输入顺序保持原有行为。

```typescript
core.array.unique([1, 1, 2])           // [1, 2]
core.array.chunk([1, 2, 3, 4], 2)      // [[1,2], [3,4]]
core.array.groupBy(items, item => item.type) // Record<string, T[]>
core.array.intersection([1, 2], [2, 3]) // [2]
```

#### 异步操作 — `core.async`

`delay` / `withTimeout` / `retry` / `parallel` / `serial` / `debounce` / `throttle`

超时不取消底层任务；重试只处理抛错/reject，不识别失败 HaiResult。当前 `maxRetries` 按总尝试次数计算，至少执行一次。`parallel` 验证并发参数为大于 0 的安全整数，非法值拒绝为 RangeError，任何任务均不执行；正常结果按输入顺序返回。debounce/throttle 保留传入回调的参数类型。

```typescript
// 等待 1000 毫秒，Promise 完成时无返回数据。
await core.async.delay(1000)
// 最多等待 /api 请求 5000 毫秒，返回此次 fetch 的结果，等待超时会拒绝。
await core.async.withTimeout(fetch('/api'), 5000)
// 运行 fn，每次失败后等待 1000 毫秒，总共最多执行三次，成功返回 fn 的结果，耗尽重试则拒绝。
await core.async.retry(fn, { maxRetries: 3, delay: 1000 })
// 最多并发处理 5 个 items 元素，返回按输入顺序排列的 processFn 结果。
await core.async.parallel(items, processFn, 5)  // 并发限制
// 把 fn 包装为延迟 300 毫秒的防抖函数，间隔内再次调用会重启计时。
const debouncedFn = core.async.debounce(fn, 300)
```

#### 时间操作 — `core.time`

`formatDate` / `timeAgo` / `now` / `nowSeconds` / `parseDate` / `isValidDate` / `addDays` / `addHours` / `startOfDay` / `endOfDay`

```typescript
// 把当前时间按给定年月日及小时分钟秒格式化为字符串。
core.time.formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')
core.time.timeAgo(new Date(Date.now() - 60000)) // '1 分钟前'
// 返回比 date 晚 7 天的新 Date。
core.time.addDays(date, 7)
```

### HaiResult 模型与错误处理

返回 `HaiResult<T>` 的操作须处理成功/失败分支；core 工具等直接返回值的 API 不套用此模式：

```typescript
import { ok, err, HaiCommonError } from '@h-ai/core'

// 成功
// 将 data 包装成 success=true 的 HaiResult。
return ok(data)

// 失败
// 将 NOT_FOUND 错误码和指定消息包装成 success=false 的 HaiResult。
return err(HaiCommonError.NOT_FOUND, 'Resource not found')
```

**使用模式**：

```typescript
const result = await someOperation()

// 模式1：直接检查
if (!result.success) {
  // 记录本次操作失败和 error 数据，返回 void。
  core.logger.error('Operation failed', { error: result.error })
  return result // 直接透传错误
}
const data = result.data

// 模式2：提前返回
if (!result.success)
  return result
// 后续代码可安全使用 result.data
```

## 错误码

Core 模块定义了两组标准错误码：

### `HaiCommonError`（通用错误）

| 错误码 | code | 说明 |
|--------|------|------|
| `HaiCommonError.NOT_INITIALIZED` | `hai:common:001` | 模块未初始化 |
| `HaiCommonError.INIT_FAILED` | `hai:common:002` | 初始化失败 |
| `HaiCommonError.INIT_IN_PROGRESS` | `hai:common:004` | 正在初始化中 |
| `HaiCommonError.UNAUTHORIZED` | `hai:common:100` | 未认证 |
| `HaiCommonError.FORBIDDEN` | `hai:common:101` | 无权限 |
| `HaiCommonError.TOKEN_EXPIRED` | `hai:common:102` | Token 已过期 |
| `HaiCommonError.TOKEN_INVALID` | `hai:common:103` | Token 无效 |
| `HaiCommonError.VALIDATION_ERROR` | `hai:common:200` | 校验失败 |
| `HaiCommonError.INVALID_REQUEST` | `hai:common:201` | 请求无效 |
| `HaiCommonError.PARAMETER_MISSING` | `hai:common:202` | 参数缺失 |
| `HaiCommonError.RATE_LIMIT_EXCEEDED` | `hai:common:203` | 请求频率超限（HTTP 429） |
| `HaiCommonError.NOT_FOUND` | `hai:common:300` | 资源不存在 |
| `HaiCommonError.ALREADY_EXISTS` | `hai:common:301` | 资源已存在 |
| `HaiCommonError.CONFLICT` | `hai:common:302` | 冲突 |
| `HaiCommonError.API_ERROR` | `hai:common:400` | API 错误 |
| `HaiCommonError.NETWORK_ERROR` | `hai:common:401` | 网络错误 |
| `HaiCommonError.TIMEOUT` | `hai:common:402` | 超时 |
| `HaiCommonError.SERVICE_UNAVAILABLE` | `hai:common:403` | 服务不可用 |
| `HaiCommonError.INTERNAL_ERROR` | `hai:common:500` | 内部错误 |
| `HaiCommonError.DATABASE_ERROR` | `hai:common:501` | 数据库错误 |
| `HaiCommonError.UNKNOWN_ERROR` | `hai:common:599` | 未知错误 |

**使用示例**：

```typescript
import { HaiCommonError, err } from '@h-ai/core'

// 创建错误实例
// 创建 success=false 的 HaiResult，包含 NOT_FOUND 错误码及用户不存在的消息。
err(HaiCommonError.NOT_FOUND, 'User not found')
// 创建带 VALIDATION_ERROR 的失败结果，将 validationErrors 作为错误原因。
err(HaiCommonError.VALIDATION_ERROR, 'Invalid email', validationErrors)
```

### `HaiConfigError`（配置错误）

| 错误码 | code | 说明 |
|--------|------|------|
| `HaiConfigError.CONFIG_FILE_NOT_FOUND` | `hai:core:010` | 配置文件不存在 |
| `HaiConfigError.CONFIG_PARSE_ERROR` | `hai:core:011` | YAML 解析失败 |
| `HaiConfigError.CONFIG_VALIDATION_ERROR` | `hai:core:012` | Schema 校验失败 |
| `HaiConfigError.CONFIG_ENV_VAR_MISSING` | `hai:core:013` | 必需环境变量缺失 |
| `HaiConfigError.CONFIG_NOT_LOADED` | `hai:core:014` | 配置未加载 |

**使用场景**：

```typescript
import { core, HaiConfigError } from '@h-ai/core'

// 按 schema 读取 ./config/db.yml 并注册为 db 配置。成功 data 是校验后的配置。
const result = core.config.load('db', './config/db.yml', schema)
if (!result.success) {
  if (result.error.code === HaiConfigError.CONFIG_FILE_NOT_FOUND.code) {
    // 记录配置文件缺失错误，返回 void。
    core.logger.error('Config file missing')
  }
  else if (result.error.code === HaiConfigError.CONFIG_VALIDATION_ERROR.code) {
    // 记录配置校验失败，附 error.cause 中的校验详情。
    core.logger.error('Config validation failed', { issues: result.error.cause })
  }
}
```

## 常见模式

### 服务端初始化（SvelteKit hooks.server.ts）

在应用已有的 init.ts 中执行 core.init({ configDir: './config', configSchemas })，configSchemas 登记所用模块的公开 Schema，再校验配置并初始化依赖模块；hooks.server.ts 等待该启动流程完成后接入 kit.createHandle。完整依赖顺序与失败清理见 [hai-build](../hai-build/SKILL.md)。不要在一个文件里同时 import 和声明同名 initModules。

### 配置校验最佳实践

```typescript
import { z } from 'zod'

const MyConfigSchema = z.object({
  apiKey: z.string().min(1),
  timeout: z.number().positive().default(5000),
})

// 模块初始化时校验
// 对配置中心的 myModule 配置应用 MyConfigSchema。成功 data 是通过校验和默认值处理的配置。
const result = core.config.validate('myModule', MyConfigSchema)
if (!result.success) {
  // 记录 myModule 配置失败及错误，返回 void。
  core.logger.error('Invalid config', { error: result.error })
  return result
}
const config = result.data // 类型安全
```

## 相关 Skills

- `hai-build`：项目整体架构与技能导航
- `hai-kit`：SvelteKit 集成层（Handle/Guard/Middleware）
- `hai-reldb` / `hai-cache` / `hai-iam`：使用 core.config 读取配置的下游模块

## 浏览器侧使用

> **禁止在应用中直接引入 `loglevel`。** `core.logger` 在浏览器端自动使用 loglevel 作为后端，API 与 Node.js 完全一致。

### 初始化

浏览器端无文件系统，不需要 `configDir`。在 `+layout.svelte` 或应用入口调用：

```typescript
import { core } from '@h-ai/core'

// 浏览器端：仅传入 logging 配置即可
// 在浏览器中以 info 最低日志级别初始化 Core，返回 void。
core.init({ logging: { level: 'info' } })
```

### 日志记录

```typescript
// 与 Node.js 完全一致的 API
// 以 info 级记录 /home 页面加载，返回 void。
core.logger.info('Page loaded', { route: '/home' })
// 以 error 级记录失败请求的 URL 和状态码，返回 void。
core.logger.error('API call failed', { url, status })

// 创建名为 my-page 的 logger 并返回。
const logger = core.logger.create({ name: 'my-page' })
// 记录获取的数据项数，使用 debug 级别并返回 void。
logger.debug('Data fetched', { count: items.length })

// ❌ 禁止直接引用底层日志库
// import log from 'loglevel'  ← 不要这样做
```

### 浏览器侧限制

| 功能 | 行为 |
|------|------|
| `core.config` 文件配置 | 不支持；文件相关方法返回 `SERVICE_UNAVAILABLE`，配置应由服务端读取后下发 |
| `format: 'json' \| 'pretty'` | 始终输出到 DevTools console；json 为包含 level/msg 的 JSON 字符串，pretty 为可读消息与上下文 |
| 自定义 `redact` 配置 | 与默认 sanitizeSensitiveFields 同时生效；支持嵌套点/括号路径与 `*`，不修改调用方对象；消息文本需调用方脱敏 |
| `fatal` 级别 | 阈值为 fatal 时只输出 fatal，由 console.error 写出。pretty 带 `[FATAL]` 前缀，json 使用 `level: 'fatal'` |
| `bigint` 和循环引用 | 控制台使用十进制字符串和 `[Circular]` 标记 |
| context 输出 | pretty 追加 JSON 上下文，json 合并上下文到结构化 JSON 字符串 |

云资源输出格式与部署配置消费见 [hai-deploy](../hai-deploy/SKILL.md)；这里的父节点覆盖规则同样适用。

### URL 日志脱敏

使用 `core.sanitize.sanitizeUrl(url)` 统一处理连接地址；它会遮蔽用户名、密码、敏感 query 参数和 OAuth 键值 fragment。非法地址返回固定占位符。`sanitizeSensitiveFields` 对 URL 类字段使用同一规则；自定义 matcher 同样匹配参数名，不能只遮蔽 userinfo 后记录含 token 的 URL。

脱敏副本不执行自定义 `toJSON()`，普通对象和类实例只复制自有可枚举数据属性，跳过访问器和原型；Date 转 ISO 字符串，URL 转脱敏字符串。原对象不变，副本用于诊断，不作为原类实例调用。仍需只选取必要字段，并明确清理未标注秘密和业务隐私。

```ts
// 脱敏 URL 中的 token 参数，保留 limit，返回处理后的 URL 字符串。
const safeUrl = core.sanitize.sanitizeUrl("https://example.com/a?token=value&limit=10")
// https://example.com/a?token=[REDACTED]&limit=10
```

Node 请求/SSR 必须用 `core.i18n.runWithLocale(locale, callback)`（kit 同名方法）包裹实际异步 resolve；serv 自动建立请求语言上下文。浏览器 setGlobalLocale/createLocaleStore 继续管理应用语言，SSR 的 UI setter/store 不写全局值。显式 MessageOptions.locale 优先；进程默认语言仅在启动时设置。

Node 入口的 core.string.constantTimeEqual 将原始 UTF-16 单元编码后使用 node:crypto.timingSafeEqual 比较等长字节，长度不相同时直接 false，长度本身不受保护。浏览器实现仅避免按内容提前返回，不提供 JavaScript 引擎级恒时保证，不用于服务端凭证校验。外围分支、编码和请求处理不因此自动成为恒时。
