# Kit 配置

[English](kit.en.md) · [日本語](kit.ja.md)

[配置手册](README.md)

## 配置入口

生成的项目把 Kit 设置放在 `config/_kit.yml`。用环境变量覆盖时使用 `HAI_KIT_` 前缀。见[配置来源和覆盖顺序](runtime.md#配置从哪里来)。

应用启动代码读取 `server` 中的地址和端口，用它们启动 SvelteKit 的 HTTP 服务。在 SvelteKit 的服务端请求入口（通常是 `hooks.server.ts`）中，应用把请求访问策略传给 `kit.createHandle()`，启用加密时再把 YAML 的 `transport` 设置传给 `crypto.transport`。Cookie 属性、私钥和已连接的存储实例也在这段服务端代码中传入。 [Hooks 参数](../function/kit.md#host-options)

## 配置示例

```yaml schema=@h-ai/kit:KitConfigSchema
server:
  port: 3000
trustedProxies: auto
access: false
```

## 配置清单

默认不启用 `transport`。设置为 `false` 或省略，Kit 就不会为业务请求启用应用层加密。启用加密后，未填写的协商路径使用 `/api/_hai/key-exchange`，还需要服务端提供配套密钥和共享存储。

| 配置项                                 | 适用条件 | 默认值/必填                | 说明                                                                                                                |
| -------------------------------------- | -------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `server`                               | 通用     | `127.0.0.1:3000`           | HTTP 服务监听设置                                                                                                   |
| `server.host`                          | 通用     | `"127.0.0.1"`              | HTTP 监听主机名或 IP。可填字符串，至少 1 个字符                                                                     |
| `server.port`                          | 通用     | `3000`                     | HTTP 监听端口。可填整数，1–65535                                                                                    |
| `transport`                            | 通用     | `false`                    | 传 `false` 关闭，传对象配置密钥协商和传输参数                                                                       |
| `transport.maxPlaintextBytes`          | 对象形式 | `"auto"`（运行时推导）     | 普通业务双向明文上限，显式配置的范围为 1024–67108864 字节。无模块容量需求时使用 1 MiB                               |
| `transport.maxFutureSkewSeconds`       | 对象形式 | `30`                       | 允许客户端请求时间领先服务器的秒数。可填整数，0–300                                                                 |
| `transport.maxRequestAgeSeconds`       | 对象形式 | `300`                      | 请求从签发起的有效秒数。可填整数，1–600                                                                             |
| `transport.routePlaintextBytes`        | 对象形式 | 可省略                     | 完整路径段到双向明文字节上限的映射；星号匹配单段，供附件和归档独立容量                                              |
| `transport.routePlaintextBytes.<名称>` | 对象形式 | 必填                       | 完整路径段到双向明文字节上限的映射；星号匹配单段，供附件和归档独立容量。可填整数，1024–67108864                     |
| `transport.keyExchangePath`            | 对象形式 | `"/api/_hai/key-exchange"` | 客户端与服务端约定的密钥交换端点                                                                                    |
| `transport.excludePaths`               | 对象形式 | `[]`                       | 不进入传输加密管道的路径                                                                                            |
| `trustedProxies`                       | 通用     | `"auto"`                   | 允许读取转发头的代理 IP/CIDR 列表。`auto` 只在框架部署的私有 Compose 网络信任该网络中的代理。其他部署默认忽略转发头 |
| `access`                               | 通用     | `false`                    | 每次请求的路径/IP/时间策略；false 关闭，内联规则与独立 YAML 文件引用不能混用。可填写 `false` 或一组配置             |

`access` 的条件字段、文件读取规则及其默认值见 [Core 请求访问策略](core.md#请求访问策略)。

## 生效与核对

应用解析监听设置时，优先使用有效的 `HOST`、`PORT` 进程变量。没有这些变量则读取 YAML 的 `server`，再未设置则监听 `127.0.0.1:3000`。

请求处理函数在调用 `kit.createHandle()` 时读取配置。修改配置后重新启动服务，再从用户实际访问的入口检查 Cookie 是否正常、来自代理的 IP 是否正确、受保护路由能否拒绝不合条件的请求。启用加密后还应验证客户端能完成密钥协商。[Kit、Cookie 与请求上下文](http.md#kitcookie与请求上下文) · [请求访问策略](request-access.md)
