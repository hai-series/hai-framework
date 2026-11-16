# @h-ai/core 功能说明

从 `@h-ai/core` 导入 `core`。在浏览器和 Node.js 中都能用它写日志、翻译消息和处理数据。在 Node.js 中还可以读取本地配置文件、为每个请求保存自己的编号，并检查访问条件。

[模块 README](../../../packages/core/README.md) · [配置清单](../configuration/core.md) · [数据结构](../data/core.md) · [应用开发](../getting-started/develop.md)

## 最小接入示例

```bash
pnpm add @h-ai/core
```

从 `@h-ai/core` 导入 `core` 后，就可以记录日志、读取消息或使用通用工具。`ok`、`err`、类型、Schema 和错误常量也从同一入口导入。运行自定义配置和表单校验示例前，请安装 Zod（`pnpm add zod`）。

### 初始化：`core.init`

Node 应用可以在启动时读取 YAML 并设置日志。浏览器只需传入页面使用的日志选项。数据库、缓存等模块的启动见[应用启动与关闭](#应用启动与关闭)。

#### Node.js

准备 `config/_core.yml`：

```yaml
name: orders
version: 0.1.0
env: development
defaultLocale: zh-CN
logging:
  level: info
  format: pretty
```

```ts
import type { CoreConfig } from '@h-ai/core'
import { core } from '@h-ai/core'

// 读取 config 目录。_core.yml 校验成功后以 core 为名存入缓存。
core.init({ configDir: './config' })
const settings = core.config.getOrThrow<CoreConfig>('core')

// 应用默认语言并记录启动成功。
core.i18n.setGlobalLocale(settings.defaultLocale)
core.logger.info('Application ready', { app: settings.name }) // app: 'orders'
```

`core.init()` 同步加载目录。单项配置读取或校验失败时，日志会记录文件和错误码，然后继续加载其他文件。示例中的 `getOrThrow()` 会在必需的 `core` 配置缺失时中止启动。目录扫描和日志设置仍可能抛出异常。

#### 浏览器

```ts
import { core } from '@h-ai/core'

// 在页面启动时设置日志阈值和默认语言。
core.init({
  logging: { level: 'warn' }
})
core.i18n.setGlobalLocale('zh-CN')

// 把请求编号写入日志，便于关联后续记录。
const requestId = core.id.request()
core.logger.warn('Request needs attention', { requestId })
```

浏览器里的 `core.init()` 使用页面代码传入的日志选项，示例直接在前端写入 `warn`。如果页面还需要显示服务器上的应用名称，可以让后端的页面加载函数返回 `{ name: settings.name }`，再由浏览器读取。在发送给浏览器的数据中只放页面要用、访客可以看到的值。数据库密码、传输私钥和完整 `_core.yml` 等配置留在服务器上。

在浏览器调用 `core.config.get()` 会得到 `undefined`，`core.config.has()` 得到 `false`，`core.config.keys()` 得到空数组。`core.config.loadEnvFiles()`、`core.config.load()`、`core.config.validate()` 和 `core.config.reload()` 返回带 `SERVICE_UNAVAILABLE` 的失败结果。`core.config.getOrThrow()` 会抛出异常。`core.config.watch()` 会立即把同一错误交给你的回调，并返回一个调用后什么也不做的停止函数。

## 功能说明

| 能力             | 解决的问题                                                                                   | 主要入口                                                |
| ---------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 配置与启动       | 加载 YAML、合并环境覆盖、校验配置，按依赖顺序编排模块启动与关闭                              | `core.config`、`core.init`、`core.module.createRuntime` |
| 结果与错误       | 用统一结果表达业务成败，定义错误码，在接口边界生成安全提示                                   | `HaiResult`、`ok` / `err`、`core.error`                 |
| 日志与诊断       | 结构化日志、请求关联、凭据脱敏及日志观察                                                     | `core.logger`、`core.context`、`core.sanitize`          |
| 国际化与校验提示 | 管理消息语言，隔离并发请求语言，把 Zod 错误转换为本地化字段提示                              | `core.i18n`、`core.zodValidation`                       |
| 请求访问控制     | 解析可信客户端地址，按路径、方法、IP 和时段检查请求                                          | `core.access`（Node 专属）                              |
| 通用工具         | 复用标识生成、类型检查、对象、字符串、数组、异步和时间操作，以及模块未初始化时的统一错误返回 | `core.id`、`core.typeUtils`、`core.object` 等           |

### Node 与浏览器的边界

两端都通过 `import { core } from '@h-ai/core'` 使用，由打包工具选择对应环境的代码。

| 能力                                                      | Node.js                                                        | 浏览器                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 日志、结果/错误、消息、通用工具，以及模块的顺序启动与关闭 | 支持                                                           | 支持                                                                     |
| YAML、dotenv、环境映射与文件监听                          | 可以读取和监听本地配置文件                                     | 不能读取或监听本地文件；调用加载方法会返回失败                           |
| 请求关联 `core.context.run`                               | 每个请求保留自己的编号等信息，等待异步操作后仍能读取，互不串用 | 只在回调的同步代码中保留信息，`await` 后不再保留                         |
| 请求语言 `core.i18n.runWithLocale`                        | 请求使用自己的语言，等待异步操作后也不会受其他请求影响         | 调用会抛错；用 `setGlobalLocale()` 设置页面语言，或在取消息时指定 locale |
| 请求策略 `core.access`                                    | 可以检查请求地址、路径和时段                                   | 不提供此工具                                                             |

`core.init()` 只负责 Core 的配置和日志设置，同步返回 `void`，Core 没有 `close()` 方法。应用如果还需要启动数据库、缓存等模块，可用 `core.module.createRuntime()` 集中管理它们：调用返回对象的 `start()` 依次初始化，调用 `close()` 按相反顺序清理。下方“应用启动与关闭”给出完整示例。

### 文件与环境配置：`core.config`

读取 YAML、应用环境变量覆盖、检查配置类型，并管理配置缓存与文件监听。下列文件与环境操作仅在 Node 中可用。

#### 加载、校验与读取

`core.init({ configDir, configSchemas?, watchConfig? })` 扫描指定目录直属的 `.yml` / `.yaml` 文件；`_core.yml` 注册为 `core`，`_db.yml` 注册为 `db`，`app.yml` 注册为 `app`。构建/部署设置由 CLI 从项目根 `hai.json` 读取，不属于运行时 YAML。

`core.init()` 自动检查 `_core.yml` 里允许的五个字段，并补齐未填写的名称、版本、运行环境和默认语言。写 `logging: {}` 会应用默认的 `info` 级别和 `json` 格式。完全省略 `logging` 会保留应用当前的日志设置。启动代码直接传入的 `core.init({ logging })` 优先使用。完整默认值、日志示例和 HTTP 访问设置的文件位置见 [Core 配置清单](../configuration/core.md)。

应用自己的 `app.yml` 可以用 `AppSchema` 指明哪些字段可省略、环境变量替换后的值应该是字符串还是数字。将它作为 `configSchemas.app` 传给 `core.init()`，Core 读取目录时会用它识别这些字段。再调用 `core.config.validate('app', AppSchema)` 验证字段取值，成功后从 `data` 读取配置。

`core.config.validate()` 用最近一次成功读到的 YAML 内容，重新应用当前环境变量，再验证取值。例如 `code: ${APP_CODE:00123}` 在变量未设置时，按字符串规则校验会得到 `'00123'`，即使上次读取得到的是数字 `123`。要读磁盘上刚改过的 YAML，调用 `core.config.reload()`。读文件和校验都成功后才会替换已保存的配置。

以下文件示例使用这份 `config/app.yml`，并假设没有额外环境变量覆盖：

```yaml
# config/app.yml
port: 3000
```

只需要一份配置时，直接用 `load()` 读盘并传入同步 Schema。Schema 拒绝数据或自定义校验抛错时，返回 `CONFIG_VALIDATION_ERROR`，在 `error.cause` 中保留问题列表或原始异常。`get()` 和 `getOrThrow()` 的泛型只声明读取类型，数据的校验由 Schema 完成。

```ts
import { core } from '@h-ai/core'
import { z } from 'zod'

const AppSchema = z.object({
  port: z.number().int().min(1).max(65535),
})

// 读取文件并立即校验。成功时得到 { success: true, data: { port: 3000 } }。
const loaded = core.config.load('app', './config/app.yml', AppSchema)
if (!loaded.success)
  throw new Error(loaded.error.message, { cause: loaded.error })

// 以下结果假设当前只加载了 app。
core.config.has('app') // true
core.config.keys() // ['app']
core.config.get<z.infer<typeof AppSchema>>('app') // { port: 3000 }
core.config.getOrThrow<z.infer<typeof AppSchema>>('app') // { port: 3000 }
```

#### 重载、监听与清理

`reload()` 重新读盘并通知订阅方。`watch()` 监听父目录中的目标文件，所以普通保存、原子替换和删除后重建都能触发重载。读取或校验失败时，旧缓存继续可用，回调收到 `null` 和错误。

- 配置名尚未加载时，`watch()` 立即回调 `CONFIG_NOT_LOADED`。
- 系统无法建立监听或监听过程中报告错误时，回调收到 `SERVICE_UNAVAILABLE`，`isWatching()` 返回 `false`。目录恢复后可重新调用 `watch()`。
- 取消函数只移除当前回调。`unwatch(name)` 停止该配置的所有监听，`clear(name)` 还会移除缓存，两者省略名称时作用于全部配置。

同名配置要换到另一份文件时，先停止原监听，再加载并监听新文件。

`core.init()` 默认关闭 `watchConfig`。打开后只监听本次成功加载的文件。重载只更新 Core 缓存，应用模块按自己的生命周期重新应用设置。

```ts
import { core } from '@h-ai/core'

// 接着上一个示例。成功重载时，回调取得当前端口。
const stop = core.config.watch<{ port: number }>('app', (settings, error) => {
  if (error) {
    core.logger.warn('App config watch reported a failure', { code: error.code })
    return
  }
  core.logger.info('App config reloaded', { port: settings?.port })
})

try {
  // 主动读取一次。文件仍为 port: 3000 时，回调记录 port: 3000。
  const reloaded = core.config.reload('app')
  if (!reloaded.success)
    throw new Error(reloaded.error.message, { cause: reloaded.error })
}
finally {
  stop()
  core.config.clear('app')
}
```

#### 环境变量如何改变 YAML 配置

框架根据配置名和字段位置自动确定用于覆盖配置的环境变量名。例如文件 `app.yml` 的 `port` 对应 `HAI_APP_PORT`，嵌套的 `http.maxRetries` 对应 `HAI_APP_HTTP_MAXRETRIES`。每层转大写并用 `_` 连接，camelCase 不拆词；YAML 不必写 `${...}` 才能被覆盖。

先看一个固定值的例子：YAML 写 `port: 3000`，没有 `HAI_APP_PORT` 时得到 3000，设置 `HAI_APP_PORT=5000` 后得到 5000。

在 YAML 中写 `${变量名}`，读取时就会用对应环境变量的值替换这段表达式。冒号后面的文字是在变量没有设置时使用的默认值：

| YAML 写法                    | 环境输入                         | 读取结果                                                 |
| ---------------------------- | -------------------------------- | -------------------------------------------------------- |
| `port: ${PORT}`              | `PORT=4000`                      | 使用 4000；若 PORT 没设置，返回 `CONFIG_ENV_VAR_MISSING` |
| `port: ${PORT:3000}`         | 没有 PORT                        | 使用表达式中的默认值 3000                                |
| `port: ${PORT:3000}`         | `PORT=4000`、`HAI_APP_PORT=5000` | 使用 5000，约定变量优先                                  |
| `label: server-${PORT:3000}` | `PORT=4000`                      | 拼成字符串 `server-4000`                                 |

实际读取顺序是：先检查 `HAI_APP_PORT`；有值就直接覆盖这一项，不再解析该项的 `${PORT...}`。否则读取 YAML：写了表达式才查 PORT，写的是固定值就直接用固定值。因此已有 HAI_APP_PORT 覆盖时，不要求 PORT 也存在。

同一份环境来源可以先给父对象 JSON，再覆盖具体字段：`HAI_APP='{"port":3000,"label":"local"}'` 配合 `HAI_APP_PORT=4000`，结果是 port=4000、label=local，与行顺序无关。高优先级来源整体替换对象时，不会继续保留低来源的细项覆盖。数组 JSON 替换整个列表，索引变量只修改已有项，越界报错。

#### 从 .env 文件读取变量

在 Node 入口调用 `loadEnvFiles()`，检查 `success` 后把结果装入 `process.env`，再加载 YAML。`development` 和 `production` 分别选择 `dev` 和 `prod` 对应的文件。缺失的文件会跳过，同一文件重复声明键会报错。

优先级从高到低为进程环境、`.env.<mode>.local`、`.env.local`、`.env.<mode>`、`.env`，最后由 YAML 提供基础值。`loadEnvFiles()` 会合并进程中已有的 `HAI_*` 变量和 dotenv 文件已声明的同名变量。含私密值的 `.local` 文件应留在本机。

```ts
import { core } from '@h-ai/core'

// 准备 config/app.yml（port: 3000）和 .env（HAI_APP_PORT=4000）。假设没有更高优先级的覆盖。
const result = core.config.loadEnvFiles({ mode: 'dev', envDir: '.' })
if (!result.success)
  throw new Error(result.error.message, { cause: result.error })

Object.assign(process.env, result.data)
core.init({ configDir: './config' })
core.config.get('app') // { port: 4000 }
```

#### 替换后的值是什么类型

环境变量原本都是文本。给 `load()` / `resolve()` 传入 Zod Schema 后，框架会按字段类型转换替换结果：`z.number()` 对应数字，`z.boolean()` 对应布尔值，`z.string()` 保留字符串。

例如 `${PORT:3000}` 占据整个值时，可得到数字 3000；`${ENABLED:false}` 可得到布尔值 false。`server-${PORT:3000}` 带有其他文字，拼接后仍是字符串。字符串字段 `code` 的默认文本 00123 保持为 `'00123'`，不会丢掉前导零。下面不用读文件，直接给出相同的 YAML 内容和环境数据来演示：

```ts
import { core } from '@h-ai/core'
import { z } from 'zod'

// 用显式环境数据演示覆盖顺序、数值/布尔转换与字符串保留。
const AppSchema = z.object({
  port: z.number(),
  enabled: z.boolean(),
  label: z.string(),
  code: z.string()
})
const resolved = core.config.resolve({
  name: 'app',

  value: {
    // eslint-disable-next-line no-template-curly-in-string -- 保留供配置解析器处理的字面占位符。
    port: '${PORT:3000}',
    // eslint-disable-next-line no-template-curly-in-string -- 保留供配置解析器处理的字面占位符。
    enabled: '${ENABLED:false}',
    // eslint-disable-next-line no-template-curly-in-string -- 保留供配置解析器处理的字面占位符。
    label: 'server-${PORT:3000}',
    // eslint-disable-next-line no-template-curly-in-string -- 保留供配置解析器处理的字面占位符。
    code: '${APP_CODE:00123}'
  },
  environment: { PORT: '4000', HAI_APP_PORT: '5000' },
  schema: AppSchema,
})
if (!resolved.success)
  throw new Error(resolved.error.message, { cause: resolved.error })

// resolved：{ success: true, data: { port: 5000, enabled: false, label: 'server-4000', code: '00123' } }。

// resolve 只做替换和类型还原；再用 Schema 确认最终数据符合要求。
const validated = AppSchema.safeParse(resolved.data)
if (!validated.success)
  throw new Error(validated.error.message, { cause: validated.error })
core.logger.info('Config resolved', { port: validated.data.port }) // port: 5000
```

空字符串表示“变量已经设置，只是内容为空”，不会被当成缺失、null、false 或 0。例如 `APP_CODE=''` 会使 code 保持 `''`，不会改用 00123；是否允许空串由 Schema 决定。数字字段收到空串则通常校验失败。

变量替换只处理 YAML 中的表达式；环境变量或父 JSON 中的 `server-${PORT}` 会按原文保留。例如 `HAI_APP_LABEL='server-${PORT}'` 最终仍为 `server-${PORT}`。需要替换时，把表达式写在 YAML 中。

没有 Schema 时，框架按现有 YAML/JSON 结构识别路径，并对单个表达式按 YAML 规则解释数字/布尔值；缺少的合法可选路径可由 `configSchemas` 提供。最终业务校验仍应通过 `validate()` 或模块 init 执行。

#### 生成配置文件时使用的工具

`resolve()` 也可供构建/部署工具在内存中计算配置。`toEnv()` 把对象转为环境变量，`mergeEnv()` 合并多个来源，`stringifyEnv()` / `parseEnv()` 编解码 .env 文本；这些工具不自动脱敏。

```ts
import { core } from '@h-ai/core'

// 配置生成器把普通对象转成 HAI_APP_PORT 等变量；数组保留为 JSON。
const values = core.config.toEnv({
  prefix: 'HAI_APP',
  value: {
    port: 3000,
    tags: ['local']
  }
})
// values：{ HAI_APP_PORT: '3000', HAI_APP_TAGS: '["local"]' }。
const merged = core.config.mergeEnv([
  values,
  { HAI_APP_PORT: '4000' }
])
// merged：{ HAI_APP_PORT: '4000', HAI_APP_TAGS: '["local"]' }。
const text = core.config.stringifyEnv(merged) // 编码为可写入 .env 的文本。
// text 含以下两行，每行以换行符结尾：
// HAI_APP_PORT='4000'
// HAI_APP_TAGS='["local"]'
const restored = core.config.parseEnv(text) // 解析回字面字符串，不执行其中的变量。
// restored：{ HAI_APP_PORT: '4000', HAI_APP_TAGS: '["local"]' }。
core.logger.info('Generated config verified', { port: restored.HAI_APP_PORT })
```

普通对象默认展开，数组、动态字典和空对象保留为 JSON。默认生成的 Node dotenv 由 `parseEnv()` 或 `loadEnvFiles()` 读取，值里的回车（`\r`）和 CRLF 都能保留。请保留生成行末的 `# hai:json` 标记。供 Compose 的 `env_file` 使用时，传入 `{ target: 'compose' }`。[基础配置手册](../configuration/runtime.md)

### 记录日志：`core.logger`

日志按 `trace`、`debug`、`info`、`warn`、`error`、`fatal` 递增，只输出达到当前阈值的记录。阈值为 `fatal` 时只输出这一等级，应用自行决定是否退出。

默认日志级别为 `info`，格式为 `pretty`。在 YAML 中提供 `logging` 对象时，其省略的 `format` 由 Schema 补为 `json`。Node 使用 pino，缺少可选的 `pino-pretty` 时输出 JSON。浏览器写入开发者控制台，其中的 `bigint` 值输出为十进制字符串，循环引用显示为 `[Circular]`。

```ts
import { core } from '@h-ai/core'

core.logger.setLevel('info')
core.logger.debug('Read started') // 低于 info，跳过。
core.logger.info('Order created', { orderId: 'order-1' }) // 日志包含 orderId。
core.logger.warn('Retry scheduled')
core.logger.error('Operation failed', {
  error: new Error('Example failure')
})
```

`create()` 创建有名称的 Logger，`child()` 给后续日志附带固定字段。`configure()` 设置输出与附加脱敏路径，`setLevel()` / `getLevel()` 调整或查看全局级别。

```ts
import { core } from '@h-ai/core'

core.logger.configure({
  level: 'info',
  format: 'json',
  redact: ['customer.email'],
})
const orders = core.logger.create({ name: 'orders' })
const request = orders.child({ requestId: 'request-1' })

orders.info('Order created', {
  customer: { email: 'user@example.com' },
}) // customer.email: '[REDACTED]'
request.warn('Request needs attention') // requestId: 'request-1'
core.logger.getLevel() // 'info'
```

已有默认、模块和嵌套 child Logger 的后续输出会使用当前全局配置，`setLevel()` 也即时生效。`create()` 显式指定的 level/format/context 优先；未指定项动态继承，调用时上下文覆盖固定上下文，当前请求关联字段再由 `core.context` 附加。浏览器 JSON 输出包含 `level` / `msg`，pretty 输出可读消息和上下文。

`observe()` 用于诊断采集，接收经过当前级别过滤与脱敏的记录，返回解除订阅的函数。回调只做有界内存收集，持久化由应用另行异步完成；它不代表日志已保存。回调异常与同步重入被隔离。

```ts
import { core } from '@h-ai/core'

const recentMessages: string[] = []
const stop = core.logger.observe((record) => {
  if (recentMessages.length === 100)
    recentMessages.shift()
  recentMessages.push(record.message)
})
try {
  core.logger.warn('Observed event')
  recentMessages // ['Observed event']
}
finally {
  stop()
}
```

### 关联同一次请求：`core.context`

`run()` 让一次请求或任务携带 requestId、userId、scopeId、jobId 等关联信息，`get()` 读取当前值。Node 中等待数据库或其他异步操作后，仍能读取这次请求自己的信息，其他请求不会覆盖它。已有 Logger 会自动带上这些字段。

```ts
import { core } from '@h-ai/core'

// Node 示例：同一请求等待异步处理后，仍能取得自己的编号。
await core.context.run({ requestId: 'request-1', userId: 'user-1' }, async () => {
  await core.async.delay(1)
  const current = core.context.get() // 包含 requestId: 'request-1'、traceId: 'request-1'、userId: 'user-1'；其他字段为 undefined。
  core.logger.info('Request continued', { requestId: current.requestId })
  return current.requestId
}) // run 返回回调的结果；此处 await 后得到 'request-1'。
core.context.get() // {}，回到外层后不保留上面请求的上下文。

// 采集器自身写日志时，可暂停观察回调，正常日志输出仍然执行。
core.context.run({ suppressLogObservers: true }, () => core.logger.warn('Collector diagnostic'))
// 返回 undefined；输出 warn 日志，但不会触发日志观察回调。
```

浏览器只能在 run 回调的同步代码中保留信息，await 后不再保留。关联编号不是身份授权，用户和租户范围必须由可信服务端代码提供。

### 清理诊断数据：`core.sanitize`

用于日志、诊断包或公开错误输出前清理凭据。可以判断字段名是否敏感、清理单个值、递归处理对象、遮蔽 URL 凭据，或清理文本中带标签的凭据和调用方已知的秘密值。

```ts
import { core } from '@h-ai/core'

core.sanitize.isSensitiveKey('apiKey') // true。
core.sanitize.sanitizeSensitiveValue('example-only', 'password') // '[REDACTED]'。
const safe = core.sanitize.sanitizeSensitiveFields({ password: 'example-only', email: 'user@example.com' })
// safe：{ password: '[REDACTED]', email: 'user@example.com' }，原对象不变。
// 默认仅遮蔽凭据；额外业务隐私可在已处理凭据的副本上继续清理。
core.sanitize.sanitizeSensitiveFields(safe, {
  matcher: ['email'],
  replacement: '***'
})
// => { password: '[REDACTED]', email: '***' }
core.sanitize.sanitizeUrl('https://user:example-only@example.com/?token=example-only')
// => 'https://[REDACTED]:[REDACTED]@example.com/?token=[REDACTED]'
core.sanitize.sanitizeText('Bearer example-only') // '[REDACTED]'。
core.sanitize.sanitizeText('Request failed with a known private value', ['private value'])
// => 'Request failed with a known [REDACTED]'
```

`defaultSensitiveKeyRegex` / `defaultSensitiveReplacement` 提供默认匹配规则和 `[REDACTED]` 替换值。传入自定义 matcher 会替换默认匹配规则，所以额外清理业务隐私时应先保留默认凭据清理结果。

日志默认遮蔽 password/passwordHash、token、secretKey、privateKey 等凭据字段，以及 URL 的用户名、密码、敏感查询参数和 OAuth 键值 fragment；非法 URL 返回 `(invalid url)`。`redact` 叠加业务隐私路径，支持点/括号和单层 `*`，区分大小写；邮箱、手机号默认保留。

原生 `Error` 先转为含 name/message/stack/cause、聚合错误和枚举上下文的副本再脱敏，不修改原异常；异常子图循环和 32 层深度分别使用 `[Circular]` / `[MaxDepth]`。普通对象循环保留，不保证可直接 JSON 序列化。消息与异常文本会清理显式凭据标签和 URL，无法识别任意无标签秘密，调用方仍需清理或整体遮蔽相应路径。

脱敏结果只保留数据：普通对象和类实例复制自有、可枚举的数据属性，不保留类原型，不执行访问器或自定义 `toJSON()`。日期转为 ISO 字符串，URL 转为已脱敏的字符串；原对象保持不变。记录 SDK/业务对象时仍应只选取排查所需字段，未标注的秘密和业务隐私需由应用明确清理。

### 结果与错误：`core.error`

用 `core.error` 给失败定义稳定错误码，再为本次失败生成当前语言的消息。服务端准备把失败返回给浏览器时，用 `core.error.toPublic()` 去掉内部诊断数据。Serv 或 Kit 根据错误定义设置 HTTP 状态码和追踪响应头。

```ts
import { core } from '@h-ai/core'

// 定义稳定错误码，消息在创建实例时根据当前语言获取。
const OrderError = core.error.buildHaiErrorsDef('orders', { NOT_FOUND: '300:404' })
// OrderError.NOT_FOUND：{ code: 'hai:orders:300', httpStatus: 404, system: 'hai', module: 'orders' }。
const failure = core.error.buildHaiErrorInst(OrderError.NOT_FOUND, core.i18n.coreM('core_errorNotFound', { locale: 'zh-CN' }))
// failure：上面的错误定义加上 message: '资源不存在'。
const publicError = core.error.toPublic(failure, 'request-1')
// publicError：保留 code/httpStatus/system/module，增加 traceId: 'request-1'；
// message 为 '资源不存在 (traceId: request-1)'。
const message = core.error.formatMessage(publicError) // '资源不存在 (traceId: request-1)'，编号不会重复追加。
core.logger.warn('Order unavailable', { error: failure, publicMessage: message })
```

#### 共用结果类型与独立构造器

`HaiResult<T>` 用 success 区分 data 和 error。单独导入 `ok` / `err` 可构造成功或失败的结果。调用业务 API 后先检查 success；getter、工具与工厂按各自签名返回直接值或抛错。

```ts
import type { HaiResult } from '@h-ai/core'
import { core, err, HaiCommonError, ok } from '@h-ai/core'

// 业务失败返回 err，成功返回 ok；共用构造器保持独立导入。
function divide(a: number, b: number): HaiResult<number> {
  if (b === 0)
    return err(HaiCommonError.VALIDATION_ERROR, core.i18n.coreM('core_errorValidation', { locale: 'zh-CN' }))
  return ok(a / b) // 如 ok(5) 返回 { success: true, data: 5 }。
}

// 先检查 success，再读取 data 或 error。
const result = divide(10, 2) // { success: true, data: 5 }。
if (!result.success)
  core.logger.warn('Calculation failed', { error: result.error })
else
  core.logger.info('Calculation completed', { value: result.data })

const failed = divide(10, 0)
// failed：{ success: false, error: { code: 'hai:common:200', httpStatus: 400,
// system: 'hai', module: 'common', message: '验证失败' } }，无 data。
if (!failed.success)
  core.logger.warn('Calculation rejected', { code: failed.error.code })
```

返回 HTTP 错误或显示页面提示前，应用可以调用 `core.error.toPublic(error, traceId?, locale?)`。它把服务器错误（5xx）换成当前语言的通用提示，并从可显示的错误消息中清理已知凭据。追踪编号优先取传入值，再取本次请求的 `traceId` / `requestId`，最后检查 `error.traceId`。这几处都没有编号时会生成一个。`core.error.formatMessage()` 把编号加到消息里，同一个编号只显示一次。

`cause` 和普通 `ext` 留给服务器诊断。HTTP 400 或 422 的表单校验错误可返回 `field` 和 `message`，让页面指出要修改的输入。应用也可以通过 `publicExt` 指定要额外返回的值，应先检查这些值是否可以让用户看到。Core 会处理其中的已知凭据字段，客户端收到这些值的位置是 `error.ext`。

| 配置错误                  | 错误码         | 场景                       |
| ------------------------- | -------------- | -------------------------- |
| `CONFIG_FILE_NOT_FOUND`   | `hai:core:010` | 文件不存在                 |
| `CONFIG_PARSE_ERROR`      | `hai:core:011` | YAML/dotenv 读取或解析失败 |
| `CONFIG_VALIDATION_ERROR` | `hai:core:012` | Schema 或环境覆盖无效      |
| `CONFIG_ENV_VAR_MISSING`  | `hai:core:013` | 必需插值变量缺失           |
| `CONFIG_NOT_LOADED`       | `hai:core:014` | 配置未加载                 |

以上常量来自 `HaiConfigError`；跨模块通用错误使用 `HaiCommonError`。

通用错误 `HaiCommonError.RATE_LIMIT_EXCEEDED` 对应 `hai:common:203` / HTTP 429；Kit 的快捷响应和守卫同样使用通用错误码。

要让用户看到业务错误消息，错误须带合法的 4xx 状态，例如 404。省略 `httpStatus` 或填写无效状态时，`core.error.toPublic()` 按 HTTP 500 生成通用提示。

### 消息与语言：`core.i18n`

为业务字典创建带参数替换的消息获取器，也可取得 Core 内置消息和当前语言。常量列出框架内置语言，不会自动为应用注册翻译。

```ts
import { core } from '@h-ai/core'

// 页面语言或服务进程的启动默认值；请求中使用 runWithLocale 单独选择语言。
core.i18n.setGlobalLocale('zh-CN') // 返回 undefined；后续默认消息使用中文。
core.i18n.getGlobalLocale() // 'zh-CN'。
core.i18n.coreM('core_errorNotFound') // '资源不存在'。
core.i18n.DEFAULT_LOCALE // zh-CN。
core.i18n.DEFAULT_LOCALES // [{ code: 'zh-CN', label: '简体中文' }, { code: 'en-US', label: 'English' }, { code: 'ja-JP', label: '日本語' }]。
```

`zh`、`en`、`ja` 分别对应 `zh-CN`、`en-US`、`ja-JP`。获取消息时，显式 `locale` 优先，其次是 Node 请求语言和应用默认语言。语言不受支持或缺少整份字典时，使用 `zh-CN` 字典。字典里没有对应消息时返回键名；参数缺失时保留 `{name}` 这类占位符。

```ts
import { core } from '@h-ai/core'

// 业务字典按语言组织；占位参数在取消息时传入。
const message = core.i18n.createMessageGetter({
  'zh-CN': { welcome: '欢迎 {name}' },
  'en-US': { welcome: 'Welcome {name}' },
  'ja-JP': { welcome: 'ようこそ {name}' },
})
// createMessageGetter 返回消息函数；如 message('welcome', { locale: 'zh-CN', params: { name: 'Alice' } }) 得到 '欢迎 Alice'。
const greeting = await core.i18n.runWithLocale('en-US', async () => {
  await Promise.resolve()
  return message('welcome', {
    params: { name: 'Alice' }
  })
})
// greeting：'Welcome Alice'；runWithLocale 返回回调的结果，此处等待 Promise 得到字符串。
core.logger.info('Greeting prepared', { greeting })
```

Node 请求/SSR 用 `runWithLocale()` 包裹实际异步处理；Serv 自动建立请求语言上下文，Kit 提供同名入口。在请求上下文内 `setGlobalLocale()` 只修改当前请求；上下文外仅用于启动默认值。浏览器使用应用级 `setGlobalLocale()` 或显式 locale；SSR 的 UI store 不应修改进程默认语言。

### 字段校验提示：`core.zodValidation`

把 Zod 校验错误转换为可显示在表单字段旁的 `{ field, message }[]`。`createPrefixedZodMessageGetter()` 按前缀选择翻译键，`mapZodErrorToFormErrors()` 完成提取、翻译和字段路径转换。

```ts
import { core } from '@h-ai/core'
import { z } from 'zod'

// 此例复用 Core 已有翻译；业务表单可注入自己的消息获取器。
const message = core.zodValidation.createPrefixedZodMessageGetter('core', key =>
  key === 'core_validationEmail'
    ? core.i18n.coreM('core_validationEmail', { locale: 'zh-CN' })
    : core.i18n.coreM('core_errorValidation', { locale: 'zh-CN' }))
// 返回消息函数；message('validationEmail') 得到 '请输入有效的邮箱地址'。
const parsed = z.object({
  email: z.email()
}).safeParse({ email: 'invalid' })
if (!parsed.success) {
  const errors = core.zodValidation.mapZodErrorToFormErrors(parsed.error, message)
  // errors：[{ field: 'email', message: '请输入有效的邮箱地址' }]。
  core.logger.info('Validation failed', { errors })
}
```

传给映射器的是 `safeParse()` 失败结果中的 `error`。它读取 Zod v3/v4 的 `issues` 或 `errors` 数组，跳过缺少有效路径或文案的条目。默认英文消息会翻译，业务自定义消息会保留。路径如 `items.0.email`，整张表单的错误用 `_`。严格 Schema 的未知字段使用统一的 `validationUnexpectedFields` 提示。

### 模块启动与辅助工具：`core.module`

这些工具供应用启动代码和框架模块实现复用，既能管理多个模块，也能在模块尚未初始化时返回一致错误。它们不会替应用决定使用哪些模块。

#### 应用启动与关闭

应用使用多个模块时，通常需要先完成数据库等资源的初始化，处理业务后再释放资源。`core.module.createRuntime()` 接收这些模块的启动与关闭函数，返回一个供应用调用的对象；创建这个对象时还不会启动模块。

下面是本地开发示例，需额外安装 `@h-ai/reldb` 和 `@h-ai/cache`。数据库和缓存都使用内存配置，仅用于演示，生产环境应按模块要求配置共享后端。

```ts
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'

// 按需要的启动顺序，列出各模块的初始化和关闭函数。
const runtime = core.module.createRuntime([
  {
    name: 'database',
    start: () => reldb.init({ type: 'sqlite', database: ':memory:' }),
    close: () => reldb.close(),
  },
  {
    name: 'cache',
    start: () => cache.init({ type: 'memory' }),
    close: () => cache.close(),
  },
])

// createRuntime 返回带 start()/close() 的对象；到这里数据库和缓存尚未启动。

// 依次启动数据库、缓存；失败时自动清理已尝试启动的模块。
const started = await runtime.start() // 成功为 { success: true, data: undefined }；两个模块均已初始化。
if (!started.success)
  throw new Error(started.error.message, { cause: started.error })

try {
  // 启动成功后再执行应用业务；这里演示记录启动结果。
  core.logger.info('Application modules ready')
}
finally {
  // 演示结束后先关闭缓存，再关闭数据库，并检查清理结果。
  const closed = await runtime.close() // 成功为 { success: true, data: undefined }；两个模块均已关闭。
  if (!closed.success)
    core.logger.error('Application cleanup failed', { error: closed.error })
}
```

本例的启动顺序是数据库 → 缓存，关闭顺序是缓存 → 数据库。示例在演示结束后立即清理；长期运行的服务应在退出时执行同样的 `runtime.close()`。

某一步启动失败，会清理已经尝试启动的模块；某一步关闭失败，会先停在该处，保留它仍需使用的依赖，再次调用 `close()` 或 `start()` 时重试清理。多处同时调用 `start()` 不会重复初始化。可选的 `enabled()` 返回 false 时跳过该项。

`start()` / `close()` 都返回 `HaiResult`，应用必须检查 `success`。错误包含模块名、失败阶段、错误码和必要的配置字段提示，避免把配置秘密和 SDK 原始异常作为启动错误公开。

#### 模块尚未初始化时返回错误

`createNotInitializedKit()` 返回 error/result/proxy 三种用法；proxy 为尚未准备好的同步或异步操作返回统一失败结果，模块就绪后应切换为真实操作。消息函数在调用时读取语言。

```ts
import type { HaiResult } from '@h-ai/core'
import { core, HaiCommonError } from '@h-ai/core'

const message = core.i18n.createMessageGetter({
  'zh-CN': { notReady: '请先初始化模块' },
  'en-US': { notReady: 'Initialize the module first' },
  'ja-JP': { notReady: '先にモジュールを初期化してください' },
})
// 本例固定使用中文消息，便于观察返回值。
core.i18n.setGlobalLocale('zh-CN') // 返回 undefined。
const waiting = core.module.createNotInitializedKit(HaiCommonError.NOT_INITIALIZED, () => message('notReady'))
// waiting 是带 error/result/proxy 的对象。
waiting.error() // { code: 'hai:common:001', httpStatus: 500, system: 'hai', module: 'common', message: '请先初始化模块' }。
waiting.result<string>() // { success: false, error: 上方错误对象 }，无 data。

// 模块实现可把尚未就绪的操作暂时指向这些代理。
const asyncOperations = waiting.proxy<{ read: () => Promise<HaiResult<string>> }>()
const syncOperations = waiting.proxy<{ read: () => HaiResult<string> }>('sync')
// 两次 proxy 调用分别返回异步和同步操作对象。
const result = await asyncOperations.read() // { success: false, error: 上方错误对象 }。
if (!result.success)
  core.logger.warn('Read before initialization', { error: result.error })
syncOperations.read() // 直接返回 { success: false, error: 上方错误对象 }，不返回 Promise。
```

#### 判断是否需要共享状态

`requiresSharedState()` 判断生产进程是否应拒绝只在本机有效的业务状态后端。它只返回判断，不连接或切换数据库；实际环境由服务端传入。

```ts
import { core } from '@h-ai/core'

// 此例用显式数据演示；服务端实际使用时传入 process.env。
core.module.requiresSharedState({ NODE_ENV: 'production' }) // true：应使用跨主机共享后端。
core.module.requiresSharedState({ NODE_ENV: 'production', HAI_E2E: '1' }) // false：显式 E2E 例外。
```

### 请求访问检查：`core.access`（Node）

用 `core.access` 可以从受信代理转发头中取出真实客户端 IP，也可以判断这个地址能否在当前时间访问指定路径。配置独立 API 时在 `_serv.yml` 的 `http.access` 填写策略，配置 SvelteKit 服务时使用 `_kit.yml` 的 `access`。`serv.createApp({ http })` 和 `kit.createHandle({ access })` 会在启动时创建检查器，并在每次处理请求时调用它。

#### 解析与检查客户端地址

```ts
import { core } from '@h-ai/core'

core.access.normalizeClientIp('::ffff:198.51.100.23') // 198.51.100.23。
const resolve = core.access.createClientIpResolver(['192.0.2.10']) // 返回 IP 解析函数，只信任这个代理。
const request = new Request('https://example.test/api/orders', {
  headers: { 'x-forwarded-for': '198.51.100.23' }
})
// 第二参数必须来自真实 socket/可信平台；这里用测试地址模拟代理对端。
const clientIp = resolve(request, '192.0.2.10') // '198.51.100.23'，读取受信代理的转发头。
// 只限制地址。denyIps 和 windows 为空表示没有额外的拒绝地址或时段限制。
const check = core.access.createConditionCheck({
  allowIps: ['198.51.100.0/24'],
  denyIps: [],
  timezone: 'UTC',
  windows: [],
})
// createConditionCheck 返回检查函数；check(clientIp) 得到 { allowed: true }。
core.logger.info('Address checked', { allowed: check(clientIp).allowed })
```

#### 读取策略并检查请求

```ts
import { core } from '@h-ai/core'

// 服务启动时传入规则，得到一个可以重复调用的请求检查器。
const check = core.access.createRequestCheck({
  rules: [
    {
      id: 'external-api',
      paths: ['/api/external/**'],
      methods: ['POST'],
      allowIps: ['192.0.2.0/24'],
      encryption: 'disabled'
    }
  ],
})
const decision = check('/api/external/sync', 'POST', '192.0.2.10') // { allowed: true }。
check.encryption('/api/external/sync', 'POST') // disabled，供 HTTP 框架选择传输模式。
check.requiresEncryption // false；本例没有 required 规则。
core.logger.info('Request access checked', { allowed: decision.allowed })
```

将路径规则保存到 `config/security/request-access.yml` 时，用下面的方式创建同一个检查器。文件结构从 `rules` 或 `global` 开始，见[独立文件示例](../configuration/request-access.md#41-准备文件)。

```ts
import { core } from '@h-ai/core'

// 相对路径从 Node 进程的工作目录起算。文件只在创建检查器时读取。
const check = core.access.createRequestCheck({ file: './config/security/request-access.yml' })
// 链接中的示例文件拒绝 192.0.2.7，结果的 allowed 为 false，reason 为 'address'。
const decision = check('/api/v1/external/sync', 'GET', '192.0.2.7')
```

- 检查器创建时验证规则。文件最大 1 MiB，文件读不到或内容不合法时会抛错，调用方应停止启动。部署工具等只想读取和验证规则内容时，可以用 `core.access.loadPolicy({ file })`。
- 请求要通过全局条件和每条命中的规则。即使地址在允许名单里，命中拒绝名单也会被拒绝。允许名单为空时不限制地址，时段列表为空时全天可访问。时段默认使用 UTC。
- `core.access.createClientIpResolver()` 默认使用 `auto`。由框架生成的私有 Compose 部署可识别其网关所在网段。直接运行 Node 时默认忽略转发头。使用自行配置的代理时传入它连接后端所用的 IP 或网段，从服务器套接字或可信平台接口取得对端地址。
- Serv 和 Kit 使用 `check.encryption()` 和 `check.requiresEncryption` 决定路径是否使用框架的请求加密。省略 `encryption` 时沿用该服务的加密设置。相同路径、方法的加密模式有冲突时，检查器创建失败。HTTPS 和鉴权仍由 HTTP 服务处理。

完整默认值、独立文件、代理拓扑及部署步骤见[请求访问控制手册](../configuration/request-access.md).

### 生成与校验标识：`core.id`

生成业务标识与日志关联编号，或检查输入是否符合 UUID v4 / nanoid 格式。

```ts
import { core } from '@h-ai/core'

// 以下随机值仅展示格式，每次执行都不同。
core.id.generate() // 如 'V1StGXR8_Z5jdHi6B-myT'，默认 21 字符；generate(8) 返回 8 字符。
const shortId = core.id.short() // 如 'V1StGXR8_Z'，10 字符。
core.id.withPrefix('order_') // 如 'order_V1StGXR8_Z5jdHi6B-myT'，前缀后接 21 字符。
core.id.trace() // 如 'trace-V1StGXR8_Z5jdHi6B-myT'。
core.id.request() // 如 'req-V1StGXR8_Z5jdHi6B-myT'。
const uuid = core.id.uuid() // 如 '550e8400-e29b-41d4-a716-446655440000'，UUID v4。
core.id.isValidUUID(uuid) // true。
core.id.isValidNanoId(shortId, 10) // true。
```

ID 不能作为密钥。UUID 只使用密码学安全随机源，不可用时抛错；_core.yml 没有全局 ID 长度或前缀配置，按每次调用传参。

### 判断值的类型：`core.typeUtils`

对边界数据做类型判断，并帮助 TypeScript 在分支中缩小类型；这些判断不替代业务 Schema 校验。

```ts
import { core } from '@h-ai/core'

core.typeUtils.isDefined(null) // false，同时排除 null 和 undefined。
core.typeUtils.isObject({ name: 'orders' }) // true；排除 null/数组，但也接受 Date 和类实例。
core.typeUtils.isFunction(() => {}) // true。
core.typeUtils.isPromise(Promise.resolve('ready')) // true。
core.typeUtils.isString('orders') // true。
core.typeUtils.isNumber(3000) // true；传 NaN 返回 false。
core.typeUtils.isBoolean(false) // true。
core.typeUtils.isArray([1, 2]) // true。
```

### 处理对象：`core.object`

复制、合并或选取对象字段，也提供带键类型的 keys/values/entries 与 fromEntries。

```ts
import { core } from '@h-ai/core'

const defaults = { name: 'orders', port: 3000 }
const copy = core.object.deepClone(defaults) // { name: 'orders', port: 3000 }，新副本。
// 合并局部覆盖时，显式保留包含 name/port 的完整配置类型。
const settings = core.object.deepMerge<typeof defaults>(copy, { port: 4000 }) // { name: 'orders', port: 4000 }。
core.object.pick(settings, ['name']) // { name: 'orders' }。
core.object.omit(settings, ['port']) // { name: 'orders' }。
core.object.keys(settings) // ['name', 'port']，元素类型为 'name' | 'port'。
core.object.values(settings) // ['orders', 4000]。
core.object.entries(settings) // [['name', 'orders'], ['port', 4000]]。
core.object.fromEntries([
  ['mode', 'local']
]) // { mode: 'local' }。
```

deepClone 使用 structuredClone，支持 Date/Map/Set/循环等可克隆值；不可克隆的函数等会抛错。deepMerge 只递归普通对象，数组、Date、集合和类实例由后值覆盖，不修改输入；不把它当作实例克隆。

### 处理字符串：`core.string`

统一命名格式、处理显示文字、判断空白以及比较字符串。

```ts
import { core } from '@h-ai/core'

core.string.capitalize('hello') // 'Hello'。
core.string.kebabCase('helloWorld') // 'hello-world'。
core.string.camelCase('hello-world') // 'helloWorld'。
core.string.snakeCase('helloWorld') // 'hello_world'。
core.string.pascalCase('hello-world') // 'HelloWorld'。
core.string.truncate('abcdef', 3) // 'abc...'。
core.string.trim(' hello ') // 'hello'。
core.string.isBlank(' ') // true。
core.string.isNotBlank('hello') // true。
core.string.padStart('5', 3, '0') // '005'。
core.string.padEnd('5', 3, '0') // '500'。
core.string.constantTimeEqual('same', 'same') // true；安全边界见下方说明。
```

Node 的 constantTimeEqual 对等长 UTF-16 字节使用原生 timingSafeEqual，不同长度直接返回 false；浏览器不能提供引擎级恒时保证，不用于服务端凭据校验。

### 处理数组：`core.array`

按任务需要对数组去重、分块、分组、筛除空值或计算交集/差集；返回结果，保留输入数组。

```ts
import { core } from '@h-ai/core'

core.array.unique([1, 1, 2]) // [1, 2]。
core.array.chunk([1, 2, 3], 2) // [[1, 2], [3]]。
core.array.groupBy([
  { role: 'admin' },
  { role: 'user' }
], item => item.role)
// => { admin: [{ role: 'admin' }], user: [{ role: 'user' }] }
core.array.first([1, 2, 3]) // 1；空数组为 undefined。
core.array.last([1, 2, 3]) // 3；空数组为 undefined。
core.array.flatten([
  [1],
  [2, 3]
]) // [1, 2, 3]，只展开一层。
core.array.compact([0, null, 1, undefined]) // [0, 1]，保留 0/false/空字符串。
core.array.shuffle([1, 2, 3]) // 如 [2, 3, 1]，次序随机；新数组不修改输入。
core.array.intersection([1, 2], [2, 3]) // [2]。
core.array.difference([1, 2], [2, 3]) // [1]。
```

`groupBy()` 支持与原型属性同名的键，例如 `constructor`。`chunk()` 要求块大小为正安全整数，传入小数、无穷大或其他无效大小时返回空数组。

### 组织异步操作：`core.async`

安排延迟、超时、失败重试、限并发与串行处理，或为输入/滚动等事件添加防抖与节流。

```ts
import { core } from '@h-ai/core'

await core.async.delay(1) // 等待约 1ms 后得到 undefined；计时以运行环境为准。
await core.async.withTimeout(Promise.resolve('ready'), 1000) // 'ready'；超时则 reject 为 Error。
await core.async.retry(async () => 'ready', { maxRetries: 3, delay: 10 }) // 'ready'，本例首次即成功。
await core.async.parallel([1, 2, 3], async value => value * 2, 2) // [2, 4, 6]，最多同时执行两项。
await core.async.serial([1, 2, 3], async value => value * 2) // [2, 4, 6]，按输入顺序逐项执行。

// 两种包装保留回调参数类型；调用 search/scroll 时传入同样类型的参数。
const search = core.async.debounce((term: string) => core.logger.debug('Search requested', { term }), 100)
const scroll = core.async.throttle((position: number) => core.logger.debug('Scroll position', { position }), 100)
// debounce/throttle 均返回包装函数，调用时返回 undefined。
core.logger.setLevel('debug') // 返回 undefined；确保下面的 debug 日志可见。
search('orders') // 约 100ms 后回调收到 'orders'；100ms 内连续调用只处理最后一次。
scroll(100) // 本例第一次调用立即回调，position 为 100；100ms 内最多执行一次。
```

- `withTimeout()` 到时会拒绝等待的 Promise。底层任务的取消由调用方负责。
- `retry()` 在操作抛错或拒绝时再次执行。`maxRetries` 包含第一次尝试，默认最多执行三次，间隔 1000 毫秒。返回失败 `HaiResult` 时，由调用方判断结果。
- `parallel()` 按输入顺序返回结果。并发数须为正安全整数，无效时在执行任何任务前以 `RangeError` 拒绝。单个任务拒绝后，其余工作者仍可能继续处理队列。

### 处理日期与时间：`core.time`

在毫秒/秒时间戳、Date 和显示文本之间转换，并计算当地日期边界与相对时间。

```ts
import { core } from '@h-ai/core'

// 这些日期运算使用运行环境的本地时区。
const date = new Date(2026, 0, 1, 12, 0, 0)
core.time.formatDate(date, 'YYYY-MM-DD HH:mm:ss') // '2026-01-01 12:00:00'
core.time.formatDate(date, 'MM/DD (MM-DD)') // '01/01 (01-01)'

core.i18n.setGlobalLocale('zh-CN')
core.time.timeAgo(new Date(Date.now() - 120_000)) // '2 分钟前'
core.time.now() // 当前 Unix 时间戳，单位为毫秒。
core.time.nowSeconds() // 当前 Unix 时间戳，向下取整到秒。

const parsed = core.time.parseDate('2026-01-01T00:00:00Z')
parsed.toISOString() // '2026-01-01T00:00:00.000Z'
core.time.isValidDate(parsed) // true
core.time.addDays(date, 7) // 2026-01-08 12:00:00
core.time.addHours(date, 2) // 2026-01-01 14:00:00
core.time.startOfDay(date) // 2026-01-01 00:00:00.000
core.time.endOfDay(date) // 2026-01-01 23:59:59.999
```

`formatDate()` 默认使用 `YYYY-MM-DD`，会替换模板里每处日期占位符。`parseDate()` 使用原生 `Date` 解析，输入无效时可用 `isValidDate()` 检出。跨环境传输建议使用带时区的 ISO 字符串。`addDays()` 和 `addHours()` 按本地日历和时钟计算，在夏令时切换时，经过的实际时长可能不同。

更完整的参数与少见选项见[Core 使用参考](../../../packages/cli/templates/skills/hai-core/reference.md)；公开契约以当前包声明为准。

### 补充日志级别和监听状态

```ts
const requestLogger = core.logger.child({ requestId: 'req-1' }) // 固定关联字段，返回 Logger。
requestLogger.trace('Request callback entered') // 级别为 trace，返回 void，受当前日志阈值控制。
requestLogger.fatal('Application startup failed', { module: 'orders' }) // 级别为 fatal，返回 void。
```

```ts
const watching = core.config.isWatching('app') // 输入配置名，返回当前是否在监听。
core.config.unwatch('app') // 取消 app 的全部监听，返回 void，保留已读取的配置。
```

浏览器条件入口的 `core.config.isWatching` 始终返回 `false`，`core.config.unwatch` 直接返回。

## 错误处理

领域操作先判断 `result.success`，失败按本模块错误定义与安全提示处理，服务端保留错误码、关联编号和脱敏原因。同步工具、工厂、流迭代及生命周期按各自签名处理，不把 Promise 完成视为业务成功。具体失败与恢复边界见对应功能。
