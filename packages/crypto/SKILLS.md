# @h-ai/crypto SKILLS

> AI 助手参考文档，包含详细接口、参数定义、错误码与使用示例。

---

## 模块概述

`@h-ai/crypto` 提供 SM2/SM3/SM4 国密能力与密码哈希能力，统一通过 `crypto` 入口访问。前后端通用。

---

## 入口与初始化

```ts
import { crypto } from '@h-ai/crypto'

// 初始化（必须）
const result = await crypto.init({ defaultAlgorithm: 'sm' })
// result: Result<void, CryptoError>

// 关闭
await crypto.close()

// 状态
crypto.isInitialized // boolean
crypto.config // CryptoConfig | null
```

### 子功能访问（需先 init）

- `crypto.sm2` — SM2 非对称加密操作
- `crypto.sm3` — SM3 哈希操作
- `crypto.sm4` — SM4 对称加密操作
- `crypto.password` — 密码哈希操作

未初始化时访问以上属性将返回 `NOT_INITIALIZED` 错误。

---

## 目录结构

```
packages/crypto/
  package.json
  README.md
  SKILLS.md
  tsconfig.json
  tsup.config.ts
  vitest.config.ts
  messages/
    en-US.json
    zh-CN.json
  src/
    index.ts            # 唯一入口，仅做 export * 聚合
    crypto-main.ts      # 服务对象（export const crypto）
    crypto-types.ts     # 公共类型
    crypto-config.ts    # 错误码 + Zod Schema + 配置类型
    crypto-i18n.ts      # i18n 消息获取器
    crypto-password.ts  # 密码哈希操作工厂
    crypto-sm2.ts       # SM2 算法工厂
    crypto-sm3.ts       # SM3 算法工厂
    crypto-sm4.ts       # SM4 算法工厂
  tests/
```

---

## 配置说明

### CryptoConfig

| 字段             | 类型   | 默认值 | 说明             |
| ---------------- | ------ | ------ | ---------------- |
| defaultAlgorithm | `'sm'` | `'sm'` | 默认算法（国密） |

### CryptoConfigInput

`CryptoConfig` 的输入类型，所有字段可选。

---

## SM2 操作接口（crypto.sm2）

### generateKeyPair()

返回：`Result<SM2KeyPair, CryptoError>`

```ts
interface SM2KeyPair {
  publicKey: string // 十六进制，含 04 前缀
  privateKey: string // 十六进制，64 字符
}
```

### encrypt(data, publicKey, options?)

| 参数                 | 类型                | 说明                                 |
| -------------------- | ------------------- | ------------------------------------ |
| data                 | `string`            | 待加密明文                           |
| publicKey            | `string`            | 公钥（十六进制）                     |
| options.cipherMode   | `0 \| 1`            | 密文格式：0=C1C2C3，1=C1C3C2（默认） |
| options.outputFormat | `'hex' \| 'base64'` | 输出格式（默认 hex）                 |

返回：`Result<string, CryptoError>`

### decrypt(ciphertext, privateKey, options?)

| 参数               | 类型     | 说明                  |
| ------------------ | -------- | --------------------- |
| ciphertext         | `string` | 密文（hex 或 base64） |
| privateKey         | `string` | 私钥（十六进制）      |
| options.cipherMode | `0 \| 1` | 密文格式              |

返回：`Result<string, CryptoError>`

### sign(data, privateKey, options?)

| 参数           | 类型      | 说明                                |
| -------------- | --------- | ----------------------------------- |
| data           | `string`  | 待签名数据                          |
| privateKey     | `string`  | 私钥                                |
| options.hash   | `boolean` | 是否先做 SM3 哈希（默认 true）      |
| options.userId | `string`  | 用户标识（默认 "1234567812345678"） |

返回：`Result<string, CryptoError>`

### verify(data, signature, publicKey, options?)

| 参数      | 类型     | 说明     |
| --------- | -------- | -------- |
| data      | `string` | 原始数据 |
| signature | `string` | 签名     |
| publicKey | `string` | 公钥     |

返回：`Result<boolean, CryptoError>`

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

返回：`Result<string, CryptoError>`

### hmac(data, key)

| 参数 | 类型     | 说明       |
| ---- | -------- | ---------- |
| data | `string` | 待计算数据 |
| key  | `string` | 密钥       |

返回：`Result<string, CryptoError>`

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

返回：`Result<string, CryptoError>`

### decrypt(ciphertext, key, options?)

| 参数         | 类型             | 说明                  |
| ------------ | ---------------- | --------------------- |
| ciphertext   | `string`         | 密文（hex 或 base64） |
| key          | `string`         | 密钥                  |
| options.mode | `'ecb' \| 'cbc'` | 解密模式              |
| options.iv   | `string`         | CBC 模式 IV           |

返回：`Result<string, CryptoError>`

### encryptWithIV(data, key)

返回：`Result<SM4EncryptWithIVResult, CryptoError>`（自动生成 IV）

```ts
interface SM4EncryptWithIVResult {
  ciphertext: string
  iv: string
}
```

### decryptWithIV(ciphertext, key, iv)

返回：`Result<string, CryptoError>`

### deriveKey(password, salt)

返回：`string`（基于 SM3 派生的 32 字符十六进制密钥）

### isValidKey(key) / isValidIV(iv)

返回：`boolean`

---

## 密码哈希（crypto.password）

### hash(password, config?)

| 参数              | 类型     | 说明                   |
| ----------------- | -------- | ---------------------- |
| password          | `string` | 明文密码               |
| config.saltLength | `number` | 盐值长度（默认 16）    |
| config.iterations | `number` | 迭代次数（默认 10000） |

返回：`Result<string, CryptoError>`（格式：`$hai$iterations$salt$hash`）

### verify(password, hash)

| 参数     | 类型     | 说明         |
| -------- | -------- | ------------ |
| password | `string` | 明文密码     |
| hash     | `string` | 存储的哈希值 |

返回：`Result<boolean, CryptoError>`

---

## 错误码（CryptoErrorCode）

| 错误码 | 常量                    | 说明          |
| ------ | ----------------------- | ------------- |
| 2000   | `OPERATION_FAILED`      | 操作失败      |
| 2001   | `INVALID_INPUT`         | 无效输入      |
| 2002   | `INVALID_KEY`           | 无效密钥      |
| 2010   | `NOT_INITIALIZED`       | 未初始化      |
| 2011   | `CONFIG_ERROR`          | 配置错误      |
| 2012   | `UNSUPPORTED_ALGORITHM` | 不支持算法    |
| 2020   | `KEY_GENERATION_FAILED` | 密钥生成失败  |
| 2021   | `ENCRYPTION_FAILED`     | 加密失败      |
| 2022   | `DECRYPTION_FAILED`     | 解密失败      |
| 2023   | `SIGN_FAILED`           | 签名失败      |
| 2024   | `VERIFY_FAILED`         | 验签失败      |
| 2040   | `HASH_FAILED`           | 哈希计算失败  |
| 2041   | `HMAC_FAILED`           | HMAC 计算失败 |
| 2060   | `INVALID_IV`            | 无效 IV       |

---

## 注意事项

- 必须先调用 `crypto.init()` 才能使用 sm2/sm3/sm4/password 操作
- `init()` 返回 `Promise<Result<void, CryptoError>>`，需检查返回值
- 所有操作返回 `Result<T, CryptoError>`，需通过 `result.success` 判断
- SM2 公钥支持带 `04` 前缀和不带前缀两种格式
- SM4 CBC 模式必须提供 IV，推荐使用 `encryptWithIV` 自动生成
- 密码哈希格式为 `$hai$iterations$salt$hash`，verify 时会自动解析
