# @h-ai/kit 配置

[English](kit.en.md) · [日本語](kit.ja.md)

[配置手册](README.md) · [功能说明](../function/kit.md) · [数据结构](../data/kit.md) · [订单运营台教程](../getting-started/kit.md#quick-start)

## 配置入口

CLI 生成的 SvelteKit 服务通过 Core 加载 `config/_kit.yml` 并用 `KitConfigSchema` 校验。在 `hooks.server.ts` 中，应用将 `http`、`cors` 和启用的 `transport` 交给 `kit.createHandle()`。启用 A2A 时还需注入 AI 协议处理器和认证。密钥环和共享密钥登记存储由服务端代码提供，浏览器只接收所需的公开传输设置。 [Hooks 参数](../function/kit.md#host-options)

通过 Core 加载时，`HAI_KIT_<字段路径>` 可以覆盖 YAML。例如 `HAI_KIT_HTTP_TRUSTEDPROXIES` 对应 `http.trustedProxies`，`HAI_KIT_TRANSPORT_MAXREQUESTAGESECONDS` 对应 `transport.maxRequestAgeSeconds`。同一来源先用整段配置，再用细项覆盖。进程环境优先于模式私有、全局私有、模式公共和基础环境文件。参数能否生效取决于应用如何加载并传入配置。 [配置来源和覆盖顺序](runtime.md#配置从哪里来)

示例管理台的 `_kit.yml` 显式绑定了代理、访问策略、监听和传输参数。生成的 SvelteKit 模板按启用的功能配置传输，用 Core 和 Schema 识别 `HAI_KIT_` 覆盖。生成项目的 `pnpm start` 使用 adapter-node，它直接读取 `HOST` 和 `PORT`，默认为 `0.0.0.0:3000`。自定义 Node 启动器可以使用解析后的 `server` 设置。修改后重启服务。

<a id="configuration-fields"></a>

## 配置清单

<a id="listening"></a>

### 监听

| 字段 | 类型及约束 | 默认值 | 用途 |
| --- | --- | --- | --- |
| `server` | 对象，可省略 | `{ host: "127.0.0.1", port: 3000 }` | 解析后的 HTTP 监听地址和端口，由自定义启动器使用。 |
| `server.host` | 非空字符串 | `"127.0.0.1"` | 主机名或 IP。解析时优先使用非空的 `HOST`。 |
| `server.port` | 1–65535 的整数 | `3000` | TCP 端口。解析时优先使用有效的 `PORT`。 |

<a id="local-listening-example"></a>

#### 在本机启动服务

生成项目通过 adapter-node 启动。构建后运行 `HOST=127.0.0.1 PORT=4100 pnpm start`，再访问 `http://127.0.0.1:4100` 下已挂载的应用路由。

使用自定义启动器时，把以下设置写入 `config/_kit.yml`，再将解析出的 `server` 传给 HTTP 监听函数。非空的 `HOST` 和有效的 `PORT` 仍优先。

```yaml schema=@h-ai/kit:KitConfigSchema
server:
  host: 127.0.0.1
  port: 4100
```

<a id="request-access"></a>

### 可信代理与请求访问

| 字段 | 类型及约束 | 默认值 | 用途 |
| --- | --- | --- | --- |
| `http` | 对象，可省略 | 可信代理、请求访问和限流的默认值见下表及后续章节。 | 可信代理、请求访问与限流设置。 |
| `http.trustedProxies` | `"auto"` 或最多 1000 项 IPv4／IPv6 地址或 CIDR 数组 | `"auto"` | 只接收可信代理提供的转发地址。`auto` 只在框架管理的私有 Compose 网络里信任容器网段。其他部署默认忽略转发头。`[]` 显式忽略转发头。 |
| `http.access` | `false`、内联策略对象或独立文件对象 | `false` | 按完整路径、方法、可信客户端 IP 和时间检查请求。内联策略与文件引用不能混用。 |
| `http.access.file` | 指向普通 `.yml`／`.yaml` 文件的路径，最多 4096 字符 | 文件对象必填 | 相对路径以服务进程的工作目录为基准。装配请求处理器时读取一次，文件最大 1 MiB。 |
| `http.access.global` | 内联条件对象 | 可省略 | 应用于交给当前宿主处理的所有请求，包括健康检查。 |
| `http.access.rules` | 最多 1000 条路径规则的数组 | `[]` | 请求必须通过全局条件和所有匹配规则。`encryption` 可对匹配的方法和路径指定传输加密要求。 |

日历、IP 列表、路径匹配、HTTP 方法和加密模式的完整字段与限制见 [Core 请求访问策略](core.md#request-access)。Serv 使用同样的策略，在 `_serv.yml` 的 `http` 下读取。 [Serv 请求访问](serv.md#request-access)

页面数据请求还会按对应的页面路径检查访问条件。例如，对 `/console/reports` 的限制同样保护该页面的数据请求。

<a id="trusted-proxy-example"></a>

#### 只向合作方网段开放报告

合作方通过反向代理读取订单运营台的外部报告。在对应配置文件的 `http` 中合入以下设置。代理的连接地址为 `192.0.2.10`，合作方网段为 `203.0.113.0/24`。部署时替换为真实值。

```yaml schema=@h-ai/kit:KitConfigSchema
http:
  trustedProxies: [192.0.2.10]
  access:
    rules:
      - id: partner-reports
        paths: [/api/v1/external/reports]
        methods: [GET]
        allowIps: [203.0.113.0/24]
```

从允许的网段经代理请求 `GET /api/v1/external/reports`，预期 HTTP 200。换成其他网段，预期 HTTP 403。若应用挂载在子目录，规则使用包含前缀的完整请求路径。需要限制探针时，另行配置探针路径或全局规则。 [合作方报告接入](../getting-started/kit.md#orders-console-access)

<a id="time-window-example"></a>

#### 让审计员在工作时间查看报告

将这条规则加到 `http.access.rules`，使用订单运营台的实际报告路径。上海时区周一至周五从 09:00 开始放行，18:00 起拒绝。同一报告路由继续执行已有的角色和权限检查。

```yaml schema=@h-ai/kit:KitConfigSchema
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

应用将解析出的限流设置与原子计数存储一起传给请求入口。单进程开发可用内存存储。多实例使用同一 Redis、命名空间、时长和额度。默认按可信客户端 IP 计数，无法识别地址的请求共享 `unknown` 计数。存储故障返回 HTTP 503。 同一可信 IP 发出的请求共享配额。普通应用路由与密钥交换都计数，CORS 预检不消耗配额。通过 Hook 的应用自定义健康端点也会计数。

若要按当前登录账号设置独立的限额，在宿主入口用代码注入限流键。YAML 只读取窗口和额度。

<a id="rate-limit-config-example"></a>

#### 限制同一客户端的请求频率

把以下配置写入 `config/_kit.yml`。示例让同一可信客户端在 10 秒内通过两次检查。自管反向代理可在同一 `http` 对象填入实际代理的 IP 或 CIDR。

```yaml schema=@h-ai/kit:KitConfigSchema
http:
  rateLimit:
    windowMs: 10000
    maxRequests: 2
```

可用 `HAI_KIT_HTTP_RATELIMIT` 覆盖整项，也可用 `HAI_KIT_HTTP_RATELIMIT_WINDOWMS` 和 `HAI_KIT_HTTP_RATELIMIT_MAXREQUESTS` 覆盖子字段。

启动订单运营台后，在 10 秒内从同一来源连续请求 `GET /api/v1/status` 三次。前两次返回 200，剩余额度为 1、0，第三次返回 429。等待 `Retry-After` 指示的秒数后再试，应恢复为 200。使用实际绑定的地址和部署前缀。 [配置和启动示例](../getting-started/kit.md#orders-console-access)

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

启用后，Kit 默认加密已挂载的契约 API、应用基路径下的 `/api/*` 和 SvelteKit 页面数据请求。密钥交换使用单独的 HTTPS POST，交换请求使用协议 JSON。订单运营台将报告契约挂载到 `/console/reports` 时，浏览器安装传输层也使用相同的完整前缀。 [加密自定义前缀下的报告](../function/kit.md#kit-custom-contract-transport)

若 SvelteKit 挂载在 `/console`，将 `transport.keyExchangePath` 显式设为 `/console/api/v1/_hai/key-exchange`。生成项目会为 `excludePaths` 和 `routePlaintextBytes` 补上缺少的构建基路径。访问策略中的规则始终填写实际请求路径。 [传输配置与子目录接入](../function/kit.md#host-options) · [Serv 密钥交换地址](serv.md#transport)

使用 HTTPS 发布服务。受管部署在服务端注入非公开环境变量 `HAI_CRYPTO_TRANSPORT_SERVERKEYRING`。启动时先解析并检查密钥环，再初始化缓存和传输登记存储，浏览器只取得公开路径等客户端设置。多个实例使用共享登记存储和一致的时间窗口。 [密钥环配置](crypto.md) · [服务端与浏览器装配](../getting-started/kit.md#orders-console-transport)

<a id="transport-example"></a>

#### 为大响应单独分配传输额度

在已启用 Crypto、共享登记存储和客户端传输的 SvelteKit 项目中，把以下内容写入 `config/_kit.yml`。假设应用部署在 `/console` 下，并发布 JSON 报告导出和公开探针。将路径替换成实例的实际地址。

```yaml schema=@h-ai/kit:KitConfigSchema
transport:
  maxPlaintextBytes: auto
  maxFutureSkewSeconds: 60
  maxRequestAgeSeconds: 300
  routePlaintextBytes:
    /console/api/reports/*/export: 8388608
  keyExchangePath: /console/api/v1/_hai/key-exchange
  excludePaths: [/console/api/health]
```

确认浏览器向同一 HTTPS 源的 `/console/api/v1/_hai/key-exchange` 请求密钥交换。普通业务继续使用 1 MiB 上限，导出路由可返回大于 1 MiB 且不超过 8 MiB 的 UTF-8 明文响应。用小于和超过上限的测试数据核对结果，并确认网关容量能容纳加密后的请求。

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

CORS 启用且路径匹配时，宿主为带 `Origin` 和 `Access-Control-Request-Method` 的 OPTIONS 请求处理预检。通过请求访问策略后返回 204，这类预检不消耗限流额度。其余 OPTIONS 适用同一套访问、限流和传输规则，由应用路由处理。

<a id="cors-example"></a>

#### 让订单运营台读取另一个来源的 API

页面在 `https://console.orders.example.com`，API 在 `https://api.orders.example.com`。将下面配置加到应用对应的 YAML，并替换成页面实际使用的 Origin。这两个站点地址示例共享站点，浏览器可以按会话 Cookie 自己的属性判断是否携带凭据。

```yaml schema=@h-ai/kit:KitConfigSchema
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

<a id="cors-multipart"></a>

#### 允许受信任的运营台上传订单附件

生产构建的 SvelteKit 在 `kit.createHandle()` 前检查跨源表单请求的 Origin。即使 OPTIONS 预检通过，未在 SvelteKit 的 `csrf.trustedOrigins` 列出的来源也会在上传时收到 HTTP 403。这个名单针对应用的表单提交，`cors.paths` 则限定 Kit 处理 CORS 的范围。

在订单 API 的 `vite.config.ts` 中，把下列字段合入现有的 `sveltekit({...})` 配置，并重新构建。使用 `svelte.config.js` 的应用将相同的 `csrf` 对象放在 `kit` 下。仅列出受信任页面的完整 HTTPS Origin。

```ts
sveltekit({
  csrf: { trustedOrigins: ['https://console.orders.example.com'] },
})
```

在 `config/_kit.yml` 中为附件端点配置 CORS。若同时启用了框架传输加密，使用以下请求规则明确允许该 POST 通过 HTTPS 传输 multipart。将 `http` 和 `cors` 传给 `kit.createHandle()`，通过契约处理器挂载上传操作、请求体上限和文件归属授权。 [文件中转装配](../function/serv.md#storage-transfer-procedures-api)

```yaml schema=@h-ai/kit:KitConfigSchema
http:
  access:
    rules:
      - id: order-attachment-upload
        paths: [/api/v1/storage/files/upload]
        methods: [POST]
        encryption: disabled
cors:
  origin: https://console.orders.example.com
  paths: [/api/v1/storage/files/upload]
  methods: [POST]
  allowedHeaders: [Authorization, Content-Type]
```

从运营台页面调用下列函数。传入登录后取得的 Bearer 令牌、服务端授权的对象 `key` 和用户选择的 `file`。浏览器生成带 boundary 的 `Content-Type`。

```ts
async function uploadAttachment(file: File, key: string, accessToken: string) {
  const body = new FormData()
  body.set('key', key)
  body.set('file', file)
  return fetch('https://api.orders.example.com/api/v1/storage/files/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  })
}
```

在生产构建的两个 HTTPS 来源上验证 OPTIONS 返回 204，合法上传返回 `success: true`，使用另一来源的表单 POST 返回 403。未知来源不取得 CORS 授权时，到 API 的 HTTP 响应可在网络面板或服务端日志确认。

<a id="cookie-environment"></a>

### Cookie 加密

| 字段 | 类型及约束 | 默认值 | 用途 |
| --- | --- | --- | --- |
| `HAI_KIT_COOKIE_KEY` | 服务端进程环境变量，32 个十六进制字符 | 可省略。如果指定了要加密的 Cookie 且代码未注入密钥，则必填 | 为 `kit.createHandle()` 中选定的 Cookie 提供加密密钥。显式 `crypto.cookieEncryptionKey` 优先。 |

认证 Cookie 的属性由认证接入代码设置。 [Hooks 参数](../function/kit.md#host-options)

<a id="cookie-encryption-example"></a>

#### 加密应用偏好 Cookie

在 `hooks.server.ts` 中初始化 Crypto，并将应用用于保存订单偏好的 `order_preferences` 加入 `crypto.encryptedCookies`。沿用应用已有的 Cookie 名称。以下命令使用 OpenSSL 生成一把本地测试密钥，并在同一个 Shell 中启动已构建的应用。 [订单偏好 Cookie 的 Hook 示例](../function/kit.md#orders-console-cookie)

```bash
export HAI_KIT_COOKIE_KEY="$(openssl rand -hex 16)"
pnpm start
```

保存一次订单偏好。在浏览器的网络面板中，确认响应的 `Set-Cookie` 中 `order_preferences` 的值经 URL 解码后以 `enc:v2:` 开头。重新加载页面，确认应用能读回已保存的偏好。生产环境通过服务端的密钥管理注入固定密钥，让同一环境的实例使用同一个值。

<a id="a2a"></a>

### A2A HTTP 入口

| 字段 | 类型及约束 | 默认值 | 用途 |
| --- | --- | --- | --- |
| `a2a` | `false` 或对象 | `false` | 配置对外发布的 A2A 发现和消息入口；应用还需注入已初始化的处理器。 |
| `a2a.cardPath` | 站点绝对路径 | `/.well-known/agent-card.json` | 返回公开 Agent Card 的 GET 路由。 |
| `a2a.rpcPath` | 与 `cardPath` 不同的站点绝对路径 | `/a2a` | 接收已认证 JSON-RPC 请求的 POST 路由，可返回 SSE。 |

#### 让合作方的程序查询积压订单

用独立路径发布订单助手。下述路径是实际 URL 路径，反向代理需要将它们转发到装配该处理器的宿主。

```yaml schema=@h-ai/kit:KitConfigSchema
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

<a id="apply-and-verify"></a>

## 生效与核对

重新启动后，从用户实际访问的域名检查认证 Cookie 和业务路由。依次验证代理收到的可信地址、对不符合条件的请求是否返回拒绝，以及启用加密时的密钥交换。 [请求访问策略与真实来源](request-access.md)
