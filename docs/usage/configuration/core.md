# Core 配置

[English](core.en.md) · [日本語](core.ja.md)

[配置手册](README.md) · [Core 功能说明](../function/core.md)

## 配置入口

Node.js 应用启动时调用 `core.init({ configDir: './config' })`，Core 会检查 `config/_core.yml` 并把读取结果存为 `core`。应用代码可以用 `core.config.getOrThrow<CoreConfig>('core')` 取得这些值。部署时可以用 `HAI_CORE_NAME` 等变量覆盖 YAML 里的设置，覆盖顺序见[运行配置](runtime.md#配置从哪里来)。

`_core.yml` 保存应用名称、版本、运行环境、默认语言和日志设置。Core 自动检查这个文件的键名和取值。HTTP 请求的访问策略由运行 HTTP 服务的应用选择，具体见[请求访问策略](#请求访问策略)。

## 配置清单

| 配置项            | 默认值                 | 说明                                                                                                                                 |
| ----------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `name`            | `"hai Admin"`          | 应用名称，可用在页面标题或启动日志。                                                                                                 |
| `version`         | `"0.1.0"`              | 应用报告的版本。构建产物的版本由项目的 `package.json` 决定。                                                                         |
| `env`             | `"development"`        | 应用可读取此值区分 `development`、`production`、`test`、`staging`。进程的 `NODE_ENV` 由启动命令单独设置。                            |
| `defaultLocale`   | `"zh-CN"`              | 应用期望使用的语言。启动代码把该值传给 `core.i18n.setGlobalLocale()` 后，Core 消息才会按这个语言输出。页面文案由应用的翻译文件决定。 |
| `logging`         | 省略时保留当前日志设置 | 有这个键时可以只写想调整的子项，例如 `logging: { level: warn }`。                                                                    |
| `logging.level`   | `"info"`               | 最低日志级别，可选 `trace`、`debug`、`info`、`warn`、`error`、`fatal`。                                                              |
| `logging.format`  | `"pretty"`             | `pretty` 便于在终端阅读。Node 找不到可选依赖 `pino-pretty` 时会输出 JSON。日志采集需要固定格式时，可显式填写 `json`。                |
| `logging.context` | 可省略                 | 每条日志附带的固定字段，例如 `{ service: 'orders-api' }`。                                                                           |
| `logging.redact`  | `[]`                   | 额外隐藏的日志字段，例如 `customer.email` 或 `recipients[*].phone`。`*` 匹配一层。已知凭据字段始终隐藏。                             |

<a id="request-access"></a>

### 请求访问策略

#### 策略写在哪个文件

Core 提供检查请求的函数。应用启动时把访问策略交给负责接收请求的服务，服务会用它检查每一次请求。

| 后端            | 配置位置                            | 启动代码怎样传入                                               |
| --------------- | ----------------------------------- | -------------------------------------------------------------- |
| 独立的 Serv API | `config/_serv.yml` 的 `http.access` | 将读取到的 `http` 传给 `serv.createApp({ http, ... })`。       |
| SvelteKit 服务  | `config/_kit.yml` 的顶层 `access`   | 将读取到的 `access` 传给 `kit.createHandle({ access, ... })`。 |

`config/_core.yml` 只能填写上面配置清单中的字段。把 `access` 或 `global` 写进这个文件会触发配置校验错误。按上表选择真正接收请求的后端文件。省略 `access` 或将它设为 `false` 时，服务不会执行这些额外的地址及时段检查。

#### 请求访问策略字段


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

## 配置示例

### 应用日志

```yaml schema=@h-ai/core:CoreConfigSchema
name: Orders
version: 1.0.0
env: production
logging:
  level: warn
  redact: [customer.email]
```

服务启动后只输出 `warn` 及更高等级的日志，默认使用 `pretty`。如果日志系统要求每行一条 JSON，在 `logging` 下加上 `format: json`。两种格式都会把日志里的 `customer.email` 遮盖为 `[REDACTED]`。

以新启动的 Node 服务为例。

- 完全省略 `logging`。日志沿用启动时的 `info` 级别和 `pretty` 格式。
- 写 `logging: {}`。Core 应用默认日志设置，级别为 `info`，格式为 `pretty`，附加的脱敏路径为空。
- 写 `logging: { level: warn }`。级别改为 `warn`，格式仍为 `pretty`。

如果启动代码直接传了 `core.init({ logging: ... })`，本次启动以代码传入的日志设置为准。

### HTTP 请求策略

#### 示例一：在 Serv 中限制整个服务的来源，再限制订单接口的时间

在 `config/_serv.yml` 中填写以下配置。将示例网段替换为实际允许的客户端网段。

```yaml schema=@h-ai/serv:ServConfigSchema
http:
  access:
    global:
      allowIps: [192.0.2.0/24]
      denyIps: [192.0.2.7]
    rules:
      - id: orders-hours
        paths: [/api/v1/orders/**]
        timezone: Asia/Shanghai
        windows:
          - days: [1, 2, 3, 4, 5]
            start: '09:00'
            end: '18:00'
```

`global` 对本服务处理的每个请求生效，包括健康检查。`192.0.2.7` 已列在拒绝名单里，一律拒绝。从 `192.0.2.10` 发出的订单请求还要满足 `orders-hours`，因此周一 10:00 可以通过策略，周一 18:00 就会被拒绝。其他路径只检查全局条件。

#### 示例二：在 SvelteKit 中让所有动态请求只在工作时段通过

在 `config/_kit.yml` 的顶层设置 `access`。`global` 也可以只写时段，本例只限制进入 SvelteKit 请求处理函数的请求。

```yaml schema=@h-ai/kit:KitConfigSchema
access:
  global:
    timezone: Asia/Shanghai
    windows:
      - days: [1, 2, 3, 4, 5]
        start: '09:00'
        end: '18:00'
```

此配置在上海时间周一到周五 `09:00` 至 `18:00` 之间允许访问，`18:00` 整即停止放行。只想限制部分接口时，可把这个时段条件移进 `rules` 的一条路径规则，避免影响登录页或健康检查。

#### 示例三：引用独立的规则文件

将策略写到 `config/security/request-access.yml`，从 `global` 或 `rules` 开始。

```yaml schema=@h-ai/core:RequestAccessPolicySchema
global:
  denyIps: [192.0.2.7]
```

Serv 在 `config/_serv.yml` 通过 `http.access.file` 引用它。

```yaml schema=@h-ai/serv:ServConfigSchema
http:
  access:
    file: ./config/security/request-access.yml
```

SvelteKit 在 `config/_kit.yml` 通过 `access.file` 引用它。

```yaml schema=@h-ai/kit:KitConfigSchema
access:
  file: ./config/security/request-access.yml
```

`access` 里写了 `file` 就把规则都放进该文件，大小上限为 1 MiB。相对路径从后端进程的工作目录起算。服务启动时读取文件，改完配置后重启后端。使用其他 Node HTTP 框架时，启动代码可以调用 `core.access.createRequestCheck({ file: './config/security/request-access.yml' })`，再将请求路径、方法和可信客户端 IP 交给返回的函数。

### 生效与核对

改了日志设置后，重启应用，再写一条测试日志核对级别、格式和脱敏字段。直接调用 `core.config.reload()` 只会更新 Core 保存的配置值。应在重启或应用明确重新调用日志配置后验证实际输出。

修改请求策略后，重启 [Serv](serv.md) 后端或 [Kit](kit.md) 服务，让它用新配置创建请求检查器。分别发送一条应通过和一条应拒绝的请求，确认策略生效。代理地址、文件挂载和验证步骤见[请求访问策略手册](request-access.md)。
