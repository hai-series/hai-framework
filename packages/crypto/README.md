# @hai/crypto

国密算法（SM2/SM3/SM4）加密模块，提供统一的 `crypto` 对象访问加密功能。

## 支持的算法

| 算法    | 类型       | 特点                       |
| ------- | ---------- | -------------------------- |
| **SM2** | 非对称加密 | 密钥生成、加解密、签名验签 |
| **SM3** | 哈希算法   | 256 位输出、HMAC 支持      |
| **SM4** | 对称加密   | ECB/CBC 模式、128 位密钥   |

## 特性

- 前后端通用（Node.js / 浏览器）
- 基于 sm-crypto 库
- 完整的错误处理（Result 类型）

## 安装

```bash
pnpm add @hai/crypto
```

## 快速开始

```ts
import { crypto } from '@hai/crypto'

// SM2 非对称加密
const keyPair = crypto.sm2.generateKeyPair()
if (keyPair.success) {
  const encrypted = crypto.sm2.encrypt('Hello', keyPair.data.publicKey)
  const decrypted = crypto.sm2.decrypt(encrypted.data, keyPair.data.privateKey)
}

// SM2 签名验签
const signature = crypto.sm2.sign('data', privateKey)
const isValid = crypto.sm2.verify('data', signature.data, publicKey)

// SM3 哈希
const hash = crypto.sm3.hash('Hello, SM3!')
const hmac = crypto.sm3.hmac('data', 'secret-key')

// SM4 对称加密（ECB 模式）
const key = crypto.sm4.generateKey()
const ciphertext = crypto.sm4.encrypt('data', key)
const plaintext = crypto.sm4.decrypt(ciphertext.data, key)

// SM4 带 IV 加密（CBC 模式，推荐）
const result = crypto.sm4.encryptWithIV('data', key)
if (result.success) {
  const decrypted = crypto.sm4.decryptWithIV(
    result.data.ciphertext,
    key,
    result.data.iv
  )
}
```

## API 参考

### crypto.sm2 - 非对称加密

| 方法                                           | 说明         |
| ---------------------------------------------- | ------------ |
| `generateKeyPair()`                            | 生成密钥对   |
| `encrypt(data, publicKey, options?)`           | 加密         |
| `decrypt(ciphertext, privateKey, options?)`    | 解密         |
| `sign(data, privateKey, options?)`             | 签名         |
| `verify(data, signature, publicKey, options?)` | 验签         |
| `isValidPublicKey(key)`                        | 验证公钥格式 |
| `isValidPrivateKey(key)`                       | 验证私钥格式 |

### crypto.sm3 - 哈希

| 方法                         | 说明      |
| ---------------------------- | --------- |
| `hash(data, options?)`       | 计算哈希  |
| `hmac(data, key)`            | 计算 HMAC |
| `verify(data, expectedHash)` | 验证哈希  |

### crypto.sm4 - 对称加密

| 方法                                 | 说明                      |
| ------------------------------------ | ------------------------- |
| `generateKey()`                      | 生成随机密钥              |
| `generateIV()`                       | 生成随机 IV               |
| `encrypt(data, key, options?)`       | 加密                      |
| `decrypt(ciphertext, key, options?)` | 解密                      |
| `encryptWithIV(data, key)`           | 带 IV 加密（自动生成 IV） |
| `decryptWithIV(ciphertext, key, iv)` | 带 IV 解密                |
| `deriveKey(password, salt)`          | 从密码派生密钥            |
| `isValidKey(key)`                    | 验证密钥格式              |
| `isValidIV(iv)`                      | 验证 IV 格式              |

## 错误处理

所有操作返回 `Result<T, CryptoError>` 类型：

```ts
const result = crypto.sm2.encrypt('data', publicKey)

if (result.success) {
  console.log(result.data) // 密文
}
else {
  console.error(result.error.code, result.error.message)
}
```

## 许可证

Apache-2.0
