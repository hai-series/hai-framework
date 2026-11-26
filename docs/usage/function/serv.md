# @h-ai/serv 功能说明

[English](serv.en.md) · [日本語](serv.ja.md) · [模块 README](../../../packages/serv/README.md) · [配置](../configuration/serv.md) · [数据结构](../data/serv.md)

Serv 将共享 HTTP 契约与处理函数装配成 Node 应用。应用可挂载会话守卫、CORS、传输加密及 IAM、存储、AI、反馈、审计和支付的预置路由。

<a id="module-dependencies"></a>

## 依赖

| 依赖 | 用途 | 何时需要 | 接入顺序 |
| --- | --- | --- | --- |
| Node.js | 运行 Serv、监听 HTTP 并升级 WebSocket | 根入口和 Fetch 适配都需要符合包清单的 Node 版本 | 先创建应用，再开始监听或交给 Node 兼容宿主 |
| `@h-ai/api-contract` / `zod` | 声明共享路由与输入输出 Schema | 随 Serv 安装；应用直接导入时也声明自身依赖 | 先定义 HTTPS 路径及数据结构，再绑定处理函数 |
| `@h-ai/core` | 请求上下文、日志、配置和 `HaiResult` | 随 Serv 安装；应用直接导入时也声明自身依赖 | 只有应用要加载配置或配置日志时才先调用 Core 初始化 |
| `@h-ai/audit` | 记录请求及业务审计事件，并提供可挂载的审计路由 | 随 Serv 安装；启用审计记录或路由时初始化 | 先初始化 RelDB 等实际依赖，再初始化 Audit |
| `@h-ai/crypto` / `@h-ai/cache` | 为加密 HTTP 准备密钥环、客户端公钥登记与重放记录 | Crypto 随 Serv 安装；启用传输加密时另接入 Cache，生产使用共享 Redis | 先初始化 Crypto 与 Cache，再注入密钥环及 key store |
| `@h-ai/iam` / `@h-ai/storage` / `@h-ai/ai` / `@h-ai/feedback` / `@h-ai/payment` | 提供对应服务及其路由能力；IAM 校验会话，AI 提供语音 | 按启用功能安装的可选 peer 依赖 | 先初始化所用模块和其依赖，再交给工厂；停机先关闭监听，再按初始化的反序释放 |

通过类型化客户端检查流式路由时，再安装 `@h-ai/api-client`。

## 快速开始

从状态接口开始，验证返回 HTTP 200 和 `data.status: "ready"`，再逐步加入订单预览、权限、限流、传输加密和语音。 [订单运营台教程](../getting-started/serv.md#quick-start)

<a id="api-reference"></a>

## 功能说明

通过下列接口清单查找选项、默认值、返回值和失败行为。场景使用订单运营台中的业务操作。

<a id="host-capabilities"></a>

### Serv 与 Kit 的 HTTP 接入

| 能力 | 两种宿主的接入方式 |
| --- | --- |
| 合作方 A2A | 两边传入同一个 `ai.a2a.createHttpHandler()` 处理器。默认关闭。 |
| 访问、限流与跨域 | 共用 `http.access`、`http.trustedProxies`、`http.rateLimit` 和 `cors`。 |
| 认证与传输加密 | 都用 `auth.iam` 或 `auth.verifyToken` 校验可信会话，用 `transport` 处理密钥交换和加密。 |
| 契约 API 与 OpenAPI | Serv 自带契约分发。Kit 用 `contract` 挂载 `serv.createContractHandler()`，原 SvelteKit 路由继续使用文件路由。 |
| 单次与实时语音 | 单次请求随共享契约挂载。实时 WebSocket 由 `serv.listen()` 接收，网关按语音路径转发。 |

[Kit 契约与 A2A 示例](kit.md#kit-contract)

<a id="http-app"></a>

### `serv.createApp` · 创建 HTTP 应用和处理请求

把 HTTP 契约和业务处理函数装配成一个 Fetch 应用。按部署需求再添加身份、访问控制、传输加密、文件或实时语音。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `serv.createApp(options)` | 组装 HTTP 应用 | `options.contract` 和 `procedures` 必填。见[工厂字段](#host-options)。 | `ServHttpApp`；无效配置或缺少必要装配依赖时同步抛错。 | `serv.createApp({ contract, procedures })` |
| `app.request(input, init?)` | 测试进程内请求 | `RequestInfo` 或 `URL`，可传相对路径；可选 `RequestInit`。 | `Response` 或其 Promise；HTTP 失败由响应状态与响应体报告。 | `await app.request("/health")` |
| `app.fetch(request, metadata?)` | 将宿主已收到的请求与连接信息交给应用 | 标准 `Request`；可选 `metadata.remoteAddress` 由宿主从连接取得，供访问控制和限流解析客户端 IP。 | `Response` 或其 Promise。 | `await app.fetch(request, { remoteAddress })` |

<a id="host-options"></a>

##### 应用工厂字段

| 字段 | 类型、默认值与条件 | 生效行为 | 接入步骤 |
| --- | --- | --- | --- |
| `contract` / `procedures` | 必填，契约树及对应 router | 声明业务路径及输入输出，挂载与选定节点对应的实现。 | [状态与预览](../getting-started/serv.md#orders-console-validation) |
| `http` | 可选；默认前缀 `/api/v1`，探活 `/health` 与 `/ready`，OpenAPI 和文档关闭 | 设置路径、可信代理及访问规则。见[实例配置](../configuration/serv.md)。 | [部署、探针与配额](../getting-started/serv.md#orders-console-access) |
| `middlewares` | 可选 `{ middleware, path? }[]`，默认空；省略 `path` 匹配全部 | 普通中间件在解密和访问检查后、路由前运行，提前响应仍经加密；内置 CORS 在外层补响应头。 | [网关与跨源页面](../getting-started/serv.md#orders-console-access) |
| `auth.iam` / `auth.verifyToken` / `createContext` | 可选；验证器返回 `HaiResult` | 优先级为 `createContext`、自定义验证器、IAM。IAM 也用于 Cookie 刷新。 | [接入 IAM](../getting-started/serv.md#orders-console-auth) |
| `cors` | 可选，默认关闭 | 浏览器跨域规则和凭据策略。 | [CORS 配置](../configuration/serv.md#cors) |
| `a2a` | 可选，默认关闭 | 挂载共享发现和 JSON-RPC 处理器。 | [订单助手](#shared-a2a-http) |
| `refreshCookie` | 可选 `RefreshCookieConfig`，默认关闭 | 为浏览器刷新维护 HttpOnly Cookie，可选受信原生通道。见[刷新字段](#refresh-cookie)。 | [账号续期](../getting-started/serv.md#orders-console-iam) |
| `transport` | 可选 `ServTransportConfig`，默认关闭 | 注入 Crypto、受管密钥环和共享 key store。见[加密装配](#transport-example)。 | [传输加密](../getting-started/serv.md#orders-console-transport) |
| `transportRoutes` | 可选 `ServTransportRoute[]`，默认无文件或 SSE 端点 | 按端点启用认证后读取的 multipart、文件或 SSE。见[传输路由](#http-contract-extensions)。 | [报表附件](../getting-started/serv.md#orders-console-files) |
| `audio` | 可选 `ServAudioConfig`，默认无语音入口 | 配置实时语音 WebSocket 与一次性票据校验。见[语音字段](#audio-options)。 | [连接实时语音](#audio-ticket-example) |

服务端可以在 `http.rateLimit` 注入原子存储，对通过访问检查的请求按可信 IP 计数。方式见[限流与恢复示例](#rate-limit-example)。

<a id="serv-contract-handler"></a>

### `serv.createContractHandler()` · 在 Kit 里挂载订单 API

创建可交给宿主的契约处理器。在 SvelteKit 的 Hook 挂载后，已有页面和文件路由继续按 SvelteKit 的规则处理。API 契约、权限守卫、校验、SSE 和文件限制跟独立 Serv 运行时共用。

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `serv.createContractHandler(options)` | 创建可挂载的契约处理器 | 必填 `contract`、`procedures`。可选 `http.apiPrefix`（默认 `/api/v1`）、`http.openapi`、`http.docs`、`transportRoutes`。 | `HttpContractHandler`。未命中时由宿主继续分发。 | `serv.createContractHandler({ contract, procedures })` |

订单运营台的调用示例包含状态接口及其 OpenAPI，并验证现有页面仍可访问。 [在 Kit 里提供同一套 API](kit.md#kit-contract)

<a id="shared-a2a-http"></a>

#### 场景：让合作方调用独立服务上的订单助手

同一订单助手也能部署到独立 Serv。先完成 AI 和 IAM 初始化，使用与 Kit 相同的 Agent Card 和执行器。把 `a2a` 加到现有应用工厂字段后，用相同的终端命令发现服务并调用。 [Kit 契约与 A2A 示例](kit.md#kit-a2a)

```ts
import { ai } from '@h-ai/ai'
import { apiContract } from '@h-ai/api-contract'
import { iam } from '@h-ai/iam'
import { type ServContext, serv } from '@h-ai/serv'

const contract = apiContract.create({})
const procedures = serv.implement(contract).context<ServContext>().build()
export const app = serv.createApp({
  contract,
  procedures,
  a2a: ai.a2a.createHttpHandler({
    authenticate: { verifyApiKey: key => iam.apiKey.verifyApiKey(key) },
  }),
})
```

<a id="refresh-cookie"></a>

##### 刷新 Cookie 字段

| 字段 | 类型、默认值与条件 | 生效行为 |
| --- | --- | --- |
| `cookieName` / `maxAge` | `string`、`number`；默认 `hai_refresh_token`、2592000 秒 | 设置浏览器 Cookie 名与期限；服务端 IAM 仍检查凭据有效期。 |
| `secure` | 可选 boolean；优先于 `HAI_SERV_REFRESH_COOKIE_SECURE`；均缺省时生产为 true | 生产默认依据 `NODE_ENV` 或 `HAI_CORE_ENV`。 |
| `onRefresh` | 默认使用 `iam.session.refresh`；启用时至少提供其一 | 接收旧 refresh token，返回 `Promise<HaiResult<RefreshTokenPair>>`；成功后轮换。 |
| `nativeTokenTransport.isRequest` | 可选 `(request: Request) => boolean`；省略时只启用浏览器模式 | 从明确来源与客户端类型识别原生请求；匹配时刷新令牌走 JSON 正文。正文上限 16 KiB。 |

<a id="audio-options"></a>

##### 语音连接字段

| 字段 | 类型、默认值与条件 | 生效行为 |
| --- | --- | --- |
| `ai` / `verifyTicket` | 必填，已初始化的 AI 音频能力及票据验证函数。 | 校验用途和有效期并原子消费，用 `HaiResult<AudioTicketVerification>` 返回可信 `session` 与可选 `grant`。 |
| `authorize(session, request, grant?)` | 可选异步回调。 | 按业务规则检查操作、模型、套餐与并发，返回确认后的参数。省略时校验票据操作，使用绑定模型或 Provider 默认模型，并忽略客户端自报的模型、音色和提示。 |
| `onSessionEnd(session, request)` | 可选同步或异步回调。 | 每次成功授权至多调用一次以释放资源，包含断连后授权才成功的情况。 |
| `path` | 默认 `${http.apiPrefix}/ai/audio`，自定义值是完整请求路径。 | 修改后同步网关与客户端的 WebSocket URL。 |
| `maxMessageBytes` | 默认 1 MiB，整数范围 1～2147483647 字节。 | 在 WebSocket 接收器限制单条完整消息。无效配置在创建应用时抛错。 |
| `maxBufferedBytes` / `maxTextBytes` | 默认每连接累计音频 10 MiB、文本 1 MiB。 | 累计超限后结束实时报送或合成会话。 |
| `maxSessionMs` / `preAuthTimeoutMs` | 默认 300000 / 5000 毫秒。 | 全会话时限与完成验证并处理 `start` 的时限分别计时。 |
| `maxPendingMessages` / `maxSendBufferBytes` | 默认 256 条 / 8 MiB。 | 限制待处理任务数量和合成音频帧发送缓冲。 |

<a id="request-access-example"></a>

#### 场景：只向合作方网段提供外部报表

用同一个应用完成代理地址、转发客户端 IP、路径和拒绝验证。 [第 5 步](../getting-started/serv.md#orders-console-access)

<a id="rate-limit-example"></a>

#### 场景：限制同一来源调用并检查恢复时间

在第 5 步验证前两次放行、第三次限流以及窗口结束后的恢复。生产多实例使用同一 Redis、命名空间、窗口和额度。无法取得可信 IP 时共用 `unknown` 计数键，计数存储失败时返回 503。健康探针和 CORS 预检无需配额。 [第 5 步](../getting-started/serv.md#orders-console-access)

<a id="refresh-browser-session-example"></a>

#### 场景：让账号页在访问令牌过期后继续工作

账号页已完成第 4 步的 IAM 和 `refreshCookie` 接入。访问令牌过期后，再调用 `apiClient.iam.auth.currentUser()`。客户端用 HttpOnly Cookie 发送刷新请求，保存新访问令牌并重试账户查询。检查结果的 `success`，成功时可继续显示资料，刷新失败时回到登录页。 [第 4 步](../getting-started/serv.md#orders-console-iam)

<a id="transport-example"></a>

#### 场景：对状态接口进行密钥交换和加密

在第 6 步验证如何用同一应用的状态契约从浏览器完成握手和解密。明文或认证失败的请求按策略拒绝。 [第 6 步](../getting-started/serv.md#orders-console-transport)

<a id="audio-ticket-example"></a>

#### 场景：让浏览器使用一次性票据连接实时语音

浏览器要持续上传麦克风音频，或用支持流式输出的模型按块接收声音时，可以使用 Serv 的 WebSocket 入口和一次性票据。实时能力取决于模型。先完成[报表语音教程](../getting-started/serv.md#orders-console-audio)以获得已初始化的 AI、IAM 和同一套报告权限。以下用已配置的 `report-tts` 验证票据、连接、合成到播放。普通报表朗读和上传录音转写继续使用该教程的 HTTP 接口。

##### 票据与 WebSocket 的往返

浏览器的取票入口是 HTTPS JSON 路由，语音帧通过 WSS 传输。

| 步骤 | 参与方 | 发生的事 |
| --- | --- | --- |
| 取票 | 报告页 → Serv | 带 access token 请求 `POST /api/v1/ai/audio/tickets`。 |
| 签发 | Serv → IAM → 报告页 | 检查会话的角色和权限，签发 30 秒内可用、绑定请求操作的票据。 |
| 连接 | 报告页 → Serv → IAM | 升级 `GET /api/v1/ai/audio?ticket=…`，原子消费票据并检查当前授权。 |
| 合成 | 报告页 → Serv → 合成模型 | 浏览器发送报告摘要，Serv 使用指定的模型和音色，返回音频块和结束消息。 |
| 播放 | 报告页 → 浏览器播放器 | 收到 `end` 后把完整的 MP3 交给播放器。 |

保存共享契约到 `voice-contract.mts`。这个阶段只新增一个 JSON 操作。客户端会用同一节点调用票据接口。

```ts
import { apiContract } from '@h-ai/api-contract'

export const voiceContract = {
  ai: { audio: { issueTicket: apiContract.extensions.ai.audio.issueTicket } },
}
```

将下列代码保存为 `voice-server.mts`。已初始化的 IAM 在取票时检查 `reports:read`，在升级时原子消费票据并重新检查当前账号和权限。票据只允许请求的操作。合成使用上一步为合成配置的默认模型 `report-tts`。

```ts
import { ai } from '@h-ai/ai'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'

const voice = serv.createIamAudio({
  ai,
  iam,
  config: { path: '/api/v1/ai/audio' },
  permission: 'reports:read',
})

// 把这两项合入已有的 ai.audio，保留 HTTP 合成和转写。
export const voiceProcedures = { ai: { audio: { issueTicket: voice.issueTicket } } }
export const voiceAudio = voice.config
```

将 `voiceAudio` 传给 `serv.createApp({ audio: voiceAudio, … })`，把 `voiceContract.ai.audio` 和 `voiceProcedures.ai.audio` 分别合入原来的 `contract.ai.audio` 和 `procedures.ai.audio`，并保留 `transportRoutes`。继续使用 `serv.listen(app, …)`。公网使用 HTTPS 入口转发 `Upgrade`，浏览器连接使用 `wss:`。票据 POST 沿用第 6 步的加密 HTTP 配置，语音升级依赖 HTTPS 与一次性票据。自定义 `audio.path` 后，客户端 WebSocket URL 使用同一站点路径。

##### 在浏览器连接和播放

保存 `report-reader.mts` 为浏览器打包入口的一部分。它用已有 access token 调用共享 HTTP 契约，随后把短期票据交给语音客户端。普通 access token 只进入 HTTP Authorization 头。每次调用获取新票据，票据和包含它的 WebSocket URL 均不记录到应用日志。

```ts
import { ai } from '@h-ai/ai/client'
import { type ApiClientConfig, apiClient } from '@h-ai/api-client'
import { voiceContract } from './voice-contract.mts'

export async function makeReportAudio(
  summary: string,
  http: Pick<ApiClientConfig, 'baseUrl' | 'headers' | 'transport'>,
  signal?: AbortSignal,
): Promise<Blob> {
  const client = apiClient.create(voiceContract)
  // baseUrl 含 API 前缀，headers 提供当前会话的 Bearer access token。
  const started = await client.init(http)
  if (!started.success)
    throw new Error(started.error.message)

  try {
    const socketUrl = new URL(http.baseUrl, window.location.origin)
    socketUrl.pathname = socketUrl.pathname.replace(/\/$/, '') + '/ai/audio'
    socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:'

    const reader = ai.createAudioClient({
      url: socketUrl.href,
      async getTicket(request) {
        // 每次合成先走一次已登录的 HTTP 请求，返回票据才开始建连。
        const issued = await client.ai.audio.issueTicket(request, { signal })
        if (!issued.success)
          throw new Error(issued.error.message)
        return issued.data.ticket
      },
    })

    // SDK 发送 start、text、done，收到完整音频后自动关闭连接。
    const result = await reader.synthesize({ text: summary, signal })
    if (result.format !== 'mp3')
      throw new Error('Unexpected report audio format')
    return new Blob([new Uint8Array(result.data)], { type: 'audio/mpeg' })
  }
  finally {
    await client.close()
  }
}
```

将 `report-playback.mts` 放在同一客户端目录。它把按钮点击与生成音频绑定，把合成结果交给浏览器播放器，并返回页面卸载时调用的清理函数。

```ts
import { type ApiClientConfig } from '@h-ai/api-client'
import { makeReportAudio } from './report-reader.mts'

export function bindReportReader(
  button: HTMLButtonElement,
  player: HTMLAudioElement,
  summary: string,
  http: Pick<ApiClientConfig, 'baseUrl' | 'headers' | 'transport'>,
  onError: (cause: unknown) => void,
) {
  const lifetime = new AbortController()
  let url: string | undefined
  async function generate() {
    button.disabled = true
    try {
      // 生成完毕后为 <audio controls> 设置来源，由用户按播放键。
      const blob = await makeReportAudio(summary, http, lifetime.signal)
      if (lifetime.signal.aborted)
        return
      if (url)
        URL.revokeObjectURL(url)
      url = URL.createObjectURL(blob)
      player.src = url
    }
    catch (error) {
      if (!lifetime.signal.aborted)
        onError(error)
    }
    finally {
      if (!lifetime.signal.aborted)
        button.disabled = false
    }
  }

  button.addEventListener('click', generate)
  return () => {
    // 页面卸载时终止请求与播放，并回收当前 Blob URL。
    lifetime.abort()
    button.removeEventListener('click', generate)
    player.pause()
    player.removeAttribute('src')
    player.load()
    if (url)
      URL.revokeObjectURL(url)
  }
}
```

页面放置一个用于生成的 `<button type="button">` 和一个 `<audio controls>`。把实际元素、已授权报告的摘要 `report.summary`、当前会话的 access token 和页面已有的错误处理函数传进去。同源网关的 API 地址如下。前后端拆开部署时用包含 `/api/v1` 的 HTTPS API 地址。

```html
<button type="button" id="generate-report-audio">生成报表语音</button>
<audio controls id="report-audio"></audio>
```

下例沿用第 6 步已初始化的浏览器 Crypto。只验证普通 HTTPS 时，省略 `transport` 及其相关导入。

```ts
import { crypto } from '@h-ai/crypto'
import { bindReportReader } from './report-playback.mts'
import { keyExchangePath } from './status-client.mts'

const readReportButton = document.querySelector<HTMLButtonElement>('#generate-report-audio')
const reportAudioElement = document.querySelector<HTMLAudioElement>('#report-audio')
if (!readReportButton || !reportAudioElement)
  throw new Error('Report audio controls are missing')

const dispose = bindReportReader(
  readReportButton,
  reportAudioElement,
  report.summary,
  {
    baseUrl: '/api/v1',
    headers: { Authorization: 'Bearer ' + accessToken },
    transport: { crypto, keyExchangePath },
  },
  showReportAudioError,
)
```

页面卸载时调用 `dispose()`。点击按钮并等待播放器可用，再点击播放。Network 中应看到 `POST /api/v1/ai/audio/tickets` 成功，随后是 GET Upgrade（101）和 WebSocket 音频帧。签发失败会在建连前停止；过期、重复消费或授权不符会收到 WebSocket `error` 后断连，不能用部分音频当成功。登录后撤销报表读取权限，再用之前签发的票据连接，服务端应在调用语音模型前拒绝。

<a id="listen-api"></a>

### `serv.listen` · 让 Node 接收 HTTP 请求

将应用绑定到 Node 的地址和端口。监听器还从 socket 取得连接对端，供访问控制和限流使用；有 WebSocket 语音端点时由同一个监听器完成升级。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `ServConfigSchema` | 校验应用读取的 `_serv.yml` | 输入 `ServConfigInput`，含可选 `server`、`http`、`cors`、`transport` | `safeParse` 成功得到 `ServConfig`，失败得到 Zod 校验结果。 | `ServConfigSchema.safeParse({ server: { port: 3001 } })` |
| `serv.listen(app, options?)` | 启动 Node 监听 | `app: ServHttpApp` 必填；选填[监听字段](#listen-options)。 | `ServNodeServer`，含 `server` 和 `address`；异步绑定失败通过 Node `error` 事件报告。 | `const handle = serv.listen(app, { port: 0 })` |
| `handle.close()` | 停止 Node 监听并清理流连接 | 无参数；并发调用复用同一结果。 | `Promise<void>`；监听失败或语音清理超时会拒绝。 | `await handle.close()` |

<a id="listen-options"></a>

##### Node 监听字段

| 字段 | 类型、默认值与条件 | 生效行为 |
| --- | --- | --- |
| `host` | `string`，默认 `127.0.0.1` | 对外监听时显式指定接口或 `0.0.0.0`。 |
| `port` | `number`，默认 `3000` | 直接调用允许 `0`，绑定后 `handle.address` 提供实际主机和端口。绑定前保存传入的地址。 |
| `onListening` | 可选 `(info: AddressInfo) => void` | Node 绑定成功后执行。 |
| `onClose` | 可选 `() => Promise<void>`；省略时不代注册信号处理 | `SIGINT` 或 `SIGTERM` 后停止接入，给 SSE 和 WebSocket 连接一秒关闭宽限。语音连接关闭后等待授权和释放最多五秒，并等待已接收的普通 HTTP 完成，再调用此回调。主动关闭由调用方释放业务资源。 |

#### 场景：集成测试使用空闲端口发送真实 HTTP 请求

把[最小接入](../getting-started/serv.md#quick-start)中的 `app` 交给监听函数。多个测试同时运行时，让 Node 用 `port: 0` 选择空闲端口。下面用真实 HTTP 请求检查本机状态接口；部署时，应用把 [`config/_serv.yml`](../configuration/serv.md) 解析后的 `server` 显式传给监听器。`HOST` 和 `PORT` 的覆盖由 Schema 解析应用。

```ts
import { once } from 'node:events'
import { ServConfigSchema, type ServHttpApp, serv } from '@h-ai/serv'

export async function checkListener(app: ServHttpApp, rawConfig: unknown) {
  // 校验宿主读取的原始配置。解析失败时返回字段错误并终止本次启动。
  const parsed = ServConfigSchema.safeParse(rawConfig)
  if (!parsed.success)
    throw parsed.error

  // 复用解析后的监听配置，在本机回环地址请求一个空闲端口进行检查。
  const handle = serv.listen(app, { ...parsed.data.server, host: '127.0.0.1', port: 0 })
  try {
    // 等待 Node 完成监听，再读取实选端口。端口绑定失败会拒绝本次等待。
    if (!handle.server.listening)
      await once(handle.server, 'listening')
    // 向实选端口请求状态接口。非成功状态会使本次检查失败。
    const status = await fetch('http://' + handle.address.host + ':' + handle.address.port + '/api/v1/status')
    if (!status.ok)
      throw new Error('Unexpected status: ' + status.status)
    return await status.json()
  }
  finally {
    // 等待监听句柄关闭。状态请求失败时同样释放监听资源。
    await handle.close()
  }
}
```

调用 `await checkListener(app, {})` 应得到与最小接入相同的成功体。使用真实服务模块时，在关闭句柄后再释放它们。

<a id="fetch-api"></a>

### `serv.toFetch` · 把应用接入需要标准 Fetch 的调用方

当调用方只接收标准 Fetch 函数，例如 API Client 的 `fetch` 配置时，将 `serv.toFetch(app)` 返回的函数传给它。返回的函数接受 `input` 和 `init`，在同一个进程调用应用。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `serv.toFetch(app)` | 把应用作为标准 Fetch 函数注入客户端 | `app: ServHttpApp` 必填；返回的函数接受 `RequestInfo`、`URL` 和可选 `RequestInit`。 | `ServFetchHandler`；派发 Promise 可因构造失败、取消或下游异常拒绝。 | `await serv.toFetch(app)("http://localhost/health")` |

<a id="in-process-client-example"></a>

#### 场景：不用启动 HTTP 服务就能测试 API Client

在第 1 步的 `check.mts` 后加入以下代码，并在文件开头补充从 `app.mts` 导入 `contract`，用测试客户端重用同一个运营台。执行 `pnpm add @h-ai/api-client`。

```ts
import { apiClient } from '@h-ai/api-client'
import { serv } from '@h-ai/serv'

// 创建与页面相同的 API Client。它会根据状态契约构造请求。
const client = apiClient.create(contract)
try {
  // 用 /api/v1 作为客户端的业务前缀，并把 fetch 指向测试进程中的 app。
  const ready = await client.init({
    baseUrl: 'http://service.test/api/v1',
    fetch: serv.toFetch(app),
  })
  if (!ready.success)
    throw new Error(ready.error.message)

  // 调用状态接口，断言客户端解析出 ready。请求不会经过网络。
  const status = await client.status()
  assert.equal(status.success, true)
  if (status.success)
    assert.equal(status.data.status, 'ready')
}
finally {
  // 无论断言通过还是失败，均释放本次客户端实例。
  await client.close()
}
```

运行 `node check.mts` 应通过断言并退出。`service.test` 只用于组成请求 URL。`serv.toFetch(app)` 返回标准 `fetch(input, init?)` 函数，支持 `AbortSignal`，不携带连接对端地址。

如果入口服务器已经拿到了 `Request`，并要让 Serv 按客户端 IP 检查访问权限或限流，应调用 `app.fetch(request, { remoteAddress })`，其中 `remoteAddress` 由入口服务器从连接取得。下一例演示如何传这个地址。`serv.listen(app)` 启用 Serv 自带的 Node 监听器，由它从 socket 读取地址。

<a id="authentication"></a>

### `serv.implement` · 为契约绑定处理函数及路由守卫

给公开状态检查绑定普通处理函数。读取需要授权的报告时，先从可信验证器建立会话，再组合角色和权限守卫。点分键选中契约节点，HTTP 路径由该节点声明。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `serv.implement(contract)` | 开始实现共享契约 | 必填带类型的契约树。 | `ServImplementer` | `const implementation = serv.implement(contract)` |
| `implementation.context<TContext>()` | 给 procedure 指定上下文类型 | 显式指定 `ServContext` 或其扩展；无运行时参数。宿主负责提供扩展字段。 | `ServRouterBuilder` | `implementation.context<ServContext>()` |
| `builder.route(path, handler?)` | 按契约键绑定实现 | `path` 为节点键或点分键；普通 `handler` 接收 `{ input, context }` 并返回相应 `HaiResult`。 | 提供处理函数时返回 builder；省略时返回可加守卫的注册项。非法或重复注册抛错。 | `builder.route("reports.read")` |
| `route.auth()` | 要求有效会话 | 无参数。 | 可继续加守卫或绑定处理函数；请求缺少会话时，调用返回 401 领域错误。 | `builder.route("reports.read").auth()` |
| `route.permission(permission)` | 要求具体权限 | 必填权限名 `string`，例如 `reports:read`；隐含认证。 | 可追加守卫；认证后缺权限返回 403 领域错误。 | `route.permission("reports:read")` |
| `route.role(role)` | 要求具体角色 | 必填角色名 `string`；隐含认证。多个角色和权限条件全部满足才放行。 | 可追加守卫；认证后缺角色返回 403 领域错误。 | `route.role("auditor")` |
| `route.handle(handler)` | 绑定普通 JSON 处理函数 | 必填符合节点输入与 `HaiResult` 输出的函数；守卫通过后才调用。 | 返回下一个 builder；守卫和业务失败按[响应边界](#error-handling)处理。 | `route.handle(({ context }) => core.ok(context.session.userId))` |
| `route.handleTransport(handler)` | 绑定 multipart、File 或 SSE 操作 | 先调用认证、权限或角色守卫；必填契约对应处理函数，并在应用装配时启用路由。 | 返回下一个 builder；传输端点失败可使用真实 HTTP 状态。 | `route.handleTransport(() => new File(["report"], "report.txt"))` |
| `builder.build()` | 同步完成 router | 无参数；所有选入的契约节点都需实现。 | 普通 router，可选择属性接入；缺少路由时类型提示 `missingRoutes`，绕过类型调用会抛错。 | `const procedures = builder.build()` |
| `serv.WILDCARD_PERMISSION` | 允许可信会话满足所有权限要求 | 常量 `"*"`；只放入已验证会话的权限。`domain:*` 另可匹配域权限。 | `string` | `const permissions = [serv.WILDCARD_PERMISSION]` |
| `serv.WILDCARD_ROLE` | 允许可信会话满足所有角色要求 | 常量 `"*"`；只放入已验证会话的角色。 | `string` | `const roles = [serv.WILDCARD_ROLE]` |
| `serv.guard.requireSensitive(iam, context, operation)` | 校验敏感操作凭据 | 传入已初始化 IAM、当前请求上下文和服务端操作标识。 | `Promise<HaiResult<void>>`。已配置的操作会校验并消费票据。 | `await serv.guard.requireSensitive(iam, context, "orders.cancel")` |

<a id="http-contract-extensions"></a>

##### 传输挂载字段

| 字段 | 类型、默认值与条件 | 生效行为 |
| --- | --- | --- |
| `procedure` | 必填，传入应用契约中实际选中的端点对象。 | 必须有确定的 HTTP 方法、固定路径与认证守卫。未显式挂载的传输操作拒绝。 |
| `maxRequestBytes` | 必填，非负安全整数；无请求体的 GET 用 0。 | 限制解码前的请求字节数，multipart 还需预留边界与元数据。超限返回 413。 |

为已有[路由构造器](#authentication)的文件、multipart 或 SSE 契约增加传输许可。生产由宿主的 HTTPS 入口发布。框架传输加密开启时，给每个端点的实际方法和路径显式设置 `http.access` 的 `encryption: "disabled"`。

<a id="authorization-example"></a>

第 3 步直接在同一个运营台的预览、报表路由上要求角色与权限。无会话或缺少权限时，普通 JSON 路由默认仍返回 HTTP 200，拒绝原因写入 `error.httpStatus`。 [完整守卫场景](../getting-started/serv.md#orders-console-auth)

<a id="serv-sensitive-guard"></a>

#### 场景：取消订单前再次确认身份

取消接口先要求 `orders:cancel` 权限，再从数据库读出该订单。把查到的订单和实际取消函数传给下例。对启用 `orders.cancel` 再鉴别的应用，浏览器在提交取消请求时携带 `X-Hai-Reauthentication`；缺少或重复使用票据时应看到失败的 `HaiResult`，订单保持原状态。 [Kit 归档操作的再鉴别示例](kit.md#kit-sensitive-guard)

```ts
import { core, HaiCommonError, type HaiResult } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { type AuthenticatedServContext, serv } from '@h-ai/serv'

export async function cancelOwnOrder(
  context: AuthenticatedServContext,
  order: { id: string, ownerId: string },
  cancel: (id: string) => Promise<HaiResult<{ cancelled: boolean }>>,
) {
  if (order.ownerId !== context.session.userId)
    return core.err(HaiCommonError.FORBIDDEN)

  const proof = await serv.guard.requireSensitive(iam, context, 'orders.cancel')
  if (!proof.success)
    return proof

  return cancel(order.id)
}
```

<a id="wildcard-guards-example"></a>

#### 场景：应急审计员临时接管报告访问

报告站的应急账号由身份服务验证，并可被授予跨团队审计权限。`serv.WILDCARD_PERMISSION` 只匹配权限检查，`serv.WILDCARD_ROLE` 只匹配角色检查。两者的值都是 `"*"`，由它所在的会话字段决定含义。权限列表中的 `reports:*` 只覆盖 `reports:` 下的权限。账号授权由服务端决定。

以第 3 步的报表契约和处理函数单独运行守卫测试。将以下文件保存为 `check-guard.mts`，无需启动监听或覆盖其他运营台路由。

```ts
import assert from 'node:assert/strict'
import { core, HaiCommonError } from '@h-ai/core'
import { type ServSession, serv } from '@h-ai/serv'
import { reportContract, reportProcedures } from './reports.mts'

// 模拟身份服务查到的会话。给应急账号明确指定两个通配字段，普通审计员只持有报告领域权限。
const sessions = new Map<string, ServSession>([
  ['permission-only', { userId: '1', permissions: [serv.WILDCARD_PERMISSION], roles: [] }],
  ['on-call-auditor', { userId: '2', permissions: [serv.WILDCARD_PERMISSION], roles: [serv.WILDCARD_ROLE] }],
  ['report-auditor', { userId: '3', permissions: ['reports:*'], roles: ['auditor'] }],
])

// 将测试身份映射到服务端会话。未知测试身份返回未认证结果。
const app = serv.createApp({
  contract: reportContract,
  procedures: reportProcedures,
  async verifyToken(token) {
    const session = sessions.get(token)
    return session ? core.ok(session) : core.err(HaiCommonError.UNAUTHORIZED)
  },
})

// 请求报告并读取普通 procedure 返回的 HaiResult。只有同时满足角色和权限才有报告正文。
for (const [token, expected] of [['permission-only', 403], ['on-call-auditor', 200], ['report-auditor', 200]] as const) {
  const response = await app.request('/api/v1/reports/current', { headers: { Authorization: 'Bearer ' + token } })
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.success ? 200 : result.error.httpStatus, expected)
}
```

第一种身份缺少角色，返回领域 403。应急审计员和获得报告领域权限的普通审计员都通过。完整的生产授权仍由身份系统及报告处理函数的租户、资源检查决定。

<a id="authenticated-file-example"></a>

第 7 步展示怎样把登录后可见的报表做成实际文件附件，同时保留已有 JSON 端点。 [保护文件示例](../getting-started/serv.md#orders-console-files)

<a id="auth-context-api"></a>

### `serv.buildAuthContextFactory` · 从令牌验证结果建立会话

使用 IAM 之外的身份提供方时，把它的令牌验证函数包装成每个请求的上下文工厂。只需要请求编号、语言、客户端地址等字段时，可同步使用 [serv.parseRequestContext](#parse-context-api)。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `serv.buildAuthContextFactory(verifyToken)` | 构造每请求校验器 | 必填 `(token: string) => Promise<HaiResult<ServSession>>`；仅在有 Bearer 时调用。 | `CreateServContext`；缺少令牌或验证器返回 4xx 时为匿名。验证异常或依赖失败由其 Promise 拒绝。 | `serv.buildAuthContextFactory(token => iam.auth.verifyToken(token))` |

#### 场景：使用现成的令牌验证器

公司的令牌验证器可以直接交给 `serv.buildAuthContextFactory`。下面复用教程第 3 步的 `reports.mts` 和 `orders-test-identity.mts`，跑一次受保护报表的本地检查。测试标识 `local-auditor` 由示例验证器识别。 [第 3 步的文件](../getting-started/serv.md#orders-console-auth)

```ts
import assert from 'node:assert/strict'
import { serv } from '@h-ai/serv'
import { verifyToken } from './orders-test-identity.mts'
import { reportContract, reportProcedures } from './reports.mts'

// 把现有验证器装入报表应用，再对同一路由发送有会话和无会话的请求。
const createContext = serv.buildAuthContextFactory(verifyToken)
const app = serv.createApp({ contract: reportContract, procedures: reportProcedures, createContext })
const allowed = await app.request('/api/v1/reports/current', {
  headers: { Authorization: 'Bearer local-auditor' },
})
assert.equal(allowed.status, 200)
const report = await allowed.json()
assert.equal(report.success, true)
assert.equal(report.data.owner, 'auditor-1')

// 守卫拒绝匿名请求，普通 JSON 路由在业务错误中给出 401。
const anonymous = await app.request('/api/v1/reports/current')
assert.equal(anonymous.status, 200)
const denied = await anonymous.json()
assert.equal(denied.success, false)
assert.equal(denied.error.httpStatus, 401)
```

角色和权限如何读取会话，见[报告场景](#authorization-example)。

<a id="parse-context-api"></a>

### `serv.parseRequestContext` · 读取只含请求元数据的上下文

宿主处理诊断请求时，可以在验证身份前读取它的请求编号、客户端 IP 和语言。若已有 `createApp` 解析的客户端 `ip`，原样传入；由宿主管理连接时，可提供连接对端 `remoteAddress`。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `serv.parseRequestContext(input)` | 提取请求元数据 | `input.request: Request` 必填；可选可信 `remoteAddress` 或已解析 `ip`。 | `ServContext` 含请求编号、语言和未验证 Bearer；没有 session。 | `serv.parseRequestContext({ request })` |

#### 场景：为诊断请求取得请求编号

用宿主收到的 `Request` 构造上下文。下面模拟本次请求携带请求编号，连接对端为 `192.0.2.10`。

```ts
import assert from 'node:assert/strict'
import { serv } from '@h-ai/serv'

const request = new Request('https://api.example.com/api/v1/status', {
  headers: { 'x-request-id': 'req-diagnostic-42', 'x-hai-locale': 'ja-JP' },
})
// 提取本次请求的请求编号、连接地址和语言。此时尚未建立会话。
const context = serv.parseRequestContext({ request, remoteAddress: '192.0.2.10' })
assert.equal(context.requestId, 'req-diagnostic-42')
assert.equal(context.ip, '192.0.2.10')
assert.equal(context.locale, 'ja-JP')
assert.equal(context.session, undefined)
```

断言通过后，可用 `context.requestId` 关联同一次请求的诊断记录。

<a id="runtime-security-api"></a>

### `serv.createRuntimeSecurityPolicy` · 验证部署中的 Web 与原生来源

生产部署启动时用它统一核对 Web 前端来源和应用允许的原生来源。生成的 `policy.allowOrigin` 可交给 [serv.cors](#cors-api)，`policy.isNativeOrigin` 用于宿主识别原生请求时核对来源。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `serv.createRuntimeSecurityPolicy(input)` | 核对部署来源及默认安全策略 | `ServRuntimeSecurityPolicyInput` 必填；[环境与来源](#runtime-security-options)可选。 | `allowOrigin`、`isNativeOrigin`、`secureRefreshCookie`、`exposeApiDocs`；生产缺少明确来源或配置非法时抛错。 | `serv.createRuntimeSecurityPolicy({ environment: "production", corsOrigin: "https://app.example.com" })` |
| `policy.allowOrigin(origin)` | 判断 CORS 来源 | `origin: string`，来自浏览器 Origin。 | `boolean` | `policy.allowOrigin("https://app.example.com")` |
| `policy.isNativeOrigin(origin)` | 核对已配置的原生来源 | `origin: string`，还需宿主核对客户端类型。 | `boolean` | `policy.isNativeOrigin("capacitor://localhost")` |

<a id="runtime-security-options"></a>

##### 环境与来源

| 字段 | 类型、默认值与条件 | 生效行为 |
| --- | --- | --- |
| `input.environment` / `corsOrigin` / `nativeOrigins` | 均为可选字符串；生产必须提供明确 HTTP(S) Web 来源。 | 逗号分隔，原生另可用 `capacitor:` 或 `tauri:`。生产默认 Secure Cookie 并关闭文档开关；调用方将策略应用到 HTTP 配置。 |

#### 场景：启动独立域名的前端与 API

Web 前端位于 `https://app.example.com`，Capacitor 应用使用 `capacitor://localhost`。从部署设置读取两个来源，在启动监听前验证。

```ts
import assert from 'node:assert/strict'
import { serv } from '@h-ai/serv'

// 校验生产 Web 来源及原生来源。配置非法时同步抛错。
const policy = serv.createRuntimeSecurityPolicy({
  environment: 'production',
  corsOrigin: 'https://app.example.com',
  nativeOrigins: 'capacitor://localhost',
})
// 验证配置中的 Web 来源和原生来源都能匹配，生产选择 Secure 刷新 Cookie。
assert.equal(policy.allowOrigin('https://app.example.com'), true)
assert.equal(policy.isNativeOrigin('capacitor://localhost'), true)
assert.equal(policy.allowOrigin('https://other.example.com'), false)
```

生产默认会提供 `secureRefreshCookie: true`。应用在 [serv.createApp 的刷新 Cookie](#refresh-cookie)中应用该值。

<a id="cors-api"></a>

### `serv.cors` · 控制浏览器从其他来源访问 API

前端与 API 的协议、主机或端口不同时，为 API 挂载 CORS 中间件。浏览器根据响应头决定页面能否读取数据。服务器仍按会话、权限和访问策略处理请求。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `serv.cors(config?)` | 处理浏览器预检与响应头 | 可选 `ServCorsConfig`，见[字段](#serv-middleware-options)。 | `ServMiddleware`；正常预检为 HTTP 204，访问策略拒绝时为 403。普通 OPTIONS 继续路由。 | `serv.cors({ origin: policy.allowOrigin, credentials: true })` |

<a id="serv-middleware-options"></a>

##### CORS 字段

| 字段 | 类型、默认值与条件 | 生效行为 |
| --- | --- | --- |
| `cors.origin` | `string`、字符串列表或判定回调，默认 `"*"`。 | 决定向哪些页面发出 `Access-Control-Allow-Origin`。 |
| `cors.credentials` | `boolean`，默认 `false`。 | 对获准来源发出 `Access-Control-Allow-Credentials: true`。用 Cookie 的页面需要显式来源与客户端 `credentials: "include"`。 |
| `cors.methods` | 方法列表，默认 GET、HEAD、PUT、PATCH、POST、DELETE、OPTIONS。 | 告知浏览器预检允许的请求方法。 |
| `cors.allowedHeaders` | 可选请求头列表。 | 显式列表决定预检允许的请求头。省略时回显请求中的预检头列表，无列表时使用内置值。 |
| `cors.exposedHeaders` | 额外响应头列表，默认空。 | 让获准的页面脚本读取这些响应头，例如 `Retry-After`。框架已包含 `X-Request-Id` 和 `X-Trace-Id`。 |
| `cors.maxAge` | 默认为 86400 秒。 | 告知浏览器可缓存预检结果的时间。 |

内置请求头包括 `Authorization`、`Content-Type`、`X-Requested-With`、`X-Hai-Reauthentication` 和 `X-Hai-Terminal`。

把 `_serv.yml` 交给 `ServConfigSchema` 解析后，可以将得到的 `config.cors` 交给 `serv.cors(config.cors)`。最终由 `serv.createApp({ middlewares })` 挂载。 [配置示例](../configuration/serv.md#cors-example)

<a id="cors-account-example"></a>

#### 场景：让独立部署的账号页读取限流信息并刷新会话

账号页部署在 `https://app.example.com`，Serv 部署在 `https://api.example.com`。它们同站但跨源。账号页用 API Client 读取个人资料，并在窗口额度用完时提示用户等待。先按[自动续期示例](#refresh-browser-session-example)装配 IAM 和刷新 Cookie，将客户端 `baseUrl` 改为 `https://api.example.com/api/v1`。在服务端添加下列中间件。

```ts
import { serv } from '@h-ai/serv'

// 只为账号页的 Origin 添加 CORS 许可。允许浏览器接受带凭据的跨源响应，并让页面 JS 读取限流响应头。
export const accountCors = serv.cors({
  origin: 'https://app.example.com',
  credentials: true,
  exposedHeaders: ['Retry-After', 'X-RateLimit-Remaining'],
})
```

将 `{ middleware: accountCors }` 加入账号服务的 `middlewares`。

`credentials: true` 返回 `Access-Control-Allow-Credentials: true`。客户端 Cookie 模式发送 `credentials: "include"`，浏览器再按 Cookie 的 Domain、Path、Secure 和 SameSite 决定是否发送。带凭据的来源要写明确 Origin。Bearer `Authorization` 是应用设置的请求头，由预检的 `allowedHeaders` 控制。

`exposedHeaders` 返回 `Access-Control-Expose-Headers`。启用[限流](#rate-limit-example)后，浏览器诊断代码可以用 `response.headers.get("Retry-After")` 读取 429 的等待秒数，或读取 `X-RateLimit-Remaining` 更新剩余额度。服务端生成这些头，CORS 只决定哪些头可被跨源脚本读取。 `X-Request-Id`、`X-Trace-Id` 默认暴露。浏览器仍限制脚本读取 `Set-Cookie`。从未获准的 Origin 调用，浏览器会阻止页面读取响应。

在浏览器诊断页中执行下列检查。accessToken 由已登录的账号页传入。

```ts
export async function inspectAccountLimit(accessToken: string) {
  // 用当前访问令牌请求账号接口。用响应头读取额度，返回 429 时还可读取等待秒数。
  const response = await fetch('https://api.example.com/api/v1/auth/me', {
    credentials: 'include',
    headers: { Authorization: 'Bearer ' + accessToken },
  })
  return {
    status: response.status,
    remaining: response.headers.get('X-RateLimit-Remaining'),
    retryAfter: response.headers.get('Retry-After'),
  }
}
```

<a id="storage-assets-api"></a>

### `serv.storageAssets` · 从对象存储发布公开文件

将已经确定可公开的资源从 Storage 发布到固定路径，例如商城的活动配图。只允许选中的对象 key 和 MIME。私有文件通过[带认证的文件传输路由](#http-contract-extensions)读取。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `serv.storageAssets(config)` | 提供公开只读资源 | 必填 `ServStorageAssetsConfig`；挂载路径由 `middlewares` 另行选择。 | `ServMiddleware`；只接受 GET/HEAD，匹配 ETag 时 304，非法 key、MIME、过大或读取失败为 404。 | `serv.storageAssets(assetOptions)` |

<a id="storage-assets-options"></a>

##### 公开文件字段

| 字段 | 类型、默认值与条件 | 生效行为 |
| --- | --- | --- |
| `asset.storage` / `pathPrefix` | 必填 Storage 或等价 `file.head` / `file.getStreamWithMetadata` 适配器，以及绝对路径前缀。 | 从 URL 路径移除前缀后提取 key。HEAD 只查元数据，GET 同一次读取取得头与正文。 |
| `asset.keyPattern` / `allowedContentTypes` | 必填完整 key 的 `RegExp` 与 MIME 白名单。 | 只提供匹配对象；实际读取字节上限 5 MiB。 |
| `asset.cacheControl` / `crossOriginResourcePolicy` | 默认 `no-store`，无额外资源策略。 | 资源策略可取 `same-origin`、`same-site` 或 `cross-origin`。 |

#### 场景：用公开报表封面生成 Canvas 预览

订单运营台的合作方页面 `https://app.example.com` 要从独立的 API 域读取报表封面并在 Canvas 取像素。先初始化 Storage，写入公开对象 `public/report-cover.webp`，MIME 为 `image/webp`。新选项加入第 5 步的 `app.mts`。如果已启用加密，把 `/assets/public/report-cover.webp` 加入 `transport.excludePaths`。

```ts
import { storage } from '@h-ai/storage'

middlewares: [
  // 允许订单运营台的合作方页面读取图片和 ETag。公开图片请求无需凭据。
  { middleware: serv.cors({ ...settings.cors, allowedHeaders: [...settings.cors.allowedHeaders, 'If-None-Match'], exposedHeaders: [...settings.cors.exposedHeaders, 'ETag'] }) },
  {
    path: '/assets/*',
    // 只读取匹配规则的公开 WebP 对象。对象不存在或未通过规则时返回 404。
    middleware: serv.storageAssets({
      storage,
      pathPrefix: '/assets/',
      keyPattern: /^public\/report-cover\.webp$/,
      allowedContentTypes: ['image/webp'],
      cacheControl: 'public, max-age=3600',
      crossOriginResourcePolicy: 'cross-origin',
    }),
  },
],
```

在订单运营台的合作方页面运行以下代码。

```ts
// 在订单运营台的合作方页面以无凭据方式取图片。文件不存在时终止预览。
const image = await fetch('https://api.example.com/assets/public/report-cover.webp', { credentials: 'omit' })
if (!image.ok)
  throw new Error('Report cover request failed: ' + image.status)
const etag = image.headers.get('ETag')

// 把位图绘制到画布，再读取左上角像素。
const bitmap = await createImageBitmap(await image.blob())
const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
const drawing = canvas.getContext('2d')
if (!drawing)
  throw new Error('2D canvas unavailable')
drawing.drawImage(bitmap, 0, 0)
const firstPixel = drawing.getImageData(0, 0, 1, 1).data
bitmap.close()
```

首个像素可读且 `etag` 为服务端提供的值，表示浏览器已允许页面读取图像及标识。`Access-Control-Allow-Origin` 让订单运营台的合作方页面可以读取跨源响应，`Cross-Origin-Resource-Policy: cross-origin` 允许浏览器跨源嵌入资源。示例显式公开 `ETag` 供 JavaScript 读取。用同一 ETag 发送 `If-None-Match` 时，服务端返回 304，可以继续使用缓存；`HEAD` 仅返回元数据。

<a id="validation-locales"></a>

### `serv.validateInputOrFail` · 校验处理函数中的输入

契约完成基本输入检查后，可在处理函数里继续验证产品约束并返回字段级错误。例如订单预览要求标题去掉首尾空格后仍有内容。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `serv.validateInputOrFail(schema, input, locale?)` | 在处理函数内校验数据 | 必填 Zod `schema` 和数据 `input`；`locale: string` 默认 `zh-CN`。 | `HaiResult<TOutput>`；成功为解析值，失败的 `error.cause` 为本地化字段列表。 | `serv.validateInputOrFail(schema, input, context.locale)` |

<a id="validation-example"></a>

#### 场景：检查订单标题缺失和空白的区别

启动教程第 2 步的服务后，分别发送缺少标题和标题全为空格的订单预览请求。

```sh
curl -i http://127.0.0.1:3000/api/v1/orders/preview \
  -H 'Content-Type: application/json' --data '{}'
curl -i http://127.0.0.1:3000/api/v1/orders/preview \
  -H 'Content-Type: application/json' --data '{"title":"  "}'
```

缺少标题时契约直接返回 HTTP 400。空白标题能通过契约的字符串检查，处理器清理空格后返回 HTTP 200 和 `success: false`，字段错误位于 `error.cause`。 [订单预览完整示例](../getting-started/serv.md#orders-console-validation)

<a id="request-locale-api"></a>

### `serv.resolveRequestLocale` / `serv.m` · 按请求语言读取 Serv 消息

从请求中选择语言，再为日志关联的用户提示或校验结果读取对应消息。此调用保留进程默认语言。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `serv.resolveRequestLocale(headers)` | 解析请求语言 | 必填 `Headers` 或字符串映射。非空 `x-hai-locale` 优先，否则使用 `Accept-Language`。 | 按列表顺序选择可用语言，跳过 `q=0`；规范化为 `zh-CN`、`en-US`、`ja-JP`，默认 `zh-CN`。 | `serv.resolveRequestLocale(request.headers)` |
| `serv.m(key, options?)` | 读取 Serv 的本地化消息 | 必填已注册的消息键；可选 `locale` 与插值 `params`；省略时沿用当前 Core 语言。 | `string`；单次语言覆盖只用于本次读取。 | `serv.m("serv_errorForbidden", { locale: "en-US" })` |

#### 场景：向日语页面返回同一种权限错误

下例模拟日语客户端发送 `x-hai-locale: ja-JP`。先解析本次请求语言，再取得 Serv 自带的权限错误文本。

```ts
import assert from 'node:assert/strict'
import { serv } from '@h-ai/serv'

const headers = new Headers({ 'x-hai-locale': 'ja-JP' })
// 由本次请求选出 ja-JP。
const locale = serv.resolveRequestLocale(headers)
assert.equal(locale, 'ja-JP')
// 仅把本次权限提示渲染为日语。
const message = serv.m('serv_errorForbidden', { locale })
assert.notEqual(message, serv.m('serv_errorForbidden', { locale: 'en-US' }))
```

同一个消息键此时按日语显示。其他请求仍可按各自语言取消息。

<a id="generate-spec-api"></a>

### `serv.generateSpec` · 为共享契约生成 OpenAPI

为前端联调或合作方生成 OpenAPI 3.1 文件。生成文档不需要启动 HTTP 监听。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `serv.generateSpec(contract, options?)` | 从共享契约生成 OpenAPI 3.1 | 必填 `contract`；选填 `title`（默认 `hai-framework API`）、`version`（默认 `0.1.0`）、`description`、`apiPrefix`。 | `Promise<OpenAPI.Document>`；Schema 转换失败时拒绝。 | `await serv.generateSpec(contract, { title: "Orders", apiPrefix: "/api/v1" })` |

#### 场景：把订单预览接口交给联调团队

从[第 2 步](../getting-started/serv.md#orders-console-validation)的 `orders.mts` 导入订单契约。将下面的代码保存为 `export-spec.mts` 并在项目目录运行 `node export-spec.mts`。

```ts
import { writeFile } from 'node:fs/promises'
import { serv } from '@h-ai/serv'
import { orderContract } from './orders.mts'

// 把路由生成 OpenAPI 3.1 文档，servers[0].url 为 /api/v1。Schema 转换失败时 Promise 拒绝。
const spec = await serv.generateSpec(orderContract, {
  title: 'Orders API',
  version: '1.0.0',
  apiPrefix: '/api/v1',
})
// 将文档保存为 JSON，供联调团队导入。
await writeFile('orders-openapi.json', JSON.stringify(spec, null, 2) + '\n')
```

输出文件 `orders-openapi.json` 的 `paths` 含 `/orders/preview`，客户端把它与 `servers[0].url` 中的 `/api/v1` 组合。在线发布时可配置 `http.openapi`，通过 `http.docs.requireAuth` 保护文档页面。

Serv 和 Kit 按契约的 HTTP 方法分别匹配操作。为同一路径声明 GET 和 HEAD 时，HEAD 执行自身的操作并返回它的状态与响应头，无响应正文。HEAD 需要查询参数或请求头输入时，使用 `inputStructure: 'detailed'`，在输入 Schema 中声明 `query` 或 `headers`。

<a id="iam-procedures-api"></a>

### `serv.createIamProcedures` · 提供登录、账户与管理路由

每个工厂返回与对应契约形状一致的 router。只选择应用公开的节点，并在 `contract` 和 `procedures` 中保持相同的键。从 `@h-ai/serv` 导入 `serv` 及所需的类型。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `serv.createIamProcedures(deps)` | 装配标准 IAM 登录、账户和管理路由 | 必填 `deps.iam`，已初始化。 | `apiContract.iam` router；普通调用返回 `HaiResult`，管理操作按权限检查。 | `serv.createIamProcedures({ iam })` |

#### 场景：让订单运营台用户登录和恢复会话

第 4 步用 `serv.createIamProcedures({ iam })` 装配登录、资料和退出。[IAM 登录与刷新](../getting-started/serv.md#orders-console-iam) · [认证与授权](#authentication)

先按教程登录并启动本机服务。以下终端命令需要 Bash、curl 和 jq。将 `ORDERS_ACCESS_TOKEN` 设为登录返回的当前访问令牌。

```sh
set -o pipefail
ORDERS_API_ROOT='http://127.0.0.1:3000/api/v1'
curl -sS "$ORDERS_API_ROOT/auth/me" \
  -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" |
  jq -e 'if .success then {id: .data.id, roles: .data.roles} else error(.error.message) end'
```

运行后显示当前用户的 ID 和角色。它们来自服务端会话。后续文件示例把此 ID 设为 `ORDERS_USER_ID`；未登录时检查失败结果里的 `error.httpStatus`。

<a id="storage-procedures-api"></a>

### `serv.createStorageProcedures` · 为文件签发访问链接

只选择场景所需的契约节点，并从工厂返回的 router 取对应实现。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `serv.createStorageProcedures(deps)` | 装配预签名链接、列表、元数据及删除 | 必填 `storage` 与 `authorize({ operation, context, keys })`；同步或异步返回明确的 true。 | `apiContract.storage` router；任一 key 未授权时整批拒绝。 | `serv.createStorageProcedures({ storage, authorize: canUseKeys })` |

#### 场景：给登录用户签发个人文件下载链接

初始化 Storage，并用 `authorize` 核对当前会话可以使用的完整对象 key；例如只允许 `users/<已验证用户 ID>/` 内的对象。向 `POST /api/v1/storage/presigned-urls/download` 传入自己的文件 key，成功体带下载 URL；其他用户的 key 返回 `FORBIDDEN`。 启动时从应用初始化流程取得 `deps`，并用下方函数创建 HTTP 应用。 [Storage 入参与结果](storage.md)

```ts
import { apiContract } from '@h-ai/api-contract'
import { type StorageProcedureDeps, type ServIam, serv } from '@h-ai/serv'

export function createFileLinkApp(deps: StorageProcedureDeps, iam: ServIam) {
  // 只挂载本场景的操作，其他契约节点不进入应用路由。
  const routes = serv.createStorageProcedures(deps)
  const contract = { presignedUrls: { createDownload: apiContract.storage.presignedUrls.createDownload } }
  const procedures = { presignedUrls: { createDownload: routes.presignedUrls.createDownload } }
  // 装配业务契约与处理函数，使用已初始化的 IAM 验证请求令牌。
  return serv.createApp({ contract, procedures, auth: { iam } })
}
```

启动挂载了下载签名路由的服务后，使用当前用户文件列表里的真实对象 key。此处用运营台中的季度报表文件。先检查签名结果，再用获得的短期地址下载，文件请求不附上访问令牌。

```sh
report_key="users/$ORDERS_USER_ID/reports/quarterly-orders.csv"
download_url="$(
  jq -nc --arg key "$report_key" '{key: $key, expiresIn: 60}' |
    curl -sS "$ORDERS_API_ROOT/storage/presigned-urls/download" \
      -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" -H 'Content-Type: application/json' --data-binary @- |
    jq -er 'if .success then .data.url else error(.error.message) end'
)" && curl -fsS --output quarterly-orders.download.csv "$download_url"
```

实际认证和授权边界见 [serv.implement](#authentication)。

<a id="ai-procedures-api"></a>

### `serv.createAiProcedures` · 接入聊天与记忆

只选择场景所需的契约节点，并从工厂返回的 router 取对应实现。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `serv.createAiProcedures(deps)` | 装配非流式聊天、历史、会话与记忆读取 | 必填 `ai`；`authorizeObject` 选填，跨主体访问需要明确授权。 | `apiContract.ai` router；默认将 `objectId` 绑定到会话用户。 | `serv.createAiProcedures({ ai })` |

#### 场景：让登录用户发起一次聊天

初始化 AI 的聊天能力，只开放一次完成的聊天端点。登录用户向 `POST /api/v1/ai/chats/completions` 提交消息；省略 `objectId` 时使用会话用户的业务范围。成功返回聊天结果。 启动时从应用初始化流程取得 `deps`，并用下方函数创建 HTTP 应用。 [聊天输入与工具调用](ai.md)

```ts
import { apiContract } from '@h-ai/api-contract'
import { type AiProcedureDeps, type ServIam, serv } from '@h-ai/serv'

export function createChatApp(deps: AiProcedureDeps, iam: ServIam) {
  // 只挂载本场景的操作，其他契约节点不进入应用路由。
  const routes = serv.createAiProcedures(deps)
  const contract = { chats: { createCompletion: apiContract.ai.chats.createCompletion } }
  const procedures = { chats: { createCompletion: routes.chats.createCompletion } }
  // 装配业务契约与处理函数，使用已初始化的 IAM 验证请求令牌。
  return serv.createApp({ contract, procedures, auth: { iam } })
}
```

启动服务后，从已登录用户的页面发出下列请求。输入是一条订单核对问题，输出是第一条候选回复文本。业务失败时停止处理响应，由 jq 显示服务端错误。

```sh
curl -sS "$ORDERS_API_ROOT/ai/chats/completions" \
  -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" -H 'Content-Type: application/json' \
  --data '{"messages":[{"role":"user","content":"Which fields should I check when reconciling quarterly orders?"}]}' |
  jq -e 'if .success then .data.choices[0].message.content else error(.error.message) end'
```

实际认证和授权边界见 [serv.implement](#authentication)。

<a id="feedback-procedures-api"></a>

### `serv.createFeedbackProcedures` · 接入反馈提交与回复

只选择场景所需的契约节点，并从工厂返回的 router 取对应实现。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `serv.createFeedbackProcedures(deps)` | 装配反馈提交、列表、回复、附件和公开给已登录用户的发送限额 | 必填已初始化的 `deps.feedback` 与把认证会话映射到反馈范围的 `deps.resolveContext(context)`。返回 `null` 或无效主体时拒绝。 | 返回与 `apiContract.feedback` 对应的 router。应用选择需要公开的操作。 | `serv.createFeedbackProcedures({ feedback, resolveContext })` |

启用应用层加密时，用部署生效的 `limits.maxTotalFileBytes` 计算反馈写入路由的传输额度，再合并到 `routePlaintextBytes`。附件读取使用 16 MiB。 [反馈传输容量](api-contract.md#feedback-budget)

#### 场景：报告订单导出漏掉选中行

订单页用户发现导出文件缺少选中的行。在反馈表单里为这次提交生成 UUID `id`，把「导出时少了选中的行」作为 `body` 提交到 `POST /api/v1/feedback/reports`。启动时初始化 Feedback，由 `resolveContext` 从已验证的会话和应用配置取得用户与反馈范围，并把 `deps` 传给下方工厂。提交成功后，`data.id` 是反馈编号，`data.status` 为 `pending`。应用无法取得可信范围时，报告处理被拒绝。 [反馈输入与回复](feedback.md)

#### 场景：让已登录用户提交一条反馈

初始化 Feedback。宿主的 `resolveContext` 从已验证会话取得用户，按应用部署配置或可信租户映射确定反馈范围。向 `POST /api/v1/feedback/reports` 提交反馈；用户与范围有效时开始反馈流程，无可信范围时拒绝。 启动时从应用初始化流程取得 `deps`，并用下方函数创建 HTTP 应用。 [反馈输入与回复](feedback.md)

```ts
import { apiContract } from '@h-ai/api-contract'
import { type FeedbackProcedureDeps, type ServIam, serv } from '@h-ai/serv'

export function createFeedbackApp(deps: FeedbackProcedureDeps, iam: ServIam) {
  // 只挂载本场景的操作，其他契约节点不进入应用路由。
  const routes = serv.createFeedbackProcedures(deps)
  const contract = { reports: { submit: apiContract.feedback.reports.submit } }
  const procedures = { reports: { submit: routes.reports.submit } }
  // 装配业务契约与处理函数，使用已初始化的 IAM 验证请求令牌。
  return serv.createApp({ contract, procedures, auth: { iam } })
}
```

启动服务后，发送一条真实可保存的反馈。先生成本次报告的 UUID，再提交缺行现象。输出中应能看到同一 ID 和 `pending` 状态。保存该 ID 供后续查看。

```sh
report_id="$(node -p 'crypto.randomUUID()')"
jq -nc --arg id "$report_id" '{id: $id, body: "The export omitted my selected rows."}' |
  curl -sS "$ORDERS_API_ROOT/feedback/reports" \
    -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" -H 'Content-Type: application/json' --data-binary @- |
  jq -e 'if .success then {id: .data.id, status: .data.status} else error(.error.message) end'
```

实际认证和授权边界见 [serv.implement](#authentication)。

<a id="audit-procedures-api"></a>

### `serv.createAuditProcedures` · 提供审计查询

只选择场景所需的契约节点，并从工厂返回的 router 取对应实现。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `serv.createAuditProcedures(deps)` | 装配审计列表、统计和归档 | 必填 `audit`、`resolveReadScope` 和 `authorizeBackup`。读取范围为 `{ scopeId }`、显式 `{ global: true }` 或 null；归档策略检查绑定到 `audit.backup` 的再认证。 | `apiContract.extensions.audit` router；范围或再认证不符时拒绝。 | `serv.createAuditProcedures({ audit, resolveReadScope, authorizeBackup })` |

#### 场景：让审计员查看本租户日志

初始化 Audit，并注入 `resolveReadScope`，例如从可信身份映射取得 `{ scopeId: "tenant-a" }`。带 `audit:read` 权限的用户调用 `GET /api/v1/audit/logs` 后取得该租户的分页结果；请求不匹配的范围返回 `FORBIDDEN`。 启动时从应用初始化流程取得 `deps`，并用下方函数创建 HTTP 应用。 [审计日志](audit.md)

```ts
import { apiContract } from '@h-ai/api-contract'
import { type AuditProcedureDeps, type ServIam, serv } from '@h-ai/serv'

export function createAuditApp(deps: AuditProcedureDeps, iam: ServIam) {
  // 只挂载本场景的操作，其他契约节点不进入应用路由。
  const routes = serv.createAuditProcedures(deps)
  const contract = { logs: { list: apiContract.extensions.audit.logs.list } }
  const procedures = { logs: { list: routes.logs.list } }
  // 装配业务契约与处理函数，使用已初始化的 IAM 验证请求令牌。
  return serv.createApp({ contract, procedures, auth: { iam } })
}
```

从一次订单操作的响应头 `X-Request-Id` 取出 `ORDERS_REQUEST_ID`，用审计员令牌查询。结果是当前租户匹配记录的数组；没有对应审计记录时是空数组。

```sh
curl -sS --get "$ORDERS_API_ROOT/audit/logs" \
  -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" --data-urlencode "requestId=$ORDERS_REQUEST_ID" |
  jq -e 'if .success then .data.items | map({requestId, action, resource}) else error(.error.message) end'
```

实际认证和授权边界见 [serv.implement](#authentication)。

<a id="iam-management-procedures-api"></a>

### `serv.createIamManagementProcedures` · 提供角色权限与 API Key 管理

只选择场景所需的契约节点，并从工厂返回的 router 取对应实现。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `serv.createIamManagementProcedures(deps)` | 装配 API Key 与角色权限关联 | 必填 `iam` 与按用户或角色核对的 `authorize`。 | `apiContract.extensions.iam` router；内置权限与宿主检查均通过才操作。 | `serv.createIamManagementProcedures({ iam, authorize })` |

#### 场景：让管理员查看角色权限

初始化 IAM，使用 `authorize` 检查调用人能否读取目标角色。向 `GET /api/v1/iam/roles/{id}/permissions` 指定真实角色 ID；内置权限和应用授权均通过后才返回权限列表。 启动时从应用初始化流程取得 `deps`，并用下方函数创建 HTTP 应用。 [IAM 管理端点](iam.md)

```ts
import { apiContract } from '@h-ai/api-contract'
import { type IamManagementProcedureDeps, serv } from '@h-ai/serv'

export function createRolePermissionApp(deps: IamManagementProcedureDeps) {
  // 只挂载本场景的操作，其他契约节点不进入应用路由。
  const routes = serv.createIamManagementProcedures(deps)
  const contract = { roles: { listPermissions: apiContract.extensions.iam.roles.listPermissions } }
  const procedures = { roles: { listPermissions: routes.roles.listPermissions } }
  // 装配业务契约与处理函数，使用已初始化的 IAM 验证请求令牌。
  return serv.createApp({ contract, procedures, auth: { iam: deps.iam } })
}
```

从管理台选中的角色记录取出 `ORDERS_ROLE_ID`。用具有 `iam.roles.read` 且能访问该角色的管理员令牌运行。成功时列出直接授予该角色的权限码。

```sh
role_id="$(jq -nr --arg id "$ORDERS_ROLE_ID" '$id | @uri')"
curl -sS "$ORDERS_API_ROOT/iam/roles/$role_id/permissions" \
  -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" |
  jq -e 'if .success then .data | map(.code) else error(.error.message) end'
```

实际认证和授权边界见 [serv.implement](#authentication)。

<a id="ai-streaming-procedures-api"></a>

### `serv.createAiStreamingProcedures` · 接入流式聊天

当页面需要边生成边显示回复时，使用此工厂装配流式补全。只开放应用选中的契约节点。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `serv.createAiStreamingProcedures(deps)` | 装配聊天补全事件流 | `AiStreamingProcedureDeps` 中必填 `ai`。流式调用使用 `ai.llm.chatStream`。可选 `authorizeObject`，用于允许跨主体聊天。 | 返回 `chats.streamCompletion`，对应 `apiContract.extensions.ai.chats`。缺少能力时返回 503，访问未授权主体时返回 403。需通过 `transportRoutes` 挂载 SSE。 | `serv.createAiStreamingProcedures({ ai })` |

<a id="ai-stream-example"></a>

#### 场景：在页面逐段显示报表摘要并允许取消

订单运营台已经从报表接口读取当前用户有权查看的内容。用户点「总结报表」后，页面把该内容作为消息发给助手，逐段显示回复。先初始化 IAM 和支持流式聊天的 AI，再将下列节点挂到现有 Serv 应用并启动监听。例子使用同源 HTTP，公网部署使用 HTTPS。

把契约保存为 `report-chat-contract.mts`，供服务端和页面共同导入。

```ts
import { apiContract } from '@h-ai/api-contract'

const streamCompletion = apiContract.extensions.ai.chats.streamCompletion
export const reportChatContract = apiContract.create({ ai: { chats: { streamCompletion } } })
```

服务端导入同一份契约。此处只装配流式聊天，实际应用将对应节点和 SSE 路由追加到已有配置。

```ts
import { ai } from '@h-ai/ai'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'
import { reportChatContract } from './report-chat-contract.mts'

// 使用已初始化的 AI 创建处理函数。单次请求正文上限为 64 KiB。
const routes = serv.createAiStreamingProcedures({ ai })
export const app = serv.createApp({
  auth: { iam },
  contract: reportChatContract,
  procedures: { ai: { chats: { streamCompletion: routes.chats.streamCompletion } } },
  transportRoutes: [{
    procedure: reportChatContract.ai.chats.streamCompletion,
    maxRequestBytes: 64 * 1024,
  }],
})
```

安装 `@h-ai/api-client` 后，把客户端代码保存为页面可导入的 `report-chat-client.mts`。

```ts
import { apiClient } from '@h-ai/api-client'
import { reportChatContract } from './report-chat-contract.mts'

export async function streamReportSummary(
  baseUrl: string,
  accessToken: string,
  reportText: string,
  appendText: (text: string) => void,
  signal: AbortSignal,
) {
  // 为当前请求建立客户端，令牌来自登录后的页面会话。
  const client = apiClient.create(reportChatContract)
  try {
    const ready = await client.init({ baseUrl, headers: { Authorization: 'Bearer ' + accessToken } })
    if (!ready.success)
      throw new Error(ready.error.message)

    // 只发送当前页面已经获准读取的报表内容，并让取消按钮可终止此请求。
    const result = await client.ai.chats.streamCompletion({
      messages: [{ role: 'user', content: 'Summarize the following order report:\n' + reportText }],
    }, { signal })
    // 建立流之前的失败采用 HaiResult。流打开以后可逐段收到文本或迭代错误。
    if (!(Symbol.asyncIterator in result))
      throw new Error(result.error.message)

    for await (const event of result) {
      // 只显示第一条候选回复的文本增量。done 确认流完整结束。
      if (event.type === 'done')
        return
      const text = event.choices.find(choice => choice.index === 0)?.delta.content
      if (text)
        appendText(text)
    }
    signal.throwIfAborted()
    throw new Error('流未完成，请重试。')
  }
  finally {
    // 完成、失败或取消后均关闭客户端。
    await client.close()
  }
}
```

报表页放置两个按钮和一个回复区。把已渲染的元素、当前会话的 `accessToken` 与报表接口返回的 `report.summary` 传给以下接入代码。页面卸载时调用返回的清理函数。

```html
<button id="summarize-report" type="button">总结报表</button>
<button id="stop-summary" type="button" disabled>停止</button>
<pre id="report-reply" aria-live="polite"></pre>
<p id="report-summary-status" role="status"></p>
```

```ts
import { streamReportSummary } from './report-chat-client.mts'

export function bindReportSummary(page: HTMLElement, accessToken: string, reportText: string) {
  const summarize = page.querySelector<HTMLButtonElement>('#summarize-report')
  const stop = page.querySelector<HTMLButtonElement>('#stop-summary')
  const reply = page.querySelector<HTMLElement>('#report-reply')
  const status = page.querySelector<HTMLElement>('#report-summary-status')
  if (!summarize || !stop || !reply || !status)
    throw new Error('Missing report summary controls')
  let active: AbortController | undefined

  const summarizeReport = async () => {
    if (active)
      return
    const request = new AbortController()
    active = request
    summarize.disabled = true
    stop.disabled = false
    reply.textContent = ''
    status.textContent = ''
    try {
      await streamReportSummary('/api/v1', accessToken, reportText, (text) => {
        reply.textContent += text
      }, request.signal)
    }
    catch (error) {
      status.textContent = request.signal.aborted
        ? '已取消'
        : error instanceof Error ? error.message : '生成失败'
    }
    finally {
      active = undefined
      summarize.disabled = false
      stop.disabled = true
    }
  }

  const cancel = () => active?.abort()
  summarize.addEventListener('click', summarizeReport)
  stop.addEventListener('click', cancel)
  return () => {
    cancel()
    summarize.removeEventListener('click', summarizeReport)
    stop.removeEventListener('click', cancel)
  }
}
```

在报表页的数据和元素都就绪后，实际挂接点击事件。框架销毁报表页时调用 `disposeSummary()`。

```ts
const disposeSummary = bindReportSummary(reportPanel, accessToken, report.summary)
```

点击「总结报表」后，浏览器 Network 出现 `POST /api/v1/ai/chats/completions/stream`，模型产生增量时回复区逐段增加文本。点击「停止」后保留已收到的文字并标记取消。无有效会话时在开流前失败，越权访问其他主体返回 403。模型在流中出错时由迭代报错，页面显示失败提示。启用了应用层加密的同源站点，应为此 SSE 路由配置普通 HTTPS 例外。 [配置文件与流式端点](#http-contract-extensions)

<a id="ai-memory-write-procedures-api"></a>

### `serv.createAiMemoryWriteProcedures` · 新增与编辑用户记忆

把应用中编辑助手偏好的操作绑定到记忆写入路由。应用可以分别选择新增、修改、删除单条和清空。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `serv.createAiMemoryWriteProcedures(deps)` | 装配记忆写入操作 | `AiMemoryWriteProcedureDeps` 中必填 `ai`。写入使用 `ai.memory.scoped`。可用 `resolveMemoryScope(request)` 解析可写主体和作用域。省略时允许本人新增、修改和删除单条。清空须由应用明确授予作用域。 | 返回 `memories.add`、`update`、`remove`、`clear`。写入返回 `HaiResult`，主体或作用域不获准时返回 `FORBIDDEN`。 | `serv.createAiMemoryWriteProcedures({ ai, resolveMemoryScope })` |

<a id="ai-memory-write-example"></a>

#### 场景：让用户保存报告助手的格式偏好

在部署时先初始化 IAM 和具备记忆存储的 AI。报告助手的设置页只开放新增偏好。下面的应用选择 `apiContract.extensions.ai.memories.add`，省略作用域解析器，使用当前已认证用户的记忆。

```ts
import { ai } from '@h-ai/ai'
import { apiContract } from '@h-ai/api-contract'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'

const add = apiContract.extensions.ai.memories.add
const memoryRoutes = serv.createAiMemoryWriteProcedures({ ai })

// 将新增记忆节点与工厂返回的处理函数配对，由 IAM 校验请求会话。
export const app = serv.createApp({
  auth: { iam },
  contract: apiContract.create({ ai: { memories: { add } } }),
  procedures: { ai: { memories: { add: memoryRoutes.memories.add } } },
})
```

启动服务后，从已登录用户的设置页保存一条偏好。结果成功时显示新增记录的 ID。改为其他用户的 `objectId` 时，业务错误中的 `httpStatus` 为 403。

```sh
curl -sS "$ORDERS_API_ROOT/ai/memories" \
  -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" -H 'Content-Type: application/json' \
  --data '{"content":"Use bullet points for monthly report summaries.","type":"preference"}' |
  jq -e 'if .success then .data.id else error(.error.message) end'
```

<a id="iam-audio-api"></a>

### `serv.createIamAudio` · 用 IAM 为审计报表签发实时语音票据

将初始化后的 `ai`、`iam`、解析后的 `config.audio` 和业务权限传给 `serv.createIamAudio({ ai, iam, config, permission })`。将返回的 `config` 传入 `serv.createApp({ audio })`，并在对应的应用契约中配对 `apiContract.extensions.ai.audio.issueTicket` 与返回的 `issueTicket`。调用者使用业务访问令牌领取短期的一次性票据。连接时复核当前账号和权限，并使用配置的默认语音模型。

在订单运营台用 `reports:read` 控制报表摘要的实时朗读。页面点击后请求票据、连接并播放。 [从签发到浏览器播放](#audio-ticket-example)

<a id="ai-media-procedures-api"></a>

### `serv.createAiMediaProcedures` · 生成图片和语音

为有权限的用户开放媒体能力。可按需挂载语音能力查询、票据签发、转写、语音合成和图片生成。转写、合成、图片生成通过 `transportRoutes` 单独设置请求上限。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `serv.createAiMediaProcedures(deps)` | 装配语音和图像操作 | `AiMediaProcedureDeps` 中必填 `ai`，按操作提供 `audio` 或 `image`。每次调用需要 `authorizeMedia(request)` 授权，签发票据还需 `audioTickets.issue`。 | 返回 `audio.getCapabilities`、`audio.issueTicket`、`audio.transcribe`、`audio.synthesize`、`images.generate`。缺少能力或授权时失败，成功生成图片或合成语音返回 `File`。 | `serv.createAiMediaProcedures({ ai, authorizeMedia })` |

#### 场景：让审计员朗读报表并转写备注

合成端点接收不超过 5000 字符的 `text`，成功返回 WAV 或 MP3 文件。转写端点接收 WAV 或 MP3 的 multipart 字段 `audio`，文件最多 8 MiB，成功结果的 `data.text` 是转写文本。两者只需普通 HTTP 调用。 [合成和转写的装配与验证](../getting-started/serv.md#orders-console-audio)

<a id="ai-media-example"></a>

#### 场景：让有权限的报表编辑生成报表封面

在部署时先初始化 IAM 和配置了默认图像模型的 AI。报表编辑页只开放文本生成图片，应用在会话权限中检查 `reports:cover:generate`。授权回调返回空的选型结果，由已配置的默认模型生成图片。

```ts
import { ai } from '@h-ai/ai'
import { apiContract } from '@h-ai/api-contract'
import { core, HaiCommonError } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'

const generate = apiContract.extensions.ai.images.generate
const mediaRoutes = serv.createAiMediaProcedures({
  ai,
  // 只允许具备报表封面权限的会话调用图像生成，拒绝时不调用模型。
  authorizeMedia: ({ context, operation }) => operation === 'generateImage'
    && context.session.permissions.includes('reports:cover:generate')
    ? core.ok({})
    : core.err(HaiCommonError.FORBIDDEN),
})

// 只挂载图像生成路由，为文本提示和 JSON 编码配置 32 KiB 请求上限。
export const app = serv.createApp({
  auth: { iam },
  contract: apiContract.create({ ai: { images: { generate } } }),
  procedures: { ai: { images: { generate: mediaRoutes.images.generate } } },
  transportRoutes: [{ procedure: generate, maxRequestBytes: 32 * 1024 }],
})
```

启动服务后，用具有 `reports:cover:generate` 的用户令牌提交封面提示词。成功时查看 `Content-Type` 并预览下载的图片，文件名可按实际格式添加后缀。无权限时收到 HTTP 403。启用了应用层加密时，为该方法和完整路径配置 `encryption: "disabled"`。 [文件与流式传输](#http-contract-extensions)

```sh
curl -fsS "$ORDERS_API_ROOT/ai/images/generations" \
  -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" -H 'Content-Type: application/json' \
  --data '{"prompt":"A quarterly order report cover on a light background"}' \
  --dump-header - --output quarterly-report-cover
```

<a id="storage-transfer-procedures-api"></a>

### `serv.createStorageTransferProcedures` · 中转私有文件

只选择场景所需的契约节点，并从工厂返回的 router 取对应实现。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `serv.createStorageTransferProcedures(deps)` | 装配已授权的文件中转 | 必填 `storage.file.put`、`getStreamWithMetadata`，及检查完整 key 的 `authorize`。 | `apiContract.extensions.storage` router；multipart 上传和附件下载都需配置传输路由。 | `serv.createStorageTransferProcedures({ storage, authorize: canUseKey })` |

<a id="storage-file-example"></a>

#### 场景：上传并下载个人文件

用已经初始化的 Storage 和 IAM。每次请求按已验证用户核对完整对象 key。下载使用认证后的附件响应，对象路径与阅读权限由应用决定。

```ts
import { apiContract, STORAGE_PROXY_MAX_FILE_BYTES } from '@h-ai/api-contract'
import { iam } from '@h-ai/iam'
import { serv } from '@h-ai/serv'
import { storage } from '@h-ai/storage'

const contract = apiContract.extensions.storage
const { upload, download } = contract.files
// 用已初始化的 Storage 处理文件，并按用户目录核对完整 key。拒绝时不打开对象。
const procedures = serv.createStorageTransferProcedures({
  storage,
  authorize: ({ keys, context }) => keys[0].startsWith(
    'users/' + encodeURIComponent(context.session.userId) + '/',
  ),
})
export const app = serv.createApp({
  auth: { iam },
  contract,
  procedures,
  transportRoutes: [
    // 上传预算为分段元数据预留空间。下载请求使用空正文。
    { procedure: upload, maxRequestBytes: STORAGE_PROXY_MAX_FILE_BYTES + 16 * 1024 },
    { procedure: download, maxRequestBytes: 0 },
  ],
})
```

取一份本机已有的 `quarterly-orders.csv`。在首次上传成功时打印对象 key，再下载为另一个文件。重复上传同一个 key 会失败，下载另一个用户的 key 会收到 HTTP 403。

```sh
file_key="users/$ORDERS_USER_ID/reports/quarterly-orders.csv"
curl -sS "$ORDERS_API_ROOT/storage/files/upload" \
  -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" \
  --form-string "key=$file_key" --form 'file=@quarterly-orders.csv;type=text/csv' |
  jq -e 'if .success then .data.key else error(.error.message) end' &&
  curl -fsS --get "$ORDERS_API_ROOT/storage/files/download" \
    -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" --data-urlencode "key=$file_key" \
    --output quarterly-orders.download.csv
```

上传文件上限为 5 MiB，请求预算额外预留 16 KiB。成功下载带 `Content-Disposition: attachment` 和 `Cache-Control: no-store`。大型对象使用 [Storage 的预签名流程](storage.md)。

<a id="payment-close-order-procedures-api"></a>

### `serv.createPaymentCloseOrderProcedures` · 关闭经授权的订单

只选择场景所需的契约节点，并从工厂返回的 router 取对应实现。

#### 接口清单

| API | 用途 | 参数与默认值 | 返回值或失败 | 调用示例 |
| --- | --- | --- | --- | --- |
| `serv.createPaymentCloseOrderProcedures(deps)` | 装配支付关单 | 必填已初始化的 `payment.closeOrder` 与 `authorizeClose(input, context)`，由可信订单返回渠道、商户订单号或失败。 | `apiContract.extensions.payment` router；可信记录与输入不匹配时拒绝。 | `serv.createPaymentCloseOrderProcedures({ payment, authorizeClose })` |

#### 场景：让订单后台关闭指定订单

初始化 Payment 并从可信订单库取得商户订单号与渠道，应用的 `authorizeClose` 同时检查操作者和订单。调用 `POST /api/v1/payment/orders/{orderNo}/close`；授权结果与输入一致时才调用支付渠道关闭订单。 启动时从应用初始化流程取得 `deps`，并用下方函数创建 HTTP 应用。 [支付订单](payment.md)

```ts
import { apiContract } from '@h-ai/api-contract'
import { type PaymentCloseOrderProcedureDeps, type ServIam, serv } from '@h-ai/serv'

export function createOrderAdminApp(deps: PaymentCloseOrderProcedureDeps, iam: ServIam) {
  // 只挂载本场景的操作，其他契约节点不进入应用路由。
  const routes = serv.createPaymentCloseOrderProcedures(deps)
  const contract = { orders: { close: apiContract.extensions.payment.orders.close } }
  const procedures = { orders: { close: routes.orders.close } }
  // 装配业务契约与处理函数，使用已初始化的 IAM 验证请求令牌。
  return serv.createApp({ contract, procedures, auth: { iam } })
}
```

在支付沙箱中创建一个待支付订单，将可信订单记录的订单号设为 `ORDERS_PAYMENT_ORDER_NO`。以下请求适用于该记录渠道为 Stripe 的情况。结果为 `success: true` 时更新页面状态，授权失败或渠道错误时保留原状态。

```sh
order_no="$(jq -nr --arg number "$ORDERS_PAYMENT_ORDER_NO" '$number | @uri')"
curl -sS "$ORDERS_API_ROOT/payment/orders/$order_no/close" \
  -H "Authorization: Bearer $ORDERS_ACCESS_TOKEN" -H 'Content-Type: application/json' \
  --data '{"provider":"stripe"}' |
  jq -e 'if .success then {success: .success} else error(.error.message) end'
```

实际认证和授权边界见 [serv.implement](#authentication)。

<a id="error-handling"></a>

### HTTP 状态、业务错误与日志

| 请求阶段 | 可观察结果 | 调用方处理 |
| --- | --- | --- |
| 契约输入校验 | HTTP 400；本地化字段在 `error.cause`。 | 按字段修正后重新提交。 |
| 普通 procedure 守卫、二次校验或业务失败 | 默认 HTTP 200，`success: false`；认证为 401 领域状态，授权为 403。 | 先检查 `success`，再按 `error.code` 与 `httpStatus` 判断。 |
| 验证服务异常、刷新路由、文件与 HTTP 策略 | 使用真实 HTTP 错误状态；未知异常返回安全的 5xx。 | 凭据失效可按 ApiClient 刷新契约处理；403 与 5xx 不触发凭据刷新。 |

HTTP 响应携带 `X-Request-Id` 与 `X-Trace-Id`，对外标准错误保留关联编号，服务端用同一编号定位诊断。启用 Audit 后，真实的写入和 procedure 拒绝会形成 `request.execute`；契约、中间件或路由拒绝还会形成 `http.reject`。显式业务审计仍由应用在动作完成边界写入。请求级语言在并行调用之间隔离。
