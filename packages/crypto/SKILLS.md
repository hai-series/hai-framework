# @hai/crypto SKILLS

> AI 助手参考文档，包含详细的接口说明、参数定义和使用示例。

---

## 模块概述

`@hai/crypto` 是国密算法加密模块，提供 SM2/SM3/SM4 算法支持：

- **SM2**: 非对称加密算法，用于密钥生成、加解密、签名验签
- **SM3**: 哈希算法，输出 256 位哈希值
- **SM4**: 对称加密算法，支持 ECB/CBC 模式

---

## 核心对象

### crypto（单例）

```ts
import { crypto } from '@hai/crypto'

// 直接访问
crypto.sm2.generateKeyPair()
crypto.sm3.hash('data')
crypto.sm4.encrypt('data', key)
```

### createCryptoService()（工厂函数）

```ts
import { createCryptoService } from '@hai/crypto'

const customCrypto = createCryptoService()
customCrypto.sm2.generateKeyPair()
```

---

## SM2 非对称加密 API

### generateKeyPair()

生成 SM2 密钥对。

```ts
const result = crypto.sm2.generateKeyPair()
// 返回: Result<{ publicKey: string; privateKey: string }, CryptoError>

if (result.success) {
  console.log(result.data.publicKey) // 公钥（十六进制，04 开头）
  console.log(result.data.privateKey) // 私钥（十六进制）
}
```

### encrypt(data, publicKey, options?)

使用公钥加密数据。

| 参数                 | 类型                | 说明                                 |
| -------------------- | ------------------- | ------------------------------------ |
| data                 | `string`            | 待加密的明文                         |
| publicKey            | `string`            | 公钥（十六进制）                     |
| options.cipherMode   | `0 \| 1`            | 密文格式：0=C1C2C3，1=C1C3C2（默认） |
| options.outputFormat | `'hex' \| 'base64'` | 输出格式（默认 hex）                 |

```ts
const result = crypto.sm2.encrypt('Hello', publicKey)
// 返回: Result<string, CryptoError>
```

### decrypt(ciphertext, privateKey, options?)

使用私钥解密数据。

| 参数                | 类型                | 说明                 |
| ------------------- | ------------------- | -------------------- |
| ciphertext          | `string`            | 密文                 |
| privateKey          | `string`            | 私钥（十六进制）     |
| options.cipherMode  | `0 \| 1`            | 密文格式             |
| options.inputFormat | `'hex' \| 'base64'` | 输入格式（默认 hex） |

```ts
const result = crypto.sm2.decrypt(ciphertext, privateKey)
// 返回: Result<string, CryptoError>
```

### sign(data, privateKey, options?)

使用私钥签名。

| 参数           | 类型      | 说明                                |
| -------------- | --------- | ----------------------------------- |
| data           | `string`  | 待签名数据                          |
| privateKey     | `string`  | 私钥                                |
| options.hash   | `boolean` | 是否先做 SM3 哈希（默认 true）      |
| options.userId | `string`  | 用户标识（默认 "1234567812345678"） |
| options.der    | `boolean` | 是否输出 DER 格式（默认 false）     |

```ts
const result = crypto.sm2.sign('data', privateKey)
// 返回: Result<string, CryptoError>
```

### verify(data, signature, publicKey, options?)

使用公钥验签。

```ts
const result = crypto.sm2.verify('data', signature, publicKey)
// 返回: Result<boolean, CryptoError>
```

### isValidPublicKey(key) / isValidPrivateKey(key)

验证密钥格式。

```ts
crypto.sm2.isValidPublicKey(publicKey) // boolean
crypto.sm2.isValidPrivateKey(privateKey) // boolean
```

---

## SM3 哈希 API

### hash(data, options?)

计算 SM3 哈希值。

| 参数                 | 类型                | 说明                 |
| -------------------- | ------------------- | -------------------- |
| data                 | `string`            | 待哈希数据           |
| options.outputFormat | `'hex' \| 'base64'` | 输出格式（默认 hex） |

```ts
const hash = crypto.sm3.hash('Hello, SM3!')
// 返回: string（64 字符十六进制）
```

### hmac(data, key)

计算 HMAC-SM3。

```ts
const hmac = crypto.sm3.hmac('data', 'secret-key')
// 返回: string
```

### verify(data, expectedHash, options?)

验证数据哈希是否匹配。

```ts
const isValid = crypto.sm3.verify('data', hash)
// 返回: boolean
```

---

## SM4 对称加密 API

### generateKey()

生成 16 字节随机密钥。

```ts
const key = crypto.sm4.generateKey()
// 返回: string（32 字符十六进制）
```

### generateIV()

生成 16 字节随机 IV。

```ts
const iv = crypto.sm4.generateIV()
// 返回: string（32 字符十六进制）
```

### encrypt(data, key, options?)

ECB 模式加密。

| 参数                 | 类型                | 说明                    |
| -------------------- | ------------------- | ----------------------- |
| data                 | `string`            | 待加密数据              |
| key                  | `string`            | 密钥（32 字符十六进制） |
| options.outputFormat | `'hex' \| 'base64'` | 输出格式（默认 hex）    |

```ts
const result = crypto.sm4.encrypt('data', key)
// 返回: Result<string, CryptoError>
```

### decrypt(ciphertext, key, options?)

ECB 模式解密。

```ts
const result = crypto.sm4.decrypt(ciphertext, key)
// 返回: Result<string, CryptoError>
```

### encryptWithIV(data, key)

CBC 模式加密，自动生成 IV（推荐使用）。

```ts
const result = crypto.sm4.encryptWithIV('data', key)
// 返回: Result<{ ciphertext: string; iv: string }, CryptoError>

if (result.success) {
  const { ciphertext, iv } = result.data
}
```

### decryptWithIV(ciphertext, key, iv)

CBC 模式解密。

```ts
const result = crypto.sm4.decryptWithIV(ciphertext, key, iv)
// 返回: Result<string, CryptoError>
```

### deriveKey(password, salt)

从密码派生 SM4 密钥。

```ts
const key = crypto.sm4.deriveKey('password', 'salt')
// 返回: string（派生的密钥）
```

### isValidKey(key) / isValidIV(iv)

验证密钥/IV 格式。

```ts
crypto.sm4.isValidKey(key) // boolean
crypto.sm4.isValidIV(iv) // boolean
```

---

## 错误码

| 错误码 | 常量                            | 说明         |
| ------ | ------------------------------- | ------------ |
| 4000   | `ENCRYPTION_FAILED`             | 加密失败     |
| 4001   | `DECRYPTION_FAILED`             | 解密失败     |
| 4010   | `INVALID_KEY`                   | 无效的密钥   |
| 4011   | `KEY_GENERATION_FAILED`         | 密钥生成失败 |
| 4020   | `INVALID_SIGNATURE`             | 无效的签名   |
| 4021   | `SIGNATURE_VERIFICATION_FAILED` | 签名验证失败 |
| 4030   | `HASH_FAILED`                   | 哈希计算失败 |
| 4040   | `INVALID_INPUT`                 | 无效的输入   |
| 4099   | `UNKNOWN_ERROR`                 | 未知错误     |

---

## 完整示例

### 1. SM2 加解密流程

```ts
import { crypto } from '@hai/crypto'

// 1. 生成密钥对
const keyPair = crypto.sm2.generateKeyPair()
if (!keyPair.success)
  throw new Error(keyPair.error.message)

const { publicKey, privateKey } = keyPair.data

// 2. 加密
const encrypted = crypto.sm2.encrypt('Hello, World!', publicKey)
if (!encrypted.success)
  throw new Error(encrypted.error.message)

// 3. 解密
const decrypted = crypto.sm2.decrypt(encrypted.data, privateKey)
if (!decrypted.success)
  throw new Error(decrypted.error.message)

console.log(decrypted.data) // 'Hello, World!'
```

### 2. SM2 签名验签流程

```ts
import { crypto } from '@hai/crypto'

const data = 'important message'
const { publicKey, privateKey } = crypto.sm2.generateKeyPair().data!

// 签名
const signature = crypto.sm2.sign(data, privateKey)
if (!signature.success)
  throw new Error(signature.error.message)

// 验签
const verified = crypto.sm2.verify(data, signature.data, publicKey)
if (!verified.success)
  throw new Error(verified.error.message)

console.log(verified.data) // true
```

### 3. SM3 哈希验证

```ts
import { crypto } from '@hai/crypto'

const data = 'data to hash'
const hash = crypto.sm3.hash(data)

// 验证
const isValid = crypto.sm3.verify(data, hash)
console.log(isValid) // true
```

### 4. SM4 对称加解密（推荐 CBC 模式）

```ts
import { crypto } from '@hai/crypto'

const key = crypto.sm4.generateKey()

// CBC 模式加密（推荐，IV 自动生成）
const encrypted = crypto.sm4.encryptWithIV('sensitive data', key)
if (!encrypted.success)
  throw new Error(encrypted.error.message)

const { ciphertext, iv } = encrypted.data

// CBC 模式解密
const decrypted = crypto.sm4.decryptWithIV(ciphertext, key, iv)
if (!decrypted.success)
  throw new Error(decrypted.error.message)

console.log(decrypted.data) // 'sensitive data'
```

### 5. 使用密码派生密钥

```ts
import { crypto } from '@hai/crypto'

// 从用户密码派生加密密钥
const key = crypto.sm4.deriveKey('user-password', 'unique-salt')

// 使用派生密钥加密
const result = crypto.sm4.encrypt('data', key)
```

---

## 注意事项

1. **前后端兼容**：模块使用 Web Crypto API，兼容 Node.js 和浏览器环境
2. **密钥安全**：私钥应安全存储，不要在前端硬编码
3. **CBC vs ECB**：推荐使用 `encryptWithIV`/`decryptWithIV`（CBC 模式），ECB 模式安全性较低
4. **错误处理**：所有加解密操作都返回 Result 类型，需检查 `success` 字段
