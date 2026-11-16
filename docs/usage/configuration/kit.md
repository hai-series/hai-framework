# Kit 配置

[配置手册](README.md)

## 配置入口

生成项目使用 `config/_kit.yml`，配置注册名为 `kit`，环境覆盖前缀为 `HAI_KIT_`。覆盖顺序和无敏感值示例见[运行配置](runtime.md#配置从哪里来)。

`KitConfigSchema` 提供监听、加密和请求访问设置，宿主按用途传给 SvelteKit 监听适配器和 `kit.createHandle()`。Cookie 属性和后端实例属于宿主装配参数。[Hooks 参数](http.md#hooks-参数与运行时依赖)

## 配置示例

```yaml schema=@h-ai/kit:KitConfigSchema
server:
  port: 3000
trustedProxies: auto
access: false
```

## 配置清单

表中的默认值适用于当前配置区块存在时。标为“必填”的字段在使用对应区块或后端时填写。“可省略”表示 Schema 不填充值；如有运行时回退，单独注明。`[]` 表示数组中每一项。

| 配置项                                 | 适用条件 | 默认值/必填                | 说明                                                                                                    |
| -------------------------------------- | -------- | -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `server`                               | 通用     | 存在，见子项               | HTTP 服务监听设置                                                                                       |
| `server.host`                          | 通用     | `"127.0.0.1"`              | HTTP 监听主机名或 IP。可填字符串，至少 1 个字符                                                         |
| `server.port`                          | 通用     | `3000`                     | HTTP 监听端口。可填整数，1–65535                                                                        |
| `transport`                            | 通用     | `false`                    | 传 `false` 关闭，传对象配置密钥协商和传输参数                                                           |
| `transport.maxPlaintextBytes`          | 对象形式 | `"auto"`（运行时推导）     | 普通业务双向明文上限，显式配置的范围为 1024–67108864 字节。无模块容量需求时使用 1 MiB                   |
| `transport.maxFutureSkewSeconds`       | 对象形式 | `30`                       | 允许客户端请求时间领先服务器的秒数。可填整数，0–300                                                     |
| `transport.maxRequestAgeSeconds`       | 对象形式 | `300`                      | 请求从签发起的有效秒数。可填整数，1–600                                                                 |
| `transport.routePlaintextBytes`        | 对象形式 | 可省略                     | 完整路径段到双向明文字节上限的映射；星号匹配单段，供附件和归档独立容量                                  |
| `transport.routePlaintextBytes.<名称>` | 对象形式 | 必填                       | 完整路径段到双向明文字节上限的映射；星号匹配单段，供附件和归档独立容量。可填整数，1024–67108864         |
| `transport.keyExchangePath`            | 对象形式 | `"/api/_hai/key-exchange"` | 客户端与服务端约定的密钥交换端点                                                                        |
| `transport.excludePaths`               | 对象形式 | `[]`                       | 不进入传输加密管道的路径                                                                                |
| `trustedProxies`                       | 通用     | `"auto"`                   | 允许读取转发头的代理 IP/CIDR 列表。`auto` 在普通宿主忽略转发头，仅托管私有 Compose 入口使用私有容器网段 |
| `access`                               | 通用     | `false`                    | 每次请求的路径/IP/时间策略；false 关闭，内联规则与独立 YAML 文件引用不能混用。可填`false` 或 对象       |

`access` 的条件字段、文件读取规则及其默认值见 [Core 请求访问策略](core.md#请求访问策略)。

## 生效与核对

监听优先级为有效的 `HOST` / `PORT` 环境覆盖、模块 `server` 配置、`127.0.0.1:3000`。

Hook 在构造时读取配置。改动安全选项后重建 Hook 并从实际 HTTP 入口核对 Cookie、受信转发地址、路径保护和密钥交换。[Kit、Cookie 与请求上下文](http.md#kitcookie与请求上下文) · [请求访问策略](request-access.md)
