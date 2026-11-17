# @h-ai/crypto 功能说明

[English](crypto.en.md) · [日本語](crypto.ja.md)

通过 `crypto` 处理加密、签名、哈希和密码存储。加密内容使用加密密钥，存储登录密码时保存带盐哈希。保护 HTTP 请求和响应时使用 `crypto.transport` 或 Serv/Kit 的传输加密支持。

[模块 README](../../../packages/crypto/README.md) · [配置清单](../configuration/crypto.md) · [数据结构](../data/crypto.md) · [前后端接入](../development/frontend-backend.md)

<a id="quick-start"></a>

## 最小接入示例

如果 `init()` 尚未结束就调用 `close()`，这次初始化不会把模块重新打开。需要重新启动时，先等上一次初始化和关闭结束。

```ts
import { crypto } from '@h-ai/crypto'

// 初始化（使用前必须调用）
const initialized = await crypto.init()
if (!initialized.success)
  throw new Error(initialized.error.message)
```

## 功能说明

<a id="api-reference"></a>

### 用途、输入与输出

先成功初始化 crypto，再使用算法。HaiResult<T> 先判断 success，成功 data 才是 T；void 没有业务数据，Promise 必须 await。publicKey/privateKey 来自成功的密钥生成，ciphertext、signature、digest、payload 来自相应成功结果。manager 是 createServer 的成功 data，session 是 createClient 直接返回的实例；requestContext/messageContext 由 HTTP 适配器从实际请求取得，不能接收客户端自报的身份。下文给出完整加解密与 HTTP 装配。

| 入口                                  | 使用场景                  | 输入（`—` 表示无参数）                                                    | 返回值                                                 | 调用示例                                                                                                |
| ------------------------------------- | ------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `crypto.init`                         | 准备加密能力              | `—`                                                                       | `Promise<HaiResult<void>>`                             | `await crypto.init()`                                                                                   |
| `crypto.close`                        | 释放模块状态              | `—`                                                                       | `Promise<void>`                                        | `await crypto.close()`                                                                                  |
| `crypto.isInitialized`                | 检查可用状态              | `—`                                                                       | `boolean`                                              | `crypto.isInitialized`                                                                                  |
| `crypto.asymmetric.generateKeyPair`   | 生成 SM2 密钥对           | `—`                                                                       | `HaiResult<{ publicKey, privateKey }>`                 | `crypto.asymmetric.generateKeyPair()`                                                                   |
| `crypto.asymmetric.encrypt`           | 用接收方公钥加密          | `data: string, publicKey: string, options?: { cipherMode, outputFormat }` | `HaiResult<string>`                                    | `crypto.asymmetric.encrypt("orders", publicKey)`                                                        |
| `crypto.asymmetric.decrypt`           | 用私钥解密                | `ciphertext: string, privateKey: string, options?`                        | `HaiResult<string>`                                    | `crypto.asymmetric.decrypt(ciphertext, privateKey)`                                                     |
| `crypto.asymmetric.sign`              | 为消息签名                | `data: string, privateKey: string, options?: { hash, userId }`            | `HaiResult<string>`                                    | `crypto.asymmetric.sign("orders", privateKey)`                                                          |
| `crypto.asymmetric.verify`            | 核对消息签名              | `data: string, signature: string, publicKey: string, options?`            | `HaiResult<boolean>`                                   | `crypto.asymmetric.verify("orders", signature, publicKey)`                                              |
| `crypto.asymmetric.isValidPublicKey`  | 检查公钥格式              | `publicKey: string`                                                       | `boolean`                                              | `crypto.asymmetric.isValidPublicKey(publicKey)`                                                         |
| `crypto.asymmetric.isValidPrivateKey` | 检查私钥格式              | `privateKey: string`                                                      | `boolean`                                              | `crypto.asymmetric.isValidPrivateKey(privateKey)`                                                       |
| `crypto.hash.hash`                    | 计算 SM3 摘要             | `data: string / Uint8Array, options?: { inputEncoding }`                  | `HaiResult<string>: 64 hex`                            | `crypto.hash.hash("orders")`                                                                            |
| `crypto.hash.hmac`                    | 计算带密钥的摘要          | `data: string, key: string`                                               | `HaiResult<string>`                                    | `crypto.hash.hmac("orders", hmacKey)`                                                                   |
| `crypto.hash.verify`                  | 核对文本与摘要            | `data: string, expectedHash: string`                                      | `HaiResult<boolean>`                                   | `crypto.hash.verify("orders", digest)`                                                                  |
| `crypto.symmetric.generateKey`        | 生成随机 SM4 密钥         | `—`                                                                       | `string: 32 hex`                                       | `crypto.symmetric.generateKey()`                                                                        |
| `crypto.symmetric.generateIV`         | 生成随机初始化向量        | `—`                                                                       | `string: 32 hex`                                       | `crypto.symmetric.generateIV()`                                                                         |
| `crypto.symmetric.encrypt`            | 加密并保留解密信息        | `data: string, key: 32 hex, options?: { mode, iv, outputFormat }`         | `HaiResult<{ mode, ciphertext, iv?, encoding }>`       | `crypto.symmetric.encrypt("orders", key)`                                                               |
| `crypto.symmetric.decrypt`            | 解密结构化密文            | `payload: SymmetricEncryptedPayload, key: 32 hex`                         | `HaiResult<string>`                                    | `crypto.symmetric.decrypt(payload, key)`                                                                |
| `crypto.symmetric.encryptWithIV`      | 每次生成新 IV 加密        | `data: string, key: 32 hex`                                               | `HaiResult<{ mode: "cbc", ciphertext, iv, encoding }>` | `crypto.symmetric.encryptWithIV("orders", key)`                                                         |
| `crypto.symmetric.decryptWithIV`      | 解密指定 IV 的密文        | `ciphertext: string, key: 32 hex, iv: 32 hex`                             | `HaiResult<string>`                                    | `crypto.symmetric.decryptWithIV(ciphertext, key, iv)`                                                   |
| `crypto.symmetric.isValidKey`         | 检查密钥格式              | `key: string`                                                             | `boolean`                                              | `crypto.symmetric.isValidKey(key)`                                                                      |
| `crypto.symmetric.isValidIV`          | 检查 IV 格式              | `iv: string`                                                              | `boolean`                                              | `crypto.symmetric.isValidIV(iv)`                                                                        |
| `crypto.password.hash`                | 服务端保存密码摘要        | `password: string, options?: { saltLength, iterations }`                  | `HaiResult<string>: $hai$…`                            | `crypto.password.hash(password)`                                                                        |
| `crypto.password.verify`              | 服务端验证密码            | `password: string, storedHash: string`                                    | `HaiResult<boolean>`                                   | `crypto.password.verify(password, storedHash)`                                                          |
| `crypto.transport.createServer`       | 创建共享传输管理器        | `{ serverKeyRing, keyStore, maxPlaintextBytes?, … }`                      | `HaiResult<TransportEncryptionManager>`                | `crypto.transport.createServer({ serverKeyRing, keyStore })`                                            |
| `crypto.transport.createClient`       | 创建加密 HTTP 会话        | `{ keyExchangeUrl: HTTPS URL, fetch?, maxPlaintextBytes? }`               | `TransportClient: init / encryptedFetch / destroy`     | `crypto.transport.createClient({ keyExchangeUrl: "https://api.example.com/api/v1/_hai/key-exchange" })` |
| `crypto.transport.protocol`           | 复用协议路径与头名        | `—`                                                                       | `TRANSPORT_PROTOCOL_T`                                 | `crypto.transport.protocol`                                                                             |
| `manager.getServerKeyId`              | 读取当前服务端密钥版本    | `—`                                                                       | `string`                                               | `manager.getServerKeyId()`                                                                              |
| `manager.getServerPublicKey`          | 提供握手公钥              | `—`                                                                       | `string`                                               | `manager.getServerPublicKey()`                                                                          |
| `manager.registerClientKey`           | 登记客户端公钥            | `clientPublicKey: string`                                                 | `Promise<string>: clientId`                            | `await manager.registerClientKey(clientPublicKey)`                                                      |
| `manager.getClientPublicKey`          | 查询共享登记的公钥        | `clientId: string`                                                        | `Promise<string / undefined>`                          | `await manager.getClientPublicKey(clientId)`                                                            |
| `manager.decryptRequest`              | 验证并解密请求            | `payload: EncryptedRequestPayload, expected: TransportRequestContext`     | `Promise<HaiResult<string>>`                           | `await manager.decryptRequest(encryptedRequest, requestContext)`                                        |
| `manager.encryptResponse`             | 认证并加密关联响应        | `request: TransportMessageContext, data: string, status: number`          | `Promise<HaiResult<EncryptedPayload>>`                 | `await manager.encryptResponse(messageContext, "{}", 200)`                                              |
| `manager.close`                       | 释放管理器资源            | `—`                                                                       | `Promise<void>`                                        | `await manager.close()`                                                                                 |
| `session.init`                        | 取得可用传输会话          | `—`                                                                       | `Promise<HaiResult<void>>`                             | `await session.init()`                                                                                  |
| `session.encryptedFetch`              | 按 fetch 契约调用加密接口 | `input: RequestInfo / URL, init?: RequestInit`                            | `Promise<Response>`                                    | `await session.encryptedFetch("https://api.example.com/api/v1/orders")`                                 |
| `session.ready`                       | 检查会话能否发送新请求    | `—`                                                                       | `boolean`                                              | `session.ready()`                                                                                       |
| `session.destroy`                     | 清除本地传输会话          | `—`                                                                       | `void`                                                 | `session.destroy()`                                                                                     |

### HTTP 适配工具与存储实例

以下根入口函数是供 HTTP 适配器、配置解析和可多实例存储装配使用的基础设施契约，无需为它们另造 `crypto.xxx` 别名。算法和传输主工厂仍通过 `crypto` 使用；工厂返回的实例由创建方管理。

| API | 输入与默认值 | 输出及失败方式 | 调用示例 |
| --- | --- | --- | --- |
| `isValidSM2PublicKey` | 未知值 | `boolean`，无需初始化 | `isValidSM2PublicKey(value)` |
| `parseTransportServerKeyRing` | Secret JSON 或对象 | `HaiResult<TransportServerKeyRing>`，失败不回显密钥 | `parseTransportServerKeyRing(secret)` |
| `createCacheTransportKeyStore` | `{ cache, ttlSeconds?, maxRegistrationsPerMinute?, maxRequestsPerMinute? }` | `TransportKeyStore`，非法参数抛 TypeError，满额 reject `hai:crypto:072` | `createCacheTransportKeyStore({ cache })` |
| `registry.register` | 有效 SM2 公钥 | `Promise<string>`，公钥/存储错误 reject | `await registry.register(publicKey)` |
| `registry.get` | 客户端 ID | `Promise<string / undefined>`，存储错误 reject | `await registry.get(clientId)` |
| `registry.claimRequest` | 客户端 ID、请求 ID、保留截止 Unix 毫秒 | `Promise<boolean>`，原子消费，存储错误 reject | `await registry.claimRequest(clientId, requestId, expiresAt)` |
| `registry.delete?` | 客户端 ID | `Promise<void>`，只删公钥，存储错误 reject | `await registry.delete?.(clientId)` |
| `registry.close?` | 无 | `Promise<void>`，可选自定义存储清理钩子；内置 Cache registry 不关闭借用连接 | `await registry.close?.()` |
| `resolveTransportBodyLimits` | 可选明文字节数、`{ requiredPlaintextBytes? }` | 不可变 `TransportBodyLimits`，无效/冲突抛 RangeError | `resolveTransportBodyLimits(8388608)` |
| `createTransportBodyPolicy` | 可选全局明文上限、路由字节映射（默认空） | 策略实例，无效配置抛 RangeError | `createTransportBodyPolicy(undefined, { '/files/*': 8388608 })` |
| `policy.acquire` | 实际 pathname | `{ limits, release } / null`，并发满返回 null | `policy.acquire('/files/report')` |
| `lease.release` | 无 | `void`，可重复调用，释放一次名额 | `lease.release()` |
| `readTransportBody` | 原流或 null、`{ maxBytes, signal?, direction?, stage? }` | `Promise<string>`；容量、UTF-8、取消或读取错误抛出 | `await readTransportBody(request.body, { maxBytes: 16384 })` |
| `authenticateTransportRequest` | manager、实际 Request、可选路由预算 | `Promise<HaiResult<{ plaintext, context }>>`，读取/容量异常抛出 | `await authenticateTransportRequest(manager, request)` |
| `createTransportErrorResponse` | 时间/容量错误、可选已认证 `{ manager, context }` | `Promise<Response>`，有可信上下文时加密错误 | `await createTransportErrorResponse(error)` |
| `TransportBodyTooLargeError` | 上限、可选实际字节、方向/阶段选项 | RangeError 子类，`hai:crypto:070` | `new TransportBodyTooLargeError(1024, 1025)` |
| `TransportTimeError` | 可选可信请求 context、服务器 Unix 毫秒 | Error 子类，非法时间抛 RangeError | `new TransportTimeError(undefined, Date.now())` |

常量 `TRANSPORT_PROTOCOL`、`TRANSPORT_TIME_LIMITS`、`TRANSPORT_BODY_LIMITS` 和 `TRANSPORT_PLAINTEXT_RANGE` 提供协议、安全窗口及容量范围；不会自动读取配置或创建连接。

<a id="primitive-validation"></a>

### 原语输入与兼容边界

SM2 加密仅接受非空文本，密文须完整且 C3 校验成功；用错私钥、篡改密文或空消息均返回失败。私钥须为 64 hex，数值在 1～n-2，排除会使签名无法结束的 n-1。签名必须是 128 hex，非规范编码验签返回 `ok(false)`。这不影响使用 SM4 加密空正文的 transport。

SM3 的 hex 输入须由完整字节组成，非法字符或奇数长度返回 `INVALID_INPUT`。HMAC 按 UTF-8 字节长度处理密钥，超过 64 字节时先做 SM3；修复前非 ASCII 长密钥的错误结果会改变，已有外部校验值需重新生成。transport 使用固定 64 字节 ASCII 密钥，协议认证值不变。

SM4 明文可为空，但密文须非空、编码有效且为完整的 16 字节分组；解密严格验证 PKCS#7 和 UTF-8，拒绝未知 mode/encoding。Base64 转换按块处理，支持大输入。CBC 本身仍无完整性认证，HTTP 继续使用 transport。

密码记录严格采用 `$hai$iterations$salt$hash`：iterations 为 1～1000000 的规范十进制整数，salt 为 8～128 个字母数字字符，hash 为 64 个小写 hex。畸形记录返回 `INVALID_INPUT`；模块正常生成的历史记录继续有效。

SM2/SM3/SM4 与传输支持 Node.js / 浏览器；账户密码哈希应在服务端处理。

### 非对称加密（加解密 / 签名验签）

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

### 哈希（Hash / HMAC / 验证）

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

### 对称加密（CBC 默认 / 结构化密文）

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

### 密码哈希（加盐迭代）

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

<a id="detailed-workflow"></a>

### 传输加密（crypto.transport）

传输客户端 `destroy()` 使在途握手失效并取消网络等待；迟到结果不能恢复密钥或覆盖下一次握手。它只清理本地会话，服务端 registry 仍按自己的租约回收。

规范编码与验证顺序见本页的 [Transport v2 协议](#transport-protocol)，nonce 持久化要求见[数据结构](../data/crypto.md#transport-state)。

传输加密统一通过 `crypto.transport` 命名空间提供，供 `@h-ai/serv`、`@h-ai/kit` 与 `@h-ai/api-client` 复用同一套协议常量和载荷格式。

常规应用优先让上层封装代接：

- 服务端：`serv.createApp({ transport: { crypto, serverKeyRing, keyStore } })` 或 `kit.createHandle({ crypto: { crypto, transport: { serverKeyRing, keyStore } } })`
- 客户端：`apiClient.init({ transport: { crypto } })` 或 `kit.client.create({ transport: { crypto } })`

只有在自定义运行时、测试或你确实要自己接 HTTP 协商端点时，才建议直接调用 `crypto.transport.createServer({ serverKeyRing, keyStore })` / `createClient()`。

#### 使用流程

1. 先 `await crypto.init()`，确保 `crypto.asymmetric` 与 `crypto.symmetric` 已初始化。
2. 服务端调用 `crypto.transport.createServer({ serverKeyRing, keyStore })` 创建 `manager`；它持有服务端密钥对，并负责保存客户端公钥。多节点部署时可注入共享 `keyStore`。
3. 服务端的 POST 密钥协商端点接收 `{ clientPublicKey }`，调用 `manager.registerClientKey()` 后返回 `clientId`、`serverKeyId`、`serverPublicKey`、`maxPlaintextBytes` 和可选的 `clientKeyTtlSeconds`。Serv/Kit 自动从注册表取得有效期，自定义适配器可读取 `manager.clientKeyTtlSeconds`。
4. 客户端调用 `crypto.transport.createClient({ keyExchangeUrl })` 创建会话。首次使用或登记临近到期时，`client.init()` 和 `client.encryptedFetch()` 按需协商。并发请求共享握手，协商成功后才发送业务请求。
5. 每次请求都发送认证封装 `{ context, direction, status, encryptedKey, ciphertext, iv, tag, signature }`；空 POST 和 GET/HEAD 也必须认证。
6. 自定义适配器先 `await authenticateTransportRequest(manager, request)`，成功后才将 `data.plaintext` 交给业务并保存 `data.context`。
7. 响应用 `await manager.encryptResponse(context, data, response.status)` 关联原请求；客户端校验上下文、状态和完整性后才返回明文。
8. 客户端调用 `client.destroy()` 清空本地会话；服务端先 `await manager.close()` 释放自建管理器，再 `await crypto.close()` 关闭模块。模块不会替应用关闭已经创建的独立管理器，也不因此撤销服务端业务会话。

> 服务端必须显式注入相同的受管 `serverKeyRing` 和共享 `keyStore`（Redis）。仅共享客户端公钥不足以跨节点解密。没有隐式进程私钥或内存 registry 回退；开发/测试显式用 `createCacheTransportKeyStore(capacity)`。服务端重启后重新加载同一密钥环即可，无需 sticky session。

内置 registry 统一通过 `@h-ai/cache` 保存状态：

```ts
import { cache } from '@h-ai/cache'
import { createCacheTransportKeyStore } from '@h-ai/crypto'

// 上下文：应用已成功初始化 cache；生产使用 Redis。
const registry = createCacheTransportKeyStore({ cache, ttlSeconds: 3600 })
```

寿命、分钟配额与过载行为见[调用参数](#call-options)，键结构和过期边界见[数据结构](../data/crypto.md)。

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
import { createCacheTransportKeyStore, crypto, parseTransportServerKeyRing } from '@h-ai/crypto'

export async function startTransport() {
  const ready = await crypto.init()
  if (!ready.success)
    return ready
  const ring = parseTransportServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
  if (!ring.success)
    return ring
  const connected = await cache.init({ type: 'redis', host: '127.0.0.1', port: 6379 })
  if (!connected.success)
    return connected
  return crypto.transport.createServer({
    serverKeyRing: ring.data,
    keyStore: createCacheTransportKeyStore({ cache, ttlSeconds: 3600 }),
  })
}
```

在应用启动流程调用 `startTransport()`。示例从服务端环境读取密钥环，连接本地 Redis，并返回可交给 HTTP 适配器的管理器。检查 `success` 后才能接收请求；失败或进程退出时由启动流程按反序关闭 Cache 与 Crypto。

用 `encryptedFetch()` 像用浏览器的 `fetch()` 一样等待响应。网络、密钥交换、请求加密或响应解密失败都会抛出异常，调用时用 `try/catch` 处理。

协议常量通过 `crypto.transport.protocol`（或 `TRANSPORT_PROTOCOL`）访问：`X-Client-Id`、`X-Encrypted`、默认 `/_hai/key-exchange`。

服务端 `createServer({ serverKeyRing, keyStore })` 两项均必填。密钥环为 `{ activeKeyId, keys: { [id]: { publicKey, privateKey } } }`；ID 为 1–64 个字母、数字、下划线或连字符。创建时验证公私钥配对并捕获快照，缺失/无效配置返回脱敏的 HaiResult 错误。下面的函数供已经初始化 Crypto 的应用调用。把基于 Redis创建的公钥存储传给 `keyStore`；内存实现只用于开发或测试。密钥环不合法时直接返回解析错误，成功时返回管理器。

```ts
import type { TransportKeyStore } from '@h-ai/crypto'
import { crypto, parseTransportServerKeyRing } from '@h-ai/crypto'

export function buildTransport(keyStore: TransportKeyStore) {
  const ring = parseTransportServerKeyRing(process.env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING)
  if (!ring.success)
    return ring
  return crypto.transport.createServer({ serverKeyRing: ring.data, keyStore })
}
```

握手响应提供当前服务端密钥编号、公钥、客户端编号和请求正文上限，即 `{ serverKeyId, serverPublicKey, clientId, maxPlaintextBytes }`。之后的请求附上 `serverKeyId`，服务端直接用该编号选私钥。密钥编号不存在或已撤销时拒绝请求。响应使用客户端公钥加密。

轮换服务端密钥时，先在所有服务节点配置包含新旧版本的密钥集合，再将 `activeKeyId` 切换为新编号，并逐台重启或重新创建加密管理器。过渡期保留旧版本，结束后从所有节点移除旧编号。仍在用旧版本的客户端先调用传输对象的 `destroy()`，再重新握手。不要因此自动重试可能已产生外部效果的请求。

同一环境的服务节点应从 Secret Manager 或受保护的服务端环境文件读取同一份密钥。禁止写入公开 YAML、`PUBLIC_*`、`VITE_*`、日志或接口响应。CLI 新项目会为开发、测试和生产分别生成私有 `.env.<环境>.local`。这些文件不随 Git 分发。其他机器从受保护的配置来源获取对应密钥，运行时不会自动生成。

加密传输使用 v2 格式。客户端为请求随机选取 SM4-CBC 密钥和 HMAC-SM3 密钥，用 SM2 将密钥加密。客户端用自己的私钥签名请求，服务端用请求选中的服务端密钥版本签名响应。接收端先验签，再核对消息认证码（MAC），最后解密。

认证会核对消息方向、两端的密钥或客户端编号、请求编号、发送时间、HTTP 方法、路径与原始查询字符串。响应还会核对 HTTP 状态码。客户端生成的 128 位随机请求编号也用来防止同一个密文被反复发送。服务端默认只接受 5 分钟内发出的请求，客户端时钟最多可快 30 秒。可用 `maxRequestAgeSeconds`（1 到 600 秒）和 `maxFutureSkewSeconds`（0 到 300 秒）调整。

所有服务节点通过同一处 Redis 登记 `(clientId, requestId)`。重复的编号不会再次接受，登记自请求发出起保留 11 分钟。存储不可用时拒绝请求。Redis 应选择 `noeviction` 并开启可靠的持久化，节点时钟应同步。应用自行重试付款、发信等操作时，应通过自己的业务键去重。

没有正文的 POST 仍需要认证。GET、HEAD 以及 204、205、304、HEAD 等无正文响应，把认证数据放在 `X-Hai-Transport` 头。其他请求或响应把密文放在 JSON 正文，并设置 `X-Encrypted: true`。客户端收到加密响应会用原请求和实际状态码验证。标记丢失、格式过旧或认证失败时，调用会抛出错误。

如果某个接口必须接收普通 HTTPS 正文，服务端把该路由设为 `encryption: disabled` 或加入 `excludePaths`。浏览器请求同一路由时也应配置客户端的 `excludePaths`。跨域接入还须允许并公开 `X-Hai-Transport` 请求头和响应头。使用 HTTPS 可以验证握手接收的公钥确实来自目标服务器。访问资源前，服务端仍需检查当前用户的 IAM 权限。

业务容量通过 `transport.maxPlaintextBytes` 统一配置：默认 1 MiB，整数范围 1 KiB～64 MiB，请求和响应共用 UTF-8 明文字节预算。客户端从握手自动获取上限，密文与部署代理预算由 `resolveTransportBodyLimits()` 推导（两倍明文 + 32 KiB）。握手、公钥、认证头和防重放约束独立；超限取消原流并释放 reader，请求 413、响应为加密的 500 容量错误，客户端识别 `TransportBodyTooLargeError` / `hai:crypto:070`。见[容量配置与文件换算](crypto.md#transport-capacity)。

普通接口沿用 `transport.maxPlaintextBytes`，设为 `auto` 或省略时上限为 1 MiB。反馈上报、证据、附件和 ZIP 下载通常需要更大正文。给这些路由单独设置 `routePlaintextBytes`，取值可用 `feedback.budget.maxTransportBytes`。路径中的 `*` 只匹配一个路径段。若应用已为某条路由配置额度，以该值为准。

握手、Node HTTP 适配器和反向代理按各路由的最大值预留空间。HTTP 适配器为显式配置且超过 1 MiB 的路由最多同时处理 2 个请求，普通路由另有 16 个名额。响应发送完毕或请求失败时释放名额。忙碌时返回 HTTP 503（`hai:crypto:072`），应用决定是否重试。

Serv/Kit 对通过请求绑定、签名和 MAC 校验但超出时间窗口的请求返回加密的 HTTP 400 错误。客户端抛出 `TransportTimeError`（`hai:crypto:071`），显示校验时的服务器 UTC 时间，提示开启设备的自动校时或手工修改时间后刷新。`serverTime` 为 Unix 毫秒。`api-client` 映射为 `VALIDATION_FAILED`，在 `cause.transportCode` 和 `cause.serverTime` 保留诊断信息。

自定义 HTTP 适配器检查失败原因 `error instanceof TransportTimeError && error.context` 后，使用 `createTransportErrorResponse(error, { manager, context: error.context })` 加密拒绝响应；不能根据未认证报文的时间戳给出可信时间诊断。

自定义 HTTP 适配器可从根入口使用纯工具 `readTransportBody(stream, { maxBytes, signal? })`，无需 `crypto.init()`。必须传入原始流；读取成功后重建 Request/Response，并清理旧 Content-Length/Content-Encoding。此工具对超限抛 `RangeError`，对无效 UTF-8 抛 `TypeError`，保留读取异常或 `signal.reason`。下面的函数返回还未做协议校验的 JSON，格式错误时由 `JSON.parse()` 抛错。继续处理前还要验证必要字段。

```ts
import { readTransportBody, TRANSPORT_BODY_LIMITS } from '@h-ai/crypto'

export async function readKeyExchangeJson(request: Request): Promise<unknown> {
  const text = await readTransportBody(request.body, {
    maxBytes: TRANSPORT_BODY_LIMITS.keyExchangeBytes,
    signal: request.signal,
  })
  return JSON.parse(text)
}
```

<a id="transport-protocol"></a>

#### Transport v2 编码与接收顺序

serv、kit、api-client 与浏览器/移动客户端共用此协议。TLS 验证握手公钥的来源；应用仍需 IAM 授权和业务幂等键。每个节点加载同一受管密钥环，响应使用请求 `serverKeyId` 对应的私钥。轮换时保留旧版本至过渡结束，删除旧版本即撤销。

握手从客户端发送时起计算公钥 TTL，提前寿命的十分之一续期，最多提前 30 秒。等待中的并发请求共用握手，已发送请求仍用发送时会话验证响应。省略 `clientKeyTtlSeconds` 时没有自动续期期限，自定义 registry 可通过同名属性声明固定 TTL。

完整 JSON 封装仅允许 `{ context, direction, status, encryptedKey, ciphertext, iv, tag, signature }`，上下文也拒绝额外字段：

```ts
interface Context {
  version: 2
  serverKeyId: string // 1–64 个字母、数字、下划线或连字符
  clientId: string // 1–128 个字母、数字、下划线或连字符
  requestId: string // 128 位随机数，32 个小写 hex 字符
  issuedAt: number // Unix 毫秒，正安全整数
  method: string // 实际大写 HTTP 方法
  pathHash: string // SM3(URL.pathname + URL.search)，64 个小写 hex 字符
}
```

每条消息独立生成 16 字节 SM4 密钥（32 hex）、32 字节 MAC 密钥（64 hex）和 16 字节 IV。`encryptedKey` 是 SM2 C1C3C2/hex 加密的 UTF-8 JSON `[sm4KeyHex, macKeyHex]`；`ciphertext` 是 SM4-CBC、PKCS#7 填充的 hex，`iv` 也是 hex。HMAC-SM3 使用 `macKeyHex` 文本的 64 个 UTF-8/ASCII 字节，不是 hex 解码后的 32 字节。

认证文本是无空格 JSON 固定位置数组，顺序为：

```text
["hai-transport", context.version, direction, context.serverKeyId,
 context.clientId, context.requestId, context.issuedAt, context.method,
 context.pathHash, status, encryptedKey, ciphertext, iv]
```

上式表示字段顺序，实际对数组调用 `JSON.stringify()`，不包含示意换行。`tag = HMAC_SM3(authenticatedText, macKeyHex)` 为 64 个小写 hex；签名输入是 `JSON.stringify([authenticatedText, tag])`。SM2 签名使用默认 `hash=true`、`userId=1234567812345678`，结果为 128 hex。请求 `direction=request`、`status=0`；响应 `direction=response`、`status=实际 HTTP 状态`，原样复制请求 context。

接收端按以下顺序处理：

1. 有界读取并验证唯一 v2 结构。从实际 Request 取得客户端 ID、方法、pathname 和原始 search，不能用 payload 自证预期上下文。路径最多 8192 个 UTF-8 字节，不解码或重排查询串；重算 SM3 与 `pathHash` 比较，代理须保留原路径/查询。
2. 查注册公钥，先验证 SM2 发送方签名，再解封两把密钥，以常量时间比较 HMAC，最后解密 CBC。认证失败不进入 CBC，单凭知道接收方公钥无法伪造发送方签名。此顺序遵循 [RFC 7366](https://www.rfc-editor.org/rfc/rfc7366) 的先认证后解密原则，HMAC 构造见 [RFC 2104](https://www.rfc-editor.org/rfc/rfc2104)；本封装不是 TLS 报文。
3. 服务端检查 `issuedAt > now + futureSkew` 或 `now >= issuedAt + maxAge` 即拒绝。未来偏差边界可接受，到期边界不可接受。完整认证后才原子消费 `(clientId, requestId)`，消费后再次检查期限；存储故障、重复或期间到期均拒绝，业务失败也不退还 nonce。
4. 时间错误只在绑定、签名和 MAC 可信后返回加密的 400 / `hai:crypto:071` 和校验时的 `serverTime`。客户端先验证响应 context 与原请求逐字段一致、封装 status 与实际状态一致，再验签/MAC、解密并解释诊断。关联、格式或标记缺失均拒绝，不回退明文。

所有消息设置 `X-Encrypted: true`，请求再带 `X-Client-Id`。POST 等带正文方法将完整封装放 JSON 正文，空明文也一样；GET/HEAD 将空明文封装放 `X-Hai-Transport`，不得再带正文。普通响应使用 JSON 正文，HEAD、无正文状态或实际无正文响应改用同名头；同一消息不能重复使用头和正文。CORS 必须允许并暴露此头。明文路由须通过服务端与客户端对应的排除规则显式隔离，Kit 没有 `requireEncryption` / `encryptResponse` 降级开关。

### 关闭模块

```ts
// 使用完毕后关闭，释放内部状态
await crypto.close()
```

### 安全声明

- **SM4 默认加密返回结构化密文**：`crypto.symmetric.encrypt(data, key)` 默认使用 CBC + 随机 IV，返回 `{ mode, ciphertext, iv, encoding }`；解密时把该对象传给 `crypto.symmetric.decrypt(payload, key)`。
- **SM4 使用随机密钥**：通过 `crypto.symmetric.generateKey()` 生成密钥；本模块不提供从密码派生加密密钥的 KDF。密码存储使用服务端 `crypto.password.hash(password)`，不要将密码或密码哈希直接用作 SM4 密钥。
- **IV 必须唯一**：相同密钥下禁止复用 IV；推荐使用默认 CBC 或 `encryptWithIV()` 每次自动生成。密文与 IV 需一同传输与存储（IV 可公开，不必保密）。

### 可选集成

管理端在线加密演示直接调用 Crypto SM3/SM4 API，SM4 使用随机临时密钥和 IV，并在显示成功前解密校验；密钥不保存。输入改变即清空旧结果，禁止用随机摘要或 Base64 伪装算法结果。

### HTTP 路由的传输容量策略

`createTransportBodyPolicy(maxPlaintextBytes?, routes?)` 是供 HTTP 适配器复用的策略工厂，输入默认明文字节上限与按路径覆盖，返回最大传输预算和并发额度申请函数。Kit/Serv 的常规集成已负责申请和释放。

```ts
import { createTransportBodyPolicy } from '@h-ai/crypto'

const policy = createTransportBodyPolicy(1024 * 1024, { '/feedback/attachments/*': 8 * 1024 * 1024 }) // 根据普通路由与大对象路由生成策略。
const lease = policy.acquire('/feedback/attachments/report-1') // 获得 { limits, release } 或 null（额度已满）。
if (lease) {
  const limits = lease.limits // 读取本次路由的明文与密文预算。
  lease.release() // 示例直接释放，实际 HTTP 适配器在回应或失败后用 finally 释放。
}
```

参见[传输容量](crypto.md#transport-capacity)。

<a id="call-options"></a>

## 调用参数

下列字段属于代码参数，不是 `_crypto.yml` 的配置项。调用前成功初始化 Crypto；服务端缓存连接先由应用初始化并在关闭时释放。

### 算法参数

| 配置项                | 默认值/必填        | 说明                                                |
| --------------------- | ------------------ | --------------------------------------------------- |
| SM2 `cipherMode`      | `1`（`C1C3C2`）    | 可用 `0` 处理旧格式 `C1C2C3`；加解密使用同一模式    |
| SM2 `outputFormat`    | `hex`              | 密文编码，另支持 `base64`                           |
| SM2 `hash`            | `true`             | 签名时先哈希；签名和验签使用相同设置                |
| SM2 `userId`          | `1234567812345678` | 签名用户标识，验签传入相同值                        |
| SM3 `inputEncoding`   | `utf8`             | 仅应用于字符串，可选 `hex`。二进制输入直接作为字节  |
| SM4 `mode`            | `cbc`              | `ecb` 用于兼容已有数据                              |
| SM4 `iv`              | CBC 自动生成       | 32 个十六进制字符。自备 IV 时为每次加密独立随机生成 |
| SM4 `outputFormat`    | `hex`              | 密文编码，可设 `base64`                             |
| 密码哈希 `saltLength` | `16`               | 随机字母数字盐的字符数，整数范围 8–128               |
| 密码哈希 `iterations` | `10000`            | 密码哈希迭代次数，整数范围 1–1000000                 |

### 传输服务端与客户端参数

| 参数 | 默认/必填 | 含义 |
| --- | --- | --- |
| 服务端 `serverKeyRing` | 必填 | 服务端受管 `{ activeKeyId, keys }`；私钥仅由可信启动代码注入。 |
| 服务端 `keyStore` | 必填 | 传入 `createCacheTransportKeyStore({ cache })` 创建的 registry；生产使用 Redis。 |
| 服务端 `maxPlaintextBytes` | 1048576 | 请求/响应明文 UTF-8 字节上限，整数 1024–67108864；宿主可从 Serv/Kit 文件配置转交。 |
| 服务端 `maxFutureSkewSeconds` | 30 | 允许的未来时间偏差，整数 0–300 秒。 |
| 服务端 `maxRequestAgeSeconds` | 300 | 从签发起的有效期，整数 1–600 秒。 |
| 客户端 `keyExchangeUrl` | 必填 | 可信服务端的密钥协商 URL。 |
| 客户端 `maxPlaintextBytes` | 跟随服务端 | 显式传入时取本地与握手值的较小值。 |
| 客户端 `fetch` | 全局 fetch | 可注入遵守取消及正文契约的标准 Fetch 实现。 |

### 缓存 registry 参数

| 参数 | 默认/必填 | 含义 |
| --- | --- | --- |
| `cache` | 必填 | 已初始化的 `@h-ai/cache`；memory 用于开发/测试，Redis 提供生产共享状态。 |
| `ttlSeconds` | 3600 | 公钥固定寿命，整数 1–86400 秒；读取不续期，不能永久保存。 |
| `maxRegistrationsPerMinute` | 10000 | 每个共享 60 秒窗口可登记的公钥数，正安全整数。 |
| `maxRequestsPerMinute` | 100000 | 每个共享 60 秒窗口可接纳的新请求数，正安全整数。 |

这两项是全应用共享的缓存容量保底，不是按 IP、用户或接口的业务限流。默认每60秒10000次登记、100000个新请求编号；首次写入开始计时，满额503，到期后恢复。公钥/已用编号自身的保留期不会随计数清零而结束，见[周期、满额与限流的例子](../data/crypto.md#transport-state)。调大上限时同步核对 Redis 内存预算。


两个配额窗口在首次写入时启动，由 cache TTL 统一计时；CAS 原子扣额，更新保留原 TTL，应用节点时钟偏差不会重置窗口。不同节点必须使用相同配额。用尽或持续争用时返回 `hai:crypto:072`，Serv/Kit 映射为 503，客户端不自动重放。失败写入和并发重复可能保守占额；已存在 nonce 的普通重放不占新额度。公钥、nonce 和固定两条配额键均过期，不扫描全量键、不驱逐有效 nonce。状态数量约受“每分钟配额 × 保留分钟数”限制；公钥默认最多覆盖 61 个窗口，nonce 最长覆盖 17 个窗口。部署仍须设置 Redis 内存预算、noeviction 和可靠持久化。

<a id="transport-capacity"></a>

## HTTP 容量与文件换算

`maxPlaintextBytes` 限制单个请求或响应的完整 JSON 明文 UTF-8 字节数，两个方向使用同一上限。默认 `1048576`（1 MiB），只接受 `1024`–`67108864`（1 KiB–64 MiB）的整数；字符串、null、零、负数、小数和无限制均无效。只有 Serv/Kit 的宿主配置支持 `auto`，装配时转换为省略值；直接调用 Crypto 传数字或省略。

Serv 在 `config/_serv.yml` 的 `transport.maxPlaintextBytes` 中配置，对应环境变量为 `HAI_SERV_TRANSPORT_MAXPLAINTEXTBYTES`；同源 SvelteKit 使用 `config/_kit.yml` 和 `HAI_KIT_TRANSPORT_MAXPLAINTEXTBYTES`。宿主读取配置后传入服务端管理器，CLI 的 API/fullstack 模板已完成转发。直接接入时传给 `crypto.transport.createServer({ serverKeyRing, keyStore, maxPlaintextBytes })`；修改后重新创建管理器。

服务端握手返回 `manager.bodyLimits.plaintextBytes`。客户端默认跟随该值；显式配置客户端上限时取两者较小值。自定义握手端点也必须返回 `maxPlaintextBytes`，握手正文仍只允许 16 KiB。调低服务端上限后立即按新值检查，已有客户端需重新握手取得新预算。

按 `new TextEncoder().encode(JSON.stringify(payload)).byteLength` 计算大小，不能用字符数代替。文件 Base64 长度是 `4 * ceil(文件字节数 / 3)`，还要加 JSON 字段、文件名、转义和其他业务字段。4 MiB XLSX 的 Base64 本体为 `5592408` 字节，常见包装可选 8 MiB 明文预算；任意二进制不能直接当 UTF-8 发送，应沿用应用约定的 JSON/Base64 格式。

密文使用 SM4-CBC 十六进制编码，`resolveTransportBodyLimits(limit).encryptedPayloadBytes` 为 `2 * limit + 32768`。32 KiB 用于填充和认证封装，8 MiB 明文对应 `16809984` 字节代理请求上限。内存占用还包括 JSON、Base64、密文和认证中间数据。文件原始大小、压缩包解压量、工作表/行数、权限和业务并发仍由应用限制。

普通业务使用全局 `transport.maxPlaintextBytes`。Feedback 的报告、证据、附件和 ZIP 路由通过宿主 `routePlaintextBytes` 声明 `feedback.budget.maxTransportBytes`，显式宿主值优先，`*` 只匹配一个完整路径段。重叠路径采用较小预算。握手与部署代理按所有路由的最大值预留，普通业务预算保持原值；HTTP 适配器给显式配置且超过 1 MiB 的路由 2 个并发名额，普通路由另有 16 个，完整响应或失败后释放。额度满返回 503 / `hai:crypto:072`，不会自动重放写请求。

握手 16 KiB、公钥 4 KiB、认证头 16 KiB、路径 8 KiB、握手超时 30 秒及认证和共享防重放约束均独立于业务容量。超限立即停止读取、取消原流并释放 reader，不依赖 Content-Length 或 clone/tee。`TransportBodyTooLargeError`（继承 RangeError，`hai:crypto:070`）只携带 `direction`、`stage`、`limitBytes` 和可用的 `actualBytes`；`stage` 为 `plaintext`、`encrypted` 或 `header`，提前终止时观察到的字节数可能小于完整报文。

请求超限返回 413；已认证请求产生的过大响应替换成加密的 500 容量错误。客户端只在验证响应后恢复响应方向的诊断，未认证的 413 只视为请求容量失败并取消正文。api-client 映射为 `HaiApiClientError.PAYLOAD_TOO_LARGE`（`hai:api-client:020`），保留方向、阶段和字节信息。

### 部署与增量更新

docker-ssh 从解析后的 `_serv.yml` 生成 Nginx `client_max_body_size`，关闭请求/响应 buffering。响应大小由两端检查，认证头缓冲单独设置；SvelteKit 部署从 `_kit.yml` 推导 adapter-node 的 `BODY_SIZE_LIMIT`。自管代理和启动器也应使用 `resolveTransportBodyLimits()`，外部 CDN/网关的限制由运营方配置。

全量部署直接采用新预算；包含 app 的增量部署携带新代理配置，容量变化时复用现有 Web 镜像重建 Web，纳入健康检查和失败恢复，无需新 Web 镜像。增量仅允许容量指令变化，端口、API 路由和其他代理策略变化须全量部署；容量变化但未选择 app 时拒绝。容量不变则保留 Web 容器。详见 [部署流程](../function/deploy.md)。

自定义 `TransportEncryptionManager` 和测试替身使用 `resolveTransportBodyLimits()` 生成 `bodyLimits`，并在握手返回对应明文预算。

<a id="browser-support"></a>

## 浏览器版本过低时的提示

Edge 100 缺少加密客户端读取请求正文所用的 `Request.body`，可能把空正文加密发出，导致登录返回 400。Web 入口会先检测已知的低版本浏览器并显示升级说明。检测门槛、适用模板与发布路径见[浏览器启动检测](../getting-started/build.md#浏览器启动检测)。[Chromium 请求流说明](https://developer.chrome.com/docs/capabilities/web-apis/fetch-streaming-requests)

## 错误处理

加解密、签名、哈希和密码操作返回 `HaiResult<T>`，先判断 `success`。随机 key/IV 与格式检测工具返回直接值；`crypto.close()` 返回 `Promise<void>`。`encryptedFetch` 按 fetch 语义拒绝 Promise，流读取、容量推导等显式抛错工具须在各自调用边界捕获：

```ts
const result = crypto.asymmetric.encrypt('data', publicKey)
if (!result.success) {
  // result.error.code / result.error.message
}
```
