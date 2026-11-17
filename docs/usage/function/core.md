# @h-ai/core 功能说明

[English](core.en.md) · [日本語](core.ja.md)

从 `@h-ai/core` 导入 `core`。在浏览器和 Node.js 中都能用它写日志、翻译消息和处理数据。在 Node.js 中还可以读取本地配置文件、为每个请求保存自己的编号，并检查访问条件。

[模块 README](../../../packages/core/README.md) · [配置清单](../configuration/core.md) · [数据结构](../data/core.md) · [应用开发](../getting-started/develop.md)

<a id="quick-start"></a>

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

<a id="api-reference"></a>

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

<a id="config-api"></a>

#### 配置 API 清单

表中的 `name` 是配置在 Core 里的名字，例如 `_core.yml` 对应 `core`，`app.yml` 对应 `app`。标有 `?` 的参数可以省略。示例里的 `AppSchema` 是应用自己定义的 Zod 校验规则。[加载示例](#加载校验与读取)给出了完整定义和所用的 YAML 文件。

| API                                         | 用途                                                   | 参数与默认值                                                                                                                                                        | 返回值或失败                                                                    | 调用示例                                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `core.init(options?)`                       | 启动时设置日志、读取指定目录里的 YAML                  | `configDir` 省略时跳过目录扫描。`configSchemas` 省略时仅 `_core.yml` 自动使用内置规则。`watchConfig` 默认 `false`。传入 `logging` 会优先于 `_core.yml` 里的日志设置 | 同步返回 `void`。单个文件加载失败会写日志并继续，目录扫描或日志初始化仍可能抛错 | `core.init({ configDir: './config', configSchemas: { app: AppSchema }, watchConfig: true })`                                            |
| `core.config.loadEnvFiles(options)`         | 合并 dotenv 文件与进程已有环境变量                     | `mode` 必填，例如 `'dev'`。`envDir` 默认当前工作目录                                                                                                                | `HaiResult<Record<string, string>>`。成功后由应用决定是否写入 `process.env`     | `core.config.loadEnvFiles({ mode: 'dev' })`                                                                                             |
| `core.config.load(name, filePath, schema?)` | 读取一个 YAML 文件，应用环境覆盖，成功后保存结果       | `name` 和 `filePath` 必填。省略 `schema` 时只解析与替换                                                                                                             | `HaiResult<T>`。读取或校验失败时保留上次成功的结果                              | `core.config.load('app', './config/app.yml', AppSchema)`                                                                                |
| `core.config.validate(name, schema)`        | 用当前环境和指定规则重新检查上次成功读到的 YAML        | `name` 和 `schema` 必填。只改了磁盘文件时应先调用 `core.config.reload()`                                                                                            | `HaiResult<T>`。成功后更新已保存的数据和后续重载使用的规则                      | `core.config.validate('app', AppSchema)`                                                                                                |
| `core.config.get<T>(name)`                  | 读取已保存的配置值                                     | `name` 必填。`T` 只用于 TypeScript 类型标注                                                                                                                         | `T` 或 `undefined`                                                              | `core.config.get<{ port: number }>('app')`                                                                                              |
| `core.config.getOrThrow<T>(name)`           | 读取应用启动所需的配置值                               | `name` 必填。`T` 只用于 TypeScript 类型标注                                                                                                                         | `T`。配置未加载时抛错                                                           | `core.config.getOrThrow<{ port: number }>('app')`                                                                                       |
| `core.config.has(name)`                     | 查询配置是否已加载                                     | `name` 必填                                                                                                                                                         | `boolean`                                                                       | `core.config.has('app')`                                                                                                                |
| `core.config.keys()`                        | 列出已加载的配置名                                     | 无参数                                                                                                                                                              | `string[]`，首次加载前为空数组                                                  | `core.config.keys()`                                                                                                                    |
| `core.config.reload(name)`                  | 重新读文件，应用当前环境和已保存的校验规则，通知订阅方 | `name` 必填                                                                                                                                                         | `HaiResult<unknown>`。未加载时返回 `CONFIG_NOT_LOADED`，重载失败时保留旧值      | `core.config.reload('app')`                                                                                                             |
| `core.config.watch<T>(name, callback)`      | 在文件改变后重载并通知回调                             | `name` 和 `callback` 必填。`T` 默认为 `unknown`。回调成功时取得新值，失败时取得 `null` 和错误                                                                       | 返回取消本次订阅的函数。未加载配置时立即向回调报告 `CONFIG_NOT_LOADED`          | `const stop = core.config.watch('app', (value, error) => { if (error) core.logger.warn('Config watch failed', { code: error.code }) })` |
| `core.config.isWatching(name)`              | 检查某份配置是否有活跃的文件监听                       | `name` 必填                                                                                                                                                         | `boolean`                                                                       | `core.config.isWatching('app')`                                                                                                         |
| `core.config.unwatch(name?)`                | 停止监听，保留已加载的配置                             | 省略 `name` 时停止全部监听                                                                                                                                          | `void`                                                                          | `core.config.unwatch('app')`                                                                                                            |
| `core.config.clear(name?)`                  | 清除已加载的配置，并停止对应监听                       | 省略 `name` 时清除全部配置                                                                                                                                          | `void`。文件内容保持原样                                                        | `core.config.clear('app')`                                                                                                              |

| 生成环境配置用的 API                         | 用途                                 | 参数与默认值                                                                                                                                                                         | 返回值或失败                                                       | 调用示例                                                                                             |
| -------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `core.config.resolve(options)`               | 在内存里应用覆盖和占位符替换         | `name` 和 `value` 必填。`environment` 默认 `process.env`。可用 `schema`（Zod）或 `shape`（JSON Schema）识别字段。`missing` 默认 `'error'`，可传 `'empty'` 将缺失占位符替换为空字符串 | `HaiResult<unknown>`，应用仍需验证最终数据                         | `core.config.resolve({ name: 'app', value: { port: 3000 }, environment: { HAI_APP_PORT: '4000' } })` |
| `core.config.toEnv(options)`                 | 将配置对象转换为环境变量             | `prefix` 和 `value` 必填。可选 `schema` 或 `shape` 提供字段结构                                                                                                                      | `Record<string, string>`，不自动遮盖敏感值。非法名称会抛错         | `core.config.toEnv({ prefix: 'HAI_APP', value: { port: 3000, tags: ['local'] } })`                   |
| `core.config.mergeEnv(layers)`               | 按优先级合并多个来源                 | 传入由低到高排列的变量对象                                                                                                                                                           | `Record<string, string>`。高优先级的整段覆盖会清除低优先级的旧子项 | `core.config.mergeEnv([{ HAI_APP_PORT: '3000' }, { HAI_APP_PORT: '4000' }])`                         |
| `core.config.parseEnv(text)`                 | 将 dotenv 文本读成字面变量           | `text` 必填                                                                                                                                                                          | `Record<string, string>`。重复键或无效的生成标记值会抛错           | `core.config.parseEnv('HAI_APP_PORT=3000\n')`                                                        |
| `core.config.stringifyEnv(values, options?)` | 把环境变量编码为可写入 dotenv 的文本 | `values` 必填。`target` 默认 `'node'`，为 Compose 生成时使用 `'compose'`                                                                                                             | `string`。非法变量名会抛错                                         | `core.config.stringifyEnv({ HAI_APP_PORT: '3000' })`                                                 |

#### 加载、校验与读取

`core.init({ configDir, configSchemas?, watchConfig? })` 扫描指定目录直属的 `.yml` / `.yaml` 文件；`_core.yml` 注册为 `core`，`_db.yml` 注册为 `db`，`app.yml` 注册为 `app`。构建/部署设置由 CLI 从项目根 `hai.json` 读取，不属于运行时 YAML。

`core.init()` 自动检查 `_core.yml` 里允许的五个字段，并补齐未填写的名称、版本、运行环境和默认语言。写 `logging: {}` 会应用默认的 `info` 级别和 `pretty` 格式。完全省略 `logging` 会保留应用当前的日志设置。启动代码直接传入的 `core.init({ logging })` 优先使用。完整默认值、日志示例和 HTTP 访问设置的文件位置见 [Core 配置清单](../configuration/core.md)。

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
- 浏览器不能监听文件；`core.config.isWatching()` 始终返回 `false`，`core.config.unwatch()` 不执行任何操作。

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

<a id="logging-api"></a>

### 记录日志：`core.logger`

| API | 用途 | 输入与默认值 | 返回值 | 示例 |
| --- | --- | --- | --- | --- |
| `core.logger.trace` | 记录最细的调试步骤 | `message, ctx?` | `void` | `core.logger.trace('Callback entered')` |
| `core.logger.debug` | 记录调试信息 | `message, ctx?` | `void` | `core.logger.debug('Cache miss', { key: 'total' })` |
| `core.logger.info` | 记录正常业务事件 | `message, ctx?` | `void` | `core.logger.info('Order created', { id: 'order-1' })` |
| `core.logger.warn` | 记录需关注但可继续的情况 | `message, ctx?` | `void` | `core.logger.warn('Retry scheduled', { attempt: 2 })` |
| `core.logger.error` | 记录失败 | `message, ctx?` | `void` | `core.logger.error('Write failed', { error })` |
| `core.logger.fatal` | 记录严重故障，是否退出由应用决定 | `message, ctx?` | `void` | `core.logger.fatal('Startup failed')` |
| `core.logger.create` | 创建 Logger，省略的设置继承全局 | `options?` | `Logger` | `core.logger.create({ name: 'orders' })` |
| `core.logger.child` | 创建带固定字段的子 Logger | `fields` | `Logger` | `core.logger.child({ requestId: 'req-1' })` |
| `core.logger.configure` | 修改提供的全局日志设置 | `options` | `void` | `core.logger.configure({ format: 'json', redact: ['customer.email'] })` |
| `core.logger.setLevel` | 改全局阈值，初始为 info | `level` | `void` | `core.logger.setLevel('warn')` |
| `core.logger.getLevel` | 读当前全局阈值 | 无参数 | `LogLevel` | `core.logger.getLevel()` |
| `core.logger.observe` | 接收通过级别筛选且已脱敏的记录 | `callback` | `() => void` | `core.logger.observe(record => { recentMessages.push(record.message) })` |

日志按 `trace`、`debug`、`info`、`warn`、`error`、`fatal` 递增，只输出达到当前阈值的记录。阈值为 `fatal` 时只输出这一等级，应用自行决定是否退出。

默认日志级别为 `info`，格式为 `pretty`。在 YAML 中只写 `logging.level` 时，格式仍为 `pretty`。应用可以显式设置 `logging.format: json` 供日志系统按行读取。Node 找不到可选依赖 `pino-pretty` 时会输出 JSON。浏览器写入开发者控制台，其中的 `bigint` 值输出为十进制字符串，循环引用显示为 `[Circular]`。

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

`core.logger.create()` 创建有名称的 Logger。`orders.child()` 返回一个新的 Logger，固定字段只加在这个子 Logger 及其后代上。日志方法的第二个参数 `ctx` 给当前这一条日志追加字段。

```ts
import { core } from '@h-ai/core'

core.logger.configure({ // 用 JSON 输出 info 及以上日志，并遮盖 customer.email。
  level: 'info',
  format: 'json',
  redact: ['customer.email'],
})
const orders = core.logger.create({ name: 'orders' }) // 订单模块的 Logger。
const request = orders.child({ requestId: 'request-1' }) // 绑定请求编号，orders 不变。

// 以下两条日志都在 core.context.run() 之外执行。
orders.info('Order created', {
  customer: { email: 'user@example.com' },
}) // customer.email: '[REDACTED]'；没有 requestId，因为这里调用的是父 Logger。
request.warn('Request needs attention', { attempt: 2 })
// 同时输出 requestId: 'request-1' 和 attempt: 2；单次字段不清除已绑定的字段。

core.context.run({ requestId: 'request-2' }, () => {
  orders.info('Order checked', { attempt: 1 }) // 输出 requestId: 'request-2' 和 attempt: 1。
})
```

字段同名时，后面的来源覆盖前面的：全局字段 → Logger 固定字段（父级到子级）→ 单次 `ctx` → 当前 `core.context`。因此即便在 `ctx` 里也传了 `requestId`，当前请求上下文中的同名字段仍然优先。

修改全局级别、格式或脱敏规则后，已有 Logger 的后续输出也使用新设置；显式指定的级别和格式保持原值。浏览器 JSON 输出包含 `level` 和 `msg`，pretty 输出可读消息和上下文。

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

<a id="context-api"></a>

### 关联同一次请求：`core.context`

| API | 用途 | 参数与默认值 | 返回值 | 示例 |
| --- | --- | --- | --- | --- |
| `core.context.run(context, operation)` | 在回调内设置请求或任务编号 | 传入关联字段对象和回调。默认不暂停日志观察回调 | 回调的原始返回值，含 Promise | `await core.context.run({ requestId: 'req-1' }, async () => core.context.get().requestId)` |
| `core.context.get()` | 读取当前上下文 | 无参数 | 只读 `RequestContext`，无上下文时为空对象 | `const { requestId } = core.context.get()` |

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

<a id="sanitize-api"></a>

### 清理诊断数据：`core.sanitize`

| API | 用途 | 参数与默认值 | 返回值 | 示例 |
| --- | --- | --- | --- | --- |
| `core.sanitize.isSensitiveKey(key, matcher?)` | 判断字段名是否应隐去 | 字段名必填，默认用内置规则 | `boolean` | `core.sanitize.isSensitiveKey('apiKey')` |
| `core.sanitize.sanitizeSensitiveValue(value, key, options?)` | 清理一项值 | 传值和字段名，未知字段名时传 `null`。默认替换标记 `[REDACTED]` | 原值或清理后的值 | `core.sanitize.sanitizeSensitiveValue('example-only', 'password')` |
| `core.sanitize.sanitizeSensitiveFields(value, options?)` | 生成脱敏后的数据副本 | 值必填，可指定 `matcher` 和 `replacement` | 脱敏后的数据 | `core.sanitize.sanitizeSensitiveFields({ password: 'example-only' })` |
| `core.sanitize.sanitizeUrl(url, options?)` | 清理 URL 中的凭据 | URL 字符串，可自定义替换选项 | `string`，解析失败返回 `(invalid url)` | `core.sanitize.sanitizeUrl('https://example.com/?token=example-only')` |
| `core.sanitize.sanitizeText(text, secretValues?)` | 清理文本中有明确格式或已知值的凭据 | 字符串必填，已知值列表默认 `[]` | `string` | `core.sanitize.sanitizeText('Bearer example-only')` |
| `core.sanitize.defaultSensitiveKeyRegex`、`defaultSensitiveReplacement` | 读取内置规则及替换值 | 只读常量 | `RegExp` 和 `string` | `const replacement = core.sanitize.defaultSensitiveReplacement` |

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

<a id="error-api"></a>

### 结果与错误：`core.error`

| API | 用途 | 参数与默认值 | 返回值 | 示例 |
| --- | --- | --- | --- | --- |
| `core.error.buildHaiErrorsDef(module, codes)` | 生成模块的稳定错误定义 | 模块名和错误名称到 `业务码:HTTP状态` 的映射 | 按键索引的错误定义 | `const errors = core.error.buildHaiErrorsDef('orders', { NOT_FOUND: '300:404' })` |
| `core.error.buildHaiErrorInst(def, message, cause?, suggestion?)` | 给本次失败附上消息和诊断信息 | 错误定义和消息必填，原因和建议可省略 | `HaiError` | `const error = core.error.buildHaiErrorInst(errors.NOT_FOUND, 'Order not found')` |
| `core.error.toPublic(error, traceId?)` | 准备可返回浏览器的错误 | 错误必填，可传追踪编号 | 删除内部诊断字段的错误 | `core.error.toPublic(error, 'req-1')` |
| `core.error.formatMessage(error)` | 生成带追踪编号的文案 | 传入含消息及可选追踪编号的对象 | `string` | `core.error.formatMessage(error)` |
| `ok(data)`、`err(def, message, cause?)` | 构造成功或失败结果 | 从 `@h-ai/core` 独立导入。成功传数据，失败传错误定义和消息，也可直接传完整错误 | `HaiResult` 的对应分支 | `ok({ id: 'order-1' })`、`err(errors.NOT_FOUND, 'Order not found')` |

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

<a id="i18n-api"></a>

### 消息与语言：`core.i18n`

| API | 用途 | 参数与默认值 | 返回值 | 示例 |
| --- | --- | --- | --- | --- |
| `core.i18n.setGlobalLocale(locale)` | 设置默认语言 | 语言代码 | `void` | `core.i18n.setGlobalLocale('ja-JP')` |
| `core.i18n.getGlobalLocale()` | 读取当前语言 | 无；初始默认 `zh-CN` | 语言代码 | `core.i18n.getGlobalLocale()` |
| `core.i18n.runWithLocale(locale, operation)` | 给当前 Node 请求设置独立的语言 | 语言和回调必填 | 回调的返回值，与回调同步或异步行为一致 | `await core.i18n.runWithLocale('en-US', async () => core.i18n.coreM('core_errorNotFound'))` |
| `core.i18n.createMessageGetter(dictionaries)` | 从应用字典创建消息函数 | 传入语言到消息字典的映射 | `(key, options?) => string` | `const message = core.i18n.createMessageGetter({ 'zh-CN': { welcome: '欢迎' } })` |
| `core.i18n.coreM(key, options?)` | 查询 Core 内置文案 | 键必填，可指定 `locale` 和 `params` | `string`，缺少对应键时返回键名 | `core.i18n.coreM('core_errorNotFound', { locale: 'en-US' })` |
| `core.i18n.DEFAULT_LOCALE`、`DEFAULT_LOCALES` | 读取框架的默认和内置语言 | 只读常量 | `zh-CN` 和语言选项列表 | `const choices = core.i18n.DEFAULT_LOCALES` |

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

<a id="validation-api"></a>

### 字段校验提示：`core.zodValidation`

| API | 用途 | 参数与默认值 | 返回值 | 示例 |
| --- | --- | --- | --- | --- |
| `core.zodValidation.createPrefixedZodMessageGetter(prefix, message)` | 适配有模块前缀的消息键 | 前缀和实际查询消息的函数必填 | 消息函数 | `const translate = core.zodValidation.createPrefixedZodMessageGetter('core', message)` |
| `core.zodValidation.mapZodErrorToFormErrors(error, message)` | 生成字段错误列表 | 传入 Zod 校验失败对象和适配后的消息函数 | `{ field, message }[]` | `core.zodValidation.mapZodErrorToFormErrors(parsed.error, translate)` |

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

<a id="module-api"></a>

### 模块启动与辅助工具：`core.module`

| API | 用途 | 参数与默认值 | 返回值 | 示例 |
| --- | --- | --- | --- | --- |
| `core.module.createRuntime(steps)` | 按顺序管理应用依赖 | 每步传入名称、启动和关闭函数。可用 `enabled` 控制是否执行 | `ModuleRuntime`，其 `start()` 和 `close()` 均返回 `Promise<HaiResult<void>>` | `const runtime = core.module.createRuntime([{ name: 'cache', start: () => cache.init({ type: 'memory' }), close: () => cache.close() }])` |
| `core.module.createNotInitializedKit(codeOrDef, messageFn)` | 让模块在初始化前返回统一的失败结果 | 两个参数都必填：未初始化的错误码或错误定义，以及生成错误文案的函数 | 带 `error()`、`result<T>()`、`proxy<T>(mode?)` 的对象。代理默认异步 | `core.module.createNotInitializedKit(HaiCommonError.NOT_INITIALIZED, () => 'Initialize the module first')` |
| `core.module.requiresSharedState(environment)` | 判断当前环境是否要求共享后端 | 传入环境变量对象，生产环境中的显式 E2E 模式可豁免 | `boolean` | `core.module.requiresSharedState(process.env)` |

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

这是给模块实现者用的工具。例如，应用在 `cache.init()` 成功前调用 `cache.kv.get(key)`，缓存模块会返回一个「未初始化」的失败结果，而不会尝试访问 Redis。初始化成功后，模块才把 `cache.kv` 指向实际后端。应用使用现成模块时，先初始化、再调用并检查 `success` 即可。

`core.module.createNotInitializedKit()` 本身不负责初始化。模块可以按需要使用它返回的三个方法：

- `error()` 只返回一个错误对象。
- `result<T>()` 返回 `{ success: false, error }`，适合在某个操作内部提前返回。
- `proxy<T>()` 返回一个临时操作对象，`T` 是这组操作的接口类型。调用其任意方法都不执行业务操作，默认返回一个 Promise，`await` 后得到 `{ success: false, error }`。整组方法都是同步 API 时，用 `proxy<T>('sync')` 直接返回失败结果。

错误文案在每次生成错误时才求值；文案函数可以使用当前请求的语言。

<a id="order-lookup-example"></a>

##### 场景：订单索引加载完成前，拒绝订单查询

一个订单查询模块只有加载完状态索引才知道订单是否存在。应用启动时如果有调用提前到达，模块应该返回「未初始化」的失败结果，避免调用方把它当成「订单不存在」。下面用内存 `Map` 模拟已加载好的索引，只需要安装 `@h-ai/core`，不需要连接数据库。

```ts
import type { HaiResult } from '@h-ai/core'
import { core, HaiCommonError, ok } from '@h-ai/core'

interface OrderQueries {
  getStatus: (orderId: string) => Promise<HaiResult<string | null>>
}

const message = core.i18n.createMessageGetter({
  'zh-CN': { notReady: '订单查询模块尚未初始化' },
  'en-US': { notReady: 'Order queries are not initialized' },
  'ja-JP': { notReady: '注文照会モジュールが初期化されていません' },
})
const waiting = core.module.createNotInitializedKit(
  HaiCommonError.NOT_INITIALIZED,
  () => message('notReady'),
)
const fallback = waiting.proxy<OrderQueries>() // 与实际查询接口一致，默认返回 Promise。
let activeQueries: OrderQueries | undefined

const orderLookup = {
  init(statusById: ReadonlyMap<string, string>): HaiResult<void> {
    activeQueries = {
      async getStatus(orderId) {
        return ok(statusById.get(orderId) ?? null) // 查不到订单时成功返回 null。
      },
    }
    return ok(undefined)
  },
  get orders(): OrderQueries {
    return activeQueries ?? fallback // 每次取接口时根据模块状态选择实现。
  },
  close(): void {
    activeQueries = undefined
  },
}

const beforeInit = await orderLookup.orders.getStatus('order-42')
if (!beforeInit.success)
  core.logger.warn('Order lookup is not ready', { code: beforeInit.error.code })

// 此处用内存索引模拟已经从数据库加载完的数据。
const initialized = orderLookup.init(new Map([['order-42', 'shipped']]))
if (!initialized.success)
  throw new Error(initialized.error.message)
try {
  const found = await orderLookup.orders.getStatus('order-42')
  const missing = await orderLookup.orders.getStatus('order-99')
  if (found.success && missing.success)
    core.logger.info('Order lookup finished', { found: found.data, missing: missing.data })
}
finally {
  orderLookup.close()
}
const afterClose = await orderLookup.orders.getStatus('order-42')
if (!afterClose.success)
  core.logger.warn('Order lookup has closed', { code: afterClose.error.code })
```

| 调用时机 | 结果 |
| --- | --- |
| 初始化前查询 `order-42`（`beforeInit`） | `success: false`，错误码为 `HaiCommonError.NOT_INITIALIZED.code`，无 `data`。 |
| 初始化成功后查询 `order-42`（`found`） | `{ success: true, data: 'shipped' }`。 |
| 初始化成功后查询未知的 `order-99`（`missing`） | `{ success: true, data: null }`，实际查过索引，只是没有这一单。 |
| 关闭后再次查询 `order-42`（`afterClose`） | 再次返回「未初始化」失败。 |

`proxy()` 不会变成真正的查询对象。是 `orderLookup.orders` 的 getter 在模块就绪后改为返回实际查询，因此每次调用都从 `orderLookup.orders` 取接口，不要把初始化前拿到的占位对象缓存下来。

#### 判断是否需要共享状态

`requiresSharedState()` 判断生产进程是否应拒绝只在本机有效的业务状态后端。它只返回判断，不连接或切换数据库；实际环境由服务端传入。

```ts
import { core } from '@h-ai/core'

// 此例用显式数据演示；服务端实际使用时传入 process.env。
core.module.requiresSharedState({ NODE_ENV: 'production' }) // true：应使用跨主机共享后端。
core.module.requiresSharedState({ NODE_ENV: 'production', HAI_E2E: '1' }) // false：显式 E2E 例外。
```

<a id="access-api"></a>

### 请求访问检查：`core.access`（Node）

这组工具让 Node 后端在执行接口前，先按请求的路径、HTTP 方法、客户端 IP 和服务器时间决定是否放行。例如，限制只有合作方网段能调用某个同步接口。通过检查只表示满足访问策略，接口仍需按自己的规则验证身份和权限。

- 用 **Serv** 或 **Kit**：分别在 `_serv.yml` 的 `http.access` 或 `_kit.yml` 的 `access` 写规则。将对应设置交给 `serv.createApp({ http, ... })` 或 `kit.createHandle({ access, ... })` 后，框架会在启动时准备检查器，每次收到请求自动检查，拒绝时返回 HTTP 403。规则不写在 `_core.yml`。
- 用 **其他 Node HTTP 框架**：启动时创建 IP 解析器和规则检查器。每次请求时先从连接取出对端地址并解析客户端 IP，再把 URL 的 `pathname`、HTTP 方法和该 IP 传给检查器。Core 返回判定结果，HTTP 响应由你的代码负责。

| API | 用途 | 参数与默认值 | 返回值 | 示例 |
| --- | --- | --- | --- | --- |
| `core.access.normalizeClientIp(value?)` | 检查并整理一个 IP 字符串 | 可省略地址 | 有效 IP 字符串；缺少地址或格式无效时返回 `undefined` | `core.access.normalizeClientIp('::ffff:198.51.100.23')` |
| `core.access.createClientIpResolver(trustedProxies?)` | 创建一个函数，逐请求选出供访问策略检查的 IP | 默认 `auto`；可传代理的 IP 或 CIDR 列表，`[]` 表示不信任任何代理 | `resolveClientIp(request, remoteAddress?)`，返回 IP 或 `undefined` | `const resolveClientIp = core.access.createClientIpResolver(['192.0.2.10'])` |
| `core.access.createConditionCheck(condition)` | 单独检查 IP 和当前时段，不匹配路径或方法 | 必须传完整的条件对象；字段见[配置清单](../configuration/core.md#request-access) | `checkCondition(ip?)`，返回 `AccessDecision` | `core.access.createConditionCheck({ allowIps: ['198.51.100.0/24'], denyIps: [], timezone: 'UTC', windows: [] })` |
| `core.access.createRequestCheck(input?)` | 启动时准备请求检查器 | 内联策略、`{ file }` 或 `false`，省略时为 `false` | `check(pathname, method, ip?)`，返回 `AccessDecision`；无法创建时抛错 | `const check = core.access.createRequestCheck({ file: './config/security/request-access.yml' })` |
| `core.access.loadPolicy(input?, baseDirectory?)` | 只读取和校验策略，适合部署前检查文件 | 策略输入同上；相对路径默认从进程工作目录起算 | 校验后的策略对象或 `false`，无效时抛错 | `core.access.loadPolicy({ file: './config/security/request-access.yml' })` |

<a id="client-ip-resolver"></a>

#### 解析与检查客户端地址

**`core.access.createClientIpResolver()` 解决的是「访问策略该检查哪个 IP」的问题。** 比如合作方 `198.51.100.23` 经反向代理 `192.0.2.10` 访问服务时，Node 的套接字只看得到和它直接建立连接的代理 `192.0.2.10`。把这个地址直接交给访问策略，检查到的就是代理，而不是合作方。IP 解析函数会根据你信任哪些代理，决定能否采用代理报告的上游地址。

- **启动时**：`createClientIpResolver(['192.0.2.10'])` 返回一个函数。列表填的是哪些代理有权报告请求来源，**不是**哪些客户端能访问接口。客户端白名单另写在策略的 `allowIps`。
- **每次请求时**：调用 `resolveClientIp(request, remoteAddress)`。`request` 提供请求头；`remoteAddress` 是服务器从套接字（例如 `socket.remoteAddress`）或可信平台取得的直接连接地址，不从请求头里取。返回的是供访问策略检查的 IP 字符串，取不到则返回 `undefined`。

| 谁直接连到 Node（`remoteAddress`） | `X-Forwarded-For` | 用于检查的 IP |
| --- | --- | --- |
| 受信代理 `192.0.2.10` | `198.51.100.23` | `198.51.100.23`：采信这个代理报告的上游地址。 |
| 未列为受信代理的连接 `203.0.113.7` | 同样是 `198.51.100.23` | `203.0.113.7`：忽略转发头。 |
| 受信代理 `192.0.2.10` | 未提供，也没有 `X-Real-IP` | `192.0.2.10`：只能确认直接连接的地址。 |
| 受信代理 `192.0.2.10` | 需要使用的地址无效 | `undefined`：无法确定上游地址。 |
| 未提供直接连接地址 | 即使有转发头 | `undefined`：无法判断报上地址的是不是受信代理。 |

受信代理提供多个地址时，从 `X-Forwarded-For` 最右边开始，逐跳向左跳过受信代理，取遇到的第一个非受信地址；如果一路都是受信地址，就取最左侧地址。只有缺少 `X-Forwarded-For` 时才读取 `X-Real-IP`。普通 Node 服务使用默认的 `auto` 时忽略转发头；框架生成的私有 Compose 部署会自动使用容器所在的私有网段。显式传 `[]` 则总是忽略转发头。

```ts
import { core } from '@h-ai/core'

// 启动时配置代理地址。这个数组不是合作方的 IP 白名单。
const resolveClientIp = core.access.createClientIpResolver(['192.0.2.10'])
const request = new Request('https://example.test/api/partners/inventory/sync', {
  headers: { 'X-Forwarded-For': '198.51.100.23' },
})

// 用同一个请求头对比不同的直接连接地址。实际服务从连接读取第二个参数。
const throughProxy = resolveClientIp(request, '192.0.2.10') // '198.51.100.23'
const direct = resolveClientIp(request, '203.0.113.7') // '203.0.113.7'
const unknown = resolveClientIp(request) // undefined

// 用解析后的地址检查合作方网段；路径和方法规则请用下方的 createRequestCheck 示例。
const checkIp = core.access.createConditionCheck({
  allowIps: ['198.51.100.0/24'],
  denyIps: [],
  timezone: 'UTC',
  windows: [],
})
checkIp(throughProxy).allowed // true
checkIp(direct).allowed // false
checkIp(unknown).allowed // false
```

解析成功也不会自动放行：需要把结果交给 `checkIp(ip)` 或 `checkAccess(pathname, method, ip)`。如果规则限制了来源 IP，缺少可用地址（`undefined`）也会被拒绝。Serv 和 Kit 会在内部完成这两步，应用只需在配置里分别设置 `trustedProxies` 和访问策略。

#### 读取策略并检查请求

先检查 `global`，再检查所有路径和方法都匹配的规则；全部通过才放行。没有匹配规则时只受 `global` 限制。`methods` 省略或为空表示匹配全部方法，`/**` 同时匹配该路径和它的子路径。拒绝时返回 `{ allowed: false, reason, ruleId? }`：`reason` 为 `address`、`time` 或 `path`；如果是某条路径规则拒绝，`ruleId` 可以用来定位规则。

<a id="partner-sync-example"></a>

##### 场景：只允许合作方在工作时段同步库存

服务通过反向代理提供 `POST /api/partners/inventory/sync`。库存同步只允许来自合作方网段 `198.51.100.0/24` 的请求，并且只在上海时间周一到周五 `09:00`（含）至 `18:00`（不含）开放。`GET /health` 不受这条规则影响，监控可以照常检查。

下面演示如何接入自建的 Node HTTP 服务。启动时创建解析器和检查器。每次请求时，HTTP 适配层将 Fetch `Request`、服务器套接字看到的对端地址和原有的请求处理函数传给 `handlePartnerAccess()`。示例中的 `192.0.2.10` 是反向代理连接后端时使用的地址；部署时把它和合作方网段替换为实际值。

```ts
import { core } from '@h-ai/core'

// 启动时配置一次：这里只信任直接连到后端的反向代理。
const resolveClientIp = core.access.createClientIpResolver(['192.0.2.10'])
const checkAccess = core.access.createRequestCheck({
  rules: [
    {
      id: 'partner-inventory-sync',
      paths: ['/api/partners/inventory/sync'],
      methods: ['POST'],
      allowIps: ['198.51.100.0/24'],
      timezone: 'Asia/Shanghai',
      windows: [{ days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }],
    },
  ],
})

async function handlePartnerAccess(
  request: Request,
  peerAddress: string | undefined,
  next: (request: Request) => Response | Promise<Response>,
): Promise<Response> {
  const clientIp = resolveClientIp(request, peerAddress)
  const { pathname } = new URL(request.url)
  const decision = checkAccess(pathname, request.method, clientIp)
  if (!decision.allowed) {
    core.logger.info('Request access denied', {
      ruleId: decision.ruleId,
      reason: decision.reason,
    })
    return new Response(null, { status: 403 })
  }
  return next(request) // 后续仍执行服务自己的认证和路由逻辑。
}
```

| 进入后端的请求（上海时间） | 结果 |
| --- | --- |
| 周一 10:00，合作方 `198.51.100.23` 经受信代理发送库存同步请求 | 放行，继续认证和处理库存同步；最终状态码由后续处理函数决定。 |
| 周一 10:00，其他网段经同一代理请求同步 | 返回 `403`；服务日志的 `reason` 为 `address`。 |
| 周一 18:00，合作方再次请求同步 | 返回 `403`；日志的 `reason` 为 `time`。 |
| 任意时间请求 `GET /health` | 没有命中这条规则，健康检查继续执行。 |

用 Serv 或 Kit 时，无需复制这段处理函数。把规则写进 `_serv.yml` 的 `http.access` 或 `_kit.yml` 的 `access`，对应的代理地址写进 `http.trustedProxies` 或顶层 `trustedProxies`；配置示例见[请求访问策略](../configuration/core.md#request-access)。

也可以从独立的 YAML 读取策略。下面改用[独立文件示例](../configuration/request-access.md#41-准备文件)中的规则来演示文件读取，它与上面的库存同步规则是两个例子。

```ts
import { core } from '@h-ai/core'

// 相对路径从 Node 进程的工作目录起算。文件只在创建检查器时读取。
const check = core.access.createRequestCheck({ file: './config/security/request-access.yml' })
// 链接中的示例文件拒绝 192.0.2.7，结果的 allowed 为 false，reason 为 'address'。
const decision = check('/api/v1/external/sync', 'GET', '192.0.2.7')
```

- 文件只在创建检查器时读取，改完需要重启服务或重新创建检查器。文件最大 1 MiB，读不到或内容无效时会抛错；不要带着无效策略继续启动。
- `denyIps` 优先于 `allowIps`。允许名单为空时不额外限制来源，但拒绝名单仍然有效。时段列表为空时不限制时间；有时段时按服务器时钟判断，默认使用 UTC。
- `check.encryption(pathname, method)` 只按路径和方法返回 `'required'`、`'disabled'` 或 `undefined`。没有显式设置时返回 `undefined`，由 HTTP 服务沿用自己的设置。若规则的加密模式互相冲突，检查器创建失败；若 `check.requiresEncryption` 为 `true`，Serv 和 Kit 没有配置应用层传输加密时会拒绝启动。

完整默认值、独立文件、代理拓扑及部署步骤见[请求访问控制手册](../configuration/request-access.md)。

<a id="id-api"></a>

### 生成与校验标识：`core.id`

生成业务标识与日志关联编号，或检查输入是否符合 UUID v4 / nanoid 格式。

| API | 用途 | 输入与默认值 | 返回值 | 示例 |
| --- | --- | --- | --- | --- |
| `core.id.generate` | 生成随机 ID | `length = 21` | `string` | `core.id.generate(8)` |
| `core.id.short` | 生成固定长度短 ID | 无参数 | `string` | `core.id.short()` |
| `core.id.withPrefix` | 给随机 ID 加上业务前缀 | `prefix, length = 21` | `string` | `core.id.withPrefix('order_')` |
| `core.id.trace` | 生成以 trace- 开头的追踪编号 | 无参数 | `string` | `core.id.trace()` |
| `core.id.request` | 生成以 req- 开头的请求编号 | 无参数 | `string` | `core.id.request()` |
| `core.id.uuid` | 生成 UUID v4，缺安全随机源会抛错 | 无参数 | `string` | `core.id.uuid()` |
| `core.id.isValidUUID` | 检查 UUID v4 的格式 | `value` | `boolean` | `core.id.isValidUUID('550e8400-e29b-41d4-a716-446655440000')` |
| `core.id.isValidNanoId` | 检查字符范围和长度 | `value, length = 21` | `boolean` | `core.id.isValidNanoId('abc', 3)` |

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

<a id="type-api"></a>

### 判断值的类型：`core.typeUtils`

对边界数据做类型判断，并帮助 TypeScript 在分支中缩小类型；这些判断不替代业务 Schema 校验。

| API | 用途 | 输入与默认值 | 返回值 | 示例 |
| --- | --- | --- | --- | --- |
| `core.typeUtils.isDefined` | 判断值是否既不是 null 也不是 undefined | `value` | `boolean` | `core.typeUtils.isDefined(null)` |
| `core.typeUtils.isObject` | 判断值是否为对象，排除 null 和数组 | `value` | `boolean` | `core.typeUtils.isObject({ name: 'orders' })` |
| `core.typeUtils.isFunction` | 判断是否为函数 | `value` | `boolean` | `core.typeUtils.isFunction(() => {})` |
| `core.typeUtils.isPromise` | 判断是否为 Promise | `value` | `boolean` | `core.typeUtils.isPromise(Promise.resolve('ready'))` |
| `core.typeUtils.isString` | 判断是否为字符串 | `value` | `boolean` | `core.typeUtils.isString('orders')` |
| `core.typeUtils.isNumber` | 判断是否为数字，排除 NaN | `value` | `boolean` | `core.typeUtils.isNumber(3000)` |
| `core.typeUtils.isBoolean` | 判断是否为布尔值 | `value` | `boolean` | `core.typeUtils.isBoolean(false)` |
| `core.typeUtils.isArray` | 判断是否为数组 | `value` | `boolean` | `core.typeUtils.isArray([1, 2])` |

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

<a id="object-api"></a>

### 处理对象：`core.object`

复制、合并或选取对象字段，也提供带键类型的 keys/values/entries 与 fromEntries。

| API | 用途 | 输入与默认值 | 返回值 | 示例 |
| --- | --- | --- | --- | --- |
| `core.object.deepClone` | 复制可克隆的值，函数等不可克隆输入会抛错 | `value` | `T` | `core.object.deepClone({ mode: 'local' })` |
| `core.object.deepMerge` | 递归合并普通对象，后值优先 | `...objects` | `T` | `core.object.deepMerge({ port: 3000 }, { port: 4000 })` |
| `core.object.pick` | 只保留列出的键 | `object, keys` | `Pick<T, K>` | `core.object.pick({ a: 1, b: 2 }, ['a'])` |
| `core.object.omit` | 移除列出的键 | `object, keys` | `Omit<T, K>` | `core.object.omit({ a: 1, b: 2 }, ['a'])` |
| `core.object.keys` | 列出对象自己的可枚举字符串键 | `object` | `(keyof T)[]` | `core.object.keys({ a: 1 })` |
| `core.object.values` | 依同样顺序列出对象的值 | `object` | `T[keyof T][]` | `core.object.values({ a: 1 })` |
| `core.object.entries` | 返回键值对 | `object` | `[keyof T, T[keyof T]][]` | `core.object.entries({ a: 1 })` |
| `core.object.fromEntries` | 从键值对构造对象 | `entries` | `Record<K, V>` | `core.object.fromEntries([['mode', 'local']])` |

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

<a id="string-api"></a>

### 处理字符串：`core.string`

统一命名格式、处理显示文字、判断空白以及比较字符串。

| API | 用途 | 输入与默认值 | 返回值 | 示例 |
| --- | --- | --- | --- | --- |
| `core.string.capitalize` | 首字符大写 | `text` | `string` | `core.string.capitalize('hello')` |
| `core.string.kebabCase` | 转换成连字符分隔的命名 | `text` | `string` | `core.string.kebabCase('helloWorld')` |
| `core.string.camelCase` | 转换成小驼峰命名 | `text` | `string` | `core.string.camelCase('hello-world')` |
| `core.string.snakeCase` | 转换成下划线分隔的命名 | `text` | `string` | `core.string.snakeCase('helloWorld')` |
| `core.string.pascalCase` | 转换成大驼峰命名 | `text` | `string` | `core.string.pascalCase('hello-world')` |
| `core.string.truncate` | 超过指定长度时截取，再加后缀 | `text, length, suffix = '...'` | `string` | `core.string.truncate('abcdef', 3)` |
| `core.string.trim` | 移除首尾空白 | `text` | `string` | `core.string.trim(' hello ')` |
| `core.string.isBlank` | 判断是否为空或只有空白 | `text` | `boolean` | `core.string.isBlank(' ')` |
| `core.string.isNotBlank` | 判断是否至少有一个非空白字符 | `text` | `boolean` | `core.string.isNotBlank('hello')` |
| `core.string.padStart` | 在开头填充到指定长度 | `text, length, pad = ' '` | `string` | `core.string.padStart('5', 3, '0')` |
| `core.string.padEnd` | 在末尾填充到指定长度 | `text, length, pad = ' '` | `string` | `core.string.padEnd('5', 3, '0')` |
| `core.string.constantTimeEqual` | 比较字符串，不同长度立即返回 false | `left, right` | `boolean` | `core.string.constantTimeEqual('same', 'same')` |

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

<a id="array-api"></a>

### 处理数组：`core.array`

按任务需要对数组去重、分块、分组、筛除空值或计算交集/差集；返回结果，保留输入数组。

| API | 用途 | 输入与默认值 | 返回值 | 示例 |
| --- | --- | --- | --- | --- |
| `core.array.unique` | 按首次出现的顺序去重 | `items` | `T[]` | `core.array.unique([1, 1, 2])` |
| `core.array.groupBy` | 按回调返回的键分组 | `items, keySelector` | `Record<K, T[]>` | `core.array.groupBy(['a', 'bb'], value => value.length)` |
| `core.array.chunk` | 按正整数大小分块，无效大小返回空数组 | `items, size` | `T[][]` | `core.array.chunk([1, 2, 3], 2)` |
| `core.array.first` | 读取首项，空数组没有值 | `items` | `T or undefined` | `core.array.first([1, 2])` |
| `core.array.last` | 读取末项，空数组没有值 | `items` | `T or undefined` | `core.array.last([1, 2])` |
| `core.array.flatten` | 展开一层嵌套数组 | `items` | `T[]` | `core.array.flatten([[1], [2, 3]])` |
| `core.array.compact` | 移除 null 和 undefined，保留 0 等值 | `items` | `T[]` | `core.array.compact([0, null, 1])` |
| `core.array.shuffle` | 返回随机排列的副本 | `items` | `T[]` | `core.array.shuffle([1, 2, 3])` |
| `core.array.intersection` | 保留第一个数组中也出现在第二个数组的元素 | `first, second` | `T[]` | `core.array.intersection([1, 2], [2, 3])` |
| `core.array.difference` | 只保留第一个数组中未出现在第二个数组的元素 | `first, second` | `T[]` | `core.array.difference([1, 2], [2, 3])` |

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
core.array.difference([1, 2], [2, 3]) // [1]：只保留第一个数组中未出现在第二个数组的元素。
core.array.difference([2, 3], [1, 2]) // [3]：交换参数会改变结果。
```

`difference()` 保留第一个数组中的顺序和未被筛除的重复项；它不计算两边各自独有元素的并集。本例如果要两边各自独有的值，应分别求两个方向的差集，合并得到 `[1, 3]`。

`groupBy()` 支持与原型属性同名的键，例如 `constructor`。`chunk()` 要求块大小为正安全整数，传入小数、无穷大或其他无效大小时返回空数组。

<a id="async-api"></a>

### 组织异步操作：`core.async`

安排延迟、超时、失败重试、限并发与串行处理，或为输入/滚动等事件添加防抖与节流。

| API | 用途 | 输入与默认值 | 返回值 | 示例 |
| --- | --- | --- | --- | --- |
| `core.async.delay` | 异步等待指定毫秒数 | `ms` | `Promise<void>` | `await core.async.delay(10)` |
| `core.async.withTimeout` | 限制等待时间，超时让等待方失败 | `promise, ms` | `Promise<T>` | `await core.async.withTimeout(Promise.resolve('ready'), 1000)` |
| `core.async.retry` | 抛错时重试；次数包含第一次 | `operation, { maxRetries = 3, delay = 1000 }?` | `Promise<T>` | `await core.async.retry(async () => 'ready')` |
| `core.async.parallel` | 限制同时执行的数量，按原顺序返回 | `items, action, concurrency = 5` | `Promise<R[]>` | `await core.async.parallel([1, 2], async n => n * 2, 2)` |
| `core.async.serial` | 按输入顺序逐项执行 | `items, action` | `Promise<R[]>` | `await core.async.serial([1, 2], async n => n * 2)` |
| `core.async.debounce` | 等调用停止一段时间后处理最后一次输入 | `callback, ms` | `wrapper` | `core.async.debounce(callback, 100)` |
| `core.async.throttle` | 立即处理第一次，在间隔内跳过后续调用 | `callback, ms` | `wrapper` | `core.async.throttle(callback, 100)` |

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

<a id="time-api"></a>

### 处理日期与时间：`core.time`

在毫秒/秒时间戳、Date 和显示文本之间转换，并计算当地日期边界与相对时间。

| API | 用途 | 输入与默认值 | 返回值 | 示例 |
| --- | --- | --- | --- | --- |
| `core.time.formatDate` | 按本地时区填写格式中的日期占位符 | `date, format = 'YYYY-MM-DD'` | `string` | `core.time.formatDate(new Date(2026, 0, 1))` |
| `core.time.timeAgo` | 按当前语言显示距今时间 | `date` | `string` | `core.time.timeAgo(new Date(Date.now() - 120_000))` |
| `core.time.now` | 读取 Unix 毫秒 | 无参数 | `number` | `core.time.now()` |
| `core.time.nowSeconds` | 读取向下取整的 Unix 秒 | 无参数 | `number` | `core.time.nowSeconds()` |
| `core.time.parseDate` | 将字符串交给原生 Date 解析，无效输入得到无效日期 | `text` | `Date` | `core.time.parseDate('2026-01-01T00:00:00Z')` |
| `core.time.isValidDate` | 检查 Date 是否代表有效时间 | `date` | `boolean` | `core.time.isValidDate(new Date('invalid'))` |
| `core.time.addDays` | 按本地日历移动指定天数 | `date, days` | `Date` | `core.time.addDays(date, 7)` |
| `core.time.addHours` | 按本地时钟移动指定小时数 | `date, hours` | `Date` | `core.time.addHours(date, 2)` |
| `core.time.startOfDay` | 取当天的本地午夜 | `date` | `Date` | `core.time.startOfDay(date)` |
| `core.time.endOfDay` | 取当天最后一毫秒 | `date` | `Date` | `core.time.endOfDay(date)` |

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

## 错误处理

领域操作先判断 `result.success`，失败按本模块错误定义与安全提示处理，服务端保留错误码、关联编号和脱敏原因。同步工具、工厂、流迭代及生命周期按各自签名处理，不把 Promise 完成视为业务成功。具体失败与恢复边界见对应功能。
