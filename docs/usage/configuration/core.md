# Core 配置

[配置手册](README.md) · [Core 功能说明](../function/core.md)

## 配置入口

Node.js 应用启动时调用 `core.init({ configDir: './config' })`，Core 会检查 `config/_core.yml` 并把读取结果存为 `core`。应用代码可以用 `core.config.getOrThrow<CoreConfig>('core')` 取得这些值。部署时可以用 `HAI_CORE_NAME` 等变量覆盖 YAML 里的设置，覆盖顺序见[运行配置](runtime.md#配置从哪里来)。

`_core.yml` 保存应用名称、版本、运行环境、默认语言和日志设置。Core 自动检查这个文件的键名和取值。HTTP 请求的访问策略由运行 HTTP 服务的应用选择，具体见[请求访问策略](#请求访问策略)。

## 配置示例

```yaml schema=@h-ai/core:CoreConfigSchema
name: Orders
version: 1.0.0
env: production
logging:
  level: warn
  redact: [customer.email]
```

服务启动后只输出 `warn` 及更高等级的日志，格式为每行一条 JSON。日志数据里的 `customer.email` 会显示为 `[REDACTED]`。

## 配置清单

| 配置项            | 默认值                 | 说明                                                                                                                                 |
| ----------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `name`            | `"hai Admin"`          | 应用名称，可用在页面标题或启动日志。                                                                                                 |
| `version`         | `"0.1.0"`              | 应用报告的版本。构建产物的版本由项目的 `package.json` 决定。                                                                         |
| `env`             | `"development"`        | 应用可读取此值区分 `development`、`production`、`test`、`staging`。进程的 `NODE_ENV` 由启动命令单独设置。                            |
| `defaultLocale`   | `"zh-CN"`              | 应用期望使用的语言。启动代码把该值传给 `core.i18n.setGlobalLocale()` 后，Core 消息才会按这个语言输出。页面文案由应用的翻译文件决定。 |
| `logging`         | 省略时保留当前日志设置 | 有这个键时可以只写想调整的子项，例如 `logging: { level: warn }`。                                                                    |
| `logging.level`   | `"info"`               | 最低日志级别，可选 `trace`、`debug`、`info`、`warn`、`error`、`fatal`。                                                              |
| `logging.format`  | `"json"`               | `json` 便于按行采集。`pretty` 便于在终端阅读，Node 需要可用的 `pino-pretty`。                                                        |
| `logging.context` | 可省略                 | 每条日志附带的固定字段，例如 `{ service: 'orders-api' }`。                                                                           |
| `logging.redact`  | `[]`                   | 额外隐藏的日志字段，例如 `customer.email` 或 `recipients[*].phone`。`*` 匹配一层。已知凭据字段始终隐藏。                             |

以新启动的 Node 服务为例。

- 完全省略 `logging`。日志沿用启动时的 `info` 级别和 `pretty` 格式。
- 写 `logging: {}`。Core 应用默认日志设置，级别为 `info`，格式为 `json`，附加的脱敏路径为空。
- 写 `logging: { level: warn }`。级别改为 `warn`，未填写的格式仍为 `json`。

如果启动代码直接传了 `core.init({ logging: ... })`，本次启动以代码传入的日志设置为准。

### 请求访问策略

配置位置取决于负责处理请求的服务。独立 API 的 Serv 读取 `_serv.yml` 的 `http.access`，SvelteKit 服务读取 `_kit.yml` 的 `access`。两者创建 HTTP 应用或请求处理函数时，都会用 Core 的同一套规则检查设置。`_core.yml` 负责应用信息和日志。

`access: false` 关闭这项检查。要启用时，在 `access` 下直接写 `global` 或 `rules`，也可以写 `file: ./config/security/request-access.yml`，让服务器启动时读一份独立文件。两种写法选一种。文件内容从 `global` 或 `rules` 开始，最大 1 MiB，相对路径从服务器进程的工作目录起算。使用其他 HTTP 框架时，Node 启动代码可以直接调用 `core.access.createRequestCheck({ file })`，再用返回的函数检查请求。

| 字段                 | 默认值             | 对请求的影响                                                                                                                                         |
| -------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `global`             | 可省略             | 对所有交给此服务处理的请求生效，包括健康检查。省略时只检查匹配的路径规则。                                                                           |
| `rules`              | `[]`               | 最多 1000 条路径规则。一次请求要满足全局条件和所有命中的规则。                                                                                       |
| `rules[].id`         | 必填               | 记录到日志以定位规则。须唯一，长度 1–64，可用字母、数字、下划线、点或连字符。                                                                        |
| `rules[].paths`      | 必填               | 1–100 个完整路径，每项 1–2048 个字符。保留实际部署的前缀，如 `/app/api/orders`。末尾 `/**` 同时匹配该路径和它的子路径。                              |
| `rules[].methods`    | `[]`               | 空数组匹配所有 HTTP 方法。列出 `GET` 只匹配 GET，HEAD 要单独列出。                                                                                   |
| `rules[].encryption` | 沿用服务的传输设置 | `required` 要求使用 Hai 的请求加密，`disabled` 使用普通 HTTP 请求格式。生产仍通过 HTTPS 传输。相同路径和方法命中互相矛盾的加密设置时，服务无法启动。 |

`global` 和每条 `rules[]` 都可以填写以下地址及时段条件。

| 字段              | 默认值  | 对请求的影响                                                                                    |
| ----------------- | ------- | ----------------------------------------------------------------------------------------------- |
| `allowIps`        | `[]`    | 最多 1000 个 IPv4、IPv6 地址或 CIDR 网段。非空时，只允许名单内的地址。                          |
| `denyIps`         | `[]`    | 同样可填地址或网段。只要命中拒绝名单，即使也在允许名单里仍会被拒绝。                            |
| `timezone`        | `"UTC"` | 使用服务器时钟，按 `Asia/Shanghai` 等 IANA 时区判断当前时间。                                   |
| `windows`         | `[]`    | 最多 100 个允许时段。空数组允许全天。                                                           |
| `windows[].days`  | 必填    | 至少 1 项，最多 7 项。周一填 `1`，周日填 `7`。跨午夜时填写开始当天。                            |
| `windows[].start` | 必填    | 24 小时制 `HH:mm`。到达此时刻即可访问。                                                         |
| `windows[].end`   | 必填    | 到达此时刻即停止允许访问。早于开始时刻表示跨午夜，例如 `22:00` 到次日 `02:00`。起止时刻须不同。 |

## 生效与核对

改了日志设置后，重启应用，再写一条测试日志核对级别、格式和脱敏字段。直接调用 `core.config.reload()` 只会更新 Core 保存的配置值。应在重启或应用明确重新调用日志配置后验证实际输出。

修改请求策略后，重启 [Serv](serv.md) 后端或 [Kit](kit.md) 服务，让它用新配置创建请求检查器。分别发送一条应通过和一条应拒绝的请求，确认策略生效。代理地址、文件挂载和验证步骤见[请求访问策略手册](request-access.md)。
