# HTTP、客户端与传输边界

[配置手册](README.md) · [前后端接入操作](../development/frontend-backend.md)

本页只列 HTTP 服务实际读取的 `_serv.yml`、`_kit.yml` 和环境文件设置。服务端工厂、认证回调与客户端参数见各模块功能页。

## Serv监听和路由

应用的启动代码读取 `config/_serv.yml`，把路由设置传给 `serv.createApp()`，再把地址和端口传给 `serv.listen()`。应用解析监听设置时，有效的 `HOST` 和 `PORT` 优先于文件中 `server` 的值。例如 `PORT=8080` 使用 8080，`PORT=abc` 会被忽略。

监听、路由和默认值见 [Serv 配置清单](serv.md#配置清单)。生产入口的代理路径、应用 `http.apiPrefix` 与客户端 `baseUrl` 需要一致。

容器部署的后端探针按最终有效的 `http.health.path` 请求，`health: false` 时跳过该 HTTP 探针。Fullstack 同源入口转发实际启用的健康/就绪路径、OpenAPI JSON、docs 和文档目录下的 `_hai/scalar.js`；生产模板按实际 Core 环境关闭文档，代理不绕过 `docs.requireAuth`。同来源以整段 `HAI_SERV` 为基础、细项覆盖；更高来源的整段替换才清除低来源细项，来源优先级见 [运行时配置](runtime.md)。改变路径或文档路由后需重新部署，以同步 Nginx 和部署探针；普通业务配置仍可修改运行文件后重启后端。

文档 HTML 使用相对的脚本和 spec 地址。网关保留 `/somepath/` 时，将 docs 与 OpenAPI 路径一起放在此目录下，例如 `/somepath/docs` 和 `/somepath/openapi.json`；脚本自动位于 `/somepath/_hai/scalar.js`，不会请求其他应用的根路径。网关剥离此前缀时，后端仍可使用 `/docs` 和 `/openapi.json`，浏览器的相对请求同样保留外部前缀。不要只转发页面而漏掉同目录下的资源；文档带尾斜杠时脚本挂在该文档目录内部。

```yaml schema=@h-ai/serv:ServConfigSchema
server: { host: 0.0.0.0, port: 3000 }
http:
  apiPrefix: /api/v1
  trustedProxies: auto
  access: false
  health: { path: /health, readyPath: /ready }
  openapi: false
  docs: false
transport: false
```

默认健康入口为 `/health`；文档未启用时，`/docs` 返回 `404`。自定义路径后，用实际请求检查对应入口。

## CORS与可信代理

跨源 Cookie 需要允许实际浏览器来源并启用 `cors.credentials`，按需放行原生来源和自定义请求头。[Serv](serv.md#配置清单) 与 [Kit](kit.md#配置清单) 都能配置可信代理，具体入口传递地址的方式见[请求访问策略](request-access.md)。

```yaml schema=@h-ai/serv:ServConfigSchema
http:
  trustedProxies: [192.0.2.10]
cors:
  origin: https://app.example.invalid
  credentials: true
  allowedHeaders: [Authorization, Content-Type, X-Requested-With, X-Hai-Reauthentication, X-Hai-Terminal]
  exposedHeaders: []
```

替换文档代理地址后，从允许和拒绝来源分别发预检及真实请求，再验证Cookie和服务端权限。CORS只是浏览器跨源约束，不阻止脚本/后端直接请求；不能作为资源权限守卫。

示例和模板统一向 IAM、审计、限流和业务传递可信地址。受管 Nginx 用经过确认的 remote_addr 覆盖 XFF 和 X-Real-IP；外层负载均衡需显式配置 `provider.trustedEdgeProxies`。rootless 网络是否保留原始地址必须实测，条件和独立文件部署见[真实 IP 与请求策略](request-access.md#3-运维人员先确认真实-ip-的来源)。

## 生产 HTTP 入口的 Serv 刷新 Cookie

Serv 在生产默认给刷新 Cookie 加 `Secure`。使用受控内网或 VPN 的 HTTP 入口时，可在项目所用的 `.env.prod.local` 中设置以下值，然后用更新后的后端重新部署。将示例 Origin 替换为浏览器实际使用的地址和端口。

```dotenv
HAI_CORE_ENV=production
HAI_SERV_CORS_ORIGIN=http://192.0.2.10:12348
HAI_SERV_REFRESH_COOKIE_SECURE=false
```

仅在工厂没有显式设置 `refreshCookie.secure` 时，该变量由后端进程独立读取；同名变量可以覆盖，`HAI_SERV` 父 JSON 不影响它。`false` 省略 `Secure`，`true` 强制添加，留空或省略时沿用环境默认值。工厂硬写 `secure: true` 时，仅修改环境变量不会关闭 Secure。容器部署会拒绝其他值。部署后可通过归档 `APPLY.txt` 的变量名清单确认打包输入。生产安全策略仍要求明确的 CORS 来源并关闭 API 文档。`HttpOnly`、`SameSite=Strict` 和刷新路径限制继续生效，HTTP 会明文传输刷新凭据。

重新登录后，在浏览器网络面板确认登录响应的刷新 Cookie 省略了 `Secure`。重载页面时，确认 `POST /api/v1/auth/refresh` 携带该 Cookie、返回 `200` 并恢复登录。切回 HTTPS 时移除变量或设为 `true`，同步实际 HTTPS Origin，再重新登录确认 Cookie 带 `Secure`。

## Kit、Cookie与请求上下文

Kit 的 YAML 字段与默认值见 [Kit 配置清单](kit.md#配置清单)。

`config/_kit.yml` 和 `config/_serv.yml` 都在 `http` 下设置 `trustedProxies` 和 `access`。Kit 在 `hooks.server.ts` 调用 `kit.createHandle({ http, transport })` 时还可传入认证、Cookie、限流和请求处理函数。

SvelteKit 子目录的构建设置与 basePath 传递见 [Kit 接入](../function/kit.md#host-options)。

```yaml schema=@h-ai/kit:KitConfigSchema
server: { host: 127.0.0.1, port: 3000 }
transport: false
```

使用项目现有 hooks 和标准 procedures，浏览器认证沿用HttpOnly Cookie/内存 `access` `token`流程。生产Cookie需适配HTTPS、`sameSite`、`path`和实际同源/跨源拓扑；不能把完整Token放`localStorage`。SSR locale 用 `runWithLocale` 包裹实际异步resolve，不能给每个请求改进程全局语言。限流store必须支持原子操作，生产使用共享后端。具体factory参数见[Kit公开说明](../../../packages/kit/README.md)。

## 加密传输与容量

在 `_serv.yml` 或 `_kit.yml` 中设置传输路径、大小和时间窗口；密钥环、registry 与客户端实例由代码接入，见[调用参数](../function/crypto.md#call-options)。HTTPS 负责网络身份与通道保护。

Serv、Kit 和 API Client 都使用从站点根开始的 `transport.keyExchangePath`，默认 `/api/v1/_hai/key-exchange`。例如 Serv 的 `http.apiPrefix` 为 `/backend/api` 时，服务端和客户端可同时把 `transport.keyExchangePath` 设为 `/backend/api/_hai/key-exchange`，客户端 `baseUrl` 仍包含协议、主机和业务前缀。明文预算按 UTF-8 字节计量，使用 `routePlaintextBytes` 为附件等大材料按完整路径段预算。[Serv](serv.md#配置清单) · [Kit](kit.md#配置清单) · [API Client 调用参数](../function/api-client.md#call-options) · [Crypto 调用参数](../function/crypto.md#call-options)

```yaml schema=@h-ai/serv:ServConfigSchema
transport:
  maxPlaintextBytes: auto
  maxFutureSkewSeconds: 30
  maxRequestAgeSeconds: 300
  routePlaintextBytes:
    /api/v1/feedback/*/attachments: 8388608
  keyExchangePath: /api/v1/_hai/key-exchange
  excludePaths: [/health, /ready]
```

用不含敏感信息的小请求测试浏览器能否完成握手并读取响应，再发送超出大小上限的请求，确认服务端拒绝。上传反馈附件时，反向代理和加密路由的大小上限都应能容纳这条请求。服务端从私有变量读取密钥列表。多台服务换钥时保留旧密钥一段时间，让已有会话有机会完成，再验证重启后的老会话和新会话。

### 时间不同步时的提示与恢复

在服务端 `_serv.yml` 或 `_kit.yml` 的 `transport` 中设置时间窗口，重启后生效。`maxFutureSkewSeconds` 控制请求时间可以领先服务器多少秒，范围为 0～1800，默认 30。`maxRequestAgeSeconds` 控制请求从签发起多久过期，范围为 1～3600，默认 300。两项均为整数秒，网络和服务端处理耗时计入请求有效期。

各节点使用同步时钟和一致配置。共享注册表将防重放记录保留至签发时间后 61 分钟。启用更长有效期前，按[防重放记录的升级说明](../data/crypto.md#replay-window-upgrade)完成所有节点的升级并等待旧请求过期。

超出窗口时，前端提示显示服务端校验时的 UTC 时间。请开启设备的自动校时或手工修改时间，然后刷新重试。若仍失败，请联系管理员检查服务器时间。服务端时间来自已认证的加密错误；未提供可信时间值时，前端只显示校时建议。

![390像素宽度下的校时提示与刷新入口](../images/transport-clock-skew-mobile.png)

在示例的默认窗口下，浏览器测试分别模拟设备时间快、慢 10 分钟。校正设备时间后，由用户点击刷新，登录表单重新出现，提示清除。

## 代码接入入口

配置文件只控制 HTTP 路径、预算与时间窗口。服务端还需在代码中注入密钥环和缓存 registry，客户端按接口地址创建会话，见 [Crypto 调用参数](../function/crypto.md#call-options)、[Serv 工厂参数](../function/serv.md#host-options)、[Kit Hooks 参数](../function/kit.md#host-options)和 [API Client](../function/api-client.md#client-integration)。缓存连接写在 `_cache.yml`，公钥 TTL 与共享分钟配额属于 registry 工厂的参数。

<a id="serv-工厂参数与运行时依赖"></a>

相关调用说明已移至[功能参考](../function/serv.md#host-options)。

<a id="serv-语音连接的授权与预算"></a>

相关调用说明已移至[功能参考](../function/serv.md#audio-options)。

<a id="hooks-参数与运行时依赖"></a>

相关调用说明已移至[功能参考](../function/kit.md#host-options)。

<a id="api客户端地址期限和恢复"></a>

相关调用说明已移至[功能参考](../function/api-client.md#client-integration)。

<a id="浏览器版本过低时的提示"></a>

相关调用说明已移至[功能参考](../function/crypto.md#browser-support)。
