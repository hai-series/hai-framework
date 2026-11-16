# Crypto 配置

[配置手册](README.md)

## 配置入口

`crypto.init()` 初始化算法提供器。算法参数按次传入，加密传输由 `crypto.transport.createServer()` 或 `createClient()` 建立。服务端宿主负责加载版本化密钥环、连接 registry，以及选用 [Serv](serv.md) 或 [Kit](kit.md) 的传输路由配置。

## 配置示例

```ts
import { resolveTransportBodyLimits } from '@h-ai/crypto'

const limits = resolveTransportBodyLimits(24 * 1024 * 1024, {
  requiredPlaintextBytes: 11_250_348,
})
```

`limits.plaintextBytes` 为 `25165824`，`limits.encryptedPayloadBytes` 为 `50364416`。显式上限低于业务最低要求时函数抛出 `RangeError`。

## 配置清单

### 算法选项

| 配置项                | 默认值/必填        | 说明                                                |
| --------------------- | ------------------ | --------------------------------------------------- |
| SM2 `cipherMode`      | `1`（`C1C3C2`）    | 可用 `0` 处理旧格式 `C1C2C3`；加解密使用同一模式    |
| SM2 `outputFormat`    | `hex`              | 密文编码，另支持 `base64`                           |
| SM2 `hash`            | `true`             | 签名时先哈希；签名和验签使用相同设置                |
| SM2 `userId`          | `1234567812345678` | 签名用户标识，验签传入相同值                        |
| SM3 `inputEncoding`   | `utf8`             | 仅应用于字符串，可选 `hex`。二进制输入直接作为字节  |
| SM4 `mode`            | `cbc`              | `ecb` 用于兼容已有数据                              |
| SM4 `iv`              | CBC 自动生成       | 32 个十六进制字符。自备 IV 时为每次加密独立随机生成 |
| SM4 `outputFormat`    | `hex`              | 密文编码，可设 `base64`                             |
| 密码哈希 `saltLength` | `16`               | 生成随机盐的字节数                                  |
| 密码哈希 `iterations` | `10000`            | 密码哈希迭代次数                                    |

### HTTP 传输与 registry

| 配置项                                    | 默认值/必填            | 说明                                                                                          |
| ----------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------- |
| 服务端 `serverKeyRing`                    | 必填                   | `activeKeyId` 指向 `keys` 字典中当前使用的公私钥对。密钥 ID 和版本由部署管理                  |
| 服务端 `keyStore`                         | 必填                   | 处理客户端公钥、nonce 和状态的 registry。生产使用共享 Redis 或 PostgreSQL/MySQL               |
| 服务端 `maxPlaintextBytes`                | 无模块需求时 `1048576` | 双向明文 UTF-8 上限。范围 `1024`–`67108864` 字节，密文预算为明文两倍加 32 KiB                 |
| 服务端 `maxFutureSkewSeconds`             | `30`                   | 容许请求时间领先服务器的秒数，范围 0–300                                                      |
| 服务端 `maxRequestAgeSeconds`             | `300`                  | 自签发起的可接受请求时长（秒），范围 1–600                                                    |
| 客户端 `keyExchangeUrl`                   | 必填                   | 可信服务端的完整密钥协商 URL                                                                  |
| 客户端 `maxPlaintextBytes`                | 跟随服务端             | 设置后取本地和协商上限中的较小值                                                              |
| 客户端 `fetch`                            | 全局 `fetch`           | 测试和平台桥接可注入标准实现                                                                  |
| `createInMemoryKeyStore(maxClients?)`     | `10000`                | 仅用于单进程开发和测试。在容量开满时淘汰最早公钥，仍保留有效的 nonce                          |
| `createRedisTransportKeyStore({ cache })` | `cache` 必填           | 借用已初始化 Redis 缓存，数据容量由部署管理                                                   |
| `createReldbTransportKeyStore({ reldb })` | `reldb` 必填           | 借用已初始化的关系数据库                                                                      |
| 共享 registry 的 `ttlSeconds`             | 公钥无过期时间         | 正整数秒，上限 `2147483647`                                                                   |
| RelDB registry 的 `maxClients`            | `10000`                | 共享的有效公钥容量。同一部署各节点采用同一个值                                                |
| `HAI_CRYPTO_TRANSPORT_SERVERKEYRING`      | 由服务端读取           | 宿主可以读取私有环境变量中的 JSON 密钥环，通过 `parseTransportServerKeyRing()` 校验后注入工厂 |

## 生效与核对

生产使用 Redis registry 时为 nonce 预留容量，配置 `noeviction` 和持久化，确保有效的请求登记保留到认证窗口结束。

密钥轮换时部署各节点使用同一受管密钥环，并核对新旧会话。在 `NODE_ENV` 或 `HAI_CORE_ENV` 为 `production` 时，传输工厂检查 registry 的实际共享能力。配置和请求体容量的示例见[加密传输与容量](http.md#加密传输与容量)。
