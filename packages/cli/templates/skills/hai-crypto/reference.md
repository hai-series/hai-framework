# hai-crypto 参考

> `@h-ai/crypto` 提供非对称加密、哈希、对称加密与密码哈希能力，支持 Node.js 与浏览器双端。


认证协议仅支持 v2：独立随机 SM4-CBC 密钥和 HMAC-SM3 密钥由 SM2 封装，先验签、再验证 MAC，最后解密 CBC。请求由客户端私钥签名，响应由所选服务端版本签名。认证字段包括 version、direction、serverKeyId、clientId、128 位随机 requestId（兼 nonce）、issuedAt、HTTP method、pathname + 原始 search 的 SM3 pathHash，以及响应 status。请求默认有效期为 5 分钟，客户端时间最多可领先服务器 30 秒。服务端可用 `maxRequestAgeSeconds`（1～3600）和 `maxFutureSkewSeconds`（0～1800）调整，单位为整数秒。共享 registry 原子消费 (clientId, requestId)，nonce 保留到 issuedAt + 61 分钟，写入后最长保留 91 分钟，覆盖最长可配窗口及节点时钟差，存储故障拒绝请求。Redis 必须保留有效 nonce，使用 noeviction/可靠持久化策略；各节点时钟须同步。此能力防止同一传输消息重放，业务重试仍需自己的幂等键。

空 POST 也发送空明文的认证封装；GET/HEAD 将封装放在 X-Hai-Transport 头，204/205/304/HEAD 等无正文响应也使用同名头承载认证封装。其它请求/响应在 JSON 正文承载封装并带 X-Encrypted: true。客户端必须关联原请求上下文和 HTTP status，缺标记、旧格式或认证失败一律 reject；明文接口由 Serv/Kit 路径规则 `encryption: disabled` 或宿主 `excludePaths` 显式允许；调用方同步选择普通请求，API Client/Kit 包装器使用自己的 `excludePaths`。CORS 须允许并暴露 X-Hai-Transport。握手公钥的真实性依赖 TLS，不替代 IAM 业务授权。

## 运行环境

传输客户端 `destroy()` 会取消并废弃在途握手；旧握手成功或失败都不能恢复状态或影响下一代握手。单请求取消仍只停止该请求的等待。

**Node.js + 浏览器双端可用。** 浏览器端通过 `crypto.init()` 初始化（无需配置参数）。

| 能力 | Node.js | 浏览器 | 说明 |
|------|---------|--------|------|
| `crypto.asymmetric` 非对称加密 | ✅ | ✅ | SM2 加解密、签名验签 |
| `crypto.hash` 哈希 | ✅ | ✅ | SM3 哈希、HMAC |
| `crypto.symmetric` 对称加密 | ✅ | ✅ | SM4 ECB/CBC |
| `crypto.password` 密码哈希 | 同步与异步 | 同步 | 账户密码处理在服务端执行，服务端请求优先使用异步接口 |
| `crypto.transport` 传输加密 | ✅ | ✅ | 服务端管理器 + 客户端 encryptedFetch |

浏览器端主要用于 kit 传输加密场景（`kit.client.create({ transport: { crypto } })`），一般不需要直接调用 crypto API。

## 适用场景

- 非对称加密/解密、签名/验签、密钥生成
- 哈希计算与 HMAC
- 对称加密/解密（ECB/CBC 模式）
- 密码存储与验证（加盐迭代哈希）
- 传输加密：为 serv / kit / api-client 提供统一协议、密钥协商和请求响应加解密

## 使用步骤

并发调用 `close()` 会使尚未完成的 `init()` 失效，迟到初始化不会重新打开模块；等待该次初始化返回后可再次初始化。

### 1. 初始化与关闭

```typescript
import { crypto } from '@h-ai/crypto'

// 省略配置，启用默认加密和密码参数。初始化成功时 data 为 undefined，失败返回错误。
await crypto.init()

// 无参关闭加密模块和密码任务队列，等待 Promise 完成。没有业务返回值。
await crypto.close()
```

## 核心 API

### 非对称加密 — `crypto.asymmetric`

| 方法                | 签名                                                        | 说明         |
| ------------------- | ----------------------------------------------------------- | ------------ |
| `generateKeyPair`   | `() => HaiResult<KeyPair>`                                     | 生成密钥对   |
| `encrypt`           | `(data, publicKey, options?) => HaiResult<string>`             | 公钥加密     |
| `decrypt`           | `(ciphertext, privateKey, options?) => HaiResult<string>`      | 私钥解密     |
| `sign`              | `(data, privateKey, options?) => HaiResult<string>`            | 私钥签名     |
| `verify`            | `(data, signature, publicKey, options?) => HaiResult<boolean>` | 公钥验签     |
| `isValidPublicKey`  | `(key: string) => boolean`                                  | 校验公钥编码和 SM2 曲线点 |
| `isValidPrivateKey` | `(key: string) => boolean`                                  | 校验私钥编码及 1～n-2 标量范围 |

```typescript
// 无参生成 SM2 密钥对。成功 data 包含 publicKey 和 privateKey，生成失败时返回错误。
const keyPair = crypto.asymmetric.generateKeyPair()
if (keyPair.success) {
  const { publicKey, privateKey } = keyPair.data

  // 用生成的公钥加密示例文本。成功 data 是密文，公钥不合法时返回错误。
  const encrypted = crypto.asymmetric.encrypt('敏感数据', publicKey)
  if (encrypted.success) {
    // 用对应的私钥解开前一步密文。成功 data 是原文，解密失败返回错误。
    const decrypted = crypto.asymmetric.decrypt(encrypted.data, privateKey)
  }

  // 用私钥为「待签名数据」生成签名。成功 data 是签名字符串。
  const signature = crypto.asymmetric.sign('待签名数据', privateKey)
  if (signature.success) {
    // 用公钥验证同一文本与签名是否匹配。成功 data 为布尔值。
    const valid = crypto.asymmetric.verify('待签名数据', signature.data, publicKey)
  }
}
```

**AsymmetricEncryptOptions**：`{ cipherMode?: 0 | 1, outputFormat?: 'hex' | 'base64' }`
SM2 加密只接受非空明文，错误私钥、畸形密文或 C3 认证失败返回失败，不能把空串当作成功。私钥须为 64 hex 且在 1～n-2；签名须为 128 hex，非规范编码验签返回 false。SM2 的限制不影响使用 SM4 的 transport 空消息。

**SignOptions**：`{ hash?: boolean, userId?: string }`

### 哈希 — `crypto.hash`

| 方法     | 签名                                                       | 说明     |
| -------- | ---------------------------------------------------------- | -------- |
| `hash`   | `(data: string \| Uint8Array, options?) => HaiResult<string>` | 哈希     |
| `hmac`   | `(data, key) => HaiResult<string>`                            | HMAC     |
| `verify` | `(data, expectedHash) => HaiResult<boolean>`                  | 验证哈希 |

```typescript
// 对 hello 计算 SM3，成功 data 是 64 字符十六进制摘要。
const hash = crypto.hash.hash('hello')
// 用示例密钥对 hello 计算 HMAC-SM3，成功 data 是 64 字符十六进制认证码。
const hmac = crypto.hash.hmac('hello', 'secret-key')
if (hash.success) {
  // 重新计算 hello 的摘要，与上一步 data 比较。成功 data 为 true。
  const valid = crypto.hash.verify('hello', hash.data)
}
```

**HashOptions**：`{ inputEncoding?: 'utf8' | 'hex' }`。hex 必须是完整的十六进制字节，否则返回 INVALID_INPUT。HMAC 密钥按 UTF-8 字节长度与 64 字节块比较，超过时先做 SM3；非 ASCII 长密钥也按 UTF-8 字节执行标准 HMAC，transport 使用 64 字节 ASCII 密钥。

### 对称加密 — `crypto.symmetric`

| 方法            | 签名                                            | 说明                        |
| --------------- | ----------------------------------------------- | --------------------------- |
| `generateKey`   | `() => string`                                  | 生成 128-bit 密钥（32 hex） |
| `generateIV`    | `() => string`                                  | 生成随机 IV（32 hex）       |
| `encrypt`       | `(data, key, options?) => HaiResult<SymmetricEncryptedPayload>` | 加密（返回结构化密文）      |
| `decrypt`       | `(payload, key) => HaiResult<string>`          | 解密结构化密文              |
| `encryptWithIV` | `(data, key) => HaiResult<EncryptWithIVResult>`    | CBC 模式加密（自动生成 IV） |
| `decryptWithIV` | `(ciphertext, key, iv) => HaiResult<string>`       | CBC 模式解密                |
| `isValidKey`    | `(key: string) => boolean`                      | 校验密钥格式                |
| `isValidIV`     | `(iv: string) => boolean`                       | 校验 IV 格式                |

SM4 密钥使用 `generateKey()` 生成；本模块不提供密码 KDF。密码存储使用服务端 `crypto.password.hashAsync()`，不要将密码或密码哈希直接用作 SM4 密钥。

```typescript
// 无参生成 SM4 随机密钥，直接返回十六进制字符串。
const key = crypto.symmetric.generateKey()

// 默认安全用法：CBC + 自动 IV，返回 { mode, ciphertext, iv, encoding }
// 用 key 加密示例明文，成功 data 含模式、密文、IV 和编码。
const encrypted = crypto.symmetric.encrypt('明文数据', key)
if (encrypted.success) {
  // 用相同 key 和完整加密对象恢复原文，失败时返回 HaiResult 错误。
  const decrypted = crypto.symmetric.decrypt(encrypted.data, key)
}

// 需要单独存储 IV 时使用结构化结果
// 用 key 加密同一明文，成功 data 可分别读取 ciphertext 和 iv。
const withIV = crypto.symmetric.encryptWithIV('明文数据', key)
if (withIV.success) {
  // 传入刚生成的密文、原密钥和对应 IV，成功 data 为原始明文。
  const decrypted = crypto.symmetric.decryptWithIV(withIV.data.ciphertext, key, withIV.data.iv)
}
```

**SymmetricEncryptOptions**：`{ mode?: 'ecb' | 'cbc', iv?: string, outputFormat?: 'hex' | 'base64' }`
**SymmetricEncryptedPayload**：`{ mode: 'ecb' | 'cbc', ciphertext: string, iv?: string, encoding: 'hex' | 'base64' }`

SM4 拒绝未知 mode/encoding、空密文、非完整分组、无效 PKCS#7 和非法 UTF-8；空明文仍产生完整的填充分组。Base64 编解码支持大输入，不将整份密文展开为函数参数。CBC 原语不提供消息认证，HTTP 使用 transport。

> `encrypt()` 默认使用 CBC 并自动生成 IV。ECB 会泄漏明文结构，只有底层协议明确要求时才显式 `{ mode: 'ecb' }`。

### 密码哈希 — `crypto.password`

| 方法     | 签名                                    | 说明     |
| -------- | --------------------------------------- | -------- |
| `hash`   | `(password, config?) => HaiResult<string>` | 密码哈希 |
| `verify` | `(password, hash) => HaiResult<boolean>`   | 验证密码 |
| `hashAsync` | `(password, config?) => Promise<HaiResult<string>>` | Node.js 异步哈希 |
| `verifyAsync` | `(password, hash) => Promise<HaiResult<boolean>>` | Node.js 异步验证 |

```typescript
// 异步哈希示例口令，成功 data 是可持久化的密码哈希记录，队列满时返回 PASSWORD_BUSY。
const hashed = await crypto.password.hashAsync('MyPassword123')
if (hashed.success) {
  // 以示例口令验证生成的哈希，成功 data 为 true，口令不符时为 false。
  const valid = await crypto.password.verifyAsync('MyPassword123', hashed.data)
}
```

哈希格式：`$hai$<iterations>$<salt>$<hash>`
**PasswordConfig**：`{ saltLength?: number, iterations?: number }`。盐为 8～128 个字母数字字符（默认 16），轮数为 1～1000000 的整数（默认 10000）。verify 严格校验整个 `$hai$iterations$salt$hash` 记录，迭代数使用无前导符号的规范十进制，摘要为 64 个小写 hex；畸形记录返回 INVALID_INPUT，正常记录继续有效。

在 Node.js 服务的注册或登录请求中使用异步方法。每个进程最多运行 4 个密码 Worker，并保留 32 个等待位置。线程按需启动，等待队列满时返回 `HaiCryptoError.PASSWORD_BUSY`（HTTP 503）。`crypto.close()` 会结束尚未完成的任务并等待线程退出，此类任务返回 `NOT_INITIALIZED`。同步接口与浏览器入口继续使用同一密码记录格式。

### 传输加密 — `crypto.transport`

传输加密主工厂必须从 `crypto.transport` 访问；共享 `keyStore` provider 请从 `@h-ai/crypto` 根入口导入，不从子目录内部路径导入。

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `createServer` | `({ serverKeyRing, keyStore }) => HaiResult<TransportEncryptionManager>` | 校验受管密钥环并创建管理器，两项必填 |
| `createClient` | `({ keyExchangeUrl, fetch? }) => TransportClient` | 创建客户端 encryptedFetch 会话 |
| `protocol` | `crypto.transport.protocol` | 协议常量：`X-Client-Id`、`X-Encrypted`、默认协商路径 |

共享 `keyStore` provider（从 `@h-ai/crypto` 根入口导入）：

| 工厂 | 签名 | 说明 |
| --- | --- | --- |
| `crypto.transport.createKeyStore` | `({ cache, ttlSeconds?, maxRegistrationsPerMinute?, maxRequestsPerMinute? }) => TransportKeyStore` | 统一缓存实现；借用已初始化的 `@h-ai/cache`，不接管连接生命周期 |

这两项配额用于整个应用的缓存容量保底，不代替按 IP/用户/接口的业务限流。默认每60秒10000次登记、100000个新请求编号。首次占额起满60秒结束，达到上限返回503而保留已有公钥和请求标记；下一轮可继续使用，不是累计最多只能有这些公钥或请求。提高上限须增加内存预算。

公钥登记前校验 SM2 编码与曲线点。`ttlSeconds` 默认 3600，整数 1～86400 秒，读取不续期；新公钥和新请求分别受共享分钟配额约束，默认 10000/100000，均为正安全整数。所有节点使用相同后端、前缀及配额。

配额由固定两条键的原子 CAS 更新，首次写入开启 60 秒窗口，后续更新保留 TTL，Redis 过期决定窗口结束。满额或持续争用携带 `hai:crypto:072`，Serv/Kit 返回 503；有效 nonce 不因容量满、删除客户端或业务失败而提前移除。公钥、nonce 和配额都有 TTL，无须应用维护扫描。生产使用 Redis、`noeviction`、可靠持久化和独立内存预算；memory 只用于开发和测试。默认有效公钥最多跨 61 个配额窗口，nonce 最多跨 92 个窗口，物理内存回收还受后端到期清理时机影响。

```ts
import { cache } from '@h-ai/cache'
import { crypto } from '@h-ai/crypto'

// cache 由应用初始化并在所有使用方关闭后释放。
// 用已初始化的共享 cache 创建密钥登记库，记录保留一小时，并配置注册与请求的每分钟上限。
const registry = crypto.transport.createKeyStore({
  cache,
  ttlSeconds: 3600,
  maxRegistrationsPerMinute: 10000,
  maxRequestsPerMinute: 100000,
})
```

```typescript
// 用受管密钥环和密钥登记库创建服务端。成功 data 是传输加密管理器，配置无效返回错误。
const server = crypto.transport.createServer({ serverKeyRing, keyStore })
if (!server.success)
  return server

// 用 HTTPS 密钥交换地址创建传输客户端，返回可发起加密请求的实例。
const client = crypto.transport.createClient({
  keyExchangeUrl: 'https://api.example.com/api/v1/_hai/key-exchange',
})

// 向 echo 地址发送 JSON POST，自动协商密钥并校验响应。成功返回 Response，网络或协议校验失败会拒绝。
const resp = await client.encryptedFetch('https://api.example.com/api/v1/echo', {
  method: 'POST',
  body: JSON.stringify({ hello: 'world' }),
})
```

```typescript
import { crypto } from '@h-ai/crypto'
import { cache } from '@h-ai/cache'

// 连接本机 Redis 6379，成功 data 为 undefined，无法连接时返回错误。
await cache.init({ type: 'redis', host: '127.0.0.1', port: 6379 })

// 用已有密钥环和下方的共享登记库创建服务端。成功 data 是管理器。
const sharedServer = crypto.transport.createServer({
  serverKeyRing,
  // 将已初始化的 Redis cache 用作登记库，公钥登记保留 3600 秒，返回存储接口。
  keyStore: crypto.transport.createKeyStore({ cache, ttlSeconds: 3600 }),
})
```

使用流程：
1. 先 `await crypto.init()`。
2. 服务端显式传入受管 `serverKeyRing` 和共享 `keyStore`。协商响应包含 `serverKeyId`、`serverPublicKey`、`clientId`、`maxPlaintextBytes` 和可选的 `clientKeyTtlSeconds`。自定义适配器读取 `manager.clientKeyTtlSeconds` 填充登记有效期。
3. 客户端 `createClient({ keyExchangeUrl })` 后，首次使用或登记临近到期时自动协商。并发请求共享握手，协商响应的公钥曲线点、clientId 编码和长度都通过校验后才发布 ready 状态，再发送业务请求。
4. 所有请求均发送 v2 认证封装；包括 GET/HEAD 和无 input POST，不能只附带 clientId。
5. 自定义适配器先 await crypto.transport.authenticateRequest(manager, request)，再用 manager.encryptResponse(verified.data.context, data, status) 关联响应。
6. 客户端收到 `X-Encrypted: true` 的响应后自动解密；`destroy()` 可清空当前会话。

`encryptedFetch()` 与原生 fetch 一样会 reject：网络错误、密钥协商失败、请求加密失败或响应解密失败都应在调用方按 fetch 错误处理策略捕获。

### 受管服务端密钥与轮换

`serverKeyRing` 为 `{ activeKeyId, keys: { [id]: { publicKey, privateKey } } }`，ID 为 1–64 个字母、数字、下划线或连字符。根入口 `crypto.transport.parseServerKeyRing(secret)` 接受服务端 Secret JSON 或配置对象，返回 HaiResult，错误不附带原始 Secret 或解析片段。工厂验证每对公私钥并捕获快照；没有隐式随机私钥或 memory registry 回退。`keyStore` 也必填，生产使用 Redis；开发/测试可将显式初始化的 memory cache 传入 `crypto.transport.createKeyStore({ cache })`。

服务端读取 `HAI_CRYPTO_TRANSPORT_SERVERKEYRING`，检查解析结果后只传给服务端工厂。开发、测试示例值保存在可提交的 `.env.dev`、`.env.test`；生产值保存在 `.env.prod.local` 或 Secret Manager，不使用公开示例密钥。私钥不能进入 PUBLIC_/VITE_、日志或响应。同一环境所有节点共享 ring 与 registry，启动时不生成替代密钥。

请求密文 `EncryptedRequestPayload` 携带协商的 `serverKeyId`；服务端只按 ID 选择私钥，未知/撤销 ID 拒绝，不尝试其它 key。轮换先向所有节点分发包含新旧版本的 ring，再切 activeKeyId 并滚动重建 manager；过渡期后删除旧 ID 并更新所有节点。旧客户端 destroy 后重协商；禁止自动重放非幂等请求。共享 ring + registry 支持跨节点与重启，不依赖 sticky session。

```ts
import { crypto } from '@h-ai/crypto'

// 解析环境变量中的密钥环。成功 data 为密钥环，缺失或格式不合法时返回错误。
const ring = crypto.transport.parseServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
if (!ring.success)
  throw new Error(ring.error.message)
// 用解析出的密钥环和共享登记库构建服务端。成功 data 为管理器。
const manager = crypto.transport.createServer({ serverKeyRing: ring.data, keyStore: sharedRegistry })
```

### 传输正文预算与自定义适配器

业务容量统一配置 transport.maxPlaintextBytes：UTF-8 JSON 明文字节，默认 1 MiB，有效整数范围 1 KiB～64 MiB，请求和响应共用。客户端从握手获取服务端预算，可选本地上限取较小值；crypto.transport.resolveBodyLimits(limit, { requiredPlaintextBytes }) 合并模块需求：保留显式上限，不足时报配置冲突；省略时按需要推导，无模块需要仍为 1 MiB。Serv/Kit 的 auto 规范化为 undefined。密文预算为两倍明文加 32 KiB。握手 JSON 16 KiB、公钥 4 KiB、认证头 16 KiB、路径 8 KiB、认证及防重放保持独立。原流超限/取消立即停止、取消并释放 reader；请求 413、响应返回加密的 500 容量错误，客户端识别 TransportBodyTooLargeError / hai:crypto:070。 自定义适配器使用 manager.bodyLimits 和 crypto.transport.readBody 消费原流，不 clone/tee；握手返回 maxPlaintextBytes。

Serv/Kit 对通过请求绑定、签名和 MAC 校验但超出时间窗口的请求返回加密的 HTTP 400 错误。客户端抛出 `TransportTimeError`（`hai:crypto:071`），显示校验时的服务器 UTC 时间，提示开启设备的自动校时或手工修改时间后刷新。`serverTime` 为 Unix 毫秒。`api-client` 映射为 `VALIDATION_FAILED`，在 `cause.transportCode` 和 `cause.serverTime` 保留诊断信息。

自定义 HTTP 适配器检查失败原因 `error instanceof TransportTimeError && error.context` 后，使用 `crypto.transport.createErrorResponse(error, { manager, context: error.context })` 加密拒绝响应；不能根据未认证报文的时间戳给出可信时间诊断。

根入口纯函数 `crypto.transport.readBody(stream, { maxBytes, signal? })` 无需 init，直接消费原始流；超限抛 RangeError，无效 UTF-8 抛 TypeError，保留读取异常或 signal.reason。超限/取消会立即取消流并释放 reader，清理失败不覆盖原异常。不要把 clone/tee 分支交给它，否则另一分支仍可能缓冲正文。成功读取后重建 Request/Response，清除旧 Content-Length/Content-Encoding 并保留 signal。

```ts
import { crypto } from '@h-ai/crypto'

// 按密钥交换字节上限读取请求体为文本。超限或请求取消时会拒绝。
const text = await crypto.transport.readBody(request.body, {
  maxBytes: crypto.transport.bodyLimits.keyExchangeBytes,
  signal: request.signal,
})
const payload: unknown = JSON.parse(text)
```

常规应用优先使用上层封装：
- serv：`serv.createApp({ transport: { crypto, serverKeyRing, keyStore } })`
- kit：`kit.createHandle({ crypto: { crypto, transport: { serverKeyRing, keyStore } } })` + `kit.client.create({ transport: { crypto } })`
- api-client：`apiClient.init({ transport: { crypto } })`

## 错误码 — `HaiCryptoError`

| 错误码 | code | 说明 |
|--------|------|------|
| `HaiCryptoError.INVALID_INPUT` | `hai:crypto:002` | 无效输入 |
| `HaiCryptoError.INVALID_KEY` | `hai:crypto:003` | 无效密钥 |
| `HaiCryptoError.NOT_INITIALIZED` | `hai:crypto:010` | 未初始化 |
| `HaiCryptoError.INIT_FAILED` | `hai:crypto:011` | 初始化失败 |
| `HaiCryptoError.KEY_GENERATION_FAILED` | `hai:crypto:020` | 密钥生成失败 |
| `HaiCryptoError.ENCRYPTION_FAILED` | `hai:crypto:021` | 加密失败 |
| `HaiCryptoError.DECRYPTION_FAILED` | `hai:crypto:022` | 解密失败 |
| `HaiCryptoError.SIGN_FAILED` | `hai:crypto:023` | 签名失败 |
| `HaiCryptoError.VERIFY_FAILED` | `hai:crypto:024` | 验签失败 |
| `HaiCryptoError.HASH_FAILED` | `hai:crypto:040` | 哈希计算失败 |
| `HaiCryptoError.HMAC_FAILED` | `hai:crypto:041` | HMAC 计算失败 |
| `HaiCryptoError.PASSWORD_BUSY` | `hai:crypto:042` | 密码任务等待队列已满，HTTP 503 |
| `HaiCryptoError.INVALID_IV` | `hai:crypto:060` | 无效 IV |

| `HaiCryptoError.TRANSPORT_PAYLOAD_TOO_LARGE` | `hai:crypto:070` | 传输容量超限 |
| `HaiCryptoError.TRANSPORT_TIME_INVALID` | `hai:crypto:071` | 已认证请求时间超出窗口 |
| `HaiCryptoError.TRANSPORT_BUSY` | `hai:crypto:072` | 共享配额满或持续争用，HTTP 503 |

## 常见模式

### 数据加密存储

```typescript
const key = process.env.HAI_CRYPTO_DATA_KEY!
// 用部署提供的密钥加密待入库数据。成功 data 是包含 IV 和密文的结构化对象。
const encrypted = crypto.symmetric.encrypt(sensitiveData, key)
// 存入数据库

// 读取时解密
// 读取已存加密对象并用原密钥恢复明文。密钥或数据不合法时返回错误。
const decrypted = crypto.symmetric.decrypt(storedPayload, key)
```

> 默认密文是结构化对象，必须完整存储 `mode` / `ciphertext` / `iv` / `encoding` 字段；如果数据库字段已拆分 IV 与密文，请改用 `encryptWithIV()` / `decryptWithIV()`。

### 密码存储与验证

```typescript
// 注册时哈希存储
// 哈希注册表单的密码，成功 data 是带盐的哈希记录，可存数据库。
const hashResult = await crypto.password.hashAsync(userPassword)
if (hashResult.success) {
  // 存储 hashResult.data 到数据库
}

// 登录时验证
// 用登录表单里的口令验证数据库哈希。成功 data 为 true 或 false，处理故障另走失败结果。
const verifyResult = await crypto.password.verifyAsync(inputPassword, storedHash)
if (verifyResult.success && verifyResult.data) {
  // 密码匹配
}
```

## 相关 Skills

- `hai-core`：配置与 HaiResult 模型
- `hai-iam`：密码哈希（内部自动调用 crypto.password）
- `hai-kit`：SvelteKit 集成（传输加密）
- `hai-serv` / `hai-api-client`：跨域 HTTP API 的透明传输加密

管理端在线加密演示直接调用 Crypto SM3/SM4 API，SM4 使用随机临时密钥和 IV，并在显示成功前解密校验；密钥不保存。输入改变即清空旧结果，禁止用随机摘要或 Base64 伪装算法结果。

## 生产共享状态

生产传输 registry 必须声明 stateScope=shared 并使用真实 Redis，memory cache 会被拒绝；各节点加载相同受管版本化密钥环。 NODE_ENV 或 HAI_CORE_ENV 为 production 时在初始化成功前检查，只有 HAI_E2E=1/HAI_E2E_MOCK=1 明确测试豁免。不要将租约当作最终写入条件，外部未知效果须按稳定业务键核对。
