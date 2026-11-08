# @h-ai/core

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md)

## 简介

`@h-ai/core` 是 Hai Framework 的公共基础层，为应用和其他框架模块提供一致的配置、错误、日志和国际化能力。常用工具可直接使用；Node 应用需要加载配置时再调用 `core.init()`。

## 核心能力

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

## 使用入门

下面按 `core` 对象上的全部子功能介绍用途、示例与必要限制。需要加载配置时先看初始化；日志、消息和通用工具可直接使用。

运行功能通过 `core.xxx()` 或 `core.<子功能>.xxx()` 调用。结果构造器 `ok` / `err`，以及类型、Schema 和错误常量，从包入口单独导入，具体用法见对应小节。

```bash
pnpm add @h-ai/core
```

下方自定义配置和表单校验示例还使用 Zod，运行这些示例前安装 `pnpm add zod`。数据库、缓存示例的额外依赖在相应小节说明。

### 初始化：`core.init`

Node 启动时加载 YAML 并设置日志；浏览器只设置日志。初始化 Core 不会启动数据库等其他模块。

#### Node.js

准备 `config/_core.yml`：

```yaml
# 应用元信息，供启动代码和页面读取。
name: orders
version: 0.1.0
env: development
# 默认消息语言；启动代码读取后调用 setGlobalLocale 应用。
defaultLocale: zh-CN
logging:
  level: info # 输出 info 及以上级别。
  format: pretty # 本地开发使用便于阅读的日志。
```

```ts
import { core, CoreConfigSchema } from '@h-ai/core'

// 1. 读取 config 目录中的 YAML，_core.yml 对应名称 core。
core.init({ configDir: './config' }) // 返回 undefined；配置缓存中可读取 core。

// 2. 检查应用必需的配置；失败时停止启动，保留原始错误供排查。
const config = core.config.validate('core', CoreConfigSchema)
if (!config.success)
  throw new Error(config.error.message, { cause: config.error })

// 成功时 config.success 为 true；config.data.name 为 'orders'，defaultLocale 为 'zh-CN'。

// 3. 将配置中的语言应用到默认消息；读取 YAML 本身不会切换语言。
core.i18n.setGlobalLocale(config.data.defaultLocale) // 返回 undefined；后续默认消息使用中文。

// 4. 记录已验证的应用名称，确认启动完成。
core.logger.info('Application ready', { name: config.data.name }) // 返回 undefined；info 日志包含 name: 'orders'。
```

启动边界在必需配置失败时中止启动。`core.init()` 对单项加载失败记日志并继续，所以不能把调用结束视为所有配置校验成功；目录扫描、日志设置等异常仍可能抛出。

#### 浏览器

```ts
import { core } from '@h-ai/core'

// 浏览器不读取 YAML；此处只设置日志，输出 warn 及以上级别。
core.init({
  logging: { level: 'warn' }
}) // 返回 undefined；之后 info 日志被过滤。

// 设置当前页面使用的默认消息语言。
core.i18n.setGlobalLocale('zh-CN') // 返回 undefined；页面默认消息使用中文。

// 给一次请求生成编号，后续日志可用同一编号关联排查。
const requestId = core.id.request() // 返回随机字符串，如 'req-V1StGXR8_Z5jdHi6B-myT'。
core.logger.warn('Request needs attention', { requestId }) // 返回 undefined；浏览器输出 warn 消息及同一个 requestId。
```

浏览器配置由宿主通过公开字段下发，不传完整服务端配置或密钥。`core.config.get()` / `has()` / `keys()` 分别返回 `undefined` / `false` / `[]`；`loadEnvFiles()`、`load()`、`validate()`、`reload()` 返回 `SERVICE_UNAVAILABLE`，`getOrThrow()` 抛错。`watch()` 立即回调同一不可用错误并返回空取消函数。

### 文件与环境配置：`core.config`

读取 YAML、应用环境变量覆盖、检查配置类型，并管理配置缓存与文件监听。下列文件与环境操作仅在 Node 中可用。

#### 加载、校验与读取

`core.init({ configDir, configSchemas?, watchConfig? })` 扫描指定目录直属的 `.yml` / `.yaml` 文件；`_core.yml` 注册为 `core`，`_db.yml` 注册为 `db`，`app.yml` 注册为 `app`。构建/部署设置由 CLI 从项目根 `hai.json` 读取，不属于运行时 YAML。

`_core.yml` 使用 `CoreConfigSchema` 校验，只接受 `name`、`version`、`env`、`defaultLocale` 和 `logging`。默认值依次为 `hai Admin`、`0.1.0`、`development`、`zh-CN`；`logging` 可省略。元数据不会自行修改 `NODE_ENV`、切换消息语言或注册业务翻译。日志应从此处配置；显式传入 `core.init({ logging })` 会覆盖本次初始化对 YAML 日志设置的应用。

其他配置在扫描时仅借助宿主提供的 `configSchemas` 识别结构和类型，完整业务校验留给模块初始化或显式 `validate()`。直接 `load(name, file, schema)` 会立即校验。

以下文件示例使用这份 `config/app.yml`，并假设没有额外环境变量覆盖：

```yaml
# config/app.yml
port: 3000
```

`load()` 读取文件并可立即校验；`validate()` 校验已加载的缓存。`get()` 找不到时返回 undefined，`getOrThrow()` 找不到时抛错；泛型只帮助 TypeScript，不会替代实际校验。`has()` / `keys()` 用于检查有哪些配置。

```ts
import { core } from '@h-ai/core'
import { z } from 'zod'

// 读取上方 config/app.yml；Schema 同时描述类型和校验规则。
const AppSchema = z.object({
  port: z.number().int().min(1).max(65535)
})
const loaded = core.config.load('app', './config/app.yml', AppSchema)
if (!loaded.success)
  throw new Error(loaded.error.message, { cause: loaded.error })

// loaded：{ success: true, data: { port: 3000 } }。

// validate 用于重新校验缓存；加载时未传 Schema 的配置也可在这里校验。
const validated = core.config.validate('app', AppSchema)
if (!validated.success)
  throw new Error(validated.error.message, { cause: validated.error })

// validated：{ success: true, data: { port: 3000 } }。

// get 适合可选配置；getOrThrow 适合已确认存在的必需配置。
if (core.config.has('app')) { // true：上方已成功加载 app。
  const optional = core.config.get<z.infer<typeof AppSchema>>('app') // { port: 3000 }。
  const required = core.config.getOrThrow<z.infer<typeof AppSchema>>('app') // { port: 3000 }；缺失则抛错。
  core.logger.info('App config ready', { port: required.port, available: optional !== undefined })
}
core.config.keys() // 仅运行本节 load 示例时为 ['app']。
```

#### 重载、监听与清理

修改配置后可用 `reload()` 主动读盘，也可用 `watch()` 接收新值或错误。监听支持普通保存、文件原子替换以及删除后重建；失败保留最近一次成功的缓存。`unwatch()` 停止监听，`clear()` 同时清缓存；二者省略名称时作用于全部配置。

`watchConfig` 默认 false；重载缓存不会自动重新初始化数据库等已启动模块。下面的清理操作应在不再需要这份配置时调用。

```ts
import { core } from '@h-ai/core'

// 前提：app 已由 init/load 加载。回调需先处理读取或校验失败。
const stop = core.config.watch('app', (_settings, error) => {
  // 文件改成 port: 4000 后，成功回调收到 { port: 4000 }、error 为 undefined；失败时为 null 和错误对象。
  if (error)
    core.logger.error('Config reload failed', { error })
  else
    core.logger.info('Config reloaded')
})
// watch 返回取消函数 stop，不立即返回配置值。
core.config.isWatching('app') // true。
const reloaded = core.config.reload('app') // 文件仍为 port: 3000 时返回 { success: true, data: { port: 3000 } }。
if (!reloaded.success)
  core.logger.warn('Manual reload failed', { error: reloaded.error })

stop() // 返回 undefined；取消当前回调，没有其他回调时停止底层监听。
core.config.unwatch('app') // 返回 undefined；isWatching('app') 变为 false。
core.config.clear('app') // 返回 undefined；get('app') 变为 undefined，has('app') 变为 false。
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

`core.init()` 不自行读取 .env 文件。需要时先调用 `loadEnvFiles()`，确认 success 后把结果放入 process.env，再加载 YAML。`development` / `production` 映射为 `dev` / `prod`；缺失文件跳过，同文件重复键报错。优先级从高到低是：**进程环境 > `.env.<mode>.local` > `.env.local` > `.env.<mode>` > `.env` > YAML**。私有 .local 文件不提交 Git。

```ts
import { core } from '@h-ai/core'

// 前提：.env 写 HAI_APP_PORT=4000，没有其他来源覆盖这个变量。
// 先读取并合并 .env 文件与进程环境，失败时停止启动。
const result = core.config.loadEnvFiles({ mode: 'dev', envDir: '.' })
if (!result.success)
  throw new Error(result.error.message, { cause: result.error })
// 成功时 result.success 为 true，result.data.HAI_APP_PORT 为 '4000'；其他键来自合并后的环境。
// 返回值不会自动写入进程；显式应用后再初始化。
Object.assign(process.env, result.data)
core.init({ configDir: './config' }) // 返回 undefined；app.yml 中 port: 3000 被覆盖为数字 4000。
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
core.logger.info('Config resolved', { settings: validated.data })
// settings: { port: 5000, enabled: false, label: 'server-4000', code: '00123' }
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

普通对象默认展开；数组、动态字典和空对象保留 JSON。整体替换对象的生成规则、完整来源优先级与应用接入见[基础配置手册](../../docs/usage/configuration/runtime.md)。

### 记录日志：`core.logger`

`core.logger` 用于记录结构化日志。六个级别从详细到严重依次为 trace、debug、info、warn、error、fatal；fatal 记录日志，是否退出由应用决定。

`core.logger` 支持 `trace` / `debug` / `info` / `warn` / `error` / `fatal`。Node 使用 pino，浏览器使用 loglevel；未配置时为 `info` / `pretty`。若提供经 `LoggingConfigSchema` 解析的 `logging` 对象，其格式默认 `json`。Node 缺少可选 `pino-pretty` 时使用 JSON 输出。

```ts
import { core } from '@h-ai/core'

// 先设置级别；低于当前级别的日志不会输出。
core.logger.setLevel('trace') // 返回 undefined；以下六个级别均会输出。
core.logger.trace('Processing detail', { step: 1 })
core.logger.debug('Read started')
core.logger.info('Order created', { orderId: 'order-1' })
core.logger.warn('Retry scheduled')
core.logger.error('Operation failed', {
  error: new Error('Example failure')
})
core.logger.fatal('Service cannot continue')
// 六次日志调用均返回 undefined；分别输出对应级别、上面的消息及所传字段。
// 例如 info 日志的消息为 'Order created'，字段 orderId 为 'order-1'。
```

`create()` 创建有名称的 Logger，`child()` 给后续日志附带固定字段。`configure()` 设置输出与附加脱敏路径，`setLevel()` / `getLevel()` 调整或查看全局级别。

```ts
import { core } from '@h-ai/core'

// 全局配置可作用于已经创建的 Logger；redact 补充业务隐私字段。
core.logger.configure({
  level: 'info',
  format: 'json',
  redact: ['customer.email']
}) // 返回 undefined；后续日志按此配置输出。
const orders = core.logger.create({ name: 'orders' }) // 返回 Logger 对象，可调用 info/warn 等方法。
const request = core.logger.child({ requestId: 'request-1' }) // 返回带固定 requestId 的 Logger。
orders.info('Order created', {
  customer: { email: 'user@example.com' }
}) // 返回 undefined；输出中 customer.email 为 '[REDACTED]'。
request.warn('Request needs attention') // 返回 undefined；输出中 requestId 为 'request-1'。
core.logger.getLevel() // 'info'。
```

已有默认、模块和嵌套 child Logger 的后续输出会使用当前全局配置，`setLevel()` 也即时生效。`create()` 显式指定的 level/format/context 优先；未指定项动态继承，调用时上下文覆盖固定上下文，当前请求关联字段再由 `core.context` 附加。浏览器 JSON 输出包含 `level` / `msg`，pretty 输出可读消息和上下文。

`observe()` 用于诊断采集，接收经过当前级别过滤与脱敏的记录，返回解除订阅的函数。回调只做有界内存收集，持久化由应用另行异步完成；它不代表日志已保存。回调异常与同步重入被隔离。

```ts
import { core } from '@h-ai/core'

// 观察经过级别过滤和脱敏的记录；内存收集设置上限。
const recentMessages: string[] = []
const stop = core.logger.observe((record) => {
  if (recentMessages.length === 100)
    recentMessages.shift()
  recentMessages.push(record.message)
})
// observe 返回取消函数 stop；本例 warn 日志触发一次回调，record.message 为 'Observed event'。
core.logger.warn('Observed event')
recentMessages // ['Observed event']。
stop() // 返回 undefined；后续日志不再进入这个回调。
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

用 `core.error` 定义模块错误、创建本次失败的实例，并在 HTTP/UI 边界生成安全提示。错误码稳定，消息可以按当前语言产生；接口响应状态和响应头由 Serv/Kit 等 HTTP 框架处理。

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

在 HTTP/UI 边界使用 `core.error.toPublic(error, traceId?, locale?)`：5xx 改为本地化通用提示，清理其他消息中的已知凭据，仅保留安全字段。追踪编号依次取显式参数、上下文 traceId/requestId、已有 error.traceId，否则生成；`formatMessage()` 在消息中附加合法编号，重复调用不会重复追加同一编号。

内部 `cause` / `ext` 默认不公开；400/422 的字段校验可保留 `field` / `message`，明确批准且经业务 Schema 校验的 `publicExt` 会脱敏后转为公开 `ext`。Core 不自动验证 `publicExt` 的业务安全性。HTTP 状态、响应头和提示组件由 Serv/Kit/UI 宿主装配。

| 配置错误                  | 错误码         | 场景                       |
| ------------------------- | -------------- | -------------------------- |
| `CONFIG_FILE_NOT_FOUND`   | `hai:core:010` | 文件不存在                 |
| `CONFIG_PARSE_ERROR`      | `hai:core:011` | YAML/dotenv 读取或解析失败 |
| `CONFIG_VALIDATION_ERROR` | `hai:core:012` | Schema 或环境覆盖无效      |
| `CONFIG_ENV_VAR_MISSING`  | `hai:core:013` | 必需插值变量缺失           |
| `CONFIG_NOT_LOADED`       | `hai:core:014` | 配置未加载                 |

以上常量来自 `HaiConfigError`；跨模块通用错误使用 `HaiCommonError`。

通用错误 `HaiCommonError.RATE_LIMIT_EXCEEDED` 对应 `hai:common:203` / HTTP 429；Kit 的快捷响应和守卫同样使用通用错误码。

HTTP/UI 边界只对明确的有效 4xx 状态公开业务提示；错误缺少 `httpStatus` 或状态非法时按 500 返回安全提示。手写业务错误须提供完整错误定义或显式状态，不能依赖缺省状态展示原文。

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

消息语言支持 `zh-CN`、`en-US`、`ja-JP`，简写 `zh` / `en` / `ja` 会规范化。消息优先使用显式 locale，其次为 Node 请求语言，最后为应用默认语言；不支持的语言回退 `zh-CN`，缺失键返回键本身。

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

支持 Zod v3/v4 的 issues/errors 结构；默认英文消息会翻译，Schema 显式提供的业务消息保留。字段路径用点号，全局错误用 `_`。严格 Schema 的未知字段使用 validationUnexpectedFields，不公开内部字段名。

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

HTTP 请求入口可用这些工具解析可信客户端 IP，再检查地址、路径、方法和允许时段。Core 只提供检查结果；Serv 的 http.access 或 Kit 的 createHandle({ access }) 负责把检查接到请求流程。

#### 解析与检查客户端地址

```ts
import { AccessConditionSchema, core } from '@h-ai/core'

core.access.normalizeClientIp('::ffff:198.51.100.23') // 198.51.100.23。
const resolve = core.access.createClientIpResolver(['192.0.2.10']) // 返回 IP 解析函数，只信任这个代理。
const request = new Request('https://example.test/api/orders', {
  headers: { 'x-forwarded-for': '198.51.100.23' }
})
// 第二参数必须来自真实 socket/可信平台；这里用测试地址模拟代理对端。
const clientIp = resolve(request, '192.0.2.10') // '198.51.100.23'，读取受信代理的转发头。
const check = core.access.createConditionCheck(AccessConditionSchema.parse({
  allowIps: ['198.51.100.0/24']
}))
// createConditionCheck 返回检查函数；check(clientIp) 得到 { allowed: true }。
core.logger.info('Address checked', { allowed: check(clientIp).allowed })
```

#### 读取策略并检查请求

```ts
import { core } from '@h-ai/core'

// 可改为 loadPolicy({ file: './config/security/request-access.yml' }) 在启动时读独立文件。
const policy = core.access.loadPolicy({
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
// policy.rules[0] 保留上方规则，并补 denyIps: []、windows: []、timezone: 'UTC'。
const check = core.access.createRequestCheck(policy) // 返回请求检查函数，另带 encryption 方法和 requiresEncryption 属性。
const decision = check('/api/external/sync', 'POST', '192.0.2.10') // { allowed: true }。
check.encryption('/api/external/sync', 'POST') // disabled，供 HTTP 框架选择传输模式。
check.requiresEncryption // false；本例没有 required 规则。
core.logger.info('Request access checked', { allowed: decision.allowed })
```

- 创建检查器时验证并编译规则；`loadPolicy({ file })` 启动时读取独立 YAML，最大 1 MiB，配置错误抛出并阻止宿主启动。内联规则与文件不能混用。
- 全局条件与所有命中规则取交集，拒绝地址优先；空 IP/时间列表不限制对应维度，时区默认 UTC。路径包含部署前缀，支持精确路径和末尾 `/**`，GET 不隐含 HEAD。
- `createClientIpResolver()` 默认 `auto` 在普通宿主忽略转发头，仅受管私有 Compose 采用容器网段。`[]` 关闭代理信任，自管入口明确填写代理 IP/CIDR；对端地址必须来自 socket 或可信平台。
- 路径 `encryption` 可为 `required` / `disabled`，省略沿用宿主；重叠路径和方法的相反声明在创建时失败。`check.encryption()` / `requiresEncryption` 供宿主装配传输模式，Core 不持有密钥或执行加解密，仍需 HTTPS 和身份鉴别。

完整默认值、独立文件、代理拓扑及部署步骤见[请求访问控制手册](../../docs/usage/configuration/request-access.md)。

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

groupBy 支持 `constructor`、`__proto__` 等原型同名键；chunk 的块大小应为正整数，size<=0 返回空数组。

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

withTimeout 只限制等待时间，不取消底层任务。retry 仅处理抛错/reject，失败 HaiResult 不会自动重试；当前 maxRetries 包含第一次尝试，例如 3 表示最多执行三次。parallel 的并发数须为大于 0 的安全整数，非法值使 Promise 以 RangeError 失败且不执行任务；结果顺序与输入一致。

### 处理日期与时间：`core.time`

在毫秒/秒时间戳、Date 和显示文本之间转换，并计算当地日期边界与相对时间。

```ts
import { core } from '@h-ai/core'

// date 与以下日期运算使用本机时区；parseDate 中的 Z 表示 UTC。
const date = new Date(2026, 0, 1, 12, 0, 0)
core.time.formatDate(date, 'YYYY-MM-DD HH:mm:ss') // '2026-01-01 12:00:00'。
core.i18n.setGlobalLocale('zh-CN') // 返回 undefined；相对时间使用中文。
core.time.timeAgo(new Date(Date.now() - 60_000)) // '1 分钟前'（立即执行时）。
core.time.now() // 当前毫秒时间戳，如 1767268800000；每次执行随时间变化。
core.time.nowSeconds() // 当前秒时间戳，如 1767268800；相当于当前毫秒时间戳除以 1000 后向下取整。
const parsed = core.time.parseDate('2026-01-01T00:00:00Z') // Date 对象，toISOString() 为 '2026-01-01T00:00:00.000Z'。
core.time.isValidDate(parsed) // true；Invalid Date 返回 false。
core.time.addDays(date, 7) // 新 Date，本机时间 2026-01-08 12:00:00。
core.time.addHours(date, 2) // 新 Date，本机时间 2026-01-01 14:00:00。
core.time.startOfDay(date) // 新 Date，本机时间 2026-01-01 00:00:00.000。
core.time.endOfDay(date) // 新 Date，本机时间 2026-01-01 23:59:59.999。
```

formatDate 支持 YYYY/MM/DD/HH/mm/ss 占位符，默认 YYYY-MM-DD；日期运算返回新 Date。parseDate 不会因无效文本自动抛错，应使用 isValidDate 检查。

更完整的参数与少见选项见[Core 使用参考](../cli/templates/skills/hai-core/reference.md)；公开契约以当前包声明为准。

## 开发测试

在仓库根目录执行（PowerShell 使用 `pnpm.cmd`）：

```bash
pnpm --filter @h-ai/core typecheck
pnpm --filter @h-ai/core lint
pnpm --filter @h-ai/core build
pnpm --filter @h-ai/core test
```

公开声明与示例检查见[模块 JSDoc 约定](../../.agents/instructions/module-conventions.md#jsdoc-与示例验证)。

## 许可证

Apache-2.0
