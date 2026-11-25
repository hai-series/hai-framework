# @h-ai/core 功能说明

[English](core.en.md) · [日本語](core.ja.md)

从 `@h-ai/core` 导入 `core`。在浏览器和 Node.js 中都能用它写日志、翻译消息和处理数据。在 Node.js 中还可以读取本地配置文件、为每个请求保存自己的编号，并检查访问条件。

[模块 README](../../../packages/core/README.md) · [配置清单](../configuration/core.md) · [数据结构](../data/core.md) · [应用开发](../getting-started/develop.md)

<a id="module-dependencies"></a>

## 依赖

| 依赖 | 用途 | 何时需要 | 接入顺序 |
| --- | --- | --- | --- |
| Node.js / 浏览器 | 提供对应环境的配置、日志和通用工具。 | YAML 配置、`core.access` 和工作线程池使用 Node.js 入口。浏览器使用浏览器入口。 | 公共工具可直接使用。应用要加载配置或设置日志时在启动阶段调用 `core.init()`。 |
| `yaml`、`pino`、`loglevel` | 在 Node.js 解析 YAML 和写日志，在浏览器写日志。 | 按默认选项安装 Core 时一并安装，保留当前运行入口所需的包。 | Core 通过对应运行入口加载。 |
| `pino-pretty` | 将 Node.js 日志格式化为易阅读的文本。 | 需要 `pretty` 文本输出时单独安装。缺少时输出 JSON。 | 启动前安装，通过 `logging.format` 选用。 |
| `zod` | 校验配置和表单输入。 | 随 Core 安装。应用直接导入 Zod 来定义 Schema 时，将它列为直接依赖。 | 定义自己的 Schema 后可交给 Core 校验。 |

<a id="quick-start"></a>

## 最小接入示例

### 接入示例

```bash
pnpm add @h-ai/core
```

从 `@h-ai/core` 导入 `core` 后，就可以记录日志、读取消息或使用通用工具。`core.ok`、`core.err`、类型、Schema 和错误常量也从同一入口导入。运行自定义配置和表单校验示例前，请安装 Zod（`pnpm add zod`）。

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

import { type CoreConfig, core } from '@h-ai/core'

// 读取 config 目录。_core.yml 校验成功后以 core 为名存入缓存。
// 读取当前项目 ./config 直属配置文件，加载成功后可按名称读取。初始化本身无返回值。
core.init({ configDir: './config' })
// 取刚加载的 core 配置快照，缺失时抛错。
const settings = core.config.getOrThrow<CoreConfig>('core')

// 应用默认语言并记录启动成功。
// 以配置中的默认语言更新后续消息，无返回数据。
core.i18n.setGlobalLocale(settings.defaultLocale)
// 将配置中的应用名称写入启动日志，无业务数据。
core.logger.info('Application ready', { app: settings.name }) // app: 'orders'
```

`core.init()` 同步加载目录。单项配置读取或校验失败时，日志会记录文件和错误码，然后继续加载其他文件。示例中的 `getOrThrow()` 会在必需的 `core` 配置缺失时中止启动。目录扫描和日志设置仍可能抛出异常。

#### 浏览器

```ts
import { core } from '@h-ai/core'

// 在页面启动时设置日志阈值和默认语言。
// 用下面的 warn 日志选项初始化浏览器 Core，更新日志阈值，无返回值。
core.init({
  logging: { level: 'warn' }
})
// 将默认语言设为 zh-CN，之后默认消息使用中文。
core.i18n.setGlobalLocale('zh-CN')

// 把请求编号写入日志，便于关联后续记录。
// 不传参数生成带 req- 前缀的随机请求 ID。
const requestId = core.id.request()
// 按当前 warn 阈值记录刚生成的请求编号，无业务数据。
core.logger.warn('Request needs attention', { requestId })
```

浏览器里的 `core.init()` 使用页面代码传入的日志选项，示例直接在前端写入 `warn`。如果页面还需要显示服务器上的应用名称，可以让后端的页面加载函数返回 `{ name: settings.name }`，再由浏览器读取。在发送给浏览器的数据中只放页面要用、访客可以看到的值。数据库密码、传输私钥和完整 `_core.yml` 等配置留在服务器上。

在浏览器调用 `core.config.get()` 会得到 `undefined`，`core.config.has()` 得到 `false`，`core.config.keys()` 得到空数组。`core.config.loadEnvFiles()`、`core.config.load()`、`core.config.validate()` 和 `core.config.reload()` 返回带 `SERVICE_UNAVAILABLE` 的失败结果。`core.config.getOrThrow()` 会抛出异常。`core.config.watch()` 会立即把同一错误交给你的回调，并返回一个调用后什么也不做的停止函数。

## 运行环境

两端都通过 `import { core } from '@h-ai/core'` 使用，由打包工具选择对应环境的代码。

| 能力                                                      | Node.js                                                        | 浏览器                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 日志、结果/错误、消息、通用工具，以及模块的顺序启动与关闭 | 支持                                                           | 支持                                                                     |
| YAML、dotenv、环境映射与文件监听                          | 可以读取和监听本地配置文件                                     | 不能读取或监听本地文件；调用加载方法会返回失败                           |
| 请求关联 `core.context.run`                               | 每个请求保留自己的编号等信息，等待异步操作后仍能读取，互不串用 | 只在回调的同步代码中保留信息，`await` 后不再保留                         |
| 请求语言 `core.i18n.runWithLocale`                        | 请求使用自己的语言，等待异步操作后也不会受其他请求影响         | 调用会抛错。用 `core.i18n.setGlobalLocale()` 设置页面语言，或在取消息时指定 locale |
| 请求策略 `core.access`                                    | 可以检查请求地址、路径和时段                                   | 不提供此工具                                                             |

`core.init()` 只负责 Core 的配置和日志设置，同步返回 `void`，Core 没有 `close()` 方法。应用如果还需要启动数据库、缓存等模块，可用 `core.module.createRuntime()` 集中管理它们：调用返回对象的 `start()` 依次初始化，调用 `close()` 按相反顺序清理。下方“应用启动与关闭”给出完整示例。

<a id="api-reference"></a>

## 功能说明

<a id="config-api"></a>

### 文件与环境配置：`core.config`

读取 YAML、应用环境变量覆盖、检查配置类型，并管理配置缓存与文件监听。下列文件与环境操作仅在 Node 中可用。

表中的 `name` 是配置在 Core 里的名字，例如 `_core.yml` 对应 `core`，`app.yml` 对应 `app`。标有 `?` 的参数可以省略。示例里的 `AppSchema` 是应用自己定义的 Zod 校验规则。[加载示例](#加载校验与读取)给出了完整定义和所用的 YAML 文件。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `core.init(options?)` | 启动时设置日志、读取指定目录里的 YAML | `options` 可省略。`configDir` 省略时跳过目录扫描。`configSchemas` 省略时仅 `_core.yml` 自动使用内置规则。`watchConfig` 默认 `false`。传入 `logging` 会优先于 `_core.yml` 里的日志设置 | 同步返回 `void`。单个文件加载失败会写日志并继续，目录扫描或日志初始化仍可能抛错 | `core.init({ configDir: './config', configSchemas: { app: AppSchema }, watchConfig: true })` |
| `core.config.loadEnvFiles(options)` | 合并 dotenv 文件与进程已有环境变量 | 必填 `options`。`mode` 必填，例如 `'dev'`。`envDir` 默认当前工作目录 | `HaiResult<Record<string, string>>`。成功后由应用决定是否写入 `process.env` | `core.config.loadEnvFiles({ mode: 'dev' })` |
| `core.config.load(name, filePath, schema?)` | 读取一个 YAML 文件，应用环境覆盖，成功后保存结果 | `name` 和 `filePath` 必填。省略 `schema` 时只解析与替换 | `HaiResult<T>`。读取或校验失败时保留上次成功的结果 | `core.config.load('app', './config/app.yml', AppSchema)` |
| `core.config.validate(name, schema)` | 用当前环境和指定规则重新检查上次成功读到的 YAML | 必填已加载配置别名 `name` 和检查结构的 Zod `schema`。磁盘变更用 `reload()` 读取。 | `HaiResult<T>`。成功后更新已保存的数据和后续重载使用的规则 | `core.config.validate('app', AppSchema)` |
| `core.config.get<T>(name)` | 读取已保存的配置值 | 必填 `name` 为已加载的配置名。 `T` 指定读取值的 TypeScript 类型。 | `T` 或 `undefined` | `core.config.get<{ port: number }>('app')` |
| `core.config.getOrThrow<T>(name)` | 读取应用启动所需的配置值 | 必填 `name` 为要读取的配置名。 `T` 指定读取值的 TypeScript 类型。 | `T`。配置未加载时抛错 | `core.config.getOrThrow<{ port: number }>('app')` |
| `core.config.has(name)` | 查询配置是否已加载 | 必填 `name` 为要检查是否已加载的配置名。 | `boolean` | `core.config.has('app')` |
| `core.config.keys()` | 列出已加载的配置名 | 无参数 | `string[]`，首次加载前为空数组 | `core.config.keys()` |
| `core.config.reload(name)` | 重新读文件，应用当前环境和已保存的校验规则，通知订阅方 | 必填 `name` 指向要从磁盘重新加载的已注册配置。 | `HaiResult<unknown>`。未加载时返回 `CONFIG_NOT_LOADED`，重载失败时保留旧值 | `core.config.reload('app')` |
| `core.config.watch<T>(name, callback)` | 在文件改变后重载并通知回调 | 必填配置别名 `name` 与 `callback(value, error)`。回调收到新值，或失败时收到 `null` 和错误。 | 返回取消本次订阅的函数。未加载配置时立即向回调报告 `CONFIG_NOT_LOADED` | `const stop = core.config.watch('app', (value, error) => { if (error) core.logger.warn('Config watch failed', { code: error.code }) })` |
| `core.config.isWatching(name)` | 检查某份配置是否有活跃的文件监听 | 必填 `name` 指定要检查监听状态的配置。 | `boolean` | `core.config.isWatching('app')` |
| `core.config.unwatch(name?)` | 停止监听，保留已加载的配置 | 省略 `name` 时停止全部监听 | `void` | `core.config.unwatch('app')` |
| `core.config.clear(name?)` | 清除已加载的配置，并停止对应监听 | 省略 `name` 时清除全部配置 | `void`。文件内容保持原样 | `core.config.clear('app')` |

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `core.config.resolve(options)` | 在内存里应用覆盖和占位符替换 | 必填 `options`。`name` 和 `value` 必填。`environment` 默认 `process.env`。可用 `schema`（Zod）或 `shape`（JSON Schema）识别字段。`missing` 默认 `'error'`，可传 `'empty'` 将缺失占位符替换为空字符串 | `HaiResult<unknown>`，应用仍需验证最终数据 | `core.config.resolve({ name: 'app', value: { port: 3000 }, environment: { HAI_APP_PORT: '4000' } })` |
| `core.config.toEnv(options)` | 将配置对象转换为环境变量 | 必填 `options`。`prefix` 和 `value` 必填。可选 `schema` 或 `shape` 提供字段结构 | `Record<string, string>`，不自动遮盖敏感值。非法名称会抛错 | `core.config.toEnv({ prefix: 'HAI_APP', value: { port: 3000, tags: ['local'] } })` |
| `core.config.mergeEnv(layers)` | 按优先级合并多个来源 | `layers` 是按优先级从低到高排列的变量对象数组。 | `Record<string, string>`。高优先级的整段覆盖会清除低优先级的旧子项 | `core.config.mergeEnv([{ HAI_APP_PORT: '3000' }, { HAI_APP_PORT: '4000' }])` |
| `core.config.parseEnv(text)` | 将 dotenv 文本读成字面变量 | 必填 `text` 为 dotenv 文件正文。 | `Record<string, string>`。重复键或无效的生成标记值会抛错 | `core.config.parseEnv('HAI_APP_PORT=3000\n')` |
| `core.config.stringifyEnv(values, options?)` | 把环境变量编码为可写入 dotenv 的文本 | `values` 必填，键和值都是字符串。可省略 `options`。其 `target` 默认 `node`，为 Compose 的 env 文件使用 `compose`。 | `string`。非法变量名会抛错 | `core.config.stringifyEnv({ HAI_APP_PORT: '3000' })` |

<a id="加载校验与读取"></a>

#### 场景：加载、校验与读取

下图把读盘、环境覆盖、校验和保存分开。load 负责首次加载；reload 使用上次保存的文件位置和校验规则。

![配置何时替换，失败时保留什么](../images/function-core-config.svg)

以 port: 3000 和 HAI_APP_PORT=4000 为例，校验成功才把缓存替换为 4000。读盘或校验失败时保留此前成功的值；reload 的监听者会收到新值或失败通知。配置更新后，数据库等消费者仍需自行应用新设置。

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

// 用下面的端口字段构造 Zod 配置校验器，供本例 load 解析。
const AppSchema = z.object({
  port: z.number().int().min(1).max(65535),
})

// 读取文件并立即校验。成功时得到 { success: true, data: { port: 3000 } }。
// 以 app 名称从实际 YAML 路径读入并用 AppSchema 校验，成功 data 是已存配置，校验或读盘失败读取 error。
const loaded = core.config.load('app', './config/app.yml', AppSchema)
if (!loaded.success)
  throw new Error(loaded.error.message, { cause: loaded.error })

// 以下结果假设当前只加载了 app。
// 检查刚注册的 app 名称，成功加载后为 true。
core.config.has('app') // true
// 无参数列出当前已注册配置名，本例仅有 app。
core.config.keys() // ['app']
// 读取 app 的校验后快照，返回端口配置，未注册则为 undefined。
core.config.get<z.infer<typeof AppSchema>>('app') // { port: 3000 }
// 读取同一 app 快照，缺失时抛错。
core.config.getOrThrow<z.infer<typeof AppSchema>>('app') // { port: 3000 }
```

#### 场景：重载、监听与清理

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
// 为 app 注册变更回调，成功变化传新配置，失败传 error。返回取消订阅函数。
const stop = core.config.watch<{ port: number }>('app', (settings, error) => {
  if (error) {
    // 将监听回调收到的失败码写入 warn 日志，无业务数据。
    core.logger.warn('App config watch reported a failure', { code: error.code })
    return
  }
  // 将监听回调收到的新端口写入 info 日志，无业务数据。
  core.logger.info('App config reloaded', { port: settings?.port })
})

try {
  // 主动读取一次。文件仍为 port: 3000 时，回调记录 port: 3000。
  // 按先前注册路径和 Schema 重载 app，成功 data 为新设置，失败保留旧值并读取 error。
  const reloaded = core.config.reload('app')
  if (!reloaded.success)
    throw new Error(reloaded.error.message, { cause: reloaded.error })
}
finally {
  // 无参数调用上面返回的取消函数。本段回调停止接收事件。
  stop()
  // 从当前 Core 缓存中清除 app 配置，无返回数据。
  core.config.clear('app')
}
```

#### 场景：环境变量如何改变 YAML 配置

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

#### 场景：从 .env 文件读取变量

在 Node 入口调用 `loadEnvFiles()`，检查 `success` 后把结果装入 `process.env`，再加载 YAML。`development` 和 `production` 分别选择 `dev` 和 `prod` 对应的文件。缺失的文件会跳过，同一文件重复声明键会报错。

优先级从高到低为进程环境、`.env.<mode>.local`、`.env.local`、`.env.<mode>`、`.env`，最后由 YAML 提供基础值。`loadEnvFiles()` 会合并进程中已有的 `HAI_*` 变量和 dotenv 文件已声明的同名变量。含私密值的 `.local` 文件应留在本机。

```ts
import { core } from '@h-ai/core'

// 准备 config/app.yml（port: 3000）和 .env（HAI_APP_PORT=4000）。假设没有更高优先级的覆盖。
// 从当前目录加载 dev 模式的 dotenv，成功 data 是已合并变量，失败读取 error。
const result = core.config.loadEnvFiles({ mode: 'dev', envDir: '.' })
if (!result.success)
  throw new Error(result.error.message, { cause: result.error })

Object.assign(process.env, result.data)
// 读取当前项目 ./config 直属配置文件，加载成功后可按名称读取。初始化本身无返回值。
core.init({ configDir: './config' })
// 读取已应用环境覆盖的 app 快照，本例端口为 4000，缺失时为 undefined。
core.config.get('app') // { port: 4000 }
```

#### 场景：替换后的值是什么类型

环境变量原本都是文本。给 `load()` / `resolve()` 传入 Zod Schema 后，框架会按字段类型转换替换结果：`z.number()` 对应数字，`z.boolean()` 对应布尔值，`z.string()` 保留字符串。

例如 `${PORT:3000}` 占据整个值时，可得到数字 3000；`${ENABLED:false}` 可得到布尔值 false。`server-${PORT:3000}` 带有其他文字，拼接后仍是字符串。字符串字段 `code` 的默认文本 00123 保持为 `'00123'`，不会丢掉前导零。下面不用读文件，直接给出相同的 YAML 内容和环境数据来演示：

```ts
import { core } from '@h-ai/core'
import { z } from 'zod'

// 用显式环境数据演示覆盖顺序、数值/布尔转换与字符串保留。
// 用下面的端口字段构造 Zod 配置校验器，供本例 load 解析。
const AppSchema = z.object({
  port: z.number(),
  enabled: z.boolean(),
  label: z.string(),
  code: z.string()
})
// 传 app 名称、带占位符的配置和显式环境变量，返回替换后的配置数据，解析失败读取 error。
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
// 验证上一步替换结果，成功 data 为校验后的配置，失败附字段问题。
const validated = AppSchema.safeParse(resolved.data)
if (!validated.success)
  throw new Error(validated.error.message, { cause: validated.error })
// 把刚校验的端口 5000 写入 info 日志，无业务返回值。
core.logger.info('Config resolved', { port: validated.data.port }) // port: 5000
```

空字符串表示“变量已经设置，只是内容为空”，不会被当成缺失、null、false 或 0。例如 `APP_CODE=''` 会使 code 保持 `''`，不会改用 00123；是否允许空串由 Schema 决定。数字字段收到空串则通常校验失败。

变量替换只处理 YAML 中的表达式；环境变量或父 JSON 中的 `server-${PORT}` 会按原文保留。例如 `HAI_APP_LABEL='server-${PORT}'` 最终仍为 `server-${PORT}`。需要替换时，把表达式写在 YAML 中。

没有 Schema 时，框架按现有 YAML/JSON 结构识别路径，并对单个表达式按 YAML 规则解释数字/布尔值；缺少的合法可选路径可由 `configSchemas` 提供。最终业务校验仍应通过 `validate()` 或模块 init 执行。

#### 场景：生成配置文件时使用的工具

`resolve()` 也可供构建/部署工具在内存中计算配置。`toEnv()` 把对象转为环境变量，`mergeEnv()` 合并多个来源，`stringifyEnv()` / `parseEnv()` 编解码 .env 文本；这些工具不自动脱敏。

```ts
import { core } from '@h-ai/core'

// 配置生成器把普通对象转成 HAI_APP_PORT 等变量；数组保留为 JSON。
// 用 HAI_APP 前缀将端口与标签转成字符串映射，数组编码为 JSON，非法名称抛错。
const values = core.config.toEnv({
  prefix: 'HAI_APP',
  value: {
    port: 3000,
    tags: ['local']
  }
})
// values：{ HAI_APP_PORT: '3000', HAI_APP_TAGS: '["local"]' }。
// 先传生成映射，再传高优先级端口覆盖，返回 HAI_APP_PORT 为 4000 的合并映射。
const merged = core.config.mergeEnv([
  values,
  { HAI_APP_PORT: '4000' }
])
// merged：{ HAI_APP_PORT: '4000', HAI_APP_TAGS: '["local"]' }。
// 将合并后的键值映射编码为 dotenv 文本，非法变量名抛错。
const text = core.config.stringifyEnv(merged) // 编码为可写入 .env 的文本。
// text 含以下两行，每行以换行符结尾：
// HAI_APP_PORT='4000'
// HAI_APP_TAGS='["local"]'
// 解析刚生成的 dotenv 文本，返回字面字符串映射，无效内容抛出错误。
const restored = core.config.parseEnv(text) // 解析回字面字符串，不执行其中的变量。
// restored：{ HAI_APP_PORT: '4000', HAI_APP_TAGS: '["local"]' }。
// 将解析回来的 HAI_APP_PORT 写入 info 日志，无业务数据。
core.logger.info('Generated config verified', { port: restored.HAI_APP_PORT })
```

普通对象默认展开，数组、动态字典和空对象保留为 JSON。默认生成的 Node dotenv 由 `parseEnv()` 或 `loadEnvFiles()` 读取，值里的回车（`\r`）和 CRLF 都能保留。请保留生成行末的 `# hai:json` 标记。供 Compose 的 `env_file` 使用时，传入 `{ target: 'compose' }`。[基础配置手册](../configuration/runtime.md)

<a id="logging-api"></a>

### 记录日志：`core.logger`

日志按 `trace`、`debug`、`info`、`warn`、`error`、`fatal` 递增，只输出达到当前阈值的记录。阈值为 `fatal` 时只输出这一等级，应用自行决定是否退出。

默认日志级别为 `info`，格式为 `pretty`。在 YAML 中只写 `logging.level` 时，格式仍为 `pretty`。应用可以显式设置 `logging.format: json` 供日志系统按行读取。Node 找不到可选依赖 `pino-pretty` 时会输出 JSON。浏览器写入开发者控制台，其中的 `bigint` 值输出为十进制字符串，循环引用显示为 `[Circular]`。

上下文中的合法 JSON 对象或数组字符串会先展开，再按字段脱敏；标准输出、浏览器输出和 `core.logger.observe` 都收到展开后的结构。例如 `{ issues: '[{"path":"ldap.url","code":"invalid_type"}]' }` 会记录为包含一项的 `issues` 数组，Node 的 pretty 输出会将其缩进显示。优先直接传对象。日志消息本身、JSON 标量及无效 JSON 保持文本。单个字符串超过 65,536 字符、解析结果的对象嵌套达到 32 层，或重复编码超过 4 次时停止展开，沿用文本脱敏。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `core.logger.trace(message, context?)` | 记录最细的调试步骤 | 必填日志消息 `message` 字符串。可传 `context` 对象给本条日志追加字段。 | `void` | `core.logger.trace('Callback entered')` |
| `core.logger.debug(message, context?)` | 记录调试信息 | 必填日志消息 `message` 字符串。可传 `context` 对象给本条日志追加字段。 | `void` | `core.logger.debug('Cache miss', { key: 'total' })` |
| `core.logger.info(message, context?)` | 记录正常业务事件 | 必填日志消息 `message` 字符串。可传 `context` 对象给本条日志追加字段。 | `void` | `core.logger.info('Order created', { id: 'order-1' })` |
| `core.logger.warn(message, context?)` | 记录需关注但可继续的情况 | 必填日志消息 `message` 字符串。可传 `context` 对象给本条日志追加字段。 | `void` | `core.logger.warn('Retry scheduled', { attempt: 2 })` |
| `core.logger.error(message, context?)` | 记录失败 | 必填日志消息 `message` 字符串。可传 `context` 对象给本条日志追加字段。 | `void` | `core.logger.error('Write failed', { error })` |
| `core.logger.fatal(message, context?)` | 记录严重故障，是否退出由应用决定 | 必填日志消息 `message` 字符串。可传 `context` 对象给本条日志追加字段。 | `void` | `core.logger.fatal('Startup failed')` |
| `core.logger.create(options?)` | 创建 Logger，省略的设置继承全局 | `options` 可省略，其中 `name`、`level`、`format`、`context` 的优先级见下表。 | `Logger` | `core.logger.create({ name: 'orders' })` |
| `core.logger.child(context)` | 创建带固定字段的子 Logger | 必填 `context` 对象，固定追加到此子 Logger 及其后代的日志。 | `Logger` | `core.logger.child({ requestId: 'req-1' })` |
| `core.logger.configure(config)` | 修改提供的全局日志设置 | `config` 对象必填，可设 `level`、`format`、`context`、`redact`，见下表。 | `void` | `core.logger.configure({ format: 'json', redact: ['customer.email'] })` |
| `core.logger.setLevel(level)` | 改全局阈值，初始为 info | 必填 `level`，选 `trace`、`debug`、`info`、`warn`、`error` 或 `fatal`。 | `void` | `core.logger.setLevel('warn')` |
| `core.logger.getLevel()` | 读当前全局阈值 | 无参数 | `LogLevel` | `core.logger.getLevel()` |
| `core.logger.observe(observer)` | 接收通过级别筛选且已脱敏的记录 | 必填同步 `observer(record)`，参数为已按级别过滤且经脱敏的 `LogRecord`。 | `() => void` | `core.logger.observe(record => { recentMessages.push(record.message) })` |

##### Logger 的字段和默认值

| 字段 | `create(options?)` | `configure(config)` |
| --- | --- | --- |
| `name` | 可选字符串，标记日志所属模块，例如 `'orders'` | 通过 `create()` 设置模块名 |
| `level` | 可选 `trace`、`debug`、`info`、`warn`、`error`、`fatal`。省略时动态继承全局阈值 | 初始为 `info`。传入时修改全局阈值，省略时保留当前值 |
| `format` | `'json'` 或 `'pretty'`，省略时动态继承全局格式 | 初始为 `'pretty'`。传入时修改全局格式，省略时保留当前值 |
| `context` | 可选对象。其字段添加到此 Logger 的每条记录，同名字段覆盖全局上下文 | 可选对象。按顶层键合并全局上下文，省略或传 `{}` 都会保留旧字段 |
| `redact` | 继承全局规则 | 可选字段路径数组，默认 `[]`。传入 `['customer.email']` 等路径会替换旧的附加规则。传入 `[]` 清空附加规则，内置敏感字段照常脱敏 |

#### 场景：按级别记录业务与诊断日志

订单服务在创建订单时写一条业务日志。发生重试时，值班同事可以用请求编号查到是哪次调用出了问题。先设置进程输出级别，再看带请求编号的日志。

```ts
import { core } from '@h-ai/core'

// 将日志门槛设为 info，较低级别被过滤，无返回值。
core.logger.setLevel('info')
// 无参数读取刚设定的当前阈值，返回 info。
core.logger.getLevel() // 'info'
// 传读取开始消息，低于本例阈值而跳过，无业务返回。
core.logger.debug('Read started') // 低于 info，跳过。
// 记录创建消息和订单 ID，无业务数据。
core.logger.info('Order created', { orderId: 'order-1' }) // 日志包含 orderId。
// 将已安排重试的消息写入 warn 日志，无业务数据。
core.logger.warn('Retry scheduled')
// 将示例错误对象随诊断消息写入 error 日志，无业务返回值。
core.logger.error('Operation failed', {
  error: new Error('Example failure')
})
// 以 fatal 记录启动失败消息，返回 undefined。
core.logger.fatal('Example startup failure') // 记录 fatal 日志，返回 undefined；不会主动退出进程。
```

`core.logger.create()` 创建有名称的 Logger。`orders.child()` 返回一个新的 Logger，固定字段只加在这个子 Logger 及其后代上。日志方法的第二个参数 `ctx` 给当前这一条日志追加字段。

```ts
import { core } from '@h-ai/core'

// 应用以下 JSON 输出、info 门槛和客户邮件脱敏规则，无返回数据。
core.logger.configure({ // 用 JSON 输出 info 及以上日志，并遮盖 customer.email。
  level: 'info',
  format: 'json',
  redact: ['customer.email'],
})
// 用 orders 名创建订单模块 logger，返回可写日志的实例。
const orders = core.logger.create({ name: 'orders' }) // 订单模块的 Logger。
// 在父 logger 的基础上绑定 request-1，返回带该字段的子 logger。
const request = orders.child({ requestId: 'request-1' }) // 绑定请求编号，orders 不变。

// 以下两条日志都在 core.context.run() 之外执行。
// 用父 logger 记录创建消息及当前字段，无业务返回值。
orders.info('Order created', {
  customer: { email: 'user@example.com' },
}) // customer.email: '[REDACTED]'；没有 requestId，因为这里调用的是父 Logger。
// 用子 logger 写入 attempt: 2，日志同时带有 request-1，无业务返回。
request.warn('Request needs attention', { attempt: 2 })
// 同时输出 requestId: 'request-1' 和 attempt: 2；单次字段不清除已绑定的字段。

// 在 request-2 上下文运行回调，结束后恢复外层作用域，返回回调结果。
core.context.run({ requestId: 'request-2' }, () => {
  // 记录检查消息和 attempt: 1，上下文提供 request-2，无业务数据。
  orders.info('Order checked', { attempt: 1 }) // 输出 requestId: 'request-2' 和 attempt: 1。
})
```

字段同名时，后面的来源覆盖前面的：全局字段 → Logger 固定字段（父级到子级）→ 单次 `ctx` → 当前 `core.context`。因此即便在 `ctx` 里也传了 `requestId`，当前请求上下文中的同名字段仍然优先。

修改全局级别、格式或脱敏规则后，已有 Logger 的后续输出也使用新设置；显式指定的级别和格式保持原值。浏览器 JSON 输出包含 `level` 和 `msg`，pretty 输出可读消息和上下文。

`observe()` 用于诊断采集，接收经过当前级别过滤与脱敏的记录，返回解除订阅的函数。回调只做有界内存收集，持久化由应用另行异步完成；它不代表日志已保存。回调异常与同步重入被隔离。

```ts
import { core } from '@h-ai/core'

const recentMessages: string[] = []
// 注册观察回调收集最近消息，返回取消函数。
const stop = core.logger.observe((record) => {
  if (recentMessages.length === 100)
    recentMessages.shift()
  recentMessages.push(record.message)
})
try {
  // 写入 Observed event 并通知已注册观察者，无业务数据。
  core.logger.warn('Observed event')
  recentMessages // ['Observed event']
}
finally {
  // 无参数调用上面返回的取消函数。本段回调停止接收事件。
  stop()
}
```

<a id="context-api"></a>

### 关联同一次请求：`core.context`

`run()` 让一次请求或任务携带 requestId、userId、scopeId、jobId 等关联信息，`get()` 读取当前值。Node 中等待数据库或其他异步操作后，仍能读取这次请求自己的信息，其他请求不会覆盖它。已有 Logger 会自动带上这些字段。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `core.context.run(context, operation)` | 在回调内设置请求或任务编号 | `context` 必填，为可信请求标识和可选 `suppressLogObservers`。`operation` 是同步或异步回调。 | 回调的原始返回值，含 Promise | `await core.context.run({ requestId: 'req-1' }, async () => core.context.get().requestId)` |
| `core.context.get()` | 读取当前上下文 | 无参数 | 只读 `RequestContext`，无上下文时为空对象 | `const { requestId } = core.context.get()` |

#### 场景：在异步调用中保留请求编号

```ts
import { core } from '@h-ai/core'

// Node 示例：同一请求等待异步处理后，仍能取得自己的编号。
// 用本请求编号和用户 ID 隔离运行异步回调，等待后返回 request-1，回调异常原样传播。
await core.context.run({ requestId: 'request-1', userId: 'user-1' }, async () => {
  // 等待约 1 毫秒，无业务数据，随后继续使用原请求上下文。
  await core.async.delay(1)
  // 无参数读取异步请求的当前上下文，包含传入的请求和用户 ID。
  const current = core.context.get() // 包含 requestId: 'request-1'、traceId: 'request-1'、userId: 'user-1'；其他字段为 undefined。
  // 将恢复后的请求编号写入 info 日志，无业务数据。
  core.logger.info('Request continued', { requestId: current.requestId })
  return current.requestId
}) // run 返回回调的结果；此处 await 后得到 'request-1'。
// 回调退出后再读当前上下文，本例回到外层空对象。
core.context.get() // {}，回到外层后不保留上面请求的上下文。

// 采集器自身写日志时，可暂停观察回调，正常日志输出仍然执行。
// 在当前回调内暂停观察者；内层 warn 仍写诊断日志，run 得到无返回值的回调结果。
core.context.run({ suppressLogObservers: true }, () => core.logger.warn('Collector diagnostic'))
// 返回 undefined；输出 warn 日志，但不会触发日志观察回调。
```

浏览器只能在 run 回调的同步代码中保留信息，await 后不再保留。关联编号不是身份授权，用户和租户范围必须由可信服务端代码提供。

<a id="sanitize-api"></a>

### 清理诊断数据：`core.sanitize`

用于日志、诊断包或公开错误输出前清理凭据。可以判断字段名是否敏感、清理单个值、递归处理对象、遮蔽 URL 凭据，或清理文本中带标签的凭据和调用方已知的秘密值。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `core.sanitize.isSensitiveKey(key, matcher?)` | 判断字段名是否应隐去 | `key` 必填，为待判断字段名。`matcher` 可用正则、字段名数组或判断函数，省略时用内置规则。 | `boolean` | `core.sanitize.isSensitiveKey('apiKey')` |
| `core.sanitize.sanitizeSensitiveValue(value, key, options?, cache?)` | 清理一项值 | 必填原始 `value` 和 `key`，没有字段名时传 `null`。`options` 可指定匹配规则和替换值，默认 `[REDACTED]`。可传存放已复制对象的 `cache: WeakMap`，省略时每次新建。 | 原值或清理后的值 | `core.sanitize.sanitizeSensitiveValue('example-only', 'password')` |
| `core.sanitize.sanitizeSensitiveFields(value, options?)` | 生成脱敏后的数据副本 | `value` 是要复制与脱敏的值。可选 `options.matcher`、`options.replacement` 见下表。 | 脱敏后的数据 | `core.sanitize.sanitizeSensitiveFields({ password: 'example-only' })` |
| `core.sanitize.sanitizeUrl(url, options?)` | 清理 URL 中的凭据 | 必填 `url` 字符串。可选 `options.matcher`、`options.replacement` 适用于 URL 中的凭据字段。 | `string`，解析失败返回 `(invalid url)` | `core.sanitize.sanitizeUrl('https://example.com/?token=example-only')` |
| `core.sanitize.sanitizeText(text, secretValues?)` | 清理文本中有明确格式或已知值的凭据 | `text` 为待清理文本，`secretValues` 为调用方额外知道的秘密字符串数组，默认 `[]`。 | `string` | `core.sanitize.sanitizeText('Bearer example-only')` |
| `core.sanitize.defaultSensitiveKeyRegex`、`defaultSensitiveReplacement` | 读取内置规则及替换值 | 只读常量 | `RegExp` 和 `string` | `const replacement = core.sanitize.defaultSensitiveReplacement` |

<a id="sanitize-options"></a>

#### 脱敏选项

| 字段 | 取值、缺省与行为 |
| --- | --- |
| `matcher` | 可选正则、字段名数组或 `(key) => boolean`。指定时由它选择要替换的字段，默认用内置敏感规则。 |
| `replacement` | 可替换的值，默认字符串 `[REDACTED]`。URL 输出时转换为字符串。 |

下方示例把 `matcher: ['email']` 与 `replacement: '***'` 用于已移除密码的副本。邮件字段变为 `***`。

#### 场景：发布诊断前隐藏敏感字段

```ts
import { core } from '@h-ai/core'

core.sanitize.isSensitiveKey('apiKey') // true。
core.sanitize.sanitizeSensitiveValue('example-only', 'password') // '[REDACTED]'。
// 以默认规则复制并清理诊断对象，输出遮盖已知密码字段、保留邮箱。
const safe = core.sanitize.sanitizeSensitiveFields({ password: 'example-only', email: 'user@example.com' })
// safe：{ password: '[REDACTED]', email: 'user@example.com' }，原对象不变。
// 默认仅遮蔽凭据；额外业务隐私可在已处理凭据的副本上继续清理。
// 按自定义匹配清单把上一步副本中的邮箱替换为三个星号，返回新对象。
core.sanitize.sanitizeSensitiveFields(safe, {
  matcher: ['email'],
  replacement: '***'
})
// => { password: '[REDACTED]', email: '***' }
// 清理示例 URL 中的用户名、密码和查询令牌，返回脱敏字符串。
core.sanitize.sanitizeUrl('https://user:example-only@example.com/?token=example-only')
// => 'https://[REDACTED]:[REDACTED]@example.com/?token=[REDACTED]'
core.sanitize.sanitizeText('Bearer example-only') // '[REDACTED]'。
// 用显式敏感片段清理日志消息，返回替换后的文本。
core.sanitize.sanitizeText('Request failed with a known private value', ['private value'])
// => 'Request failed with a known [REDACTED]'
```

`defaultSensitiveKeyRegex` / `defaultSensitiveReplacement` 提供默认匹配规则和 `[REDACTED]` 替换值。传入自定义 matcher 会替换默认匹配规则，所以额外清理业务隐私时应先保留默认凭据清理结果。

日志默认遮蔽 password/passwordHash、token、secretKey、privateKey 等凭据字段，以及 URL 的用户名、密码、敏感查询参数和 OAuth 键值 fragment；非法 URL 返回 `(invalid url)`。`redact` 叠加业务隐私路径，支持点/括号和单层 `*`，区分大小写；邮箱、手机号默认保留。

原生 `Error` 先转为含 name/message/stack/cause、聚合错误和枚举上下文的副本再脱敏，不修改原异常；异常子图循环和 32 层深度分别使用 `[Circular]` / `[MaxDepth]`。普通对象循环保留，不保证可直接 JSON 序列化。消息与异常文本会清理显式凭据标签和 URL，无法识别任意无标签秘密，调用方仍需清理或整体遮蔽相应路径。

脱敏结果只保留数据：普通对象和类实例复制自有、可枚举的数据属性，不保留类原型，不执行访问器或自定义 `toJSON()`。日期转为 ISO 字符串，URL 转为已脱敏的字符串；原对象保持不变。记录 SDK/业务对象时仍应只选取排查所需字段，未标注的秘密和业务隐私需由应用明确清理。

<a id="error-api"></a>

### 结果与错误：`core.error`

用 `core.error` 给失败定义稳定错误码，再为本次失败生成当前语言的消息。服务端准备把失败返回给浏览器时，用 `core.error.toPublic()` 去掉内部诊断数据。Serv 或 Kit 根据错误定义设置 HTTP 状态码和追踪响应头。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `core.error.buildHaiErrorsDef(module, errorInfo, system?)` | 生成模块的稳定错误定义 | 必填 `module`、`errorInfo`（错误名 → `业务码:HTTP状态`）。`system` 默认 `hai`，是错误码第一段。 | 按键索引的错误定义 | `const errors = core.error.buildHaiErrorsDef('orders', { NOT_FOUND: '300:404' })` |
| `core.error.buildHaiErrorInst(def, message, cause?, suggestion?)` | 给本次失败附上消息和诊断信息 | 必填错误定义 `def` 与公开提示 `message`。可选内部 `cause` 与处理建议 `suggestion`。 | `HaiError` | `const error = core.error.buildHaiErrorInst(errors.NOT_FOUND, 'Order not found')` |
| `core.error.toPublic(error, traceId?, locale?)` | 准备可返回浏览器的错误 | `error` 必填。`traceId` 覆盖当前关联编号，`locale` 覆盖 5xx 通用提示使用的语言。 | 删除内部诊断字段的错误 | `core.error.toPublic(error, 'req-1')` |
| `core.error.formatMessage(error)` | 生成带追踪编号的文案 | 必填 `error`，含消息字符串及可省略的 `traceId`。 | `string` | `core.error.formatMessage(error)` |
| `core.ok(data)`、`core.err(errorOrDef, message?, cause?, suggestion?)` | 构造成功或失败结果 | `core.ok` 传成功 `data`。`core.err` 的 `errorOrDef` 必填，可为错误定义、完整 `HaiError` 或原生错误，可传 `message`、`cause`、`suggestion`。 | `HaiResult` 的对应分支 | `core.ok({ id: 'order-1' })`、`core.err(errors.NOT_FOUND, 'Order not found')` |

#### 场景：构造领域失败并返回安全提示

```ts
import { core } from '@h-ai/core'

// 定义稳定错误码，消息在创建实例时根据当前语言获取。
// 用 orders 模块和 300:404 定义订单未找到错误，返回含错误码和 HTTP 状态的定义。
const OrderError = core.error.buildHaiErrorsDef('orders', { NOT_FOUND: '300:404' })
// OrderError.NOT_FOUND：{ code: 'hai:orders:300', httpStatus: 404, system: 'hai', module: 'orders' }。
// coreM 以 zh-CN 取资源不存在消息。用该文案和订单错误定义构造完整失败对象。
const failure = core.error.buildHaiErrorInst(OrderError.NOT_FOUND, core.i18n.coreM('core_errorNotFound', { locale: 'zh-CN' }))
// failure：上面的错误定义加上 message: '资源不存在'。
// 将内部错误和 request-1 转成可向外返回的错误，保留稳定标识与追踪编号。
const publicError = core.error.toPublic(failure, 'request-1')
// publicError：保留 code/httpStatus/system/module，增加 traceId: 'request-1'；
// message 为 '资源不存在 (traceId: request-1)'。
const message = core.error.formatMessage(publicError) // '资源不存在 (traceId: request-1)'，编号不会重复追加。
// 用内部失败和已格式化提示记录订单不可用，无业务返回值。
core.logger.warn('Order unavailable', { error: failure, publicMessage: message })
```

#### 场景：共用结果类型与独立构造器

`HaiResult<T>` 用 success 区分 data 和 error。单独导入 `core.ok` / `core.err` 可构造成功或失败的结果。调用业务 API 后先检查 success；getter、工具与工厂按各自签名返回直接值或抛错。

```ts

import { type HaiResult, HaiCommonError, core } from '@h-ai/core'

// 业务失败返回 err，成功返回 ok；共用构造器保持独立导入。
function divide(a: number, b: number): HaiResult<number> {
  if (b === 0)
    // 分母为 0 时，由 coreM 获取中文验证消息，err 返回含稳定错误定义与消息的失败结果。
    return core.err(HaiCommonError.VALIDATION_ERROR, core.i18n.coreM('core_errorValidation', { locale: 'zh-CN' }))
  return core.ok(a / b) // 如 core.ok(5) 返回 { success: true, data: 5 }。
}

// 先检查 success，再读取 data 或 error。
const result = divide(10, 2) // { success: true, data: 5 }。
if (!result.success)
  // 执行失败时将原错误写入 warn 日志，无业务返回值。
  core.logger.warn('Calculation failed', { error: result.error })
else
  // 将成功计算得到的 5 写入 info 日志，无业务返回值。
  core.logger.info('Calculation completed', { value: result.data })

const failed = divide(10, 0)
// failed：{ success: false, error: { code: 'hai:common:200', httpStatus: 400,
// system: 'hai', module: 'common', message: '验证失败' } }，无 data。
if (!failed.success)
  // 记录分母为 0 时的稳定错误码，无业务返回值。
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

为业务字典创建带参数替换的消息获取器，也可取得 Core 内置消息和当前语言。常量列出框架内置语言，不会自动为应用注册翻译。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `core.i18n.setGlobalLocale(locale)` | 设置默认语言 | 必填 `locale`，支持 `zh-CN`、`en-US`、`ja-JP`，分别可简写为 `zh`、`en`、`ja`。 | `void` | `core.i18n.setGlobalLocale('ja-JP')` |
| `core.i18n.getGlobalLocale()` | 读取当前语言 | 无；初始默认 `zh-CN` | 语言代码 | `core.i18n.getGlobalLocale()` |
| `core.i18n.runWithLocale(locale, operation)` | 给当前 Node 请求设置独立的语言 | `locale` 是请求语言，`operation` 是保留返回值的同步或异步回调。两者必填。 | 回调的返回值，与回调同步或异步行为一致 | `await core.i18n.runWithLocale('en-US', async () => core.i18n.coreM('core_errorNotFound'))` |
| `core.i18n.createMessageGetter(messages)` | 从应用字典创建消息函数 | `messages` 必填，语言代码到消息键和译文的字典。 | `(key, options?) => string` | `const message = core.i18n.createMessageGetter({ 'zh-CN': { welcome: '欢迎' } })` |
| `core.i18n.coreM(key, options?)` | 查询 Core 内置文案 | 必填消息 `key`。可选 `options.locale` 覆盖当前语言，`options.params` 为 `{name}` 等占位符供值。 | `string`，缺少对应键时返回键名 | `core.i18n.coreM('core_errorNotFound', { locale: 'en-US' })` |
| `core.i18n.DEFAULT_LOCALE`、`DEFAULT_LOCALES` | 读取框架的默认和内置语言 | 只读常量 | `zh-CN` 和语言选项列表 | `const choices = core.i18n.DEFAULT_LOCALES` |

#### 场景：为当前请求选择消息语言

```ts
import { core } from '@h-ai/core'

// 页面语言或服务进程的启动默认值；请求中使用 runWithLocale 单独选择语言。
// 将默认语言设为 zh-CN，之后默认消息使用中文。
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
// 用下面的三语字典构造消息获取函数，调用结果在后文展示。
const message = core.i18n.createMessageGetter({
  'zh-CN': { welcome: '欢迎 {name}' },
  'en-US': { welcome: 'Welcome {name}' },
  'ja-JP': { welcome: 'ようこそ {name}' },
})
// createMessageGetter 返回消息函数；如 message('welcome', { locale: 'zh-CN', params: { name: 'Alice' } }) 得到 '欢迎 Alice'。
// 在回调中使用 en-US，等待回调返回的 Welcome Alice，回调错误原样传播。
const greeting = await core.i18n.runWithLocale('en-US', async () => {
  await Promise.resolve()
  // 用当前 en-US 字典和参数 Alice 替换 welcome 占位符，返回 Welcome Alice。
  return message('welcome', {
    params: { name: 'Alice' }
  })
})
// greeting：'Welcome Alice'；runWithLocale 返回回调的结果，此处等待 Promise 得到字符串。
// 把生成的欢迎文案写入 info 日志，无业务返回值。
core.logger.info('Greeting prepared', { greeting })
```

Node 请求和 SSR 用 `core.i18n.runWithLocale()` 包裹异步处理。Serv 自动建立请求语言上下文，Kit 提供同名入口。在上下文内，`core.i18n.setGlobalLocale()` 设置当前请求的语言。上下文外用它设置启动默认值。浏览器可用 `core.i18n.setGlobalLocale()` 设置应用语言，或在取消息时指定 locale。SSR 的 UI store 不应修改进程默认语言。

<a id="validation-api"></a>

### 字段校验提示：`core.zodValidation`

把 Zod 校验错误转换为可显示在表单字段旁的 `{ field, message }[]`。`createPrefixedZodMessageGetter()` 按前缀选择翻译键，`mapZodErrorToFormErrors()` 完成提取、翻译和字段路径转换。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `core.zodValidation.createPrefixedZodMessageGetter(prefix, getMessage)` | 适配有模块前缀的消息键 | 必填 `prefix`（消息键前缀）和 `getMessage(key, params)`（按实际键取译文）。 | 消息函数 | `const translate = core.zodValidation.createPrefixedZodMessageGetter('core', message)` |
| `core.zodValidation.mapZodErrorToFormErrors(error, getMessage)` | 生成字段错误列表 | 必填 Zod 校验 `error` 与适配后的 `getMessage(key, params)`。 | `{ field, message }[]` | `core.zodValidation.mapZodErrorToFormErrors(parsed.error, translate)` |

#### 场景：把校验问题映射到表单字段

```ts
import { core } from '@h-ai/core'
import { z } from 'zod'

// 此例复用 Core 已有翻译；业务表单可注入自己的消息获取器。
// 绑定 core 前缀及下方取中文消息的回调，返回供错误映射使用的函数。
const message = core.zodValidation.createPrefixedZodMessageGetter('core', key =>
  key === 'core_validationEmail'
    // 邮箱校验失败时用 zh-CN 返回已有的邮箱提示。
    ? core.i18n.coreM('core_validationEmail', { locale: 'zh-CN' })
    // 其他校验错误取 zh-CN 通用提示。
    : core.i18n.coreM('core_errorValidation', { locale: 'zh-CN' }))
// 返回消息函数；message('validationEmail') 得到 '请输入有效的邮箱地址'。
// 构造邮箱约束并校验示例值 invalid，本例得到可供映射的校验失败。
const parsed = z.object({
  email: z.email()
}).safeParse({ email: 'invalid' })
if (!parsed.success) {
  // 用刚得到的 Zod 错误和消息函数生成字段错误数组，本例包含 email。
  const errors = core.zodValidation.mapZodErrorToFormErrors(parsed.error, message)
  // errors：[{ field: 'email', message: '请输入有效的邮箱地址' }]。
  // 将转换后的字段错误记录到 info 日志，无业务数据。
  core.logger.info('Validation failed', { errors })
}
```

传给映射器的是 `safeParse()` 失败结果中的 `error`。它读取 Zod v3/v4 的 `issues` 或 `errors` 数组，跳过缺少有效路径或文案的条目。默认英文消息会翻译，业务自定义消息会保留。路径如 `items.0.email`，整张表单的错误用 `_`。严格 Schema 的未知字段使用统一的 `validationUnexpectedFields` 提示。

<a id="module-api"></a>

### 模块启动与辅助工具：`core.module`

这些工具供应用启动代码和框架模块实现复用，既能管理多个模块，也能在模块尚未初始化时返回一致错误。它们不会替应用决定使用哪些模块。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `core.module.createRuntime(definitions)` | 按顺序管理应用依赖 | 必填按初始化顺序列出的 `definitions` 数组，每项有 `name`、`start`、`close`，可选 `enabled` 决定是否运行。 | `ModuleRuntime`，其 `start()` 和 `close()` 均返回 `Promise<HaiResult<void>>` | `const runtime = core.module.createRuntime([{ name: 'cache', start: () => cache.init({ type: 'memory' }), close: () => cache.close() }])` |
| `core.module.createNotInitializedKit(codeOrDef, messageFn)` | 让模块在初始化前返回统一的失败结果 | 必填 `codeOrDef`（错误码或定义）和 `messageFn`（无参消息函数）。 | 带 `error()`、`result<T>()`、`proxy<T>(mode?)` 的对象。代理默认异步 | `core.module.createNotInitializedKit(HaiCommonError.NOT_INITIALIZED, () => 'Initialize the module first')` |
| `core.module.requiresSharedState(environment)` | 判断当前环境是否要求共享后端 | 必填 `environment` 对象。`NODE_ENV` 或 `HAI_CORE_ENV` 为 `production` 时要求共享状态，显式测试开关 `HAI_E2E` 或 `HAI_E2E_MOCK` 为 `1` 除外。 | `boolean` | `core.module.requiresSharedState(process.env)` |

<a id="应用启动与关闭"></a>

#### 场景：应用启动与关闭

应用使用多个模块时，通常需要先完成数据库等资源的初始化，处理业务后再释放资源。`core.module.createRuntime()` 接收这些模块的启动与关闭函数，返回一个供应用调用的对象；创建这个对象时还不会启动模块。

下面是本地开发示例，需额外安装 `@h-ai/reldb` 和 `@h-ai/cache`。数据库和缓存都使用内存配置，仅用于演示，生产环境应按模块要求配置共享后端。

```ts
import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { reldb } from '@h-ai/reldb'

// 按需要的启动顺序，列出各模块的初始化和关闭函数。
// 按声明的先后关系登记数据库和缓存的启停方法，返回 runtime 管理对象。
const runtime = core.module.createRuntime([
  {
    name: 'database',
    // 创建示例 SQLite 内存库，成功后无 data，失败交由 runtime 清理。
    start: () => reldb.init({ type: 'sqlite', database: ':memory:' }),
    // 无参数释放本例数据库。成功无 data，失败交给 runtime。
    close: () => reldb.close(),
  },
  {
    name: 'cache',
    // 使用进程内后端初始化缓存，成功可读写，失败交给 runtime。
    start: () => cache.init({ type: 'memory' }),
    // 无参数释放内存缓存和数据，清理失败交给 runtime。
    close: () => cache.close(),
  },
])

// createRuntime 返回带 start()/close() 的对象；到这里数据库和缓存尚未启动。

// 依次启动数据库、缓存；失败时自动清理已尝试启动的模块。
// 无参数依次启动登记模块，成功无 data，失败清理已开始启动的模块。
const started = await runtime.start() // 成功为 { success: true, data: undefined }；两个模块均已初始化。
if (!started.success)
  throw new Error(started.error.message, { cause: started.error })

try {
  // 启动成功后再执行应用业务；这里演示记录启动结果。
  // 所有模块启动后写入就绪日志，无业务数据。
  core.logger.info('Application modules ready')
}
finally {
  // 演示结束后先关闭缓存，再关闭数据库，并检查清理结果。
  // 无参数按启动反序关闭模块，成功无 data，清理失败读取 error。
  const closed = await runtime.close() // 成功为 { success: true, data: undefined }；两个模块均已关闭。
  if (!closed.success)
    // 将整体清理错误写入 error 日志，无业务数据。
    core.logger.error('Application cleanup failed', { error: closed.error })
}
```

本例的启动顺序是数据库 → 缓存，关闭顺序是缓存 → 数据库。示例在演示结束后立即清理；长期运行的服务应在退出时执行同样的 `runtime.close()`。

某一步启动失败，会清理已经尝试启动的模块；某一步关闭失败，会先停在该处，保留它仍需使用的依赖，再次调用 `close()` 或 `start()` 时重试清理。多处同时调用 `start()` 不会重复初始化。可选的 `enabled()` 返回 false 时跳过该项。

`start()` / `close()` 都返回 `HaiResult`，应用必须检查 `success`。错误包含模块名、失败阶段、错误码和必要的配置字段提示，避免把配置秘密和 SDK 原始异常作为启动错误公开。

#### 场景：模块尚未初始化时返回错误

这是给模块实现者用的工具。例如，应用在 `cache.init()` 成功前调用 `cache.kv.get(key)`，缓存模块会返回一个「未初始化」的失败结果，而不会尝试访问 Redis。初始化成功后，模块才把 `cache.kv` 指向实际后端。应用使用现成模块时，先初始化、再调用并检查 `success` 即可。

`core.module.createNotInitializedKit()` 本身不负责初始化。模块可以按需要使用它返回的三个方法：

- `error()` 只返回一个错误对象。
- `result<T>()` 返回 `{ success: false, error }`，适合在某个操作内部提前返回。
- `proxy<T>()` 返回一个临时操作对象，`T` 是这组操作的接口类型。调用其任意方法都不执行业务操作，默认返回一个 Promise，`await` 后得到 `{ success: false, error }`。整组方法都是同步 API 时，用 `proxy<T>('sync')` 直接返回失败结果。

错误文案在每次生成错误时才求值；文案函数可以使用当前请求的语言。

<a id="order-lookup-example"></a>

#### 场景：订单索引加载完成前，拒绝订单查询

一个订单查询模块只有加载完状态索引才知道订单是否存在。应用启动时如果有调用提前到达，模块应该返回「未初始化」的失败结果，避免调用方把它当成「订单不存在」。下面用内存 `Map` 模拟已加载好的索引，只需要安装 `@h-ai/core`，不需要连接数据库。

```ts

import { type HaiResult, HaiCommonError, core } from '@h-ai/core'

interface OrderQueries {
  getStatus: (orderId: string) => Promise<HaiResult<string | null>>
}

// 用下面的三语字典构造消息获取函数，调用结果在后文展示。
const message = core.i18n.createMessageGetter({
  'zh-CN': { notReady: '订单查询模块尚未初始化' },
  'en-US': { notReady: 'Order queries are not initialized' },
  'ja-JP': { notReady: '注文照会モジュールが初期化されていません' },
})
// 用通用未就绪错误定义和消息回调创建占位工具，返回代理工厂及失败构造方法。
const waiting = core.module.createNotInitializedKit(
  HaiCommonError.NOT_INITIALIZED,
  // 获取示例订单查询的本地化未就绪提示。
  () => message('notReady'),
)
// 不传实参，用接口类型生成默认异步占位。调用任何查询得到未初始化失败。
const fallback = waiting.proxy<OrderQueries>() // 与实际查询接口一致，默认返回 Promise。
let activeQueries: OrderQueries | undefined

const orderLookup = {
  init(statusById: ReadonlyMap<string, string>): HaiResult<void> {
    activeQueries = {
      async getStatus(orderId) {
        // 用传入 ID 查内存索引，ok 将状态或 null 包装为成功 data。
        return core.ok(statusById.get(orderId) ?? null) // 查不到订单时成功返回 null。
      },
    }
    // 完成当前示例初始化后返回成功，data 为 undefined。
    return core.ok(undefined)
  },
  get orders(): OrderQueries {
    return activeQueries ?? fallback // 每次取接口时根据模块状态选择实现。
  },
  close(): void {
    activeQueries = undefined
  },
}

// 用示例订单调用未初始化占位，返回未就绪失败。
const beforeInit = await orderLookup.orders.getStatus('order-42')
if (!beforeInit.success)
  // 将占位查询产生的错误码写入 warn 日志，无业务数据。
  core.logger.warn('Order lookup is not ready', { code: beforeInit.error.code })

// 此处用内存索引模拟已经从数据库加载完的数据。
// 用 order-42 的已发货索引激活应用示例。成功无 data，初始化失败读取 error。
const initialized = orderLookup.init(new Map([['order-42', 'shipped']]))
if (!initialized.success)
  throw new Error(initialized.error.message)
try {
  // 查询已加载的 order-42，成功 data 为 shipped。
  const found = await orderLookup.orders.getStatus('order-42')
  // 查索引里不存在的 order-99，成功 data 为 null。
  const missing = await orderLookup.orders.getStatus('order-99')
  if (found.success && missing.success)
    // 记录命中状态和未命中的 null，无业务返回数据。
    core.logger.info('Order lookup finished', { found: found.data, missing: missing.data })
}
finally {
  // 不传参数清除活动索引，后续查询会回到未初始化占位。
  orderLookup.close()
}
// 关闭后再次查 order-42，本次返回占位错误。
const afterClose = await orderLookup.orders.getStatus('order-42')
if (!afterClose.success)
  // 记录关闭后查询得到的错误码，无业务返回值。
  core.logger.warn('Order lookup has closed', { code: afterClose.error.code })
```

| 调用时机 | 结果 |
| --- | --- |
| 初始化前查询 `order-42`（`beforeInit`） | `success: false`，错误码为 `HaiCommonError.NOT_INITIALIZED.code`，无 `data`。 |
| 初始化成功后查询 `order-42`（`found`） | `{ success: true, data: 'shipped' }`。 |
| 初始化成功后查询未知的 `order-99`（`missing`） | `{ success: true, data: null }`，实际查过索引，只是没有这一单。 |
| 关闭后再次查询 `order-42`（`afterClose`） | 再次返回「未初始化」失败。 |

`proxy()` 不会变成真正的查询对象。是 `orderLookup.orders` 的 getter 在模块就绪后改为返回实际查询，因此每次调用都从 `orderLookup.orders` 取接口，不要把初始化前拿到的占位对象缓存下来。

#### 场景：判断是否需要共享状态

`requiresSharedState()` 判断生产进程是否应拒绝只在本机有效的业务状态后端。它只返回判断，不连接或切换数据库；实际环境由服务端传入。

```ts
import { core } from '@h-ai/core'

// 此例用显式数据演示；服务端实际使用时传入 process.env。
core.module.requiresSharedState({ NODE_ENV: 'production' }) // true：应使用跨主机共享后端。
core.module.requiresSharedState({ NODE_ENV: 'production', HAI_E2E: '1' }) // false：显式 E2E 例外。
```

<a id="worker-api"></a>

### 在后台线程处理 CPU 工作：`core.worker`

把大文档处理或批量计算交给 Worker，调用线程可继续响应。池在提交首个任务时才启动线程，每个线程同时处理一项任务，按提交顺序从等待队列取任务。独占线程适合需要持续交换消息或单独终止的操作。

#### 接口清单

| 入口 | 用途 | 参数 | 返回 | 示例 |
| --- | --- | --- | --- | --- |
| `core.worker.createPool(entry, options)` | 创建任务池 | 必填 `entry`（Worker 入口 URL 或浏览器构造函数）及 `options`（线程数、队列和空闲回收）。见下表。 | `WorkerPool<Input, Output>` | `core.worker.createPool<string, number>(entry, limits)` |
| `pool.run(input, transfer?)` | 提交一次计算 | 必填 `input`，必须支持结构化克隆。`transfer` 是可选的转移列表，Node 仅支持 ArrayBuffer。 | `Promise<HaiResult<Output>>` | `await pool.run(report)` |
| `pool.close()` | 结算未完成任务并回收线程 | 无 | `Promise<void>` | `await pool.close()` |
| `core.worker.start(entry, options?)` | 创建独占线程 | 必填 `entry`。Node 的 `options` 可传 `workerData` 与 `execArgv`，浏览器只接受入口。 | `WorkerThread<Input, Output>` | `core.worker.start<string, number>(entry)` |
| `thread.postMessage(input, transfer?)` | 发送消息 | 必填 `input`，必须支持结构化克隆。`transfer` 是可选的转移列表，Node 仅支持 ArrayBuffer。 | `void` | `thread.postMessage(report)` |
| `thread.onMessage(listener)` | 订阅消息 | 必填 `listener(output)`，每条 Worker 消息调用一次。 | 取消订阅函数 | `const unsubscribe = thread.onMessage(receive)` |
| `thread.exited` | 观察退出 | 无 | `Promise<WorkerExit>` | `await thread.exited` |
| `thread.terminate()` | 终止线程 | 无 | `Promise<void>` | `await thread.terminate()` |

<a id="worker-options"></a>

#### 线程池与独占线程参数

| 字段 | 取值、缺省与行为 |
| --- | --- |
| `createPool.options.maxWorkers` | 必填正安全整数。每个线程同时执行一个任务。 |
| `createPool.options.maxQueuedJobs` | 必填非负安全整数。`0` 禁止排队。 |
| `createPool.options.idleTimeoutMs` | 可选整数，范围 1–2147483647 毫秒。省略时空闲线程保留到关闭。 |
| `start.options.workerData` | 仅 Node。传入可结构化克隆的启动数据，从 Worker 内的 `workerData` 读取。默认无数据。 |
| `start.options.execArgv` | 仅 Node。显式传 Worker 的 Node 启动参数字符串数组，省略时由 Node 继承宿主参数。 |

例如用 `{ maxWorkers: 2, maxQueuedJobs: 4 }` 运行下方文档统计场景。最多两个任务同时运行，额外四个等待，再提交即返回限流。

#### 场景：统计导入文档并释放线程

图中追踪一个已经启动的池。每个线程确认当前结果后从队首领取下一项；关闭会结算队列及正在运行的任务。

![任务进入有容量上限的队列，经后台线程返回结果，关闭后等待线程退出](../images/function-core-worker.svg)

例如，第一个线程正在统计一篇文档，第二篇进入等待队列。如果此时关闭池，两篇任务都返回已关闭结果，调用方等待 `close()` 完成后再释放自己的资源。

将以下入口文件随应用发布。线程收到一条输入就回复一次，调用方使用相同的类型描述请求和返回值。

```js
import { parentPort } from 'node:worker_threads'

parentPort?.on('message', report => parentPort.postMessage(report.length))
```

在 Node 服务入口创建池，处理完这一批后关闭。

```ts
import { core } from '@h-ai/core'

const entry = new URL('./stats-worker.mjs', import.meta.url)
// 传统计 worker 的模块 URL，限制两个线程和四个待执行任务，返回线程池。
const pool = core.worker.createPool<string, number>(entry, { maxWorkers: 2, maxQueuedJobs: 4 })
try {
  // 将报告字符串提交给池，成功 data 为长度 16，队列满或线程失败读取 error。
  const result = await pool.run('Quarterly report')
  if (!result.success)
    throw new Error(result.error.message)
  void result.data // 16
}
finally {
  // 无参数结算未完成任务并等待池中线程退出。
  await pool.close()
}
```

队列满返回 `HaiCommonError.RATE_LIMIT_EXCEEDED`，池关闭返回 `NOT_INITIALIZED`，启动、传输或线程异常返回 `INTERNAL_ERROR`。异常任务结算后，后续工作可启动补位线程。空闲回收由 `idleTimeoutMs` 控制。无该参数时，空闲线程保留至关闭，Node 空闲线程会释放事件循环引用。

#### 场景：启动独占线程并接收第一条消息

只需提交任务并用 `await` 取得结果时，用上节的 `pool.run()`。需要自己收发消息或控制线程何时停止时，用 `core.worker.start()`。

将下面的 Node Worker 保存为 `stats-once-worker.mjs`。它收到一条消息后回传字符串长度，再关闭消息端口，让线程自行退出。

```js
import { parentPort } from 'node:worker_threads'

const port = parentPort
port?.once('message', (report) => {
  port.postMessage(report.length)
  port.close()
})
```

在同一目录的调用脚本中，先用 `onMessage()` 订阅回复，再用 `postMessage()` 发送 `'Report'`。收到回复时，回调会记录 `length` 为 `6`。

```ts
import { core } from '@h-ai/core'

const entry = new URL('./stats-once-worker.mjs', import.meta.url)
// 用一次性统计 worker 的模块 URL 启动独占线程，返回消息和退出控制对象。
const thread = core.worker.start<string, number>(entry)
// 注册长度回调，收到长度时 info 写日志。订阅调用返回取消函数。
const unsubscribe = thread.onMessage(length => core.logger.info('Report length', { length }))

try {
  // 向该线程发送可克隆的 Report 文本，无数据返回。
  thread.postMessage('Report')
  // 等待线程的退出结果，成功时 code 为 0，异常时读取 error 或其他退出码。
  const { code, error } = await thread.exited
  if (error || code !== 0)
    throw error ?? new Error(`Worker exited with code ${code}`)
}
finally {
  // 无参数停止接收上面登记的线程消息。
  unsubscribe()
  // 无参数请求该独占线程终止，并等待退出完成。
  await thread.terminate()
}
```

`await thread.exited` 等待 Worker 结束并取得退出状态。`finally` 取消订阅，也会在发送消息等步骤抛错时终止线程。

在 Vite 应用中，将入口写在 Web Worker 构造函数中，例如 `() => new Worker(new URL("./stats-worker.js", import.meta.url), { type: "module" })`。Web Worker 入口用 `globalThis.addEventListener("message", ...)` 和 `postMessage()`。浏览器端的 `thread.exited` 在调用 `thread.terminate()` 或收到 Worker 错误时完成。只使用应用发布的可信脚本。普通消息通过结构化克隆传输，Node 转移 ArrayBuffer，浏览器也能转移 ImageBitmap 等对象。提交转移列表后由线程取得缓冲区所有权。

<a id="access-api"></a>

### 请求访问检查：`core.access`（Node）

这组工具让 Node 后端在执行接口前，先按请求的路径、HTTP 方法、客户端 IP 和服务器时间决定是否放行。例如，限制只有合作方网段能调用某个同步接口。通过检查只表示满足访问策略，接口仍需按自己的规则验证身份和权限。

- 用 **Serv** 或 **Kit**：分别在 `_serv.yml` 的 `http.access` 或 `_kit.yml` 的 `access` 写规则。将对应设置交给 `serv.createApp({ http, ... })` 或 `kit.createHandle({ access, ... })` 后，框架会在启动时准备检查器，每次收到请求自动检查，拒绝时返回 HTTP 403。规则不写在 `_core.yml`。
- 用 **其他 Node HTTP 框架**：启动时创建 IP 解析器和规则检查器。每次请求时先从连接取出对端地址并解析客户端 IP，再把 URL 的 `pathname`、HTTP 方法和该 IP 传给检查器。Core 返回判定结果，HTTP 响应由你的代码负责。

<a id="client-ip-resolver"></a>

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `core.access.normalizeClientIp(value?)` | 检查并整理一个 IP 字符串 | `value` 可为连接地址字符串，缺失或无效时返回 `undefined`。 | 有效 IP 字符串；缺少地址或格式无效时返回 `undefined` | `core.access.normalizeClientIp('::ffff:198.51.100.23')` |
| `core.access.createClientIpResolver(trustedProxies?)` | 创建一个函数，逐请求选出供访问策略检查的 IP | `trustedProxies` 默认 `auto`，仅受管私有入口采用容器网段。也可明确传 IP/CIDR 数组，`[]` 不采用转发头。 | `resolveClientIp(request, remoteAddress?)`，返回 IP 或 `undefined` | `const resolveClientIp = core.access.createClientIpResolver(['192.0.2.10'])` |
| `core.access.createConditionCheck(condition)` | 单独检查 IP 和当前时段，不匹配路径或方法 | 必填 `condition`，包含可信地址与时间条件。字段和取值见[访问策略](../configuration/request-access.md)。 | `checkCondition(ip?)`，返回 `AccessDecision` | `core.access.createConditionCheck({ allowIps: ['198.51.100.0/24'], denyIps: [], timezone: 'UTC', windows: [] })` |
| `core.access.createRequestCheck(input?)` | 启动时准备请求检查器 | `input` 接受内联策略、`{ file }` 或 `false`，默认 `false`。 | `check(pathname, method, ip?)`，返回 `AccessDecision`；无法创建时抛错 | `const check = core.access.createRequestCheck({ file: './config/security/request-access.yml' })` |
| `core.access.loadPolicy(input?, baseDirectory?)` | 只读取和校验策略，适合部署前检查文件 | `input` 接受内联策略、`{ file }` 或 `false`，默认 `false`。`baseDirectory` 用来解析相对文件路径，默认当前目录。 | 校验后的策略对象或 `false`，无效时抛错 | `core.access.loadPolicy({ file: './config/security/request-access.yml' })` |

<a id="access-condition-options"></a>

#### 地址和时间条件

| 字段 | 取值、缺省与行为 |
| --- | --- |
| `allowIps` | IPv4、IPv6 或 CIDR 数组。空数组不限地址，非空仅允许命中地址。 |
| `denyIps` | IPv4、IPv6 或 CIDR 数组。空数组不拒绝，匹配时优先于允许项。 |
| `timezone` | 用于时间窗口的 IANA 时区，例如 `UTC`。 |
| `windows` | 时间窗口数组。`[]` 不限时间，非空使用窗口中的 `days`、`start`、`end`。见下方案例。 |

#### 场景：解析与检查客户端地址

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
// 以示例可信代理地址构造解析函数，后续用直接连接地址判断能否采用转发头。
const resolveClientIp = core.access.createClientIpResolver(['192.0.2.10'])
const request = new Request('https://example.test/api/partners/inventory/sync', {
  headers: { 'X-Forwarded-For': '198.51.100.23' },
})

// 用同一个请求头对比不同的直接连接地址。实际服务从连接读取第二个参数。
// 传带转发头的请求及可信直连地址，得到头中的客户地址。
const throughProxy = resolveClientIp(request, '192.0.2.10') // '198.51.100.23'
// 同一请求来自无信任声明的直接连接时，以连接地址为结果。
const direct = resolveClientIp(request, '203.0.113.7') // '203.0.113.7'
// 只传请求且没有直接连接地址，返回 undefined。
const unknown = resolveClientIp(request) // undefined

// 用解析后的地址检查合作方网段；路径和方法规则请用下方的 createRequestCheck 示例。
// 用下方网段和空时间窗构造地址规则检查函数，返回许可或拒绝结果。
const checkIp = core.access.createConditionCheck({
  allowIps: ['198.51.100.0/24'],
  denyIps: [],
  timezone: 'UTC',
  windows: [],
})
// 传已解析的允许网段地址，许可字段为 true。
checkIp(throughProxy).allowed // true
// 传不在网段的直接地址，许可字段为 false。
checkIp(direct).allowed // false
// 没有可验证客户端地址时，许可字段为 false。
checkIp(unknown).allowed // false
```

解析成功也不会自动放行：需要把结果交给 `checkIp(ip)` 或 `checkAccess(pathname, method, ip)`。如果规则限制了来源 IP，缺少可用地址（`undefined`）也会被拒绝。Serv 和 Kit 会在内部完成这两步，应用只需在配置里分别设置 `trustedProxies` 和访问策略。

#### 场景：读取策略并检查请求

先检查 `global`，再检查所有路径和方法都匹配的规则；全部通过才放行。没有匹配规则时只受 `global` 限制。`methods` 省略或为空表示匹配全部方法，`/**` 同时匹配该路径和它的子路径。拒绝时返回 `{ allowed: false, reason, ruleId? }`：`reason` 为 `address`、`time` 或 `path`；如果是某条路径规则拒绝，`ruleId` 可以用来定位规则。

<a id="partner-sync-example"></a>

#### 场景：只允许合作方在工作时段同步库存

服务通过反向代理提供 `POST /api/partners/inventory/sync`。库存同步只允许来自合作方网段 `198.51.100.0/24` 的请求，并且只在上海时间周一到周五 `09:00`（含）至 `18:00`（不含）开放。`GET /health` 不受这条规则影响，监控可以照常检查。

下面演示如何接入自建的 Node HTTP 服务。启动时创建解析器和检查器。每次请求时，HTTP 适配层将 Fetch `Request`、服务器套接字看到的对端地址和原有的请求处理函数传给 `handlePartnerAccess()`。示例中的 `192.0.2.10` 是反向代理连接后端时使用的地址；部署时把它和合作方网段替换为实际值。

```ts
import { core } from '@h-ai/core'

// 启动时配置一次：这里只信任直接连到后端的反向代理。
// 以示例可信代理地址构造解析函数，后续用直接连接地址判断能否采用转发头。
const resolveClientIp = core.access.createClientIpResolver(['192.0.2.10'])
// 用下方路径、方法、CIDR 和工作时段构造请求许可判定器，无效策略在构建时抛错。
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
  // 用请求头及宿主传入的真实连接地址解析客户端 IP，未知时为 undefined。
  const clientIp = resolveClientIp(request, peerAddress)
  const { pathname } = new URL(request.url)
  // 检查实际路径、HTTP 方法和已解析的地址，结果提供 allowed 和拒绝原因。
  const decision = checkAccess(pathname, request.method, clientIp)
  if (!decision.allowed) {
    // 将命中的拒绝规则和原因写入 info 日志，无业务数据。
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
// 从进程当前目录加载访问规则文件，成功返回检查函数，读取或校验失败抛错。
const check = core.access.createRequestCheck({ file: './config/security/request-access.yml' })
// 链接中的示例文件拒绝 192.0.2.7，结果的 allowed 为 false，reason 为 'address'。
// 用样例 GET 路径及被拒地址检查，结果 allowed 为 false，原因是 address。
const decision = check('/api/v1/external/sync', 'GET', '192.0.2.7')
```

- 文件只在创建检查器时读取，改完需要重启服务或重新创建检查器。文件最大 1 MiB，读不到或内容无效时会抛错；不要带着无效策略继续启动。
- `denyIps` 优先于 `allowIps`。允许名单为空时不额外限制来源，但拒绝名单仍然有效。时段列表为空时不限制时间；有时段时按服务器时钟判断，默认使用 UTC。
- `check.encryption(pathname, method)` 只按路径和方法返回 `'required'`、`'disabled'` 或 `undefined`。没有显式设置时返回 `undefined`，由 HTTP 服务沿用自己的设置。若规则的加密模式互相冲突，检查器创建失败；若 `check.requiresEncryption` 为 `true`，Serv 和 Kit 没有配置应用层传输加密时会拒绝启动。

完整默认值、独立文件、代理拓扑及部署步骤见[请求访问控制手册](../configuration/request-access.md)。

<a id="id-api"></a>

### 生成与校验标识：`core.id`

生成业务标识与日志关联编号，或检查输入是否符合 UUID v4 / nanoid 格式。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `core.id.generate(length?)` | 生成随机 ID | 可选 ID 字符数 `length`，默认 `21`。 | `string` | `core.id.generate(8)` |
| `core.id.short()` | 生成固定长度短 ID | 无参数 | `string` | `core.id.short()` |
| `core.id.withPrefix(prefix, length?)` | 给随机 ID 加上业务前缀 | 必填前缀字符串 `prefix`。`length` 为前缀之后的随机字符数，默认 `21`。 | `string` | `core.id.withPrefix('order_')` |
| `core.id.trace()` | 生成以 trace- 开头的追踪编号 | 无参数 | `string` | `core.id.trace()` |
| `core.id.request()` | 生成以 req- 开头的请求编号 | 无参数 | `string` | `core.id.request()` |
| `core.id.uuid()` | 生成 UUID v4，缺安全随机源会抛错 | 无参数 | `string` | `core.id.uuid()` |
| `core.id.isValidUUID(uuid)` | 检查 UUID v4 的格式 | 必填待校验的 UUID 字符串 `uuid`。 | `boolean` | `core.id.isValidUUID('550e8400-e29b-41d4-a716-446655440000')` |
| `core.id.isValidNanoId(str, length?)` | 检查字符范围和长度 | 必填待校验字符串 `str`。指定 `length` 检查字符数，默认 `21`。 | `boolean` | `core.id.isValidNanoId('abc', 3)` |

#### 场景：生成业务与请求标识

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

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `core.typeUtils.isDefined(value)` | 判断值是否既不是 null 也不是 undefined | 必填 `value`，传入待判断的任意 JavaScript 值。 | `boolean` | `core.typeUtils.isDefined(null)` |
| `core.typeUtils.isObject(value)` | 判断值是否为对象，排除 null 和数组 | 必填 `value`，传入待判断的任意 JavaScript 值。 | `boolean` | `core.typeUtils.isObject({ name: 'orders' })` |
| `core.typeUtils.isFunction(value)` | 判断是否为函数 | 必填 `value`，传入待判断的任意 JavaScript 值。 | `boolean` | `core.typeUtils.isFunction(() => {})` |
| `core.typeUtils.isPromise(value)` | 判断是否为 Promise | 必填 `value`，传入待判断的任意 JavaScript 值。 | `boolean` | `core.typeUtils.isPromise(Promise.resolve('ready'))` |
| `core.typeUtils.isString(value)` | 判断是否为字符串 | 必填 `value`，传入待判断的任意 JavaScript 值。 | `boolean` | `core.typeUtils.isString('orders')` |
| `core.typeUtils.isNumber(value)` | 判断是否为数字，排除 NaN | 必填 `value`，传入待判断的任意 JavaScript 值。 | `boolean` | `core.typeUtils.isNumber(3000)` |
| `core.typeUtils.isBoolean(value)` | 判断是否为布尔值 | 必填 `value`，传入待判断的任意 JavaScript 值。 | `boolean` | `core.typeUtils.isBoolean(false)` |
| `core.typeUtils.isArray(value)` | 判断是否为数组 | 必填 `value`，传入待判断的任意 JavaScript 值。 | `boolean` | `core.typeUtils.isArray([1, 2])` |

#### 场景：检查输入值并缩小类型

```ts
import { core } from '@h-ai/core'

core.typeUtils.isDefined(null) // false，同时排除 null 和 undefined。
core.typeUtils.isObject({ name: 'orders' }) // true；排除 null/数组，但也接受 Date 和类实例。
core.typeUtils.isFunction(() => {}) // true。
core.typeUtils.isPromise(Promise.resolve('ready')) // true。
core.typeUtils.isString('orders') // true。
core.typeUtils.isNumber(3000) // true；传 NaN 返回 false。
// 检查参数是否为布尔类型，false 本身是布尔值，所以返回 true。
core.typeUtils.isBoolean(false) // true。
core.typeUtils.isArray([1, 2]) // true。
```

<a id="object-api"></a>

### 处理对象：`core.object`

复制、合并或选取对象字段，也提供带键类型的 keys/values/entries 与 fromEntries。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `core.object.deepClone(obj)` | 复制可克隆的值，函数等不可克隆输入会抛错 | 必填源值 `obj`，需要复制时传可克隆的数据。 | `T` | `core.object.deepClone({ mode: 'local' })` |
| `core.object.deepMerge(...objects)` | 递归合并普通对象，后值优先 | 按优先级从低到高传入 `objects`。后一个的同名值覆盖前一个。 | `T` | `core.object.deepMerge({ port: 3000 }, { port: 4000 })` |
| `core.object.pick(obj, keys)` | 只保留列出的键 | 必填源对象 `obj` 与要保留的键数组 `keys`。 | `Pick<T, K>` | `core.object.pick({ a: 1, b: 2 }, ['a'])` |
| `core.object.omit(obj, keys)` | 移除列出的键 | 必填源对象 `obj` 与要排除的键数组 `keys`。 | `Omit<T, K>` | `core.object.omit({ a: 1, b: 2 }, ['a'])` |
| `core.object.keys(obj)` | 列出对象自己的可枚举字符串键 | 必填读取自有属性的源对象 `obj`。 | `(keyof T)[]` | `core.object.keys({ a: 1 })` |
| `core.object.values(obj)` | 依同样顺序列出对象的值 | 必填读取自有属性的源对象 `obj`。 | `T[keyof T][]` | `core.object.values({ a: 1 })` |
| `core.object.entries(obj)` | 返回键值对 | 必填读取自有属性的源对象 `obj`。 | `[keyof T, T[keyof T]][]` | `core.object.entries({ a: 1 })` |
| `core.object.fromEntries(entries)` | 从键值对构造对象 | 必填 `entries`，每项是一个 `[key, value]` 键值对。 | `Record<K, V>` | `core.object.fromEntries([['mode', 'local']])` |

#### 场景：合并设置并选取字段

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
// 将下方键值对转成对象，返回 { mode: 'local' }。
core.object.fromEntries([
  ['mode', 'local']
]) // { mode: 'local' }。
```

deepClone 使用 structuredClone，支持 Date/Map/Set/循环等可克隆值；不可克隆的函数等会抛错。deepMerge 只递归普通对象，数组、Date、集合和类实例由后值覆盖，不修改输入；不把它当作实例克隆。

<a id="string-api"></a>

### 处理字符串：`core.string`

统一命名格式、处理显示文字、判断空白以及比较字符串。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `core.string.capitalize(str)` | 首字符大写 | 必填待处理字符串 `str`。 | `string` | `core.string.capitalize('hello')` |
| `core.string.kebabCase(str)` | 转换成连字符分隔的命名 | 必填待处理字符串 `str`。 | `string` | `core.string.kebabCase('helloWorld')` |
| `core.string.camelCase(str)` | 转换成小驼峰命名 | 必填待处理字符串 `str`。 | `string` | `core.string.camelCase('hello-world')` |
| `core.string.snakeCase(str)` | 转换成下划线分隔的命名 | 必填待处理字符串 `str`。 | `string` | `core.string.snakeCase('helloWorld')` |
| `core.string.pascalCase(str)` | 转换成大驼峰命名 | 必填待处理字符串 `str`。 | `string` | `core.string.pascalCase('hello-world')` |
| `core.string.truncate(str, length, suffix?)` | 超过指定长度时截取，再加后缀 | 必填 `str` 和保留的 UTF-16 代码单元数 `length`。超长时截取前 `length` 个单元，再追加 `suffix`，默认 `...`。`length <= 0` 时返回原文。 | `string` | `core.string.truncate('abcdef', 3)` |
| `core.string.trim(str)` | 移除首尾空白 | 必填待处理字符串 `str`。 | `string` | `core.string.trim(' hello ')` |
| `core.string.isBlank(str)` | 判断是否为空或只有空白 | 必填待处理字符串 `str`。 | `boolean` | `core.string.isBlank(' ')` |
| `core.string.isNotBlank(str)` | 判断是否至少有一个非空白字符 | 必填待处理字符串 `str`。 | `boolean` | `core.string.isNotBlank('hello')` |
| `core.string.padStart(str, length, char?)` | 在开头填充到指定长度 | 必填字符串 `str` 与目标长度 `length`。填充字符串 `char` 默认空格。 | `string` | `core.string.padStart('5', 3, '0')` |
| `core.string.padEnd(str, length, char?)` | 在末尾填充到指定长度 | 必填字符串 `str` 与目标长度 `length`。填充字符串 `char` 默认空格。 | `string` | `core.string.padEnd('5', 3, '0')` |
| `core.string.constantTimeEqual(a, b)` | 比较字符串，不同长度立即返回 false | 必填要比较的两个字符串 `a`、`b`。 | `boolean` | `core.string.constantTimeEqual('same', 'same')` |

#### 场景：转换命名与显示文本

```ts
import { core } from '@h-ai/core'

core.string.capitalize('hello') // 'Hello'。
core.string.kebabCase('helloWorld') // 'hello-world'。
core.string.camelCase('hello-world') // 'helloWorld'。
core.string.snakeCase('helloWorld') // 'hello_world'。
core.string.pascalCase('hello-world') // 'HelloWorld'。
// 保留 abcdef 的前三个字符并加默认后缀，返回 abc...。
core.string.truncate('abcdef', 3) // 'abc...'。
core.string.trim(' hello ') // 'hello'。
core.string.isBlank(' ') // true。
core.string.isNotBlank('hello') // true。
// 将 5 左侧以字符 0 补至 3 位，返回 005。
core.string.padStart('5', 3, '0') // '005'。
// 将 5 右侧以字符 0 补至 3 位，返回 500。
core.string.padEnd('5', 3, '0') // '500'。
// 比较两份内容相同的字符串，返回 true。
core.string.constantTimeEqual('same', 'same') // true；安全边界见下方说明。
```

Node 的 constantTimeEqual 对等长 UTF-16 字节使用原生 timingSafeEqual，不同长度直接返回 false；浏览器不能提供引擎级恒时保证，不用于服务端凭据校验。

<a id="array-api"></a>

### 处理数组：`core.array`

按任务需要对数组去重、分块、分组、筛除空值或计算交集/差集；返回结果，保留输入数组。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `core.array.unique(arr)` | 按首次出现的顺序去重 | 必填待处理数组 `arr`。 | `T[]` | `core.array.unique([1, 1, 2])` |
| `core.array.groupBy(arr, fn)` | 按回调返回的键分组 | 必填数组 `arr` 和分组函数 `fn(item)`，返回将该项放入的分组键。 | `Record<K, T[]>` | `core.array.groupBy(['a', 'bb'], value => value.length)` |
| `core.array.chunk(arr, size)` | 按正整数大小分块，无效大小返回空数组 | 必填数组 `arr` 和每组最多容纳的项数 `size`。 | `T[][]` | `core.array.chunk([1, 2, 3], 2)` |
| `core.array.first(arr)` | 读取首项，空数组没有值 | 必填待处理数组 `arr`。 | `T or undefined` | `core.array.first([1, 2])` |
| `core.array.last(arr)` | 读取末项，空数组没有值 | 必填待处理数组 `arr`。 | `T or undefined` | `core.array.last([1, 2])` |
| `core.array.flatten(arr)` | 展开一层嵌套数组 | 必填嵌套数组 `arr`，只展开一层。 | `T[]` | `core.array.flatten([[1], [2, 3]])` |
| `core.array.compact(arr)` | 移除 null 和 undefined，保留 0 等值 | 必填待处理数组 `arr`。 | `T[]` | `core.array.compact([0, null, 1])` |
| `core.array.shuffle(arr)` | 返回随机排列的副本 | 必填待处理数组 `arr`。 | `T[]` | `core.array.shuffle([1, 2, 3])` |
| `core.array.intersection(arr1, arr2)` | 保留第一个数组中也出现在第二个数组的元素 | 必填左右两个数组 `arr1`、`arr2`，取同时出现的元素。 | `T[]` | `core.array.intersection([1, 2], [2, 3])` |
| `core.array.difference(arr1, arr2)` | 只保留第一个数组中未出现在第二个数组的元素 | 必填 `arr1`、`arr2`，保留只在第一个数组中出现的元素。 | `T[]` | `core.array.difference([1, 2], [2, 3])` |

#### 场景：分组、分块与比较集合

```ts
import { core } from '@h-ai/core'

core.array.unique([1, 1, 2]) // [1, 2]。
// 将三个输入项按每段最多两个分组，返回 [[1, 2], [3]]。
core.array.chunk([1, 2, 3], 2) // [[1, 2], [3]]。
// 以每项 role 为分组键，返回分别含 admin 和 user 的分组对象。
core.array.groupBy([
  { role: 'admin' },
  { role: 'user' }
], item => item.role)
// => { admin: [{ role: 'admin' }], user: [{ role: 'user' }] }
core.array.first([1, 2, 3]) // 1；空数组为 undefined。
core.array.last([1, 2, 3]) // 3；空数组为 undefined。
// 展开下方二维数组一层，返回 [1, 2, 3]。
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

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `core.async.delay(ms)` | 异步等待指定毫秒数 | 必填等待时长 `ms`，单位毫秒。 | `Promise<void>` | `await core.async.delay(10)` |
| `core.async.withTimeout(promise, ms)` | 限制等待时间，超时让等待方失败 | 必填等待的 `promise` 和期限 `ms`（毫秒）。超时只结束等待。 | `Promise<T>` | `await core.async.withTimeout(Promise.resolve('ready'), 1000)` |
| `core.async.retry(fn, options?)` | 抛错时重试；次数包含第一次 | 必填异步操作 `fn`。`options.maxRetries` 默认 `3` 次总尝试，最少执行一次。`options.delay` 默认 `1000` 毫秒。 | `Promise<T>` | `await core.async.retry(async () => 'ready')` |
| `core.async.parallel(items, fn, concurrency?)` | 限制同时执行的数量，按原顺序返回 | 必填 `items` 数组与异步 `fn(item, index)`。`concurrency` 为同时运行上限，默认 `5`，须是正安全整数。 | `Promise<R[]>` | `await core.async.parallel([1, 2], async n => n * 2, 2)` |
| `core.async.serial(items, fn)` | 按输入顺序逐项执行 | 必填 `items` 数组与异步 `fn(item, index)`，按输入顺序逐项等待。 | `Promise<R[]>` | `await core.async.serial([1, 2], async n => n * 2)` |
| `core.async.debounce(fn, ms)` | 等调用停止一段时间后处理最后一次输入 | 必填回调 `fn` 和以毫秒计的等待间隔 `ms`。 | `wrapper` | `core.async.debounce(callback, 100)` |
| `core.async.throttle(fn, ms)` | 立即处理第一次，在间隔内跳过后续调用 | 必填回调 `fn` 和以毫秒计的等待间隔 `ms`。 | `wrapper` | `core.async.throttle(callback, 100)` |

#### 场景：限时、重试与限制并发

```ts
import { core } from '@h-ai/core'

// 等待约 1 毫秒，无业务数据，随后继续使用原请求上下文。
await core.async.delay(1) // 等待约 1ms 后得到 undefined；计时以运行环境为准。
// 给等待 ready 的 Promise 设 1000ms 上限，本例得到 ready，超时拒绝。
await core.async.withTimeout(Promise.resolve('ready'), 1000) // 'ready'；超时则 reject 为 Error。
// 执行返回 ready 的回调，最多重试三次并等待配置延迟。本例首轮成功，耗尽后抛最后错误。
await core.async.retry(async () => 'ready', { maxRetries: 3, delay: 10 }) // 'ready'，本例首次即成功。
// 对三个输入执行翻倍回调并限制并发为二，成功得到输入顺序的 [2, 4, 6]，回调异常拒绝。
await core.async.parallel([1, 2, 3], async value => value * 2, 2) // [2, 4, 6]，最多同时执行两项。
// 按顺序运行每项翻倍回调，成功得到 [2, 4, 6]，回调异常拒绝。
await core.async.serial([1, 2, 3], async value => value * 2) // [2, 4, 6]，按输入顺序逐项执行。

// 两种包装保留回调参数类型；调用 search/scroll 时传入同样类型的参数。
// 以 100ms 包装搜索日志回调，返回等待间隔后记录最后一项搜索词的函数。
const search = core.async.debounce((term: string) => core.logger.debug('Search requested', { term }), 100)
// 以 100ms 包装滚动日志回调，返回限制滚动位置日志频率的函数。
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

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `core.time.formatDate(date, format?)` | 按本地时区填写格式中的日期占位符 | 必填 `Date` 值 `date`。`format` 为输出格式字符串，默认 `YYYY-MM-DD`。 | `string` | `core.time.formatDate(new Date(2026, 0, 1))` |
| `core.time.timeAgo(date)` | 按当前语言显示距今时间 | 必填 `Date` 对象 `date`。 | `string` | `core.time.timeAgo(new Date(Date.now() - 120_000))` |
| `core.time.now()` | 读取 Unix 毫秒 | 无参数 | `number` | `core.time.now()` |
| `core.time.nowSeconds()` | 读取向下取整的 Unix 秒 | 无参数 | `number` | `core.time.nowSeconds()` |
| `core.time.parseDate(dateStr)` | 将字符串交给原生 Date 解析，无效输入得到无效日期 | 必填待解析的日期文本 `dateStr`，例如 `2026-01-01T00:00:00Z`。 | `Date` | `core.time.parseDate('2026-01-01T00:00:00Z')` |
| `core.time.isValidDate(date)` | 检查 Date 是否代表有效时间 | 必填 `Date` 对象 `date`。 | `boolean` | `core.time.isValidDate(new Date('invalid'))` |
| `core.time.addDays(date, days)` | 按本地日历移动指定天数 | 必填 `date: Date` 和天数 `days`，负值向前移动。 | `Date` | `core.time.addDays(date, 7)` |
| `core.time.addHours(date, hours)` | 按本地时钟移动指定小时数 | 必填 `date: Date` 和小时数 `hours`，负值向前移动。 | `Date` | `core.time.addHours(date, 2)` |
| `core.time.startOfDay(date)` | 取当天的本地午夜 | 必填 `Date` 对象 `date`。 | `Date` | `core.time.startOfDay(date)` |
| `core.time.endOfDay(date)` | 取当天最后一毫秒 | 必填 `Date` 对象 `date`。 | `Date` | `core.time.endOfDay(date)` |

#### 场景：解析、格式化与计算日期边界

```ts
import { core } from '@h-ai/core'

// 这些日期运算使用运行环境的本地时区。
const date = new Date(2026, 0, 1, 12, 0, 0)
core.time.formatDate(date, 'YYYY-MM-DD HH:mm:ss') // '2026-01-01 12:00:00'
core.time.formatDate(date, 'MM/DD (MM-DD)') // '01/01 (01-01)'

// 将默认语言设为 zh-CN，之后默认消息使用中文。
core.i18n.setGlobalLocale('zh-CN')
// 将当前时刻前 120 秒的日期转为中文相对时间，本例为 2 分钟前。
core.time.timeAgo(new Date(Date.now() - 120_000)) // '2 分钟前'
core.time.now() // 当前 Unix 时间戳，单位为毫秒。
core.time.nowSeconds() // 当前 Unix 时间戳，向下取整到秒。

// 将 ISO UTC 字符串解析为日期对象，本例对应 2026 年元旦的 UTC 零点。
const parsed = core.time.parseDate('2026-01-01T00:00:00Z')
parsed.toISOString() // '2026-01-01T00:00:00.000Z'
core.time.isValidDate(parsed) // true
// 将示例本地日期加七天，返回新的 1 月 8 日中午日期对象。
core.time.addDays(date, 7) // 2026-01-08 12:00:00
// 将示例本地日期加两小时，返回当天 14:00 的日期对象。
core.time.addHours(date, 2) // 2026-01-01 14:00:00
// 根据传入日期返回同一当地日的起点 00:00:00.000。
core.time.startOfDay(date) // 2026-01-01 00:00:00.000
// 根据传入日期返回同一当地日末尾 23:59:59.999。
core.time.endOfDay(date) // 2026-01-01 23:59:59.999
```

`formatDate()` 默认使用 `YYYY-MM-DD`，会替换模板里每处日期占位符。`parseDate()` 使用原生 `Date` 解析，输入无效时可用 `isValidDate()` 检出。跨环境传输建议使用带时区的 ISO 字符串。`addDays()` 和 `addHours()` 按本地日历和时钟计算，在夏令时切换时，经过的实际时长可能不同。

更完整的参数与少见选项见[Core 使用参考](../../../packages/cli/templates/skills/hai-core/reference.md)；公开契约以当前包声明为准。

## 错误处理

领域操作先判断 `result.success`，失败按本模块错误定义与安全提示处理，服务端保留错误码、关联编号和脱敏原因。同步工具、工厂、流迭代及生命周期按各自签名处理，不把 Promise 完成视为业务成功。具体失败与恢复边界见对应功能。
