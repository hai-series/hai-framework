---
name: hai-crypto
description: 使用 @h-ai/crypto 进行加密（非对称/哈希/对称）、密码哈希与传输加密；当需求涉及加密、解密、签名、验签、哈希、密码存储、密钥管理或 crypto.transport 时使用。
---

# hai-crypto

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/crypto 进行加密（非对称/哈希/对称）、密码哈希与传输加密；当需求涉及加密、解密、签名、验签、哈希、密码存储、密钥管理或 crypto.transport 时使用。 |
| 适用场景 | 当任务与 `hai-crypto` 的能力描述匹配，并且需要遵循本 Skill 的流程和边界时 |
| 输入 | 模块配置、类型化业务参数、依赖初始化状态和目标运行环境 |
| 输出 | 符合模块公共 API 的实现或示例；业务结果使用 HaiResult，并同步必要测试与文档 |
| 限制 | 遵守 init → use → close 生命周期与运行环境边界；不绕过类型、授权、输入校验或敏感信息保护 |

> `@h-ai/crypto` 提供非对称加密、哈希、对称加密与密码哈希能力，支持 Node.js 与浏览器双端。

---

## 运行环境

**Node.js + 浏览器双端可用。** 浏览器端通过 `crypto.init()` 初始化（无需配置参数）。

| 能力 | Node.js | 浏览器 | 说明 |
|------|---------|--------|------|
| `crypto.asymmetric` 非对称加密 | ✅ | ✅ | SM2 加解密、签名验签 |
| `crypto.hash` 哈希 | ✅ | ✅ | SM3 哈希、HMAC |
| `crypto.symmetric` 对称加密 | ✅ | ✅ | SM4 ECB/CBC |
| `crypto.password` 密码哈希 | ✅ | ❌ | 依赖 Node.js crypto（服务端专用） |
| `crypto.transport` 传输加密 | ✅ | ✅ | 服务端管理器 + 客户端 encryptedFetch |

浏览器端主要用于 kit 传输加密场景（`kit.client.create({ transport: { crypto } })`），一般不需要直接调用 crypto API。

---

## 适用场景

- 非对称加密/解密、签名/验签、密钥生成
- 哈希计算与 HMAC
- 对称加密/解密（ECB/CBC 模式）
- 密码存储与验证（加盐迭代哈希）
- 传输加密：为 serv / kit / api-client 提供统一协议、密钥协商和请求响应加解密

---

## 使用步骤

### 1. 初始化与关闭

```typescript
import { crypto } from '@h-ai/crypto'

await crypto.init()

// 使用后关闭
await crypto.close()
```

---

## 核心 API

### 非对称加密 — `crypto.asymmetric`

| 方法                | 签名                                                        | 说明         |
| ------------------- | ----------------------------------------------------------- | ------------ |
| `generateKeyPair`   | `() => HaiResult<KeyPair>`                                     | 生成密钥对   |
| `encrypt`           | `(data, publicKey, options?) => HaiResult<string>`             | 公钥加密     |
| `decrypt`           | `(ciphertext, privateKey, options?) => HaiResult<string>`      | 私钥解密     |
| `sign`              | `(data, privateKey, options?) => HaiResult<string>`            | 私钥签名     |
| `verify`            | `(data, signature, publicKey, options?) => HaiResult<boolean>` | 公钥验签     |
| `isValidPublicKey`  | `(key: string) => boolean`                                  | 校验公钥格式 |
| `isValidPrivateKey` | `(key: string) => boolean`                                  | 校验私钥格式 |

```typescript
const keyPair = crypto.asymmetric.generateKeyPair()
if (keyPair.success) {
  const { publicKey, privateKey } = keyPair.data

  const encrypted = crypto.asymmetric.encrypt('敏感数据', publicKey)
  if (encrypted.success) {
    const decrypted = crypto.asymmetric.decrypt(encrypted.data, privateKey)
  }

  const signature = crypto.asymmetric.sign('待签名数据', privateKey)
  if (signature.success) {
    const valid = crypto.asymmetric.verify('待签名数据', signature.data, publicKey)
  }
}
```

**AsymmetricEncryptOptions**：`{ cipherMode?: 0 | 1, outputFormat?: 'hex' | 'base64' }`
**SignOptions**：`{ hash?: boolean, userId?: string }`

### 哈希 — `crypto.hash`

| 方法     | 签名                                                       | 说明     |
| -------- | ---------------------------------------------------------- | -------- |
| `hash`   | `(data: string \| Uint8Array, options?) => HaiResult<string>` | 哈希     |
| `hmac`   | `(data, key) => HaiResult<string>`                            | HMAC     |
| `verify` | `(data, expectedHash) => HaiResult<boolean>`                  | 验证哈希 |

```typescript
const hash = crypto.hash.hash('hello')
const hmac = crypto.hash.hmac('hello', 'secret-key')
const valid = crypto.hash.verify('hello', hash.data!)
```

**HashOptions**：`{ inputEncoding?: 'utf8' | 'hex' }`

### 对称加密 — `crypto.symmetric`

| 方法            | 签名                                            | 说明                        |
| --------------- | ----------------------------------------------- | --------------------------- |
| `generateKey`   | `() => string`                                  | 生成 128-bit 密钥（32 hex） |
| `generateIV`    | `() => string`                                  | 生成随机 IV（32 hex）       |
| `encrypt`       | `(data, key, options?) => HaiResult<SymmetricEncryptedPayload>` | 加密（返回结构化密文）      |
| `decrypt`       | `(payload, key) => HaiResult<string>`          | 解密结构化密文              |
| `encryptWithIV` | `(data, key) => HaiResult<EncryptWithIVResult>`    | CBC 模式加密（自动生成 IV） |
| `decryptWithIV` | `(ciphertext, key, iv) => HaiResult<string>`       | CBC 模式解密                |
| `deriveKey`     | `(password, salt) => string`                    | 从密码和盐值派生密钥        |
| `isValidKey`    | `(key: string) => boolean`                      | 校验密钥格式                |
| `isValidIV`     | `(iv: string) => boolean`                       | 校验 IV 格式                |

```typescript
const key = crypto.symmetric.generateKey()

// 默认安全用法：CBC + 自动 IV，返回 { mode, ciphertext, iv, encoding }
const encrypted = crypto.symmetric.encrypt('明文数据', key)
if (encrypted.success) {
  const decrypted = crypto.symmetric.decrypt(encrypted.data, key)
}

// 需要单独存储 IV 时使用结构化结果
const withIV = crypto.symmetric.encryptWithIV('明文数据', key)
if (withIV.success) {
  const decrypted = crypto.symmetric.decryptWithIV(withIV.data.ciphertext, key, withIV.data.iv)
}
```

**SymmetricEncryptOptions**：`{ mode?: 'ecb' | 'cbc', iv?: string, outputFormat?: 'hex' | 'base64' }`
**SymmetricEncryptedPayload**：`{ mode: 'ecb' | 'cbc', ciphertext: string, iv?: string, encoding: 'hex' | 'base64' }`

> `encrypt()` 默认使用 CBC 并自动生成 IV。ECB 会泄漏明文结构，只有底层协议明确要求时才显式 `{ mode: 'ecb' }`。

### 密码哈希 — `crypto.password`

| 方法     | 签名                                    | 说明     |
| -------- | --------------------------------------- | -------- |
| `hash`   | `(password, config?) => HaiResult<string>` | 密码哈希 |
| `verify` | `(password, hash) => HaiResult<boolean>`   | 验证密码 |

```typescript
const hashed = crypto.password.hash('MyPassword123')
if (hashed.success) {
  const valid = crypto.password.verify('MyPassword123', hashed.data)
}
```

哈希格式：`$hai$<iterations>$<salt>$<hash>`
**PasswordConfig**：`{ saltLength?: number, iterations?: number }`

### 传输加密 — `crypto.transport`

传输加密主工厂必须从 `crypto.transport` 访问；共享 `keyStore` provider 请从 `@h-ai/crypto` 根入口导入，不从子目录内部路径导入。

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `createServer` | `(options?) => HaiResult<TransportEncryptionManager>` | 创建服务端传输加密管理器 |
| `createClient` | `({ keyExchangeUrl, fetch? }) => TransportClient` | 创建客户端 encryptedFetch 会话 |
| `protocol` | `TRANSPORT_PROTOCOL` | 协议常量：`X-Client-Id`、`X-Encrypted`、默认协商路径 |

共享 `keyStore` provider（从 `@h-ai/crypto` 根入口导入）：

| 工厂 | 签名 | 说明 |
| --- | --- | --- |
| `createInMemoryKeyStore` | `(maxClients?) => TransportKeyStore` | 默认 FIFO 内存实现 |
| `createRedisTransportKeyStore` | `({ cache, ttlSeconds? }) => TransportKeyStore` | 基于 `@h-ai/cache` 的共享实现，通常配 Redis |
| `createReldbTransportKeyStore` | `({ reldb, ttlSeconds? }) => TransportKeyStore` | 基于 `@h-ai/reldb` 的共享实现，自动建表 |

```typescript
const server = crypto.transport.createServer({ maxClients: 10000 })
if (!server.success)
  return server

const client = crypto.transport.createClient({
  keyExchangeUrl: 'https://api.example.com/api/v1/_hai/key-exchange',
})

const resp = await client.encryptedFetch('https://api.example.com/api/v1/echo', {
  method: 'POST',
  body: JSON.stringify({ hello: 'world' }),
})
```

```typescript
import { createRedisTransportKeyStore, crypto } from '@h-ai/crypto'
import { cache } from '@h-ai/cache'

await cache.init({ type: 'redis', host: '127.0.0.1', port: 6379 })

const sharedServer = crypto.transport.createServer({
  keyStore: createRedisTransportKeyStore({ cache, ttlSeconds: 3600 }),
})
```

使用流程：
1. 先 `await crypto.init()`。
2. 服务端 `createServer()` 后暴露一个 POST 密钥协商端点：接收 `clientPublicKey`，返回 `serverPublicKey + clientId`。
3. 客户端 `createClient({ keyExchangeUrl })` 后，首次 `init()` / `encryptedFetch()` 会自动做密钥协商。
4. 协商完成后，请求附带 `X-Client-Id`；若请求有 body，则自动包装成 `{ encryptedKey, ciphertext, iv }`。
5. 服务端先 `decryptRequest()`，业务处理后再 `encryptResponse(clientId, data)`。
6. 客户端收到 `X-Encrypted: true` 的响应后自动解密；`destroy()` 可清空当前会话。

`encryptedFetch()` 与原生 fetch 一样会 reject：网络错误、密钥协商失败、请求加密失败或响应解密失败都应在调用方按 fetch 错误处理策略捕获。

常规应用优先使用上层封装：
- serv：`serv.createApp({ transport: { crypto } })`
- kit：`kit.createHandle({ crypto: { crypto, transport: true } })` + `kit.client.create({ transport: { crypto } })`
- api-client：`apiClient.init({ transport: { crypto } })`

---

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
| `HaiCryptoError.INVALID_IV` | `hai:crypto:060` | 无效 IV |

---

## 常见模式

### 数据加密存储

```typescript
const key = process.env.HAI_CRYPTO_DATA_KEY!
const encrypted = crypto.symmetric.encrypt(sensitiveData, key)
// 存入数据库

// 读取时解密
const decrypted = crypto.symmetric.decrypt(storedPayload, key)
```

> 默认密文是结构化对象，必须完整存储 `mode` / `ciphertext` / `iv` / `encoding` 字段；如果数据库字段已拆分 IV 与密文，请改用 `encryptWithIV()` / `decryptWithIV()`。

### 密码存储与验证

```typescript
// 注册时哈希存储
const hashResult = crypto.password.hash(userPassword)
if (hashResult.success) {
  // 存储 hashResult.data 到数据库
}

// 登录时验证
const verifyResult = crypto.password.verify(inputPassword, storedHash)
if (verifyResult.success && verifyResult.data) {
  // 密码匹配
}
```

---

## 相关 Skills

- `hai-core`：配置与 HaiResult 模型
- `hai-iam`：密码哈希（内部自动调用 crypto.password）
- `hai-kit`：SvelteKit 集成（传输加密）
- `hai-serv` / `hai-api-client`：跨域 HTTP API 的透明传输加密
