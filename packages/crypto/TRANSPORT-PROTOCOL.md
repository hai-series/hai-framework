# Transport v2 协议

serv、kit、api-client 及浏览器/移动端客户端共用此应用层协议。只接受 v2，旧版 `{ encryptedKey, ciphertext, iv }` 和仅带 clientId 的空请求均拒绝。TLS 负责握手公钥的真实性；此协议不替代 TLS、IAM 授权或业务幂等键。

## 协商与密钥

协商 POST JSON `{ clientPublicKey }`，服务端注册到共享 registry 后返回 `{ clientId, serverKeyId, serverPublicKey }`。客户端保存自己的 SM2 私钥及协商得到的服务端版本/公钥。每个节点使用同一受管 key ring；轮换时保留旧版本直到过渡结束，删除旧版本即撤销。密钥环仅存在于服务端私密配置中。

公钥只接受非压缩 SM2 点：128 个 hex 字符或 `04` + 128 个 hex 字符，编码和曲线点均须有效。纯函数 `isValidSM2PublicKey` 无需初始化；serv/kit 先验证再调用 registry，畸形点返回 400。所有内置 registry 及 manager 直接注册也校验，不把畸形点写入存储。

DB registry 的公钥使用数据库 epoch 毫秒 `created_at_ms` / `expires_at_ms`，DB 与应用节点均须满足时钟同步要求。共享容量记录 `hai_crypto_transport_capacity` 默认限制 10000 个有效公钥，各节点 `maxClients` 必须一致。事务先锁容量行再计数和插入，满容量拒绝，不驱逐有效公钥或 nonce。公钥 TTL 省略表示不过期，显式值为 1–2147483647 整数秒，部署建议设置有限 TTL。Redis 使用原生 TTL，容量由部署内存预算管理，不提供 DB 的 maxClients 选项；禁止提前驱逐有效 nonce。

DB 首次建表失败会复位初始化状态，下次操作可重试；每次注册清理一批过期记录。应用可周期调用 DB 工厂返回的 `pruneExpired()`，单次最多清理 100 条过期公钥和 100 条过期 nonce，双节点可同时维护；没有隐式计时器。旧 timestamp 公钥表须停机迁移，调整容量须协调所有节点及持久容量行；不能为重建公钥表提前清空有效 nonce。

## 封装

每次请求生成独立的 128 位随机 requestId，作为 nonce 和响应关联 ID。固定上下文如下：

```ts
interface Context {
  version: 2
  serverKeyId: string
  clientId: string
  requestId: string // 32 个小写十六进制字符
  issuedAt: number // Unix 毫秒，安全整数
  method: string // 实际大写 HTTP 方法
  pathHash: string // SM3(URL.pathname + URL.search)，64 位小写 hex；实际输入最多 8192 个 UTF-8 字节
}
```

完整 JSON 为 `{ context, direction, status, encryptedKey, ciphertext, iv, tag, signature }`。

- `direction` 为 request 或 response；请求 status 固定为 0，响应为实际 HTTP 状态码。
- 每条消息独立生成 16 字节 SM4 密钥及 32 字节 HMAC 密钥，分别编码为 32/64 位小写 hex；禁止复用密钥。
- `encryptedKey` 是 SM2（C1C3C2、hex）加密的 UTF-8 JSON `[sm4KeyHex, macKeyHex]`。
- SM4-CBC 使用独立随机 16 字节 IV、PKCS#7 填充；ciphertext 和 iv 都是 hex。
- HMAC-SM3 的密钥输入是 macKeyHex 本身的 UTF-8 字节（64 字节 ASCII），不是 hex 解码后的字节。tag 是 64 位小写 hex。

认证输入是无空格的 JSON 固定位置数组，避免字段顺序和字符串连接歧义：

```ts
const authenticatedText = JSON.stringify([
  'hai-transport', context.version, direction, context.serverKeyId, context.clientId,
  context.requestId, context.issuedAt, context.method, context.pathHash, status,
  encryptedKey, ciphertext, iv,
])
const tag = HMAC_SM3(authenticatedText, macKeyHex)
const signedText = JSON.stringify([authenticatedText, tag])
```

请求用客户端私钥签名 signedText；响应用 context.serverKeyId 对应的服务端私钥签名。SM2 签名采用模块默认 hash=true、userId=`1234567812345678`，signature 为 128 位 hex。响应原样复制请求 context，因此并发请求不能互换响应。

这里采用 Encrypt-then-MAC，验证顺序遵循 [RFC 7366](https://www.rfc-editor.org/rfc/rfc7366) 的先认证再解密原则；HMAC 构造见 [RFC 2104](https://www.rfc-editor.org/rfc/rfc2104)。这是框架的应用层封装格式，不是 TLS 报文格式。

## 接收顺序

1. 有界读取并校验唯一 v2 格式，拒绝未定义的封装/上下文字段。HTTP 适配器从实际 Request 提取 clientId、method、pathname + search；不能把 payload 字段直接当作可信 expected 参数。
2. 从实际 pathname + 原始 search 重算 SM3，与 pathHash 比对；输入最多 8192 个 UTF-8 字节，不重排/解码查询串。摘要参与签名和 MAC，绑定整个路径；JSON/头不重复传输长 URL，避免转义膨胀与超过 Node HTTP 默认头限制。检查其余上下文、版本、方向、状态；仅接受 issuedAt 在过去 5 分钟内、未来偏差最多 30 秒的请求。代理须保留原始路径/查询串。
3. 按 clientId 查询已注册公钥，先验 SM2 发送方签名，再解封两把密钥、常量时间验证 HMAC，最后解密 CBC。MAC 未通过绝不调用 CBC 解密。知道对端公钥无法伪造发送方签名。
4. 服务端完整认证后原子消费 `(clientId, requestId)`；仅返回 true 的节点可把明文交给业务。存储故障、重复或读取期间过期均拒绝。业务失败也不退还 nonce。
5. 客户端验签/MAC 前先校验响应 context 与本次请求逐字段相等，以及封装 status 与实际响应状态一致。缺少标记、格式错误或关联错误均 reject，不回退明文或原密文。

自定义 HTTP 适配器使用公开的 `await authenticateTransportRequest(manager, request)`；成功时取 `data.plaintext` 与 `data.context`，响应用 `await manager.encryptResponse(data.context, json, status)`。业务逻辑不能调用未认证的 CBC primitive 来替代这条链路。

## 防重放状态

requestId 至少保留到 issuedAt + 6 分钟，覆盖节点之间的最大 60 秒时钟差；部署需保证数据库与各节点时钟同步在 ±30 秒内。Redis provider 使用单 key CAS + TTL；SQL provider 使用 `hai_crypto_transport_requests` 的唯一主键插入，注册和周期 `pruneExpired()` 每批最多清理 100 条过期 nonce；nonce 消费不争用公钥容量锁。有效记录不能提前删除/驱逐；Redis 需要 noeviction 和符合部署持久化要求的配置。数据库/Redis 的回滚、数据丢失或不同节点连接不同后端会破坏去重，生产须使用同一可靠共享后端。

内存实现只供显式开发/测试使用，同步 check/set 期间不 await，也不按客户端容量淘汰有效 nonce。它不提供跨进程保证。

防重放只针对相同传输 requestId。客户端为重新发起的请求生成新 ID；非幂等业务重试仍须业务幂等键，不自动重放。

## HTTP 承载与预算

所有认证消息设置 `X-Encrypted: true`，请求另带 `X-Client-Id`。

- POST 等允许正文的方法：JSON 正文承载完整封装，即使明文为空也不例外。
- GET/HEAD：完整的空明文封装放在 `X-Hai-Transport` 请求头，不允许再附正文。
- 普通响应：JSON 正文承载封装。HEAD、204、304 或实际无正文响应：封装放在 `X-Hai-Transport` 响应头。
- 同一消息不允许同时用头和正文承载封装。CORS 需允许并暴露 X-Hai-Transport。

预算均按 UTF-8 实际字节：握手 JSON 16 KiB、公钥 4 KiB、明文 1 MiB、正文封装 2 MiB + 32 KiB、头封装 16 KiB。已验证最大 UTF-8 正文加 8 KiB 路径的真实算法封装可容纳；读取超限/取消必须取消原流并释放 reader。生成的 Nginx 使用 client_max_body_size=2129920 和 32 KiB 请求/上游头缓冲；自有代理须保留认证头及预算。

明文接口通过服务端 excludePaths 和对应客户端排除规则显式隔离。kit 不提供 requireEncryption/encryptResponse 降级开关；业务拒绝响应经 transport 返回时也应认证。
