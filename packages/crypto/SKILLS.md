# @hai/crypto SKILLS

> AI 助手参考文档，包含详细接口、参数定义、错误码与使用示例。

---

## 模块概述

`@hai/crypto` 提供 SM2/SM3/SM4 国密能力与密码哈希能力，统一通过 `crypto` 入口访问。

---

## 入口与初始化

### crypto（统一入口）

- `crypto.sm2`：SM2 非对称加密操作
- `crypto.sm3`：SM3 哈希操作
- `crypto.sm4`：SM4 对称加密操作
- `crypto.password`：密码哈希提供者
- `crypto.init(config?)`：初始化/重新配置
- `crypto.config`：当前配置（浅拷贝）
- `crypto.isInitialized`：是否已初始化

### 初始化（Node.js）

当配置由 `core.init` 统一加载时，使用前需显式校验配置：

```ts
import { core } from '@hai/core'
import { crypto, CryptoConfigSchema } from '@hai/crypto'

core.config.validate('crypto', CryptoConfigSchema)
const cfg = core.config.get('crypto')
if (cfg) {
  crypto.init(cfg)
}
```

---

## i18n

```ts
import { cryptoM } from '@hai/crypto'

const message = cryptoM('crypto_sm2EncryptEmpty')
```

---

## 配置类型

### CryptoConfig

| 字段             | 类型                      | 说明                  |
| ---------------- | ------------------------- | --------------------- |
| defaultAlgorithm | `'sm'`                    | 默认算法（当前仅 sm） |
| custom           | `Record<string, unknown>` | 自定义配置            |

### CryptoConfigInput

`CryptoConfig` 的输入类型，允许字段可选。

---

## SM2 操作接口（crypto.sm2）

### generateKeyPair()

返回：`Result<SM2KeyPair, CryptoError>`

### encrypt(data, publicKey, options?)

| 参数                 | 类型                | 说明                                 |
| -------------------- | ------------------- | ------------------------------------ |
| data                 | `string`            | 待加密明文                           |
| publicKey            | `string`            | 公钥（十六进制）                     |
| options.cipherMode   | `0 \| 1`            | 密文格式：0=C1C2C3，1=C1C3C2（默认） |
| options.outputFormat | `'hex' \| 'base64'` | 输出格式（默认 hex）                 |

### decrypt(ciphertext, privateKey, options?)

| 参数               | 类型     | 说明                  |
| ------------------ | -------- | --------------------- |
| ciphertext         | `string` | 密文（hex 或 base64） |
| privateKey         | `string` | 私钥（十六进制）      |
| options.cipherMode | `0 \| 1` | 密文格式              |

### sign(data, privateKey, options?)

| 参数           | 类型      | 说明                                |
| -------------- | --------- | ----------------------------------- |
| data           | `string`  | 待签名数据                          |
| privateKey     | `string`  | 私钥                                |
| options.hash   | `boolean` | 是否先做 SM3 哈希（默认 true）      |
| options.userId | `string`  | 用户标识（默认 "1234567812345678"） |

### verify(data, signature, publicKey, options?)

| 参数      | 类型     | 说明     |
| --------- | -------- | -------- |
| data      | `string` | 原始数据 |
| signature | `string` | 签名     |
| publicKey | `string` | 公钥     |

### isValidPublicKey(key) / isValidPrivateKey(key)

返回：`boolean`

---

## SM3 操作接口（crypto.sm3）

### hash(data, options?)

| 参数                  | 类型                   | 说明                  |
| --------------------- | ---------------------- | --------------------- |
| data                  | `string \| Uint8Array` | 待哈希数据            |
| options.inputEncoding | `'utf8' \| 'hex'`      | 输入编码（默认 utf8） |
| options.outputFormat  | `'hex' \| 'array'`     | 输出格式（默认 hex）  |

### hmac(data, key)

| 参数 | 类型     | 说明       |
| ---- | -------- | ---------- |
| data | `string` | 待计算数据 |
| key  | `string` | 密钥       |

### verify(data, expectedHash)

返回：`Result<boolean, CryptoError>`

---

## SM4 操作接口（crypto.sm4）

### generateKey() / generateIV()

返回：`string`（32 字符十六进制）

### encrypt(data, key, options?)

| 参数                 | 类型                | 说明                    |
| -------------------- | ------------------- | ----------------------- |
| data                 | `string`            | 待加密数据              |
| key                  | `string`            | 密钥（32 字符十六进制） |
| options.mode         | `'ecb' \| 'cbc'`    | 加密模式（默认 ecb）    |
| options.iv           | `string`            | CBC 模式 IV             |
| options.outputFormat | `'hex' \| 'base64'` | 输出格式（默认 hex）    |

### decrypt(ciphertext, key, options?)

| 参数         | 类型             | 说明                  |
| ------------ | ---------------- | --------------------- |
| ciphertext   | `string`         | 密文（hex 或 base64） |
| key          | `string`         | 密钥                  |
| options.mode | `'ecb' \| 'cbc'` | 解密模式              |
| options.iv   | `string`         | CBC 模式 IV           |

### encryptWithIV(data, key)

返回：`Result<SM4EncryptWithIVResult, CryptoError>`（自动生成 IV）

### decryptWithIV(ciphertext, key, iv)

返回：`Result<string, CryptoError>`

### deriveKey(password, salt)

返回：`string`（派生密钥）

### isValidKey(key) / isValidIV(iv)

返回：`boolean`

---

## 密码哈希（crypto.password）

### crypto.password.create(config?)

| 参数              | 类型     | 说明                   |
| ----------------- | -------- | ---------------------- |
| config.saltLength | `number` | 盐值长度（默认 16）    |
| config.iterations | `number` | 迭代次数（默认 10000） |

返回：`PasswordProvider`

### PasswordProvider.hash(password)

返回：`Result<string, CryptoError>`（格式：`$hai$iterations$salt$hash`）

### PasswordProvider.verify(password, hash)

返回：`Result<boolean, CryptoError>`

---

## 错误码（CryptoErrorCode）

| 错误码 | 常量                    | 说明          |
| ------ | ----------------------- | ------------- |
| 4000   | `KEY_GENERATION_FAILED` | 密钥生成失败  |
| 4001   | `ENCRYPTION_FAILED`     | 加密失败      |
| 4002   | `DECRYPTION_FAILED`     | 解密失败      |
| 4003   | `SIGN_FAILED`           | 签名失败      |
| 4004   | `VERIFY_FAILED`         | 验签失败      |
| 4005   | `INVALID_KEY`           | 无效密钥      |
| 4020   | `HASH_FAILED`           | 哈希计算失败  |
| 4021   | `HMAC_FAILED`           | HMAC 计算失败 |
| 4022   | `INVALID_INPUT`         | 无效输入      |
| 4040   | `INVALID_IV`            | 无效 IV       |
| 4060   | `NOT_INITIALIZED`       | 未初始化      |
| 4061   | `UNSUPPORTED_ALGORITHM` | 不支持算法    |
| 4062   | `CONFIG_ERROR`          | 配置错误      |
| 4063   | `OPERATION_FAILED`      | 操作失败      |
