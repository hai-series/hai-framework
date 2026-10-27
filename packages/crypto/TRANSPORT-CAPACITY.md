# 加密传输容量配置与升级

`transport.maxPlaintextBytes` 表示**单个请求或响应的完整 JSON 明文 UTF-8 字节数**，两个方向使用同一上限。默认 `1048576`（1 MiB），有效范围是 `1024`～`67108864`（1 KiB～64 MiB）的整数；不接受字符串、零、负数、小数或无限制。此设置只影响启用 transport 的路径。

## 一份业务配置

serv 应用在 `config/_serv.yml` 设置：

```yaml
transport:
  maxPlaintextBytes: ${HAI_SERV_TRANSPORT_MAXPLAINTEXTBYTES:8388608}
  keyExchangePath: /_hai/key-exchange
```

同源 SvelteKit 使用 `config/_kit.yml` 的同名字段，环境变量是 `HAI_KIT_TRANSPORT_MAXPLAINTEXTBYTES`。应用装配时将该字段连同路径配置传入 `serv.createApp({ transport })` 或 `kit.createHandle({ crypto: { transport } })`。生成的 API/fullstack 模板已完成转发。

直接使用 crypto 时：

```ts
import { crypto, resolveTransportBodyLimits } from '@h-ai/crypto'

// 上下文：crypto 已初始化，serverKeyRing 和 keyStore 已由应用装配。
const created = crypto.transport.createServer({ serverKeyRing, keyStore, maxPlaintextBytes: 8 * 1024 * 1024 })
if (!created.success)
  throw new Error(created.error.message)
const proxyBytes = resolveTransportBodyLimits(created.data.bodyLimits.plaintextBytes).encryptedPayloadBytes
```

serv/kit 在密钥协商中返回 `maxPlaintextBytes`。crypto、api-client 和 kit 的新版客户端默认跟随服务端容量，无需额外维护客户端阈值；如显式配置客户端 `maxPlaintextBytes`，取它与服务端上限的较小值。自定义握手端点也应返回 `manager.bodyLimits.plaintextBytes`，并保持原来的 16 KiB 握手读取限制。

## 模块需求与显式配置

Serv/Kit 配置另支持 auto，解析为 undefined；直接 crypto API 仍接受数字或 undefined。接入反馈时调用 resolveTransportBodyLimits(configuredLimit, { requiredPlaintextBytes: feedback.budget.maxTransportBytes })，只在未显式设置时按需要推导；无模块需要仍为 1 MiB。显式 24 MiB 不会被较小反馈预算覆盖，显式值低于反馈需要则启动/打包失败。反馈模板默认 auto；已有项目保留显式值，升级时处理冲突。

## 文件、明文与密文

按 `new TextEncoder().encode(JSON.stringify(payload)).byteLength` 判断明文大小，字符数不能代替字节数。文件 base64 字符数为 `4 * ceil(文件字节数 / 3)`，再加 JSON 字段、文件名、其他业务字段及转义的字节。4 MiB XLSX 本体为 `4194304` 字节，base64 为 `5592408` 字节；常见包装可用 8 MiB 明文预算。直接把任意二进制当 UTF-8 发送不受支持，文件仍使用应用已约定的 JSON/base64 格式。

SM4-CBC 的十六进制密文约为明文的两倍。框架统一使用 `encryptedPayloadBytes = 2 * maxPlaintextBytes + 32768`，其中 32 KiB 容纳块填充和有界认证封装。8 MiB 明文对应 `16809984` 字节代理请求上限。应用只配置明文值，不手写密文阈值。

内存使用量会高于文件或明文大小：JSON、base64、密文和认证计算会同时持有数据。该配置不是业务文件许可；文件原始字节、压缩包解压大小、工作表/行数、业务权限和并发预算继续由应用检查。

## 安全预算与错误

握手 JSON 16 KiB、公钥 4 KiB、认证头封装 16 KiB、路径 8 KiB、握手超时 30 秒，以及签名、MAC、方法/路径/状态绑定、认证和共享原子防重放均保持独立，提升业务容量不会放宽这些约束。

超限会停止读取、取消原始流并释放 reader；不依赖 Content-Length，也不 clone/tee 后完整缓冲。客户端抛出 `TransportBodyTooLargeError`（继承 RangeError），稳定码为 `hai:crypto:070`，包含 `direction`、`stage`、`limitBytes` 和可用时已观察到的 `actualBytes`（流提前终止时可能小于完整报文大小）。`stage` 为 `plaintext`、`encrypted` 或 `header`，不附带报文内容。

请求拒绝返回 HTTP 413。已认证请求产生的过大响应被替换为加密的 HTTP 500 容量错误，客户端验证后恢复相同类型的错误。请求在认证完成前被拒绝或代理直接返回 413 时，客户端只将其识别为请求容量失败并取消正文，不把未认证数据作为业务响应。api-client 将容量错误映射为失败 HaiResult：`HaiApiClientError.PAYLOAD_TOO_LARGE`（`hai:api-client:020`），保留方向与字节诊断。

## 正式部署与增量更新

docker-ssh 从目标环境解析后的同一 `_serv.yml` 生成 Nginx `client_max_body_size`，关闭请求/响应 buffering。Nginx 不设置业务响应体上限，响应明文及密文由服务端和客户端检查；认证头缓冲仍保持独立。SvelteKit 部署从 `_kit.yml` 自动推导 adapter-node 的 `BODY_SIZE_LIMIT`，覆盖其较小默认值。

全量部署直接使用新预算。仅更新 app 的增量包也携带新代理配置；容量变化时复用现有 Web 镜像，重建 Web 以挂载新配置，并把 Web 纳入健康检查和失败恢复。无需构建或上传新 Web 镜像。增量仅允许容量指令改变，端口、API 路由或其他代理策略改变仍要求全量部署；容量变动却未选择 app 时明确拒绝并提示包含 app。容量不变时保留现有 Web 容器。

自管代理和自管 adapter-node 启动器应调用 `resolveTransportBodyLimits()` 取得派生预算；不要保留 2129920 或 adapter 默认正文阈值。外部 CDN/网关的独立限制仍须由运营方配置。

## 从 alpha.68 容量补丁升级

1. 同步升级 crypto、serv/kit、api-client 和 CLI/deploy，重新构建浏览器/桌面/移动客户端与服务端。
2. 在服务端正式配置中设置所需明文预算（例如 8 MiB），将字段转发到创建服务端 transport 的配置对象，然后移除依赖补丁。
3. 部署 app；全量或 app 增量均可。让客户端重新握手（重新加载或 destroy 后 init），已有会话不会在后台自动更新容量。
4. 验证原 4 MiB XLSX、较大合法 JSON、请求与响应超限及业务安全校验。

手写 `TransportEncryptionManager` 或测试替身需补充只读 `bodyLimits`，可直接使用 `resolveTransportBodyLimits()` 的返回值。未设置新字段的普通应用保留 1 MiB 行为。新版客户端连接没有容量字段的旧握手端点时使用 1 MiB；旧客户端连接新服务端仍受其自身固定阈值约束，不能仅升级服务端就宣称大报文已可用。降低服务端容量会立即拒绝过大的旧会话请求，客户端需重新握手获取新预算。
