# @hai/crypto

国密算法（SM2/SM3/SM4）加密模块，提供统一的 `crypto` 访问入口与密码哈希能力。

## 特性

- 前后端通用（Node.js / 浏览器）
- 统一 `Result` 错误返回结构
- 通过 i18n 输出用户可见文案

## 安装

```bash
pnpm add @hai/crypto
```

## 快速开始

```ts
import { crypto } from '@hai/crypto'

const keyPair = crypto.sm2.generateKeyPair()
if (keyPair.success) {
  const encrypted = crypto.sm2.encrypt('Hello', keyPair.data.publicKey)
  if (encrypted.success) {
    crypto.sm2.decrypt(encrypted.data, keyPair.data.privateKey)
  }
}

const hash = crypto.sm3.hash('Hello, SM3!')
const key = crypto.sm4.generateKey()
const result = crypto.sm4.encryptWithIV('data', key)
if (result.success) {
  crypto.sm4.decryptWithIV(result.data.ciphertext, key, result.data.iv)
}
```

## 配置管理（Node.js）

当配置由 `core.init` 统一加载时，模块使用前需要显式校验配置合法性：

```ts
import { core } from '@hai/core'
import { crypto, CryptoConfigSchema } from '@hai/crypto'

core.config.validate('crypto', CryptoConfigSchema)

const cryptoConfig = core.config.get('crypto')
if (cryptoConfig) {
  crypto.init(cryptoConfig)
}
```

## 密码哈希

```ts
import { crypto } from '@hai/crypto'

const provider = crypto.password.create({ iterations: 12000 })
const hashResult = provider.hash('myPassword123')
if (hashResult.success) {
  provider.verify('myPassword123', hashResult.data)
}
```

## 错误处理

所有操作返回 `Result<T, CryptoError>`：

```ts
const result = crypto.sm2.encrypt('data', publicKey)
if (!result.success) {
  // 处理错误：result.error.code / result.error.message
}
```

## 许可证

Apache-2.0
