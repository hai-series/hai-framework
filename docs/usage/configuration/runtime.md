# 基础配置、环境覆盖与生命周期

[配置手册](README.md) · [下一章：数据与共享状态](data.md)

先解决“谁加载、最后哪个值生效、谁消费”三个问题，再调整具体模块参数。生成工程已装配常用入口；自己写启动代码时，也要逐项校验并检查初始化结果。

## 配置从哪里来

运行配置通常放 `config/_<名称>.yml`，例如 `_db.yml` 注册为 `db`。模块名不一定是文件名：数据库模块 `reldb` 的生成配置名是 `db`，所以覆盖变量以 `HAI_DB_` 开头。根 `hai.json` 的 build/deploy 由 CLI 读取，UI 和 API 客户端参数由调用方传入。

| 来源 | 普通应用运行时的优先级与用途 |
| --- | --- |
| 进程环境 | 最高；CI/容器/Secret Manager 注入，已有变量不被 dotenv 覆盖；空字符串也是显式输入 |
| `.env.local` | 本机私有覆盖，不提交版本库 |
| `.env.<mode>` | 环境公共差异，例如 `.env.prod`；不放真实秘密 |
| `.env` | 公共基础值 |
| YAML 中的 `HAI_<配置名>_<路径>` 覆盖 | 加载 YAML 时按约定覆盖节点，父对象整体替换优先于已有子叶；camelCase 不拆词 |
| `${VAR}` / `${VAR:回退值}` | 没有约定节点覆盖时解析插值；必需变量缺失返回 `CONFIG_ENV_VAR_MISSING` |
| Schema 默认 | 最后补齐该 Schema 明确声明的缺省字段，不能补真实服务地址和凭据 |

`core.init()` 不读取 dotenv。Node/Vite 宿主需先调用 `core.config.loadEnvFiles` 并检查 success，或采用生成工程已有装配。部署额外支持 `.env.<mode>.local` 且父/叶合并有不同规则，见[部署配置](delivery.md#环境和秘密的来源)。不要在应用里再实现一套覆盖顺序。

例如 YAML 写 `session.maxAge: 86400`，`HAI_IAM_SESSION_MAXAGE=1800` 可把它改成 1800。若同时设置 `HAI_IAM_SESSION='{"maxAge":3600}'`，父对象整体替换，叶子 1800 不再生效；YAML 没有的任意叶子不会凭空创建，应补字段或覆盖完整父对象。

![同一YAML的三种实际生效值](../images/configuration-precedence.png)

上图运行 `node docs/usage/examples/configuration-effects.mjs`，实际结果依次为 86400、1800、3600 秒。示例使用独立 guide 配置，不读取应用密钥。排查时核对来源键名，不打印完整配置或私有环境。

## 应用信息与语言

配置位置：`config/_core.yml`。用途：统一应用元信息、核心错误语言和日志；不会自动翻译业务页面文案。

| 项 | 框架默认 | 不同值的影响 |
| --- | --- | --- |
| `name` | `hai Admin` | 宿主读取的应用名称，生成应用应明确填业务名称 |
| `version` | `0.1.0` | 应用公开信息；发布制品版本另由根 package.json 驱动，不能只改这里 |
| `env` | `development` | 可选 development/production/test/staging；不会自行设置 NODE_ENV 或启动依赖 |
| `defaultLocale` | `zh-CN` | 核心默认消息语言；浏览器 UI 还需使用语言入口；每个请求的 locale 应用上下文隔离 |
| `logging` | 整个对象可省略 | 省略对象不会等同于传入 `{}`，见下一节 |

```yaml schema=@h-ai/core:CoreConfigSchema
name: Orders
version: 1.0.0
env: production
defaultLocale: zh-CN
logging:
  level: info
  format: json
  context: { service: orders-serv }
  redact: [customer.email, customer.phone]
```

应用启动后通过公开 app.info/宿主白名单核对名称、版本；切换界面语言确认核心错误和 UI 一起切换。服务端不要下发整个 `_core.yml`，只公开必要字段。Vite 注入的编译默认值要重新构建后才改变，不能承诺任意 YAML 热更新到静态页面。

## 日志采集与隐私

| 项 | 框架默认 | 修改后的影响与检查 |
| --- | --- | --- |
| `logging.level` | 对象存在时 `info` | trace/debug 更多诊断，warn/error 更少输出；检查目标级别是否被过滤 |
| `logging.format` | 对象存在时 `json`；未配置 Logger 初始为 `pretty` | JSON 适合逐行采集；pretty 适合终端且需 pino-pretty，不能靠默认环境推断 |
| `logging.context` | 无默认 | 追加稳定服务/节点标识，不放密码或用户敏感正文 |
| `logging.redact` | `[]` | 追加业务隐私路径，凭据默认脱敏仍生效；已有历史日志不会被追溯清理 |

![核心默认、日志对象默认与未知字段拒绝](../images/config-core.png)

图中 Core 空配置没有 logging，而单独解析 logging 空对象会补 info/json/空 redact；未知业务字段被严格 Schema 拒绝。来源是 `node docs/usage/examples/configuration-checks.mjs`，并非日志平台截图。

错误输出走 `core.error.toPublic`，UI 经 ToastContainer 默认显示可读说明，排查图标才展示编号。日志可以保留脱敏 Error 和同一个 traceId；不要把 cause、SQL、绑定值或凭据返回用户。默认脱敏覆盖 passwordHash/secretKey 等已知字段，不保证识别任意无标签秘密；业务隐私要显式清理。

![公开错误保留关联信息并隐藏内部原因](../images/errors-public-boundary.png)

## 保存以后如何生效

以下是独立 Node 宿主的完整装配片段；生成工程已有同类入口时直接复用。

```ts
import { core } from '@h-ai/core'
import { ReldbConfigSchema, reldb } from '@h-ai/reldb'

const env = core.config.loadEnvFiles({ mode: 'dev', envDir: '.' })
if (!env.success) throw new Error(env.error.message)
Object.assign(process.env, env.data)
core.init({ configDir: './config' })
const db = core.config.validate('db', ReldbConfigSchema)
if (!db.success) throw new Error(db.error.message)
const started = await reldb.init(db.data)
if (!started.success) throw new Error(started.error.message)
// 宿主退出时 await reldb.close()，检查关闭结果。
```

这是启动边界的失败退出，不是要求业务 API 改成抛异常。`core.init` 会记录单项加载失败并继续；结束不表示每项有效，必需配置必须 validate。目录扫描/日志设置等异常也可能传播。Core 是同步入口，没有 `core.close()`。

配置缓存变化不表示连接池、会话或外部客户端已经热更新。先停接请求，再按宿主顺序释放旧模块，校验新配置并重新初始化。多模块优先复用 `core.module.createRuntime`：顺序启动，失败回滚，反序关闭；关闭失败保留待清理模块及依赖，不能先关闭仍被使用的数据库。

| 能力 | 前置与关闭顺序 |
| --- | --- |
| IAM | 先 RelDB/Cache，最后关闭存储；OTP/LDAP 按功能补实际通道 |
| Feedback | 先 RelDB/私有 Storage；先停止并排空采集任务，再关依赖 |
| AI 持久化 | RelDB/VecDB 或显式持久 Store；生产不能退回进程内存冒充可用 |
| Audit/Scheduler/Payment | 共享 RelDB；通知按需 Reach，未知副作用先核对再恢复 |
| Serv/Kit/UI/Datapipe | 工厂、宿主适配、组件或纯函数，按公开契约，不统一套 init/close |

本章实际验证覆盖顺序、Schema 默认和错误边界。生产多节点故障及滚动更新应结合目标数据库、缓存和部署环境验收。
