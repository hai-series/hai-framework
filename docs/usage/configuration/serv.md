# Serv 配置

[English](serv.en.md) · [日本語](serv.ja.md)

[配置手册](README.md)

## 配置入口

生成的项目把 HTTP 服务设置放在 `config/_serv.yml`。用环境变量覆盖时使用 `HAI_SERV_` 前缀。见[配置来源和覆盖顺序](runtime.md#配置从哪里来)。

应用启动代码将读取后的 `http`、`cors` 和 `transport` 传给 `serv.createApp()`，然后把返回的 App 与 `server.host`、`server.port` 交给 `serv.listen()` 开始监听。私钥、已连接的存储和认证实例由服务端代码另行传入。 [应用实例、Cookie、语音连接和认证参数](../function/serv.md#host-options)

<a id="configuration-fields"></a>

## 配置清单

默认不启用 OpenAPI、接口文档和应用层加密。例如，省略 `http.docs` 时不提供文档页面。设为 `http.docs: {}` 会启用文档页面并使用默认路径 `/docs`。

| 配置项                                 | 适用条件 | 默认值/必填                                                                                         | 说明                                                                                                                |
| -------------------------------------- | -------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `server`                               | 通用     | `127.0.0.1:3000`                                                                                    | HTTP 服务监听设置                                                                                                   |
| `server.host`                          | 通用     | `"127.0.0.1"`                                                                                       | HTTP 监听主机名或 IP。可填字符串，至少 1 个字符                                                                     |
| `server.port`                          | 通用     | `3000`                                                                                              | HTTP 监听端口。可填整数，1–65535                                                                                    |
| `http`                                 | 通用     | `/api/v1` 加健康检查                                                                                | API 前缀、健康检查、文档及请求访问配置                                                                              |
| `http.trustedProxies`                  | 通用     | `"auto"`                                                                                            | 允许读取转发头的代理 IP/CIDR 列表。`auto` 只在框架部署的私有 Compose 网络信任该网络中的代理。其他部署默认忽略转发头 |
| `http.access`                          | 通用     | `false`                                                                                             | 每次请求的路径/IP/时间策略；false 关闭，内联规则与独立 YAML 文件引用不能混用。可填写 `false` 或一组配置             |
| `http.apiPrefix`                       | 通用     | `"/api/v1"`                                                                                         | 业务 HTTP API 的基础路径前缀                                                                                        |
| `http.openapi`                         | 通用     | `false`                                                                                             | OpenAPI 端点开关或端点配置。可填写 `false` 或一组配置                                                               |
| `http.openapi.path`                    | 对象形式 | `"/openapi.json"`                                                                                   | 当前 HTTP 功能的端点路径                                                                                            |
| `http.docs`                            | 通用     | `false`                                                                                             | HTTP API 文档功能开关或文档访问配置。可填写 `false` 或一组配置                                                      |
| `http.docs.path`                       | 对象形式 | `"/docs"`                                                                                           | 当前 HTTP 功能的端点路径                                                                                            |
| `http.docs.requireAuth`                | 对象形式 | 省略时不要求认证                                                                                    | 为 `true` 时要求已认证身份才能访问 API 文档                                                                         |
| `http.health`                          | 通用     | 默认启用，见下列路径                                                                                | HTTP 健康检查开关或检查配置。可填写 `false` 或一组配置                                                              |
| `http.health.path`                     | 对象形式 | `"/health"`                                                                                         | 当前 HTTP 功能的端点路径                                                                                            |
| `http.health.readyPath`                | 对象形式 | `"/ready"`                                                                                          | 服务就绪检查的端点路径                                                                                              |
| `cors`                                 | 通用     | 省略时使用下列值                                                                                    | 跨域来源、请求头和凭据策略                                                                                          |
| `cors.origin`                          | 通用     | 可省略                                                                                              | CORS 允许的 Origin，星号表示任意来源                                                                                |
| `cors.nativeOrigins`                   | 通用     | 可省略                                                                                              | 允许使用原生凭据通道的完整 Origin 列表                                                                              |
| `cors.allowedHeaders`                  | 通用     | `["Authorization", "Content-Type", "X-Requested-With", "X-Hai-Reauthentication", "X-Hai-Terminal"]` | CORS 允许客户端发送的请求头。可填数组（元素为字符串）                                                               |
| `cors.exposedHeaders`                  | 通用     | `[]`                                                                                                | CORS 允许客户端读取的响应头。可填数组（元素为字符串）                                                               |
| `cors.credentials`                     | 通用     | `false`                                                                                             | 是否允许跨域请求携带凭据                                                                                            |
| `transport`                            | 通用     | `false`                                                                                             | 传 `false` 关闭，传对象配置密钥协商和传输参数                                                                       |
| `transport.maxPlaintextBytes`          | 对象形式 | `"auto"`（运行时推导）                                                                              | 普通业务双向明文上限，显式配置的范围为 1024–67108864 字节。无模块容量需求时使用 1 MiB                               |
| `transport.maxFutureSkewSeconds`       | 对象形式 | `30`                                                                                                | 允许客户端请求时间领先服务器的秒数。可填整数，0–300                                                                 |
| `transport.maxRequestAgeSeconds`       | 对象形式 | `300`                                                                                               | 请求从签发起的有效秒数。可填整数，1–600                                                                             |
| `transport.routePlaintextBytes`        | 对象形式 | 可省略                                                                                              | 完整路径段到双向明文字节上限的映射；星号匹配单段，供附件和归档独立容量                                              |
| `transport.routePlaintextBytes.<名称>` | 对象形式 | 必填                                                                                                | 完整路径段到双向明文字节上限的映射；星号匹配单段，供附件和归档独立容量。可填整数，1024–67108864                     |
| `transport.keyExchangePath`            | 对象形式 | `"/_hai/key-exchange"`                                                                              | 客户端与服务端约定的密钥交换端点                                                                                    |
| `transport.excludePaths`               | 对象形式 | `[]`                                                                                                | 不进入传输加密管道的路径                                                                                            |

`access` 的条件字段、文件读取规则及其默认值见 [Core 请求访问策略](core.md#请求访问策略)。

## 配置示例

```yaml schema=@h-ai/serv:ServConfigSchema
server:
  port: 3000
http:
  apiPrefix: /api/v1
  trustedProxies: auto
  access: false
```

### 允许独立域名的管理台访问 API

写入 `config/_serv.yml`。只允许示例管理台来源读取跨域响应，并允许携带凭据。CORS 不会代替登录或权限检查；如果浏览器使用 Cookie，还需配置匹配的 Cookie 属性。域名换成实际管理台地址。

```yaml schema=@h-ai/serv:ServConfigSchema
server:
  host: 0.0.0.0
  port: 3000
cors:
  origin: https://console.example.com
  credentials: true
```

### 开启接口文档并调整健康检查地址

OpenAPI 文档放在 `/openapi.json`，文档页面放在 `/docs`，健康检查使用 `/healthz` 与 `/readyz`。文档页要求已认证身份，应用需提供真实认证逻辑；健康接口用于部署探活，不代表每个外部业务系统都可用。

```yaml schema=@h-ai/serv:ServConfigSchema
http:
  apiPrefix: /api/v1
  openapi:
    path: /openapi.json
  docs:
    path: /docs
    requireAuth: true
  health:
    path: /healthz
    readyPath: /readyz
```

### 生效与核对

应用解析监听设置时，优先使用有效的 `HOST`、`PORT` 进程变量。没有这些变量则读取 YAML 的 `server`，再未设置则监听 `127.0.0.1:3000`。`serv.listen()` 使用调用时传入的地址和端口。

服务启动后先访问健康检查，再访问 `/api/v1` 下的实际业务接口。修改代理或加密配置后，用浏览器经过真实网关测试，确认服务收到的客户端 IP、允许的浏览器来源和密钥交换地址都符合预期。[HTTP、客户端与传输边界](http.md) · [请求访问策略](request-access.md)
