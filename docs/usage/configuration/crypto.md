# Crypto 配置

[English](crypto.en.md) · [日本語](crypto.ja.md)

[配置手册](README.md)

## 配置入口

调用 `crypto.init()` 后即可使用加解密、签名和哈希等方法，每次调用可以传入该次操作的设置。网站要加密 HTTP 业务数据时，在 [Serv](serv.md) 或 [Kit](kit.md) 中设置 `transport`。服务端启动代码还要读取私钥，并接入共享存储，用来登记客户端公钥和识别重复请求。自行接入其他 HTTP 框架时，用 `crypto.transport.createServer()` 和 `crypto.transport.createClient()` 分别创建服务端和客户端。

## 配置示例

```yaml schema=@h-ai/serv:ServConfigSchema
transport:
  maxPlaintextBytes: 25165824
```

在 `_serv.yml` 中这样设置后，普通业务请求和响应的原始数据最多为 24 MiB。加密并编码后的网络消息可能更大，此配置对应的密文上限是 `50364416` 字节。服务端还需提供私钥和共享存储，详见[加密传输与容量](http.md#加密传输与容量)。

<a id="configuration-fields"></a>

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

| 配置项                                    | 默认值/必填            | 说明                                                                                                                                  |
| ----------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 服务端 `serverKeyRing`                    | 必填                   | `activeKeyId` 指向 `keys` 字典中当前使用的公私钥对。密钥 ID 和版本由部署管理                                                          |
| 服务端 `keyStore`                         | 必填                   | 保存客户端公钥和已处理请求的登记记录。生产环境的各服务实例应连接同一套 Redis 或 PostgreSQL/MySQL                                      |
| 服务端 `maxPlaintextBytes`                | 无模块需求时 `1048576` | 双向明文 UTF-8 上限。范围 `1024`–`67108864` 字节，密文预算为明文两倍加 32 KiB                                                         |
| 服务端 `maxFutureSkewSeconds`             | `30`                   | 容许请求时间领先服务器的秒数，范围 0–300                                                                                              |
| 服务端 `maxRequestAgeSeconds`             | `300`                  | 自签发起的可接受请求时长（秒），范围 1–600                                                                                            |
| 客户端 `keyExchangeUrl`                   | 必填                   | 可信服务端的完整密钥协商 URL                                                                                                          |
| 客户端 `maxPlaintextBytes`                | 跟随服务端             | 设置后取本地和协商上限中的较小值                                                                                                      |
| 客户端 `fetch`                            | 全局 `fetch`           | 测试和平台桥接可注入标准实现                                                                                                          |
| `createInMemoryKeyStore(maxClients?)`     | `10000`                | 仅用于单进程开发和测试。在容量开满时淘汰最早公钥，仍保留有效的 nonce                                                                  |
| `createRedisTransportKeyStore({ cache })` | `cache` 必填           | 借用已初始化 Redis 缓存，数据容量由部署管理                                                                                           |
| `createReldbTransportKeyStore({ reldb })` | `reldb` 必填           | 借用已初始化的关系数据库                                                                                                              |
| 共享 registry 的 `ttlSeconds`             | 公钥无过期时间         | 正整数秒，上限 `2147483647`                                                                                                           |
| RelDB registry 的 `maxClients`            | `10000`                | 共享的有效公钥容量。同一部署各节点采用同一个值                                                                                        |
| `HAI_CRYPTO_TRANSPORT_SERVERKEYRING`      | 由服务端读取           | 服务端启动代码可读取环境变量中的 JSON 密钥环，用 `parseTransportServerKeyRing()` 校验，再将结果传给 `crypto.transport.createServer()` |

## 生效与核对

用 Redis 登记客户端请求时，配置 `noeviction` 和持久化，并为记录预留足够容量。已经处理过的请求即使再次送达，服务端也能在规定的接收期限内识别并拒绝它。

更换私钥时，每台服务使用同一份密钥列表，验证旧会话和新会话都能按照轮换计划工作。在 `NODE_ENV` 或 `HAI_CORE_ENV` 为 `production` 时，服务端创建传输实例时会拒绝只能在单进程内保存登记记录的存储。[加密传输与容量](http.md#加密传输与容量)
