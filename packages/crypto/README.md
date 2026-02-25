# @h-ai/crypto

国密算法（SM2/SM3/SM4）加密模块，提供非对称加密、哈希、对称加密与密码哈希能力。

## 支持的能力

- SM2 非对称加密（密钥生成、加解密、签名验签）
- SM3 哈希（哈希、HMAC、验证）
- SM4 对称加密（ECB/CBC 模式）
- 密码哈希（基于 SM3 的加盐迭代哈希）
- 前后端通用（Node.js / 浏览器）

## 快速开始

```ts
import { crypto } from '@h-ai/crypto'

// 初始化
await crypto.init({ defaultAlgorithm: 'sm' })

// SM2 非对称加密
const keyPair = crypto.sm2.generateKeyPair()
if (keyPair.success) {
  const encrypted = crypto.sm2.encrypt('Hello', keyPair.data.publicKey)
  if (encrypted.success) {
    crypto.sm2.decrypt(encrypted.data, keyPair.data.privateKey)
  }
}

// SM3 哈希
const hash = crypto.sm3.hash('Hello, SM3!')
const hmac = crypto.sm3.hmac('data', 'secret')

// SM4 对称加密
const key = crypto.sm4.generateKey()
const result = crypto.sm4.encryptWithIV('data', key)
if (result.success) {
  crypto.sm4.decryptWithIV(result.data.ciphertext, key, result.data.iv)
}

// 密码哈希
const hashResult = crypto.password.hash('myPassword123', { iterations: 12000 })
if (hashResult.success) {
  crypto.password.verify('myPassword123', hashResult.data)
}

// 独立密码提供者（无需 init）
const passwordProvider = crypto.createHaiPasswordProvider()
const standaloneHash = passwordProvider.hash('myPassword123')
```

## 配置

```ts
import { core } from '@h-ai/core'
import { crypto, CryptoConfigSchema } from '@h-ai/crypto'

core.config.validate('crypto', CryptoConfigSchema)
const cfg = core.config.get('crypto')
if (cfg) {
  await crypto.init(cfg)
}
```

## 错误处理

所有操作返回 `Result<T, CryptoError>`：

```ts
const result = crypto.sm2.encrypt('data', publicKey)
if (!result.success) {
  // result.error.code / result.error.message
}
```

## 测试

```bash
pnpm --filter @h-ai/crypto test
```

## License

Apache-2.0
