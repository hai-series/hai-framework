# @h-ai/api-client 配置

<a id="h-aiapi-client-文件配置"></a>

[English](api-client.en.md) · [日本語](api-client.ja.md)

[配置索引](README.md) · [功能说明](../function/api-client.md) · [数据结构](../data/api-client.md)

<a id="configuration-fields"></a>

## 配置入口

`@h-ai/api-client` 没有独立配置文件或环境变量前缀。应用读取自己的运行配置，选择凭据存储和传输方式，再将值传给 `apiClient.init(config)` 或独立实例的 `client.init(config)`。读取顺序与生效时间由应用决定。初始化参数、必填条件和默认值见[调用参数](../function/api-client.md#call-options)。

浏览器登录、刷新失败回调和原地恢复的完整配置见[刷新会话](../function/api-client.md#browser-refresh)和[恢复同一用户](../function/api-client.md#recover-session)。

<a id="configuration-sources"></a>

## 配置归属

| 设置 | 由谁提供 | 接入时核对 |
| --- | --- | --- |
| API 地址 | 前端或运行时配置提供 `baseUrl` | 浏览器与 API 同源时可使用 `/api/v1` 这样的根相对路径。Node.js 或没有浏览器来源的原生运行时使用 HTTP(S) 绝对地址。地址包含 API 挂载前缀，省略用户信息、查询参数和片段。 |
| 刷新凭据 | 客户端选择 `auth.storage`。采用 Cookie 模式时，服务端设置、轮换和清除 HttpOnly Cookie。 | 省略 `auth` 时不启用自动认证，传入 `auth: {}` 时默认使用浏览器 Cookie 模式。跨源部署时核对服务端允许的具体 Origin、凭据和 Cookie 属性。 |
| 应用层加密 | 客户端传入已初始化的 Crypto。服务端管理私钥、密钥协商路由和加密策略。 | 省略客户端 `transport` 时不启用应用层加密。启用时，用 `baseUrl` 的源解析客户端 `transport.keyExchangePath` 得到的地址必须对应服务端协商端点。 |

Serv 的 API 前缀和传输设置可来自应用的 `config/_serv.yml`，由启动代码传给 `serv.createApp`。使用浏览器刷新 Cookie 时在该调用中提供已初始化的 `iam` 和 `refreshCookie`。见 [Serv 配置](serv.md)、[应用装配选项](../function/serv.md#host-options)和 [Serv 认证与 Cookie](../function/serv.md#authentication)。

Kit 应用由 SvelteKit 路由决定挂载地址，通过 Kit 的服务端认证流程处理 Cookie，在 `kit.createHandle` 接入传输加密。见 [Kit 配置](kit.md)、[Kit 认证](../function/kit.md#auth)和 [Kit 传输加密](../function/kit.md#transport)。

<a id="mobile-api-base-example"></a>

## 配置示例

仓库的 `mobile-app` 在本地开发时使用 `PUBLIC_API_BASE` 选择 API 服务。若服务的地址为 `http://localhost:3000/api/v1`，在 `apps/mobile-app/.env.local` 中加入下面一行。换用其他服务时，把协议、主机、端口和 API 前缀一起改为客户端实际可访问的地址。示例来源见 [mobile-app 环境变量模板](../../../apps/mobile-app/.env.example)。

```dotenv
PUBLIC_API_BASE='http://localhost:3000/api/v1'
```

先启动 API 服务，再运行 `pnpm --filter mobile-app dev`。本仓库的 API 服务启动方式见 [api-service 快速开始](../../../apps/api-service/README.md#快速开始)。应用优先使用运行时注入的 `apiBase`，其次读取 Vite 提供的 `PUBLIC_API_BASE`，两者都没有值时使用代码中的 `http://localhost:3000/api/v1`。修改环境文件后重启开发服务，打开开发站点的 `/auth/login`，在浏览器的网络面板确认公开认证配置请求发往 `http://localhost:3000/api/v1/auth/config`。该地址属于客户端可见配置。把服务端凭据留在服务端。见 [mobile-app 客户端初始化](../../../apps/mobile-app/src/lib/api.ts)。
