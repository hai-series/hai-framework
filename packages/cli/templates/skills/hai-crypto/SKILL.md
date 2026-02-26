---
name: hai-crypto
description: 使用 @h-ai/crypto 进行加密（非对称/哈希/对称）与密码哈希；当需求涉及加密、解密、签名、验签、哈希、密码存储或密钥管理时使用。
---

# hai-crypto

> `@h-ai/crypto` 提供非对称加密、哈希、对称加密与密码哈希能力，支持 Node.js 与浏览器双端。

---

## 适用场景

- 非对称加密/解密、签名/验签、密钥生成
- 哈希计算与 HMAC
- 对称加密/解密（ECB/CBC 模式）
- 密码存储与验证（加盐迭代哈希）

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
| `generateKeyPair`   | `() => Result<KeyPair>`                                     | 生成密钥对   |
| `encrypt`           | `(data, publicKey, options?) => Result<string>`             | 公钥加密     |
| `decrypt`           | `(ciphertext, privateKey, options?) => Result<string>`      | 私钥解密     |
| `sign`              | `(data, privateKey, options?) => Result<string>`            | 私钥签名     |
| `verify`            | `(data, signature, publicKey, options?) => Result<boolean>` | 公钥验签     |
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
**SignOptions**：`{ hash?: boolean, userId?: string, outputFormat?: 'hex' | 'der' }`

### 哈希 — `crypto.hash`

| 方法     | 签名                                                       | 说明     |
| -------- | ---------------------------------------------------------- | -------- |
| `hash`   | `(data: string \| Uint8Array, options?) => Result<string>` | 哈希     |
| `hmac`   | `(data, key) => Result<string>`                            | HMAC     |
| `verify` | `(data, expectedHash) => Result<boolean>`                  | 验证哈希 |

```typescript
const hash = crypto.hash.hash('hello')
const hmac = crypto.hash.hmac('hello', 'secret-key')
const valid = crypto.hash.verify('hello', hash.data!)
```

**HashOptions**：`{ inputEncoding?: 'utf8' | 'hex', outputFormat?: 'hex' | 'array' }`

### 对称加密 — `crypto.symmetric`

| 方法            | 签名                                            | 说明                        |
| --------------- | ----------------------------------------------- | --------------------------- |
| `generateKey`   | `() => string`                                  | 生成 128-bit 密钥（32 hex） |
| `generateIV`    | `() => string`                                  | 生成随机 IV（32 hex）       |
| `encrypt`       | `(data, key, options?) => Result<string>`       | 加密                        |
| `decrypt`       | `(ciphertext, key, options?) => Result<string>` | 解密                        |
| `encryptWithIV` | `(data, key) => Result<EncryptWithIVResult>`    | CBC 模式加密（自动生成 IV） |
| `decryptWithIV` | `(ciphertext, key, iv) => Result<string>`       | CBC 模式解密                |
| `deriveKey`     | `(password, salt) => string`                    | 从密码和盐值派生密钥        |
| `isValidKey`    | `(key: string) => boolean`                      | 校验密钥格式                |
| `isValidIV`     | `(iv: string) => boolean`                       | 校验 IV 格式                |

```typescript
const key = crypto.symmetric.generateKey()
const result = crypto.symmetric.encryptWithIV('明文数据', key)
if (result.success) {
  const decrypted = crypto.symmetric.decryptWithIV(result.data.ciphertext, key, result.data.iv)
}
```

**SymmetricOptions**：`{ mode?: 'ecb' | 'cbc', iv?: string, inputEncoding?: 'utf8' | 'hex', outputFormat?: 'hex' | 'base64' }`

### 密码哈希 — `crypto.password`

| 方法     | 签名                                    | 说明     |
| -------- | --------------------------------------- | -------- |
| `hash`   | `(password, config?) => Result<string>` | 密码哈希 |
| `verify` | `(password, hash) => Result<boolean>`   | 验证密码 |

```typescript
const hashed = crypto.password.hash('MyPassword123')
if (hashed.success) {
  const valid = crypto.password.verify('MyPassword123', hashed.data)
}
```

哈希格式：`$hai$<iterations>$<salt>$<hash>`
**PasswordConfig**：`{ saltLength?: number, iterations?: number }`

---

## 错误码 — `CryptoErrorCode`

| 错误码                  | 值   | 说明          |
| ----------------------- | ---- | ------------- |
| `OPERATION_FAILED`      | 2000 | 操作失败      |
| `INVALID_INPUT`         | 2001 | 无效输入      |
| `INVALID_KEY`           | 2002 | 无效密钥      |
| `NOT_INITIALIZED`       | 2010 | 未初始化      |
| `INIT_FAILED`           | 2011 | 初始化失败    |
| `KEY_GENERATION_FAILED` | 2020 | 密钥生成失败  |
| `ENCRYPTION_FAILED`     | 2021 | 加密失败      |
| `DECRYPTION_FAILED`     | 2022 | 解密失败      |
| `SIGN_FAILED`           | 2023 | 签名失败      |
| `VERIFY_FAILED`         | 2024 | 验签失败      |
| `HASH_FAILED`           | 2040 | 哈希计算失败  |
| `HMAC_FAILED`           | 2041 | HMAC 计算失败 |
| `INVALID_IV`            | 2060 | 无效 IV       |

---

## 常见模式

### 数据加密存储

```typescript
const key = process.env.DATA_ENCRYPTION_KEY!
const encrypted = crypto.symmetric.encrypt(sensitiveData, key)
// 存入数据库

// 读取时解密
const decrypted = crypto.symmetric.decrypt(storedData, key)
```

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

- `hai-core`：配置与 Result 模型
- `hai-iam`：密码哈希（内部自动调用 crypto.password）
- `hai-kit`：SvelteKit 集成（传输加密）
