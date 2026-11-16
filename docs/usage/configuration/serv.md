# Serv 配置

[配置手册](README.md)

## 配置入口

生成项目使用 `config/_serv.yml`，配置注册名为 `serv`，环境覆盖前缀为 `HAI_SERV_`。覆盖顺序和无敏感值示例见[运行配置](runtime.md#配置从哪里来)。

宿主把 HTTP、CORS、Transport 配置及运行时依赖交给 `serv.createApp()`，再用 `server.host` 和 `server.port` 启动监听适配器。应用契约、上下文、Cookie、语音连接和认证的运行时参数见 [Serv 工厂参数](http.md#serv-工厂参数与运行时依赖)。访问控制依赖请求进入的实际路径和代理信任设置，传输加密需要服务端密钥与共享状态依赖。

## 配置示例

```yaml schema=@h-ai/serv:ServConfigSchema
server:
  port: 3000
http:
  apiPrefix: /api/v1
  trustedProxies: auto
  access: false
```

## 配置清单

表中的默认值适用于当前配置区块存在时。标为“必填”的字段在使用对应区块或后端时填写。“可省略”表示 Schema 不填充值；如有运行时回退，单独注明。`[]` 表示数组中每一项。

| 配置项                                 | 适用条件 | 默认值/必填                                                                                         | 说明                                                                                                    |
| -------------------------------------- | -------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `server`                               | 通用     | 存在，见子项                                                                                        | HTTP 服务监听设置                                                                                       |
| `server.host`                          | 通用     | `"127.0.0.1"`                                                                                       | HTTP 监听主机名或 IP。可填字符串，至少 1 个字符                                                         |
| `server.port`                          | 通用     | `3000`                                                                                              | HTTP 监听端口。可填整数，1–65535                                                                        |
| `http`                                 | 通用     | 存在，见子项                                                                                        | API 前缀、健康检查、文档及请求访问配置                                                                  |
| `http.trustedProxies`                  | 通用     | `"auto"`                                                                                            | 允许读取转发头的代理 IP/CIDR 列表。`auto` 在普通宿主忽略转发头，仅托管私有 Compose 入口使用私有容器网段 |
| `http.access`                          | 通用     | `false`                                                                                             | 每次请求的路径/IP/时间策略；false 关闭，内联规则与独立 YAML 文件引用不能混用。可填`false` 或 对象       |
| `http.apiPrefix`                       | 通用     | `"/api/v1"`                                                                                         | 业务 HTTP API 的基础路径前缀                                                                            |
| `http.openapi`                         | 通用     | `false`                                                                                             | OpenAPI 端点开关或端点配置。可填`false` 或 对象                                                         |
| `http.openapi.path`                    | 对象形式 | `"/openapi.json"`                                                                                   | 当前 HTTP 功能的端点路径                                                                                |
| `http.docs`                            | 通用     | `false`                                                                                             | HTTP API 文档功能开关或文档访问配置。可填`false` 或 对象                                                |
| `http.docs.path`                       | 对象形式 | `"/docs"`                                                                                           | 当前 HTTP 功能的端点路径                                                                                |
| `http.docs.requireAuth`                | 对象形式 | 省略时不要求认证                                                                                    | 为 `true` 时要求已认证身份才能访问 API 文档                                                             |
| `http.health`                          | 通用     | 存在，见子项                                                                                        | HTTP 健康检查开关或检查配置。可填`false` 或 对象                                                        |
| `http.health.path`                     | 对象形式 | `"/health"`                                                                                         | 当前 HTTP 功能的端点路径                                                                                |
| `http.health.readyPath`                | 对象形式 | `"/ready"`                                                                                          | 服务就绪检查的端点路径                                                                                  |
| `cors`                                 | 通用     | 存在，见子项                                                                                        | 跨域来源、请求头和凭据策略                                                                              |
| `cors.origin`                          | 通用     | 可省略                                                                                              | CORS 允许的 Origin，星号表示任意来源                                                                    |
| `cors.nativeOrigins`                   | 通用     | 可省略                                                                                              | 允许使用原生凭据通道的完整 Origin 列表                                                                  |
| `cors.allowedHeaders`                  | 通用     | `["Authorization", "Content-Type", "X-Requested-With", "X-Hai-Reauthentication", "X-Hai-Terminal"]` | CORS 允许客户端发送的请求头。可填数组（元素为字符串）                                                   |
| `cors.exposedHeaders`                  | 通用     | `[]`                                                                                                | CORS 允许客户端读取的响应头。可填数组（元素为字符串）                                                   |
| `cors.credentials`                     | 通用     | `false`                                                                                             | 是否允许跨域请求携带凭据                                                                                |
| `transport`                            | 通用     | `false`                                                                                             | 传 `false` 关闭，传对象配置密钥协商和传输参数                                                           |
| `transport.maxPlaintextBytes`          | 对象形式 | `"auto"`（运行时推导）                                                                              | 普通业务双向明文上限，显式配置的范围为 1024–67108864 字节。无模块容量需求时使用 1 MiB                   |
| `transport.maxFutureSkewSeconds`       | 对象形式 | `30`                                                                                                | 允许客户端请求时间领先服务器的秒数。可填整数，0–300                                                     |
| `transport.maxRequestAgeSeconds`       | 对象形式 | `300`                                                                                               | 请求从签发起的有效秒数。可填整数，1–600                                                                 |
| `transport.routePlaintextBytes`        | 对象形式 | 可省略                                                                                              | 完整路径段到双向明文字节上限的映射；星号匹配单段，供附件和归档独立容量                                  |
| `transport.routePlaintextBytes.<名称>` | 对象形式 | 必填                                                                                                | 完整路径段到双向明文字节上限的映射；星号匹配单段，供附件和归档独立容量。可填整数，1024–67108864         |
| `transport.keyExchangePath`            | 对象形式 | `"/_hai/key-exchange"`                                                                              | 客户端与服务端约定的密钥交换端点                                                                        |
| `transport.excludePaths`               | 对象形式 | `[]`                                                                                                | 不进入传输加密管道的路径                                                                                |

`access` 的条件字段、文件读取规则及其默认值见 [Core 请求访问策略](core.md#请求访问策略)。

## 生效与核对

监听优先级为有效的 `HOST` / `PORT` 环境覆盖、模块 `server` 配置、`127.0.0.1:3000`。

服务启动后访问健康检查及 `/api/v1` 下的业务路由。改变代理或 Transport 设置后从实际入口复测请求来源、跨域和加密协商。[HTTP、客户端与传输边界](http.md) · [请求访问策略](request-access.md)
