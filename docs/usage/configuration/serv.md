# @h-ai/serv 配置

[English](serv.en.md) · [日本語](serv.ja.md)

[配置手册](README.md) · [功能说明](../function/serv.md) · [数据结构](../data/serv.md) · [订单运营台教程](../getting-started/serv.md#quick-start)

## 配置入口

CLI 生成的独立 API 服务用 Core 加载 `config/_serv.yml`，并通过 `ServConfigSchema` 校验。服务端将 `http`、`cors` 和启用的 `transport` 传给 `serv.createApp()`。传输加密还需服务端密钥环和共享密钥登记存储。A2A 和实时语音启用后，由应用注入 AI、IAM 与业务授权所需的运行时依赖。服务端将解析后的 `server.host` 和 `server.port` 传给 `serv.listen()`。 [应用工厂参数](../function/serv.md#host-options)

通过 Core 加载时，`HAI_SERV_<字段路径>` 可以覆盖 YAML。例如 `HAI_SERV_HTTP_APIPREFIX` 对应 `http.apiPrefix`，`HAI_SERV_TRANSPORT_MAXREQUESTAGESECONDS` 对应 `transport.maxRequestAgeSeconds`。同一来源先用整段配置，再用细项覆盖。进程环境优先于模式私有、全局私有、模式公共和基础环境文件。参数能否生效取决于应用如何加载并传入配置。 [配置来源和覆盖顺序](runtime.md#配置从哪里来)

生成的独立 API 服务和 Fullstack 服务在各自的 `_serv.yml` 中显式绑定了服务器地址、端口、API 前缀、代理、CORS 和所启用的传输字段。路由预算等可选字段可以通过已注册的 Schema 使用环境覆盖。例如 `HAI_SERV_TRANSPORT_ROUTEPLAINTEXTBYTES` 接收 JSON 路径映射。`http.docs.requireAuth` 只在启用 docs 对象时有意义。调整后重启服务，修改部署探针或网关路由时一并更新部署。

<a id="configuration-fields"></a>

## 配置清单

<a id="listening"></a>

### 监听

| 字段 | 类型及约束 | 默认值 | 用途 |
| --- | --- | --- | --- |
| `server` | 对象，可省略 | `{ host: "127.0.0.1", port: 3000 }` | 解析后的 HTTP 监听地址和端口。 |
| `server.host` | 非空字符串 | `"127.0.0.1"` | 主机名或 IP。解析时优先使用非空的 `HOST`。 |
| `server.port` | 1–65535 的整数 | `3000` | TCP 端口。解析时优先使用有效的 `PORT`。 |

<a id="local-listening-example"></a>

#### 在本机启动服务

将以下内容写入 `config/_serv.yml`，保留其他所需业务配置。示例把实例绑定到回环地址的 4100 端口，适合开发机上运行多套服务。非空的 `HOST` 和有效的 `PORT` 仍优先。

```yaml schema=@h-ai/serv:ServConfigSchema
server:
  host: 127.0.0.1
  port: 4100
```

启动应用后访问 `http://127.0.0.1:4100/health`，应得到 HTTP 200。此示例使用框架默认的健康端点。

<a id="http-endpoints"></a>

### API、文档与探针

| 字段 | 类型及约束 | 默认值 | 用途 |
| --- | --- | --- | --- |
| `http` | 对象，可省略 | 使用本节和请求访问的默认值 | 业务 API、文档、健康检查和请求访问设置。 |
| `http.apiPrefix` | 以 `/` 开头的路径。每段仅接受英文字母、数字、下划线、点和连字符，不能出现 `.` 或 `..` 段或尾斜杠 | `"/api/v1"` | 业务 API 的路由前缀。密钥交换路径由 `transport.keyExchangePath` 单独设置。 |
| `http.openapi` | `false` 或对象 | `false` | 对象启用 OpenAPI JSON 端点。 |
| `http.openapi.path` | 以 `/` 开头的完整路径 | `"/openapi.json"` | 客户端和工具访问 OpenAPI JSON 的地址。 |
| `http.docs` | `false` 或对象 | `false` | 对象启用 Scalar API 文档页。 |
| `http.docs.path` | 以 `/` 开头的完整路径 | `"/docs"` | 文档页地址。同目录下的 `_hai/scalar.js` 提供页面脚本。 |
| `http.docs.requireAuth` | 布尔值 | 省略时不要求认证 | 为 `true` 时要求应用建立已验证的会话，文档响应带 `Cache-Control: private, no-store`。单独启用的 OpenAPI JSON 按自身的访问策略提供。 |
| `http.health` | `false` 或对象 | `{ path: "/health", readyPath: "/ready" }` | 提供健康和就绪探针。两者只说明 HTTP 应用能响应。 |
| `http.health.path` | 以 `/` 开头的完整路径 | `"/health"` | 健康检查地址。 |
| `http.health.readyPath` | 以 `/` 开头的完整路径 | `"/ready"` | 就绪检查地址。 |

文档页、OpenAPI JSON 和 Scalar 脚本使用不同路径，并避开已挂载的 GET 和 HEAD 契约路径。装配时拒绝这些同路径冲突。

在使用 `serv.createRuntimeSecurityPolicy()` 的生成项目里，生产环境不发布 OpenAPI JSON 或文档页。Core 环境、代理转发和实际健康探针也会影响部署结果。 [部署入口与文档路径](http.md#serv监听和路由)

<a id="docs-health-example"></a>

#### 开启接口文档并调整健康检查地址

在开发环境把以下内容写入 `config/_serv.yml`。文档页要求已验证会话，应用需提供认证逻辑。关闭独立 OpenAPI JSON 后，文档页内嵌接口描述。

```yaml schema=@h-ai/serv:ServConfigSchema
http:
  openapi: false
  docs:
    path: /docs
    requireAuth: true
  health:
    path: /healthz
    readyPath: /readyz
```

分别用未认证和已认证的请求访问 `/docs`，检查返回 HTTP 401 和 HTTP 200，且响应均包含 `Cache-Control: private, no-store`。默认 OpenAPI 路径应返回 HTTP 404。对 `/healthz` 和 `/readyz` 执行探针并检查 HTTP 200。若需要独立发布 JSON，则使用 `http.openapi: { path: /openapi.json }`，并为该路径配置访问控制。

<a id="request-access"></a>

### 可信代理与请求访问

| 字段 | 类型及约束 | 默认值 | 用途 |
| --- | --- | --- | --- |
| `http.trustedProxies` | `"auto"` 或最多 1000 项 IPv4／IPv6 地址或 CIDR 数组 | `"auto"` | 只接收可信代理提供的转发地址。`auto` 只在框架管理的私有 Compose 网络里信任容器网段。其他部署默认忽略转发头。`[]` 显式忽略转发头。 |
| `http.access` | `false`、内联策略对象或独立文件对象 | `false` | 按完整路径、方法、可信客户端 IP 和时间检查请求。内联策略与文件引用不能混用。 |
| `http.access.file` | 指向普通 `.yml`／`.yaml` 文件的路径，最多 4096 字符 | 文件对象必填 | 相对路径以服务进程的工作目录为基准。装配请求处理器时读取一次，文件最大 1 MiB。 |
| `http.access.global` | 内联条件对象 | 可省略 | 应用于交给当前宿主处理的所有请求，包括健康检查。 |
| `http.access.rules` | 最多 1000 条路径规则的数组 | `[]` | 请求必须通过全局条件和所有匹配规则。`encryption` 可对匹配的方法和路径指定传输加密要求。 |

日历、IP 列表、路径匹配、HTTP 方法和加密模式的完整字段与限制见 [Core 请求访问策略](core.md#request-access)。Kit 在 `_kit.yml` 的 `http.access` 使用同样的策略。 [Kit 请求访问](kit.md#request-access)

<a id="trusted-proxy-example"></a>

#### 只向合作方网段开放报告

合作方通过反向代理读取订单运营台的外部报告。在对应配置文件的 `http` 中合入以下设置。代理的连接地址为 `192.0.2.10`，合作方网段为 `203.0.113.0/24`。部署时替换为真实值。

```yaml schema=@h-ai/serv:ServConfigSchema
http:
  trustedProxies: [192.0.2.10]
  access:
    rules:
      - id: partner-reports
        paths: [/api/v1/external/reports]
        methods: [GET]
        allowIps: [203.0.113.0/24]
```

从允许的网段经代理请求 `GET /api/v1/external/reports`，预期 HTTP 200。换成其他网段，预期 HTTP 403。若应用挂载在子目录，规则使用包含前缀的完整请求路径。需要限制探针时，另行配置探针路径或全局规则。 [合作方报告接入](../getting-started/serv.md#orders-console-access)

<a id="time-window-example"></a>

#### 让审计员在工作时间查看报告

将这条规则加到 `http.access.rules`，使用订单运营台的实际报告路径。上海时区周一至周五从 09:00 开始放行，18:00 起拒绝。同一报告路由继续执行已有的角色和权限检查。

```yaml schema=@h-ai/serv:ServConfigSchema
http:
  access:
    rules:
      - id: report-hours
        paths: [/api/v1/reports/current]
        methods: [GET]
        timezone: Asia/Shanghai
        windows:
          - days: [1, 2, 3, 4, 5]
            start: '09:00'
            end: '18:00'
```

以具有 `reports:read` 权限的审计员登录，在窗口内外请求 `GET /api/v1/reports/current`。窗口内返回 200，窗口外的新请求返回 403。需要让运维单独维护策略时，将策略对象放入独立 YAML 并用 `http.access.file` 引用。 [分离策略文件](request-access.md#4-运维人员携带独立-yaml-交付)

<a id="http-rate-limit"></a>

### 固定窗口限流

| 字段 | 类型及约束 | 默认值 | 用途 |
| --- | --- | --- | --- |
| `http.rateLimit` | `false` 或对象 | `false` | 按可信客户端 IP 限制请求频率。启用时由服务端注入原子计数存储。 |
| `http.rateLimit.windowMs` | 1–2147483647 的整数，单位为毫秒 | `60000` | 从首次写入计数起的固定窗口。后续请求沿用同一到期时间。 |
| `http.rateLimit.maxRequests` | 正安全整数 | `100` | 单个客户端在窗口内通过限流检查的次数。超限返回 HTTP 429。 |

应用将解析出的限流设置与原子计数存储一起传给请求入口。单进程开发可用内存存储。多实例使用同一 Redis、命名空间、时长和额度。默认按可信客户端 IP 计数，无法识别地址的请求共享 `unknown` 计数。存储故障返回 HTTP 503。 所有通过访问策略检查的 HTTP 请求共享同一 IP 的配额。内置健康和就绪探针以及 CORS 预检不消耗配额。开启加密后，密钥交换也计入配额。

若要按当前登录账号设置独立的限额，在宿主入口用代码注入限流键。YAML 只读取窗口和额度。

<a id="rate-limit-config-example"></a>

#### 限制同一客户端的请求频率

把以下配置写入 `config/_serv.yml`。示例让同一可信客户端在 10 秒内通过两次检查。自管反向代理可在同一 `http` 对象填入实际代理的 IP 或 CIDR。

```yaml schema=@h-ai/serv:ServConfigSchema
http:
  rateLimit:
    windowMs: 10000
    maxRequests: 2
```

可用 `HAI_SERV_HTTP_RATELIMIT` 覆盖整项，也可用 `HAI_SERV_HTTP_RATELIMIT_WINDOWMS` 和 `HAI_SERV_HTTP_RATELIMIT_MAXREQUESTS` 覆盖子字段。

启动订单运营台后，在 10 秒内从同一来源连续请求 `GET /api/v1/status` 三次。前两次返回 200，剩余额度为 1、0，第三次返回 429。等待 `Retry-After` 指示的秒数后再试，应恢复为 200。使用实际绑定的地址和部署前缀。 [配置和启动示例](../getting-started/serv.md#orders-console-access)

<a id="cors"></a>

### 跨源访问

| 字段 | 类型及约束 | 默认值 | 用途 |
| --- | --- | --- | --- |
| `cors` | `false` 或对象 | `false` | 对象启用 CORS，按以下规则处理响应头和预检。 |
| `cors.origin` | 完整 Origin 字符串、逗号分隔字符串或字符串数组 | `"*"` | 允许浏览器读取响应。使用 Cookie 等凭据时必须列明完整来源，禁止通配符。 |
| `cors.nativeOrigins` | `http:`、`https:`、`capacitor:` 或 `tauri:` 来源，逗号分隔 | 无 | 额外允许的原生应用来源。 |
| `cors.paths` | 完整请求路径数组 | 省略时应用到所有宿主请求 | 每项匹配该路径及其子路径，包含实际部署前缀；空数组不匹配。 |
| `cors.methods` | HTTP 方法数组 | `[GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS]` | 告知浏览器预检后可以使用的方法。 |
| `cors.allowedHeaders` | 请求头名数组 | `[Authorization, Content-Type, X-Requested-With, X-Hai-Reauthentication, X-Hai-Terminal]` | 列出允许浏览器发送的预检请求头。 |
| `cors.exposedHeaders` | 响应头名数组 | `[]` | 额外允许浏览器脚本读取的响应头。宿主也暴露 `X-Request-Id` 和 `X-Trace-Id`。 |
| `cors.credentials` | 布尔值 | `false` | 允许跨源请求携带 Cookie 等凭据。 |
| `cors.maxAge` | 非负整数，单位秒 | `86400` | 浏览器可缓存预检结果的时间，实际有效期还受浏览器限制。 |

CORS 启用且路径匹配时，宿主为带 `Origin` 和 `Access-Control-Request-Method` 的 OPTIONS 请求处理预检。通过请求访问策略后返回 204，这类预检不消耗限流额度。其余 OPTIONS 适用同一套访问、限流和传输规则，由应用路由处理。 生成的 API Service 和 Fullstack 在生产环境启用 CORS 时，要求显式配置 Web Origin。

<a id="cors-example"></a>

#### 让订单运营台读取另一个来源的 API

页面在 `https://console.orders.example.com`，API 在 `https://api.orders.example.com`。将下面配置加到应用对应的 YAML，并替换成页面实际使用的 Origin。这两个站点地址示例共享站点，浏览器可以按会话 Cookie 自己的属性判断是否携带凭据。

```yaml schema=@h-ai/serv:ServConfigSchema
cors:
  origin: https://console.orders.example.com
  paths: [/api/v1]
  methods: [GET, POST, OPTIONS]
  credentials: true
  allowedHeaders:
    - Authorization
    - Content-Type
    - X-Request-Client
    - X-Request-Id
    - X-Hai-Terminal
    - X-Hai-Reauthentication
    - X-Hai-Locale
  exposedHeaders:
    - Retry-After
    - X-RateLimit-Remaining
  maxAge: 600
```

登录后，在浏览器的网络面板检查 API 预检返回匹配页面 Origin 的 `Access-Control-Allow-Origin` 和 `Access-Control-Allow-Credentials: true`。启用限流后，页面能从 HTTP 429 的响应读取 `response.headers.get("Retry-After")`，并提示重试时间。应用层传输加密启用时，按客户端需要把 `X-Client-Id`、`X-Encrypted`、`X-Hai-Transport` 加入请求头名单，把 `X-Encrypted` 和 `X-Hai-Transport` 加入暴露头名单。

<a id="refresh-cookie"></a>

### 刷新 Cookie 的 HTTPS 属性

| 字段 | 类型及约束 | 默认值 | 用途 |
| --- | --- | --- | --- |
| `HAI_SERV_REFRESH_COOKIE_SECURE` | 服务端进程环境变量，接受精确的 `true` 或 `false` | 未设置时由运行环境决定，生产默认启用 | 控制已启用的刷新 Cookie 的 `Secure` 属性。显式 `refreshCookie.secure` 优先。此变量独立于 `HAI_SERV` 整段覆盖。 |

生成的应用只在匹配原生来源且满足其他原生请求条件时才允许原生凭据传输。 [刷新 Cookie 与原生接入](../function/serv.md#authentication)

<a id="refresh-cookie-secure-example"></a>

#### 用 HTTPS 登录并检查刷新 Cookie

若应用已启用 `refreshCookie`，在服务端生产环境保持 `HAI_SERV_REFRESH_COOKIE_SECURE=true`。从同站 HTTPS 页面重新登录后，在浏览器网络面板确认登录或刷新响应的 `Set-Cookie` 带有 `Secure`、`HttpOnly` 和 `SameSite=Strict`。前端使用支持 Cookie 的 API Client，访问令牌到期后由客户端续期。两个完全跨站的域名无法共用这一 Strict Cookie 流程。 [登录、续期与退出](../getting-started/serv.md#orders-console-iam)

<a id="transport"></a>

### 传输加密

| 字段 | 类型及约束 | 默认值 | 用途 |
| --- | --- | --- | --- |
| `transport` | `false` 或对象 | `false` | 对象配置应用层传输加密。应用还需注入服务端密钥环与共享密钥登记存储，并给客户端配置密钥交换地址。 |
| `transport.maxPlaintextBytes` | `"auto"` 或 1024–67108864 的整数，单位为字节 | `"auto"`，普通接口使用 1 MiB | 普通接口请求和响应的 UTF-8 明文上限。 |
| `transport.maxFutureSkewSeconds` | 0–1800 的整数，单位为秒 | `30` | 请求时间戳最多可以领先服务端时钟的秒数。 |
| `transport.maxRequestAgeSeconds` | 1–3600 的整数，单位为秒 | `300` | 从请求签发起最多有效的秒数，包含传输耗时。 |
| `transport.routePlaintextBytes` | 最多 100 项完整路径到上限的映射，单项为 1024–67108864 字节的整数 | 可省略 | 为指定接口设置双向明文上限。使用实际请求路径，`*` 只匹配一个完整段。多个匹配项取最小上限。 |
| `transport.excludePaths` | 以 `/` 开头的完整路径数组 | `[]` | 将路径及其子路径排除在传输加密之外。显式路径规则的 `encryption: required` 优先。 |
| `transport.keyExchangePath` | 从站点根开始的绝对路径 | `"/api/v1/_hai/key-exchange"` | 密钥交换使用的公开 POST 路径。每段只允许英文字母、数字、`_`、`-` 和 `.`，不能使用 `.` 或 `..` 路径段、空段、尾斜杠、百分号编码、查询或片段。 |

使用 HTTPS 发布服务。受管部署在服务端注入非公开环境变量 `HAI_CRYPTO_TRANSPORT_SERVERKEYRING`。启动时先解析并检查密钥环，再初始化缓存和传输登记存储，浏览器只取得公开路径等客户端设置。多个实例使用共享登记存储和一致的时间窗口。 [密钥环配置](crypto.md) · [服务端与浏览器装配](../getting-started/serv.md#orders-console-transport)

<a id="transport-example"></a>

#### 为大响应单独分配传输额度

在已初始化 Crypto 和共享登记存储的 API 服务中，把以下内容写入 `config/_serv.yml`。示例 API 前缀为 `/backend/api`，假设应用在该前缀下发布 JSON 报告导出。为实际已挂载的导出路由填写完整路径。探针继续使用普通 HTTPS 请求。

```yaml schema=@h-ai/serv:ServConfigSchema
http:
  apiPrefix: /backend/api
transport:
  maxPlaintextBytes: auto
  maxFutureSkewSeconds: 60
  maxRequestAgeSeconds: 300
  routePlaintextBytes:
    /backend/api/reports/*/export: 8388608
  keyExchangePath: /backend/api/_hai/key-exchange
  excludePaths: [/health, /ready]
```

把客户端的 `baseUrl` 设为实际 HTTPS 源加 `/backend/api`，并将客户端的 `transport.keyExchangePath` 设为 `/backend/api/_hai/key-exchange`。更改业务前缀时，默认密钥交换路径仍为 `/api/v1/_hai/key-exchange`。确认在 `/backend/api/_hai/key-exchange` 完成密钥交换，普通业务继续使用 1 MiB 上限，导出路由可返回大于 1 MiB 且不超过 8 MiB 的 UTF-8 明文响应。用小于和超过上限的测试数据核对结果，并确认网关容量能容纳加密后的请求。 [客户端接入](../function/api-client.md#client-integration)

<a id="fullstack-key-exchange-example"></a>

#### 通过 Fullstack 网关交换密钥

在 Fullstack 的后端 `config/_serv.yml` 设置如下内容。业务 API 使用 `/backend/api`，密钥交换使用独立的 `/exchange/keys`。公开探针仍使用 `http.health` 配置的路径。

```yaml schema=@h-ai/serv:ServConfigSchema
http:
  apiPrefix: /backend/api
transport:
  keyExchangePath: /exchange/keys
```

使用 Docker SSH Provider 部署时，网关将 `/exchange/keys` 原样转发给 Serv，公开的 `runtime-config.js` 向 Web 客户端提供 `apiBase` 和 `apiKeyExchangePath`。自管网关也应将这条路径和业务前缀转发给同一个后端。用浏览器访问网关域名，确认 `POST /exchange/keys` 返回 200，再检查加密的业务请求到达 `/backend/api` 下的端点。 [Fullstack 部署](../function/deploy.md)

<a id="a2a"></a>

### A2A HTTP 入口

| 字段 | 类型及约束 | 默认值 | 用途 |
| --- | --- | --- | --- |
| `a2a` | `false` 或对象 | `false` | 配置对外发布的 A2A 发现和消息入口；应用还需注入已初始化的处理器。 |
| `a2a.cardPath` | 站点绝对路径 | `/.well-known/agent-card.json` | 返回公开 Agent Card 的 GET 路由。 |
| `a2a.rpcPath` | 与 `cardPath` 不同的站点绝对路径 | `/a2a` | 接收已认证 JSON-RPC 请求的 POST 路由，可返回 SSE。 |

#### 让合作方的程序查询积压订单

用独立路径发布订单助手。下述路径是实际 URL 路径，反向代理需要将它们转发到装配该处理器的宿主。

```yaml schema=@h-ai/serv:ServConfigSchema
a2a:
  cardPath: /.well-known/agent-card.json
  rpcPath: /partners/orders/a2a
```

将 `_ai.yml` 中的 Agent Card URL 设置为 `https://api.orders.example.com/partners/orders/a2a`，在 `a2a.security.apiKey` 声明 `X-Agent-Key` 请求头方案。启动应用时先初始化 AI 和 IAM，注册订单助手执行器，再装配 HTTP 处理器。伙伴密钥通过环境变量 `ORDERS_AGENT_KEY` 传给命令。两个端点使用 HTTPS，保持应用层传输加密关闭。 [A2A](../function/ai.md#a2a)

```sh
orders_origin=https://api.orders.example.com
curl --fail-with-body -sS "$orders_origin/.well-known/agent-card.json"
curl --fail-with-body -sS "$orders_origin/partners/orders/a2a" \
  -H "X-Agent-Key: ${ORDERS_AGENT_KEY:?}" \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":"orders-backlog-1","method":"SendMessage","params":{"message":{"messageId":"orders-backlog-1","role":"ROLE_USER","parts":[{"text":"Summarize the order backlog."}]}}}'
```

发现请求返回公布的 JSON-RPC 地址。调用通过时响应包含 JSON-RPC `result`，缺少或错误密钥应返回 HTTP 401。使用子目录部署时，在两个字段中填写包含该目录的完整请求路径。

<a id="audio"></a>

### 实时语音 WebSocket

| 字段 | 类型及约束 | 默认值 | 用途 |
| --- | --- | --- | --- |
| `audio` | `false` 或对象 | `false` | 为 `serv.listen()` 的 Node 宿主配置实时语音路径。应用需注入语音能力、票据校验及业务授权。 |
| `audio.path` | 站点绝对路径 | `${http.apiPrefix}/ai/audio` | 在同一站点路径进行 WebSocket 升级。显式路径完整保留，即使位于业务前缀之外。 |

#### 在报表页面边说边转写备注

在已有语音模型和一次性票据的订单 API 中，将实时语音挂在 `/voice/orders`。在网关为这个路径启用 WebSocket 转发。

```yaml schema=@h-ai/serv:ServConfigSchema
audio:
  path: /voice/orders
```

用有权编辑审计备注的账号登录，通过票据 API 取得一次性凭据后打开 `wss://api.orders.example.com/voice/orders`。浏览器持续发送麦克风音频，看到文字逐步出现。重复使用同一票据应被拒绝。只需调用一次语音合成或上传录音转写时，可以使用 HTTP 示例中的端点。 [票据与连接示例](../function/serv.md#audio-ticket-example)

Fullstack 托管网关按 Serv 的配置转发 WebSocket，并省略携带一次性票据的升级日志。独立 HTTPS 网关须转发 `Upgrade`；如果外层网关按子目录放行，还须显式放行配置的路径。

<a id="apply-and-verify"></a>

## 生效与核对

重新启动后，从用户实际访问的域名检查健康、认证和业务路由。依次验证代理收到的可信地址、浏览器预检和密钥交换。若改动了网关公开路径或容器探针，同步更新部署配置。 [请求访问策略与真实来源](request-access.md)
