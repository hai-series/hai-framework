# @h-ai/crypto

[简体中文](./README.md) | [English](./README.en.md) | [日本語](./README.ja.md)

[框架首页](../../README.md) · 相关模块：[@h-ai/cache](../cache/README.md) · [@h-ai/core](../core/README.md) · [@h-ai/reldb](../reldb/README.md)

## 简介

加密模块，提供非对称加密、哈希、对称加密与密码哈希能力。

## 核心功能清单

- 非对称加密（密钥生成、加解密、签名验签）
- 哈希（哈希、HMAC、验证）
- 对称加密（ECB/CBC 模式）
- 密码哈希（加盐迭代哈希）
- 传输加密（`crypto.transport`：服务端管理器 + 客户端 `encryptedFetch`）
- SM2/SM3/SM4 与传输支持 Node.js / 浏览器；密码哈希仅服务端

## 使用入门

### 安全声明

- **SM4 默认加密返回结构化密文**：`crypto.symmetric.encrypt(data, key)` 默认使用 CBC + 随机 IV，返回 `{ mode, ciphertext, iv, encoding }`；解密时把该对象传给 `crypto.symmetric.decrypt(payload, key)`。
- **SM4 使用随机密钥**：通过 `crypto.symmetric.generateKey()` 生成密钥；本模块不提供从密码派生加密密钥的 KDF。密码存储使用服务端 `crypto.password.hash(password)`，不要将密码或密码哈希直接用作 SM4 密钥。
- **IV 必须唯一**：相同密钥下禁止复用 IV；推荐使用默认 CBC 或 `encryptWithIV()` 每次自动生成。密文与 IV 需一同传输与存储（IV 可公开，不必保密）。

### 快速开始

```ts
import { crypto } from '@h-ai/crypto'

// 初始化（使用前必须调用）
const initialized = await crypto.init()
if (!initialized.success)
  throw new Error(initialized.error.message)
```

#### 非对称加密（加解密 / 签名验签）

```ts
// 生成密钥对
const keyPair = crypto.asymmetric.generateKeyPair()
if (!keyPair.success)
  throw new Error(keyPair.error.message)
const { publicKey, privateKey } = keyPair.data

// 加密 / 解密
const encrypted = crypto.asymmetric.encrypt('Hello', publicKey)
if (encrypted.success) {
  const decrypted = crypto.asymmetric.decrypt(encrypted.data, privateKey)
  // decrypted.data === 'Hello'
}

// 输出 base64 格式密文
const b64 = crypto.asymmetric.encrypt('Hello', publicKey, { outputFormat: 'base64' })

// 签名 / 验签
const sig = crypto.asymmetric.sign('important data', privateKey)
if (sig.success) {
  const valid = crypto.asymmetric.verify('important data', sig.data, publicKey)
  // valid.data === true
}

// 校验密钥格式
crypto.asymmetric.isValidPublicKey(publicKey) // true
crypto.asymmetric.isValidPrivateKey(privateKey) // true
```

#### 哈希（Hash / HMAC / 验证）

```ts
// 字符串哈希
const hash = crypto.hash.hash('Hello!')
// hash.data → 64 字符十六进制哈希值

// Uint8Array 输入
const buf = new TextEncoder().encode('Hello!')
const hashBuf = crypto.hash.hash(buf)

// 十六进制编码输入
const hashHex = crypto.hash.hash('48656c6c6f21', { inputEncoding: 'hex' })

// HMAC
const hmac = crypto.hash.hmac('message', 'secret-key')

// 验证哈希是否匹配
if (hash.success) {
  const matched = crypto.hash.verify('Hello!', hash.data)
  // matched.data === true
}
```

#### 对称加密（CBC 默认 / 结构化密文）

```ts
// 生成随机密钥和 IV
const key = crypto.symmetric.generateKey()
const iv = crypto.symmetric.generateIV()

// 默认：CBC + 自动随机 IV，返回结构化密文
const safeEnc = crypto.symmetric.encrypt('data', key)
if (safeEnc.success) {
  // safeEnc.data: { mode: 'cbc', ciphertext, iv, encoding: 'hex' }
  const safeDec = crypto.symmetric.decrypt(safeEnc.data, key)
  // safeDec.data === 'data'
}

// CBC 指定 IV（仍然返回结构化密文）
const cbcEnc = crypto.symmetric.encrypt('data', key, { mode: 'cbc', iv })
if (cbcEnc.success) {
  const cbcDec = crypto.symmetric.decrypt(cbcEnc.data, key)
}

// 结构化结果：自动生成 IV 的 CBC 加解密
const withIV = crypto.symmetric.encryptWithIV('data', key)
if (withIV.success) {
  const dec = crypto.symmetric.decryptWithIV(withIV.data.ciphertext, key, withIV.data.iv)
}

// ECB 模式（❌ 不安全；只有底层协议明确要求时才显式指定）
const ecbEnc = crypto.symmetric.encrypt('data', key, { mode: 'ecb' })
if (ecbEnc.success) {
  const ecbDec = crypto.symmetric.decrypt(ecbEnc.data, key)
}

// 输出 base64 格式（ciphertext 字段为 base64，encoding 字段会标明）
const b64Enc = crypto.symmetric.encrypt('data', key, { outputFormat: 'base64' })

// 校验密钥/IV 格式
crypto.symmetric.isValidKey(key) // true
crypto.symmetric.isValidIV(iv) // true
```

#### 密码哈希（加盐迭代）

```ts
// 哈希密码（输出格式: $hai$<iterations>$<salt>$<hash>）
const hashed = crypto.password.hash('myPassword123')

// 自定义盐值长度和迭代次数
const custom = crypto.password.hash('myPassword123', {
  saltLength: 32,
  iterations: 20000,
})

// 验证密码
if (hashed.success) {
  const ok = crypto.password.verify('myPassword123', hashed.data)
  // ok.data === true

  const wrong = crypto.password.verify('wrongPassword', hashed.data)
  // wrong.data === false
}
```

#### 传输加密（crypto.transport）

规范编码、验证顺序与 nonce 持久化要求见 [Transport v2 协议](TRANSPORT-PROTOCOL.md)。

传输加密统一通过 `crypto.transport` 命名空间提供，供 `@h-ai/serv`、`@h-ai/kit` 与 `@h-ai/api-client` 复用同一套协议常量和载荷格式。

常规应用优先让上层封装代接：

- 服务端：`serv.createApp({ transport: { crypto, serverKeyRing, keyStore } })` 或 `kit.createHandle({ crypto: { crypto, transport: { serverKeyRing, keyStore } } })`
- 客户端：`apiClient.init({ transport: { crypto } })` 或 `kit.client.create({ transport: { crypto } })`

只有在自定义运行时、测试或你确实要自己接 HTTP 协商端点时，才建议直接调用 `crypto.transport.createServer({ serverKeyRing, keyStore })` / `createClient()`。

##### 使用流程

1. 先 `await crypto.init()`，确保 `crypto.asymmetric` 与 `crypto.symmetric` 已初始化。
2. 服务端调用 `crypto.transport.createServer({ serverKeyRing, keyStore })` 创建 `manager`；它持有服务端密钥对，并负责保存客户端公钥。多节点部署时可注入共享 `keyStore`。
3. 服务端提供一个 POST 密钥协商端点：接收 `{ clientPublicKey }`，调用 `manager.registerClientKey()` 注册客户端，再返回 `{ serverKeyId: manager.getServerKeyId(), serverPublicKey: manager.getServerPublicKey(), clientId }`。
4. 客户端调用 `crypto.transport.createClient({ keyExchangeUrl })` 创建会话；首次 `client.init()` 或 `client.encryptedFetch()` 会自动完成这次协商。
5. 每次请求都发送认证封装 `{ context, direction, status, encryptedKey, ciphertext, iv, tag, signature }`；空 POST 和 GET/HEAD 也必须认证。
6. 自定义适配器先 `await authenticateTransportRequest(manager, request)`，成功后才将 `data.plaintext` 交给业务并保存 `data.context`。
7. 响应用 `await manager.encryptResponse(context, data, response.status)` 关联原请求；客户端校验上下文、状态和完整性后才返回明文。
8. 客户端调用 `client.destroy()` 可清空当前会话；服务端调用 `manager.close()`，或在模块级调用 `await crypto.close()`，用于释放资源。

> 服务端必须显式注入相同的受管 `serverKeyRing` 和共享 `keyStore`（Redis 或共享数据库）。仅共享客户端公钥不足以跨节点解密。没有隐式进程私钥或内存 registry 回退；开发/测试显式用 `createInMemoryKeyStore(capacity)`。服务端重启后重新加载同一密钥环即可，无需 sticky session。

共享存储可直接复用 `@h-ai/crypto` 根入口导出的 provider 工厂：

- `createInMemoryKeyStore(maxClients)`：显式创建默认内存实现，常用于测试或自定义容量
- `createRedisTransportKeyStore({ cache, ttlSeconds? })`：复用 `@h-ai/cache`，通常配合 Redis provider 获取跨节点共享
- `createReldbTransportKeyStore({ reldb, ttlSeconds?, maxClients? })`：复用已初始化的 `@h-ai/reldb`，自动创建公钥、nonce 与容量表；返回带 `pruneExpired()` 的 `ReldbTransportKeyStore`

公钥注册先验证编码和 SM2 曲线点；仅接受 128 字符 hex 或 `04` + 128 字符 hex，不接受压缩点、无穷远点和曲线外点。纯函数 `isValidSM2PublicKey(value)` 无需初始化，可用于自定义握手入口；serv/kit 在写 registry 前返回 400。

Redis/DB 的 `ttlSeconds` 省略表示不过期；显式值须为 1–2147483647 的整数秒，建议设置有限 TTL。Redis 使用原生逐键 TTL，不提供 DB 的 `maxClients` 容量限制，部署需设置内存预算且禁止驱逐有效 nonce。DB `maxClients` 为正安全整数，默认 10000，所有节点必须与持久容量记录一致；事务锁定共享容量行后计数和插入，容量满时拒绝注册，不驱逐有效公钥或 nonce。删除客户端不删除尚有效的 nonce。

DB 使用数据库时钟生成、判断 epoch 毫秒过期时间；数据库与节点均须满足协议的时钟同步要求。首次建表失败可重试。每次注册自动清理一批；`await registry.pruneExpired()` 每次最多删除 100 条过期公钥和 100 条过期 nonce，可由应用定期调度。没有隐式后台计时器，低流量部署仍需主动调度维护；registry 不关闭应用注入的 reldb。旧公钥表的 timestamp 字段需停机迁移为 `created_at_ms` / `expires_at_ms` BIGINT，容量在 `hai_crypto_transport_capacity` 保存；容量调整须协调所有节点及持久记录，不能清空有效 nonce 来重建 registry。

```ts
const registry = createReldbTransportKeyStore({ reldb, ttlSeconds: 3600, maxClients: 10000 })
// 接入应用自己的定期维护调度；每批有界，失败后由调度器重试。
const removed = await registry.pruneExpired()
```

```ts
// 服务端：通常由 serv.createApp({ transport: { crypto, serverKeyRing, keyStore } }) 或 kit.createHandle({ crypto }) 内部调用
const server = crypto.transport.createServer({ serverKeyRing, keyStore })
if (!server.success)
  throw new Error(server.error.message)

// 客户端：通常由 apiClient.init({ transport: { crypto } }) 或 kit.client.create({ transport }) 内部调用
const client = crypto.transport.createClient({
  keyExchangeUrl: 'https://api.example.com/api/v1/_hai/key-exchange',
})

const response = await client.encryptedFetch('https://api.example.com/api/v1/echo', {
  method: 'POST',
  body: JSON.stringify({ hello: 'world' }),
})
```

```ts
import { cache } from '@h-ai/cache'
import { createRedisTransportKeyStore, crypto } from '@h-ai/crypto'

await crypto.init()
await cache.init({ type: 'redis', host: '127.0.0.1', port: 6379 })

const server = crypto.transport.createServer({
  serverKeyRing,
  keyStore: createRedisTransportKeyStore({ cache, ttlSeconds: 3600 }),
})
if (!server.success)
  throw new Error(server.error.message)
```

`encryptedFetch()` 的语义与原生 `fetch` 一致：网络失败、密钥协商失败、请求加密失败或响应解密失败时会 reject；业务层应在调用处按 fetch 错误处理策略统一捕获。

协议常量通过 `crypto.transport.protocol`（或 `TRANSPORT_PROTOCOL`）访问：`X-Client-Id`、`X-Encrypted`、默认 `/_hai/key-exchange`。

服务端 `createServer({ serverKeyRing, keyStore })` 两项均必填。密钥环为 `{ activeKeyId, keys: { [id]: { publicKey, privateKey } } }`；ID 为 1–64 个字母、数字、下划线或连字符。创建时验证公私钥配对并捕获快照，缺失/无效配置返回脱敏的 HaiResult 错误。以下示例的 `keyStore` 为已连接的 Redis/共享数据库 registry；内存仅显式用于开发或测试。

```ts
import { parseTransportServerKeyRing } from '@h-ai/crypto'

const ring = parseTransportServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
if (!ring.success)
  throw new Error(ring.error.message)
const serverKeyRing = ring.data
const server = crypto.transport.createServer({ serverKeyRing, keyStore })
```

握手返回 `{ serverKeyId, serverPublicKey, clientId }`；请求密文的 `context` 携带 `serverKeyId`，服务端按 ID 选择私钥，未知或撤销 ID 直接拒绝，不尝试其它密钥。响应仍用客户端公钥加密。轮换先向所有节点分发包含新旧版本的 ring，再切换 `activeKeyId` 并滚动重建 manager；过渡期保留旧版本，结束后删除旧 ID 并更新所有节点。旧客户端此后须 `destroy()` 后重新协商；不要自动重试非幂等业务。部署通过 Secret Manager 或服务端私有环境分发同一 ring，禁止写入普通 YAML、PUBLIC_/VITE_、日志或公开响应。CLI 创建服务端项目时为 `.env.dev/.env.test/.env.prod` 分别生成独立密钥环并随项目提交；克隆后同一环境共享，也可通过私有环境或 Secret Manager 覆盖。运行时不生成密钥。

认证协议仅支持 v2：独立随机 SM4-CBC 密钥和 HMAC-SM3 密钥由 SM2 封装，先验签、再验证 MAC，最后解密 CBC。请求由客户端私钥签名，响应由所选服务端版本签名。认证字段包括 version、direction、serverKeyId、clientId、128 位随机 requestId（兼 nonce）、issuedAt、HTTP method、pathname + 原始 search 的 SM3 pathHash，以及响应 status。请求有效期 5 分钟，未来时钟偏差最多 30 秒；共享 registry 原子消费 (clientId, requestId)，nonce 至少保留到 issuedAt + 6 分钟以覆盖节点偏差，存储故障拒绝请求。Redis 必须保留有效 nonce，使用 noeviction/可靠持久化策略；各节点时钟须同步。此能力防止同一传输消息重放，业务重试仍需自己的幂等键。

空 POST 也发送空明文的认证封装；GET/HEAD 将封装放在 X-Hai-Transport 头，204/304/HEAD 等无正文响应也使用同名头承载认证封装。其它请求/响应在 JSON 正文承载封装并带 X-Encrypted: true。客户端必须关联原请求上下文和 HTTP status，缺标记、旧格式或认证失败一律 reject；明文接口由 Serv/Kit 路径规则 `encryption: disabled` 或宿主 `excludePaths` 显式允许；调用方同步选择普通请求，API Client/Kit 包装器使用自己的 `excludePaths`。CORS 须允许并暴露 X-Hai-Transport。握手公钥的真实性依赖 TLS，不替代 IAM 业务授权。

业务容量通过 `transport.maxPlaintextBytes` 统一配置：默认 1 MiB，整数范围 1 KiB～64 MiB，请求和响应共用 UTF-8 明文字节预算。客户端从握手自动获取上限，密文与部署代理预算由 `resolveTransportBodyLimits()` 推导（两倍明文 + 32 KiB）。握手、公钥、认证头和防重放约束独立；超限取消原流并释放 reader，请求 413、响应为加密的 500 容量错误，客户端识别 `TransportBodyTooLargeError` / `hai:crypto:070`。 [容量配置、文件换算与升级](TRANSPORT-CAPACITY.md)。

普通业务仍使用 `transport.maxPlaintextBytes`（auto/省略为 1 MiB）；Feedback 的报告受理、证据、附件及 ZIP 下载路由通过 `routePlaintextBytes` 单独声明 `feedback.budget.maxTransportBytes`。路径中的 `*` 仅匹配一个完整路径段；宿主显式路由值优先。握手、adapter-node 与代理使用各路由最大容量，普通业务不会随材料预算扩大。HTTP 适配器为单独声明且大于 1 MiB 的材料路由保留最多 2 个槽，普通业务另有 16 个槽，完整响应/失败后释放；忙碌返回 503 / `hai:crypto:072`，不自动重放业务写入。

serv/kit 对通过请求绑定、签名和 MAC 校验但超出时间窗口的报文返回加密的 HTTP 400 时间错误；客户端抛 `TransportTimeError`（`hai:crypto:071`），提示同步设备和服务器时间后刷新重试。`api-client` 映射为 `VALIDATION_FAILED`，在 `cause.transportCode` 保留该原因。不会自动重放请求或放宽防重放窗口；篡改或未认证报文仍返回通用认证失败。

自定义 HTTP 适配器检查失败原因 `error instanceof TransportTimeError && error.context` 后，使用 `createTransportErrorResponse(error, { manager, context: error.context })` 加密拒绝响应；不能根据未认证报文的时间戳给出可信时间诊断。

自定义 HTTP 适配器可从根入口使用纯工具 `readTransportBody(stream, { maxBytes, signal? })`，无需 `crypto.init()`。必须传入原始流；读取成功后重建 Request/Response，并清理旧 Content-Length/Content-Encoding。此工具对超限抛 RangeError，对无效 UTF-8 抛 TypeError，保留读取异常或 signal.reason；流取消清理失败不覆盖原异常。

```ts
import { readTransportBody, TRANSPORT_BODY_LIMITS } from '@h-ai/crypto'

const text = await readTransportBody(request.body, {
  maxBytes: TRANSPORT_BODY_LIMITS.keyExchangeBytes,
  signal: request.signal,
})
const payload: unknown = JSON.parse(text)
```

#### 关闭模块

```ts
// 使用完毕后关闭，释放内部状态
await crypto.close()
```

### 错误处理

所有操作返回 `HaiResult<T>`：

```ts
const result = crypto.asymmetric.encrypt('data', publicKey)
if (!result.success) {
  // result.error.code / result.error.message
}
```

### 可选集成

管理端在线加密演示直接调用 Crypto SM3/SM4 API，SM4 使用随机临时密钥和 IV，并在显示成功前解密校验；密钥不保存。输入改变即清空旧结果，禁止用随机摘要或 Base64 伪装算法结果。

## 生产共享状态

生产传输 registry 必须声明 stateScope=shared 并实际使用 Redis 或 PostgreSQL/MySQL。memory、包装 memory 的 Redis 工厂、包装 SQLite 的 RelDB 工厂会被拒绝；各节点加载相同受管版本化密钥环。 NODE_ENV 或 HAI_CORE_ENV 为 production 时在初始化发布成功前校验；仅 HAI_E2E=1/HAI_E2E_MOCK=1 明确测试可豁免。 [状态、并发和恢复边界](../../.agents/instructions/distributed-state.md)。

## 模块容量与显式上限

`resolveTransportBodyLimits(limit?, { requiredPlaintextBytes? })` 只在 limit 未设置时按模块需求推导，无模块需求时仍为 1 MiB。显式上限小于模块需求时抛出 RangeError，不能静默扩大或缩小。所有值仍须在 1 KiB～64 MiB 范围；密文预算为明文两倍加 32 KiB。Serv/Kit 配置可用 `auto` 表示未显式限额，运行时将它规范化为 undefined。

```ts
import { resolveTransportBodyLimits } from '@h-ai/crypto'

const limits = resolveTransportBodyLimits(24 * 1024 * 1024, { requiredPlaintextBytes: 11250348 })
// limits.plaintextBytes === 25165824；limits.encryptedPayloadBytes === 50364416
```

## 开发测试

```bash
pnpm --filter @h-ai/crypto test
```

## 许可证

Apache-2.0
