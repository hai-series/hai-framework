# @h-ai/crypto

加密模块，提供非对称加密、哈希、对称加密与密码哈希能力。

## 支持的能力

- 非对称加密（密钥生成、加解密、签名验签）
- 哈希（哈希、HMAC、验证）
- 对称加密（ECB/CBC 模式）
- 密码哈希（加盐迭代哈希）
- 前后端通用（Node.js / 浏览器）

## 快速开始

```ts
import { crypto } from '@h-ai/crypto'

// 初始化（使用前必须调用）
await crypto.init()
```

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

### 对称加密（ECB / CBC）

```ts
// 生成随机密钥和 IV
const key = crypto.symmetric.generateKey()
const iv = crypto.symmetric.generateIV()

// ECB 模式（默认）
const ecbEnc = crypto.symmetric.encrypt('data', key)
if (ecbEnc.success) {
  const ecbDec = crypto.symmetric.decrypt(ecbEnc.data, key)
  // ecbDec.data === 'data'
}

// CBC 模式（需指定 IV）
const cbcEnc = crypto.symmetric.encrypt('data', key, { mode: 'cbc', iv })
if (cbcEnc.success) {
  const cbcDec = crypto.symmetric.decrypt(cbcEnc.data, key, { mode: 'cbc', iv })
}

// 快捷方式：自动生成 IV 的 CBC 加解密
const withIV = crypto.symmetric.encryptWithIV('data', key)
if (withIV.success) {
  const dec = crypto.symmetric.decryptWithIV(withIV.data.ciphertext, key, withIV.data.iv)
}

// 输出 base64 格式
const b64Enc = crypto.symmetric.encrypt('data', key, { outputFormat: 'base64' })

// 从密码派生密钥
const derivedKey = crypto.symmetric.deriveKey('my-password', 'random-salt')

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

### 关闭模块

```ts
// 使用完毕后关闭，释放内部状态
await crypto.close()
```

## 错误处理

所有操作返回 `HaiResult<T>`：

```ts
const result = crypto.asymmetric.encrypt('data', publicKey)
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
