# @h-ai/crypto 功能说明

通过 `crypto` 处理加密、签名、哈希和密码存储。加密内容使用加密密钥，存储登录密码时保存带盐哈希。保护 HTTP 请求和响应时使用 `crypto.transport` 或 Serv/Kit 的传输加密支持。

[模块 README](../../../packages/crypto/README.md) · [配置清单](../configuration/crypto.md) · [数据结构](../data/crypto.md) · [前后端接入](../development/frontend-backend.md)

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

SM2/SM3/SM4 与传输支持 Node.js / 浏览器；密码哈希仅服务端

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

### 传输加密（crypto.transport）

传输客户端 `destroy()` 使在途握手失效并取消网络等待；迟到结果不能恢复密钥或覆盖下一次握手。它只清理本地会话，服务端 registry 仍按自己的租约回收。

规范编码、验证顺序与 nonce 持久化要求见 [Transport v2 协议](../../../packages/crypto/TRANSPORT-PROTOCOL.md)。

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

> 服务端必须显式注入相同的受管 `serverKeyRing` 和共享 `keyStore`（Redis 或共享数据库）。仅共享客户端公钥不足以跨节点解密。没有隐式进程私钥或内存 registry 回退；开发/测试显式用 `createInMemoryKeyStore(capacity)`。服务端重启后重新加载同一密钥环即可，无需 sticky session。

共享存储可直接复用 `@h-ai/crypto` 根入口导出的 provider 工厂：

- `createInMemoryKeyStore(maxClients)`：显式创建默认内存实现，常用于测试或自定义容量
- `createRedisTransportKeyStore({ cache, ttlSeconds? })`：复用 `@h-ai/cache`，通常配合 Redis provider 获取跨节点共享
- `createReldbTransportKeyStore({ reldb, ttlSeconds?, maxClients? })`：复用已初始化的 `@h-ai/reldb`，自动创建公钥、nonce 与容量表；返回带 `pruneExpired()` 的 `ReldbTransportKeyStore`

公钥注册先验证编码和 SM2 曲线点；仅接受 128 字符 hex 或 `04` + 128 字符 hex，不接受压缩点、无穷远点和曲线外点。纯函数 `isValidSM2PublicKey(value)` 无需初始化，可用于自定义握手入口；serv/kit 在写 registry 前返回 400。

Redis/DB 的 `ttlSeconds` 省略表示不过期；显式值须为 1–2147483647 的整数秒，建议设置有限 TTL。Redis 使用原生逐键 TTL，不提供 DB 的 `maxClients` 容量限制，部署需设置内存预算且禁止驱逐有效 nonce。DB `maxClients` 为正安全整数，默认 10000，所有节点必须与持久容量记录一致；事务锁定共享容量行后计数和插入，容量满时拒绝注册，不驱逐有效公钥或 nonce。删除客户端不删除尚有效的 nonce。

DB 使用数据库时钟生成、判断 epoch 毫秒过期时间；数据库与节点均须满足协议的时钟同步要求。首次建表失败可重试。每次注册自动清理一批；`await registry.pruneExpired()` 每次最多删除 100 条过期公钥和 100 条过期 nonce，可由应用定期调度。没有隐式后台计时器，低流量部署仍需主动调度维护；registry 不关闭应用注入的 reldb。公钥过期时间保存在 BIGINT 字段 `created_at_ms` / `expires_at_ms`，容量在 `hai_crypto_transport_capacity` 保存；容量调整须协调所有节点及持久记录，不能清空有效 nonce 来重建 registry。

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

用 `encryptedFetch()` 像用浏览器的 `fetch()` 一样等待响应。网络、密钥交换、请求加密或响应解密失败都会抛出异常，调用时用 `try/catch` 处理。

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

握手响应提供当前服务端密钥编号、公钥、客户端编号和请求正文上限，即 `{ serverKeyId, serverPublicKey, clientId, maxPlaintextBytes }`。之后的请求附上 `serverKeyId`，服务端直接用该编号选私钥。密钥编号不存在或已撤销时拒绝请求。响应使用客户端公钥加密。

轮换服务端密钥时，先在所有服务节点配置包含新旧版本的密钥集合，再将 `activeKeyId` 切换为新编号，并逐台重启或重新创建加密管理器。过渡期保留旧版本，结束后从所有节点移除旧编号。仍在用旧版本的客户端先调用传输对象的 `destroy()`，再重新握手。不要因此自动重试可能已产生外部效果的请求。

同一环境的服务节点应从 Secret Manager 或受保护的服务端环境文件读取同一份密钥。禁止写入公开 YAML、`PUBLIC_*`、`VITE_*`、日志或接口响应。CLI 新项目会为开发、测试和生产分别生成私有 `.env.<环境>.local`。这些文件不随 Git 分发。其他机器从受保护的配置来源获取对应密钥，运行时不会自动生成。

加密传输使用 v2 格式。客户端为请求随机选取 SM4-CBC 密钥和 HMAC-SM3 密钥，用 SM2 将密钥加密。客户端用自己的私钥签名请求，服务端用请求选中的服务端密钥版本签名响应。接收端先验签，再核对消息认证码（MAC），最后解密。

认证会核对消息方向、两端的密钥或客户端编号、请求编号、发送时间、HTTP 方法、路径与原始查询字符串。响应还会核对 HTTP 状态码。客户端生成的 128 位随机请求编号也用来防止同一个密文被反复发送。服务端默认只接受 5 分钟内发出的请求，客户端时钟最多可快 30 秒。可用 `maxRequestAgeSeconds`（1 到 600 秒）和 `maxFutureSkewSeconds`（0 到 300 秒）调整。

所有服务节点通过同一处 Redis 或数据库登记 `(clientId, requestId)`。重复的编号不会再次接受，登记自请求发出起保留 11 分钟。存储不可用时拒绝请求。Redis 应选择 `noeviction` 并开启可靠的持久化，节点时钟应同步。应用自行重试付款、发信等操作时，应通过自己的业务键去重。

没有正文的 POST 仍需要认证。GET、HEAD 以及 204、304、HEAD 等无正文响应，把认证数据放在 `X-Hai-Transport` 头。其他请求或响应把密文放在 JSON 正文，并设置 `X-Encrypted: true`。客户端收到加密响应会用原请求和实际状态码验证。标记丢失、格式过旧或认证失败时，调用会抛出错误。

如果某个接口必须接收普通 HTTPS 正文，服务端把该路由设为 `encryption: disabled` 或加入 `excludePaths`。浏览器请求同一路由时也应配置客户端的 `excludePaths`。跨域接入还须允许并公开 `X-Hai-Transport` 请求头和响应头。使用 HTTPS 可以验证握手接收的公钥确实来自目标服务器。访问资源前，服务端仍需检查当前用户的 IAM 权限。

业务容量通过 `transport.maxPlaintextBytes` 统一配置：默认 1 MiB，整数范围 1 KiB～64 MiB，请求和响应共用 UTF-8 明文字节预算。客户端从握手自动获取上限，密文与部署代理预算由 `resolveTransportBodyLimits()` 推导（两倍明文 + 32 KiB）。握手、公钥、认证头和防重放约束独立；超限取消原流并释放 reader，请求 413、响应为加密的 500 容量错误，客户端识别 `TransportBodyTooLargeError` / `hai:crypto:070`。 [容量配置与文件换算](../../../packages/crypto/TRANSPORT-CAPACITY.md)。

普通接口沿用 `transport.maxPlaintextBytes`，设为 `auto` 或省略时上限为 1 MiB。反馈上报、证据、附件和 ZIP 下载通常需要更大正文。给这些路由单独设置 `routePlaintextBytes`，取值可用 `feedback.budget.maxTransportBytes`。路径中的 `*` 只匹配一个路径段。若应用已为某条路由配置额度，以该值为准。

握手、Node HTTP 适配器和反向代理按各路由的最大值预留空间。HTTP 适配器为显式配置且超过 1 MiB 的路由最多同时处理 2 个请求，普通路由另有 16 个名额。响应发送完毕或请求失败时释放名额。忙碌时返回 HTTP 503（`hai:crypto:072`），应用决定是否重试。

Serv/Kit 对通过请求绑定、签名和 MAC 校验但超出时间窗口的请求返回加密的 HTTP 400 错误。客户端抛出 `TransportTimeError`（`hai:crypto:071`），显示校验时的服务器 UTC 时间，提示开启设备的自动校时或手工修改时间后刷新。`serverTime` 为 Unix 毫秒。`api-client` 映射为 `VALIDATION_FAILED`，在 `cause.transportCode` 和 `cause.serverTime` 保留诊断信息。

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

参见[传输容量](../../../packages/crypto/TRANSPORT-CAPACITY.md)。

## 错误处理

加解密、签名、哈希和密码操作返回 `HaiResult<T>`，先判断 `success`。随机 key/IV 与格式检测工具返回直接值；`crypto.close()` 返回 `Promise<void>`。`encryptedFetch` 按 fetch 语义拒绝 Promise，流读取、容量推导等显式抛错工具须在各自调用边界捕获：

```ts
const result = crypto.asymmetric.encrypt('data', publicKey)
if (!result.success) {
  // result.error.code / result.error.message
}
```
