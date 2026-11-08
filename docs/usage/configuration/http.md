# HTTP、客户端与传输边界

[配置手册](README.md) · [前后端接入操作](../development/frontend-backend.md)

先区分独立 Serv 和 SvelteKit/Kit。Serv 负责 Node API 的监听与路由，Kit 适配 SvelteKit 宿主；浏览器 API Client 还需要自己的地址和认证配置。把服务端 YAML 复制到客户端不会自动接通。

## Serv监听和路由

位置：`config/_serv.yml`，宿主校验后传 `serv.createApp`/`serv.listen`。提供合法 HOST/PORT 进程变量时优先于 `server` 配置，非法 PORT 被忽略并回退；不要依赖这种回退隐藏部署配置错误。

| 项 | 框架默认 | 影响 |
| --- | --- | --- |
| `server`.`host`/`port` | 127.0.0.1/3000 | 本机回环；容器通常明确监听0.0.0.0，暴露端口不代表已做认证 |
| `http.apiPrefix` | /api/v1 | 无末尾斜杠的合法绝对路径，可为 `/somepath/api/v1`；客户端 `baseUrl` 与代理路径必须一致 |
| `http.health` | /`health` 和 /ready | false 关闭；健康与依赖就绪分开，检查路径也应同步部署 `health` |
| `http.openapi` | `false` | 对象启用，默认 `path: /openapi.json`；生产按公开范围选择 |
| `http.docs` | `false` | 对象启用，默认 `path: /docs`；`requireAuth` 可显式要求认证 |

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

### Serv 工厂参数与运行时依赖

以下参数传给 `serv.createApp()`。契约、模块实例和回调由服务端代码装配，不放进 `_serv.yml`；只有表中的 `http` 使用前述可序列化配置。

| 参数 | 默认与前置 | 用途、输出和边界 |
| --- | --- | --- |
| `contract` / `procedures` | 必填，形状互相匹配 | 前者声明接口输入输出，后者实现业务；创建后返回可交给 `serv.listen` 或 Fetch 宿主的 App，不会初始化业务模块 |
| `http` | 省略采用前述默认值 | 挂载 API、健康和文档路径，实施请求来源与协议策略；与业务依赖分开 |
| `middlewares[].middleware` / `path` | 可省略；每项必须有 middleware，path 省略匹配全部 | 普通中间件在访问策略及解密后、业务路由前执行，提前响应仍走加密；二进制端点须显式排除传输加密。`serv.cors` 的响应头补充在外层，预检仍检查访问策略 |
| `iam` | 可选的已初始化 IAM 实例 | 为 Bearer access token 派生会话校验；启用 refreshCookie 时也提供刷新能力。只创建 IAM procedures 不会代替顶层注入 |
| `verifyToken` | 可选回调，覆盖 `iam.auth.verifyToken` | 输入实际 access token，返回 `HaiResult<ServSession>`；失败不能构造已认证 session |
| `createContext` | 可选回调，优先于 verifyToken 和 iam | 完全接管请求上下文，框架不再自动填充 session。回调须保留传入请求元数据、可信地址并自行验证身份，不能照信用户自报 userId/roles |
| `refreshCookie` | 省略不启用 | 管理 refresh 传输；浏览器 HttpOnly Cookie 与受信原生 body 分开，具体字段见下表 |
| `transport` | 省略不启用 | 显式提供已初始化 crypto、受管 serverKeyRing 与共享 keyStore；容量、时间、路径和排除项见[传输配置](#加密传输与容量)，不能只提供 YAML 而漏私有依赖 |
| `audio` | 省略不挂载 WebSocket | 提供已初始化 ai、一次性票据验证及可选付费授权，容量和生命周期见下表；Node 宿主使用 serv.listen 才自动装配升级处理 |

上下文优先级为 **createContext → verifyToken → iam.auth.verifyToken → 只解析请求元数据**。没有验证器时 session 不会凭空出现；即使配置了验证器，资源授权仍由 procedure/业务守卫执行。

| `refreshCookie` 字段 | 默认与单位 | 行为与配置影响 |
| --- | --- | --- |
| `cookieName` | `hai_refresh_token` | 修改后浏览器需要取得新 Cookie；access token 的传输不因此改变 |
| `maxAge` | 2592000 秒（30 天） | 浏览器 Cookie 的保存期限，应与 IAM refresh TTL 对齐，不会延长已失效的服务端令牌 |
| `secure` | 显式 boolean 最优先 | 优先于 `HAI_SERV_REFRESH_COOKIE_SECURE`，两者都省略时由 NODE_ENV/HAI_CORE_ENV 是否 production 决定；测试开关不关闭此默认保护 |
| `onRefresh` | 可选，优先于顶层 iam.session.refresh | 输入 refreshToken，返回令牌对 HaiResult。两个刷新来源都缺少时创建 App 失败；不能捕获后继续提供半装配认证 |
| `nativeTokenTransport.isRequest` | 可选，无默认信任回调 | 同时核对原生客户端标识及允许的 Origin。匹配时登录/注册/刷新使用 body 中的 refreshToken，不读写浏览器 Cookie；不能只信可伪造的单个头 |

下例是完整的 IAM HTTP 装配片段。宿主已按 IAM 指南成功初始化数据库、缓存和 IAM；函数在依赖未就绪时拒绝创建。业务凭据由请求输入，不写进启动代码。

```ts
import { apiContract } from '@h-ai/api-contract'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'
import { createIamProcedures } from '@h-ai/serv/features/iam'

export function createAuthApp() {
  if (!iam.isInitialized)
    throw new Error('Initialize IAM before creating the HTTP application')
  const contract = apiContract.create({ iam: apiContract.iam })
  return serv.createApp({
    contract,
    procedures: { iam: createIamProcedures({ iam }) },
    iam,
    http: { apiPrefix: '/api/v1', docs: false, openapi: false },
    refreshCookie: { maxAge: 30 * 24 * 3600 },
  })
}
```

输入是已经初始化的 IAM 及匹配的 contract/procedures，输出是 App；宿主把它交给 `serv.listen` 或自己的 Fetch 入口。未登录请求访问受保护 procedure 应得到 401，成功登录后浏览器响应保存刷新 Cookie，刷新成功后旧 refresh 失效。上例省略 `secure`，因此进程覆盖才有机会生效；生产 HTTPS 无覆盖时 Cookie 带 Secure。它没有启用应用层传输加密、原生 body 通道或 API 文档，应用按所需功能分别装配。关闭先停止 HTTP 句柄，再释放 IAM 及其依赖。

`serv.listen(app, options)` 的 `host`/`port` 省略时为 `127.0.0.1:3000`，不会自行读取 HOST/PORT；应用先解析上述 Serv 配置，再把 `server.host/port` 显式传入监听器。`onListening(info)` 用于记录实际地址，`onClose()` 是可选异步清理回调。提供 onClose 才自动注册信号关闭；手动调用返回句柄的 close() 只停止监听及连接，应用还须显式等待业务模块清理，不能以端口关闭代替数据库、任务和凭据的释放。

### Serv 语音连接的授权与预算

这些字段属于 `serv.createApp({ audio })` 的运行时参数，没有 `_serv.yml.audio`。用途是限制每次 WebSocket 会话能做什么、能消耗多少资源。

| 字段 | 默认与输入 | 输出、影响和限制 |
| --- | --- | --- |
| `ai` / `verifyTicket` | 必填的已初始化实例与回调 | 原子消费一次性短票据，返回可信 session 和可选 grant；不能只校验格式或用长期 access token 冒充已消费票据 |
| `authorize(session, request, grant)` | 可选回调 | 返回服务端确认的操作/模型/声音等付费参数。省略时只保留操作和音频格式，客户端自报 model/voice/instruction 不生效 |
| `onSessionEnd(session, request)` | 可选异步回调 | 释放套餐并发占用等资源，成功、失败及断连至多调用一次；不把回调当跨系统事务 |
| `path` | `/ai/audio`，相对 apiPrefix | 修改后客户端 WebSocket 地址同步；不是普通 JSON procedure |
| `maxMessageBytes` | 1 MiB | 单条消息上限；不表示整段会话总量 |
| `maxBufferedBytes` | 10 MiB | 单连接累计音频输入预算，超过后失败并结束会话 |
| `maxTextBytes` | 1 MiB | 单连接累计文本输入预算；与音频容量分开 |
| `maxSessionMs` | 300000 毫秒 | 从建立起的最长会话时间；不是单条语音的下游请求超时 |
| `preAuthTimeoutMs` | 5000 毫秒 | 在该期限内完成鉴权并收到 start，否则关闭，防止空连接长期占用 |
| `maxPendingMessages` | 256 条 | 串行处理尚未完成的消息积压上限，过量即关闭，而不是无限排队 |
| `maxSendBufferBytes` | 8 MiB | 服务端发送缓冲高水位，慢客户端超过后以领域错误结束 |

例如把 `maxBufferedBytes` 设为 `2 * 1024 * 1024`、`maxSessionMs` 设为 `60000`，应观察到合法小音频仍可处理，累计超 2 MiB 或连接超 60 秒会失败关闭。用本轮签发票据验证首次允许、重复消费拒绝及越权模型拒绝，真实音频 Provider、设备录音与网络行为还需在目标环境验收。

## CORS与可信代理

| 项 | 框架默认 | 取值影响 |
| --- | --- | --- |
| `http.trustedProxies` / Kit `trustedProxies` | `auto` | 普通宿主忽略转发头；受管私有 Compose 代理采用实际容器网段。自建代理填写 IP/CIDR，`[]` 显式忽略转发头 |
| `http.access` / Kit `access` | `false` | 对每次请求限制 IP、时间和路径；可引用独立 YAML，详细配置见[请求策略](request-access.md) |
| `cors.origin` / `nativeOrigins` | 无默认 | 指定真实浏览器和原生来源；按生成宿主规则解析来源字符串 |
| `cors.credentials` | `false` | 跨源 Cookie 需明确 `true`并匹配允许来源；通配来源不能代替身份验证 |
| `cors.allowedHeaders` | Authorization、Content-Type、X-Requested-With、X-Hai-Reauthentication、X-Hai-Terminal | 自定义头需明确加入，保留框架敏感动作和终端头 |
| `cors.exposedHeaders` | [] | 仅向浏览器脚本公开需要读取的响应头，不泄露内部诊断 |

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

`config/_kit.yml` 的 `server` 默认同Serv，`transport` 默认 `false`；默认协商路径为 `/api/_hai/key-exchange`，与Serv默认不同。Kit 没有 `close()`，认证、Cookie、限流和请求处理由 hooks 工厂参数装配，不能把Serv 整个 `http` 对象放入Kit。

SvelteKit 部署在 `/yyy` 等目录时，在 Vite 的 sveltekit 配置设置 `paths.relative: false`，从 `$app/paths` 用 `resolve('/').replace(/\/$/, '')` 读取构建挂载目录 `base`，在服务端 `crypto.transport` 传入 `basePath: base`，浏览器使用 `kit.client.installBrowserTransport(公开配置, { crypto, basePath: base })`。独立 Kit client 的 `transport.basePath` 采用同一个值。默认空字符串表示根目录；它是宿主构建参数，不在 YAML 重复配置。这样 `/yyy/api/*` 的默认加密范围与页面目录保持一致，交换路径和排除列表仍填写完整请求路径。

```yaml schema=@h-ai/kit:KitConfigSchema
server: { host: 127.0.0.1, port: 3000 }
transport: false
```

使用项目现有 hooks 和标准 procedures，浏览器认证沿用HttpOnly Cookie/内存 `access` `token`流程。生产Cookie需适配HTTPS、`sameSite`、`path`和实际同源/跨源拓扑；不能把完整Token放`localStorage`。SSR locale 用 `runWithLocale` 包裹实际异步resolve，不能给每个请求改进程全局语言。限流store必须支持原子操作，生产使用共享后端。具体factory参数见[Kit公开说明](../../../packages/kit/README.md)。

### Hooks 参数与运行时依赖

这些参数传给 `kit.createHandle()`，不是全部写入 `_kit.yml`。函数、私钥和存储实例由可信服务端装配：

| 参数 | 默认与用途 | 输入改变后的结果和限制 |
| --- | --- | --- |
| `auth.verifyToken` / `operations` | auth 省略时不自动认证；提供 auth 时 verifyToken 必填 | 校验 Bearer/Cookie 并得到会话；operations 可用 `() => iam.auth` 延迟取已初始化实例 |
| `auth.cookieName` / `protectedPaths` / `publicPaths` / `loginUrl` | Cookie名 `hai_access_token`，路径由应用明确配置 | publicPaths 优先；匿名API返回401，页面按 loginUrl 跳转。路径含实际挂载目录 |
| `guards[].guard/paths/exclude` | 可省略，exclude 优先于 paths | auth 自动守卫之后检查业务权限；返回 allowed 不代替资源所有权校验 |
| `rateLimit` | 省略或 false 不启用；对象内 windowMs=60000、maxRequests=100 | 必须提供原子 `store`；超过每窗次数时拒绝。keyGenerator 选择稳定限流主体，onLimitReached 可返回安全响应 |
| `logging` / `logging.logBody` | 默认 true；logBody 默认不启用 | 请求日志用于关联诊断。正文可能有凭据和业务隐私，开启前明确脱敏与采集必要性 |
| `middleware` / `onError` | 可选；默认错误为安全500响应 | 自定义中间件在内置日志/限流之后；自定义异常响应同样不能泄露堆栈、SQL和密钥 |
| `crypto.encryptedCookies` / `cookieEncryptionKey` | 未列Cookie不加密；密钥可从 `HAI_KIT_COOKIE_KEY` 读取 | 指定Cookie保存为认证加密格式 `enc:v2`，读取时先验真；密钥必须为32个十六进制字符，缺失/非法时创建Handle失败 |
| `a2a.operations` / `cardPath` / `rpcPath` / `authenticate` | 显式接入；路径默认 `/.well-known/agent-card.json` 与 `/a2a` | 挂载Agent Card及协议入口；未提供authenticate即匿名，生产按实际需求提供apiKey或认证回调；不自动获得业务权限 |

例如只给业务偏好 Cookie 启用加密：

```ts
import { crypto } from '@h-ai/crypto'
import { kit } from '@h-ai/kit'

const ready = await crypto.init()
if (!ready.success) throw new Error(ready.error.message)
const handle = kit.createHandle({
  crypto: { crypto, encryptedCookies: ['order_preferences'] },
})
// 宿主将 handle 导出给 SvelteKit；私有环境已提供 HAI_KIT_COOKIE_KEY。
```

输入为宿主写入的 `order_preferences` 文本；浏览器看到认证密文，宿主读取时得到原文本。篡改密文不应得到有效偏好值。该示例只装配Cookie加密，未启用传输加密或业务认证，需与项目现有Hook配置合并；密钥不得发送到浏览器。

## API客户端地址、期限和恢复

入口是 `apiClient.init/create` 参数，没有自动加载的 `_api-client.yml`。

| 参数 | 默认与条件 | 影响 |
| --- | --- | --- |
| `baseUrl` | 必填，无默认 | 含API前缀，例 `https://api.example.invalid/api/v1`；原生端不能假定浏览器同源地址 |
| `timeout` | 30000ms | 中断客户端等待，不保证服务端副作用取消；超时后先按业务ID查结果 |
| auth | 省略时不创建TokenManager | 传 `{}` 启用默认HttpOnly Cookie适配，或在 `auth.storage` 注入内存/原生安全的 `TokenStorage` 实例；不传字符串类型的后端名 |
| `auth.refreshPath` | /auth/refresh，相对`baseUrl` | 与服务端刷新入口一致，不要重复拼/api/v1 |
| `auth.refreshTimeoutMs` / `terminalType` | 10000ms/web | 刷新期限独立于请求期限；终端须服务端允许，不证明物理设备 |
| `auth.recoverSession` | 可选回调，无默认 | 原地恢复同一用户，取消或结果不明不能返回true；成功仅重试原请求一次 |
| `auth.onTokenRefreshed` / `onRefreshFailed` | 可选回调，无默认 | 同步状态或引导重登；不抛错或记录`token`，暂时网络失败保留凭据 |
| `clientName` | hai-api-client | 写入x-request-client头，明确业务客户端有助定位 |
| `headers` / `fetch` | 可选 | 静态/异步头与平台 `fetch` 适配，不在通用`headers`放超权限秘密 |
| `transport` | 可省略，默认不启用 | 开启需匹配服务端和`crypto`能力；不能只打开客户端单边加密 |

```ts
import { apiClient } from '@h-ai/api-client'

const started = await apiClient.init({
  baseUrl: 'https://api.example.invalid/api/v1',
  timeout: 15000,
  auth: {},
  clientName: 'orders-web',
})
if (!started.success) throw new Error(started.error.message)
```

示例显式15秒是业务选择。按真实流程验证请求、401单次恢复、二次认证取消、退出与失败；跨身份请求不能复用旧刷新结果。非 2xx 合法 `HaiResult`保留业务码和`traceId`，5xx仍由实际HTTP状态执行安全隐藏。提示通过`notifyError` / `ToastContainer`，默认不展示编号。

Kit 的 `kit.response.validationError(errors)` 与 `fromError` 使用同一字段白名单，响应 `error.cause` 只含本地化的 `field/message`；rejectedValue、SQL 和其他诊断字段不公开。

## 加密传输与容量

配置是三件事：Serv/Kit启用入口和路径；服务端提供持久私有keyring、共享`keyStore`；客户端提供匹配`crypto`和协商路径。缺任一项都不是完整配置。HTTPS仍负责传输网络身份与通道保护，加密业务载荷不替代它。

| 参数 | 默认 | 影响与条件 |
| --- | --- | --- |
| `transport` | `false` | `false` 使用明文宿主流程；对象启用后还需运行时私有依赖 |
| `maxPlaintextBytes` | auto，实际1MiB；范围1KiB–64MiB | 双向明文UTF-8预算，超限尽早拒绝；不能只看加密后body长度 |
| `routePlaintextBytes` | 无默认 | 按完整路径段匹配，`*`匹配单段，附件/导出单独给预算 |
| `maxFutureSkewSeconds` | 30 秒 | 客户端请求时间可领先服务器的秒数，整数 0～300，包含上限 |
| `maxRequestAgeSeconds` | 300 秒 | 自签发起的请求有效期，整数 1～600，到达上限即过期 |
| `keyExchangePath` | Serv `/_hai/key-exchange`；Kit `/api/_hai/key-exchange` | Serv 是相对 `http.apiPrefix` 的子路径；Kit 是服务端完整路径；API Client 相对 `baseUrl`。例如 Serv 前缀 `/backend/api`、子路径 `/_hai/key-exchange` 对应 `/backend/api/_hai/key-exchange`，客户端 baseUrl 使用 `/backend/api` |
| `excludePaths` | [] | 按需要排除健康等非业务入口，不能排除敏感请求逃避策略 |
| 服务端keyring/`keyStore` | 无通用秘密默认 | 同环境各节点共用可持久密钥环和共享状态，禁止每次启动随机生成 |

```yaml schema=@h-ai/serv:ServConfigSchema
transport:
  maxPlaintextBytes: auto
  maxFutureSkewSeconds: 30
  maxRequestAgeSeconds: 300
  routePlaintextBytes:
    /api/v1/feedback/*/attachments: 8388608
  keyExchangePath: /_hai/key-exchange
  excludePaths: [/health, /ready]
```

先用受控小请求确认协商与解密，再发超过普通预算的无敏感材料确认拒绝，最后核对反馈预算、代理body限制和指定路由预算一致。私有ring通过Secret装配，示例仅描述路径，不含私钥。多节点轮换应准备新旧重叠、重启和未完成会话验证，不能由Schema结果宣称完成。

### 浏览器版本过低时的提示

Edge 100 缺少加密客户端读取请求正文所用的 `Request.body`，可能把空正文加密发出，导致登录返回 400。Web 入口会先检测已知的低版本浏览器并显示升级说明。检测门槛、适用模板与发布路径见[浏览器启动检测](../getting-started/build.md#浏览器启动检测)。[Chromium 请求流说明](https://developer.chrome.com/docs/capabilities/web-apis/fetch-streaming-requests)

### 时间不同步时的提示与恢复

在服务端 `_serv.yml` 或 `_kit.yml` 的 `transport` 中设置时间窗口，重启服务后生效。请求有效期也计入签发后的网络耗时。各节点应保持时钟和配置一致；共享注册表保留防重放记录至签发时间后 11 分钟，不能为容忍错误时钟而任意扩大请求窗口。

超出窗口时，前端提示显示服务端校验时的 UTC 时间。请开启设备的自动校时或手工修改时间，然后刷新重试。若仍失败，请联系管理员检查服务器时间。服务端时间来自已认证的加密错误；未提供可信时间值时，前端只显示校时建议。

![390像素宽度下的校时提示与刷新入口](../images/transport-clock-skew-mobile.png)

浏览器测试分别模拟设备时间快、慢 10 分钟。校正设备时间后，由用户点击刷新，登录表单重新出现，提示清除。

### Crypto共享注册表与算法参数

Crypto通过公开工厂/调用参数装配，不依赖`_crypto.yml`。先执行 `await crypto.init()` 并检查结果，再用Serv/Kit/API Client统一协议；自定义适配才直接`createServer`/`createClient`。

| 工厂/选项 | 默认与条件 | 影响 |
| --- | --- | --- |
| `createServer`的`serverKeyRing`/`keyStore` | 显式提供，无秘密/内存回退 | 多节点必须同一有效ring与共享registry，重启加载原ring；不能每次启动新建 |
| `createRedisTransportKeyStore`的`cache`/`ttlSeconds` | 已初始化`cache`；ttl省略不过期 | 显式ttl为1–2147483647秒；Redis原生TTL，无DB式容量上限，需要noeviction和可靠持久化 |
| `createReldbTransportKeyStore`的 `reldb` / `ttlSeconds`/`maxClients` | 已初始化共享reldb；ttl省略不过期；`maxClients`=10000 | 所有节点容量一致，满时拒绝，不驱逐有效公钥或nonce；定期调用`pruneExpired` |
| `createInMemoryKeyStore(maxClients?)` | 省略或非有限值用 10000；有限值向下取整且至少为 1 | 仅开发/测试的本进程公钥容量，满时淘汰最早公钥；有效 nonce 不随公钥提前淘汰，不能代替跨节点注册表 |
| `apiClient.transport.maxPlaintextBytes` | 省略跟服务端；显式取较小值 | 本地更严格预算，不放宽服务端限制 |
| 对称 `encrypt` 默认 | SM4 CBC+自动随机IV，返回结构化密文 | 保存 `mode`、`ciphertext`、`iv`、`encoding` 一起解密；同密钥不得复用IV |

请求认证有效期、未来偏差和nonce保留是协议约束，不能为“兼容时钟错误”任意放宽。服务端时钟同步，数据存储故障拒绝请求；nonce防重放不代替业务幂等键。完整SM2/SM3/SM4、密码哈希和协议选项见[Crypto公开用法](../../../packages/crypto/README.md)及[Transport协议](../../../packages/crypto/TRANSPORT-PROTOCOL.md)，它们是API参考，本手册不重复算法接口。
